#!/usr/bin/env node
/**
 * Used by `scripts/serve.sh`: initial workspace builds, then `parallel-docs serve`.
 * Not a production deployment stack—only a dev loop around the same `_site/` output you upload elsewhere.
 * Watches `packages/{core,render,code-parallel-docs-static,cli}/src` (and render's
 * esbuild entry script); on change, rebuilds affected packages and restarts
 * `parallel-docs serve` so Node reloads workspace `dist` (ESM cache). No manual
 * `serve` restart: static `_site/` rebuilds run inside the same `parallel-docs serve`
 * process (see packages/cli/src/serve.ts).
 *
 * Each restart sets a fresh `PARALLEL_DOCS_SERVE_BUILD_ID` so open browser tabs
 * detect the new process (livereload SSE alone cannot survive the restart).
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let chokidar;
try {
  chokidar = require(
    require.resolve("chokidar", {
      paths: [path.join(repoRoot, "packages", "cli"), repoRoot],
    }),
  );
} catch {
  console.error(
    "[serve] chokidar not found (expected via the parallel-docs CLI workspace). Run `npm install` from the repo root.",
  );
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

/** @param {string[]} args */
function npmRunSyncStrict(args) {
  const r = spawnSync(npmCmd, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** @param {string[]} args @returns {boolean} */
function npmRunSyncTry(args) {
  const r = spawnSync(npmCmd, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
  if (r.error) {
    console.error(r.error);
    return false;
  }
  return r.status === 0;
}

function buildLibsTry() {
  if (!npmRunSyncTry(["run", "build", "-w", "@parallel-docs/core"])) return false;
  if (!npmRunSyncTry(["run", "build", "-w", "@parallel-docs/render"])) return false;
  if (!npmRunSyncTry(["run", "build", "-w", "@parallel-docs/code-parallel-docs-static"]))
    return false;
  return true;
}

function buildCliTry() {
  return npmRunSyncTry(["run", "build", "-w", "parallel-docs"]);
}

function buildAllStrict() {
  npmRunSyncStrict(["run", "build", "-w", "@parallel-docs/core"]);
  npmRunSyncStrict(["run", "build", "-w", "@parallel-docs/render"]);
  npmRunSyncStrict(["run", "build", "-w", "@parallel-docs/code-parallel-docs-static"]);
  npmRunSyncStrict(["run", "build", "-w", "parallel-docs"]);
}

/** @type {import('node:child_process').ChildProcess | null} */
let serveChild = null;
let intentionalShutdown = false;
let restarting = false;

const cliArgs = process.argv.slice(2);

/** Rotated on every package rebuild + serve restart so tabs poll-reload (see serve.ts). */
let packageWatchBuildId = crypto.randomBytes(8).toString("hex");

function childEnv() {
  return { ...process.env, PARALLEL_DOCS_SERVE_BUILD_ID: packageWatchBuildId };
}

function startServe() {
  const cliJs = path.join(repoRoot, "packages", "cli", "dist", "cli.js");
  serveChild = spawn(process.execPath, [cliJs, "serve", ...cliArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: childEnv(),
  });
  serveChild.on("exit", (code, signal) => {
    if (intentionalShutdown || restarting) return;
    console.error(`[serve] parallel-docs serve exited (${code ?? "null"} / ${signal ?? "null"})`);
    process.exit(code ?? 1);
  });
}

async function stopServeAsync() {
  if (!serveChild || serveChild.killed) return;
  const child = serveChild;
  serveChild = null;
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 8000);
  try {
    await once(child, "exit");
  } catch {
    // ignore
  } finally {
    clearTimeout(killTimer);
  }
}

const cliSrcDir = path.join(repoRoot, "packages", "cli", "src");

function isUnderCliSrc(absPath) {
  const norm = path.resolve(absPath);
  const prefix = cliSrcDir + path.sep;
  return norm === cliSrcDir || norm.startsWith(prefix);
}

/**
 * @param {string} changedPath
 * @param {{ libs: boolean; cli: boolean }} state
 */
function planWork(changedPath, state) {
  if (isUnderCliSrc(changedPath)) state.cli = true;
  else state.libs = true;
}

/**
 * @param {{ libs: boolean; cli: boolean }} work
 */
async function applyWork(work) {
  if (!work.libs && !work.cli) return;
  let ok = true;
  if (work.libs) ok = buildLibsTry();
  if (ok && work.cli) ok = buildCliTry();
  if (!ok) {
    console.error("[serve] workspace rebuild failed; leaving parallel-docs serve unchanged.");
    return;
  }
  packageWatchBuildId = crypto.randomBytes(8).toString("hex");
  restarting = true;
  try {
    await stopServeAsync();
  } finally {
    restarting = false;
  }
  startServe();
  console.error("[serve] restarted parallel-docs serve after workspace rebuild.");
}

buildAllStrict();
startServe();

const watchPaths = [
  path.join(repoRoot, "packages", "core", "src"),
  path.join(repoRoot, "packages", "render", "src"),
  path.join(repoRoot, "packages", "render", "esbuild-code-browser-client.mjs"),
  path.join(repoRoot, "packages", "code-parallel-docs-static", "src"),
  path.join(repoRoot, "packages", "cli", "src"),
];

const ignored = [
  "**/node_modules/**",
  "**/dist/**",
  "**/_site/**",
  "**/*.test.ts",
  "**/*.integration.test.ts",
  "**/*.expensive.test.ts",
];

const usePolling =
  process.env.PARALLEL_DOCS_SERVE_PACKAGE_WATCH_POLL !== "0" &&
  process.env.PARALLEL_DOCS_SERVE_PACKAGE_WATCH_POLL !== "false";

const watcher = chokidar.watch(watchPaths, {
  ignoreInitial: true,
  ignored,
  awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 100 },
  // Native recursive watches open many descriptors (EMFILE on small ulimits);
  // polling keeps this dev loop reliable on laptops and CI sandboxes.
  usePolling,
  ...(usePolling ? { interval: 750, binaryInterval: 1200 } : {}),
});

watcher.on("error", (err) => {
  console.error("[serve] package watcher error:", err);
});

/** @type {{ libs: boolean; cli: boolean }} */
let pending = { libs: false, cli: false };
/** @type {ReturnType<typeof setTimeout> | undefined} */
let debounce;

watcher.on("all", (_event, rawPath) => {
  if (typeof rawPath !== "string") return;
  const abs = path.isAbsolute(rawPath) ? rawPath : path.join(repoRoot, rawPath);
  planWork(abs, pending);
  if (debounce !== undefined) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = undefined;
    const work = pending;
    pending = { libs: false, cli: false };
    void applyWork(work).catch((err) => {
      console.error("[serve] unexpected error during rebuild/restart:", err);
    });
  }, 350);
});

async function shutdown() {
  intentionalShutdown = true;
  if (debounce !== undefined) clearTimeout(debounce);
  await watcher.close();
  await stopServeAsync();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

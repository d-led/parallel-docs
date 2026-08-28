#!/usr/bin/env node
/**
 * Build a standalone ParallelDocs CLI binary for the current platform using
 * Node.js Single Executable Applications (SEA).
 *
 * Output: packages/cli/dist/bin/parallel-docs-<platform>-<arch>[.exe]
 *
 * Steps:
 *   1. Ensure the CLI bundle exists (`npm run build:bundle -w @parallel-docs/cli`).
 *   2. Resolve a **SEA-capable** Node binary (see below).
 *   3. Generate the SEA blob via `node --experimental-sea-config`.
 *   4. Copy that Node binary to the output path.
 *   5. Inject the blob via `postject` (with platform-specific options).
 *   6. Re-sign on macOS (ad-hoc) so the loader accepts the patched binary.
 *
 * **SEA-capable Node:** postject needs the fuse string
 * `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` inside the `node` binary.
 * Homebrew and some other builds omit it. When `process.execPath` lacks the
 * fuse, this script downloads the matching **official** Node.js build from
 * `https://nodejs.org/dist/<version>/` (cached under `packages/cli/dist/.official-node/`).
 *
 * Override: `PARALLEL_DOCS_SEA_NODE=/path/to/node` (must contain the fuse).
 * Opt out of download: `PARALLEL_DOCS_SEA_SKIP_OFFICIAL_DOWNLOAD=1` (then you must supply a capable binary).
 *
 * Notes:
 *   - Windows / Linux signing is intentionally minimal; macOS uses ad-hoc codesign.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_DIR = join(REPO_ROOT, "packages", "cli");
const DIST = join(CLI_DIR, "dist");
const OUT_DIR = join(DIST, "bin");
const BUNDLE = join(DIST, "cli.bundle.cjs");
const BLOB = join(DIST, "sea-prep.blob");
const SEA_CONFIG = join(CLI_DIR, "sea-config.json");
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const FUSE_BYTES = Buffer.from(FUSE, "utf8");

function run(cmd, args, options = {}) {
  const pretty = `${cmd} ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`;
  console.log(`$ ${pretty}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${pretty}`);
  }
}

function tryRun(cmd, args) {
  const pretty = `${cmd} ${args.join(" ")}`;
  console.log(`$ ${pretty} (optional)`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    console.log(`  skipped (${result.error?.code ?? `exit ${result.status}`})`);
    return false;
  }
  return true;
}

function binarySuffix() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch;
  const ext = process.platform === "win32" ? ".exe" : "";
  return { name: `parallel-docs-${platform}-${arch}${ext}`, platform, arch, ext };
}

function ensureBundle() {
  if (existsSync(BUNDLE)) return;
  console.log("Bundle missing; running `npm run build:bundle -w @parallel-docs/cli`.");
  run("npm", ["run", "build:bundle", "-w", "@parallel-docs/cli"], {
    cwd: REPO_ROOT,
    shell: process.platform === "win32",
  });
}

function generateBlob(nodeBinary) {
  if (existsSync(BLOB)) rmSync(BLOB);
  run(nodeBinary, ["--experimental-sea-config", SEA_CONFIG], { cwd: CLI_DIR });
  if (!existsSync(BLOB)) {
    throw new Error(`Expected blob at ${BLOB} but it was not produced.`);
  }
}

/** Official Node dist archive triple, e.g. `darwin-arm64`. */
function nodeOfficialTriple() {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") return "darwin-arm64";
    if (process.arch === "x64") return "darwin-x64";
  }
  if (process.platform === "linux") {
    if (process.arch === "arm64") return "linux-arm64";
    if (process.arch === "x64") return "linux-x64";
  }
  if (process.platform === "win32" && process.arch === "x64") return "win-x64";
  throw new Error(
    `SEA binary build is not scripted for ${process.platform}-${process.arch}. ` +
      "Use GitHub Actions matrix or extend nodeOfficialTriple() in scripts/build-binary.mjs.",
  );
}

function hasSeaSentinel(nodePath) {
  try {
    return readFileSync(nodePath).includes(FUSE_BYTES);
  } catch (e) {
    throw new Error(
      `Cannot read Node binary at ${nodePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function officialArchiveBase() {
  const v = process.version;
  return `node-${v}-${nodeOfficialTriple()}`;
}

function officialDownloadUrl() {
  const v = process.version;
  const base = officialArchiveBase();
  if (process.platform === "win32") {
    return `https://nodejs.org/dist/${v}/${base}.zip`;
  }
  return `https://nodejs.org/dist/${v}/${base}.tar.gz`;
}

function pathToExtractedOfficialNode(extractDir) {
  const base = officialArchiveBase();
  if (process.platform === "win32") {
    return join(extractDir, base, "node.exe");
  }
  return join(extractDir, base, "bin", "node");
}

function cachedOfficialSeaNodePath() {
  const cacheDir = join(DIST, ".official-node", process.version, nodeOfficialTriple());
  const name = process.platform === "win32" ? "node.exe" : "node";
  return { cacheDir, cachedBin: join(cacheDir, name) };
}

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download official Node (${res.status} ${res.statusText}): ${url}. ` +
        "Check that this Node version exists on nodejs.org, or set PARALLEL_DOCS_SEA_NODE to a capable binary.",
    );
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function ensureOfficialSeaNodeDownloaded() {
  if (process.env.PARALLEL_DOCS_SEA_SKIP_OFFICIAL_DOWNLOAD === "1") {
    throw new Error(
      `${process.execPath} lacks the SEA fuse (typical for Homebrew). ` +
        "Set PARALLEL_DOCS_SEA_NODE to an official nodejs.org `node` binary, or unset PARALLEL_DOCS_SEA_SKIP_OFFICIAL_DOWNLOAD " +
        "to allow downloading one that matches your current Node version.",
    );
  }

  const { cacheDir, cachedBin } = cachedOfficialSeaNodePath();
  if (existsSync(cachedBin) && hasSeaSentinel(cachedBin)) {
    console.error(`Using cached official Node (SEA-capable): ${cachedBin}`);
    return cachedBin;
  }

  const url = officialDownloadUrl();
  const archiveName =
    process.platform === "win32"
      ? `${officialArchiveBase()}.zip`
      : `${officialArchiveBase()}.tar.gz`;
  console.error(
    `Current Node (${process.execPath}) does not include the SEA injection marker (common with Homebrew). ` +
      `Downloading official ${process.version} from nodejs.org …`,
  );
  mkdirSync(cacheDir, { recursive: true });
  const extractDir = join(cacheDir, "_extract");
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  const archivePath = join(cacheDir, archiveName);
  await fetchToFile(url, archivePath);

  if (archivePath.endsWith(".zip")) {
    run("tar", ["-xf", archivePath, "-C", extractDir]);
  } else {
    run("tar", ["-xzf", archivePath, "-C", extractDir]);
  }

  const extracted = pathToExtractedOfficialNode(extractDir);
  if (!existsSync(extracted)) {
    throw new Error(`After extracting ${archivePath}, expected Node at ${extracted}`);
  }
  if (existsSync(cachedBin)) rmSync(cachedBin);
  copyFileSync(extracted, cachedBin);
  if (process.platform !== "win32") {
    chmodSync(cachedBin, 0o755);
  }
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archivePath, { force: true });

  if (!hasSeaSentinel(cachedBin)) {
    throw new Error(`Downloaded Node at ${cachedBin} still lacks SEA fuse; corrupt download?`);
  }
  console.error(`Official SEA-capable Node installed at: ${cachedBin}`);
  return cachedBin;
}

async function resolveSeaNodeBinary() {
  const override = process.env.PARALLEL_DOCS_SEA_NODE?.trim();
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`PARALLEL_DOCS_SEA_NODE=${override} does not exist.`);
    }
    if (!hasSeaSentinel(override)) {
      throw new Error(
        `PARALLEL_DOCS_SEA_NODE=${override} does not contain ${FUSE}. ` +
          "Use an official Node.js build from nodejs.org (or nvm/fnm default install).",
      );
    }
    return override;
  }

  const exec = process.execPath;
  if (hasSeaSentinel(exec)) {
    return exec;
  }

  return await ensureOfficialSeaNodeDownloaded();
}

function copyNodeBinary(source, targetPath) {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) rmSync(targetPath);
  copyFileSync(source, targetPath);
  if (process.platform !== "win32") {
    chmodSync(targetPath, 0o755);
  }
}

function postjectInject(targetPath) {
  const args = ["postject", targetPath, "NODE_SEA_BLOB", BLOB, "--sentinel-fuse", FUSE];
  if (process.platform === "darwin") {
    args.push("--macho-segment-name", "NODE_SEA");
  }
  run("npx", ["--yes", ...args], { cwd: REPO_ROOT, shell: process.platform === "win32" });
}

function prepareForInjection(targetPath) {
  if (process.platform === "darwin") {
    tryRun("codesign", ["--remove-signature", targetPath]);
  } else if (process.platform === "win32") {
    tryRun("signtool", ["remove", "/s", targetPath]);
  }
}

function finalizeBinary(targetPath) {
  if (process.platform === "darwin") {
    run("codesign", ["--sign", "-", targetPath]);
  }
}

function reportSize(targetPath) {
  const { size } = statSync(targetPath);
  const mb = (size / (1024 * 1024)).toFixed(1);
  console.error(`Built ${targetPath} (${mb} MiB).`);
}

await (async function main() {
  ensureBundle();
  const source = await resolveSeaNodeBinary();
  console.error(`Using source Node binary for SEA: ${source}`);
  generateBlob(source);

  const { name } = binarySuffix();
  const targetPath = join(OUT_DIR, name);
  copyNodeBinary(source, targetPath);
  prepareForInjection(targetPath);
  postjectInject(targetPath);
  finalizeBinary(targetPath);
  reportSize(targetPath);
})();

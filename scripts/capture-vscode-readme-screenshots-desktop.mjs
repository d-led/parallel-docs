#!/usr/bin/env node
/**
 * Automated **desktop VS Code** screenshots for the extension README companion assets.
 *
 * **Entrypoint:** `bash scripts/refresh-vscode-readme-screenshots-desktop.sh` (see companion
 * `.parallel-docs/source/packages/vscode/README.md/main.md` → Maintainer → how scenarios work).
 *
 * - Downloads VS Code via `@vscode/test-electron` (same cache as `packages/vscode/.vscode-test`).
 * - Launches Electron with `--extensionDevelopmentPath`, dogfood workspace, `--remote-debugging-port`.
 * - Drives the UI with the keyboard and captures PNGs with Playwright `chromium.connectOverCDP`.
 *
 * Prerequisites: `npm run build -w @parallel-docs/core && npm run build -w parallel-docs-vscode` (or set
 * `PARALLEL_DOCS_DESKTOP_SCREENSHOT_SKIP_BUILD=1` if `packages/vscode/dist/extension.js` is fresh).
 * One-time: `npx playwright install chromium` (CDP client).
 *
 * Optional:
 * - `VSCODE_TEST_VERSION` (default `stable`).
 * - `PARALLEL_DOCS_VSCODE_VIEWPORT_WIDTH` / `PARALLEL_DOCS_VSCODE_VIEWPORT_HEIGHT` (defaults **1200×780**).
 * - `PARALLEL_DOCS_VSCODE_ZOOM_LEVEL` — `window.zoomLevel` for the temp profile (default **2**).
 * - `PARALLEL_DOCS_VSCODE_CDP_PORT` — fixed CDP port (default random 20k–60k).
 *
 * Profile tweaks (cleaner shots): hide the secondary (Agent/Chat) sidebar and bump UI zoom via
 * `User/settings.json` in the disposable user-data dir.
 *
 * Workspace: a **temporary copy** of `packages/vscode/fixtures/dogfood` with Angles enabled so
 * “choose angle” shows the Quick Pick (the tracked fixture stays flat for extension tests).
 *
 * Output PNGs (all under `.parallel-docs/source/packages/vscode/README.md/assets/`):
 *   vscode-palette-parallel-docs.png
 *   vscode-open-paired-beside.png
 *   vscode-open-paired-choose-angle.png
 *   vscode-add-block-from-selection.png
 *   vscode-add-angle-to-project.png
 *   vscode-markdown-preview.png
 *   vscode-rendered-preview-default-palette.png
 *   vscode-rendered-preview-default.png
 *   vscode-rendered-preview-angle-palette.png
 *   vscode-rendered-preview-angle.png
 *   vscode-validate-workspace.png
 *   vscode-mcp-palette.png
 *   vscode-mcp-config-json.png
 *
 * @see https://github.com/microsoft/playwright/issues/22351
 */
import { execSync, spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vscodePkg = path.join(repoRoot, "packages", "vscode");
const extRoot = vscodePkg;
const dogfood = path.join(extRoot, "fixtures", "dogfood");
const assetsDir = path.join(
  repoRoot,
  ".parallel-docs",
  "source",
  "packages",
  "vscode",
  "README.md",
  "assets",
);
const extensionJs = path.join(vscodePkg, "dist", "extension.js");

const viewportWidth = Math.max(
  800,
  Number(process.env.PARALLEL_DOCS_VSCODE_VIEWPORT_WIDTH ?? "1200", 10),
);
const viewportHeight = Math.max(
  600,
  Number(process.env.PARALLEL_DOCS_VSCODE_VIEWPORT_HEIGHT ?? "780", 10),
);

/** Palette shows contributed commands as `Category: title` (see `packages/vscode/package.json`). */
function parallelDocsCommand(title) {
  return `ParallelDocs: ${title}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const paletteShortcut = process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
const quickOpenShortcut = process.platform === "darwin" ? "Meta+P" : "Control+P";
const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";
const focusGroup = (n) => (process.platform === "darwin" ? `Meta+${n}` : `Control+${n}`);

async function ensureBuilt() {
  // Screenshot runs should use the current extension code, not a stale dist artifact.
  if ((process.env.PARALLEL_DOCS_DESKTOP_SCREENSHOT_SKIP_BUILD ?? "").trim() === "1") {
    await access(extensionJs);
    return;
  }
  execSync("npm run build -w @parallel-docs/core && npm run build -w parallel-docs-vscode", {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

async function waitForCdp(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`CDP not ready on http://127.0.0.1:${port} within ${timeoutMs}ms`);
}

/**
 * @param {import('playwright').Browser} browser
 */
function pickWorkbenchPage(browser) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  if (pages.length === 0) {
    return undefined;
  }
  let best;
  for (const p of pages) {
    const v = p.viewportSize();
    const area = (v?.width ?? 0) * (v?.height ?? 0);
    if (!best || area > best.area) {
      best = { page: p, area };
    }
  }
  return best?.page ?? pages[0];
}

/**
 * @param {import('playwright').Browser} browser
 */
async function waitForAnyPage(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = pickWorkbenchPage(browser);
    if (p) return p;
    await sleep(400);
  }
  return undefined;
}

/**
 * @param {import('playwright').Page} page
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape");
    await sleep(180);
  }
}

/**
 * Open the command palette in **command (run) mode** so `ParallelDocs: …` matches contributed
 * commands. Without a leading `>`, the unified picker often stays in file-search mode → "No matching results".
 *
 * @param {import('playwright').Page} page
 */
async function openCommandPaletteCommandMode(page) {
  await dismissOverlays(page);
  await page.keyboard.press(paletteShortcut);
  await sleep(850);
  await page.keyboard.press(selectAllShortcut);
  await sleep(90);
  await page.keyboard.press("Backspace");
  await sleep(160);
  await page.keyboard.type(">", { delay: 35 });
  await sleep(380);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} commandQuery text after the leading `>` (e.g. `ParallelDocs: Validate workspace`)
 */
async function runPaletteQuery(page, commandQuery, { afterEnterMs = 3500, typeDelay = 20 } = {}) {
  await openCommandPaletteCommandMode(page);
  await page.keyboard.type(commandQuery, { delay: typeDelay });
  await sleep(500);
  await page.keyboard.press("Enter");
  await sleep(afterEnterMs);
}

/**
 * Types a command query in run-command palette mode **without** pressing Enter (for palette-only
 * screenshots).
 *
 * @param {import('playwright').Page} page
 */
async function typeInCommandPalette(page, commandQuery, { typeDelay = 20 } = {}) {
  await openCommandPaletteCommandMode(page);
  await page.keyboard.type(commandQuery, { delay: typeDelay });
  await sleep(650);
}

/**
 * @param {string} userDataDir
 */
async function writeScreenshotProfileSettings(userDataDir) {
  const userDir = path.join(userDataDir, "User");
  await mkdir(userDir, { recursive: true });
  const zoomRaw = process.env.PARALLEL_DOCS_VSCODE_ZOOM_LEVEL ?? "2";
  const zoom = Number.parseFloat(zoomRaw);
  const settings = {
    "window.zoomLevel": Number.isFinite(zoom) ? zoom : 2,
    // Secondary / Agent / Chat column — keep README frames editor-focused.
    "workbench.secondarySideBar.defaultVisibility": "hidden",
    "workbench.startupEditor": "none",
  };
  await writeFile(
    path.join(userDir, "settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf-8",
  );
}

/**
 * @param {import('playwright').Page} page
 */
async function shot(page, filename) {
  await page.screenshot({
    path: path.join(assetsDir, filename),
    animations: "disabled",
  });
}

/**
 * @param {import('playwright').Page} page
 */
async function openSampleTs(page) {
  await dismissOverlays(page);
  await page.keyboard.press(quickOpenShortcut);
  await sleep(700);
  await page.keyboard.press(selectAllShortcut);
  await sleep(120);
  await page.keyboard.type("src/sample.ts", { delay: 22 });
  await sleep(400);
  await page.keyboard.press("Enter");
  await sleep(4200);
}

async function downloadVscodeForScreenshots() {
  const { downloadAndUnzipVSCode } = await import("@vscode/test-electron/out/index.js");
  const version = (process.env.VSCODE_TEST_VERSION ?? "").trim() || "stable";
  const cachePath = path.join(vscodePkg, ".vscode-test");
  return downloadAndUnzipVSCode({
    cachePath,
    version,
    extensionDevelopmentPath: extRoot,
  });
}

function resolveCdpPort() {
  return Number(
    process.env.PARALLEL_DOCS_VSCODE_CDP_PORT ??
      String(20_000 + Math.floor(Math.random() * 40_000)),
    10,
  );
}

function vscodeLaunchArgs(cdpPort, extensionsDir, userDataDir, workspaceFolder) {
  return [
    `--remote-debugging-port=${cdpPort}`,
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    `--extensions-dir=${extensionsDir}`,
    `--user-data-dir=${userDataDir}`,
    `--extensionDevelopmentPath=${extRoot}`,
    workspaceFolder,
  ];
}

async function prepareDisposableProfile() {
  const profileRoot = await mkdtemp(path.join(os.tmpdir(), "parallel-docs-desktop-shot-"));
  const userDataDir = path.join(profileRoot, "user-data");
  const extensionsDir = path.join(profileRoot, "extensions");
  await mkdir(userDataDir, { recursive: true });
  await mkdir(extensionsDir, { recursive: true });
  await writeScreenshotProfileSettings(userDataDir);
  return { profileRoot, userDataDir, extensionsDir };
}

/**
 * Copy dogfood into the disposable profile and enable Angles (sentinel + `.parallel-docs.toml`)
 * so palette screenshots match multi-angle workflows without mutating the git-tracked fixture.
 *
 * @param {string} profileRoot
 */
/** Verbose companion Markdown for README / desktop capture (Main angle). */
const SCREENSHOT_MAIN_MD = `## Sample companion — Main

*Angle \`main\` · \`main.md\` · README screenshot seed*

This companion file is intentionally **verbose** for desktop README screenshots: the rendered preview should show real paragraphs, headings, and a visible **page break**—not a one-line stub that becomes unreadable when the frame is small.

### Why keep parallel-docs beside the source?

Teams accumulate context that does not belong inline: release checklists, product nuance, links to specs, and “gotchas” from review. ParallelDocs stores that prose next to the repository while keeping the primary source file approachable for day-to-day coding.

<!-- parallelDocs:page-break -->

### How the rendered preview differs from the built-in Markdown preview

**Open rendered ParallelDocs preview (default angle)** uses the same HTML pipeline as static pages: GitHub-flavored Markdown, syntax highlighting, and ParallelDocs anchors so scroll sync can follow the source editor. The built-in preview is still useful while editing raw \`.md\`; this mode matches what readers see on the site.

#### Practical workflow

1. Keep \`src/sample.ts\` focused on the implementation.
2. Narrate intent, trade-offs, and rollout notes in this companion track.
3. Scroll the source and preview together so reviewers stay oriented in long files.

> **Tip:** If you maintain multiple angles, keep each angle self-contained so readers can switch narratives without losing the thread.
`;

/** Second angle: visibly different copy for “choose angle” preview shots. */
const SCREENSHOT_ALT_MD = `## Sample companion — Alt

*Angle \`alt\` · \`alt.md\` · README screenshot seed*

Use this angle for **friendlier onboarding** aimed at new contributors: what to install, which palette commands to try first, and how to sanity-check a change before opening a pull request.

README automation opens this file when exercising **Open rendered ParallelDocs preview (choose angle)…** so the rendered preview is clearly different from the default **Main** companion.

### Before you ask for review

- [ ] Run tests locally.
- [ ] Call out risk areas in the PR description.
- [ ] Link the issue or ticket that motivated the change.

### Where to go deeper

Point readers at \`docs/\` for diagrams and long-form specs; keep this angle short, current, and motivating.
`;

async function materializeScreenshotWorkspaceWithAngles(profileRoot) {
  const ws = path.join(profileRoot, "screenshot-dogfood");
  await cp(dogfood, ws, { recursive: true });
  const defaultSentinel = path.join(ws, ".parallel-docs", "source", ".default");
  await mkdir(path.dirname(defaultSentinel), { recursive: true });
  await writeFile(defaultSentinel, "# ParallelDocs Angles layout sentinel.\n", "utf-8");
  const anglesToml = `[storage]
dir = ".parallel-docs"

[angles]
default_angle = "main"

[[angles.definitions]]
id = "main"
title = "Main"

[[angles.definitions]]
id = "alt"
title = "Alt"
`;
  await writeFile(path.join(ws, ".parallel-docs.toml"), `${anglesToml}\n`, "utf-8");

  const companionDir = path.join(ws, ".parallel-docs", "source", "src", "sample.ts");
  await mkdir(companionDir, { recursive: true });
  await writeFile(path.join(companionDir, "main.md"), SCREENSHOT_MAIN_MD, "utf-8");
  await writeFile(path.join(companionDir, "alt.md"), SCREENSHOT_ALT_MD, "utf-8");

  // MCP server config — show the ParallelDocs entry with its description
  const vscodeDir = path.join(ws, ".vscode");
  await mkdir(vscodeDir, { recursive: true });
  const mcpConfig = {
    servers: {
      parallelDocs: {
        type: "stdio",
        command: "parallel-docs",
        args: ["mcp", "serve"],
        cwd: "${workspaceFolder}",
        description:
          "ParallelDocs: out-of-file parallel-docs anchored to code. " +
          "Explains design decisions, trade-offs, and rationale — " +
          'the "why" that doesn\'t belong in comments or docs. ' +
          "Strict separation: code comments (inline), documentation (standalone), " +
          "ParallelDocs (anchored, cross-linked).",
      },
    },
  };
  await writeFile(
    path.join(vscodeDir, "mcp.json"),
    JSON.stringify(mcpConfig, null, 2) + "\n",
    "utf-8",
  );

  return ws;
}

/**
 * @param {import('playwright').Page} page
 */
async function runScreenshotScenarios(page) {
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
  await sleep(15_000);

  await openCommandPaletteCommandMode(page);
  await page.keyboard.type("ParallelDocs", { delay: 22 });
  await sleep(700);
  await shot(page, "vscode-palette-parallel-docs.png");
  await dismissOverlays(page);

  await openSampleTs(page);

  await runPaletteQuery(page, parallelDocsCommand("Open paired markdown beside editor"), {
    afterEnterMs: 5500,
  });
  await shot(page, "vscode-open-paired-beside.png");

  await runPaletteQuery(page, parallelDocsCommand("Open paired markdown (choose angle)"), {
    afterEnterMs: 4000,
  });
  await shot(page, "vscode-open-paired-choose-angle.png");
  await dismissOverlays(page);

  await page.keyboard.press(focusGroup(1));
  await sleep(500);
  await page.keyboard.press(selectAllShortcut);
  await sleep(350);
  await runPaletteQuery(page, parallelDocsCommand("Add side-track block from selection"), {
    afterEnterMs: 6500,
  });
  await shot(page, "vscode-add-block-from-selection.png");
  await dismissOverlays(page);

  await runPaletteQuery(page, parallelDocsCommand(`Add angle to project\u2026`), {
    afterEnterMs: 2800,
  });
  await shot(page, "vscode-add-angle-to-project.png");
  await dismissOverlays(page);

  await page.keyboard.press(focusGroup(2));
  await sleep(700);
  await runPaletteQuery(page, parallelDocsCommand("Open Markdown preview for paired file"), {
    afterEnterMs: 4500,
  });
  await shot(page, "vscode-markdown-preview.png");
  await dismissOverlays(page);

  // Rendered preview — default angle: palette (command highlighted) then webview body.
  await page.keyboard.press(focusGroup(1));
  await sleep(550);
  await openSampleTs(page);
  await typeInCommandPalette(
    page,
    parallelDocsCommand("Open rendered ParallelDocs preview (default angle)"),
  );
  await shot(page, "vscode-rendered-preview-default-palette.png");
  await page.keyboard.press("Enter");
  await sleep(6000);
  await page.keyboard.press(focusGroup(2));
  await sleep(1100);
  await shot(page, "vscode-rendered-preview-default.png");
  await dismissOverlays(page);

  // Rendered preview — choose angle: palette, pick **Alt**, then webview.
  await page.keyboard.press(focusGroup(1));
  await sleep(550);
  await openSampleTs(page);
  await typeInCommandPalette(
    page,
    parallelDocsCommand(`Open rendered ParallelDocs preview (choose angle)\u2026`),
  );
  await shot(page, "vscode-rendered-preview-angle-palette.png");
  await page.keyboard.press("Enter");
  await sleep(4200);
  await page.keyboard.press("ArrowDown");
  await sleep(450);
  await page.keyboard.press("Enter");
  await sleep(6000);
  await page.keyboard.press(focusGroup(2));
  await sleep(1100);
  await shot(page, "vscode-rendered-preview-angle.png");
  await dismissOverlays(page);

  await runPaletteQuery(page, parallelDocsCommand("Validate workspace"), { afterEnterMs: 3500 });
  await runPaletteQuery(page, "Output: Focus on Output View", { afterEnterMs: 3200 });
  await shot(page, "vscode-validate-workspace.png");
  await dismissOverlays(page);

  await captureMcpScreenshots(page);
}

/**
 * @param {import('playwright').Page} page
 */
async function captureMcpScreenshots(page) {
  // Show ParallelDocs MCP setup in the command palette
  await typeInCommandPalette(page, "ParallelDocs Configure MCP");
  await shot(page, "vscode-mcp-palette.png");
  await dismissOverlays(page);

  // Open .vscode/mcp.json to show the ParallelDocs MCP server entry
  await dismissOverlays(page);
  await page.keyboard.press(quickOpenShortcut);
  await sleep(700);
  await page.keyboard.press(selectAllShortcut);
  await sleep(120);
  await page.keyboard.type(".vscode/mcp.json", { delay: 22 });
  await sleep(400);
  await page.keyboard.press("Enter");
  await sleep(3500);
  await shot(page, "vscode-mcp-config-json.png");
  await dismissOverlays(page);
}

/**
 * @param {import('playwright').Browser | undefined} browser
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} profileRoot
 */
async function shutdownVscodeSession(browser, child, profileRoot) {
  try {
    if (browser) await browser.close();
  } catch {
    /* ignore */
  }
  child.kill("SIGTERM");
  await sleep(1500);
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  await rm(profileRoot, { recursive: true, force: true });
}

async function main() {
  await ensureBuilt();
  await mkdir(assetsDir, { recursive: true });

  const vscodeExecutablePath = await downloadVscodeForScreenshots();
  const { profileRoot, userDataDir, extensionsDir } = await prepareDisposableProfile();
  const screenshotWorkspace = await materializeScreenshotWorkspaceWithAngles(profileRoot);
  const cdpPort = resolveCdpPort();
  const child = spawn(
    vscodeExecutablePath,
    vscodeLaunchArgs(cdpPort, extensionsDir, userDataDir, screenshotWorkspace),
    {
      stdio: "ignore",
      detached: false,
      env: { ...process.env },
    },
  );

  const { chromium } = await import("playwright");
  let browser;
  try {
    await waitForCdp(cdpPort, 120_000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const page = await waitForAnyPage(browser, 90_000);
    if (!page) {
      const n = browser.contexts().reduce((a, c) => a + c.pages().length, 0);
      throw new Error(`No page found after CDP connect (context page count: ${n})`);
    }
    await runScreenshotScenarios(page);
  } finally {
    await shutdownVscodeSession(browser, child, profileRoot);
  }

  console.log("Wrote desktop VS Code screenshots to:", assetsDir);
}

await main();

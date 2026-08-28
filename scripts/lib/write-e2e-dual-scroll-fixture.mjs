#!/usr/bin/env node
/**
 * Writes `_site/__e2e__/dual-scroll-sync.html`: dual-pane code browser with index-backed
 * block scroll links and gutter “rays”, for Cypress scroll-sync assertions.
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION } from "@sidetrack/core";
import { renderCodeBrowserHtml } from "@sidetrack/render";

/**
 * @param {string} repoRoot
 */
export async function writeE2eDualScrollFixture(repoRoot) {
  const outDir = path.join(repoRoot, "_site");
  const crPath = ".sidetrack/source/e2e/dual-scroll.ts.md";
  const index = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bySideTrackPath: {
      [crPath]: {
        sourcePath: "e2e/dual-scroll.ts",
        sidetrackPath: crPath,
        blocks: [
          { id: "b1", anchor: "lines:1-12" },
          { id: "b2", anchor: "lines:13-30" },
        ],
      },
    },
  };
  const code = Array.from(
    { length: 40 },
    (_, i) => `const v${String(i + 1)} = ${String(i + 1)};`,
  ).join("\n");
  const secondBlockBody = Array.from(
    { length: 45 },
    (_, i) => `Second-block sidetrack line ${String(i + 1)}.`,
  ).join("\n\n");
  const md =
    "<!-- sidetrack:block id=b1 -->\n\n" +
    "## First range\n\n" +
    "SideTrack aligned to source lines 1–12.\n\n" +
    "<!-- sidetrack:block id=b2 -->\n\n" +
    "## Second range\n\n" +
    secondBlockBody +
    "\n";

  const html = await renderCodeBrowserHtml({
    title: "E2E dual scroll sync",
    filePath: "e2e/dual-scroll.ts",
    code,
    language: "ts",
    sidetrackMarkdown: md,
    codeBrowserLayout: "dual",
    blockStretchRows: {
      index,
      sourceRelative: "e2e/dual-scroll.ts",
      sidetrackPathRel: crPath,
    },
  });

  /** `serve` strips `.html` and resolves `/__e2e__/name` as a folder; use `…/name/index.html` so the fixture is served, not the site root `index.html`. */
  const target = path.join(outDir, "__e2e__", "dual-scroll-sync", "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
  const legacy = path.join(outDir, "__e2e__", "dual-scroll-sync.html");
  await unlink(legacy).catch(() => {});
  console.log(`Wrote ${target}`);
}

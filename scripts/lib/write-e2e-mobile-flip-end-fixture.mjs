#!/usr/bin/env node
/**
 * Writes `_site/__e2e__/mobile-flip-end/index.html`: long dual-pane pair for mobile flip
 * scroll sync at document end (Cypress).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION } from "@parallel-docs/core";
import { renderCodeBrowserHtml } from "@parallel-docs/render";

const LINE_COUNT = 100;
const crPath = ".parallel-docs/source/e2e/mobile-flip-end.ts.md";

/**
 * @param {string} repoRoot
 */
export async function writeE2eMobileFlipEndFixture(repoRoot) {
  const b1End = 28;
  const b2End = 72;
  const index = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byParallelDocsPath: {
      [crPath]: {
        sourcePath: "e2e/mobile-flip-end.ts",
        parallelDocsPath: crPath,
        blocks: [
          { id: "b1", anchor: `lines:1-${b1End}` },
          { id: "b2", anchor: `lines:${b1End + 1}-${b2End}` },
          { id: "b3", anchor: `lines:${b2End + 1}-${LINE_COUNT}` },
        ],
      },
    },
  };
  const code = Array.from(
    { length: LINE_COUNT },
    (_, i) => `const v${String(i + 1)} = ${String(i + 1)};`,
  ).join("\n");
  const filler = Array.from(
    { length: 40 },
    (_, i) =>
      `Middle parallel-docs paragraph ${String(i + 1)} with enough words to lengthen the doc pane.`,
  ).join("\n\n");
  const md =
    "<!-- parallelDocs:block id=b1 -->\n\n## Opening\n\nShort parallel-docs for the first source span.\n\n" +
    "<!-- parallelDocs:block id=b2 -->\n\n## Middle\n\n" +
    filler +
    "\n\n<!-- parallelDocs:block id=b3 -->\n\n## Tail\n\nE2E_MOBILE_FLIP_TAIL_LBL\n";

  const html = await renderCodeBrowserHtml({
    title: "E2E mobile flip end",
    filePath: "e2e/mobile-flip-end.ts",
    code,
    language: "ts",
    parallelDocsMarkdown: md,
    codeBrowserLayout: "dual",
    blockStretchRows: {
      index,
      sourceRelative: "e2e/mobile-flip-end.ts",
      parallelDocsPathRel: crPath,
    },
  });

  const outDir = path.join(repoRoot, "_site");
  const target = path.join(outDir, "__e2e__", "mobile-flip-end", "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
  console.log(`Wrote ${target}`);
}

import { describe, expect, it } from "vitest";
import { healSourceFile } from "./self-healing.js";
import { addBlockToIndex } from "./blocks.js";
import { emptyIndex } from "./metadata.js";
import { buildSideTrackSnippetV1 } from "./block-snippet.js";

const testMarkdown = [
  "<!-- sidetrack:block id=xyz -->",
  "## src/main.ts line 3",
  "",
  "prose",
  "",
].join("\n");

function createTestIndexWithBlock(id: string, lines: string[]) {
  return addBlockToIndex(emptyIndex(), {
    sourcePath: "src/main.ts",
    sidetrackPath: "docs/main.md",
    block: {
      id,
      anchor: `marker:${id}`,
      snippet: buildSideTrackSnippetV1(lines),
    },
  });
}

function runHeal(args: {
  sourceText: string;
  companionMarkdown: string;
  index: ReturnType<typeof emptyIndex>;
}) {
  return healSourceFile({
    sourceText: args.sourceText,
    languageId: "typescript",
    companionMarkdown: args.companionMarkdown,
    index: args.index,
    sidetrackPath: "docs/main.md",
  });
}

function assertHealNoChange(src: string, markdown: string, index: ReturnType<typeof emptyIndex>) {
  const result = runHeal({
    sourceText: src,
    companionMarkdown: markdown,
    index,
  });
  expect(result.healedCount).toBe(0);
  expect(result.sourceText).toBe(src);
}

describe("Self-healing source file regions", () => {
  it("returns original source text and index when no markers are missing", () => {
    const src = [
      "function main() {",
      "//#region sidetrack:xyz",
      "  console.log(1);",
      "//#endregion sidetrack:xyz",
      "}",
    ].join("\n");

    const idx = createTestIndexWithBlock("xyz", ["console.log(1);"]);
    assertHealNoChange(src, testMarkdown, idx);
  });

  it("restores missing region markers when the snippet unique match is found in the source", () => {
    const src = ["function main() {", "  console.log(1);", "}"].join("\n");
    const idx = createTestIndexWithBlock("xyz", ["console.log(1);"]);

    const result = runHeal({
      sourceText: src,
      companionMarkdown: testMarkdown,
      index: idx,
    });

    expect(result.healedCount).toBe(1);
    expect(result.sourceText).toContain("//#region sidetrack:xyz");
    expect(result.sourceText).toContain("console.log(1);");
    expect(result.sourceText).toContain("//#endregion sidetrack:xyz");
  });

  it("does not heal a block if it is not present in index", () => {
    const src = "console.log(1);";
    const markdown = "<!-- sidetrack:block id=xyz -->\n## x\n\nprose";
    assertHealNoChange(src, markdown, emptyIndex());
  });
});

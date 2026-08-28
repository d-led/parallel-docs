import { describe, expect, it } from "vitest";
import { buildSideTrackSnippetV1 } from "./block-snippet.js";
import {
  addBlockToIndex,
  alignAndCleanRegions,
  appendBlockToSideTrack,
  createBlockForRange,
  generateBlockId,
  insertBlockBySourceMarkerOrder,
  recoverSourceMarkersFromSnippet,
  removeBlockFromSideTrack,
  removeBlockFromIndex,
  removeSourceMarkersFromText,
  wrapSourceLineRangeWithSideTrackMarkers,
} from "./blocks.js";
import { emptyIndex } from "./metadata.js";
import type { SideTrackBlock } from "./model.js";

const SOURCE = ["export function greet(name) {", "  return `Hello, ${name}!`;", "}"].join("\n");

function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("Wrapping a source line range with SideTrack region delimiters", () => {
  it("uses HTML-style regions in Markdown like the repository README", () => {
    const src = ["# Title", "body", "tail"].join("\n");
    const { sourceText, innerRange } = wrapSourceLineRangeWithSideTrackMarkers({
      sourceText: src,
      range: { startLine: 2, endLine: 2 },
      languageId: "markdown",
      markerId: "readme-why",
    });
    expect(sourceText).toContain("<!-- #region sidetrack:readme-why -->");
    expect(sourceText).toContain("<!-- #endregion sidetrack:readme-why -->");
    expect(innerRange).toEqual({ startLine: 3, endLine: 3 });
  });

  it("uses hash line-comment markers in TOML (same pairing contract as README, different comment syntax)", () => {
    const src = ["[storage]", 'dir = "x"', "", "[scm]", "y = 1"].join("\n");
    const { sourceText, innerRange } = wrapSourceLineRangeWithSideTrackMarkers({
      sourceText: src,
      range: { startLine: 1, endLine: 2 },
      languageId: "toml",
      markerId: "toml-lede",
    });
    expect(sourceText).toContain("# sidetrack:start id=toml-lede");
    expect(sourceText).toContain("# sidetrack:end id=toml-lede");
    expect(innerRange).toEqual({ startLine: 2, endLine: 3 });
  });
});

describe("Creating a new documentation block for a source range", () => {
  it("anchors the block with a marker id tied to the block id (source regions use the same id)", () => {
    const { block } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 3 },
      id: "fixed1",
    });
    expect(block.anchor).toBe("marker:fixed1");
    expect(block.markerId).toBe("fixed1");
  });

  it("stores a unified-diff-style snippet of trimmed source lines (not a JSON object)", () => {
    const { block } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 3 },
      id: "fixed1",
    });
    expect(block.snippet).toBe(
      buildSideTrackSnippetV1(["export function greet(name) {", "return `Hello, ${name}!`;", "}"]),
    );
  });

  it("recognises a single-line range and labels it as such in the heading", () => {
    const { markdown } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 2, endLine: 2 },
      id: "fixed1",
    });
    expect(markdown).toContain("## `src/greet.ts` line 2");
    expect(markdown).not.toContain("lines 2–2");
  });

  it("labels a multi-line range with an en dash", () => {
    const { markdown } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 3 },
      id: "fixed1",
    });
    expect(markdown).toContain("## `src/greet.ts` lines 1–3");
  });

  it("clamps an end line beyond the source to the final line", () => {
    const { block } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 2, endLine: 999 },
      id: "fixed1",
    });
    expect(block.anchor).toBe("marker:fixed1");
    expect(block.snippet).toBe(buildSideTrackSnippetV1(["return `Hello, ${name}!`;", "}"]));
  });

  it("emits an invisible id marker that renders to nothing in HTML", () => {
    const { block, markdown } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 3 },
      id: "abc123",
    });
    expect(markdown).toMatch(/^<!-- sidetrack:block id=abc123 -->\n/);
    expect(block.id).toBe("abc123");
  });

  it("places the caret on the placeholder paragraph so the author can start typing", () => {
    const { markdown, caretLineOffset } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 3 },
      id: "abc123",
    });
    const lines = markdown.split("\n");
    expect(lines[caretLineOffset]).toBe("_(write sidetrack here)_");
  });

  it("derives a deterministic id from the supplied rng", () => {
    const { block } = createBlockForRange({
      sourcePath: "src/greet.ts",
      sourceText: SOURCE,
      range: { startLine: 1, endLine: 1 },
      rng: seeded([0, 0, 0, 0, 0, 0]),
    });
    expect(block.id).toBe("aaaaaa");
  });
});

describe("Appending a block into companion Markdown", () => {
  it("separates the new block from existing content with a blank line", () => {
    const existing = "# SideTrack\n\n";
    const blockMd = "<!-- sidetrack:block id=abc -->\n## line 1\n\nbody\n";
    const next = appendBlockToSideTrack(existing, blockMd);
    expect(next).toBe(`# SideTrack\n\n${blockMd}`);
  });

  it("keeps a no-trailing-newline existing file intact and still separates", () => {
    const existing = "header without trailing newline";
    const blockMd = "<!-- sidetrack:block id=abc -->\n## line 1\n";
    const next = appendBlockToSideTrack(existing, blockMd);
    expect(next).toBe(`header without trailing newline\n\n${blockMd}`);
  });

  it("handles an empty file by writing the block at the top", () => {
    const next = appendBlockToSideTrack("", "<!-- sidetrack:block id=abc -->\n## x\n");
    expect(next).toBe("<!-- sidetrack:block id=abc -->\n## x\n");
  });
});

describe("Inserting a block by source marker order", () => {
  it("places a new block before the first companion section that maps after it in source", () => {
    const source = [
      "//#region sidetrack:a",
      "a",
      "//#endregion sidetrack:a",
      "//#region sidetrack:b",
      "b",
      "//#endregion sidetrack:b",
      "//#region sidetrack:c",
      "c",
      "//#endregion sidetrack:c",
    ].join("\n");
    const existing = [
      "<!-- sidetrack:block id=a -->",
      "## a",
      "",
      "A",
      "",
      "<!-- sidetrack:block id=c -->",
      "## c",
      "",
      "C",
      "",
    ].join("\n");
    const blockB = ["<!-- sidetrack:block id=b -->", "## b", "", "B", ""].join("\n");

    const next = insertBlockBySourceMarkerOrder({
      existingSideTrack: existing,
      blockMarkdown: blockB,
      sourceText: source,
      markerId: "b",
    });

    const aPos = next.indexOf("<!-- sidetrack:block id=a -->");
    const bPos = next.indexOf("<!-- sidetrack:block id=b -->");
    const cPos = next.indexOf("<!-- sidetrack:block id=c -->");
    expect(aPos).toBeGreaterThanOrEqual(0);
    expect(bPos).toBeGreaterThan(aPos);
    expect(cPos).toBeGreaterThan(bPos);
  });

  it("falls back to append when marker id is missing from source order", () => {
    const source = ["//#region sidetrack:a", "a", "//#endregion sidetrack:a"].join("\n");
    const existing = "<!-- sidetrack:block id=a -->\n## a\n";
    const blockZ = "<!-- sidetrack:block id=z -->\n## z\n";

    const next = insertBlockBySourceMarkerOrder({
      existingSideTrack: existing,
      blockMarkdown: blockZ,
      sourceText: source,
      markerId: "z",
    });

    expect(next).toBe(`${existing.trimEnd()}\n\n${blockZ}`);
  });

  it("uses first marker starts for ordering even when a prior region is temporarily unclosed", () => {
    const source = [
      "<!-- #region sidetrack:running -->",
      "running body",
      "<!-- #region sidetrack:unit -->",
      "unit body",
      "<!-- #endregion sidetrack:unit -->",
    ].join("\n");
    const existing = ["<!-- sidetrack:block id=unit -->", "## unit", "", "Unit text", ""].join(
      "\n",
    );
    const running = ["<!-- sidetrack:block id=running -->", "## running", "", "Run text", ""].join(
      "\n",
    );

    const next = insertBlockBySourceMarkerOrder({
      existingSideTrack: existing,
      blockMarkdown: running,
      sourceText: source,
      markerId: "running",
    });

    const runningPos = next.indexOf("<!-- sidetrack:block id=running -->");
    const unitPos = next.indexOf("<!-- sidetrack:block id=unit -->");
    expect(runningPos).toBeGreaterThanOrEqual(0);
    expect(unitPos).toBeGreaterThan(runningPos);
  });
});

describe("Registering a block in the index", () => {
  const block: SideTrackBlock = { id: "abc123", anchor: "lines:1-3" };

  it("creates the source entry lazily the first time a block is added", () => {
    const next = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/greet.ts",
      sidetrackPath: ".sidetrack/source/src/greet.ts.md",
      block,
    });
    const cr = ".sidetrack/source/src/greet.ts.md";
    expect(next.bySideTrackPath[cr]).toEqual({
      sourcePath: "src/greet.ts",
      sidetrackPath: cr,
      blocks: [block],
    });
  });

  it("appends to an existing source entry without mutating the input index", () => {
    const cr = ".sidetrack/source/src/greet.ts.md";
    const base = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/greet.ts",
      sidetrackPath: cr,
      block,
    });
    const next = addBlockToIndex(base, {
      sourcePath: "src/greet.ts",
      sidetrackPath: cr,
      block: { id: "def456", anchor: "lines:10-20" },
    });
    expect(next.bySideTrackPath[cr]?.blocks.map((b) => b.id)).toEqual(["abc123", "def456"]);
    expect(base.bySideTrackPath[cr]?.blocks.map((b) => b.id)).toEqual(["abc123"]);
  });

  it("refuses to overwrite a block whose id already exists", () => {
    const cr = ".sidetrack/source/src/greet.ts.md";
    const base = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/greet.ts",
      sidetrackPath: cr,
      block,
    });
    expect(() =>
      addBlockToIndex(base, {
        sourcePath: "src/greet.ts",
        sidetrackPath: cr,
        block: { id: "abc123", anchor: "lines:5-7" },
      }),
    ).toThrowError(/already exists/);
  });

  it("refuses the same sidetrackPath indexed for a different source file", () => {
    const cr = ".sidetrack/source/x.md";
    const base = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/a.ts",
      sidetrackPath: cr,
      block,
    });
    expect(() =>
      addBlockToIndex(base, {
        sourcePath: "src/other.ts",
        sidetrackPath: cr,
        block: { id: "def456", anchor: "lines:1-2" },
      }),
    ).toThrow(/already indexed for/);
  });
});

describe("Generating stable block identifiers", () => {
  it("returns a six-character lowercase alphanumeric id", () => {
    const id = generateBlockId(seeded([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });
});

describe("Removing a block from companion Markdown", () => {
  it("returns original text when the block ID does not exist", () => {
    const md = "<!-- sidetrack:block id=abc -->\n## src/x.ts line 1\n\nprose\n";
    const result = removeBlockFromSideTrack(md, "nonexistent");
    expect(result).toBe(md);
  });

  it("removes the only block completely and returns the prelude only", () => {
    const md =
      "# Prelude Title\nIntro text\n\n<!-- sidetrack:block id=abc -->\n## src/x.ts line 1\n\nprose\n";
    const result = removeBlockFromSideTrack(md, "abc");
    expect(result.trim()).toBe("# Prelude Title\nIntro text");
  });

  it("removes a block in the middle of other blocks, joining them cleanly", () => {
    const md = [
      "<!-- sidetrack:block id=a -->",
      "## src/x.ts line 1",
      "",
      "prose A",
      "",
      "<!-- sidetrack:block id=b -->",
      "## src/x.ts line 2",
      "",
      "prose B",
      "",
      "<!-- sidetrack:block id=c -->",
      "## src/x.ts line 3",
      "",
      "prose C",
      "",
    ].join("\n");

    const result = removeBlockFromSideTrack(md, "b");

    expect(result).toContain("id=a");
    expect(result).not.toContain("id=b");
    expect(result).toContain("id=c");
    expect(result).toContain("prose A");
    expect(result).not.toContain("prose B");
    expect(result).toContain("prose C");
  });

  it("removes the last block, preserving the preceding block and its layout", () => {
    const md = [
      "<!-- sidetrack:block id=a -->",
      "## src/x.ts line 1",
      "",
      "prose A",
      "",
      "<!-- sidetrack:block id=b -->",
      "## src/x.ts line 2",
      "",
      "prose B",
      "",
    ].join("\n");

    const result = removeBlockFromSideTrack(md, "b");

    expect(result.trim()).toBe(
      ["<!-- sidetrack:block id=a -->", "## src/x.ts line 1", "", "prose A"].join("\n"),
    );
  });
});

describe("Removing source markers from source files", () => {
  it("returns unchanged text when the marker ID is not found", () => {
    const src = "function foo() {\n  return 1;\n}\n";
    const result = removeSourceMarkersFromText(src, "abc");
    expect(result).toBe(src);
  });

  it("removes starting and ending marker lines for the given ID", () => {
    const src = [
      "function foo() {",
      "//#region sidetrack:abc",
      "  console.log('hello');",
      "//#endregion sidetrack:abc",
      "}",
    ].join("\n");

    const result = removeSourceMarkersFromText(src, "abc");

    expect(result).toBe(["function foo() {", "  console.log('hello');", "}"].join("\n"));
  });

  it("supports multiple comment styles", () => {
    const src = [
      "<!-- #region sidetrack:abc -->",
      "some markdown",
      "<!-- #endregion sidetrack:abc -->",
    ].join("\n");

    const result = removeSourceMarkersFromText(src, "abc");

    expect(result).toBe("some markdown");
  });
});

describe("Removing a block from the metadata index", () => {
  it("returns the exact same index when the path or block ID does not exist", () => {
    const base = emptyIndex();
    const result = removeBlockFromIndex(base, "nonexistent.md", "abc");
    expect(result).toBe(base);
  });

  it("removes only the specified block from the entry, keeping other blocks", () => {
    const cp = "docs/x.md";
    let idx = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/x.ts",
      sidetrackPath: cp,
      block: { id: "a", anchor: "marker:a" },
    });
    idx = addBlockToIndex(idx, {
      sourcePath: "src/x.ts",
      sidetrackPath: cp,
      block: { id: "b", anchor: "marker:b" },
    });

    const result = removeBlockFromIndex(idx, cp, "a");

    expect(result.bySideTrackPath[cp]?.blocks.map((b) => b.id)).toEqual(["b"]);
  });

  it("removes the entire entry from bySideTrackPath when the last block is deleted", () => {
    const cp = "docs/x.md";
    const idx = addBlockToIndex(emptyIndex(), {
      sourcePath: "src/x.ts",
      sidetrackPath: cp,
      block: { id: "a", anchor: "marker:a" },
    });

    const result = removeBlockFromIndex(idx, cp, "a");

    expect(result.bySideTrackPath[cp]).toBeUndefined();
  });
});

function buildAlignIndex(blocks: { id: string; anchor: string }[]) {
  return {
    schemaVersion: 3 as const,
    bySideTrackPath: {
      "docs/main.md": {
        sourcePath: "src/main.ts",
        sidetrackPath: "docs/main.md",
        blocks,
      },
    },
  };
}

function runAlign(args: {
  sourceText: string;
  sidetrackMarkdown: string;
  blocks: { id: string; anchor: string }[];
}) {
  return alignAndCleanRegions({
    sourceText: args.sourceText,
    sidetrackMarkdown: args.sidetrackMarkdown,
    index: buildAlignIndex(args.blocks),
    sidetrackPath: "docs/main.md",
    sourcePath: "src/main.ts",
  });
}

describe("Aligning and cleaning regions across source, markdown, and index", () => {
  const sourceText = [
    "function main() {",
    "//#region sidetrack:first",
    "  console.log(1);",
    "//#endregion sidetrack:first",
    "  console.log(2);",
    "//#region sidetrack:second",
    "  console.log(3);",
    "//#endregion sidetrack:second",
    "}",
  ].join("\n");

  it("reorders markdown block segments and index blocks to match source region order", () => {
    // Markdown has "second" block first, and "first" block second
    const markdown = [
      "<!-- sidetrack:block id=second -->",
      "## src/main.ts line 7",
      "",
      "prose second",
      "",
      "<!-- sidetrack:block id=first -->",
      "## src/main.ts line 3",
      "",
      "prose first",
      "",
    ].join("\n");

    const { sidetrackMarkdown, index } = runAlign({
      sourceText,
      sidetrackMarkdown: markdown,
      blocks: [
        { id: "second", anchor: "marker:second" },
        { id: "first", anchor: "marker:first" },
      ],
    });

    // Verify markdown ordering
    const firstPos = sidetrackMarkdown.indexOf("id=first");
    const secondPos = sidetrackMarkdown.indexOf("id=second");
    expect(firstPos).toBeGreaterThan(-1);
    expect(secondPos).toBeGreaterThan(-1);
    expect(firstPos).toBeLessThan(secondPos);

    // Verify index ordering
    const entry = index.bySideTrackPath["docs/main.md"];
    expect(entry?.blocks.map((b) => b.id)).toEqual(["first", "second"]);
  });
});

describe("Aligning and cleaning regions (adding and removing markers)", () => {
  const sourceText = [
    "function main() {",
    "//#region sidetrack:first",
    "  console.log(1);",
    "//#endregion sidetrack:first",
    "  console.log(2);",
    "//#region sidetrack:second",
    "  console.log(3);",
    "//#endregion sidetrack:second",
    "}",
  ].join("\n");

  it("creates placeholder blocks when a new region is added in source code", () => {
    // Companion Markdown has only the "first" block, but source has "first" and "second"
    const markdown = [
      "<!-- sidetrack:block id=first -->",
      "## src/main.ts line 3",
      "",
      "prose first",
      "",
    ].join("\n");

    const { sidetrackMarkdown, index } = runAlign({
      sourceText,
      sidetrackMarkdown: markdown,
      blocks: [{ id: "first", anchor: "marker:first" }],
    });

    expect(sidetrackMarkdown).toContain("id=first");
    expect(sidetrackMarkdown).toContain("id=second");
    expect(sidetrackMarkdown).toContain("_(write sidetrack here)_");

    const entry = index.bySideTrackPath["docs/main.md"];
    expect(entry?.blocks.map((b) => b.id)).toEqual(["first", "second"]);
    expect(entry?.blocks.find((b) => b.id === "second")?.snippet).toContain("console.log(3)");
  });

  it("removes block sections and index entries when region markers are removed from source", () => {
    // Source code has only "first" (we pass a source text with only "first")
    const srcOnlyFirst = [
      "function main() {",
      "//#region sidetrack:first",
      "  console.log(1);",
      "//#endregion sidetrack:first",
      "}",
    ].join("\n");

    const markdown = [
      "<!-- sidetrack:block id=first -->",
      "## src/main.ts line 3",
      "",
      "prose first",
      "",
      "<!-- sidetrack:block id=second -->",
      "## src/main.ts line 7",
      "",
      "prose second",
      "",
    ].join("\n");

    const { sidetrackMarkdown, index } = runAlign({
      sourceText: srcOnlyFirst,
      sidetrackMarkdown: markdown,
      blocks: [
        { id: "first", anchor: "marker:first" },
        { id: "second", anchor: "marker:second" },
      ],
    });

    expect(sidetrackMarkdown).toContain("id=first");
    expect(sidetrackMarkdown).not.toContain("id=second");

    const entry = index.bySideTrackPath["docs/main.md"];
    expect(entry?.blocks.map((b) => b.id)).toEqual(["first"]);
  });
});

describe("Recovering source markers from snippet", () => {
  function runRecoverSnippet(args: {
    sourceText: string;
    snippetLines: string[];
    blockId?: string;
  }) {
    const block: SideTrackBlock = {
      id: args.blockId ?? "sum",
      anchor: `marker:${args.blockId ?? "sum"}`,
      snippet: buildSideTrackSnippetV1(args.snippetLines),
    };
    return recoverSourceMarkersFromSnippet({
      sourceText: args.sourceText,
      languageId: "typescript",
      block,
    });
  }

  function verifySuccessfulRecovery(src: string, snippetLines: string[], blockId = "sum") {
    const result = runRecoverSnippet({ sourceText: src, snippetLines, blockId });
    expect(result.healed).toBe(true);
    expect(result.range).toEqual({ startLine: 3, endLine: 4 });
    return result;
  }

  it("returns healed=false and unchanged sourceText when snippet is missing or empty", () => {
    const block: SideTrackBlock = { id: "greet", anchor: "marker:greet" };
    const src = "function greet() {\n  return 'hi';\n}";
    const result = recoverSourceMarkersFromSnippet({
      sourceText: src,
      languageId: "typescript",
      block,
    });
    expect(result.healed).toBe(false);
    expect(result.sourceText).toBe(src);
  });

  it("re-inserts region markers when a unique match of snippet is found", () => {
    const src = ["function sum() {", "  const x = 1;", "  return x;", "}"].join("\n");
    const result = verifySuccessfulRecovery(src, ["const x = 1;", "return x;"]);
    expect(result.sourceText).toBe(
      [
        "function sum() {",
        "  //#region sidetrack:sum",
        "  const x = 1;",
        "  return x;",
        "  //#endregion sidetrack:sum",
        "}",
      ].join("\n"),
    );
  });

  it("handles whitespace and indentation differences during snippet matching", () => {
    const src = ["function sum() {", "\tconst x = 1;", "\t\treturn x;", "}"].join("\n");
    verifySuccessfulRecovery(src, ["const x = 1;", "return x;"]);
  });

  it("returns healed=false when the snippet is not found in the source", () => {
    const src = "function sum() {\n  const x = 1;\n}";

    const result = runRecoverSnippet({
      sourceText: src,
      snippetLines: ["const x = 2;"],
      blockId: "sum",
    });

    expect(result.healed).toBe(false);
    expect(result.sourceText).toBe(src);
  });

  it("returns healed=false when snippet matches multiple locations (ambiguous match)", () => {
    const src = [
      "function first() {",
      "  console.log(1);",
      "}",
      "function second() {",
      "  console.log(1);",
      "}",
    ].join("\n");

    const result = runRecoverSnippet({
      sourceText: src,
      snippetLines: ["console.log(1);"],
      blockId: "log",
    });

    expect(result.healed).toBe(false);
  });
});

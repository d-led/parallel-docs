import { describe, expect, it } from "vitest";
import {
  convertParallelDocsSourceMarkersToLanguage,
  findParallelDocsMarkerPairs,
  leadingIndentOfLine,
} from "./region-marker-convert.js";

describe("Finding paired ParallelDocs region markers in source", () => {
  it("pairs generic // markers in order", () => {
    const src = ["// parallelDocs:start id=ab", "x", "// parallelDocs:end id=ab"].join("\n");
    expect(findParallelDocsMarkerPairs(src)).toEqual([{ id: "ab", startLine0: 0, endLine0: 2 }]);
  });

  it("pairs //#region style markers", () => {
    const src = ["//#region parallelDocs:zz", "y", "//#endregion parallelDocs:zz"].join("\n");
    expect(findParallelDocsMarkerPairs(src)).toEqual([{ id: "zz", startLine0: 0, endLine0: 2 }]);
  });

  it("pairs two blocks with different ids", () => {
    const src = [
      "// parallelDocs:start id=a",
      "1",
      "// parallelDocs:end id=a",
      "",
      "//#region parallelDocs:b",
      "2",
      "//#endregion parallelDocs:b",
    ].join("\n");
    expect(findParallelDocsMarkerPairs(src)).toEqual([
      { id: "a", startLine0: 0, endLine0: 2 },
      { id: "b", startLine0: 4, endLine0: 6 },
    ]);
  });

  it("ignores orphan end markers", () => {
    const src = ["// parallelDocs:end id=x"].join("\n");
    expect(findParallelDocsMarkerPairs(src)).toEqual([]);
  });
});

describe("Detecting leading indentation on a source line", () => {
  it("returns leading tabs and spaces only", () => {
    expect(leadingIndentOfLine("  \t// x")).toBe("  \t");
  });
});

describe("Converting ParallelDocs region markers to another language style", () => {
  it("rewrites generic markers to TypeScript #region style", () => {
    const before = [
      "// parallelDocs:start id=aa",
      "const n = 1;",
      "// parallelDocs:end id=aa",
    ].join("\n");
    const { sourceText, changed, convertedPairs } = convertParallelDocsSourceMarkersToLanguage(
      before,
      "typescript",
    );
    expect(convertedPairs).toBe(1);
    expect(changed).toBe(true);
    expect(sourceText).toBe(
      ["//#region parallelDocs:aa", "const n = 1;", "//#endregion parallelDocs:aa"].join("\n"),
    );
  });

  it("preserves indentation from the opening line", () => {
    const before = ["  // parallelDocs:start id=bb", "  x();", "  // parallelDocs:end id=bb"].join(
      "\n",
    );
    const { sourceText } = convertParallelDocsSourceMarkersToLanguage(before, "typescript");
    expect(sourceText).toBe(
      ["  //#region parallelDocs:bb", "  x();", "  //#endregion parallelDocs:bb"].join("\n"),
    );
  });

  it("converts TypeScript regions to Rust-style generic comments", () => {
    const before = ["//#region parallelDocs:cc", "fn f() {}", "//#endregion parallelDocs:cc"].join(
      "\n",
    );
    const { sourceText, convertedPairs } = convertParallelDocsSourceMarkersToLanguage(
      before,
      "rust",
    );
    expect(convertedPairs).toBe(1);
    expect(sourceText).toBe(
      ["// parallelDocs:start id=cc", "fn f() {}", "// parallelDocs:end id=cc"].join("\n"),
    );
  });

  it("does not count a replacement when the target style already matches", () => {
    const before = ["//#region parallelDocs:dd", "x", "//#endregion parallelDocs:dd"].join("\n");
    const { sourceText, changed, convertedPairs } = convertParallelDocsSourceMarkersToLanguage(
      before,
      "typescript",
    );
    expect(convertedPairs).toBe(0);
    expect(changed).toBe(false);
    expect(sourceText).toBe(before);
  });

  it("normalises CRLF to LF in the output", () => {
    const before = "// parallelDocs:start id=e\r\nbody\r\n// parallelDocs:end id=e";
    const { sourceText, changed } = convertParallelDocsSourceMarkersToLanguage(
      before,
      "typescript",
    );
    expect(changed).toBe(true);
    expect(sourceText).not.toContain("\r");
    expect(sourceText).toContain("//#region parallelDocs:e");
  });
});

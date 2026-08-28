import { describe, expect, it } from "vitest";
import {
  convertSideTrackSourceMarkersToLanguage,
  findSideTrackMarkerPairs,
  leadingIndentOfLine,
} from "./region-marker-convert.js";

describe("Finding paired SideTrack region markers in source", () => {
  it("pairs generic // markers in order", () => {
    const src = ["// sidetrack:start id=ab", "x", "// sidetrack:end id=ab"].join("\n");
    expect(findSideTrackMarkerPairs(src)).toEqual([{ id: "ab", startLine0: 0, endLine0: 2 }]);
  });

  it("pairs //#region style markers", () => {
    const src = ["//#region sidetrack:zz", "y", "//#endregion sidetrack:zz"].join("\n");
    expect(findSideTrackMarkerPairs(src)).toEqual([{ id: "zz", startLine0: 0, endLine0: 2 }]);
  });

  it("pairs two blocks with different ids", () => {
    const src = [
      "// sidetrack:start id=a",
      "1",
      "// sidetrack:end id=a",
      "",
      "//#region sidetrack:b",
      "2",
      "//#endregion sidetrack:b",
    ].join("\n");
    expect(findSideTrackMarkerPairs(src)).toEqual([
      { id: "a", startLine0: 0, endLine0: 2 },
      { id: "b", startLine0: 4, endLine0: 6 },
    ]);
  });

  it("ignores orphan end markers", () => {
    const src = ["// sidetrack:end id=x"].join("\n");
    expect(findSideTrackMarkerPairs(src)).toEqual([]);
  });
});

describe("Detecting leading indentation on a source line", () => {
  it("returns leading tabs and spaces only", () => {
    expect(leadingIndentOfLine("  \t// x")).toBe("  \t");
  });
});

describe("Converting SideTrack region markers to another language style", () => {
  it("rewrites generic markers to TypeScript #region style", () => {
    const before = ["// sidetrack:start id=aa", "const n = 1;", "// sidetrack:end id=aa"].join(
      "\n",
    );
    const { sourceText, changed, convertedPairs } = convertSideTrackSourceMarkersToLanguage(
      before,
      "typescript",
    );
    expect(convertedPairs).toBe(1);
    expect(changed).toBe(true);
    expect(sourceText).toBe(
      ["//#region sidetrack:aa", "const n = 1;", "//#endregion sidetrack:aa"].join("\n"),
    );
  });

  it("preserves indentation from the opening line", () => {
    const before = ["  // sidetrack:start id=bb", "  x();", "  // sidetrack:end id=bb"].join("\n");
    const { sourceText } = convertSideTrackSourceMarkersToLanguage(before, "typescript");
    expect(sourceText).toBe(
      ["  //#region sidetrack:bb", "  x();", "  //#endregion sidetrack:bb"].join("\n"),
    );
  });

  it("converts TypeScript regions to Rust-style generic comments", () => {
    const before = ["//#region sidetrack:cc", "fn f() {}", "//#endregion sidetrack:cc"].join("\n");
    const { sourceText, convertedPairs } = convertSideTrackSourceMarkersToLanguage(before, "rust");
    expect(convertedPairs).toBe(1);
    expect(sourceText).toBe(
      ["// sidetrack:start id=cc", "fn f() {}", "// sidetrack:end id=cc"].join("\n"),
    );
  });

  it("does not count a replacement when the target style already matches", () => {
    const before = ["//#region sidetrack:dd", "x", "//#endregion sidetrack:dd"].join("\n");
    const { sourceText, changed, convertedPairs } = convertSideTrackSourceMarkersToLanguage(
      before,
      "typescript",
    );
    expect(convertedPairs).toBe(0);
    expect(changed).toBe(false);
    expect(sourceText).toBe(before);
  });

  it("normalises CRLF to LF in the output", () => {
    const before = "// sidetrack:start id=e\r\nbody\r\n// sidetrack:end id=e";
    const { sourceText, changed } = convertSideTrackSourceMarkersToLanguage(before, "typescript");
    expect(changed).toBe(true);
    expect(sourceText).not.toContain("\r");
    expect(sourceText).toContain("//#region sidetrack:e");
  });
});

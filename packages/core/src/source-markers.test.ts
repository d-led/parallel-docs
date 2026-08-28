import { describe, expect, it } from "vitest";
import {
  sidetrackRegionInsertions,
  markerViewportHalfOpen1Based,
  parseSideTrackRegionBoundary,
  sourceLineRangeForMarkerId,
} from "./source-markers.js";

describe("Inserting SideTrack region markers into source text", () => {
  it("matches Region Marker-style //#region for TypeScript", () => {
    const { start, end } = sidetrackRegionInsertions("typescript", "abc123", "  ");
    expect(start).toBe("  //#region sidetrack:abc123\n");
    expect(end).toBe("\n  //#endregion sidetrack:abc123");
  });

  it("uses #pragma region for C++", () => {
    const { start, end } = sidetrackRegionInsertions("cpp", "x1", "");
    expect(start).toBe("#pragma region sidetrack:x1\n");
    expect(end).toBe("\n#pragma endregion sidetrack:x1");
  });

  it("uses # region for Python", () => {
    const { start, end } = sidetrackRegionInsertions("python", "ab", "    ");
    expect(start).toBe("    # region sidetrack:ab\n");
    expect(end).toBe("\n    # endregion sidetrack:ab");
  });

  it("uses generic line comments for languages without a #region convention (e.g. Rust)", () => {
    const { start, end } = sidetrackRegionInsertions("rust", "r1", "\t");
    expect(start).toBe("\t// sidetrack:start id=r1\n");
    expect(end).toBe("\n\t// sidetrack:end id=r1");
  });

  it("uses generic hash comments for shell / YAML style languages", () => {
    const { start, end } = sidetrackRegionInsertions("yaml", "y9", "");
    expect(start).toBe("# sidetrack:start id=y9\n");
    expect(end).toBe("\n# sidetrack:end id=y9");
  });

  it("uses block comments for plain CSS", () => {
    const { start, end } = sidetrackRegionInsertions("css", "c0", "  ");
    expect(start).toBe("  /* sidetrack:start id=c0 */\n");
    expect(end).toBe("\n  /* sidetrack:end id=c0 */");
  });

  it("uses HTML comment regions for Markdown (README-style)", () => {
    const { start, end } = sidetrackRegionInsertions("markdown", "readme-why", "");
    expect(start).toBe("<!-- #region sidetrack:readme-why -->\n");
    expect(end).toBe("\n<!-- #endregion sidetrack:readme-why -->");
  });
});

describe("Parsing SideTrack region boundary lines", () => {
  it("detects //#region / //#endregion with sidetrack id", () => {
    expect(parseSideTrackRegionBoundary("//#region sidetrack:ab12")).toEqual({
      kind: "start",
      id: "ab12",
    });
    expect(parseSideTrackRegionBoundary("  //#endregion sidetrack:ab12  ")).toEqual({
      kind: "end",
      id: "ab12",
    });
  });

  it("still detects legacy sidetrack:start / end", () => {
    expect(parseSideTrackRegionBoundary("// sidetrack:start id=zz99")).toEqual({
      kind: "start",
      id: "zz99",
    });
    expect(parseSideTrackRegionBoundary("# sidetrack:end id=zz99")).toEqual({
      kind: "end",
      id: "zz99",
    });
  });
});

describe("Resolving source line ranges for a marker id", () => {
  it("returns 1-based inclusive lines between region markers", () => {
    const src = [
      "//#region sidetrack:ab12",
      "line one",
      "line two",
      "//#endregion sidetrack:ab12",
    ].join("\n");
    expect(sourceLineRangeForMarkerId(src, "ab12")).toEqual({ start: 2, end: 3 });
  });

  it("supports generic // sidetrack:start markers", () => {
    const src = ["// sidetrack:start id=zz", "body", "// sidetrack:end id=zz"].join("\n");
    expect(sourceLineRangeForMarkerId(src, "zz")).toEqual({ start: 2, end: 2 });
  });

  it("supports CSS block comment markers", () => {
    const src = ["/* sidetrack:start id=bb */", "x{}", "/* sidetrack:end id=bb */"].join("\n");
    expect(sourceLineRangeForMarkerId(src, "bb")).toEqual({ start: 2, end: 2 });
  });
});

describe("Marker viewport half-open range", () => {
  it("extends one line above the start delimiter and stops before the end delimiter", () => {
    const src = ["pad", "# sidetrack:start id=aa", "[a]", "# sidetrack:end id=aa"].join("\n");
    expect(markerViewportHalfOpen1Based(src, "aa")).toEqual({ lo: 1, hiExclusive: 4 });
  });
});

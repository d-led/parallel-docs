import { describe, expect, it } from "vitest";
import {
  parallelDocsRegionInsertions,
  markerViewportHalfOpen1Based,
  parseParallelDocsRegionBoundary,
  sourceLineRangeForMarkerId,
} from "./source-markers.js";

describe("Inserting ParallelDocs region markers into source text", () => {
  it("matches Region Marker-style //#region for TypeScript", () => {
    const { start, end } = parallelDocsRegionInsertions("typescript", "abc123", "  ");
    expect(start).toBe("  //#region parallelDocs:abc123\n");
    expect(end).toBe("\n  //#endregion parallelDocs:abc123");
  });

  it("uses #pragma region for C++", () => {
    const { start, end } = parallelDocsRegionInsertions("cpp", "x1", "");
    expect(start).toBe("#pragma region parallelDocs:x1\n");
    expect(end).toBe("\n#pragma endregion parallelDocs:x1");
  });

  it("uses # region for Python", () => {
    const { start, end } = parallelDocsRegionInsertions("python", "ab", "    ");
    expect(start).toBe("    # region parallelDocs:ab\n");
    expect(end).toBe("\n    # endregion parallelDocs:ab");
  });

  it("uses generic line comments for languages without a #region convention (e.g. Rust)", () => {
    const { start, end } = parallelDocsRegionInsertions("rust", "r1", "\t");
    expect(start).toBe("\t// parallelDocs:start id=r1\n");
    expect(end).toBe("\n\t// parallelDocs:end id=r1");
  });

  it("uses generic hash comments for shell / YAML style languages", () => {
    const { start, end } = parallelDocsRegionInsertions("yaml", "y9", "");
    expect(start).toBe("# parallelDocs:start id=y9\n");
    expect(end).toBe("\n# parallelDocs:end id=y9");
  });

  it("uses block comments for plain CSS", () => {
    const { start, end } = parallelDocsRegionInsertions("css", "c0", "  ");
    expect(start).toBe("  /* parallelDocs:start id=c0 */\n");
    expect(end).toBe("\n  /* parallelDocs:end id=c0 */");
  });

  it("uses HTML comment regions for Markdown (README-style)", () => {
    const { start, end } = parallelDocsRegionInsertions("markdown", "readme-why", "");
    expect(start).toBe("<!-- #region parallelDocs:readme-why -->\n");
    expect(end).toBe("\n<!-- #endregion parallelDocs:readme-why -->");
  });
});

describe("Parsing ParallelDocs region boundary lines", () => {
  it("detects //#region / //#endregion with parallel-docs id", () => {
    expect(parseParallelDocsRegionBoundary("//#region parallelDocs:ab12")).toEqual({
      kind: "start",
      id: "ab12",
    });
    expect(parseParallelDocsRegionBoundary("  //#endregion parallelDocs:ab12  ")).toEqual({
      kind: "end",
      id: "ab12",
    });
  });

  it("still detects legacy parallelDocs:start / end", () => {
    expect(parseParallelDocsRegionBoundary("// parallelDocs:start id=zz99")).toEqual({
      kind: "start",
      id: "zz99",
    });
    expect(parseParallelDocsRegionBoundary("# parallelDocs:end id=zz99")).toEqual({
      kind: "end",
      id: "zz99",
    });
  });
});

describe("Resolving source line ranges for a marker id", () => {
  it("returns 1-based inclusive lines between region markers", () => {
    const src = [
      "//#region parallelDocs:ab12",
      "line one",
      "line two",
      "//#endregion parallelDocs:ab12",
    ].join("\n");
    expect(sourceLineRangeForMarkerId(src, "ab12")).toEqual({ start: 2, end: 3 });
  });

  it("supports generic // parallelDocs:start markers", () => {
    const src = ["// parallelDocs:start id=zz", "body", "// parallelDocs:end id=zz"].join("\n");
    expect(sourceLineRangeForMarkerId(src, "zz")).toEqual({ start: 2, end: 2 });
  });

  it("supports CSS block comment markers", () => {
    const src = ["/* parallelDocs:start id=bb */", "x{}", "/* parallelDocs:end id=bb */"].join(
      "\n",
    );
    expect(sourceLineRangeForMarkerId(src, "bb")).toEqual({ start: 2, end: 2 });
  });
});

describe("Marker viewport half-open range", () => {
  it("extends one line above the start delimiter and stops before the end delimiter", () => {
    const src = ["pad", "# parallelDocs:start id=aa", "[a]", "# parallelDocs:end id=aa"].join("\n");
    expect(markerViewportHalfOpen1Based(src, "aa")).toEqual({ lo: 1, hiExclusive: 4 });
  });
});

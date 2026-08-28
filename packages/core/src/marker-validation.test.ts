import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./model.js";
import {
  extractParallelDocsBlockIdsInMarkdownOrder,
  extractParallelDocsBlockIdsFromMarkdown,
  validateIndexMarkerSemantics,
  validateMarkerBoundariesInSource,
  validateMarkerRegionsAgainstIndexedSources,
  validateOverlappingMarkerInnerRangesInSource,
} from "./marker-validation.js";

describe("Region marker boundary validation in source files", () => {
  it("reports duplicate starts for the same id", () => {
    const src = [
      "// parallelDocs:start id=x",
      "a",
      "// parallelDocs:start id=x",
      "b",
      "// parallelDocs:end id=x",
    ].join("\n");
    const issues = validateMarkerBoundariesInSource(src, "f.ts");
    expect(issues.some((i) => i.level === "error" && i.message.includes("duplicate"))).toBe(true);
  });

  it("reports orphan end", () => {
    const issues = validateMarkerBoundariesInSource("// parallelDocs:end id=z\n", "g.ts");
    expect(issues.some((i) => i.message.includes("no matching start"))).toBe(true);
  });

  it("reports unclosed start", () => {
    const issues = validateMarkerBoundariesInSource("// parallelDocs:start id=u\n", "h.ts");
    expect(issues.some((i) => i.message.includes("no matching end"))).toBe(true);
  });

  it("passes for a balanced pair", () => {
    const src = ["//#region parallelDocs:ok", "1", "//#endregion parallelDocs:ok"].join("\n");
    expect(validateMarkerBoundariesInSource(src, "t.ts")).toEqual([]);
  });

  it("errors when two regions’ inner line ranges overlap (including nested regions)", () => {
    const src = [
      "//#region parallelDocs:outer",
      "top",
      "//#region parallelDocs:inner",
      "nest",
      "//#endregion parallelDocs:inner",
      "bot",
      "//#endregion parallelDocs:outer",
    ].join("\n");
    const issues = validateMarkerBoundariesInSource(src, "overlap.ts");
    expect(issues.some((i) => i.level === "error" && i.message.includes("overlap"))).toBe(true);
  });

  it("does not treat adjacent inner ranges as overlapping", () => {
    const src = [
      "//#region parallelDocs:a",
      "a",
      "//#endregion parallelDocs:a",
      "//#region parallelDocs:b",
      "b",
      "//#endregion parallelDocs:b",
    ].join("\n");
    expect(validateOverlappingMarkerInnerRangesInSource(src, "adjacent.ts")).toEqual([]);
  });
});

describe("extractParallelDocsBlockIdsFromMarkdown", () => {
  it("collects ids from block marker lines", () => {
    const md =
      "<!-- parallelDocs:block id=intro -->\n# Hi\n\n<!-- parallelDocs:block id=tail -->\nBye\n";
    expect([...extractParallelDocsBlockIdsFromMarkdown(md)].sort()).toEqual(["intro", "tail"]);
  });

  it("keeps block ids in markdown appearance order", () => {
    const md =
      "<!-- parallelDocs:block id=first -->\nA\n\n<!-- parallelDocs:block id=second -->\nB\n";
    expect(extractParallelDocsBlockIdsInMarkdownOrder(md)).toEqual(["first", "second"]);
  });
});

describe("Index marker semantics versus on-disk source", () => {
  it("errors when the same source marker id is claimed by different block ids", () => {
    const cp1 = ".parallel-docs/source/a.md";
    const cp2 = ".parallel-docs/source/b.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [cp1]: {
          sourcePath: "src/x.ts",
          parallelDocsPath: cp1,
          blocks: [{ id: "m1", anchor: "marker:m1", markerId: "m1" }],
        },
        [cp2]: {
          sourcePath: "src/x.ts",
          parallelDocsPath: cp2,
          blocks: [{ id: "m2", anchor: "marker:m1", markerId: "m1" }],
        },
      },
    };
    const issues = validateIndexMarkerSemantics(index);
    expect(
      issues.some((i) => i.level === "error" && i.message.includes("different block ids")),
    ).toBe(true);
  });

  it("warns when the same marker id is used in different source files", () => {
    const cp1 = ".parallel-docs/source/a.md";
    const cp2 = ".parallel-docs/source/b.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [cp1]: {
          sourcePath: "src/a.ts",
          parallelDocsPath: cp1,
          blocks: [{ id: "dup", anchor: "marker:dup", markerId: "dup" }],
        },
        [cp2]: {
          sourcePath: "src/b.ts",
          parallelDocsPath: cp2,
          blocks: [{ id: "dup", anchor: "marker:dup", markerId: "dup" }],
        },
      },
    };
    const issues = validateIndexMarkerSemantics(index);
    expect(issues.some((i) => i.level === "warn" && i.message.includes("reused across"))).toBe(
      true,
    );
  });
});

const cr = ".parallel-docs/source/x.md";
const indexMarkerX1 = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  byParallelDocsPath: {
    [cr]: {
      sourcePath: "src/p.ts",
      parallelDocsPath: cr,
      blocks: [{ id: "x1", anchor: "marker:x1", markerId: "x1" }],
    },
  },
};
const srcMarkerX1 = ["//#region parallelDocs:x1", "ok", "//#endregion parallelDocs:x1"].join("\n");

describe("Marker anchors versus regions in indexed primaries", () => {
  it("errors when a marker anchor does not resolve in the primary", () => {
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [cr]: {
          sourcePath: "src/p.ts",
          parallelDocsPath: cr,
          blocks: [{ id: "missing", anchor: "marker:missing", markerId: "missing" }],
        },
      },
    };
    const src = "no markers here\n";
    const issues = validateMarkerRegionsAgainstIndexedSources(
      index,
      new Map([["src/p.ts", src]]),
      new Map([["src/p.ts", new Set<string>()]]),
    );
    expect(
      issues.some((i) => i.level === "error" && i.message.includes("no resolvable paired")),
    ).toBe(true);
  });

  it("warns when the primary has a paired region not claimed by any block", () => {
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [cr]: {
          sourcePath: "src/p.ts",
          parallelDocsPath: cr,
          blocks: [{ id: "only", anchor: "marker:only", markerId: "only" }],
        },
      },
    };
    const src = [
      "//#region parallelDocs:only",
      "a",
      "//#endregion parallelDocs:only",
      "//#region parallelDocs:orphan",
      "b",
      "//#endregion parallelDocs:orphan",
    ].join("\n");
    const issues = validateMarkerRegionsAgainstIndexedSources(
      index,
      new Map([["src/p.ts", src]]),
      new Map([["src/p.ts", new Set(["only"])]]),
    );
    expect(
      issues.some(
        (i) =>
          i.level === "warn" &&
          i.message.includes("not referenced") &&
          i.message.includes("<!-- parallelDocs:block id=orphan -->"),
      ),
    ).toBe(true);
  });

  it("returns no issues when every region is claimed and resolves", () => {
    expect(
      validateMarkerRegionsAgainstIndexedSources(
        indexMarkerX1,
        new Map([["src/p.ts", srcMarkerX1]]),
        new Map([["src/p.ts", new Set(["x1"])]]),
      ),
    ).toEqual([]);
  });

  it("warns when markdown omits a block marker but the index claims the marker", () => {
    const issues = validateMarkerRegionsAgainstIndexedSources(
      indexMarkerX1,
      new Map([["src/p.ts", srcMarkerX1]]),
      new Map([["src/p.ts", new Set<string>()]]),
    );
    expect(
      issues.some(
        (i) =>
          i.level === "warn" &&
          i.message.includes("not referenced") &&
          i.message.includes("indexed block uses anchor marker:x1"),
      ),
    ).toBe(true);
  });
});

describe("Companion markdown ordering versus source region order", () => {
  it("warns when companion markdown block sequence is out of source region order", () => {
    const source = [
      "//#region parallelDocs:a",
      "one",
      "//#endregion parallelDocs:a",
      "//#region parallelDocs:b",
      "two",
      "//#endregion parallelDocs:b",
    ].join("\n");
    const issues = validateMarkerRegionsAgainstIndexedSources(
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        byParallelDocsPath: {
          [cr]: {
            sourcePath: "src/p.ts",
            parallelDocsPath: cr,
            blocks: [
              { id: "a", anchor: "marker:a", markerId: "a" },
              { id: "b", anchor: "marker:b", markerId: "b" },
            ],
          },
        },
      },
      new Map([["src/p.ts", source]]),
      new Map([["src/p.ts", new Set(["a", "b"])]]),
      new Map([[cr, ["b", "a"]]]),
    );

    expect(
      issues.some(
        (i) =>
          i.level === "warn" &&
          i.message.includes("orders their regions the other way around") &&
          i.message.includes("Start new block from selection"),
      ),
    ).toBe(true);
  });

  it("still warns on out-of-order companion blocks when the earlier source region is start-only", () => {
    const source = [
      "<!-- #region parallelDocs:running -->",
      "run",
      "<!-- #region parallelDocs:unit -->",
      "unit",
      "<!-- #endregion parallelDocs:unit -->",
    ].join("\n");
    const issues = validateMarkerRegionsAgainstIndexedSources(
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        byParallelDocsPath: {
          [cr]: {
            sourcePath: "src/p.md",
            parallelDocsPath: cr,
            blocks: [
              { id: "running", anchor: "marker:running", markerId: "running" },
              { id: "unit", anchor: "marker:unit", markerId: "unit" },
            ],
          },
        },
      },
      new Map([["src/p.md", source]]),
      new Map([["src/p.md", new Set(["running", "unit"])]]),
      new Map([[cr, ["unit", "running"]]]),
    );

    expect(
      issues.some(
        (i) =>
          i.level === "warn" && i.message.includes("orders their regions the other way around"),
      ),
    ).toBe(true);
  });
});

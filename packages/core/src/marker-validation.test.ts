import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./model.js";
import {
  extractSideTrackBlockIdsInMarkdownOrder,
  extractSideTrackBlockIdsFromMarkdown,
  validateIndexMarkerSemantics,
  validateMarkerBoundariesInSource,
  validateMarkerRegionsAgainstIndexedSources,
  validateOverlappingMarkerInnerRangesInSource,
} from "./marker-validation.js";

describe("Region marker boundary validation in source files", () => {
  it("reports duplicate starts for the same id", () => {
    const src = [
      "// sidetrack:start id=x",
      "a",
      "// sidetrack:start id=x",
      "b",
      "// sidetrack:end id=x",
    ].join("\n");
    const issues = validateMarkerBoundariesInSource(src, "f.ts");
    expect(issues.some((i) => i.level === "error" && i.message.includes("duplicate"))).toBe(true);
  });

  it("reports orphan end", () => {
    const issues = validateMarkerBoundariesInSource("// sidetrack:end id=z\n", "g.ts");
    expect(issues.some((i) => i.message.includes("no matching start"))).toBe(true);
  });

  it("reports unclosed start", () => {
    const issues = validateMarkerBoundariesInSource("// sidetrack:start id=u\n", "h.ts");
    expect(issues.some((i) => i.message.includes("no matching end"))).toBe(true);
  });

  it("passes for a balanced pair", () => {
    const src = ["//#region sidetrack:ok", "1", "//#endregion sidetrack:ok"].join("\n");
    expect(validateMarkerBoundariesInSource(src, "t.ts")).toEqual([]);
  });

  it("errors when two regions’ inner line ranges overlap (including nested regions)", () => {
    const src = [
      "//#region sidetrack:outer",
      "top",
      "//#region sidetrack:inner",
      "nest",
      "//#endregion sidetrack:inner",
      "bot",
      "//#endregion sidetrack:outer",
    ].join("\n");
    const issues = validateMarkerBoundariesInSource(src, "overlap.ts");
    expect(issues.some((i) => i.level === "error" && i.message.includes("overlap"))).toBe(true);
  });

  it("does not treat adjacent inner ranges as overlapping", () => {
    const src = [
      "//#region sidetrack:a",
      "a",
      "//#endregion sidetrack:a",
      "//#region sidetrack:b",
      "b",
      "//#endregion sidetrack:b",
    ].join("\n");
    expect(validateOverlappingMarkerInnerRangesInSource(src, "adjacent.ts")).toEqual([]);
  });
});

describe("extractSideTrackBlockIdsFromMarkdown", () => {
  it("collects ids from block marker lines", () => {
    const md = "<!-- sidetrack:block id=intro -->\n# Hi\n\n<!-- sidetrack:block id=tail -->\nBye\n";
    expect([...extractSideTrackBlockIdsFromMarkdown(md)].sort()).toEqual(["intro", "tail"]);
  });

  it("keeps block ids in markdown appearance order", () => {
    const md = "<!-- sidetrack:block id=first -->\nA\n\n<!-- sidetrack:block id=second -->\nB\n";
    expect(extractSideTrackBlockIdsInMarkdownOrder(md)).toEqual(["first", "second"]);
  });
});

describe("Index marker semantics versus on-disk source", () => {
  it("errors when the same source marker id is claimed by different block ids", () => {
    const cp1 = ".sidetrack/source/a.md";
    const cp2 = ".sidetrack/source/b.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [cp1]: {
          sourcePath: "src/x.ts",
          sidetrackPath: cp1,
          blocks: [{ id: "m1", anchor: "marker:m1", markerId: "m1" }],
        },
        [cp2]: {
          sourcePath: "src/x.ts",
          sidetrackPath: cp2,
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
    const cp1 = ".sidetrack/source/a.md";
    const cp2 = ".sidetrack/source/b.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [cp1]: {
          sourcePath: "src/a.ts",
          sidetrackPath: cp1,
          blocks: [{ id: "dup", anchor: "marker:dup", markerId: "dup" }],
        },
        [cp2]: {
          sourcePath: "src/b.ts",
          sidetrackPath: cp2,
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

const cr = ".sidetrack/source/x.md";
const indexMarkerX1 = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  bySideTrackPath: {
    [cr]: {
      sourcePath: "src/p.ts",
      sidetrackPath: cr,
      blocks: [{ id: "x1", anchor: "marker:x1", markerId: "x1" }],
    },
  },
};
const srcMarkerX1 = ["//#region sidetrack:x1", "ok", "//#endregion sidetrack:x1"].join("\n");

describe("Marker anchors versus regions in indexed primaries", () => {
  it("errors when a marker anchor does not resolve in the primary", () => {
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [cr]: {
          sourcePath: "src/p.ts",
          sidetrackPath: cr,
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
      bySideTrackPath: {
        [cr]: {
          sourcePath: "src/p.ts",
          sidetrackPath: cr,
          blocks: [{ id: "only", anchor: "marker:only", markerId: "only" }],
        },
      },
    };
    const src = [
      "//#region sidetrack:only",
      "a",
      "//#endregion sidetrack:only",
      "//#region sidetrack:orphan",
      "b",
      "//#endregion sidetrack:orphan",
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
          i.message.includes("<!-- sidetrack:block id=orphan -->"),
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
      "//#region sidetrack:a",
      "one",
      "//#endregion sidetrack:a",
      "//#region sidetrack:b",
      "two",
      "//#endregion sidetrack:b",
    ].join("\n");
    const issues = validateMarkerRegionsAgainstIndexedSources(
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        bySideTrackPath: {
          [cr]: {
            sourcePath: "src/p.ts",
            sidetrackPath: cr,
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
      "<!-- #region sidetrack:running -->",
      "run",
      "<!-- #region sidetrack:unit -->",
      "unit",
      "<!-- #endregion sidetrack:unit -->",
    ].join("\n");
    const issues = validateMarkerRegionsAgainstIndexedSources(
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        bySideTrackPath: {
          [cr]: {
            sourcePath: "src/p.md",
            sidetrackPath: cr,
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

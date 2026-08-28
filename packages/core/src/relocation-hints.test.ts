import { describe, expect, it } from "vitest";
import { buildSideTrackSnippetV1 } from "./block-snippet.js";
import { CURRENT_SCHEMA_VERSION, type SideTrackIndex } from "./model.js";
import { relocationHintMessages } from "./relocation-hints.js";

function idx(by: SideTrackIndex["bySideTrackPath"]): SideTrackIndex {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, bySideTrackPath: by };
}

describe("Relocation guidance when a primary file is missing — renames and markers", () => {
  it("should name the Git rename target and suggest sync-moved-paths when the index still references the old path", () => {
    const index = idx({
      ".sidetrack/source/src/old.ts.md": {
        sourcePath: "src/old.ts",
        sidetrackPath: ".sidetrack/source/src/old.ts.md",
        blocks: [],
      },
    });
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/old.ts"]),
      gitRenames: [{ from: "src/old.ts", to: "src/new.ts" }],
      indexedSourceTextsByPath: new Map([["src/new.ts", "export const x = 1;\n"]]),
    });
    expect(hints.some((h) => h.includes('rename to "src/new.ts"'))).toBe(true);
    expect(hints.some((h) => h.includes("sidetrack sync-moved-paths"))).toBe(true);
  });

  it("should point at another indexed file when that file alone carries the marker id", () => {
    const index = idx({
      ".sidetrack/source/src/old.ts.md": {
        sourcePath: "src/old.ts",
        sidetrackPath: ".sidetrack/source/src/old.ts.md",
        blocks: [{ id: "b1", anchor: "marker:auth" }],
      },
    });
    const other = `//#region sidetrack:auth\n// body\n//#endregion sidetrack:auth\n`;
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/old.ts"]),
      indexedSourceTextsByPath: new Map([["src/features/auth.ts", other]]),
    });
    expect(hints.some((h) => h.includes('marker id "auth"'))).toBe(true);
    expect(hints.some((h) => h.includes("src/features/auth.ts"))).toBe(true);
  });

  it("should call the marker match ambiguous when several indexed files share the same id", () => {
    const index = idx({
      ".sidetrack/source/src/old.ts.md": {
        sourcePath: "src/old.ts",
        sidetrackPath: ".sidetrack/source/src/old.ts.md",
        blocks: [{ id: "b1", anchor: "marker:dup" }],
      },
    });
    const region = `//#region sidetrack:dup\n// x\n//#endregion sidetrack:dup\n`;
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/old.ts"]),
      indexedSourceTextsByPath: new Map([
        ["src/a.ts", region],
        ["src/b.ts", region],
      ]),
    });
    expect(hints.some((h) => h.includes("several indexed sources"))).toBe(true);
    expect(hints.some((h) => h.includes("src/a.ts") && h.includes("src/b.ts"))).toBe(true);
  });
});

describe("Relocation guidance when a primary file is missing — snippets and fallbacks", () => {
  it("should name the unique file that still contains a stored line-snippet when the primary is gone", () => {
    const snippet = buildSideTrackSnippetV1(["function relocatedHandler() {", "  return 42;", "}"]);
    const index = idx({
      ".sidetrack/source/src/old.ts.md": {
        sourcePath: "src/old.ts",
        sidetrackPath: ".sidetrack/source/src/old.ts.md",
        blocks: [{ id: "intro", anchor: "lines:1-3", snippet }],
      },
    });
    const relocated = `// top\nfunction relocatedHandler() {\nreturn 42;\n}\n`;
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/old.ts"]),
      indexedSourceTextsByPath: new Map([["src/handlers/new.ts", relocated]]),
    });
    expect(hints.some((h) => h.includes('block "intro"'))).toBe(true);
    expect(hints.some((h) => h.includes("src/handlers/new.ts"))).toBe(true);
  });

  it("should explain that symbol anchors are not auto-resolved across files", () => {
    const index = idx({
      ".sidetrack/source/src/gone.ts.md": {
        sourcePath: "src/gone.ts",
        sidetrackPath: ".sidetrack/source/src/gone.ts.md",
        blocks: [{ id: "s1", anchor: "symbol:ImportantType" }],
      },
    });
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/gone.ts"]),
      indexedSourceTextsByPath: new Map(),
    });
    expect(hints.some((h) => h.includes("symbol: anchors"))).toBe(true);
    expect(hints.some((h) => h.includes("does not resolve symbols across files"))).toBe(true);
  });

  it("should steer the user toward stale index cleanup or fixing sourcePath when no rename or heuristic applies", () => {
    const index = idx({
      ".sidetrack/source/src/missing.ts.md": {
        sourcePath: "src/missing.ts",
        sidetrackPath: ".sidetrack/source/src/missing.ts.md",
        blocks: [{ id: "onlyLines", anchor: "lines:1-2" }],
      },
    });
    const hints = relocationHintMessages({
      index,
      missingSourcePathsNorm: new Set(["src/missing.ts"]),
      gitRenames: [],
      indexedSourceTextsByPath: new Map(),
    });
    expect(hints.some((h) => h.includes("Remove stale index rows"))).toBe(true);
  });
});

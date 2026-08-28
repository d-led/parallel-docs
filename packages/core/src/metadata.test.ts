import { describe, expect, it } from "vitest";
import { assertValidIndex } from "./metadata.js";
import { CURRENT_SCHEMA_VERSION } from "./model.js";

const cp = ".sidetrack/source/src/a.ts.md";

function indexWithBlock(block: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bySideTrackPath: {
      [cp]: {
        sourcePath: "src/a.ts",
        sidetrackPath: cp,
        blocks: [block],
      },
    },
  };
}

describe("Index JSON shape validation", () => {
  it("accepts a minimal valid index", () => {
    const idx = assertValidIndex(indexWithBlock({ id: "b1", anchor: "lines:1-2" }));
    expect(idx.bySideTrackPath[cp]?.blocks[0]?.id).toBe("b1");
  });

  it("accepts schemaVersion as an integer string and canonicalizes to a number", () => {
    const base = indexWithBlock({ id: "b1", anchor: "lines:1-2" });
    const idx = assertValidIndex({
      ...base,
      schemaVersion: String(CURRENT_SCHEMA_VERSION),
    });
    expect(idx.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("rejects invalid shapes", () => {
    expect(() => assertValidIndex(null)).toThrow();
    expect(() => assertValidIndex({ schemaVersion: 999, bySideTrackPath: {} })).toThrow();
  });

  it("rejects when index key does not match entry.sidetrackPath", () => {
    expect(() =>
      assertValidIndex({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        bySideTrackPath: {
          [cp]: {
            sourcePath: "src/a.ts",
            sidetrackPath: ".sidetrack/source/wrong.md",
            blocks: [],
          },
        },
      }),
    ).toThrow(/index key must equal entry\.sidetrackPath/);
  });

  it("accepts an optional snippet string and markerId on a block when id matches the marker anchor", () => {
    expect(() =>
      assertValidIndex(
        indexWithBlock({
          id: "b1",
          anchor: "marker:b1",
          markerId: "b1",
          snippet: "sidetrack-snippet/v1\n x",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects marker anchor when block id does not match", () => {
    expect(() =>
      assertValidIndex(
        indexWithBlock({
          id: "wrong",
          anchor: "marker:b1",
          markerId: "b1",
        }),
      ),
    ).toThrow(/must match marker anchor id/);
  });

  it("rejects legacy fingerprint objects", () => {
    expect(() =>
      assertValidIndex(
        indexWithBlock({
          id: "b1",
          anchor: "lines:1-1",
          fingerprint: { startLine: "x", endLine: "x", lineCount: 1 },
        }),
      ),
    ).toThrow(/fingerprint is no longer supported/);
  });
});

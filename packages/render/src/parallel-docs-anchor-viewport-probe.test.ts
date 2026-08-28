import { describe, expect, it } from "vitest";

import { maxParallelDocsAnchorLine0AtOrAboveViewportY } from "./parallel-docs-anchor-viewport-probe.js";

describe("maxParallelDocsAnchorLine0AtOrAboveViewportY", () => {
  it("keeps the deepest block whose anchor is still at or above the probe, even if a later anchor is below", () => {
    const readings = [
      { line0: 2, top: -400 },
      { line0: 12, top: 155 },
      { line0: 20, top: 900 },
    ];
    expect(maxParallelDocsAnchorLine0AtOrAboveViewportY(readings, 160)).toBe(12);
  });

  it("does not require DOM order to match increasing top", () => {
    const readings = [
      { line0: 20, top: 50 },
      { line0: 10, top: 120 },
    ];
    expect(maxParallelDocsAnchorLine0AtOrAboveViewportY(readings, 200)).toBe(20);
  });

  it("returns null when the probe sits above every anchor (no block owns that viewport band)", () => {
    const readings = [
      { line0: 5, top: 300 },
      { line0: 12, top: 400 },
    ];
    expect(maxParallelDocsAnchorLine0AtOrAboveViewportY(readings, 200)).toBe(null);
  });

  it("returns null for an empty reading list", () => {
    expect(maxParallelDocsAnchorLine0AtOrAboveViewportY([], 100)).toBe(null);
  });

  it("returns 0 when line 0 is a real qualifying anchor", () => {
    expect(maxParallelDocsAnchorLine0AtOrAboveViewportY([{ line0: 0, top: 80 }], 120)).toBe(0);
  });
});

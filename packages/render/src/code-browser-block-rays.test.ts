import type { BlockScrollLink } from "@sidetrack/core";
import { describe, expect, it } from "vitest";

import {
  activeBlockIdForSideTrackLine0,
  activeBlockIdForViewport,
  clampViewportYToGutterLocal,
  codeLineDomIndex0,
  cubicBezierAcrossGutterD,
  dedupeBlockScrollLinksById,
  gutterRayBezierPaths,
  nextBlockLinkInSideTrackOrder,
  splitCubicAtT,
  sortBlockLinksBySideTrackLine,
  sortBlockLinksBySource,
} from "./code-browser-block-rays.js";

function scrollLink(
  id: string,
  sidetrackLine: number,
  sourceStart: number,
  sourceEnd: number,
): BlockScrollLink {
  return {
    id,
    sidetrackLine,
    sourceStart,
    sourceEnd,
    markerViewportHalfOpen1Based: { lo: sourceStart, hiExclusive: sourceEnd + 1 },
  };
}

describe("clampViewportYToGutterLocal", () => {
  it("maps viewport Y into gutter-local space when inside the band", () => {
    expect(clampViewportYToGutterLocal(110, 100, 400, 5)).toEqual({ y: 10, clipped: "none" });
  });

  it("clamps to the top band when the anchor is above the viewport", () => {
    expect(clampViewportYToGutterLocal(50, 100, 400, 5)).toEqual({ y: 5, clipped: "above" });
  });

  it("clamps to the bottom band when the anchor is below the viewport", () => {
    expect(clampViewportYToGutterLocal(600, 100, 400, 5)).toEqual({ y: 395, clipped: "below" });
  });
});

describe("cubicBezierAcrossGutterD", () => {
  it("emits a cubic path across the gutter", () => {
    const d = cubicBezierAcrossGutterD(0, 10, 8, 40);
    expect(d).toMatch(/^M 0\.00 10\.00 C/);
    expect(d).toContain("8.00 40.00");
  });

  it("lengthens handles at clipped ends so the tangent stays horizontal along the viewport edge", () => {
    const unclipped = cubicBezierAcrossGutterD(0, 2, 10, 20);
    const clippedStart = cubicBezierAcrossGutterD(0, 2, 10, 20, {
      tension: 0.38,
      clipStart: "above",
      clipEnd: "none",
    });
    const c1Un = /C ([\d.]+) 2\.00/.exec(unclipped)?.[1];
    const c1Cl = /C ([\d.]+) 2\.00/.exec(clippedStart)?.[1];
    expect(c1Un).toBeDefined();
    expect(c1Cl).toBeDefined();
    expect(Number(c1Cl)).toBeGreaterThan(Number(c1Un));
  });
});

describe("gutterRayBezierPaths", () => {
  it("returns a single solid path when nothing is clipped", () => {
    const out = gutterRayBezierPaths(0, 10, 8, 40);
    expect(out.dotted).toBeUndefined();
    expect(out.solid).toMatch(/^M 0\.00 10\.00 C/);
    expect(out.solid).toContain("8.00 40.00");
  });

  it("adds a dotted Bézier tail when an endpoint is clipped", () => {
    const out = gutterRayBezierPaths(0, 2, 10, 20, { tension: 0.38, clipStart: "above" });
    expect(out.dotted).toBeDefined();
    expect(out.dotted).toMatch(/^M [\d.]+ [\d.]+ C/);
    expect(out.solid).toMatch(/^M 0\.00 2\.00 C/);
  });
});

describe("splitCubicAtT", () => {
  it("joins the two segments at the split point", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 3, y: 0 };
    const p2 = { x: 7, y: 10 };
    const p3 = { x: 10, y: 10 };
    const [left, right] = splitCubicAtT(p0, p1, p2, p3, 0.5);
    expect(left[3]).toEqual(right[0]);
  });
});

describe("sortBlockLinksBySource", () => {
  it("orders by sourceStart", () => {
    const out = sortBlockLinksBySource([scrollLink("b2", 5, 20, 25), scrollLink("b1", 0, 1, 5)]);
    expect(out.map((x) => x.id)).toEqual(["b1", "b2"]);
  });
});

describe("dedupeBlockScrollLinksById", () => {
  it("keeps the earliest source span when the same id appears twice", () => {
    const out = dedupeBlockScrollLinksById([scrollLink("x", 0, 10, 12), scrollLink("x", 0, 1, 3)]);
    expect(out).toEqual([scrollLink("x", 0, 1, 3)]);
  });
});

describe("nextBlockLinkInSideTrackOrder", () => {
  it("uses companion line order, not source order", () => {
    const a = scrollLink("static", 100, 1, 10);
    const b = scrollLink("angles", 50, 20, 30);
    const both = [a, b];
    expect(sortBlockLinksBySideTrackLine(both).map((x) => x.id)).toEqual(["angles", "static"]);
    expect(nextBlockLinkInSideTrackOrder(both, b)?.id).toBe("static");
    expect(nextBlockLinkInSideTrackOrder(both, a)).toBeUndefined();
  });
});

describe("activeBlockIdForViewport", () => {
  const links = [scrollLink("b1", 0, 1, 5), scrollLink("b2", 5, 20, 25)];

  it("returns the block id that contains the top source line", () => {
    expect(activeBlockIdForViewport(links, 3)).toBe("b1");
    expect(activeBlockIdForViewport(links, 22)).toBe("b2");
  });

  it("returns null in true source gaps so gutter emphasis does not pretend a block owns the viewport", () => {
    expect(activeBlockIdForViewport(links, 10)).toBe(null);
  });
});

describe("activeBlockIdForSideTrackLine0", () => {
  const links = [scrollLink("b1", 2, 1, 5), scrollLink("b2", 12, 20, 25)];

  it("returns the block whose marker is at or above the probed companion line", () => {
    expect(activeBlockIdForSideTrackLine0(links, 2)).toBe("b1");
    expect(activeBlockIdForSideTrackLine0(links, 11)).toBe("b1");
    expect(activeBlockIdForSideTrackLine0(links, 12)).toBe("b2");
    expect(activeBlockIdForSideTrackLine0(links, 99)).toBe("b2");
  });

  it("uses markdown order, not source line order, when ids are inverted", () => {
    const inverted = [scrollLink("lateInFile", 0, 100, 110), scrollLink("earlyInFile", 8, 1, 20)];
    expect(activeBlockIdForSideTrackLine0(inverted, 0)).toBe("lateInFile");
    expect(activeBlockIdForSideTrackLine0(inverted, 8)).toBe("earlyInFile");
  });
});

describe("codeLineDomIndex0", () => {
  it("converts 1-based source lines to 0-based DOM line ids", () => {
    expect(codeLineDomIndex0(1)).toBe(0);
    expect(codeLineDomIndex0(5)).toBe(4);
  });
});

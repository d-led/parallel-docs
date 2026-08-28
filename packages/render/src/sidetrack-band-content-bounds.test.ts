/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import {
  sidetrackGutterDocBandBottomViewport,
  maxRenderableSideTrackContentBottomViewport,
  pageBreakHostsBetweenAnchors,
} from "./code-browser-block-rays.js";

function pxBlock(doc: Document, heightPx: number, text: string, className?: string): HTMLElement {
  const el = doc.createElement("div");
  el.textContent = text;
  el.style.height = `${String(heightPx)}px`;
  el.style.width = "200px";
  el.style.fontSize = "16px";
  el.style.lineHeight = "1";
  if (className) el.className = className;
  return el;
}

function stubRect(el: HTMLElement, top: number, height: number, width = 200): void {
  const bottom = top + height;
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: top,
        top,
        bottom,
        left: 0,
        right: width,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

describe("pageBreakHostsBetweenAnchors", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("lists page breaks only between the block anchor and the next block anchor", () => {
    const scroll = document.createElement("div");
    const b1 = document.createElement("div");
    b1.id = "sidetrack-block-a";
    const pb = document.createElement("div");
    pb.className = "sidetrack-page-break";
    pb.setAttribute("data-sidetrack-page-break", "true");
    const b2 = document.createElement("div");
    b2.id = "sidetrack-block-b";
    const outerPb = document.createElement("div");
    outerPb.className = "sidetrack-page-break";
    outerPb.setAttribute("data-sidetrack-page-break", "true");
    scroll.append(b1, pb, b2, outerPb);
    document.body.append(scroll);

    const found = pageBreakHostsBetweenAnchors(scroll, b1, b2);
    expect(found).toEqual([pb]);
  });

  it("returns all page breaks after the anchor when the upper bound is null", () => {
    const scroll = document.createElement("div");
    const b1 = document.createElement("div");
    b1.id = "sidetrack-block-a";
    const pb0 = document.createElement("div");
    pb0.className = "sidetrack-page-break";
    pb0.setAttribute("data-sidetrack-page-break", "true");
    const pb1 = document.createElement("div");
    pb1.className = "sidetrack-page-break";
    pb1.setAttribute("data-sidetrack-page-break", "true");
    scroll.append(b1, pb0, pb1);
    document.body.append(scroll);

    expect(pageBreakHostsBetweenAnchors(scroll, b1, null)).toEqual([pb0, pb1]);
  });
});

describe("maxRenderableSideTrackContentBottomViewport", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("ignores tall page-break boxes when bounding sidetrack above the next block anchor", () => {
    const scroll = document.createElement("div");
    scroll.style.position = "relative";

    const b1 = document.createElement("div");
    b1.id = "sidetrack-block-x";

    const prose = pxBlock(document, 40, "Hello sidetrack");
    const pb = document.createElement("div");
    pb.className = "sidetrack-page-break";
    pb.setAttribute("data-sidetrack-page-break", "true");
    pb.style.minHeight = "400px";
    pb.style.width = "100px";

    const b2 = document.createElement("div");
    b2.id = "sidetrack-block-y";

    scroll.append(b1, prose, pb, b2);
    document.body.append(scroll);

    stubRect(b1, 0, 2, 8);
    stubRect(prose, 10, 40);
    stubRect(pb, 50, 400, 100);
    stubRect(b2, 1000, 2, 8);

    const bottom = maxRenderableSideTrackContentBottomViewport(scroll, b1, b2);
    const proseBottom = prose.getBoundingClientRect().bottom;
    const pageBreakTop = pb.getBoundingClientRect().top;

    expect(bottom).toBeLessThanOrEqual(proseBottom + 6);
    expect(bottom).toBeLessThan(pageBreakTop + 50);
  });

  it("includes sidetrack that appears after an internal page break before the next block", () => {
    const scroll = document.createElement("div");
    scroll.style.position = "relative";

    const b1 = document.createElement("div");
    b1.id = "sidetrack-block-x";
    const p1 = pxBlock(document, 30, "Page one");
    const pb = document.createElement("div");
    pb.className = "sidetrack-page-break";
    pb.setAttribute("data-sidetrack-page-break", "true");
    pb.style.minHeight = "120px";
    pb.style.width = "80px";
    const p2 = pxBlock(document, 35, "Page two");
    const b2 = document.createElement("div");
    b2.id = "sidetrack-block-y";

    scroll.append(b1, p1, pb, p2, b2);
    document.body.append(scroll);

    stubRect(b1, 0, 2, 8);
    stubRect(p1, 5, 30);
    stubRect(pb, 40, 120, 80);
    stubRect(p2, 200, 35);
    stubRect(b2, 900, 2, 8);

    const bottom = maxRenderableSideTrackContentBottomViewport(scroll, b1, b2);
    const p2Bottom = p2.getBoundingClientRect().bottom;

    expect(bottom).toBeGreaterThanOrEqual(p2Bottom - 4);
    expect(bottom).toBeLessThan(b2.getBoundingClientRect().top);
  });
});

describe("sidetrackGutterDocBandBottomViewport", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("stops the gutter doc band at the first page break before the next block (no false tie to interstitial prose)", () => {
    const scroll = document.createElement("div");
    scroll.style.position = "relative";

    const b1 = document.createElement("div");
    b1.id = "sidetrack-block-a";
    const owned = pxBlock(document, 24, "Short block-owned copy");
    const pb = document.createElement("div");
    pb.className = "sidetrack-page-break";
    pb.setAttribute("data-sidetrack-page-break", "true");
    pb.style.minHeight = "200px";
    pb.style.width = "80px";
    const interstitial = pxBlock(document, 400, "Try scroll sync — not the same index block");
    const b2 = document.createElement("div");
    b2.id = "sidetrack-block-b";

    scroll.append(b1, owned, pb, interstitial, b2);
    document.body.append(scroll);

    stubRect(b1, 0, 2, 8);
    stubRect(owned, 4, 24);
    stubRect(pb, 30, 200, 80);
    stubRect(interstitial, 240, 400);
    stubRect(b2, 2000, 2, 8);

    const bottom = sidetrackGutterDocBandBottomViewport(scroll, b1, b2);
    const ownedBottom = owned.getBoundingClientRect().bottom;
    const pbTop = pb.getBoundingClientRect().top;

    expect(bottom).toBeLessThanOrEqual(pbTop + 4);
    expect(bottom).toBeLessThan(interstitial.getBoundingClientRect().top);
    expect(bottom).toBeGreaterThanOrEqual(ownedBottom - 2);
  });
});

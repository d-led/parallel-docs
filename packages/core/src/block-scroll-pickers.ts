/** One block as needed for scroll correlation (0-based parallel-docs line, 1-based source range). */
export type BlockScrollLink = {
  /** Same id as `<!-- parallelDocs:block id=… -->` and `index.json` blocks[]. */
  id: string;
  parallelDocsLine: number;
  /** 1-based inclusive inner lines between paired region markers (unchanged semantics). */
  sourceStart: number;
  sourceEnd: number;
  /** 1-based half-open span; see block-scroll-pickers parallel-docs. */
  markerViewportHalfOpen1Based: { lo: number; hiExclusive: number };
};

/** Strict `[lo, hi)` contain; `null` in gaps. See parallel-docs for geometry. */
export function blockStrictlyContainingSourceViewportLine(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
): BlockScrollLink | null {
  if (blocks.length === 0) return null;
  const sorted = [...blocks].sort(
    (a, b) => a.markerViewportHalfOpen1Based.lo - b.markerViewportHalfOpen1Based.lo,
  );
  for (const b of sorted) {
    const { lo, hiExclusive } = b.markerViewportHalfOpen1Based;
    if (lo <= topSourceLine1Based && topSourceLine1Based < hiExclusive) return b;
  }
  return null;
}

/** Prelude above every span; see parallel-docs. */
export function sourceTopLineStrictlyBeforeFirstIndexLine(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
): boolean {
  if (blocks.length === 0) return false;
  let minLo = Infinity;
  for (const b of blocks) {
    minLo = Math.min(minLo, b.markerViewportHalfOpen1Based.lo);
  }
  return topSourceLine1Based < minLo;
}

/** True when probe sits strictly between two `parallelDocs:block` lines (interstitial prose). */
export function parallelDocsProbeInStrictInterMarkerGap(
  blocks: BlockScrollLink[],
  topParallelDocsLine0Based: number,
): boolean {
  if (blocks.length === 0) return false;
  const s = [...blocks].sort((a, b) => a.parallelDocsLine - b.parallelDocsLine);
  const head = s[0];
  if (head === undefined) return false;
  if (topParallelDocsLine0Based < head.parallelDocsLine) return false;
  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    if (!cur) continue;
    const next = s[i + 1];
    if (next === undefined) {
      return topParallelDocsLine0Based > cur.parallelDocsLine;
    }
    if (
      cur.parallelDocsLine < topParallelDocsLine0Based &&
      topParallelDocsLine0Based < next.parallelDocsLine
    ) {
      return true;
    }
  }
  return false;
}

/** Naive source viewport pick (inside span / gap / prelude); see parallel-docs. */
export function pickBlockScrollLinkForSourceViewportTop(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
): BlockScrollLink | null {
  if (blocks.length === 0) return null;
  const sorted = [...blocks].sort(
    (a, b) => a.markerViewportHalfOpen1Based.lo - b.markerViewportHalfOpen1Based.lo,
  );
  const first = sorted[0];
  if (first === undefined) return null;
  const firstLo = first.markerViewportHalfOpen1Based.lo;
  const inside = sorted.find(
    (b) =>
      b.markerViewportHalfOpen1Based.lo <= topSourceLine1Based &&
      topSourceLine1Based < b.markerViewportHalfOpen1Based.hiExclusive,
  );
  if (inside) return inside;
  if (topSourceLine1Based < firstLo) return first;
  let best = first;
  let bestLo = -Infinity;
  for (const b of sorted) {
    const lo = b.markerViewportHalfOpen1Based.lo;
    if (lo <= topSourceLine1Based && lo > bestLo) {
      best = b;
      bestLo = lo;
    }
  }
  return best;
}

/** Mutable lock for {@link pickBlockScrollLinkForSourceViewportWithHysteresis} / parallel-docs twin. */
export type BlockScrollStickyState = {
  lockedId: string | null;
};

/** Default: require this many **source** lines into the naive winner before leaving the locked block. */
export const DEFAULT_SOURCE_VIEWPORT_HYSTERESIS_LINES = 2;

/** Default: require this many **side-track markdown** lines into the naive winner before leaving the lock. */
export const DEFAULT_PARALLEL_DOCS_VIEWPORT_HYSTERESIS_LINES = 4;

type StickyHysteresisLockResolution =
  | { outcome: "clear" }
  | { outcome: "return"; link: BlockScrollLink }
  | { outcome: "hysteresis"; naive: BlockScrollLink; locked: BlockScrollLink };

/** Hysteresis lock resolution; diagram in parallel-docs. */
function resolveStickyHysteresisLock(
  naive: BlockScrollLink | null,
  blocks: BlockScrollLink[],
  state: BlockScrollStickyState,
): StickyHysteresisLockResolution {
  if (!naive) {
    state.lockedId = null;
    return { outcome: "clear" };
  }
  if (state.lockedId === null) {
    state.lockedId = naive.id;
    return { outcome: "return", link: naive };
  }
  if (state.lockedId === naive.id) {
    return { outcome: "return", link: naive };
  }
  const locked = blocks.find((b) => b.id === state.lockedId);
  if (!locked) {
    state.lockedId = naive.id;
    return { outcome: "return", link: naive };
  }
  return { outcome: "hysteresis", naive, locked };
}

/** Source→parallel-docs hysteresis; see parallel-docs. */
export function pickBlockScrollLinkForSourceViewportWithHysteresis(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
  state: BlockScrollStickyState,
  hysteresisSourceLines: number = DEFAULT_SOURCE_VIEWPORT_HYSTERESIS_LINES,
): BlockScrollLink | null {
  const HYST = Math.max(1, Math.floor(hysteresisSourceLines));
  const naive = pickBlockScrollLinkForSourceViewportTop(blocks, topSourceLine1Based);
  const res = resolveStickyHysteresisLock(naive, blocks, state);
  if (res.outcome === "clear") return null;
  if (res.outcome === "return") return res.link;
  const { naive: n, locked } = res;
  const loL = locked.markerViewportHalfOpen1Based.lo;
  const hiL = locked.markerViewportHalfOpen1Based.hiExclusive;
  const loC = n.markerViewportHalfOpen1Based.lo;
  const hiC = n.markerViewportHalfOpen1Based.hiExclusive;
  const separatedBelow = loC >= hiL;
  const separatedAbove = hiC <= loL;
  if (!separatedBelow && !separatedAbove) {
    state.lockedId = n.id;
    return n;
  }
  if (separatedBelow) {
    if (topSourceLine1Based >= loC + HYST) {
      state.lockedId = n.id;
      return n;
    }
    return locked;
  }
  if (topSourceLine1Based <= loL - HYST) {
    state.lockedId = n.id;
    return n;
  }
  return locked;
}

/** Maps source viewport top → parallel-docs line (naive pick); see parallel-docs. */
export function pickParallelDocsLineForSourceScroll(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
): number | null {
  const b = pickBlockScrollLinkForSourceViewportTop(blocks, topSourceLine1Based);
  return b ? b.parallelDocsLine : null;
}

/**
 * Source viewport → companion markdown line for **dual-pane** hosts (VS Code, rendered preview):
 * when the source probe sits **strictly inside** a block’s indexed viewport span, map linearly from
 * `sourceStart`…`sourceEnd` onto markdown lines **after** that block’s `<!-- parallelDocs:block` line
 * up to (but not including) the next block marker (or end of file). Otherwise (prelude, gaps, after
 * the last span) call `gapFallback()` — typically a proportional mirror, matching
 * `docs/spec/dual-pane-scroll-sync.md` source-gap behaviour.
 */
export function pickParallelDocsLineForSourceDualPane(
  blocks: BlockScrollLink[],
  topSourceLine1Based: number,
  parallelDocsMdLineCount: number,
  gapFallback: () => number,
): number {
  if (blocks.length === 0) {
    return gapFallback();
  }
  const inside = blockStrictlyContainingSourceViewportLine(blocks, topSourceLine1Based);
  if (inside === null) {
    return gapFallback();
  }
  return parallelDocsBodyLineWithinBlockFromSourceTop(
    blocks,
    inside,
    topSourceLine1Based,
    parallelDocsMdLineCount,
  );
}

function parallelDocsBodyLineWithinBlockFromSourceTop(
  blocks: BlockScrollLink[],
  block: BlockScrollLink,
  topSourceLine1Based: number,
  parallelDocsMdLineCount: number,
): number {
  const sorted = [...blocks].sort((a, b) => a.parallelDocsLine - b.parallelDocsLine);
  const idx = sorted.findIndex((b) => b.id === block.id);
  const next = idx >= 0 ? sorted[idx + 1] : undefined;
  const mdCeilExclusive = next !== undefined ? next.parallelDocsLine : parallelDocsMdLineCount;
  const mdBodyFirst = block.parallelDocsLine + 1;
  const mdBodyLastInclusive = mdCeilExclusive - 1;
  if (mdBodyLastInclusive < mdBodyFirst) {
    return block.parallelDocsLine;
  }
  const srcLo = block.sourceStart;
  const srcHi = block.sourceEnd;
  const clamped = Math.min(Math.max(topSourceLine1Based, srcLo), srcHi);
  const denom = Math.max(1, srcHi - srcLo);
  const t = srcHi === srcLo ? 0 : (clamped - srcLo) / denom;
  const mdLine = Math.round(mdBodyFirst + t * (mdBodyLastInclusive - mdBodyFirst));
  return Math.min(mdBodyLastInclusive, Math.max(mdBodyFirst, mdLine));
}

/** ParallelDocs→source hysteresis twin; see parallel-docs. */
export function pickBlockScrollLinkForParallelDocsViewportWithHysteresis(
  blocks: BlockScrollLink[],
  topParallelDocsLine0Based: number,
  state: BlockScrollStickyState,
  hysteresisMdLines: number = DEFAULT_PARALLEL_DOCS_VIEWPORT_HYSTERESIS_LINES,
): BlockScrollLink | null {
  const HYST = Math.max(1, Math.floor(hysteresisMdLines));
  const naive = pickBlockScrollLinkForParallelDocsScroll(blocks, topParallelDocsLine0Based);
  const res = resolveStickyHysteresisLock(naive, blocks, state);
  if (res.outcome === "clear") return null;
  if (res.outcome === "return") return res.link;
  const { naive: n, locked } = res;
  const lL = locked.parallelDocsLine;
  const lC = n.parallelDocsLine;
  const separatedBelow = lC > lL;
  const separatedAbove = lC < lL;
  if (!separatedBelow && !separatedAbove) {
    state.lockedId = n.id;
    return n;
  }
  if (separatedBelow) {
    if (topParallelDocsLine0Based >= lC + HYST) {
      state.lockedId = n.id;
      return n;
    }
    return locked;
  }
  if (topParallelDocsLine0Based <= lL - HYST) {
    state.lockedId = n.id;
    return n;
  }
  return locked;
}

/** Naive pick: last block whose marker line ≤ viewport top (0-based MD lines). */
export function pickBlockScrollLinkForParallelDocsScroll(
  blocks: BlockScrollLink[],
  topParallelDocsLine0Based: number,
): BlockScrollLink | null {
  if (blocks.length === 0) return null;
  const sorted = [...blocks].sort((a, b) => a.parallelDocsLine - b.parallelDocsLine);
  const head = sorted[0];
  if (head === undefined) return null;
  let best = head;
  for (const b of sorted) {
    if (b.parallelDocsLine <= topParallelDocsLine0Based) best = b;
  }
  return best;
}

/** ParallelDocs viewport top → 0-based source line (`lo - 1` of winning block). */
export function pickSourceLine0ForParallelDocsScroll(
  blocks: BlockScrollLink[],
  topParallelDocsLine0Based: number,
): number | null {
  const link = pickBlockScrollLinkForParallelDocsScroll(blocks, topParallelDocsLine0Based);
  return link ? link.markerViewportHalfOpen1Based.lo - 1 : null;
}

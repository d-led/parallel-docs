import { parseAnchor } from "./anchors.js";
import type { BlockScrollLink } from "./block-scroll-pickers.js";
import { assertValidMarkerId, MARKER_ID_BODY } from "./marker-ids.js";
import type { ParallelDocsIndex } from "./model.js";
import { normalizeRepoRelativePath } from "./paths.js";
import { markerViewportHalfOpen1Based, sourceLineRangeForMarkerId } from "./source-markers.js";

export type { BlockScrollLink, BlockScrollStickyState } from "./block-scroll-pickers.js";
export {
  blockStrictlyContainingSourceViewportLine,
  parallelDocsProbeInStrictInterMarkerGap,
  DEFAULT_PARALLEL_DOCS_VIEWPORT_HYSTERESIS_LINES,
  DEFAULT_SOURCE_VIEWPORT_HYSTERESIS_LINES,
  pickBlockScrollLinkForParallelDocsScroll,
  pickBlockScrollLinkForParallelDocsViewportWithHysteresis,
  pickBlockScrollLinkForSourceViewportTop,
  pickBlockScrollLinkForSourceViewportWithHysteresis,
  pickParallelDocsLineForSourceDualPane,
  pickParallelDocsLineForSourceScroll,
  pickSourceLine0ForParallelDocsScroll,
  sourceTopLineStrictlyBeforeFirstIndexLine,
} from "./block-scroll-pickers.js";

const BLOCK_MARKER_RE = new RegExp(`<!-- parallelDocs:block id=(${MARKER_ID_BODY}) -->`);

function markerLineByIdFromMarkdown(markdown: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = BLOCK_MARKER_RE.exec(lines[i]);
    if (match) map.set(match[1], i);
  }
  return map;
}

function buildMarkerFallbackLinks(
  markerLineById: Map<string, number>,
  sourceText: string | undefined,
): BlockScrollLink[] {
  if (sourceText === undefined || markerLineById.size === 0) return [];
  const links: BlockScrollLink[] = [];
  for (const [id, parallelDocsLine] of markerLineById) {
    const range = sourceLineRangeForMarkerId(sourceText, id);
    const mv = markerViewportHalfOpen1Based(sourceText, id);
    if (range === null || mv === null) continue;
    links.push({
      id,
      parallelDocsLine,
      sourceStart: range.start,
      sourceEnd: range.end,
      markerViewportHalfOpen1Based: mv,
    });
  }
  links.sort((a, b) => a.sourceStart - b.sourceStart);
  return links;
}

/** One `<!-- #region parallelDocs:id -->` … `<!-- #endregion parallelDocs:id -->` span in companion Markdown. */
export type MarkdownHtmlParallelDocsRegion = {
  readonly id: string;
  /** 0-based line of the opening `<!-- #region parallelDocs:<id> -->`. */
  readonly mdStartLine: number;
  /** Exclusive line index past the closing `<!-- #endregion parallelDocs:<id> -->`. */
  readonly mdEndExclusive: number;
};

/**
 * Parses HTML-style ParallelDocs regions in companion Markdown (`markdown` language family), the same
 * shape `parallelDocsRegionInsertions("markdown", …)` emits. Used when there are no
 * `<!-- parallelDocs:block id=… -->` markers so scroll sync can still segment by authored sections.
 */
export function parseMarkdownHtmlParallelDocsRegions(
  markdown: string,
): MarkdownHtmlParallelDocsRegion[] {
  const lines = markdown.split("\n");
  const out: MarkdownHtmlParallelDocsRegion[] = [];
  const stack: { id: string; start: number }[] = [];
  const startRe = /^<!--\s*#region\s+parallelDocs:([a-z0-9][a-z0-9_-]{0,63})\s*-->$/i;
  const endRe = /^<!--\s*#endregion\s+parallelDocs:([a-z0-9][a-z0-9_-]{0,63})\s*-->$/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const sm = line.match(startRe);
    if (sm) {
      const startId = sm[1];
      if (startId === undefined) continue;
      try {
        assertValidMarkerId(startId);
      } catch {
        continue;
      }
      stack.push({ id: startId, start: i });
      continue;
    }
    const em = line.match(endRe);
    if (!em) continue;
    const endId = em[1];
    if (endId === undefined) continue;
    try {
      assertValidMarkerId(endId);
    } catch {
      continue;
    }
    let k = stack.length - 1;
    while (k >= 0) {
      const frame = stack[k];
      if (frame !== undefined && frame.id.toLowerCase() === endId.toLowerCase()) break;
      k -= 1;
    }
    if (k < 0) continue;
    const matched = stack[k];
    if (matched === undefined) continue;
    const { start } = matched;
    stack.splice(k);
    out.push({ id: endId, mdStartLine: start, mdEndExclusive: i + 1 });
  }
  out.sort((a, b) => a.mdStartLine - b.mdStartLine);
  return out;
}

/**
 * When companion Markdown uses HTML `#region parallelDocs:…` / `#endregion` pairs but the primary
 * file has **no** matching region delimiters, partition **1…sourceLineCount** across regions in
 * proportion to each region’s Markdown body height so dual-pane scroll is **piecewise** instead
 * of one global ratio.
 */
function buildSyntheticBlockScrollLinksFromHtmlRegions(
  parallelDocsMarkdown: string,
  sourceText: string | undefined,
): BlockScrollLink[] {
  if (sourceText === undefined) return [];
  const sourceLineCount = sourceText.split("\n").length;
  if (sourceLineCount < 1) return [];
  const regions = parseMarkdownHtmlParallelDocsRegions(parallelDocsMarkdown);
  if (regions.length === 0) return [];
  if (sourceLineCount < regions.length) return [];
  const weights = regions.map((r) => Math.max(1, r.mdEndExclusive - r.mdStartLine - 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  const slices = weights.map((w) => Math.max(1, Math.floor((w / sum) * sourceLineCount)));
  let total = slices.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (total < sourceLineCount && guard < sourceLineCount + 8) {
    const idx = guard % slices.length;
    const bump = slices[idx];
    if (bump === undefined) break;
    slices[idx] = bump + 1;
    total += 1;
    guard += 1;
  }
  guard = 0;
  while (total > sourceLineCount && guard < sourceLineCount + 8) {
    const j = slices.findIndex((s) => s > 1);
    if (j < 0) break;
    const cur = slices[j];
    if (cur === undefined) break;
    slices[j] = cur - 1;
    total -= 1;
    guard += 1;
  }
  const links: BlockScrollLink[] = [];
  let srcLo = 1;
  for (let j = 0; j < regions.length; j++) {
    const slice = slices[j];
    const r = regions[j];
    if (slice === undefined || r === undefined) continue;
    const srcHi = Math.min(sourceLineCount, srcLo + slice - 1);
    links.push({
      id: r.id,
      parallelDocsLine: r.mdStartLine,
      sourceStart: srcLo,
      sourceEnd: srcHi,
      markerViewportHalfOpen1Based: { lo: srcLo, hiExclusive: srcHi + 1 },
    });
    srcLo = srcHi + 1;
  }
  return links;
}

function markerFallbackThenSynthetic(
  markerLineById: Map<string, number>,
  parallelDocsMarkdown: string,
  sourceText: string | undefined,
): BlockScrollLink[] {
  const fb = buildMarkerFallbackLinks(markerLineById, sourceText);
  if (fb.length > 0) return fb;
  return buildSyntheticBlockScrollLinksFromHtmlRegions(parallelDocsMarkdown, sourceText);
}

/** Join index + companion markers into `BlockScrollLink[]`; see scroll-sync parallel-docs. */
export function buildBlockScrollLinks(
  index: ParallelDocsIndex | null | undefined,
  sourceRelative: string,
  parallelDocsPath: string,
  parallelDocsMarkdown: string,
  sourceText?: string,
): BlockScrollLink[] {
  const markerLineById = markerLineByIdFromMarkdown(parallelDocsMarkdown);
  const entry = index?.byParallelDocsPath[parallelDocsPath];
  if (!entry || entry.sourcePath !== sourceRelative || entry.blocks.length === 0) {
    return markerFallbackThenSynthetic(markerLineById, parallelDocsMarkdown, sourceText);
  }
  const entryCrNorm = normalizeRepoRelativePath(entry.parallelDocsPath.replaceAll("\\", "/"));
  const lookupCrNorm = normalizeRepoRelativePath(parallelDocsPath.replaceAll("\\", "/"));
  if (entryCrNorm !== lookupCrNorm) {
    return markerFallbackThenSynthetic(markerLineById, parallelDocsMarkdown, sourceText);
  }
  const links: BlockScrollLink[] = [];
  for (const block of entry.blocks) {
    const anchor = parseAnchor(block.anchor);
    const parallelDocsLine = markerLineById.get(block.id);
    if (parallelDocsLine === undefined) continue;
    if (anchor.kind === "lines") {
      const lo = anchor.range.start;
      const hiExclusive = anchor.range.end + 1;
      links.push({
        id: block.id,
        parallelDocsLine,
        sourceStart: anchor.range.start,
        sourceEnd: anchor.range.end,
        markerViewportHalfOpen1Based: { lo, hiExclusive },
      });
      continue;
    }
    if (anchor.kind === "marker") {
      if (sourceText === undefined) continue;
      const range = sourceLineRangeForMarkerId(sourceText, anchor.id);
      const mv = markerViewportHalfOpen1Based(sourceText, anchor.id);
      if (range === null || mv === null) continue;
      links.push({
        id: block.id,
        parallelDocsLine,
        sourceStart: range.start,
        sourceEnd: range.end,
        markerViewportHalfOpen1Based: mv,
      });
    }
  }
  links.sort((a, b) => a.sourceStart - b.sourceStart);
  if (links.length > 0) return links;
  return buildSyntheticBlockScrollLinksFromHtmlRegions(parallelDocsMarkdown, sourceText);
}

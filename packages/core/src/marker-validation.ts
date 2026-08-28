import { parseAnchor } from "./anchors.js";
import { assertValidMarkerId, MARKER_ID_BODY } from "./marker-ids.js";
import type { SideTrackIndex } from "./model.js";
import { normalizeRepoRelativePath } from "./paths.js";
import { findSideTrackMarkerPairs } from "./region-marker-convert.js";
import { parseSideTrackRegionBoundary, sourceLineRangeForMarkerId } from "./source-markers.js";

export type MarkerValidationIssue = { level: "error" | "warn"; message: string };

/**
 * Block ids declared in companion markdown via `<!-- sidetrack:block id=… -->` (valid ids only).
 */
export function extractSideTrackBlockIdsFromMarkdown(markdown: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(`<!--\\s*sidetrack:block\\s+id=(${MARKER_ID_BODY})\\s*-->`, "gi");
  for (const m of markdown.matchAll(re)) {
    const raw = m[1];
    if (raw === undefined) continue;
    try {
      out.add(assertValidMarkerId(raw));
    } catch {
      /* ignore malformed ids on that line */
    }
  }
  return out;
}

/**
 * Block ids declared in companion markdown, preserving appearance order.
 */
export function extractSideTrackBlockIdsInMarkdownOrder(markdown: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<!--\\s*sidetrack:block\\s+id=(${MARKER_ID_BODY})\\s*-->`, "gi");
  for (const m of markdown.matchAll(re)) {
    const raw = m[1];
    if (raw === undefined) continue;
    try {
      out.push(assertValidMarkerId(raw));
    } catch {
      /* ignore malformed ids on that line */
    }
  }
  return out;
}

/**
 * Detects two or more well-formed marker regions whose **inner** 1-based inclusive line ranges
 * intersect. Adjacent regions (last inner line N, next inner starts N+1) do not overlap.
 */
export function validateOverlappingMarkerInnerRangesInSource(
  sourceText: string,
  sourcePath: string,
): MarkerValidationIssue[] {
  const text = sourceText.replaceAll("\r\n", "\n");
  const pairs = findSideTrackMarkerPairs(text);
  type Rng = { id: string; start: number; end: number };
  const ranges: Rng[] = [];
  for (const pair of pairs) {
    const r = sourceLineRangeForMarkerId(text, pair.id);
    if (r === null) continue;
    ranges.push({ id: pair.id, start: r.start, end: r.end });
  }
  const issues: MarkerValidationIssue[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const a = ranges[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < ranges.length; j++) {
      const b = ranges[j];
      if (b === undefined) continue;
      if (a.end < b.start || b.end < a.start) continue;
      issues.push({
        level: "error",
        message:
          `${sourcePath}: sidetrack regions "${a.id}" (inner lines ${a.start}–${a.end}) and "${b.id}" ` +
          `(${b.start}–${b.end}) overlap. Regions in the same primary file must not share source lines — ` +
          `close one region before the other begins, or split the file.`,
      });
    }
  }
  return issues;
}

/**
 * Scans a single source file for SideTrack region / marker boundaries and reports:
 * - invalid ids (syntax that matched but fails `assertValidMarkerId` — rare),
 * - duplicate **start** for the same id before its `end`,
 * - orphan **end** lines,
 * - **start** without a matching **end** (unclosed region).
 */
export function validateMarkerBoundariesInSource(
  sourceText: string,
  sourcePath: string,
): MarkerValidationIssue[] {
  const issues: MarkerValidationIssue[] = [];
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const pendingStartLine = new Map<string, number>();

  for (let line0 = 0; line0 < lines.length; line0++) {
    const hit = parseSideTrackRegionBoundary(lines[line0] ?? "");
    if (!hit) continue;
    try {
      assertValidMarkerId(hit.id);
    } catch (e) {
      issues.push({
        level: "error",
        message: `${sourcePath}:${line0 + 1}: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const loc = `${sourcePath}:${line0 + 1}`;
    if (hit.kind === "start") {
      const priorStart = pendingStartLine.get(hit.id);
      if (priorStart !== undefined) {
        const prev = priorStart + 1;
        issues.push({
          level: "error",
          message: `${loc}: duplicate sidetrack start for id "${hit.id}" (also opened at line ${prev}). Close the previous region first, or use a unique id per region.`,
        });
        continue;
      }
      pendingStartLine.set(hit.id, line0);
      continue;
    }
    const start0 = pendingStartLine.get(hit.id);
    if (start0 === undefined) {
      issues.push({
        level: "error",
        message: `${loc}: sidetrack end for id "${hit.id}" has no matching start in this file.`,
      });
      continue;
    }
    pendingStartLine.delete(hit.id);
  }

  for (const [id, line0] of pendingStartLine) {
    issues.push({
      level: "error",
      message: `${sourcePath}:${line0 + 1}: sidetrack start for id "${id}" has no matching end in this file.`,
    });
  }

  issues.push(...validateOverlappingMarkerInnerRangesInSource(sourceText, sourcePath));
  return issues;
}

function tryParseMarkerAnchorId(anchor: string): string | null {
  try {
    const parsed = parseAnchor(anchor);
    return parsed.kind === "marker" ? parsed.id : null;
  } catch {
    return null;
  }
}

function claimedMarkerIdsByNormalizedSource(index: SideTrackIndex): Map<string, Set<string>> {
  const claimedBySourceNorm = new Map<string, Set<string>>();
  for (const entry of Object.values(index.bySideTrackPath)) {
    const norm = normalizeRepoRelativePath(entry.sourcePath);
    let set = claimedBySourceNorm.get(norm);
    if (!set) {
      set = new Set();
      claimedBySourceNorm.set(norm, set);
    }
    for (const block of entry.blocks) {
      const markerId = tryParseMarkerAnchorId(block.anchor);
      if (markerId !== null) set.add(markerId);
    }
  }
  return claimedBySourceNorm;
}

function unresolvedMarkerAnchorIssues(
  index: SideTrackIndex,
  indexedSourceTexts: Map<string, string>,
): MarkerValidationIssue[] {
  const issues: MarkerValidationIssue[] = [];
  for (const [sidetrackPath, entry] of Object.entries(index.bySideTrackPath)) {
    const norm = normalizeRepoRelativePath(entry.sourcePath);
    const text = indexedSourceTexts.get(norm);
    if (text === undefined) continue;

    for (const block of entry.blocks) {
      const markerId = tryParseMarkerAnchorId(block.anchor);
      if (markerId === null) continue;
      if (sourceLineRangeForMarkerId(text, markerId) !== null) continue;
      issues.push({
        level: "error",
        message:
          `Block "${block.id}" in ${sidetrackPath} uses anchor "marker:${markerId}" but ` +
          `primary "${entry.sourcePath}" has no resolvable paired sidetrack region for that id ` +
          `(see docs/spec/blocks.md — e.g. Markdown/HTML: <!-- #region sidetrack:${markerId} --> … <!-- #endregion sidetrack:${markerId} -->).`,
      });
    }
  }
  return issues;
}

function displaySourcePathForNorm(index: SideTrackIndex, norm: string): string {
  const hit = Object.values(index.bySideTrackPath).find(
    (e) => normalizeRepoRelativePath(e.sourcePath) === norm,
  );
  return hit?.sourcePath ?? norm;
}

function orphanRegionIssues(
  index: SideTrackIndex,
  indexedSourceTexts: Map<string, string>,
  claimedBySourceNorm: Map<string, Set<string>>,
  markdownBlockIdsBySourceNorm: Map<string, Set<string>> | undefined,
): MarkerValidationIssue[] {
  const issues: MarkerValidationIssue[] = [];
  const orphanWarned = new Set<string>();
  for (const [norm, text] of indexedSourceTexts) {
    const pairs = findSideTrackMarkerPairs(text);
    const claimed = claimedBySourceNorm.get(norm) ?? new Set();
    const mdIds = markdownBlockIdsBySourceNorm?.get(norm);
    const displayPath = displaySourcePathForNorm(index, norm);
    for (const pair of pairs) {
      const dedupe = `${norm}\0${pair.id}`;
      if (orphanWarned.has(dedupe)) continue;

      if (markdownBlockIdsBySourceNorm !== undefined) {
        const inMd = mdIds?.has(pair.id) ?? false;
        if (inMd) continue;
        orphanWarned.add(dedupe);
        const indexed = claimed.has(pair.id);
        const tail = indexed
          ? ` An indexed block uses anchor marker:${pair.id}, but no companion markdown line ` +
            `\`<!-- sidetrack:block id=${pair.id} -->\` was found for this primary (add the marker or fix the path).`
          : ` No indexed block uses anchor marker:${pair.id}, and no companion markdown references this id.`;
        issues.push({
          level: "warn",
          message:
            `Primary "${displayPath}" has a sidetrack region "${pair.id}" (delimiter lines ` +
            `${pair.startLine0 + 1} and ${pair.endLine0 + 1}) that is not referenced by any ` +
            `\`<!-- sidetrack:block id=${pair.id} -->\` line in companion markdown for this primary.${tail}`,
        });
        continue;
      }

      if (claimed.has(pair.id)) continue;
      orphanWarned.add(dedupe);
      issues.push({
        level: "warn",
        message:
          `Primary "${displayPath}" has a sidetrack region "${pair.id}" (delimiter lines ` +
          `${pair.startLine0 + 1} and ${pair.endLine0 + 1}) that no indexed block claims ` +
          `(expected a block with anchor marker:${pair.id} and matching <!-- sidetrack:block id=${pair.id} -->). ` +
          `Remove the delimiters or add the block to index.json.`,
      });
    }
  }
  return issues;
}

/**
 * For each `marker:` block, ensures the primary file contains a well-formed paired
 * region that resolves to a non-empty span.
 *
 * When `markdownBlockIdsBySourceNorm` is set (repo validation), warns for **orphan** regions: a
 * paired delimiter id in the primary that has no matching `<!-- sidetrack:block id=… -->` in any
 * indexed companion markdown for that primary. When it is omitted (tests), the legacy rule
 * applies: warn only when no indexed block claims `marker:<id>`.
 */
export function validateMarkerRegionsAgainstIndexedSources(
  index: SideTrackIndex,
  indexedSourceTexts: Map<string, string>,
  markdownBlockIdsBySourceNorm?: Map<string, Set<string>>,
  markdownBlockOrderBySideTrackPath?: Map<string, string[]>,
): MarkerValidationIssue[] {
  const claimed = claimedMarkerIdsByNormalizedSource(index);
  return [
    ...unresolvedMarkerAnchorIssues(index, indexedSourceTexts),
    ...orphanRegionIssues(index, indexedSourceTexts, claimed, markdownBlockIdsBySourceNorm),
    ...unsortedCompanionBlockOrderIssues(
      index,
      indexedSourceTexts,
      markdownBlockOrderBySideTrackPath,
    ),
  ];
}

function unsortedCompanionBlockOrderIssues(
  index: SideTrackIndex,
  indexedSourceTexts: Map<string, string>,
  markdownBlockOrderBySideTrackPath: Map<string, string[]> | undefined,
): MarkerValidationIssue[] {
  if (markdownBlockOrderBySideTrackPath === undefined) return [];
  const issues: MarkerValidationIssue[] = [];
  for (const [sidetrackPath, entry] of Object.entries(index.bySideTrackPath)) {
    const mdOrder = markdownBlockOrderBySideTrackPath.get(sidetrackPath);
    if (mdOrder === undefined || mdOrder.length < 2) continue;

    const sourceNorm = normalizeRepoRelativePath(entry.sourcePath);
    const sourceText = indexedSourceTexts.get(sourceNorm);
    if (sourceText === undefined) continue;

    const sourceOrder = markerStartOrderMap(sourceText);

    let lastRank = -1;
    let lastId: string | null = null;
    for (const id of mdOrder) {
      const rank = sourceOrder.get(id);
      if (rank === undefined) continue;
      if (rank < lastRank) {
        issues.push({
          level: "warn",
          message:
            `Companion "${sidetrackPath}" lists block id "${id}" before "${lastId ?? "(unknown)"}", ` +
            `but source "${entry.sourcePath}" orders their regions the other way around. ` +
            `Reorder companion sections to match source region order, or re-create misplaced blocks via ` +
            `“SideTrack: Start new block from selection” to auto-place them by source flow.`,
        });
        break;
      }
      lastRank = rank;
      lastId = id;
    }
  }
  return issues;
}

function markerStartOrderMap(sourceText: string): Map<string, number> {
  const order = new Map<string, number>();
  let next = 0;
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  for (const line of lines) {
    const hit = parseSideTrackRegionBoundary(line);
    if (!hit || hit.kind !== "start") continue;
    if (order.has(hit.id)) continue;
    order.set(hit.id, next++);
  }
  for (const pair of findSideTrackMarkerPairs(sourceText)) {
    if (order.has(pair.id)) continue;
    order.set(pair.id, next++);
  }
  return order;
}

function markerIdFromBlock(block: { anchor: string; markerId?: string }): string | null {
  try {
    const a = parseAnchor(block.anchor);
    if (a.kind === "marker") return a.id;
  } catch {
    return null;
  }
  if (typeof block.markerId === "string" && block.markerId.trim() !== "") {
    try {
      return assertValidMarkerId(block.markerId);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Index-level rules for stable cross-references:
 * - **Error** if the same `(sourcePath, marker id)` is claimed by **different** block `id`s
 *   (e.g. two Angle files disagree).
 * - **Warn** if the same marker id string is reused across **different** source files
 *   (repo-wide ambiguity for links and search — allowed, but noisy).
 */
export function validateIndexMarkerSemantics(index: SideTrackIndex): MarkerValidationIssue[] {
  const issues: MarkerValidationIssue[] = [];
  type Loc = { sourcePath: string; sidetrackPath: string; blockId: string };
  const bySourceAndMarker = new Map<string, Loc[]>();
  const byMarkerRepoWide = new Map<string, Set<string>>();

  for (const [sidetrackPath, entry] of Object.entries(index.bySideTrackPath)) {
    for (const block of entry.blocks) {
      const mid = markerIdFromBlock(block);
      if (mid === null) continue;
      const key = `${entry.sourcePath}\0${mid}`;
      const loc: Loc = {
        sourcePath: entry.sourcePath,
        sidetrackPath,
        blockId: block.id,
      };
      const list = bySourceAndMarker.get(key) ?? [];
      list.push(loc);
      bySourceAndMarker.set(key, list);

      const sources = byMarkerRepoWide.get(mid) ?? new Set<string>();
      sources.add(entry.sourcePath);
      byMarkerRepoWide.set(mid, sources);
    }
  }

  for (const [composite, locs] of bySourceAndMarker) {
    if (locs.length < 2) continue;
    const sep = composite.indexOf("\0");
    const sourcePath = composite.slice(0, sep);
    const mid = composite.slice(sep + 1);
    const blockIds = new Set(locs.map((l) => l.blockId));
    if (blockIds.size > 1) {
      const detail = locs.map((l) => `${l.blockId} (${l.sidetrackPath})`).join(", ");
      issues.push({
        level: "error",
        message:
          `Marker id "${mid}" for source "${sourcePath}" is indexed with different block ids: ${detail}. ` +
          `One physical region should map to one block id (e.g. align Angle files or deduplicate).`,
      });
    }
  }

  for (const [mid, sources] of byMarkerRepoWide) {
    if (sources.size <= 1) continue;
    const paths = [...sources].sort((a, b) => a.localeCompare(b)).join(", ");
    issues.push({
      level: "warn",
      message:
        `Marker id "${mid}" is reused across different source files (${paths}). ` +
        `That is valid for independent regions, but ambiguous for repo-wide links — consider namespaced ids (e.g. "${mid}--dashboard", "${mid}--api").`,
    });
  }

  return issues;
}

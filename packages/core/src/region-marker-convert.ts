import { sidetrackRegionInsertions, parseSideTrackRegionBoundary } from "./source-markers.js";

/** One paired SideTrack delimiter span in source (0-based line indices). */
export type SideTrackMarkerPair = {
  id: string;
  /** Line index of the opening delimiter. */
  startLine0: number;
  /** Line index of the closing delimiter. */
  endLine0: number;
};

/** Leading tabs/spaces on a line (used when rewriting markers). */
export function leadingIndentOfLine(line: string): string {
  const m = /^[\t ]*/.exec(line);
  return m ? m[0] : "";
}

/**
 * Finds well-formed start/end pairs in source order. Unmatched starts (same id
 * opened twice without an end) keep the first start; orphan ends are ignored.
 */
export function findSideTrackMarkerPairs(sourceText: string): SideTrackMarkerPair[] {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const pending = new Map<string, number>();
  const pairs: SideTrackMarkerPair[] = [];
  for (let i = 0; i < lines.length; i++) {
    const hit = parseSideTrackRegionBoundary(lines[i]);
    if (!hit) continue;
    if (hit.kind === "start") {
      if (!pending.has(hit.id)) pending.set(hit.id, i);
      continue;
    }
    const start0 = pending.get(hit.id);
    if (start0 === undefined) continue;
    if (i <= start0) continue;
    pairs.push({ id: hit.id, startLine0: start0, endLine0: i });
    pending.delete(hit.id);
  }
  return pairs;
}

function replaceOnePair(
  lines: readonly string[],
  pair: SideTrackMarkerPair,
  targetLanguageId: string,
): string[] | null {
  if (pair.endLine0 <= pair.startLine0) return null;
  const indent = leadingIndentOfLine(lines[pair.startLine0] ?? "");
  const { start, end } = sidetrackRegionInsertions(targetLanguageId, pair.id, indent);
  const innerLines = lines.slice(pair.startLine0 + 1, pair.endLine0);
  const inner = innerLines.join("\n");
  const combined =
    innerLines.length === 0 ? `${start.replace(/\n$/, "")}${end}` : `${start}${inner}${end}`;
  const inserted = combined.split("\n");
  const before = lines.slice(0, pair.startLine0);
  const after = lines.slice(pair.endLine0 + 1);
  return [...before, ...inserted, ...after];
}

/**
 * Rewrites every detected SideTrack marker pair to the delimiter style for
 * `targetLanguageId` (see {@link sidetrackRegionInsertions}). Processes from
 * the bottom of the file upward so line indices stay valid. Preserves inner
 * lines exactly; normalises CRLF to LF in the result.
 */
export function convertSideTrackSourceMarkersToLanguage(
  sourceText: string,
  targetLanguageId: string,
): { sourceText: string; changed: boolean; convertedPairs: number } {
  const normalised = sourceText.replaceAll("\r\n", "\n");
  const pairs = findSideTrackMarkerPairs(normalised);
  if (pairs.length === 0) {
    return { sourceText: normalised, changed: normalised !== sourceText, convertedPairs: 0 };
  }
  let lines = normalised.split("\n");
  let converted = 0;
  for (const pair of [...pairs].sort((a, b) => b.startLine0 - a.startLine0)) {
    const snapshot = lines.join("\n");
    const next = replaceOnePair(lines, pair, targetLanguageId);
    if (next === null) continue;
    const nextStr = next.join("\n");
    if (nextStr !== snapshot) converted++;
    lines = next;
  }
  const out = lines.join("\n");
  return {
    sourceText: out,
    changed: out !== normalised,
    convertedPairs: converted,
  };
}

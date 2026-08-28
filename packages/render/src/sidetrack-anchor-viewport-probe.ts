/**
 * Pure helper: max `line0` among anchors whose layout top is at or above viewport probe `y`.
 * Mirrors {@link bestSideTrackAnchorLine0AtOrAboveY} in `code-browser-client.ts` for tests.
 *
 * Returns `null` when **no** anchor qualifies (e.g. probe falls in a tall gap before the first
 * anchor, or every anchor is below the probe). Callers must **not** treat that like sidetrack
 * line 0 — that used to snap block-aware scroll sync back to the first block (“popping” the source).
 */
export function maxSideTrackAnchorLine0AtOrAboveViewportY(
  readings: ReadonlyArray<{ line0: number; top: number }>,
  y: number,
): number | null {
  if (readings.length === 0) return null;
  let best: number | null = null;
  for (const { line0, top } of readings) {
    if (top <= y + 1 + 1e-3) best = best === null ? line0 : Math.max(best, line0);
  }
  return best;
}

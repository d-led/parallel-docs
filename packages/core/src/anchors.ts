import { assertValidMarkerId, MARKER_ID_BODY } from "./marker-ids.js";

export type LineRange = { start: number; end: number };

export type ParsedAnchor =
  | { kind: "lines"; range: LineRange }
  | { kind: "symbol"; name: string }
  | { kind: "marker"; id: string }
  | { kind: "opaque"; raw: string };

/**
 * Minimal anchor grammar (versioned; see docs/spec/anchors.md).
 * - lines:12-34
 * - symbol:SomeName
 * - marker:<id> (paired **region** comments in source — `//#region parallelDocs:<id>` /
 *   `//#endregion parallelDocs:<id>` in JS/TS, matching [Region Marker](https://marketplace.visualstudio.com/items?itemName=txava.region-marker) defaults; legacy `parallelDocs:start id=<id>` / `parallelDocs:end` still parses)
 */
export function parseAnchor(anchor: string): ParsedAnchor {
  const trimmed = anchor.trim();
  const markerMatch = new RegExp(`^marker:(${MARKER_ID_BODY})$`, "i").exec(trimmed);
  if (markerMatch) {
    const id = assertValidMarkerId(markerMatch[1]);
    return { kind: "marker", id };
  }
  const linesMatch = /^lines:(\d+)-(\d+)$/.exec(trimmed);
  if (linesMatch) {
    const start = Number(linesMatch[1]);
    const end = Number(linesMatch[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
      throw new Error(`Invalid lines anchor: ${anchor}`);
    }
    return { kind: "lines", range: { start, end } };
  }
  const symbolMatch = /^symbol:(.+)$/.exec(trimmed);
  if (symbolMatch) {
    const name = symbolMatch[1].trim();
    if (!name) throw new Error(`Invalid symbol anchor: ${anchor}`);
    return { kind: "symbol", name };
  }
  return { kind: "opaque", raw: trimmed };
}

export function formatLineRange(range: LineRange): string {
  return `lines:${range.start}-${range.end}`;
}

export function formatMarkerAnchor(markerId: string): string {
  return `marker:${assertValidMarkerId(markerId)}`;
}

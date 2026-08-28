# `region-marker-naming.ts` — sidetrack

Marker id suggestions when wrapping a selection—pure, no I/O. **Hint order, language sets, `*_PATTERNS`, and `LOOKBACK_LINES`** are all in source (`defaultRegionMarkerNamingStrategy`, hint classes, `tryCodeStructureNameHint`).

**`CallbackRegionMarkerNamingStrategy`** is the host escape hatch when the id is already chosen.

**Related:** [`source-markers.ts`](../source-markers.ts/main.md) — where those ids appear as delimiters in primary files.

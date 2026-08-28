# `scroll-sync.ts` — parallel-docs

Pure functions only—no VS Code imports—so the extension stays a thin orchestrator.

**`buildBlockScrollLinks`** joins `index.json` to `<!-- parallelDocs:block id=… -->` in the Markdown file. Without that join, scroll sync is only **proportional** mirroring between panes.

- Reads block ids from companion Markdown marker lines, matches `index.json` entry when `entry.sourcePath` and `parallelDocsPath` align.
- For each block: **`lines:`** anchors get `markerViewportHalfOpen1Based` from `[start, end + 1)`; **`marker:`** anchors need `sourceText` and delegate to [`source-markers.ts`](../source-markers.ts/main.md) (`sourceLineRangeForMarkerId`, `markerViewportHalfOpen1Based`).
- If the index entry is missing or mismatched, falls back to **markers-only** links (still scroll-correlates when the primary file is available).

When you scroll the source, the target parallel-docs position prefers the **block whose anchor owns** the top visible line; if markers and index disagree with the buffer, behavior falls back to the nearest earlier block, then to ratio. **0-based** editor lines versus **1-based** anchor lines in metadata match how `Range` and the anchor spec are already defined.

**Pick / hysteresis detail:** [`block-scroll-pickers.ts`](../block-scroll-pickers.ts/main.md) (naive picks, Schmitt locks, inter-marker gaps).

**Spec:** [`docs/spec/anchors.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/anchors.md) · [`docs/spec/blocks.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/blocks.md)

# `block-stretch-buffer-sync.ts` — sidetrack

<!-- #region sidetrack:bsbs-dom -->

## GUI / DOM layer

This is where **synchronized abstract row slack** becomes **CSS geometry** in the static stretch table: per stretch `<tr>` the code measures intrinsic code and sidetrack cell heights, builds `HeightAdjustable` rows, runs `BufferingFlowSynchronizer.synchronize`, then applies `bufferAbove` / `bufferBelow` as `padding-top` / `padding-bottom` on the paired `<td>` elements.

There is **no ASCII approval grid** here — only layout and remeasure hooks. The mental model matches the core package: two parallel flows of adjustable segments; sync-region rows share ids across columns; everything else stays local to its column.

Each layout pass, in order:

- Discover stretch rows and which cells participate in sync.
- Measure intrinsic heights in code vs sidetrack cells.
- Build `HeightAdjustable` rows and run **`BufferingFlowSynchronizer.synchronize`**.
- Write resulting `bufferAbove` / `bufferBelow` into **cell padding** so the table visually tracks.

`wireBlockStretchBufferSync` reruns this pass on `ResizeObserver`, tbody mutations, viewport resize, and Mermaid-finished events. The design is a **deterministic post-measurement** layout pass rather than fixed markup heights.

Core algorithm stages and design rationale: [buffering-flow-synchronizer.ts sidetrack](../../../core/src/buffering-flow-synchronizer.ts/main.md).

<!-- #endregion sidetrack:bsbs-dom -->

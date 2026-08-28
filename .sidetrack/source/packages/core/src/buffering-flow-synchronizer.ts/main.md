# `buffering-flow-synchronizer.ts` — sidetrack

<!-- #region sidetrack:bfs-purpose -->

## Purpose (read this first)

`BufferingFlowSynchronizer` takes two ordered lists of **`HeightAdjustable`**: each entry is one vertical segment with intrinsic `height` and slack fields `bufferAbove` / `bufferBelow` (abstract **row units**, not pixels). It returns shallow copies whose slack fields are adjusted so that:

1. **Paired sync regions** — items whose `id` is classified the same way on both sides (`isSyncRegionId` in the implementation) with matching `id` — end up with the same total span and aligned first content rows.
2. **Local segments** — everything else stays column-local (no fake pairing across columns).
3. **Column totals** — the sum of `bufferAbove + height + bufferBelow` down each column matches after the pass.

This file is intentionally **agnostic of ASCII grids**, golden filenames, and buffer “ink” symbols. Those belong to [`buffering-flow-synchronizer-approval-printer.ts`](https://github.com/d-led/sidetrack/blob/main/packages/core/src/buffering-flow-synchronizer-approval-printer.ts) and the approval harness. DOM wiring is in [`packages/render/src/block-stretch-buffer-sync.ts`](https://github.com/d-led/sidetrack/blob/main/packages/render/src/block-stretch-buffer-sync.ts) — see [its sidetrack](../../render/src/block-stretch-buffer-sync.ts/main.md).

**Product note:** In this repository, parsed source regions use ids that match `^R\d+XX$`; tests and fixtures spell that out. The synchronizer’s **contract** is still “pairs of `HeightAdjustable` with the same sync-region classification,” not any particular string pattern in prose next to the algorithm.

<!-- #endregion sidetrack:bfs-purpose -->

---

<!-- #region sidetrack:bfs-pipeline -->

## Pipeline

Linear pass over two `HeightAdjustable[]` flows (see source for exact helpers):

- **Region height** — For each sync-region id that appears on both sides, take the larger intrinsic `height` and add bottom slack on the shorter copy so both columns span the same region.
- **Start alignment** — For each such paired id, make the first content row the same index in both columns by moving slack in `bufferAbove` (minimal: trim the late starter first).
- **Column totals** — If one column is still shorter overall, add tail slack on the last non–sync-region item when possible; otherwise append paired zero-height tail rows so lengths stay matched.
- **Result** — Shallow copies with adjusted buffers; inputs are not mutated.

<!-- #endregion sidetrack:bfs-pipeline -->

---

<!-- #region sidetrack:bfs-design -->

## Design choices (why it looks like this)

- **Start alignment** prefers **reducing** `bufferAbove` on the side whose first content line starts **later** (down to zero), then only then **increases** `bufferAbove` on the other side. That keeps extra top slack minimal when the parser already padded one column.
- **Tail slack** never becomes `bufferBelow` on a sync-region item when that would misrepresent ownership; the implementation may append paired rows with id `NON_SYNC_TAIL_SLACK_ITEM_ID` so both columns stay the same length for index-based zip (e.g. stretch `<tr>` alignment).
- **`bufferBelow` from stage 1 is not redistributed** between the two copies of a paired region: moving it would change per-column scroll totals.

<!-- #endregion sidetrack:bfs-design -->

---

<!-- #region sidetrack:bfs-approval-grids -->

## Where approval tests and grids fit

Golden files under `packages/core/src/buffering-flow-synchronizer.approvals/` are **documentation and regression** for the combination: parse → synchronize → print. Scenario names (e.g. zig-zag vs missing first region) are described next to the harness in [buffering-flow-synchronizer.approval.test.ts sidetrack](../buffering-flow-synchronizer.approval.test.ts/main.md). Grid merge rules and token meanings are in [buffering-flow-synchronizer-approval-printer.ts sidetrack](../buffering-flow-synchronizer-approval-printer.ts/main.md).

<!-- #endregion sidetrack:bfs-approval-grids -->

---

<!-- #region sidetrack:bfs-toml-sketch -->

## Normative TOML sketch

The normative sketch for id **`toml-buffering-flow-sync`** lives in the [`.sidetrack.toml` sidetrack](../../../.sidetrack.toml/main.md) (Markdown block paired with placeholder comments in [`.sidetrack.toml`](https://github.com/d-led/sidetrack/blob/main/.sidetrack.toml)). That block points here for implementation detail.

<!-- #endregion sidetrack:bfs-toml-sketch -->

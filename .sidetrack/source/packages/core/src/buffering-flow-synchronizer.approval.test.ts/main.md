# `buffering-flow-synchronizer.approval.test.ts` — sidetrack

<!-- #region sidetrack:bfas-harness -->

## What this file is

An **end-to-end regression** layer: ASCII fixtures → `parseApprovalFlowSectionsWithFormat` → `BufferingFlowSynchronizer.synchronize` → `printApprovalSynchronizedFlow` → Approvals snapshot, plus **hard asserts** that every scenario keeps documented invariants.

It does **not** replace unit tests in `buffering-flow-synchronizer.test.ts`; those pin small behaviors on minimal `HeightAdjustable` arrays without the grid parser or printer.

<!-- #endregion sidetrack:bfas-harness -->

---

<!-- #region sidetrack:bfas-fixtures -->

## Fixture layout (`buffering-flow-synchronizer.approvals/*.input.txt`)

- Files matching `two-columns.*.input.txt` or `most-compact-*.input.txt` are picked up automatically.
- `assertInputFixtureLayout` enforces: no consecutive blank lines; with the standard gap, no full-width blank line immediately after a stagger row (see inline comment in the test file for the motivating example).

<!-- #endregion sidetrack:bfas-fixtures -->

---

<!-- #region sidetrack:bfas-invariants -->

## Invariants asserted after each case

After `synchronize` + `print`, every fixture must satisfy:

1. **Equal totals** — After sync, left and right column sums of `bufferAbove + height + bufferBelow` match for every section (`assertSynchronizedSectionsHaveEqualColumnTotals`).
2. **Human seams** — At most one full spacer pattern between content blocks; no doubled blank rows sandwiched between content (`assertSingleSpacerRowBetweenBlocks`).
3. **Grid buffer rule** — No line where buffer fill appears in both columns (`assertNoSymmetricBufferSlackRowOnAnyLine`). See [approval-printer sidetrack](../buffering-flow-synchronizer-approval-printer.ts/main.md) for why the printer enforces stagger.

<!-- #endregion sidetrack:bfas-invariants -->

---

<!-- #region sidetrack:bfas-goldens -->

## Reading approved output

Approved `*.approved.txt` files are the **golden** rendered grids. When a behavior change is intentional, update goldens via the Approvals workflow the project uses; when not, treat a diff as a regression in sync, print, or parsing.

<!-- #endregion sidetrack:bfas-goldens -->

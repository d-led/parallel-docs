# `buffering-flow-synchronizer.test.ts` — sidetrack

<!-- #region sidetrack:bfu-role -->

## Role

**Focused unit tests** for `BufferingFlowSynchronizer` on small hand-built `HeightAdjustable[]` values: region height equalization, immutability of inputs, unpaired region ids, tail slack on anonymous tails, and start alignment plus `NON_SYNC_TAIL_SLACK_ITEM_ID` when the shorter column ends on a sync-region item.

These tests use the same **string ids** as production parsing (`R1XX`, …) because that is the simplest way to hit `isSyncRegionId` in the implementation — they are not documenting that the **algorithm conceptually depends** on those literals; the type in code is still abstract `HeightAdjustable`.

For **ASCII grid** coverage and layout invariants, see [buffering-flow-synchronizer.approval.test.ts sidetrack](../buffering-flow-synchronizer.approval.test.ts/main.md). For the core pipeline narrative, see [buffering-flow-synchronizer.ts sidetrack](../buffering-flow-synchronizer.ts/main.md).

<!-- #endregion sidetrack:bfu-role -->

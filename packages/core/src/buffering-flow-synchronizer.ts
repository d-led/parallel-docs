import type { HeightAdjustable } from "./height-adjustable.js";

export type { HeightAdjustable } from "./height-adjustable.js";

/**
 * Sentinel `id` for a zero-height segment appended in **lockstep on both columns** when tail slack
 * needed to equalize column totals must **not** be stored as `bufferBelow` on a sync-region item.
 * The shorter column’s placeholder carries the slack in `bufferBelow`; the paired copy carries zero,
 * keeping left and right arrays the same length for index-aligned consumers (for example stretch rows).
 */
export const NON_SYNC_TAIL_SLACK_ITEM_ID = "__NON_SYNC_TAIL_SLACK__";

/**
 * Two parallel vertical **flows** of {@link HeightAdjustable}: each entry is one segment with
 * intrinsic `height` and optional `bufferAbove` / `bufferBelow` slack in abstract row units.
 *
 * **Paired sync regions:** Items whose `id` passes {@link isSyncRegionId} and share the same id in
 * both columns behave as one logical region: heights are equalized and first content rows are aligned.
 * **Local segments:** All other ids are column-local — no cross-column pairing, shared region height,
 * or coordinated start alignment.
 *
 * **Pipeline** (see `.parallel-docs/source/packages/core/src/buffering-flow-synchronizer.ts/main.md`):
 * (1) Per shared sync-region id, add `bufferBelow` on the shorter copy so both sides span the same
 * region height; (2) align the row index of each region’s first content line, preferring to lower
 * `bufferAbove` on the later-starting side before raising slack on the earlier side; (3) pad the
 * shorter column’s tail so totals match, using `bufferBelow` on the last item when it is not a
 * sync region, else paired {@link NON_SYNC_TAIL_SLACK_ITEM_ID} entries. **Non-step:** `bufferBelow`
 * from (1) is never redistributed between the two copies of a paired region — that would change each
 * column’s scroll total.
 */
export interface SynchronizedHeightAdjustables {
  left: HeightAdjustable[];
  right: HeightAdjustable[];
}

function columnTotalHeight(items: HeightAdjustable[]): number {
  return items.reduce((s, it) => s + it.bufferAbove + it.height + it.bufferBelow, 0);
}

function applySyncRegionBuffersToColumn(
  items: HeightAdjustable[],
  maxHeightByRegionId: Map<string, number>,
): HeightAdjustable[] {
  return items.map((item) => {
    const maxHeightForRegion = isSyncRegionId(item.id)
      ? (maxHeightByRegionId.get(item.id) ?? item.height)
      : item.height;
    return {
      ...item,
      bufferAbove: item.bufferAbove ?? 0,
      bufferBelow: isSyncRegionId(item.id)
        ? maxHeightForRegion - item.height
        : (item.bufferBelow ?? 0),
      ...(item.syncRegionContinuationRows !== undefined
        ? { syncRegionContinuationRows: [...item.syncRegionContinuationRows] }
        : {}),
    };
  });
}

/** Whether `id` is treated as a sync-region identifier for cross-column pairing (same id on both sides). */
function isSyncRegionId(id: string): boolean {
  return /^R\d+XX$/.test(id);
}

/** Row index of the first intrinsic line of `items[index]` (after `bufferAbove` slack). */
function startRowBeforeContent(items: HeightAdjustable[], index: number): number {
  let sum = 0;
  for (let i = 0; i < index; i++) {
    const it = items[i];
    if (it === undefined) continue;
    sum += it.bufferAbove + it.height + it.bufferBelow;
  }
  const it = items[index];
  return sum + (it?.bufferAbove ?? 0);
}

function firstIndexWithId(items: HeightAdjustable[], id: string): number {
  return items.findIndex((it) => it.id === id);
}

function alignOnePairedRegionStart(
  left: HeightAdjustable[],
  right: HeightAdjustable[],
  il: number,
  ir: number,
): boolean {
  const sL = startRowBeforeContent(left, il);
  const sR = startRowBeforeContent(right, ir);
  if (sL === sR) return false;
  if (sL > sR) {
    const diff = sL - sR;
    const lIt = left[il];
    const takeFromLeft = lIt !== undefined ? Math.min(diff, lIt.bufferAbove) : 0;
    let changed = false;
    if (takeFromLeft > 0 && lIt !== undefined) {
      lIt.bufferAbove -= takeFromLeft;
      changed = true;
    }
    const rem = diff - takeFromLeft;
    if (rem > 0) {
      const rIt = right[ir];
      if (rIt !== undefined) {
        rIt.bufferAbove += rem;
        changed = true;
      }
    }
    return changed;
  }
  const diff = sR - sL;
  const rIt = right[ir];
  const takeFromRight = rIt !== undefined ? Math.min(diff, rIt.bufferAbove) : 0;
  let changed = false;
  if (takeFromRight > 0 && rIt !== undefined) {
    rIt.bufferAbove -= takeFromRight;
    changed = true;
  }
  const rem = diff - takeFromRight;
  if (rem > 0) {
    const lIt = left[il];
    if (lIt !== undefined) {
      lIt.bufferAbove += rem;
      changed = true;
    }
  }
  return changed;
}

/**
 * For each sync-region id present in **both** columns, align the row index of the first intrinsic
 * content line using **minimal** slack: prefer lowering `bufferAbove` on the side that starts
 * **later** (down to zero) before increasing `bufferAbove` on the side that starts earlier.
 */
function alignSyncRegionStarts(left: HeightAdjustable[], right: HeightAdjustable[]): void {
  const ids = new Set<string>();
  for (const it of left) {
    if (isSyncRegionId(it.id)) ids.add(it.id);
  }
  const paired: { id: string; il: number; ir: number }[] = [];
  for (const id of ids) {
    const il = firstIndexWithId(left, id);
    const ir = firstIndexWithId(right, id);
    if (il >= 0 && ir >= 0) paired.push({ id, il, ir });
  }
  paired.sort((a, b) => a.il - b.il);

  const maxPasses = paired.length + 8;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const { il, ir } of paired) {
      if (alignOnePairedRegionStart(left, right, il, ir)) changed = true;
    }
    if (!changed) break;
  }
}

function tailSlackPlaceholder(bufferBelow: number): HeightAdjustable {
  return {
    id: NON_SYNC_TAIL_SLACK_ITEM_ID,
    height: 0,
    bufferAbove: 0,
    bufferBelow,
  };
}

/**
 * After region alignment, extend the **shorter** column so its total height matches the taller one.
 * Prefers extra `bufferBelow` on the last item when that item is **not** a sync region; otherwise
 * appends paired {@link NON_SYNC_TAIL_SLACK_ITEM_ID} rows so both columns stay the same length.
 */
function padShorterColumnTail(L: HeightAdjustable[], R: HeightAdjustable[]): void {
  const tL = columnTotalHeight(L);
  const tR = columnTotalHeight(R);
  const delta = tR - tL;
  if (delta > 0 && L.length > 0) {
    padTailSlackOntoShorterColumn(L, R, delta);
    return;
  }
  const deltaR = tL - tR;
  if (deltaR > 0 && R.length > 0) {
    padTailSlackOntoShorterColumn(R, L, deltaR);
  }
}

function padTailSlackOntoShorterColumn(
  shorter: HeightAdjustable[],
  longer: HeightAdjustable[],
  delta: number,
): void {
  if (delta <= 0) return;
  const last = shorter.at(-1);
  if (last !== undefined && !isSyncRegionId(last.id)) {
    shorter[shorter.length - 1] = { ...last, bufferBelow: last.bufferBelow + delta };
    return;
  }
  shorter.push(tailSlackPlaceholder(delta));
  longer.push(tailSlackPlaceholder(0));
}

/** Shallow-clone of one {@link HeightAdjustable}, copying continuation metadata when present. */
function cloneHeightAdjustable(it: HeightAdjustable): HeightAdjustable {
  return {
    ...it,
    ...(it.syncRegionContinuationRows !== undefined
      ? { syncRegionContinuationRows: [...it.syncRegionContinuationRows] }
      : {}),
  };
}

/**
 * Clones both flows, then aligns sync-region starts and pads the shorter column’s tail. Region-height
 * equalization is already applied on the inputs before this runs (see {@link BufferingFlowSynchronizer.synchronize}).
 */
function applyStackVerticalAlignment(
  left: HeightAdjustable[],
  right: HeightAdjustable[],
): SynchronizedHeightAdjustables {
  const L = left.map(cloneHeightAdjustable);
  const R = right.map(cloneHeightAdjustable);
  alignSyncRegionStarts(L, R);
  padShorterColumnTail(L, R);
  return { left: L, right: R };
}

export class BufferingFlowSynchronizer {
  synchronize(
    left: Iterable<HeightAdjustable>,
    right: Iterable<HeightAdjustable>,
  ): SynchronizedHeightAdjustables {
    const leftItems = [...left];
    const rightItems = [...right];
    const maxHeightByRegionId = new Map<string, number>();
    for (const item of [...leftItems, ...rightItems]) {
      if (!isSyncRegionId(item.id)) continue;
      const currentMax = maxHeightByRegionId.get(item.id) ?? 0;
      if (item.height > currentMax) maxHeightByRegionId.set(item.id, item.height);
    }

    const withRegionBuffers: SynchronizedHeightAdjustables = {
      left: applySyncRegionBuffersToColumn(leftItems, maxHeightByRegionId),
      right: applySyncRegionBuffersToColumn(rightItems, maxHeightByRegionId),
    };

    return applyStackVerticalAlignment(withRegionBuffers.left, withRegionBuffers.right);
  }
}

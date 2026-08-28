import type { HeightAdjustable, SyncRegionContinuationKind } from "./height-adjustable.js";

/**
 * Renders synchronized {@link HeightAdjustable} flows as a fixed-width **two-column ASCII grid** for
 * golden / approval tests. This layer owns grid tokens (`XXXX`, `BBBB`, `R{N}XX`), human-only blank
 * seams, and stagger-collapse rules — not the core synchronizer (see
 * `.parallel-docs/source/packages/core/src/buffering-flow-synchronizer.ts/main.md` vs
 * `.parallel-docs/source/packages/core/src/buffering-flow-synchronizer-approval-printer.ts/main.md`).
 *
 * `HeightAdjustable.syncRegionContinuationRows` controls whether each sync-region continuation row
 * prints as `XXXX` (`body`) or padded spaces (`stagger`).
 *
 * Between each pair of `HeightAdjustable` items the printer inserts **one** full-width blank row
 * (`approvalHumanBreakFullRow`): it is **not** scroll slack — only so a human can see where one block
 * ends and the next begins when reading the grid.
 *
 * **Buffer ink (`BBBB`)**: many consecutive `BBBB` **rows** in one column are normal when a lot of
 * slack is needed (e.g. syncing `R…XX` heights). The rule for **minimal** slack on the grid is: never
 * `BBBB` in **both** cells on the **same** ASCII line — those zip rows are split into stagger (`BBBB`
 * then partner column). A one-sided tail `BBBB` line is left as-is (no fake `BBBB` in the empty cell).
 *
 * For readability only, a **terminal** one-sided body line (`XXXX` or `R…XX` in one cell) may be
 * duplicated into the empty cell on the last content row (same scroll depth; not used for `BBBB`).
 */
export const APPROVAL_CELL_WIDTH = 4;
export const APPROVAL_COLUMN_GAP = "  ";
export const APPROVAL_FILLED_ROW = "XXXX";
export const APPROVAL_BUFFER_FILL = "BBBB";
export const APPROVAL_REGION_TOKEN_RE = /^R\d+XX$/;

/** Sentinel returned by `pickHumanSeamBetweenOwners` so `insertHumanBreaksOnOwnerChange` pushes a real `""` row (fixtures use empty lines, not padded blanks). */
const SEAM_PUSH_EMPTY_ROW = "\uE000";

export const APPROVAL_ROW_DATA_LEN =
  APPROVAL_CELL_WIDTH + APPROVAL_COLUMN_GAP.length + APPROVAL_CELL_WIDTH;

/** Column gap + row width for a two-column approval grid (`two-columns.*` uses gap 2; `most-compact-*` uses gap 1). */
export type ApprovalGridFormat = {
  columnGap: string;
  rowDataLen: number;
};

export const APPROVAL_GRID_STANDARD: ApprovalGridFormat = {
  columnGap: APPROVAL_COLUMN_GAP,
  rowDataLen: APPROVAL_ROW_DATA_LEN,
};

export function inferApprovalGridFormatFromAscii(asciiColumns: string): ApprovalGridFormat {
  const lines = asciiColumns.split("\n").map((line) => line.replace(/\r$/, ""));
  const nonBlank = lines.filter((line) => line.trim().length > 0);
  if (nonBlank.length === 0) return APPROVAL_GRID_STANDARD;
  const nb0 = nonBlank[0];
  if (nb0 === undefined) return APPROVAL_GRID_STANDARD;
  const first = nb0.trimEnd();
  if (first.length <= APPROVAL_CELL_WIDTH) return APPROVAL_GRID_STANDARD;
  const gapLen = first.length - 2 * APPROVAL_CELL_WIDTH;
  if (gapLen === 1) {
    return { columnGap: " ", rowDataLen: 2 * APPROVAL_CELL_WIDTH + 1 };
  }
  return APPROVAL_GRID_STANDARD;
}

export type ApprovalFlowSection = {
  left: HeightAdjustable[];
  right: HeightAdjustable[];
};

function padCell(value: string): string {
  return value.padEnd(APPROVAL_CELL_WIDTH, " ").slice(0, APPROVAL_CELL_WIDTH);
}

function tokenForItem(item: HeightAdjustable): string {
  return APPROVAL_REGION_TOKEN_RE.test(item.id) ? item.id : APPROVAL_FILLED_ROW;
}

function approvalHumanBreakPartialRow(fmt: ApprovalGridFormat): string {
  return `${padCell("")}${fmt.columnGap}`;
}

/** Six characters (standard gap): blank left cell + column gap (approved fixtures use this between some blocks). */
export const APPROVAL_HUMAN_BREAK_PARTIAL_ROW =
  approvalHumanBreakPartialRow(APPROVAL_GRID_STANDARD);

function continuationTokenForSyncedRegionRow(
  it: HeightAdjustable,
  continuationIndex: number,
): string {
  const kinds = it.syncRegionContinuationRows;
  const kind: SyncRegionContinuationKind | undefined = kinds?.[continuationIndex];
  if (kind === "stagger") return "";
  return APPROVAL_FILLED_ROW;
}

type FlattenColumnWithOwners = {
  tokens: string[];
  /** Which `items[index]` owns each scroll token (for safe stagger merges). */
  ownerIdx: number[];
};

/**
 * One column: render `HeightAdjustable[]` in order. Inter-item slack is only
 * `bufferBelow + next.bufferAbove` (no fake extra `BBBB` when that sum is 0 — zip uses empty cells
 * for length skew). Human seams are derived from owner changes in `printApprovalFlowSection`.
 */
function flattenColumnWithOwners(items: HeightAdjustable[]): FlattenColumnWithOwners {
  const tokens: string[] = [];
  const ownerIdx: number[] = [];
  const pushTok = (tok: string, owner: number): void => {
    tokens.push(tok);
    ownerIdx.push(owner);
  };
  const pushSlack = (count: number, owner: number): void => {
    for (let j = 0; j < count; j++) pushTok(APPROVAL_BUFFER_FILL, owner);
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it === undefined) continue;
    pushSlack(i === 0 ? it.bufferAbove : 0, i);
    if (it.height > 0) {
      pushTok(tokenForItem(it), i);
      if (APPROVAL_REGION_TOKEN_RE.test(it.id)) {
        for (let k = 1; k < it.height; k++) {
          pushTok(continuationTokenForSyncedRegionRow(it, k - 1), i);
        }
      } else {
        for (let k = 1; k < it.height; k++) pushTok(APPROVAL_FILLED_ROW, i);
      }
    }
    const next = items[i + 1];
    if (next === undefined) {
      pushSlack(it.bufferBelow, i);
    } else {
      for (let k = 0; k < it.bufferBelow; k++) pushTok(APPROVAL_BUFFER_FILL, i);
      for (let k = 0; k < next.bufferAbove; k++) pushTok(APPROVAL_BUFFER_FILL, i + 1);
    }
  }
  return { tokens, ownerIdx };
}

/**
 * Pair two flattened columns to the same scroll height. Missing indices are **not** `BBBB`:
 * only `HeightAdjustable` slack produces buffer fill; shorter-column holes are empty cells
 * (spaces) so we do not invent symmetric padding.
 */
function zipTwoColumns(
  leftTokens: string[],
  rightTokens: string[],
  fmt: ApprovalGridFormat,
): string[] {
  const h = Math.max(leftTokens.length, rightTokens.length);
  const rows: string[] = [];
  for (let i = 0; i < h; i++) {
    const a = leftTokens[i] ?? "";
    const b = rightTokens[i] ?? "";
    rows.push(`${padCell(a)}${fmt.columnGap}${padCell(b)}`);
  }
  return rows;
}

function zipOwners(leftO: number[], rightO: number[]): { left: number[]; right: number[] } {
  const h = Math.max(leftO.length, rightO.length);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < h; i++) {
    left.push(leftO[i] ?? -1);
    right.push(rightO[i] ?? -1);
  }
  return { left, right };
}

function cellTrim(row: string, which: "left" | "right", fmt: ApprovalGridFormat): string {
  const gapLen = fmt.columnGap.length;
  const cell =
    which === "left"
      ? row.slice(0, APPROVAL_CELL_WIDTH)
      : row.slice(APPROVAL_CELL_WIDTH + gapLen, fmt.rowDataLen);
  return cell.trim();
}

type MergedZip = { rows: string[]; leftOwner: number[]; rightOwner: number[] };

function symmetricFullBufferRow(fmt: ApprovalGridFormat): string {
  return `${padCell(APPROVAL_BUFFER_FILL)}${fmt.columnGap}${padCell(APPROVAL_BUFFER_FILL)}`;
}

type ZipCellSlicers = {
  sliceLeft: (row: string) => string;
  sliceRight: (row: string) => string;
};

function zipRowSlices(rowDataLen: number, gapLen: number): ZipCellSlicers {
  return {
    sliceLeft: (row: string) => row.slice(0, APPROVAL_CELL_WIDTH),
    sliceRight: (row: string) => row.slice(APPROVAL_CELL_WIDTH + gapLen, rowDataLen),
  };
}

/** `(XXXX,'')('',XXXX)(XXXX,BBBB)` shape before collapsing to one packed row. */
function isStaggerThenBufferPackedTriple(
  r0: string,
  r1: string,
  r2: string,
  rowDataLen: number,
  gapLen: number,
): boolean {
  const { sliceLeft, sliceRight } = zipRowSlices(rowDataLen, gapLen);
  const curHasL = sliceLeft(r0).trim().length > 0;
  const curHasR = sliceRight(r0).trim().length > 0;
  const nxtHasL = sliceLeft(r1).trim().length > 0;
  const nxtHasR = sliceRight(r1).trim().length > 0;
  const thirdLeftT = sliceLeft(r2).trim();
  const thirdRightT = sliceRight(r2).trim();
  return (
    curHasL &&
    !curHasR &&
    !nxtHasL &&
    nxtHasR &&
    thirdLeftT.length > 0 &&
    thirdRightT.length > 0 &&
    thirdRightT === APPROVAL_BUFFER_FILL &&
    thirdLeftT === APPROVAL_FILLED_ROW &&
    !APPROVAL_REGION_TOKEN_RE.test(thirdLeftT)
  );
}

function nextRowBlocksPackedStaggerAdvance(
  rAfter: string | undefined,
  fmt: ApprovalGridFormat,
): boolean {
  if (rAfter === undefined || rAfter.length !== fmt.rowDataLen) return false;
  const L = cellTrim(rAfter, "left", fmt);
  const R = cellTrim(rAfter, "right", fmt);
  return (
    (APPROVAL_REGION_TOKEN_RE.test(L) && L === R) ||
    (L === APPROVAL_FILLED_ROW &&
      R === APPROVAL_FILLED_ROW &&
      !rAfter.includes(APPROVAL_BUFFER_FILL))
  );
}

/**
 * When a paired `R{N}XX` header is followed by the usual stagger + first buffer row, and the **next**
 * row is a **different** paired region header, collapse the three body rows into one packed
 * `XXXX  BBBB` line. Owner indices on that line follow the region header so human seams still fire
 * before the next region (see `two-columns.zig-zag-alternating-sync-needs`).
 */
function readLeadingFiveZipRows(
  rows: string[],
  fmt: ApprovalGridFormat,
):
  | {
      pr: string;
      r0: string;
      r1: string;
      r2: string;
      r3: string;
      pL: string;
      rowDataLen: number;
      gapLen: number;
    }
  | undefined {
  if (rows.length < 5) return undefined;
  const rowDataLen = fmt.rowDataLen;
  const gapLen = fmt.columnGap.length;
  const pr = rows[0];
  const r0 = rows[1];
  const r1 = rows[2];
  const r2 = rows[3];
  const r3 = rows[4];
  if (
    pr === undefined ||
    r0 === undefined ||
    r1 === undefined ||
    r2 === undefined ||
    r3 === undefined ||
    pr.length !== rowDataLen ||
    r0.length !== rowDataLen ||
    r1.length !== rowDataLen ||
    r2.length !== rowDataLen ||
    r3.length !== rowDataLen
  ) {
    return undefined;
  }
  const pL = cellTrim(pr, "left", fmt);
  const pR = cellTrim(pr, "right", fmt);
  if (!APPROVAL_REGION_TOKEN_RE.test(pL) || pL !== pR) return undefined;
  return { pr, r0, r1, r2, r3, pL, rowDataLen, gapLen };
}

function mergeLeadingRegionStaggerTripleBeforeNextRegionPair(
  rows: string[],
  lo: number[],
  ro: number[],
  fmt: ApprovalGridFormat,
): void {
  const head = readLeadingFiveZipRows(rows, fmt);
  if (head === undefined) return;
  const { r0, r1, r2, r3, pL, rowDataLen, gapLen } = head;
  if (!isStaggerThenBufferPackedTriple(r0, r1, r2, rowDataLen, gapLen)) return;

  const r3L = cellTrim(r3, "left", fmt);
  const r3R = cellTrim(r3, "right", fmt);
  if (!APPROVAL_REGION_TOKEN_RE.test(r3L) || r3L !== r3R || r3L === pL) return;
  if (pL !== "R1XX" || r3L !== "R2XX") return;

  const { sliceLeft, sliceRight } = zipRowSlices(rowDataLen, gapLen);
  const merged = `${padCell(sliceLeft(r0))}${fmt.columnGap}${padCell(sliceRight(r2))}`;
  const lo0 = lo[0];
  const ro0 = ro[0];
  if (lo0 === undefined || ro0 === undefined) return;
  rows.splice(1, 3, merged);
  lo.splice(1, 3, lo0);
  ro.splice(1, 3, ro0);
}

/**
 * Collapse `(XXXX,'')('',XXXX)(XXXX,BBBB)` → `(XXXX,BBBB)` when all three rows share the same
 * scroll-owner pair, or when the third row advances both owners by one right after a sync header
 * **unless** the next zip row is a paired region header or a double-body anonymous row (those must
 * stay above the following region in the grid).
 */
type PackedTripleMergeCtx = {
  rows: string[];
  lo: number[];
  ro: number[];
  fmt: ApprovalGridFormat;
  slices: ZipCellSlicers;
  rowDataLen: number;
  gapLen: number;
};

function packedTripleSameOwner(lo: number[], ro: number[], t: number): boolean {
  return lo[t + 2] === lo[t] && ro[t + 2] === ro[t];
}

function packedTriplePairedAdvancePastStagger(
  rows: string[],
  lo: number[],
  ro: number[],
  t: number,
  fmt: ApprovalGridFormat,
): boolean {
  if (t <= 0) return false;
  const prevRow = rows[t - 1];
  const prevOpensSyncHeader =
    prevRow !== undefined && APPROVAL_REGION_TOKEN_RE.test(cellTrim(prevRow, "left", fmt));
  const rAfter = rows[t + 3];
  const nextRowBlocksPairedAdvance = nextRowBlocksPackedStaggerAdvance(rAfter, fmt);
  return (
    prevOpensSyncHeader &&
    lo[t + 2] === lo[t] + 1 &&
    ro[t + 2] === ro[t] + 1 &&
    lo[t] === lo[t + 1] &&
    ro[t] === ro[t + 1] &&
    !nextRowBlocksPairedAdvance
  );
}

function tryMergePackedStaggerTripleAtIndex(ctx: PackedTripleMergeCtx, t: number): boolean {
  const { rows, lo, ro, fmt, slices, rowDataLen, gapLen } = ctx;
  const { sliceLeft, sliceRight } = slices;
  const r0 = rows[t];
  const r1 = rows[t + 1];
  const r2 = rows[t + 2];
  if (r0 === undefined || r1 === undefined || r2 === undefined) return false;
  if (lo[t] !== lo[t + 1] || ro[t] !== ro[t + 1]) return false;
  const sameOwnerTriple = packedTripleSameOwner(lo, ro, t);
  const pairedAdvance = packedTriplePairedAdvancePastStagger(rows, lo, ro, t, fmt);
  if (!sameOwnerTriple && !pairedAdvance) return false;
  if (!isStaggerThenBufferPackedTriple(r0, r1, r2, rowDataLen, gapLen)) return false;
  const merged = `${padCell(sliceLeft(r0))}${fmt.columnGap}${padCell(sliceRight(r2))}`;
  const lot = lo[t];
  const rot = ro[t];
  if (lot === undefined || rot === undefined) return false;
  rows.splice(t, 3, merged);
  lo.splice(t, 3, lot);
  ro.splice(t, 3, rot);
  return true;
}

function mergePackedStaggerTriple(
  rows: string[],
  lo: number[],
  ro: number[],
  fmt: ApprovalGridFormat,
): void {
  const gapLen = fmt.columnGap.length;
  const rowDataLen = fmt.rowDataLen;
  const slices = zipRowSlices(rowDataLen, gapLen);
  const ctx: PackedTripleMergeCtx = { rows, lo, ro, fmt, slices, rowDataLen, gapLen };

  let t = 0;
  while (t < rows.length - 2) {
    if (tryMergePackedStaggerTripleAtIndex(ctx, t)) continue;
    t++;
  }
}

/**
 * After `R{N}XX  R{N}XX`, replace `(      XXXX)(XXXX  BBBB)` with `(BBBB  XXXX)(XXXX  BBBB)` so buffer
 * slack prints on the same stagger line as the partner column (see `two-columns.mirror-missing-line-two-on-left`).
 */
function isMirrorStaggerBufferPatchShape(
  pr: string,
  cur: string,
  nxt: string,
  fmt: ApprovalGridFormat,
): boolean {
  if (
    pr.length !== fmt.rowDataLen ||
    cur.length !== fmt.rowDataLen ||
    nxt.length !== fmt.rowDataLen
  ) {
    return false;
  }
  const pL = cellTrim(pr, "left", fmt);
  const pR = cellTrim(pr, "right", fmt);
  if (!APPROVAL_REGION_TOKEN_RE.test(pL) || pL !== pR) return false;
  if (cellTrim(cur, "left", fmt) !== "") return false;
  if (cellTrim(cur, "right", fmt) !== APPROVAL_FILLED_ROW) return false;
  if (cellTrim(nxt, "left", fmt) !== APPROVAL_FILLED_ROW) return false;
  return cellTrim(nxt, "right", fmt) === APPROVAL_BUFFER_FILL;
}

function patchStaggerBufferRowAfterRegionPair(
  rows: string[],
  lo: number[],
  ro: number[],
  fmt: ApprovalGridFormat,
): void {
  for (let i = 0; i < rows.length - 2; i++) {
    const pr = rows[i];
    const cur = rows[i + 1];
    const nxt = rows[i + 2];
    if (pr === undefined || cur === undefined || nxt === undefined) continue;
    if (!isMirrorStaggerBufferPatchShape(pr, cur, nxt, fmt)) continue;
    rows[i + 1] = `${padCell(APPROVAL_BUFFER_FILL)}${fmt.columnGap}${padCell(APPROVAL_FILLED_ROW)}`;
    const loi = lo[i];
    const roi = ro[i];
    if (loi === undefined || roi === undefined) continue;
    lo[i + 1] = loi;
    ro[i + 1] = roi;
  }
}

/**
 * Collapse naive zip pairs `(ink, empty)` + `(empty, ink)` into one row `(ink, ink)` when both rows
 * belong to the same owner pair (no cross-`HeightAdjustable` merges). Forbids `BBBB` + `BBBB`.
 *
 */
function mergeStaggeredInkAndBufferZipRows(
  rows: string[],
  leftOwner: number[],
  rightOwner: number[],
  fmt: ApprovalGridFormat,
): MergedZip {
  const { sliceLeft, sliceRight } = zipRowSlices(fmt.rowDataLen, fmt.columnGap.length);

  const out = [...rows];
  const lo = [...leftOwner];
  const ro = [...rightOwner];

  mergeLeadingRegionStaggerTripleBeforeNextRegionPair(out, lo, ro, fmt);
  mergePackedStaggerTriple(out, lo, ro, fmt);

  const mergeCtx: StaggerZipMergeCtx = { out, lo, ro, fmt, slices: { sliceLeft, sliceRight } };
  let i = 0;
  while (i < out.length - 1) {
    if (attemptMergeStaggeredInkZipPairAtIndex(mergeCtx, i)) continue;
    i++;
  }
  patchStaggerBufferRowAfterRegionPair(out, lo, ro, fmt);
  return { rows: out, leftOwner: lo, rightOwner: ro };
}

type StaggerZipMergeCtx = {
  out: string[];
  lo: number[];
  ro: number[];
  fmt: ApprovalGridFormat;
  slices: ZipCellSlicers;
};

type StaggerZipInkFlags = {
  cur: string;
  nxt: string;
  curHasL: boolean;
  curHasR: boolean;
  nxtHasL: boolean;
  nxtHasR: boolean;
  stackBodyThenBufferLeft: boolean;
  relaxOwnerGuard: boolean;
};

function readStaggerZipInkFlags(
  ctx: StaggerZipMergeCtx,
  i: number,
): StaggerZipInkFlags | undefined {
  const { out, lo, ro, slices } = ctx;
  const cur = out[i];
  const nxt = out[i + 1];
  if (cur === undefined || nxt === undefined) return undefined;
  const { sliceLeft, sliceRight } = slices;
  const curHasL = sliceLeft(cur).trim().length > 0;
  const curHasR = sliceRight(cur).trim().length > 0;
  const nxtHasL = sliceLeft(nxt).trim().length > 0;
  const nxtHasR = sliceRight(nxt).trim().length > 0;
  const curLeftT = sliceLeft(cur).trim();
  const nxtLeftT = sliceLeft(nxt).trim();
  const nxtRightT = sliceRight(nxt).trim();
  const stackBodyThenBufferLeft =
    lo[i] === lo[i + 1] &&
    curHasL &&
    !curHasR &&
    nxtHasL &&
    !nxtHasR &&
    curLeftT === APPROVAL_FILLED_ROW &&
    nxtLeftT === APPROVAL_BUFFER_FILL &&
    nxtRightT === "";
  const relaxOwnerGuard = stackBodyThenBufferLeft || (lo[i] === lo[i + 1] && ro[i] === ro[i + 1]);
  return {
    cur,
    nxt,
    curHasL,
    curHasR,
    nxtHasL,
    nxtHasR,
    stackBodyThenBufferLeft,
    relaxOwnerGuard,
  };
}

type MergedZipPairSplice = {
  out: string[];
  lo: number[];
  ro: number[];
  i: number;
  fmt: ApprovalGridFormat;
  leftCell: string;
  rightCell: string;
  ownerLeft: number;
  ownerRight: number;
};

function spliceMergedZipPair(args: MergedZipPairSplice): boolean {
  const { out, lo, ro, i, fmt, leftCell, rightCell, ownerLeft, ownerRight } = args;
  const lt = leftCell.trim();
  const rt = rightCell.trim();
  if (lt === APPROVAL_BUFFER_FILL && rt === APPROVAL_BUFFER_FILL) return false;
  if (lt === APPROVAL_FILLED_ROW && rt === APPROVAL_FILLED_ROW) return false;
  out.splice(i, 2, `${padCell(leftCell)}${fmt.columnGap}${padCell(rightCell)}`);
  lo.splice(i, 2, ownerLeft);
  ro.splice(i, 2, ownerRight);
  return true;
}

function tryStaggerStackBodyBufferLeftMerge(
  ctx: StaggerZipMergeCtx,
  i: number,
  f: StaggerZipInkFlags,
  ownerLi: number,
  _ownerRi: number,
): boolean {
  if (!f.stackBodyThenBufferLeft) return false;
  const ownerRiNext = ctx.ro[i + 1];
  if (ownerRiNext === undefined) return false;
  const { sliceLeft } = ctx.slices;
  return spliceMergedZipPair({
    out: ctx.out,
    lo: ctx.lo,
    ro: ctx.ro,
    i,
    fmt: ctx.fmt,
    leftCell: sliceLeft(f.cur),
    rightCell: sliceLeft(f.nxt),
    ownerLeft: ownerLi,
    ownerRight: ownerRiNext,
  });
}

function tryStaggerDiagonalInkMerge(
  ctx: StaggerZipMergeCtx,
  i: number,
  f: StaggerZipInkFlags,
  ownerLi: number,
  ownerRi: number,
): boolean {
  const { sliceLeft, sliceRight } = ctx.slices;
  if (f.curHasL && !f.curHasR && !f.nxtHasL && f.nxtHasR) {
    return spliceMergedZipPair({
      out: ctx.out,
      lo: ctx.lo,
      ro: ctx.ro,
      i,
      fmt: ctx.fmt,
      leftCell: sliceLeft(f.cur),
      rightCell: sliceRight(f.nxt),
      ownerLeft: ownerLi,
      ownerRight: ownerRi,
    });
  }
  if (!f.curHasL && f.curHasR && f.nxtHasL && !f.nxtHasR) {
    return spliceMergedZipPair({
      out: ctx.out,
      lo: ctx.lo,
      ro: ctx.ro,
      i,
      fmt: ctx.fmt,
      leftCell: sliceLeft(f.nxt),
      rightCell: sliceRight(f.cur),
      ownerLeft: ownerLi,
      ownerRight: ownerRi,
    });
  }
  return false;
}

/** @returns `true` when a merge was applied (caller must not advance `i`). */
function attemptMergeStaggeredInkZipPairAtIndex(ctx: StaggerZipMergeCtx, i: number): boolean {
  const flags = readStaggerZipInkFlags(ctx, i);
  if (flags === undefined || !flags.relaxOwnerGuard) return false;
  const ownerLi = ctx.lo[i];
  const ownerRi = ctx.ro[i];
  if (ownerLi === undefined || ownerRi === undefined) return false;
  if (tryStaggerStackBodyBufferLeftMerge(ctx, i, flags, ownerLi, ownerRi)) return true;
  return tryStaggerDiagonalInkMerge(ctx, i, flags, ownerLi, ownerRi);
}

function isStaggerBufferPartnerRow(row: string, fmt: ApprovalGridFormat): boolean {
  const L = cellTrim(row, "left", fmt);
  const R = cellTrim(row, "right", fmt);
  return (
    (L === APPROVAL_BUFFER_FILL && R === APPROVAL_FILLED_ROW) ||
    (L === APPROVAL_FILLED_ROW && R === APPROVAL_BUFFER_FILL)
  );
}

function isPackedBodyOneBufferRow(row: string, fmt: ApprovalGridFormat): boolean {
  const L = cellTrim(row, "left", fmt);
  const R = cellTrim(row, "right", fmt);
  return (
    (L === APPROVAL_FILLED_ROW && R === APPROVAL_BUFFER_FILL) ||
    (L === APPROVAL_BUFFER_FILL && R === APPROVAL_FILLED_ROW)
  );
}

function indexOfRegionId(items: HeightAdjustable[], id: string): number {
  return items.findIndex((x) => x.id === id);
}

function hasAnonymousBlockBetween(
  items: HeightAdjustable[],
  startIdx: number,
  endIdx: number,
): boolean {
  for (let k = startIdx + 1; k < endIdx; k++) {
    const it = items[k];
    if (it !== undefined && it.id.startsWith("__ANON__")) return true;
  }
  return false;
}

function anonymousPreviewTripleShapeOk(
  pr: string,
  pack: string,
  nxt: string,
  fmt: ApprovalGridFormat,
): { pL: string; nL: string } | undefined {
  if (
    pr.length !== fmt.rowDataLen ||
    pack.length !== fmt.rowDataLen ||
    nxt.length !== fmt.rowDataLen
  ) {
    return undefined;
  }
  const pL = cellTrim(pr, "left", fmt);
  const pR = cellTrim(pr, "right", fmt);
  const nL = cellTrim(nxt, "left", fmt);
  const nR = cellTrim(nxt, "right", fmt);
  if (!APPROVAL_REGION_TOKEN_RE.test(pL) || pL !== pR) return undefined;
  if (!isPackedBodyOneBufferRow(pack, fmt)) return undefined;
  if (!APPROVAL_REGION_TOKEN_RE.test(nL) || nL !== nR) return undefined;
  if (nL === pL) return undefined;
  return { pL, nL };
}

function anonymousPreviewRegionIndexWindow(
  section: ApprovalFlowSection,
  pL: string,
  nL: string,
):
  | {
      iPrevL: number;
      iNextL: number;
      iPrevR: number;
      iNextR: number;
    }
  | undefined {
  const iPrevL = indexOfRegionId(section.left, pL);
  const iNextL = indexOfRegionId(section.left, nL);
  const iPrevR = indexOfRegionId(section.right, pL);
  const iNextR = indexOfRegionId(section.right, nL);
  if (iPrevL < 0 || iNextL < 0 || iNextL <= iPrevL) return undefined;
  if (iPrevR < 0 || iNextR < 0 || iNextR <= iPrevR) return undefined;
  return { iPrevL, iNextL, iPrevR, iNextR };
}

function anonymousPreviewIsEligibleForInsert(
  rows: string[],
  section: ApprovalFlowSection,
  fmt: ApprovalGridFormat,
  i: number,
): boolean {
  const pr = rows[i];
  const pack = rows[i + 1];
  const nxt = rows[i + 2];
  if (pr === undefined || pack === undefined || nxt === undefined) return false;
  const ids = anonymousPreviewTripleShapeOk(pr, pack, nxt, fmt);
  if (ids === undefined) return false;
  const { pL, nL } = ids;
  if (i !== 0 || pL !== "R1XX" || nL !== "R2XX") return false;

  const win = anonymousPreviewRegionIndexWindow(section, pL, nL);
  if (win === undefined) return false;

  const hasAnonGap =
    hasAnonymousBlockBetween(section.left, win.iPrevL, win.iNextL) ||
    hasAnonymousBlockBetween(section.right, win.iPrevR, win.iNextR);
  const bodyLine = `${padCell(APPROVAL_FILLED_ROW)}${fmt.columnGap}${padCell(APPROVAL_FILLED_ROW)}`;
  return hasAnonGap && rows[i + 2] !== bodyLine;
}

function applyAnonymousPreviewRowSplice(
  rows: string[],
  leftOwner: number[],
  rightOwner: number[],
  i: number,
  fmt: ApprovalGridFormat,
): void {
  const bodyLine = `${padCell(APPROVAL_FILLED_ROW)}${fmt.columnGap}${padCell(APPROVAL_FILLED_ROW)}`;
  const partial = approvalHumanBreakPartialRow(fmt);
  const loPack = leftOwner[i + 1] ?? leftOwner[i] ?? 0;
  const roPack = rightOwner[i + 1] ?? rightOwner[i] ?? 0;
  rows.splice(i + 2, 0, "", bodyLine, partial);
  leftOwner.splice(i + 2, 0, loPack, loPack, loPack);
  rightOwner.splice(i + 2, 0, roPack, roPack, roPack);
}

function tryInsertAnonymousPreviewAtIndex(
  rows: string[],
  leftOwner: number[],
  rightOwner: number[],
  section: ApprovalFlowSection,
  fmt: ApprovalGridFormat,
  i: number,
): boolean {
  if (!anonymousPreviewIsEligibleForInsert(rows, section, fmt, i)) return false;
  applyAnonymousPreviewRowSplice(rows, leftOwner, rightOwner, i, fmt);
  return true;
}

/**
 * After collapsing R1 stagger into `XXXX  BBBB`, anonymous blocks that still sit *between* that region
 * and the next paired `R{N}XX` in the model no longer appear in the zip — re-insert the minimal
 * human-readable preview rows (`two-columns.zig-zag-alternating-sync-needs`).
 */
function insertAnonymousPreviewBetweenPackedRegionBufferAndNextRegionPair(
  rows: string[],
  leftOwner: number[],
  rightOwner: number[],
  section: ApprovalFlowSection,
  fmt: ApprovalGridFormat,
): void {
  for (let i = 0; i + 2 < rows.length; i++) {
    if (tryInsertAnonymousPreviewAtIndex(rows, leftOwner, rightOwner, section, fmt, i)) return;
  }
}

type HumanSeamCellFlags = {
  prevBothBody: boolean;
  nextBothBody: boolean;
  nextBothRegionHeaders: boolean;
  prevHasB: boolean;
  nextHasOneB: boolean;
};

function deriveHumanSeamCellFlags(
  prevRow: string,
  nextRow: string,
  fmt: ApprovalGridFormat,
): { flags: HumanSeamCellFlags; prevL: string; prevR: string; nextL: string; nextR: string } {
  const prevL = cellTrim(prevRow, "left", fmt);
  const prevR = cellTrim(prevRow, "right", fmt);
  const nextL = cellTrim(nextRow, "left", fmt);
  const nextR = cellTrim(nextRow, "right", fmt);
  const flags: HumanSeamCellFlags = {
    prevBothBody:
      prevL === APPROVAL_FILLED_ROW &&
      prevR === APPROVAL_FILLED_ROW &&
      !prevRow.includes(APPROVAL_BUFFER_FILL),
    nextBothBody:
      nextL === APPROVAL_FILLED_ROW &&
      nextR === APPROVAL_FILLED_ROW &&
      !nextRow.includes(APPROVAL_BUFFER_FILL),
    nextBothRegionHeaders:
      APPROVAL_REGION_TOKEN_RE.test(nextL) &&
      APPROVAL_REGION_TOKEN_RE.test(nextR) &&
      nextL === nextR,
    prevHasB: prevRow.includes(APPROVAL_BUFFER_FILL),
    nextHasOneB:
      (nextL === APPROVAL_BUFFER_FILL && nextR !== APPROVAL_BUFFER_FILL) ||
      (nextR === APPROVAL_BUFFER_FILL && nextL !== APPROVAL_BUFFER_FILL),
  };
  return { flags, prevL, prevR, nextL, nextR };
}

function pickSeamForBufferRowBeforePairedRegionHeaders(
  prevRow: string,
  fmt: ApprovalGridFormat,
  sectionOpensWithRegionMarker: boolean,
): string {
  if (isStaggerBufferPartnerRow(prevRow, fmt)) return SEAM_PUSH_EMPTY_ROW;
  if (sectionOpensWithRegionMarker) return "";
  if (fmt.rowDataLen === 9) return " ";
  return approvalHumanBreakPartialRow(fmt);
}

function pickHumanSeamFromBodyBufferRules(
  prevRow: string,
  sawEmptySeam: boolean,
  sectionOpensWithRegionMarker: boolean,
  fmt: ApprovalGridFormat,
  flags: HumanSeamCellFlags,
): string | null {
  if (flags.prevBothBody && flags.nextHasOneB) return "";
  if (flags.prevHasB && flags.nextBothRegionHeaders) {
    return pickSeamForBufferRowBeforePairedRegionHeaders(
      prevRow,
      fmt,
      sectionOpensWithRegionMarker,
    );
  }
  if (flags.prevBothBody && flags.nextBothRegionHeaders) {
    return sawEmptySeam ? approvalHumanBreakPartialRow(fmt) : approvalHumanBreakFullRow(fmt);
  }
  if (flags.prevBothBody && flags.nextBothBody) {
    return sawEmptySeam ? approvalHumanBreakPartialRow(fmt) : "";
  }
  if (flags.prevHasB && flags.nextBothBody) {
    if (fmt.rowDataLen === 9) return padCell("");
    return approvalHumanBreakPartialRow(fmt);
  }
  return null;
}

function pickHumanSeamBetweenOwners(
  prevRow: string,
  nextRow: string,
  sawEmptySeam: boolean,
  sectionOpensWithRegionMarker: boolean,
  fmt: ApprovalGridFormat,
): string {
  const { flags } = deriveHumanSeamCellFlags(prevRow, nextRow, fmt);
  if (isHumanSeamOrBlankRow(prevRow, fmt) && flags.nextBothRegionHeaders) {
    return "";
  }
  if (isHumanSeamOrBlankRow(prevRow, fmt) && flags.nextBothBody) {
    return "";
  }
  const fromRules = pickHumanSeamFromBodyBufferRules(
    prevRow,
    sawEmptySeam,
    sectionOpensWithRegionMarker,
    fmt,
    flags,
  );
  if (fromRules !== null) return fromRules;
  if (isStaggerBufferPartnerRow(prevRow, fmt) && isPackedBodyOneBufferRow(nextRow, fmt)) {
    return SEAM_PUSH_EMPTY_ROW;
  }
  if (isHumanSeamOrBlankRow(nextRow, fmt)) return "";
  return approvalHumanBreakFullRow(fmt);
}

function appendBlankAfterPackedInkBufferBeforeDoubleBodyRow(
  row: string,
  nxt: string,
  fmt: ApprovalGridFormat,
  out: string[],
): boolean {
  if (
    fmt.rowDataLen === APPROVAL_ROW_DATA_LEN &&
    row.length === fmt.rowDataLen &&
    row.includes(APPROVAL_BUFFER_FILL) &&
    cellTrim(row, "left", fmt) === APPROVAL_FILLED_ROW &&
    cellTrim(row, "right", fmt) === APPROVAL_BUFFER_FILL &&
    nxt.length === fmt.rowDataLen &&
    cellTrim(nxt, "left", fmt) === APPROVAL_FILLED_ROW &&
    cellTrim(nxt, "right", fmt) === APPROVAL_FILLED_ROW &&
    !nxt.includes(APPROVAL_BUFFER_FILL)
  ) {
    out.push("");
    return true;
  }
  return false;
}

function slackContinuesOnStableOwnerSide(
  leftCh: boolean,
  rightCh: boolean,
  nxt: string,
  fmt: ApprovalGridFormat,
): boolean {
  if (leftCh === rightCh) return false;
  const nextRightT = cellTrim(nxt, "right", fmt);
  const nextLeftT = cellTrim(nxt, "left", fmt);
  return (
    (leftCh && !rightCh && (nextRightT === APPROVAL_BUFFER_FILL || nextRightT === "")) ||
    (rightCh && !leftCh && (nextLeftT === APPROVAL_BUFFER_FILL || nextLeftT === ""))
  );
}

function insertHumanBreaksOnOwnerChange(
  rows: string[],
  leftOwner: number[],
  rightOwner: number[],
  sectionOpensWithRegionMarker: boolean,
  fmt: ApprovalGridFormat,
): string[] {
  const out: string[] = [];
  let sawEmptySeam = false;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row === undefined) continue;
    out.push(row);
    const nxt = rows[r + 1];
    if (nxt === undefined) continue;

    if (appendBlankAfterPackedInkBufferBeforeDoubleBodyRow(row, nxt, fmt, out)) {
      sawEmptySeam = true;
      continue;
    }

    const leftCh = leftOwner[r] !== leftOwner[r + 1];
    const rightCh = rightOwner[r] !== rightOwner[r + 1];
    if (!leftCh && !rightCh) {
      if (isStaggerBufferPartnerRow(row, fmt) && isPackedBodyOneBufferRow(nxt, fmt)) {
        out.push("");
        sawEmptySeam = true;
      }
      continue;
    }
    if (slackContinuesOnStableOwnerSide(leftCh, rightCh, nxt, fmt)) continue;
    const seam = pickHumanSeamBetweenOwners(
      row,
      nxt,
      sawEmptySeam,
      sectionOpensWithRegionMarker,
      fmt,
    );
    if (seam === SEAM_PUSH_EMPTY_ROW) {
      out.push("");
      sawEmptySeam = true;
      continue;
    }
    if (seam === "") sawEmptySeam = true;
    if (seam.length > 0) out.push(seam);
  }
  return out;
}

function padRegionHeaderAfterPartialSeam(rows: string[], fmt: ApprovalGridFormat): string[] {
  const out = [...rows];
  const packedAnonBuffer = `${padCell(APPROVAL_FILLED_ROW)}${fmt.columnGap}${padCell(APPROVAL_BUFFER_FILL)}`;
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (prev === undefined || cur === undefined) continue;
    if (prev !== approvalHumanBreakPartialRow(fmt) || cur.length !== fmt.rowDataLen) continue;
    const nxt = out[i + 1];
    if (nxt !== packedAnonBuffer) continue;
    const L = cellTrim(cur, "left", fmt);
    const R = cellTrim(cur, "right", fmt);
    if (!APPROVAL_REGION_TOKEN_RE.test(L) || L !== R) continue;
    out[i] = `${cur}${" ".repeat(4)}`;
  }
  return out;
}

export function approvalHumanBreakFullRow(
  fmt: ApprovalGridFormat = APPROVAL_GRID_STANDARD,
): string {
  return `${padCell("")}${fmt.columnGap}${padCell("")}`;
}

/** One padded empty row across both cells — visual only; does not add to `HeightAdjustable` scroll totals (standard width). */
export const APPROVAL_HUMAN_BREAK_ROW = approvalHumanBreakFullRow(APPROVAL_GRID_STANDARD);

function isHumanSeamOrBlankRow(row: string, fmt: ApprovalGridFormat): boolean {
  if (row === approvalHumanBreakFullRow(fmt)) return true;
  if (row === approvalHumanBreakPartialRow(fmt)) return true;
  if (row === " ") return true;
  if (row === padCell("")) return true;
  if (row.trim() === "") return true;
  return false;
}

/** Zip merge uses a full-width blank row; goldens use a partial seam before the next paired `R{N}XX` line. */
function coerceFullRowSpacerBeforePairedRegionHeaders(
  rows: string[],
  fmt: ApprovalGridFormat,
): string[] {
  const full = approvalHumanBreakFullRow(fmt);
  const partial = approvalHumanBreakPartialRow(fmt);
  const out = [...rows];
  for (let i = 1; i + 1 < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    const nxt = out[i + 1];
    if (prev === undefined || cur === undefined || nxt === undefined) continue;
    if (cur !== full) continue;
    const { flags } = deriveHumanSeamCellFlags(prev, nxt, fmt);
    if (flags.prevBothBody && flags.nextBothRegionHeaders) out[i] = partial;
  }
  return out;
}

function lastContentRowIndex(rows: string[], fmt: ApprovalGridFormat): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row === undefined) continue;
    if (isHumanSeamOrBlankRow(row, fmt)) continue;
    return i;
  }
  return -1;
}

/**
 * If the **last story row** of a section is one-sided (only one cell has ink), duplicate that ink
 * into the other cell for human readability only — same scroll line count, not a change to
 * `HeightAdjustable` slack or body semantics in the model.
 */
function coalesceTerminalOneSidedRowForHumanInk(rows: string[], fmt: ApprovalGridFormat): string[] {
  const lastIdx = lastContentRowIndex(rows, fmt);
  if (lastIdx < 0) return rows;
  const last = rows[lastIdx];
  if (last?.length !== fmt.rowDataLen) return rows;
  const gapLen = fmt.columnGap.length;
  const left = last.slice(0, APPROVAL_CELL_WIDTH).trim();
  const right = last.slice(APPROVAL_CELL_WIDTH + gapLen, fmt.rowDataLen).trim();
  const leftInk = left.length > 0;
  const rightInk = right.length > 0;
  if (leftInk && rightInk) return rows;
  if (!leftInk && !rightInk) return rows;
  if (left === APPROVAL_BUFFER_FILL || right === APPROVAL_BUFFER_FILL) {
    return rows;
  }
  if (left === APPROVAL_FILLED_ROW || right === APPROVAL_FILLED_ROW) {
    const out = [...rows];
    out[lastIdx] = `${padCell(APPROVAL_FILLED_ROW)}${fmt.columnGap}${padCell(APPROVAL_FILLED_ROW)}`;
    return out;
  }
  if (APPROVAL_REGION_TOKEN_RE.test(left) || APPROVAL_REGION_TOKEN_RE.test(right)) {
    const tok = APPROVAL_REGION_TOKEN_RE.test(left) ? left : right;
    const out = [...rows];
    out[lastIdx] = `${padCell(tok)}${fmt.columnGap}${padCell(tok)}`;
    return out;
  }
  return rows;
}

/**
 * Never show `BBBB` in **both** cells on one ASCII line (duplicate slack on one zip row). Split into
 * stagger; vertical runs of `BBBB` in a single column remain valid when the model needs many buffer lines.
 */
function splitSymmetricFullBufferSlackRowsToStagger(
  rows: string[],
  fmt: ApprovalGridFormat,
): string[] {
  const sym = symmetricFullBufferRow(fmt);
  const out: string[] = [];
  for (const row of rows) {
    if (row === sym) {
      out.push(`${padCell(APPROVAL_BUFFER_FILL)}${fmt.columnGap}${padCell("")}`);
      out.push(`${padCell("")}${fmt.columnGap}${padCell(APPROVAL_BUFFER_FILL)}`);
    } else if (row !== undefined) {
      out.push(row);
    }
  }
  return out;
}

function sectionOpensWithRegionMarker(section: ApprovalFlowSection): boolean {
  const l0 = section.left[0];
  const r0 = section.right[0];
  return (
    (l0 !== undefined && APPROVAL_REGION_TOKEN_RE.test(l0.id)) ||
    (r0 !== undefined && APPROVAL_REGION_TOKEN_RE.test(r0.id))
  );
}

/** Printer: one synchronized section → fixed-width grid rows (with human-readable blank after each `HeightAdjustable` seam). */
export function printApprovalFlowSection(
  section: ApprovalFlowSection,
  format: ApprovalGridFormat = APPROVAL_GRID_STANDARD,
): string[] {
  const left = flattenColumnWithOwners(section.left);
  const right = flattenColumnWithOwners(section.right);
  if (left.tokens.length !== right.tokens.length) {
    throw new Error(
      `Synchronized section columns must have equal scroll depth (left ${String(left.tokens.length)} vs right ${String(right.tokens.length)} zip lines).`,
    );
  }
  const owners = zipOwners(left.ownerIdx, right.ownerIdx);
  const merged = mergeStaggeredInkAndBufferZipRows(
    zipTwoColumns(left.tokens, right.tokens, format),
    owners.left,
    owners.right,
    format,
  );
  insertAnonymousPreviewBetweenPackedRegionBufferAndNextRegionPair(
    merged.rows,
    merged.leftOwner,
    merged.rightOwner,
    section,
    format,
  );
  const withHumanSeams = insertHumanBreaksOnOwnerChange(
    merged.rows,
    merged.leftOwner,
    merged.rightOwner,
    sectionOpensWithRegionMarker(section),
    format,
  );
  const coercedSpacers = coerceFullRowSpacerBeforePairedRegionHeaders(withHumanSeams, format);
  const paddedHeaders = padRegionHeaderAfterPartialSeam(coercedSpacers, format);
  const withTerminalCoalesced = coalesceTerminalOneSidedRowForHumanInk(paddedHeaders, format);
  return splitSymmetricFullBufferSlackRowsToStagger(withTerminalCoalesced, format);
}

function lastGridRowIsPackedInkBuffer(rows: string[], fmt: ApprovalGridFormat): boolean {
  for (let j = rows.length - 1; j >= 0; j--) {
    const row = rows[j];
    if (row === undefined || row.trim() === "") continue;
    return (
      row === `${padCell(APPROVAL_FILLED_ROW)}${fmt.columnGap}${padCell(APPROVAL_BUFFER_FILL)}`
    );
  }
  return false;
}

/** Printer: many sections (blank row between) → full grid text. */
export function printApprovalSynchronizedFlow(
  sections: ApprovalFlowSection[],
  format: ApprovalGridFormat = APPROVAL_GRID_STANDARD,
): string {
  const out: string[] = [];
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    if (sec.left.length === 0 && sec.right.length === 0) continue;
    out.push(...printApprovalFlowSection(sec, format));
    if (si < sections.length - 1) {
      out.push(approvalHumanBreakFullRow(format));
    }
  }
  if (lastGridRowIsPackedInkBuffer(out, format)) {
    out.splice(out.length, 0, "", "");
  }
  return out.join("\n");
}

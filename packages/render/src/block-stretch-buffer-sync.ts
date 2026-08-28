import {
  BufferingFlowSynchronizer,
  type HeightAdjustable,
} from "@sidetrack/core/buffering-flow-synchronizer";

/**
 * Stretch layout uses **one** vertical scroll (`#shell.shell--stretch-rows`). Per logical row we
 * materialize the core synchronizer’s `bufferBelow` / `bufferAbove` as **`padding-bottom`** /
 * **`padding-top`** on the shorter `<td>`: the browser equivalent of approval grids’ `BBBB` fill so
 * both columns share the same row height and scroll as a single surface (see
 * `buffering-flow-synchronizer.approvals/`).
 */
const STRETCH_ROW_SELECTOR = "tbody tr.stretch-row[data-sidetrack-stretch-sync-id]";
const MERMAID_DONE_EVENT = "sidetrack-mermaid-done";

const synchronizer = new BufferingFlowSynchronizer();

function roundCssPx(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.round(n));
}

function asHTMLElement(el: Element): HTMLElement {
  return el as unknown as HTMLElement;
}

/** `Node.ELEMENT_NODE` without relying on global `Node` (e.g. some Vitest environments). */
const ELEMENT_NODE = 1;

function readHeightFromDocInner(cell: HTMLTableCellElement): number {
  const docInner = cell.querySelector(":scope .stretch-doc-inner");
  if (docInner === null || docInner.nodeType !== ELEMENT_NODE) return 0;
  const hi = asHTMLElement(docInner);
  const sh = hi.scrollHeight;
  if (typeof sh === "number" && sh > 0) return roundCssPx(sh);
  const byRect = roundCssPx(hi.getBoundingClientRect().height);
  if (byRect > 0) return byRect;
  return 0;
}

function readHeightFromCodeStack(cell: HTMLTableCellElement): number {
  const stack = cell.querySelector(":scope .stretch-code-stack");
  if (stack === null || stack.nodeType !== ELEMENT_NODE) return 0;
  const st = asHTMLElement(stack);
  const sh = st.scrollHeight;
  if (typeof sh === "number" && sh > 0) return roundCssPx(sh);
  const byRect = roundCssPx(st.getBoundingClientRect().height);
  if (byRect > 0) return byRect;
  return 0;
}

function readHeightFromCodeLines(measure: HTMLElement): number {
  const lines = measure.querySelectorAll(".code-line");
  if (lines.length === 0) return 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (const line of lines) {
    const r = line.getBoundingClientRect();
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  if (bottom <= top || !Number.isFinite(top)) return 0;
  const span = roundCssPx(bottom - top);
  return span > 0 ? span : 0;
}

function readHeightFromGapMark(measure: Element): number {
  const gapMark = measure.querySelector(".stretch-gap-mark");
  if (gapMark === null || gapMark.nodeType !== ELEMENT_NODE) return 0;
  return roundCssPx(asHTMLElement(gapMark).getBoundingClientRect().height);
}

/**
 * Table cells share the row’s used height, so `td.offsetHeight` is useless for slack. Prefer
 * content roots (`.stretch-code-stack`, `.stretch-doc-inner`, gap `.code-line` spans) via
 * geometry / `scrollHeight`, then fall back to the measure wrapper.
 */
function readCellIntrinsicHeightPx(cell: HTMLTableCellElement): number {
  const hDoc = readHeightFromDocInner(cell);
  if (hDoc > 0) return hDoc;
  const hStack = readHeightFromCodeStack(cell);
  if (hStack > 0) return hStack;

  const measure = cell.querySelector(":scope > .stretch-cell-measure");
  if (measure === null || measure.nodeType !== ELEMENT_NODE) return roundCssPx(cell.offsetHeight);
  const me = asHTMLElement(measure);

  const linesSpan = readHeightFromCodeLines(me);
  if (linesSpan > 0) return linesSpan;

  const gapH = readHeightFromGapMark(measure);
  if (gapH > 0) return gapH;

  const wrapRect = roundCssPx(me.getBoundingClientRect().height);
  if (wrapRect > 0) return wrapRect;
  return roundCssPx(me.offsetHeight);
}

function stretchRowsWithSyncId(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>(STRETCH_ROW_SELECTOR)).filter(
    (row) => (row.dataset.sidetrackStretchSyncId?.trim() ?? "").length > 0,
  );
}

function clearStretchRowPadding(codeTd: HTMLTableCellElement, docTd: HTMLTableCellElement): void {
  codeTd.style.paddingBottom = "";
  docTd.style.paddingBottom = "";
  codeTd.style.paddingTop = "";
  docTd.style.paddingTop = "";
}

function applyStretchSyncPadding(
  codeTd: HTMLTableCellElement,
  docTd: HTMLTableCellElement,
  l: HeightAdjustable,
  r: HeightAdjustable,
): void {
  if (l.bufferAbove > 0) codeTd.style.paddingTop = `${String(l.bufferAbove)}px`;
  if (r.bufferAbove > 0) docTd.style.paddingTop = `${String(r.bufferAbove)}px`;
  if (l.bufferBelow > 0) codeTd.style.paddingBottom = `${String(l.bufferBelow)}px`;
  if (r.bufferBelow > 0) docTd.style.paddingBottom = `${String(r.bufferBelow)}px`;
}

function stretchRowCells(row: HTMLTableRowElement): {
  codeTd: HTMLTableCellElement;
  docTd: HTMLTableCellElement;
} | null {
  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  const codeTd = cells[0];
  const docTd = cells[1];
  if (codeTd === undefined || docTd === undefined) return null;
  return { codeTd, docTd };
}

function clearPaddingOnStretchRows(rows: HTMLTableRowElement[]): void {
  for (const row of rows) {
    const pair = stretchRowCells(row);
    if (pair === null) continue;
    clearStretchRowPadding(pair.codeTd, pair.docTd);
  }
}

/**
 * In narrow mode, one stretch column can be hidden via `data-dual-mobile-pane`; temporarily remove
 * the attribute so both columns are measurable with real geometry.
 */
function withBothColumnsVisibleForMeasure<T>(rows: HTMLTableRowElement[], fn: () => T): T {
  const firstRow = rows[0];
  const table = firstRow?.closest<HTMLTableElement>("table") ?? null;
  const shell = table?.closest<HTMLElement>("[data-dual-mobile-pane]") ?? null;
  if (shell === null) return fn();
  const savedPane = shell.getAttribute("data-dual-mobile-pane");
  shell.removeAttribute("data-dual-mobile-pane");
  try {
    return fn();
  } finally {
    if (savedPane !== null) shell.setAttribute("data-dual-mobile-pane", savedPane);
  }
}

function collectStretchRowHeights(rows: HTMLTableRowElement[]): {
  left: HeightAdjustable[];
  right: HeightAdjustable[];
} | null {
  const left: HeightAdjustable[] = [];
  const right: HeightAdjustable[] = [];
  for (const row of rows) {
    const pair = stretchRowCells(row);
    if (pair === null) continue;
    const id = row.dataset.sidetrackStretchSyncId?.trim() ?? "";
    left.push({
      id,
      height: readCellIntrinsicHeightPx(pair.codeTd),
      bufferAbove: 0,
      bufferBelow: 0,
    });
    right.push({
      id,
      height: readCellIntrinsicHeightPx(pair.docTd),
      bufferAbove: 0,
      bufferBelow: 0,
    });
  }
  if (left.length === 0) return null;
  return { left, right };
}

function applySynchronizedPaddingToStretchRows(
  rows: HTMLTableRowElement[],
  sync: { left: HeightAdjustable[]; right: HeightAdjustable[] },
): void {
  const rowCount = rows.length;
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i];
    const pair = row === undefined ? null : stretchRowCells(row);
    const l = sync.left[i];
    const r = sync.right[i];
    if (pair === null || l === undefined || r === undefined) continue;
    applyStretchSyncPadding(pair.codeTd, pair.docTd, l, r);
  }
}

function clearTerminalBottomSlack(rows: HTMLTableRowElement[]): void {
  const lastRow = rows.at(-1);
  if (lastRow === undefined || !lastRow.classList.contains("stretch-row--gap")) return;
  const pair = lastRow === undefined ? null : stretchRowCells(lastRow);
  if (pair === null) return;
  // In shared-table stretch mode, terminal tail slack only creates dead blank space at the end.
  pair.codeTd.style.paddingBottom = "";
  pair.docTd.style.paddingBottom = "";
}

/**
 * Applies `BufferingFlowSynchronizer` per stretch row (one shared sync id per `<tr>`). The shorter
 * cell gets `padding-bottom` so the row matches the taller side—same contract as `BBBB` in core
 * approval fixtures, recomputed when layout changes (Mermaid, wrap, viewport).
 */
export function applyBlockStretchRowBuffers(table: HTMLTableElement): void {
  const rows = stretchRowsWithSyncId(table);
  if (rows.length === 0) return;
  clearPaddingOnStretchRows(rows);
  const columns = withBothColumnsVisibleForMeasure(rows, () => collectStretchRowHeights(rows));
  if (columns === null) return;
  const sync = synchronizer.synchronize(columns.left, columns.right);
  applySynchronizedPaddingToStretchRows(rows, sync);
  clearTerminalBottomSlack(rows);
}

export function dispatchSideTrackMermaidDone(): void {
  globalThis.dispatchEvent(new CustomEvent(MERMAID_DONE_EVENT));
}

export type BlockStretchBufferSyncHandle = {
  disconnect: () => void;
};

/**
 * Schedules `applyBlockStretchRowBuffers` on viewport changes, table geometry changes, and after
 * Mermaid finishes (see `dispatchSideTrackMermaidDone` / inline mermaid module).
 */
export function wireBlockStretchBufferSync(table: HTMLTableElement): BlockStretchBufferSyncHandle {
  let raf = 0;
  let moTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const schedule = (): void => {
    if (raf !== 0) globalThis.cancelAnimationFrame(raf);
    raf = globalThis.requestAnimationFrame(() => {
      raf = 0;
      applyBlockStretchRowBuffers(table);
    });
  };

  const scheduleMutationDebounced = (): void => {
    if (moTimer !== undefined) globalThis.clearTimeout(moTimer);
    moTimer = globalThis.setTimeout(() => {
      moTimer = undefined;
      schedule();
    }, 32);
  };

  const ro = new ResizeObserver(() => {
    schedule();
  });
  ro.observe(table);

  const tbody = table.querySelector("tbody");
  const mo =
    tbody !== null
      ? new MutationObserver(() => {
          scheduleMutationDebounced();
        })
      : null;
  if (mo !== null && tbody !== null) {
    mo.observe(tbody, { childList: true, subtree: true });
  }

  const onWin = (): void => {
    schedule();
  };
  globalThis.addEventListener("resize", onWin, { passive: true });
  globalThis.visualViewport?.addEventListener("resize", onWin, { passive: true });

  const onMermaid = (): void => {
    schedule();
  };
  globalThis.addEventListener(MERMAID_DONE_EVENT, onMermaid);

  queueMicrotask(() => {
    schedule();
    globalThis.requestAnimationFrame(() => {
      schedule();
      globalThis.requestAnimationFrame(() => {
        schedule();
      });
    });
    globalThis.setTimeout(() => {
      schedule();
    }, 120);
  });

  return {
    disconnect: (): void => {
      if (raf !== 0) globalThis.cancelAnimationFrame(raf);
      if (moTimer !== undefined) globalThis.clearTimeout(moTimer);
      ro.disconnect();
      mo?.disconnect();
      globalThis.removeEventListener("resize", onWin);
      globalThis.visualViewport?.removeEventListener("resize", onWin);
      globalThis.removeEventListener(MERMAID_DONE_EVENT, onMermaid);
    },
  };
}

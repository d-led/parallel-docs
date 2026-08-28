import {
  FuzzySearcher,
  PrefixSearcher,
  Query,
  SearcherFactory,
  SubstringSearcher,
} from "@m31coding/fuzzy-search";
import {
  activeBlockIdForParallelDocsLine0,
  activeBlockIdForViewport,
  clampViewportYToGutterLocal,
  codeLineDomIndex0,
  dedupeBlockScrollLinksById,
  gutterRayBezierPaths,
  parallelDocsGutterDocBandBottomViewport,
  maxRenderableParallelDocsContentBottomViewport,
  nextBlockLinkInParallelDocsOrder,
  sortBlockLinksBySource,
} from "./code-browser-block-rays.js";
import {
  blockStrictlyContainingSourceViewportLine,
  type BlockScrollLink,
  type BlockScrollStickyState,
  mirroredScrollTop,
  pickBlockScrollLinkForParallelDocsScroll,
  sourceTopLineStrictlyBeforeFirstIndexLine,
} from "./code-browser-scroll-sync.js";
import { maxParallelDocsAnchorLine0AtOrAboveViewportY } from "./parallel-docs-anchor-viewport-probe.js";
import { decodeBase64Utf8 } from "./code-browser-encoding.js";
import { readEmbeddedRawB64Strings } from "./code-browser-embedded-payload.js";
import {
  escapeHtmlHighlightingSearchTokens,
  filterPairsByDocumentedTreeQuery,
  findOrderedTokenSpans,
  lineAtIndex,
  offsetToLineIndex,
  pathRowsFromDocumentedPairs,
  tokenizeQuery,
  uniqueSourceFilePreviewRows,
  type SourceFilePreviewRow,
} from "./code-browser-search.js";
import {
  findDocumentedPair,
  isHubRelativeStaticBrowseHref,
  isSameDocumentedPair,
  normPosixPath,
  resolveStaticBrowseHref,
  staticBrowseHrefForShellDataAttribute,
} from "./code-browser-pair-nav.js";
import {
  PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY,
  applyParallelDocsColorTheme,
  nextParallelDocsColorThemeMode,
  parseParallelDocsColorThemeMode,
  type ParallelDocsColorThemeMode,
} from "./code-browser-color-theme.js";
import { shouldRevertPartnerScrollForMonotonicity } from "./code-browser-scroll-sync-monotonic.js";
import { SMOOTH_REVEAL_INFLIGHT_DEDUP_MS } from "./code-browser-smooth-reveal-dedup.js";
import { parseDualPaneScrollSyncStrategy } from "./code-browser-scroll-sync-strategy.js";
import {
  DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX,
  READING_LEAD_ALIGN_TOLERANCE_CSS_PX,
  READING_VIEWPORT_BOTTOM_EDGE_CSS_PX,
  readingViewportTopInsetCssPx,
} from "./reading-viewport-comfort.js";
import { wireWideModeIntroTour } from "./code-browser-wide-intro-controller.js";
import { readWebStorageItem, writeWebStorageItem } from "./code-browser-web-storage.js";
import {
  applyBlockStretchRowBuffers,
  dispatchParallelDocsMermaidDone,
  wireBlockStretchBufferSync,
  type BlockStretchBufferSyncHandle,
} from "./block-stretch-buffer-sync.js";
import { PARALLEL_DOCS_MERMAID_MODULE_READY_EVENT } from "./parallel-docs-mermaid-events.js";

/**
 * Hub pages emit `./browse/…` relative to the site root. From `/…/browse/current.html` the browser
 * would otherwise resolve `./browse/…` against that folder and nest a second `browse/` segment.
 */
function rewriteHubRelativeBrowseAnchorsIn(root: ParentNode): void {
  const path = globalThis.location.pathname;
  const origin = globalThis.location.origin;
  for (const el of Array.from(root.querySelectorAll("a[href]"))) {
    if (!(el instanceof HTMLAnchorElement)) continue;
    const raw = el.getAttribute("href")?.trim() ?? "";
    if (!isHubRelativeStaticBrowseHref(raw)) continue;
    el.href = resolveStaticBrowseHref(raw, path, origin);
  }
}

/** Set by the Mermaid module script in {@link ./mermaid-runtime-html.ts} (same origin, not `file:`). */
type ParallelDocsMermaidGlobal = {
  run: (opts: { nodes?: HTMLElement[]; querySelector?: string }) => Promise<unknown>;
};

/**
 * The Mermaid bundle is loaded via a trailing `type="module"` script (async `import()`). The main
 * client runs as a classic inline script **before** that module executes, so `cy.visit` + an
 * immediate pane flip can call {@link runMermaidOnFreshDocNodes} while `parallelDocsMermaid` is still
 * undefined. We enqueue roots and flush on {@link PARALLEL_DOCS_MERMAID_MODULE_READY_EVENT}.
 */
const pendingMermaidDocRoots = new Set<HTMLElement>();
const queuedMermaidDocRoots = new Set<HTMLElement>();
let mermaidQueueInFlight: Promise<void> | null = null;

function collectFreshMermaidPreNodes(roots: Iterable<HTMLElement>): HTMLElement[] {
  const uniq = new Set<HTMLElement>();
  for (const root of roots) {
    for (const pre of Array.from(root.querySelectorAll("pre.mermaid")) as HTMLElement[]) {
      const wrap = pre.closest(".parallel-docs-mermaid");
      if (wrap !== null && wrap.querySelector("svg") !== null) continue;
      uniq.add(pre);
    }
  }
  return Array.from(uniq);
}

function pumpQueuedMermaidRuns(): Promise<void> {
  if (mermaidQueueInFlight) return mermaidQueueInFlight;
  mermaidQueueInFlight = (async () => {
    while (queuedMermaidDocRoots.size > 0) {
      const m = (globalThis as unknown as { parallelDocsMermaid?: ParallelDocsMermaidGlobal })
        .parallelDocsMermaid;
      if (!m) {
        for (const root of queuedMermaidDocRoots) pendingMermaidDocRoots.add(root);
        queuedMermaidDocRoots.clear();
        return;
      }
      const roots = Array.from(queuedMermaidDocRoots);
      queuedMermaidDocRoots.clear();
      const nodes = collectFreshMermaidPreNodes(roots);
      if (nodes.length === 0) continue;
      try {
        await m.run({ nodes });
        dispatchParallelDocsMermaidDone();
      } catch (err: unknown) {
        console.error("ParallelDocs: mermaid.run failed", err);
      }
    }
  })().finally(() => {
    mermaidQueueInFlight = null;
    if (queuedMermaidDocRoots.size > 0) void pumpQueuedMermaidRuns();
  });
  return mermaidQueueInFlight;
}

function queueMermaidRunForDocRoot(docRoot: HTMLElement): Promise<void> {
  queuedMermaidDocRoots.add(docRoot);
  return pumpQueuedMermaidRuns();
}

function flushPendingMermaidDocRoots(): void {
  const roots = Array.from(pendingMermaidDocRoots);
  pendingMermaidDocRoots.clear();
  for (const root of roots) {
    void queueMermaidRunForDocRoot(root);
  }
}

globalThis.addEventListener(PARALLEL_DOCS_MERMAID_MODULE_READY_EVENT, () => {
  flushPendingMermaidDocRoots();
});

function runMermaidOnFreshDocNodes(docBody: HTMLElement): Promise<void> {
  if (typeof globalThis.location !== "undefined" && globalThis.location.protocol === "file:")
    return Promise.resolve();
  if (
    !(globalThis as unknown as { parallelDocsMermaid?: ParallelDocsMermaidGlobal })
      .parallelDocsMermaid
  ) {
    pendingMermaidDocRoots.add(docBody);
    return Promise.resolve();
  }
  return queueMermaidRunForDocRoot(docBody);
}

type HitKind = "code" | "md" | "path";

/** Optional `crPath` / `spPath` tie a hit to a companion file (hub search); omit for the open pair only. */
type Row = { kind: HitKind; line: number; text: string; crPath?: string; spPath?: string };

type Hit = {
  kind: HitKind;
  line: number;
  text: string;
  score: number;
  source: "ordered" | "fuzzy";
  crPath?: string;
  spPath?: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Y offset in `scrollEl`’s scroll coordinate space to place `child`’s top at the scrollport (CSS px). */
function scrollTopToAlignChildTop(
  scrollEl: HTMLElement,
  child: Element,
  leadCssPx: number,
): number {
  const cr = child.getBoundingClientRect();
  const sr = scrollEl.getBoundingClientRect();
  return scrollEl.scrollTop + (cr.top - sr.top) - scrollEl.clientTop - leadCssPx;
}

/**
 * Partner write for **proportional** mirror plans (`mirrorI` / `mirrorW`), which produce a fresh
 * target on every driver scroll event. Must be **instant** — wrapping these in `behavior: "smooth"`
 * makes the partner re-ease toward a moving target each frame, which the eye reads as up/down
 * jitter while the user keeps scrolling. Block snaps also use instant writes (see
 * {@link applyRevealChildInPane} and `docs/spec/dual-pane-scroll-sync.md`). Sub-pixel skip avoids
 * feedback loops when zoom math matches the current position.
 */
function applyScrollTopClamped(scrollEl: HTMLElement, nextTop: number): void {
  const maxY = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  const clamped = clamp(nextTop, 0, maxY);
  if (Math.abs(scrollEl.scrollTop - clamped) < 0.25) return;
  scrollEl.scrollTop = clamped;
}

function paneUsesInternalYScroll(el: HTMLElement): boolean {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === "auto" || oy === "scroll" || oy === "overlay";
}

function rootScrollingElement(): HTMLElement {
  const s = document.scrollingElement;
  if (s instanceof HTMLElement) return s;
  return document.documentElement;
}

function readPaneVerticalScroll(pane: HTMLElement): number {
  return paneUsesInternalYScroll(pane) ? pane.scrollTop : rootScrollingElement().scrollTop;
}

/** Monotonic revert must not use {@link applyScrollTopClamped}’s sub-pixel skip, or the partner never moves back. */
function writePaneVerticalScrollForced(partnerPane: HTMLElement, target: number): void {
  if (paneUsesInternalYScroll(partnerPane)) {
    const maxY = Math.max(0, partnerPane.scrollHeight - partnerPane.clientHeight);
    partnerPane.scrollTop = clamp(target, 0, maxY);
    return;
  }
  const root = rootScrollingElement();
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  root.scrollTop = clamp(target, 0, maxY);
}

/**
 * Enforces dual-pane scroll sync monotonicity (`docs/spec/dual-pane-scroll-sync.md`):
 * partner never moves opposite the driver on a decisive scroll step.
 */
function enforceScrollSyncMonotonic(args: {
  driverDelta: number;
  partnerBefore: number;
  partnerPane: HTMLElement;
  /** Which driver→partner mapping produced the partner move (for debug only). */
  axis?: "code→doc" | "doc→code";
}): void {
  const { driverDelta, partnerBefore, partnerPane, axis } = args;
  const partnerAfter = readPaneVerticalScroll(partnerPane);
  if (shouldRevertPartnerScrollForMonotonicity({ driverDelta, partnerBefore, partnerAfter })) {
    if (scrollSyncTraceFeatureFlag()) {
      globalThis.console.warn("[parallelDocs:scroll-sync] monotonic.revert", {
        t: Math.round(performance.now()),
        axis: axis ?? "?",
        driverDelta,
        partnerBefore,
        partnerAfter,
      });
    }
    writePaneVerticalScrollForced(partnerPane, partnerBefore);
  }
}

/** Window-root counterpart of {@link applyScrollTopClamped} for the narrow single-flow layout — same instant-vs-jitter rationale. */
function applyWindowScrollRatio(ratio: number): void {
  const root = rootScrollingElement();
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  const next = clamp(ratio * maxY, 0, maxY);
  if (Math.abs(root.scrollTop - next) < 0.25) return;
  root.scrollTop = next;
}

/**
 * Reveal `child` near the top of the reading surface: the pane’s own scrollport when it scrolls
 * internally (desktop dual-pane), otherwise the document root (narrow flow layout).
 *
 * **Always instant** (`scrollTop` / `scrollTo` auto): smooth interpolation on a partner pane during
 * bidirectional sync multiplies `scroll` events, shrinks the useful echo-suppression window, and
 * fights {@link enforceScrollSyncMonotonic} — reads as rubber-band / desync. See
 * `docs/spec/dual-pane-scroll-sync.md` (“Scroll-behavior on dual-pane scrollports”).
 */
function applyRevealChildInPane(scrollport: HTMLElement, child: Element, leadCssPx: number): void {
  if (paneUsesInternalYScroll(scrollport)) {
    const target = Math.round(scrollTopToAlignChildTop(scrollport, child, leadCssPx));
    applyScrollTopClamped(scrollport, target);
    return;
  }
  const root = rootScrollingElement();
  const cr = child.getBoundingClientRect();
  const targetTop = globalThis.scrollY + cr.top - leadCssPx;
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  const clamped = clamp(targetTop, 0, maxY);
  if (Math.abs(root.scrollTop - clamped) < 0.25) return;
  root.scrollTop = clamped;
}

/**
 * True when `child` is already placed like {@link applyRevealChildInPane} would (same few-pixel
 * tolerance as code→doc’s {@link parallelDocsBlockAnchorAlignedWithLead}).
 */
function revealTargetAlreadyAtLead(
  scrollport: HTMLElement,
  child: Element,
  leadCssPx: number,
): boolean {
  if (paneUsesInternalYScroll(scrollport)) {
    const cr = child.getBoundingClientRect();
    const sr = scrollport.getBoundingClientRect();
    const dist = cr.top - sr.top - scrollport.clientTop;
    return Math.abs(dist - leadCssPx) <= READING_LEAD_ALIGN_TOLERANCE_CSS_PX;
  }
  const cr = child.getBoundingClientRect();
  return Math.abs(cr.top - leadCssPx) <= READING_LEAD_ALIGN_TOLERANCE_CSS_PX;
}

/** True when the block anchor for `mdLine0` is already aligned like {@link applyRevealChildInPane} would. */
function parallelDocsBlockAnchorAlignedWithLead(
  docPane: HTMLElement,
  mdLine0: number,
  leadCssPx: number,
): boolean {
  const anchor = docPane.querySelector(`[data-parallel-docs-line="${String(mdLine0)}"]`);
  if (!(anchor instanceof HTMLElement)) return false;
  return revealTargetAlreadyAtLead(docPane, anchor, leadCssPx);
}

/** Resolve the code line element used for doc→code block snaps (same lookup as {@link applyDocToCodeFlipPlanImpl}). */
function findCodeLineElementForBlockSnap(
  codePane: HTMLElement,
  lineIdPrefix: string,
  src0: number,
): Element | null {
  const exact = codePane.querySelector(`#${lineIdPrefix}${String(src0)}`);
  if (exact instanceof HTMLElement) return exact;
  return findAnchorAtOrAfter(sourceAnchorsFromPrefix(lineIdPrefix), src0);
}

/** True when the source line for `src0` is already aligned like {@link applyRevealChildInPane} would. */
function sourceCodeLineAnchorAlignedWithLead(
  codePane: HTMLElement,
  lineIdPrefix: string,
  src0: number,
  leadCssPx: number,
): boolean {
  const el = findCodeLineElementForBlockSnap(codePane, lineIdPrefix, src0);
  if (!el) return false;
  return revealTargetAlreadyAtLead(codePane, el, leadCssPx);
}

/** If the code line head is already at the block-snap lead, doc→code should not re-issue a reveal (symmetric with code→doc). */
function docToCodePlanIfCodeAnchorAlreadyAligned(
  codePane: HTMLElement,
  lineIdPrefix: string,
  src0: number,
  traceReason: string,
  extraFields: Record<string, unknown>,
): DocToCodeFlipPlan | null {
  if (
    !sourceCodeLineAnchorAlignedWithLead(
      codePane,
      lineIdPrefix,
      src0,
      DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX,
    )
  ) {
    return null;
  }
  scrollSyncTrace("doc→code.plan", {
    reason: traceReason,
    ...extraFields,
    src0,
    lineIdPrefix,
  });
  return { k: "noop", skipProportionalFallbackOnFlip: true };
}

/**
 * After the strict `[lo, hiExclusive)` span ends, keep treating the same block as active for a few
 * more source lines so `line1` probe noise at the boundary does not flip code→doc between block
 * snap and gap mirror every frame.
 */
const SOURCE_BLOCK_TRAILING_SLACK_LINES = 6;

function blockForCodeToDocSync(
  links: BlockScrollLink[],
  line1: number,
  sticky: BlockAwareStickyBundle,
): BlockScrollLink | null {
  const strict = blockStrictlyContainingSourceViewportLine(links, line1);
  if (strict) return strict;
  const id = sticky.sourceSticky.lockedId;
  if (id === null) return null;
  const b = links.find((x) => x.id === id);
  if (!b) return null;
  const { lo, hiExclusive } = b.markerViewportHalfOpen1Based;
  const slack = SOURCE_BLOCK_TRAILING_SLACK_LINES;
  if (line1 >= lo && line1 < hiExclusive + slack) return b;
  return null;
}

/** Captured parallel-docs→source scroll state for a narrow single-pane flip (see {@link DualPaneScrollSyncRunners}). */
type DocToCodeFlipPlan =
  | {
      k: "noop";
      /**
       * When true, {@link wireBlockAwareScrollSync}'s mobile flip finish must not replace this noop
       * with a proportional plan — the partner was already block-aligned (symmetric with
       * code→doc's anchor-aligned noop).
       */
      skipProportionalFallbackOnFlip?: boolean;
    }
  | { k: "block"; src0: number; winRatio: number }
  | { k: "mirrorI"; docTop: number; docSH: number; docCH: number }
  | { k: "mirrorW"; ratio: number };

/** Captured source→parallel-docs scroll state for a narrow single-pane flip. */
type CodeToDocFlipPlan =
  | { k: "noop" }
  | { k: "block"; mdLine0: number; winRatio: number }
  | { k: "mirrorI"; codeTop: number; codeSH: number; codeCH: number }
  | { k: "mirrorW"; ratio: number };

function windowScrollRatio(): number {
  const root = rootScrollingElement();
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  return maxY > 0 ? clamp(root.scrollTop / maxY, 0, 1) : 0;
}

const SCROLL_SYNC_DEBUG_FLAG = "parallelDocsDebugScroll";

function scrollSyncDebugQueryOn(): boolean {
  const v = new URLSearchParams(globalThis.location.search).get(SCROLL_SYNC_DEBUG_FLAG);
  return v === "1" || v === "true" || v === "";
}

function scrollSyncDebugStorageOn(s: Storage): boolean {
  try {
    const v = s.getItem(SCROLL_SYNC_DEBUG_FLAG);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function scrollSyncDebugHashOn(): boolean {
  const h = globalThis.location.hash;
  return h === `#${SCROLL_SYNC_DEBUG_FLAG}` || h === `#${SCROLL_SYNC_DEBUG_FLAG}=1`;
}

/**
 * True on common dev hostnames (`parallel-docs serve`, local preview). Used only for the one-line
 * boot banner — **not** for high-volume per-scroll tracing (that stays opt-in below).
 */
function scrollSyncDebugDevHostOn(): boolean {
  const host = globalThis.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

/**
 * High-volume scroll-sync tracing (`scrollSyncTrace`, `wire.*.driver`, plan/apply lines): opt-in
 * only via URL, hash, or Web Storage — **not** implied by localhost alone (keeps DevTools quiet
 * during normal reading).
 *
 * Turn on any one of:
 * - Query: `?parallelDocsDebugScroll=1` (or `=true`, or present with an empty value)
 * - Hash: `#parallelDocsDebugScroll` or `#parallelDocsDebugScroll=1` (fragment is not sent to the server)
 * - DevTools, then reload: `sessionStorage.setItem("parallelDocsDebugScroll", "1")` or the same for `localStorage`
 *
 * Log lines (filter DevTools console on `[parallelDocs:scroll-sync]`):
 * - `code→doc.plan` / `doc→code.plan` — which branch built the flip plan (`reason` field)
 * - `code→doc.apply` / `doc→code.apply` — partner `scrollTop` before vs after apply, `driverDelta`, `plan`
 * - `wire.code.driver` / `wire.doc.driver` — RAF-coalesced driver flush (delta, pane `scrollTop`)
 * - `wire.code.flush-skipped` / `wire.doc.flush-skipped` — flush skipped (`partner-echo` throttled ~5/s; `sync-in-progress` immediate)
 * - `monotonic.revert` — `console.warn` when the partner move was opposite the driver and was rolled back
 *
 * Tracing consults a **cached feature flag** (rechecked at most every 500ms and on `hashchange` /
 * cross-tab `storage`) so hot scroll paths avoid reading storage every tick.
 */
function scrollSyncVerboseTraceEnabled(): boolean {
  try {
    if (scrollSyncDebugQueryOn()) return true;
    if (scrollSyncDebugHashOn()) return true;
    if (scrollSyncDebugStorageOn(globalThis.sessionStorage)) return true;
    if (scrollSyncDebugStorageOn(globalThis.localStorage)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Throttle for re-reading URL/storage into {@link scrollSyncTraceFeatureOn}. */
const SCROLL_SYNC_TRACE_FLAG_RECHECK_MS = 500;

/**
 * Feature flag for scroll-sync tracing: mirrors {@link scrollSyncVerboseTraceEnabled} but cached so
 * high-frequency scroll paths do not hit Web Storage on every event.
 */
let scrollSyncTraceFeatureOn = false;
let scrollSyncTraceFeatureLastCheckMs = -Infinity;

function invalidateScrollSyncTraceFeatureFlag(): void {
  scrollSyncTraceFeatureLastCheckMs = -Infinity;
}

function scrollSyncTraceFeatureFlag(): boolean {
  const now = performance.now();
  if (now - scrollSyncTraceFeatureLastCheckMs < SCROLL_SYNC_TRACE_FLAG_RECHECK_MS) {
    return scrollSyncTraceFeatureOn;
  }
  scrollSyncTraceFeatureLastCheckMs = now;
  scrollSyncTraceFeatureOn = scrollSyncVerboseTraceEnabled();
  return scrollSyncTraceFeatureOn;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("hashchange", invalidateScrollSyncTraceFeatureFlag);
  globalThis.addEventListener("storage", invalidateScrollSyncTraceFeatureFlag);
}

/**
 * Boot announcement: **always** fires on dev hosts so a stale bundle is impossible to miss.
 * On production hosts it still fires only when the opt-in flag is on. Uses `console.log`
 * (visible at the default DevTools "Default" level filter) so a Verbose toggle is not required.
 */
function announceScrollSyncTraceOnBoot(): void {
  const devHost = scrollSyncDebugDevHostOn();
  const traceVerbose = scrollSyncVerboseTraceEnabled();
  if (!devHost && !traceVerbose) return;
  globalThis.console.log("[parallelDocs:scroll-sync] boot", {
    t: Math.round(performance.now()),
    href: globalThis.location.href,
    devHost,
    traceVerbose,
  });
}

/**
 * Structured scroll-sync log line when {@link scrollSyncTraceFeatureFlag} is on. Tags you can filter on:
 * - `code→doc.plan` — branch taken inside {@link buildCodeToDocFlipPlanBlockAware} (`reason` explains why)
 * - `doc→code.plan` — branch inside {@link buildDocToCodeFlipPlanBlockAware}
 * - `code→doc.apply` / `doc→code.apply` — partner `scrollTop` before/after apply for that driver step
 * - `wire.code.flush-skipped` / `wire.doc.flush-skipped` — RAF driver flush skipped (echo gate or `syncing`)
 * - `wire.code.driver` / `wire.doc.driver` — driver pane ran sync this frame (`delta`, `scrollTop`)
 * - `monotonic.revert` — emitted with `console.warn` (see {@link enforceScrollSyncMonotonic})
 */
function scrollSyncTrace(tag: string, fields: Record<string, unknown>): void {
  if (!scrollSyncTraceFeatureFlag()) return;
  globalThis.console.log(`[parallelDocs:scroll-sync] ${tag}`, {
    t: Math.round(performance.now()),
    ...fields,
  });
}

function formatDocToCodePlanForLog(p: DocToCodeFlipPlan): string {
  if (p.k === "noop") {
    return p.skipProportionalFallbackOnFlip === true ? "noop(skipFlipFallback)" : "noop";
  }
  if (p.k === "block") return `block(src0=${String(p.src0)})`;
  if (p.k === "mirrorW") return `mirrorW(ratio=${p.ratio.toFixed(4)})`;
  return `mirrorI(docTop=${String(p.docTop)})`;
}

function formatCodeToDocPlanForLog(p: CodeToDocFlipPlan): string {
  if (p.k === "noop") return "noop";
  if (p.k === "block") return `block(mdLine0=${String(p.mdLine0)})`;
  if (p.k === "mirrorW") return `mirrorW(ratio=${p.ratio.toFixed(4)})`;
  return `mirrorI(codeTop=${String(p.codeTop)})`;
}

function applyDocToCodeFlipPlanImpl(
  codePane: HTMLElement,
  _docPane: HTMLElement,
  plan: DocToCodeFlipPlan,
  lineIdPrefix = "code-line-",
): void {
  if (plan.k === "noop") return;
  const narrowSinglePane = globalThis.matchMedia(DUAL_MOBILE_SINGLE_PANE_MQ).matches;
  if (plan.k === "block") {
    const el = findCodeLineElementForBlockSnap(codePane, lineIdPrefix, plan.src0);
    if (el) {
      applyRevealChildInPane(codePane, el, DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX);
    }
    return;
  }
  if (plan.k === "mirrorW") {
    if (paneUsesInternalYScroll(codePane)) {
      const maxC = Math.max(0, codePane.scrollHeight - codePane.clientHeight);
      applyScrollTopClamped(codePane, plan.ratio * maxC);
      if (narrowSinglePane) applyWindowScrollRatio(plan.ratio);
    } else {
      applyWindowScrollRatio(plan.ratio);
    }
    return;
  }
  const nextTop = mirroredScrollTop(
    plan.docTop,
    plan.docSH,
    plan.docCH,
    codePane.scrollHeight,
    codePane.clientHeight,
  );
  if (paneUsesInternalYScroll(codePane)) {
    applyScrollTopClamped(codePane, nextTop);
    if (narrowSinglePane) {
      const denom = Math.max(1, codePane.scrollHeight - codePane.clientHeight);
      applyWindowScrollRatio(clamp(nextTop / denom, 0, 1));
    }
    return;
  }
  const denom = Math.max(1, codePane.scrollHeight - codePane.clientHeight);
  applyWindowScrollRatio(clamp(nextTop / denom, 0, 1));
}

function applyCodeToDocFlipPlanImpl(
  _codePane: HTMLElement,
  docPane: HTMLElement,
  plan: CodeToDocFlipPlan,
): void {
  if (plan.k === "noop") return;
  if (plan.k === "block") {
    const anchor = docPane.querySelector(`[data-parallel-docs-line="${String(plan.mdLine0)}"]`);
    if (anchor instanceof HTMLElement) {
      applyRevealChildInPane(docPane, anchor, DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX);
    }
    return;
  }
  if (plan.k === "mirrorW") {
    if (paneUsesInternalYScroll(docPane)) {
      const maxD = Math.max(0, docPane.scrollHeight - docPane.clientHeight);
      applyScrollTopClamped(docPane, plan.ratio * maxD);
    } else {
      applyWindowScrollRatio(plan.ratio);
    }
    return;
  }
  const nextTop = mirroredScrollTop(
    plan.codeTop,
    plan.codeSH,
    plan.codeCH,
    docPane.scrollHeight,
    docPane.clientHeight,
  );
  if (paneUsesInternalYScroll(docPane)) {
    applyScrollTopClamped(docPane, nextTop);
    return;
  }
  const denom = Math.max(1, docPane.scrollHeight - docPane.clientHeight);
  applyWindowScrollRatio(clamp(nextTop / denom, 0, 1));
}

type BlockAwareStickyBundle = {
  sourceSticky: BlockScrollStickyState;
  parallelDocsSticky: BlockScrollStickyState;
  /** When the indexed block set changes (e.g. another angle), Schmitt locks must not carry over. */
  linksKey: { current: string };
};

function resetBlockScrollStickyIfLinksChanged(
  sticky: BlockAwareStickyBundle,
  links: BlockScrollLink[],
): void {
  const key = links.map((l) => l.id).join("\0");
  if (key !== sticky.linksKey.current) {
    sticky.sourceSticky.lockedId = null;
    sticky.parallelDocsSticky.lockedId = null;
    sticky.linksKey.current = key;
  }
}

function tryDocToCodeFlipPlanFromMdProbe(
  codePane: HTMLElement,
  links: BlockScrollLink[],
  sticky: BlockAwareStickyBundle,
  lineIdPrefix: string,
  winRatio: number,
  mdLine0: number | null,
): DocToCodeFlipPlan | null {
  if (mdLine0 === null) return null;
  const block = pickBlockScrollLinkForParallelDocsScroll(links, mdLine0);
  const src0 = block !== null ? block.markerViewportHalfOpen1Based.lo - 1 : null;
  if (block !== null) {
    sticky.parallelDocsSticky.lockedId = block.id;
  }
  if (src0 === null) return null;
  const alignedNoop = docToCodePlanIfCodeAnchorAlreadyAligned(
    codePane,
    lineIdPrefix,
    src0,
    "block-code-anchor-already-aligned-noop",
    { mdLine0, blockId: block?.id ?? null },
  );
  if (alignedNoop) return alignedNoop;
  const plan: DocToCodeFlipPlan = { k: "block", src0, winRatio };
  scrollSyncTrace("doc→code.plan", {
    reason: "block-from-md-probe",
    plan: formatDocToCodePlanForLog(plan),
    mdLine0,
    blockId: block?.id ?? null,
    markerSpan: block?.markerViewportHalfOpen1Based ?? null,
  });
  return plan;
}

function tryDocToCodeFlipPlanFromPageBreakPull(
  docPane: HTMLElement,
  codePane: HTMLElement,
  lineIdPrefix: string,
  winRatio: number,
  mdLine0: number | null,
): DocToCodeFlipPlan | null {
  const pulledSrc0 = pulledSourceLine0FromPageBreak(docPane);
  if (pulledSrc0 === null) return null;
  const pbAlignedNoop = docToCodePlanIfCodeAnchorAlreadyAligned(
    codePane,
    lineIdPrefix,
    pulledSrc0,
    "page-break-pull-code-anchor-already-aligned-noop",
    { mdLine0, pulledSrc0 },
  );
  if (pbAlignedNoop) return pbAlignedNoop;
  const plan: DocToCodeFlipPlan = { k: "block", src0: pulledSrc0, winRatio };
  scrollSyncTrace("doc→code.plan", {
    reason: "page-break-pull",
    plan: formatDocToCodePlanForLog(plan),
    pulledSrc0,
    mdLine0,
  });
  return plan;
}

function buildDocToCodeFlipPlanBlockAware(
  docPane: HTMLElement,
  codePane: HTMLElement,
  getLinks: () => BlockScrollLink[],
  sticky: BlockAwareStickyBundle,
  lineIdPrefix: string,
  allowProportionalMirror: boolean,
): DocToCodeFlipPlan {
  const winRatio = paneUsesInternalYScroll(docPane)
    ? clamp(docPane.scrollTop / Math.max(1, docPane.scrollHeight - docPane.clientHeight), 0, 1)
    : windowScrollRatio();
  /**
   * Block info is authoritative — `pulledSourceLine0FromPageBreak` is "active" for the entire span
   * from a page-break element to its `nextAnchor`, which can cover whole blocks. If we let the
   * page-break heuristic run first, it snaps code far forward (e.g. to the next segment's source
   * line) while the doc viewport is still genuinely inside an earlier block; the later real-block
   * resolution is then opposite the prior snap and `enforceScrollSyncMonotonic` reverts it, so
   * code gets stuck hundreds of pixels ahead of the doc. Only fall back to `page-break-pull`
   * when no indexed block matches the doc viewport (true inter-block / inter-segment gap).
   */
  const links = getLinks();
  resetBlockScrollStickyIfLinksChanged(sticky, links);
  const mdLine0 = probeParallelDocsLine0FromDoc(docPane);
  const fromMd = tryDocToCodeFlipPlanFromMdProbe(
    codePane,
    links,
    sticky,
    lineIdPrefix,
    winRatio,
    mdLine0,
  );
  if (fromMd !== null) return fromMd;
  const fromPb = tryDocToCodeFlipPlanFromPageBreakPull(
    docPane,
    codePane,
    lineIdPrefix,
    winRatio,
    mdLine0,
  );
  if (fromPb !== null) return fromPb;
  /**
   * Index-backed pair but no confident block anchor for this viewport (e.g. missing
   * `.parallel-docs-block-anchor` nodes, or probe could not map the doc band to a link).
   * With {@link allowProportionalMirror}, mirror like the no-index path so static dual
   * browse still scrolls both panes together; block-snap-only keeps the historical noop.
   */
  if (links.length > 0) {
    scrollSyncTrace("doc→code.plan", {
      reason: allowProportionalMirror
        ? "indexed-fallback-mirror-no-confident-block"
        : "indexed-noop-no-src0",
      mdLine0,
      linkCount: links.length,
      allowProportionalMirror,
    });
    if (!allowProportionalMirror) {
      return { k: "noop" };
    }
  } else if (!allowProportionalMirror) {
    scrollSyncTrace("doc→code.plan", { reason: "snap-only-no-index-noop", linkCount: 0 });
    return { k: "noop" };
  }
  if (paneUsesInternalYScroll(docPane)) {
    const plan: DocToCodeFlipPlan = {
      k: "mirrorI",
      docTop: docPane.scrollTop,
      docSH: docPane.scrollHeight,
      docCH: docPane.clientHeight,
    };
    scrollSyncTrace("doc→code.plan", {
      reason: "no-index-mirror-internal",
      plan: formatDocToCodePlanForLog(plan),
    });
    return plan;
  }
  const plan: DocToCodeFlipPlan = { k: "mirrorW", ratio: winRatio };
  scrollSyncTrace("doc→code.plan", {
    reason: "no-index-mirror-window",
    plan: formatDocToCodePlanForLog(plan),
  });
  return plan;
}

/** Mirror plan for the current source pane geometry — internal scroller (`mirrorI`) or window flow (`mirrorW`). */
function codeMirrorPlan(codePane: HTMLElement, winRatio: number): CodeToDocFlipPlan {
  if (paneUsesInternalYScroll(codePane)) {
    return {
      k: "mirrorI",
      codeTop: codePane.scrollTop,
      codeSH: codePane.scrollHeight,
      codeCH: codePane.clientHeight,
    };
  }
  return { k: "mirrorW", ratio: winRatio };
}

/** Source viewport sits **above** every indexed span — pin partner to the very first block head. */
function preludeBlockAwareCodeToDocPlan(
  links: BlockScrollLink[],
  docPane: HTMLElement,
  sticky: BlockAwareStickyBundle,
  line1: number,
  lineIdPrefix: string,
  winRatio: number,
): CodeToDocFlipPlan {
  const sorted = [...links].sort(
    (a, b) => a.markerViewportHalfOpen1Based.lo - b.markerViewportHalfOpen1Based.lo,
  );
  const first = sorted[0];
  if (!first) {
    scrollSyncTrace("code→doc.plan", { reason: "prelude-missing-first-link", line1, lineIdPrefix });
    return { k: "noop" };
  }
  sticky.sourceSticky.lockedId = first.id;
  const mdLine0 = first.parallelDocsLine;
  if (
    parallelDocsBlockAnchorAlignedWithLead(docPane, mdLine0, DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX)
  ) {
    scrollSyncTrace("code→doc.plan", {
      reason: "prelude-anchor-already-aligned-noop",
      line1,
      blockId: first.id,
      mdLine0,
    });
    return { k: "noop" };
  }
  const plan: CodeToDocFlipPlan = { k: "block", mdLine0, winRatio };
  scrollSyncTrace("code→doc.plan", {
    reason: "prelude-first-block",
    line1,
    blockId: first.id,
    mdLine0,
    plan: formatCodeToDocPlanForLog(plan),
  });
  return plan;
}

/** Source viewport falls inside (or in trailing-slack of) an indexed block — reveal that block's anchor. */
function activeBlockCodeToDocPlan(
  active: BlockScrollLink,
  strictContaining: BlockScrollLink | null,
  docPane: HTMLElement,
  sticky: BlockAwareStickyBundle,
  line1: number,
  winRatio: number,
): CodeToDocFlipPlan {
  sticky.sourceSticky.lockedId = active.id;
  const mdLine0 = active.parallelDocsLine;
  const pickMode =
    strictContaining !== null && strictContaining.id === active.id ? "strict" : "trailing-slack";
  if (
    parallelDocsBlockAnchorAlignedWithLead(docPane, mdLine0, DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX)
  ) {
    scrollSyncTrace("code→doc.plan", {
      reason: "active-block-anchor-aligned-noop",
      line1,
      pickMode,
      blockId: active.id,
      mdLine0,
    });
    return { k: "noop" };
  }
  const plan: CodeToDocFlipPlan = { k: "block", mdLine0, winRatio };
  scrollSyncTrace("code→doc.plan", {
    reason: "active-block-reveal",
    line1,
    pickMode,
    blockId: active.id,
    mdLine0,
    markerSpan: active.markerViewportHalfOpen1Based,
    plan: formatCodeToDocPlanForLog(plan),
  });
  return plan;
}

/**
 * Releases the sticky source lock once the viewport is past the previous block plus its trailing
 * slack — a true inter-block gap. Without this clear, the gap-mirror branch never reactivates after
 * the slack expires.
 */
function clearStickySourceLockPastTrailingSlack(
  sticky: BlockAwareStickyBundle,
  links: BlockScrollLink[],
  line1: number,
): void {
  const sid = sticky.sourceSticky.lockedId;
  if (!sid) return;
  const prev = links.find((x) => x.id === sid);
  if (!prev) {
    sticky.sourceSticky.lockedId = null;
    return;
  }
  const hi = prev.markerViewportHalfOpen1Based.hiExclusive;
  if (line1 >= hi + SOURCE_BLOCK_TRAILING_SLACK_LINES) {
    sticky.sourceSticky.lockedId = null;
  }
}

function buildCodeToDocFlipPlanBlockAware(
  codePane: HTMLElement,
  docPane: HTMLElement,
  getLinks: () => BlockScrollLink[],
  lineIdPrefix: string,
  sticky: BlockAwareStickyBundle,
  allowProportionalMirror: boolean,
): CodeToDocFlipPlan {
  const winRatio = windowScrollRatio();
  const links = getLinks();
  resetBlockScrollStickyIfLinksChanged(sticky, links);
  if (links.length === 0) {
    if (!allowProportionalMirror) {
      scrollSyncTrace("code→doc.plan", {
        reason: "snap-only-no-block-links-noop",
        lineIdPrefix,
      });
      return { k: "noop" };
    }
    const plan = codeMirrorPlan(codePane, winRatio);
    scrollSyncTrace("code→doc.plan", {
      reason:
        plan.k === "mirrorI" ? "no-block-links-mirror-internal" : "no-block-links-mirror-window",
      lineIdPrefix,
      plan: formatCodeToDocPlanForLog(plan),
    });
    return plan;
  }

  const line1 = probeCodeLine1FromViewport(codePane, lineIdPrefix);
  if (sourceTopLineStrictlyBeforeFirstIndexLine(links, line1)) {
    return preludeBlockAwareCodeToDocPlan(links, docPane, sticky, line1, lineIdPrefix, winRatio);
  }

  const strictContaining = blockStrictlyContainingSourceViewportLine(links, line1);
  const active = blockForCodeToDocSync(links, line1, sticky);
  if (active) {
    return activeBlockCodeToDocPlan(active, strictContaining, docPane, sticky, line1, winRatio);
  }

  /** Source viewport sits in a true gap between indexed spans — mirror so the doc never snaps to an unrelated block head. */
  clearStickySourceLockPastTrailingSlack(sticky, links, line1);
  if (!allowProportionalMirror) {
    scrollSyncTrace("code→doc.plan", {
      reason: "snap-only-source-gap-noop",
      line1,
      lineIdPrefix,
      stickyLockAfter: sticky.sourceSticky.lockedId,
    });
    return { k: "noop" };
  }
  const plan = codeMirrorPlan(codePane, winRatio);
  scrollSyncTrace("code→doc.plan", {
    reason: plan.k === "mirrorI" ? "source-gap-mirror-internal" : "source-gap-mirror-window",
    line1,
    lineIdPrefix,
    stickyLockAfter: sticky.sourceSticky.lockedId,
    plan: formatCodeToDocPlanForLog(plan),
  });
  return plan;
}

function buildDocToCodeFlipPlanProportional(docPane: HTMLElement): DocToCodeFlipPlan {
  if (paneUsesInternalYScroll(docPane)) {
    return {
      k: "mirrorI",
      docTop: docPane.scrollTop,
      docSH: docPane.scrollHeight,
      docCH: docPane.clientHeight,
    };
  }
  return { k: "mirrorW", ratio: windowScrollRatio() };
}

function buildCodeToDocFlipPlanProportional(codePane: HTMLElement): CodeToDocFlipPlan {
  if (paneUsesInternalYScroll(codePane)) {
    return {
      k: "mirrorI",
      codeTop: codePane.scrollTop,
      codeSH: codePane.scrollHeight,
      codeCH: codePane.clientHeight,
    };
  }
  return { k: "mirrorW", ratio: windowScrollRatio() };
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function snippet(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function mergeHits(rows: Hit[], max: number): Hit[] {
  const byKey = new Map<string, Hit>();
  for (const r of rows) {
    const key =
      r.kind === "path"
        ? `path:${r.spPath ?? ""}|${r.crPath ?? ""}|${r.text.slice(0, 120)}`
        : `${r.kind}:${r.line}:${r.crPath ?? ""}`;
    const prev = byKey.get(key);
    if (!prev || r.score > prev.score) {
      byKey.set(key, r);
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, max);
}

function buildOrderedHits(raw: string, kind: HitKind, tokens: string[]): Hit[] {
  const spans = findOrderedTokenSpans(raw, tokens);
  const seen = new Set<number>();
  const out: Hit[] = [];
  for (const sp of spans) {
    const line = offsetToLineIndex(raw, sp.start);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push({
      kind,
      line,
      text: lineAtIndex(raw, line),
      score: 1000,
      source: "ordered",
    });
  }
  return out;
}

function buildFuzzyHits(
  searcher: ReturnType<typeof SearcherFactory.createDefaultSearcher<Row, string>>,
  query: string,
  topN: number,
): Hit[] {
  const qstr = query.trim();
  if (!qstr) return [];
  const q = new Query(qstr, topN, [
    new FuzzySearcher(0.22),
    new SubstringSearcher(0),
    new PrefixSearcher(0),
  ]);
  const res = searcher.getMatches(q);
  const out: Hit[] = [];
  for (const m of res.matches) {
    const row = m.entity;
    out.push({
      kind: row.kind,
      line: row.line,
      text: row.text,
      score: 100 + m.quality,
      source: "fuzzy",
      crPath: row.crPath,
      spPath: row.spPath,
    });
  }
  return out;
}

/** Ordered token matches per path row (keeps `spPath` / `crPath` for navigation). */
function buildOrderedPathHitsFromRows(pathRows: Row[], tokens: string[]): Hit[] {
  if (tokens.length === 0) return [];
  const out: Hit[] = [];
  for (const row of pathRows) {
    if (row.kind !== "path") continue;
    const spans = findOrderedTokenSpans(row.text, tokens);
    if (spans.length === 0) continue;
    out.push({
      kind: "path",
      line: row.line,
      text: row.text,
      score: 1000,
      source: "ordered",
      spPath: row.spPath,
      crPath: row.crPath,
    });
  }
  return out;
}

type SearchScope = "full" | "parallel-docs-and-paths";

type MergedSearchHitInput = {
  scope: SearchScope;
  filePathLabel: string;
  parallelDocsPathLabel: string;
  rawCode: string;
  rawMd: string;
  searcher: ReturnType<typeof SearcherFactory.createDefaultSearcher<Row, string>>;
  queryRaw: string;
  tokens: string[];
  /** When set (hub), ordered path-token search spans every indexed path string, not only the open pair. */
  pathBlobWide?: string;
  /** Structured path rows for ordered filename / path-segment search (preferred over `pathBlobWide`). */
  pathRowsForOrdering?: Row[];
};

function computeMergedSearchHits(input: MergedSearchHitInput): Hit[] {
  const {
    scope,
    filePathLabel,
    parallelDocsPathLabel,
    rawCode,
    rawMd,
    searcher,
    queryRaw,
    tokens,
    pathBlobWide,
    pathRowsForOrdering,
  } = input;
  const pathBlob =
    (pathBlobWide && pathBlobWide.trim().length > 0
      ? pathBlobWide.trim()
      : [filePathLabel, parallelDocsPathLabel].filter((s) => s.trim().length > 0).join("\n")) || "";
  const orderedCode =
    scope === "parallel-docs-and-paths" ? [] : buildOrderedHits(rawCode, "code", tokens);
  const orderedPath =
    scope === "parallel-docs-and-paths" && pathRowsForOrdering && pathRowsForOrdering.length > 0
      ? buildOrderedPathHitsFromRows(pathRowsForOrdering, tokens)
      : scope === "parallel-docs-and-paths" && pathBlob
        ? buildOrderedHits(pathBlob, "path", tokens)
        : [];
  const orderedMd = buildOrderedHits(rawMd, "md", tokens);
  const fuzzyHits = buildFuzzyHits(searcher, queryRaw, 60);
  return mergeHits([...orderedCode, ...orderedPath, ...orderedMd, ...fuzzyHits], 80);
}

type SearchHitRenderContext = {
  currentParallelDocsPath: string;
  currentSourcePath: string;
};

function searchScopeResultsHintIntro(scope: SearchScope): string {
  return scope === "parallel-docs-and-paths"
    ? "Paths + indexed parallel-docs (this page + browse pages when built). Ordered tokens + fuzzy lines."
    : "Whole source: whitespace tokens in order (may span lines). Per-line fuzzy ranking for typos.";
}

function searchHitMetaLabel(h: Hit, ctx: SearchHitRenderContext): string {
  if (h.kind === "code") return `Code L${h.line + 1}`;
  if (h.kind === "path") return `Path`;
  const foreign = h.crPath && h.crPath !== ctx.currentParallelDocsPath ? ` · ${h.crPath}` : "";
  return `ParallelDocs L${h.line + 1}${foreign}`;
}

function searchHitButtonHtml(h: Hit, tokens: string[], ctx: SearchHitRenderContext): string {
  const label = searchHitMetaLabel(h, ctx);
  const tag = h.source === "ordered" ? "ordered" : "fuzzy";
  const snippetHtml = escapeHtmlHighlightingSearchTokens(snippet(h.text, 320), tokens);
  const crAttr = escapeHtmlText(
    h.kind === "md" ? (h.crPath ?? ctx.currentParallelDocsPath) : (h.crPath ?? ""),
  );
  const spAttr = escapeHtmlText(
    h.kind === "md" ? (h.spPath ?? ctx.currentSourcePath) : (h.spPath ?? ""),
  );
  return (
    `<button type="button" class="hit" data-kind="${h.kind}" data-line="${String(h.line)}" data-cr-path="${crAttr}" data-sp-path="${spAttr}">` +
    `<span class="meta">${escapeHtmlText(label)} <span class="src-tag">(${tag})</span></span>` +
    `<div class="snippet">${snippetHtml}</div></button>`
  );
}

function searchResultsInnerHtml(
  scope: SearchScope,
  combined: Hit[],
  tokens: string[],
  ctx: SearchHitRenderContext,
): string {
  if (combined.length === 0) {
    return '<div class="hint">No matches. Try fewer tokens or looser spelling (fuzzy matches per line).</div>';
  }
  const hintIntro = searchScopeResultsHintIntro(scope);
  const buf: string[] = [];
  buf.push(`<div class="hint">${hintIntro} ${combined.length} hit(s).</div>`);
  for (const h of combined) {
    buf.push(searchHitButtonHtml(h, tokens, ctx));
  }
  return buf.join("");
}

function emptyBrowsePreviewHint(
  scope: SearchScope,
  rowCount: number,
  totalUnique: number,
  usedIndexFallback: boolean,
): string {
  if (scope === "full") {
    return "Documented source for this page. Type to search.";
  }
  if (usedIndexFallback) {
    return "Documented source on this page. Type to search the index when it is available.";
  }
  if (totalUnique > rowCount) {
    return `Indexed source files (${String(rowCount)} of ${String(totalUnique)} shown). Type to search.`;
  }
  return `Indexed source files (${String(totalUnique)}). Type to search.`;
}

function emptySearchBrowsePreviewInnerHtml(
  hint: string,
  rows: SourceFilePreviewRow[],
  ctx: SearchHitRenderContext,
): string {
  const tokens: string[] = [];
  const buf: string[] = [`<div class="hint">${escapeHtmlText(hint)}</div>`];
  const hits: Hit[] = rows.map((r, i) => ({
    kind: "path",
    line: i,
    text: r.sourcePath,
    score: 1000,
    source: "ordered",
    spPath: r.sourcePath,
    crPath: r.parallelDocsPath,
  }));
  for (const h of hits) {
    buf.push(searchHitButtonHtml(h, tokens, ctx));
  }
  return buf.join("");
}

function scrollDocToMarkdownLine0(
  docScrollEl: HTMLElement,
  line0: number,
  mdLineCount: number,
): void {
  const el = docScrollEl.querySelector(`#parallel-docs-md-line-${String(line0)}`);
  if (el instanceof HTMLElement) {
    applyRevealChildInPane(docScrollEl, el, DUAL_PANE_BLOCK_REVEAL_LEAD_CSS_PX);
    return;
  }
  if (mdLineCount <= 1) return;
  const lineClamped = clamp(line0, 0, Math.max(0, mdLineCount - 1));
  const scrollTarget = paneUsesInternalYScroll(docScrollEl) ? docScrollEl : rootScrollingElement();
  const maxScroll = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
  const top = clamp((lineClamped / Math.max(1, mdLineCount - 1)) * maxScroll, 0, maxScroll);
  scrollTarget.scrollTo({ top, behavior: "smooth" });
}

function navigateToDocumentedPair(pair: DocumentedPairNav, mdLine0: number | null): void {
  if (pair.staticBrowseUrl?.trim()) {
    const href = resolveStaticBrowseHref(
      pair.staticBrowseUrl.trim(),
      globalThis.location.pathname,
      globalThis.location.origin,
    );
    const u = new URL(href);
    if (mdLine0 !== null && mdLine0 >= 0) u.hash = `parallel-docs-md-line-${String(mdLine0)}`;
    globalThis.location.assign(u.toString());
    return;
  }
  const gh = (pair.parallelDocsOnGithub ?? "").trim();
  if (gh.length > 0) {
    const url = mdLine0 !== null && mdLine0 >= 0 ? `${gh}#L${String(mdLine0 + 1)}` : gh;
    globalThis.location.assign(url);
  }
}

function readSearchScopeFromShell(shell: HTMLElement): {
  scope: SearchScope;
  filePathLabel: string;
  parallelDocsPathLabel: string;
} {
  const scopeAttr = shell.getAttribute("data-search-scope") || "";
  return {
    scope: scopeAttr === "parallel-docs-and-paths" ? "parallel-docs-and-paths" : "full",
    filePathLabel: shell.getAttribute("data-search-file-path") || "",
    parallelDocsPathLabel: shell.getAttribute("data-search-parallel-docs-path") || "",
  };
}

function buildIndexedSearchRows(
  scope: SearchScope,
  rawCode: string,
  rawMd: string,
  filePathLabel: string,
  parallelDocsPathLabel: string,
): Row[] {
  const mdLines = rawMd.split("\n");
  const codeLines = rawCode.split("\n");
  const pathRows: Row[] = [];
  if (scope === "parallel-docs-and-paths") {
    if (filePathLabel.trim()) {
      pathRows.push({ kind: "path", line: pathRows.length, text: filePathLabel });
    }
    if (parallelDocsPathLabel.trim()) {
      pathRows.push({ kind: "path", line: pathRows.length, text: parallelDocsPathLabel });
    }
  }
  return [
    ...(scope === "full"
      ? codeLines.map((text, line) => ({ kind: "code" as const, line, text }))
      : []),
    ...pathRows,
    ...mdLines.map((text, line) => ({ kind: "md" as const, line, text })),
  ];
}

function indexSearchLineRows(
  rows: Row[],
): ReturnType<typeof SearcherFactory.createDefaultSearcher<Row, string>> {
  const searcher = SearcherFactory.createDefaultSearcher<Row, string>();
  searcher.indexEntities(
    rows,
    (e) => {
      if (e.kind === "md" && e.crPath) return `md:${e.crPath}:${e.line}`;
      if (e.kind === "path")
        return `path:${e.spPath ?? ""}|${e.crPath ?? ""}|${e.line}|${e.text.slice(0, 120)}`;
      return `${e.kind}:${e.line}`;
    },
    (e) => [e.text],
  );
  return searcher;
}

type MutableSearchFields = {
  rawMd: string;
  mdLines: string[];
  parallelDocsPathLabel: string;
  searcher: ReturnType<typeof SearcherFactory.createDefaultSearcher<Row, string>>;
  pathBlobWide: string;
  pathRowsForOrdering: Row[];
  documentedPairs: DocumentedPairNav[];
};

type SearchUiContext = {
  scope: SearchScope;
  filePathLabel: string;
  mutable: MutableSearchFields;
  rawCode: string;
  searchInput: HTMLInputElement;
  searchClear: HTMLElement;
  searchResults: HTMLElement;
  docScrollEl: HTMLElement;
};

type SearchHitClickDeps = {
  mutable: MutableSearchFields;
  docScrollEl: HTMLElement;
  filePathLabel: string;
};

function findSearchHitButton(
  leaf: HTMLElement | null,
  searchResults: HTMLElement,
): HTMLElement | null {
  let t: HTMLElement | null = leaf;
  while (t) {
    if (t.classList?.contains("hit")) return t;
    if (t === searchResults) return null;
    t = t.parentElement;
  }
  return null;
}

function listSearchHitButtons(searchResults: HTMLElement): HTMLButtonElement[] {
  return [...searchResults.querySelectorAll("button.hit")].filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  );
}

function listDocumentedTreeFileLinks(treeHost: HTMLElement): HTMLAnchorElement[] {
  return [...treeHost.querySelectorAll("a.tree-file-link")].filter(
    (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
  );
}

function scrollCodeHitToView(line: number): void {
  const el = document.getElementById(`code-line-${String(line)}`);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function handlePathSearchHit(button: HTMLElement, deps: SearchHitClickDeps): void {
  const hitCr = (button.getAttribute("data-cr-path") ?? "").trim();
  const hitSp = (button.getAttribute("data-sp-path") ?? "").trim();
  const pair = findDocumentedPair(deps.mutable.documentedPairs, hitCr, hitSp);
  if (pair && isSameDocumentedPair(pair, deps.filePathLabel, deps.mutable.parallelDocsPathLabel)) {
    const scrollTarget = paneUsesInternalYScroll(deps.docScrollEl)
      ? deps.docScrollEl
      : rootScrollingElement();
    scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (pair) navigateToDocumentedPair(pair, null);
}

function handleMdSearchHit(line: number, crHit: string, deps: SearchHitClickDeps): void {
  const curCr = deps.mutable.parallelDocsPathLabel.trim();
  const cr = crHit.trim();
  if (cr.length > 0 && normPosixPath(cr) !== normPosixPath(curCr)) {
    const pair = findDocumentedPair(deps.mutable.documentedPairs, cr, "");
    if (pair) {
      navigateToDocumentedPair(pair, line);
      return;
    }
    return;
  }
  scrollDocToMarkdownLine0(deps.docScrollEl, line, deps.mutable.mdLines.length);
}

function handleSearchHitButtonClick(button: HTMLElement, deps: SearchHitClickDeps): void {
  const kind = button.getAttribute("data-kind");
  const line = parseInt(button.getAttribute("data-line") || "0", 10);
  const crHit = button.getAttribute("data-cr-path")?.trim() ?? "";
  if (kind === "code") {
    scrollCodeHitToView(line);
    return;
  }
  if (kind === "path") {
    handlePathSearchHit(button, deps);
    return;
  }
  handleMdSearchHit(line, crHit, deps);
}

/** Empty query + ArrowDown: browse preview HTML, or null when there is nothing to show. */
function emptyBrowsePreviewInnerHtml(
  scope: SearchScope,
  filePathLabel: string,
  mutable: MutableSearchFields,
): string | null {
  const hitCtx: SearchHitRenderContext = {
    currentParallelDocsPath: mutable.parallelDocsPathLabel,
    currentSourcePath: filePathLabel,
  };
  if (scope === "full") {
    const sp = filePathLabel.trim();
    if (sp.length === 0) return null;
    const rows: SourceFilePreviewRow[] = [
      { sourcePath: sp, parallelDocsPath: mutable.parallelDocsPathLabel.trim() },
    ];
    const hint = emptyBrowsePreviewHint("full", rows.length, rows.length, false);
    return emptySearchBrowsePreviewInnerHtml(hint, rows, hitCtx);
  }
  const { rows, totalUnique } = uniqueSourceFilePreviewRows(mutable.documentedPairs);
  if (rows.length > 0) {
    const hint = emptyBrowsePreviewHint("parallel-docs-and-paths", rows.length, totalUnique, false);
    return emptySearchBrowsePreviewInnerHtml(hint, rows, hitCtx);
  }
  const sp = filePathLabel.trim();
  if (sp.length === 0) return null;
  const fb: SourceFilePreviewRow[] = [
    { sourcePath: sp, parallelDocsPath: mutable.parallelDocsPathLabel.trim() },
  ];
  const hint = emptyBrowsePreviewHint("parallel-docs-and-paths", fb.length, fb.length, true);
  return emptySearchBrowsePreviewInnerHtml(hint, fb, hitCtx);
}

/**
 * List rows use `focus({ preventScroll: true })` so the page does not jump; follow with
 * `scrollIntoView` so overflow panels (`#search-results`, `#documented-files-tree`) still scroll.
 */
function focusListRowAndReveal(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function wireSearchResultsHitListKeyboard(
  searchResults: HTMLElement,
  searchInput: HTMLInputElement,
): void {
  searchResults.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.isComposing || searchResults.hidden) return;
    const hits = listSearchHitButtons(searchResults);
    if (hits.length === 0) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement) || !active.classList.contains("hit")) return;
    const idx = hits.indexOf(active);
    if (idx < 0) return;
    if (e.key === "ArrowDown" && idx < hits.length - 1) {
      focusListRowAndReveal(hits[idx + 1]);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowUp") {
      if (idx > 0) {
        focusListRowAndReveal(hits[idx - 1]);
        e.preventDefault();
        return;
      }
      focusListRowAndReveal(searchInput);
      e.preventDefault();
    }
  });
}

type SearchInputKeyboardActions = {
  renderEmptyBrowsePreview: () => void;
  runSearch: () => void;
  cancelDebounceTimer: () => void;
  hitClickDeps: SearchHitClickDeps;
};

function wireSearchInputKeyboard(
  searchInput: HTMLInputElement,
  searchResults: HTMLElement,
  actions: SearchInputKeyboardActions,
): void {
  const { renderEmptyBrowsePreview, runSearch, cancelDebounceTimer, hitClickDeps } = actions;
  searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown") {
      if (!searchResults.hidden) {
        const hits = listSearchHitButtons(searchResults);
        if (hits.length > 0 && document.activeElement === searchInput) {
          focusListRowAndReveal(hits[0]);
          e.preventDefault();
          return;
        }
      }
      if (tokenizeQuery(searchInput.value).length > 0) return;
      renderEmptyBrowsePreview();
      e.preventDefault();
      return;
    }
    if (e.key !== "Enter") return;
    cancelDebounceTimer();
    if (tokenizeQuery(searchInput.value).length > 0) {
      runSearch();
    }
    const hits = listSearchHitButtons(searchResults);
    if (!searchResults.hidden && hits.length > 0 && document.activeElement === searchInput) {
      e.preventDefault();
      handleSearchHitButtonClick(hits[0], hitClickDeps);
    }
  });
}

function wireSearchUi(ctx: SearchUiContext): void {
  const {
    scope,
    filePathLabel,
    mutable,
    rawCode,
    searchInput,
    searchClear,
    searchResults,
    docScrollEl,
  } = ctx;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelDebounceTimer(): void {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }

  function clearSearch(): void {
    cancelDebounceTimer();
    searchInput.value = "";
    searchResults.innerHTML = "";
    searchResults.hidden = true;
  }

  function renderEmptyBrowsePreview(): void {
    const html = emptyBrowsePreviewInnerHtml(scope, filePathLabel, mutable);
    if (html === null) return;
    searchResults.hidden = false;
    searchResults.innerHTML = html;
  }

  function runSearch(): void {
    const tokens = tokenizeQuery(searchInput.value);
    if (tokens.length === 0) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      return;
    }
    const combined = computeMergedSearchHits({
      scope,
      filePathLabel,
      parallelDocsPathLabel: mutable.parallelDocsPathLabel,
      rawCode,
      rawMd: mutable.rawMd,
      searcher: mutable.searcher,
      queryRaw: searchInput.value,
      tokens,
      pathBlobWide: mutable.pathBlobWide,
      pathRowsForOrdering:
        mutable.pathRowsForOrdering.length > 0 ? mutable.pathRowsForOrdering : undefined,
    });
    searchResults.hidden = false;
    searchResults.innerHTML = searchResultsInnerHtml(scope, combined, tokens, {
      currentParallelDocsPath: mutable.parallelDocsPathLabel,
      currentSourcePath: filePathLabel,
    });
  }

  const hitClickDeps: SearchHitClickDeps = { mutable, docScrollEl, filePathLabel };
  searchResults.addEventListener("click", (ev: MouseEvent) => {
    const hit = findSearchHitButton(ev.target as HTMLElement | null, searchResults);
    if (!hit) return;
    handleSearchHitButtonClick(hit, hitClickDeps);
  });

  wireSearchResultsHitListKeyboard(searchResults, searchInput);

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 200);
  });
  wireSearchInputKeyboard(searchInput, searchResults, {
    renderEmptyBrowsePreview,
    runSearch,
    cancelDebounceTimer,
    hitClickDeps,
  });
  searchClear.addEventListener("click", clearSearch);

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const query = searchInput.value.trim().length > 0;
    const searchFocused = document.activeElement === searchInput;
    const resultsOpen = !searchResults.hidden;
    if (!query && !searchFocused && !resultsOpen) return;
    clearSearch();
    if (searchFocused) searchInput.blur();
    e.preventDefault();
  });
}

/**
 * After toggling `pre-wrap`, line rows reflow without necessarily resizing the pane’s border box,
 * so gutter block rays and scroll sync must be nudged explicitly.
 *
 * Pass optional `docWrapRoots` (e.g. `#doc-pane` and `#doc-pane-body` in dual layout): the toggle
 * syncs `wrap` on those nodes so parallel-docs fenced blocks and prose honor the control. `#doc-pane-body`
 * is targeted in CSS with an id so rules win over `pre code.hljs` from the highlight.js theme.
 */
function wireWrapToggle(
  storageWrap: string,
  codePane: HTMLElement,
  wrapCb: HTMLInputElement,
  onAfterLayout?: () => void,
  ...docWrapRoots: Array<HTMLElement | null | undefined>
): void {
  const docTargets = docWrapRoots.filter((el): el is HTMLElement => el instanceof HTMLElement);
  const wrap = readWebStorageItem(localStorage, storageWrap) === "1";
  wrapCb.checked = wrap;
  if (wrap) {
    codePane.classList.add("wrap");
    for (const el of docTargets) el.classList.add("wrap");
  } else {
    codePane.classList.remove("wrap");
    for (const el of docTargets) el.classList.remove("wrap");
  }

  wrapCb.addEventListener("change", () => {
    if (wrapCb.checked) {
      codePane.classList.add("wrap");
      for (const el of docTargets) el.classList.add("wrap");
      writeWebStorageItem(localStorage, storageWrap, "1");
    } else {
      codePane.classList.remove("wrap");
      for (const el of docTargets) el.classList.remove("wrap");
      writeWebStorageItem(localStorage, storageWrap, "0");
    }
    if (!onAfterLayout) return;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        onAfterLayout();
        requestAnimationFrame(() => {
          onAfterLayout();
        });
      });
    });
  });
}

function parseScrollBlockLinksFromShell(b64: string): BlockScrollLink[] {
  const t = b64.trim();
  if (!t) return [];
  try {
    const raw = JSON.parse(decodeBase64Utf8(t)) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: BlockScrollLink[] = [];
    for (const x of raw) {
      if (typeof x !== "object" || x === null) continue;
      const o = x as Record<string, unknown>;
      if (
        typeof o.id === "string" &&
        typeof o.parallelDocsLine === "number" &&
        typeof o.sourceStart === "number" &&
        typeof o.sourceEnd === "number"
      ) {
        const mvRaw = o.markerViewportHalfOpen1Based;
        const mv =
          typeof mvRaw === "object" &&
          mvRaw !== null &&
          typeof (mvRaw as { lo?: unknown }).lo === "number" &&
          typeof (mvRaw as { hiExclusive?: unknown }).hiExclusive === "number"
            ? {
                lo: (mvRaw as { lo: number }).lo,
                hiExclusive: (mvRaw as { hiExclusive: number }).hiExclusive,
              }
            : { lo: o.sourceStart, hiExclusive: o.sourceEnd + 1 };
        out.push({
          id: o.id,
          parallelDocsLine: o.parallelDocsLine,
          sourceStart: o.sourceStart,
          sourceEnd: o.sourceEnd,
          markerViewportHalfOpen1Based: mv,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function rootScrollNearDocumentEnd(edgePx = READING_VIEWPORT_BOTTOM_EDGE_CSS_PX): boolean {
  const root = rootScrollingElement();
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
  return maxY > 0 && root.scrollTop >= maxY - edgePx;
}

/** When the pane itself is the scrollport (dual desktop), mirror root “near end” behavior. */
function paneScrollNearEnd(
  pane: HTMLElement,
  edgePx = READING_VIEWPORT_BOTTOM_EDGE_CSS_PX,
): boolean {
  const maxY = Math.max(0, pane.scrollHeight - pane.clientHeight);
  return maxY > 0 && pane.scrollTop >= maxY - edgePx;
}

function readParallelDocsLine0FromAnchor(el: HTMLElement): number | null {
  const lineAttr = el.getAttribute("data-parallel-docs-line");
  if (lineAttr === null || lineAttr === "") return null;
  return Number(lineAttr);
}

function bestParallelDocsAnchorLine0AtOrAboveY(
  anchors: NodeListOf<HTMLElement>,
  y: number,
): number | null {
  const readings: { line0: number; top: number }[] = [];
  for (const a of anchors) {
    const line0 = readParallelDocsLine0FromAnchor(a);
    if (line0 === null) continue;
    readings.push({ line0, top: a.getBoundingClientRect().top });
  }
  return maxParallelDocsAnchorLine0AtOrAboveViewportY(readings, y);
}

function lastParallelDocsAnchorLine0(anchors: NodeListOf<HTMLElement>): number | null {
  for (let i = anchors.length - 1; i >= 0; i--) {
    const el = anchors.item(i);
    if (!el) continue;
    const v = readParallelDocsLine0FromAnchor(el);
    if (v !== null) return v;
  }
  return null;
}

function probeCodeLine1FromViewport(codePane: HTMLElement, lineIdPrefix = "code-line-"): number {
  const rows = codePane.querySelectorAll<HTMLElement>(`[id^="${lineIdPrefix}"]`);
  if (rows.length === 0) return 1;

  if (!paneUsesInternalYScroll(codePane)) {
    if (rootScrollNearDocumentEnd()) {
      const last = rows[rows.length - 1];
      const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(last.id);
      if (m) return Number(m[1]) + 1;
      return rows.length;
    }
    const sr = codePane.getBoundingClientRect();
    const vh = globalThis.innerHeight;
    const clipT = Math.max(0, sr.top);
    const clipB = Math.min(vh, sr.bottom);
    const y = clipT + readingViewportTopInsetCssPx(clipB - clipT);
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (r.bottom > y - 1e-3) {
        const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(el.id);
        if (m) return Number(m[1]) + 1;
        return 1;
      }
    }
    return rows.length;
  }

  if (paneScrollNearEnd(codePane)) {
    const last = rows[rows.length - 1];
    const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(last.id);
    if (m) return Number(m[1]) + 1;
    return rows.length;
  }

  const sr = codePane.getBoundingClientRect();
  const y = sr.top + codePane.clientTop + readingViewportTopInsetCssPx(codePane.clientHeight);
  for (const el of rows) {
    const r = el.getBoundingClientRect();
    if (r.bottom > y - 1e-3) {
      const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(el.id);
      if (m) return Number(m[1]) + 1;
      return 1;
    }
  }
  return rows.length;
}

function probeParallelDocsLine0FromDoc(docPane: HTMLElement): number | null {
  const anchors = docPane.querySelectorAll<HTMLElement>(".parallel-docs-block-anchor");
  if (anchors.length === 0) return null;

  if (!paneUsesInternalYScroll(docPane)) {
    if (rootScrollNearDocumentEnd()) {
      const tail = lastParallelDocsAnchorLine0(anchors);
      if (tail !== null) return tail;
    }
    const dr = docPane.getBoundingClientRect();
    const vh = globalThis.innerHeight;
    const clipT = Math.max(0, dr.top);
    const clipB = Math.min(vh, dr.bottom);
    const y = clipT + readingViewportTopInsetCssPx(clipB - clipT);
    return bestParallelDocsAnchorLine0AtOrAboveY(anchors, y);
  }

  if (paneScrollNearEnd(docPane)) {
    const tail = lastParallelDocsAnchorLine0(anchors);
    if (tail !== null) return tail;
  }

  const dr = docPane.getBoundingClientRect();
  /** Same band as the root-scroll branch: inset below the pane top so anchors qualify while body text sits in the comfort zone. */
  const y = dr.top + docPane.clientTop + readingViewportTopInsetCssPx(docPane.clientHeight);
  return bestParallelDocsAnchorLine0AtOrAboveY(anchors, y);
}

function pageBreakPullEnabled(): boolean {
  const shell = document.getElementById("shell");
  if (!(shell instanceof HTMLElement)) return false;
  return shell.getAttribute("data-page-breaks-enabled") === "true";
}

function docProbeTopY(docPane: HTMLElement): number {
  if (!paneUsesInternalYScroll(docPane)) {
    const dr = docPane.getBoundingClientRect();
    const vh = globalThis.innerHeight;
    const clipT = Math.max(0, dr.top);
    const clipB = Math.min(vh, dr.bottom);
    return clipT + readingViewportTopInsetCssPx(clipB - clipT);
  }
  const dr = docPane.getBoundingClientRect();
  return dr.top + docPane.clientTop + readingViewportTopInsetCssPx(docPane.clientHeight);
}

/**
 * In long synthetic page-break gaps, shift source toward the next block once
 * the break itself occupies the top reading position.
 */
function pulledSourceLine0FromPageBreak(docPane: HTMLElement): number | null {
  if (!pageBreakPullEnabled()) return null;
  const topY = docProbeTopY(docPane);
  const breaks = Array.from(
    docPane.querySelectorAll<HTMLElement>(
      ".parallel-docs-page-break[data-next-source-viewport-line]",
    ),
  );
  for (const pageBreak of breaks) {
    const nextViewportLineRaw = pageBreak.getAttribute("data-next-source-viewport-line");
    if (!nextViewportLineRaw) continue;
    const nextViewportLine1Based = Number.parseInt(nextViewportLineRaw, 10);
    if (!Number.isFinite(nextViewportLine1Based) || nextViewportLine1Based <= 0) continue;

    const breakTop = pageBreak.getBoundingClientRect().top;
    const nextLineRaw = pageBreak.getAttribute("data-next-parallel-docs-line");
    const nextLine0 = nextLineRaw ? Number.parseInt(nextLineRaw, 10) : Number.NaN;
    const nextAnchor =
      Number.isFinite(nextLine0) && nextLine0 >= 0
        ? docPane.querySelector<HTMLElement>(`[data-parallel-docs-line="${String(nextLine0)}"]`)
        : null;
    const nextTop = nextAnchor
      ? nextAnchor.getBoundingClientRect().top
      : breakTop + pageBreak.clientHeight;
    if (!(breakTop <= topY && topY < nextTop)) continue;
    const denom = Math.max(1, nextTop - breakTop);
    const progress = clamp((topY - breakTop) / denom, 0, 1);
    const narrow = globalThis.matchMedia("(max-width: 767px)").matches;
    const pullThreshold = narrow ? 0.2 : 0.35;
    if (progress < pullThreshold) return null;
    return nextViewportLine1Based - 1;
  }
  return null;
}

type SyncPane = "none" | "code" | "doc";

type PartnerScrollEchoGate = { until: number };

/**
 * After we move the **partner** pane from a driver sync, its `scroll` handler must not run the
 * opposite mapper until things settle — one user wheel can produce dozens of programmatic scroll
 * events (layout, smooth interpolation, nested scrollports). A **fixed event budget** was
 * exhausted mid-gesture and caused doc↔code ping-pong. We extend a **deadline** instead; each driver
 * sync pushes `until` forward so continuous scrolling stays stable.
 */
/**
 * Ignore partner `scroll` echoes after a driver sync. Must cover the tail of
 * tail of a partner programmatic scroll; otherwise the partner’s frames can be treated as a driver
 * and the panes ping-pong. Uses {@link SMOOTH_REVEAL_INFLIGHT_DEDUP_MS} as a conservative ceiling
 * for any remaining smooth paths (e.g. hash navigation helpers).
 */
const PARTNER_SCROLL_ECHO_SUPPRESS_MS = Math.max(320, SMOOTH_REVEAL_INFLIGHT_DEDUP_MS + 250);

function armPartnerScrollEchoGate(gate: PartnerScrollEchoGate): void {
  const next = performance.now() + PARTNER_SCROLL_ECHO_SUPPRESS_MS;
  gate.until = Math.max(gate.until, next);
}

function partnerScrollEchoActive(gate: PartnerScrollEchoGate): boolean {
  return performance.now() < gate.until;
}

/** Throttle for the `wire.*.flush-skipped` `partner-echo` log line — without it we get one per animation frame. */
const WIRE_ECHO_SKIP_TRACE_MIN_MS = 200;

/** Mutable per-driver wiring state for one pane (code or doc). Symmetric across both directions. */
type DriverWireState = {
  lastSeenTop: number;
  pendingRaf: number;
  lastEchoSkipTraceAt: number;
};

/** Shared mutable lock used by both wire directions to serialise apply vs. driver flushes. */
type SyncingRef = { current: SyncPane };

function emitFlushSkippedPartnerEcho(
  axis: "code" | "doc",
  state: DriverWireState,
  ownEchoGate: PartnerScrollEchoGate,
  driverPane: HTMLElement,
): void {
  const t = performance.now();
  if (
    !scrollSyncTraceFeatureFlag() ||
    t - state.lastEchoSkipTraceAt < WIRE_ECHO_SKIP_TRACE_MIN_MS
  ) {
    return;
  }
  state.lastEchoSkipTraceAt = t;
  scrollSyncTrace(`wire.${axis}.flush-skipped`, {
    reason: "partner-echo",
    echoUntilMs: Math.round(ownEchoGate.until),
    [`${axis}ScrollTop`]: driverPane.scrollTop,
  });
}

type DriverWireArgs = {
  axis: "code" | "doc";
  driverPane: HTMLElement;
  state: DriverWireState;
  syncingRef: SyncingRef;
  ownEchoGate: PartnerScrollEchoGate;
  partnerEchoGate: PartnerScrollEchoGate;
  syncFromDriver: (driverDelta: number) => void;
};

/** Builds the RAF flush closure that consumes one driver pane's coalesced scroll bursts. */
function makeDriverFlush(args: DriverWireArgs): () => void {
  const { axis, driverPane, state, syncingRef, ownEchoGate, partnerEchoGate, syncFromDriver } =
    args;
  return (): void => {
    state.pendingRaf = 0;
    if (partnerScrollEchoActive(ownEchoGate)) {
      emitFlushSkippedPartnerEcho(axis, state, ownEchoGate, driverPane);
      state.lastSeenTop = driverPane.scrollTop;
      return;
    }
    if (syncingRef.current !== "none") {
      scrollSyncTrace(`wire.${axis}.flush-skipped`, {
        reason: "sync-in-progress",
        syncing: syncingRef.current,
      });
      return;
    }
    const now = driverPane.scrollTop;
    const delta = now - state.lastSeenTop;
    state.lastSeenTop = now;
    syncingRef.current = axis;
    armPartnerScrollEchoGate(partnerEchoGate);
    scrollSyncTrace(`wire.${axis}.driver`, { delta, [`${axis}ScrollTop`]: now });
    syncFromDriver(delta);
    syncingRef.current = "none";
  };
}

/** Installs the `scroll` listener on one driver pane that schedules at most one flush per frame. */
function attachDriverScrollListener(args: {
  driverPane: HTMLElement;
  state: DriverWireState;
  syncingRef: SyncingRef;
  ownEchoGate: PartnerScrollEchoGate;
  flush: () => void;
}): void {
  const { driverPane, state, syncingRef, ownEchoGate, flush } = args;
  driverPane.addEventListener(
    "scroll",
    () => {
      if (partnerScrollEchoActive(ownEchoGate)) {
        state.lastSeenTop = driverPane.scrollTop;
        if (state.pendingRaf !== 0) {
          cancelAnimationFrame(state.pendingRaf);
          state.pendingRaf = 0;
        }
        return;
      }
      if (syncingRef.current !== "none") {
        state.lastSeenTop = driverPane.scrollTop;
        return;
      }
      if (state.pendingRaf !== 0) {
        cancelAnimationFrame(state.pendingRaf);
      }
      state.pendingRaf = requestAnimationFrame(flush);
    },
    { passive: true },
  );
}

/**
 * Coalesces high-frequency `scroll` bursts into **one** partner sync per pane per animation
 * frame so block-aware snaps do not chain immediate reverse syncs (“slot machine” feel).
 */
function wireBidirectionalScroll(
  codePane: HTMLElement,
  docPane: HTMLElement,
  syncFromCode: (driverDelta: number) => void,
  syncFromDoc: (driverDelta: number) => void,
): void {
  const syncingRef: SyncingRef = { current: "none" };
  /** Code pane: ignore scroll echoes while we are applying a doc→code partner update. */
  const suppressCodeScrollEcho: PartnerScrollEchoGate = { until: 0 };
  /** Doc pane: ignore scroll echoes while we are applying a code→doc partner update. */
  const suppressDocScrollEcho: PartnerScrollEchoGate = { until: 0 };
  const codeState: DriverWireState = {
    lastSeenTop: codePane.scrollTop,
    pendingRaf: 0,
    lastEchoSkipTraceAt: -Infinity,
  };
  const docState: DriverWireState = {
    lastSeenTop: docPane.scrollTop,
    pendingRaf: 0,
    lastEchoSkipTraceAt: -Infinity,
  };
  const flushCode = makeDriverFlush({
    axis: "code",
    driverPane: codePane,
    state: codeState,
    syncingRef,
    ownEchoGate: suppressCodeScrollEcho,
    partnerEchoGate: suppressDocScrollEcho,
    syncFromDriver: syncFromCode,
  });
  const flushDoc = makeDriverFlush({
    axis: "doc",
    driverPane: docPane,
    state: docState,
    syncingRef,
    ownEchoGate: suppressDocScrollEcho,
    partnerEchoGate: suppressCodeScrollEcho,
    syncFromDriver: syncFromDoc,
  });
  attachDriverScrollListener({
    driverPane: codePane,
    state: codeState,
    syncingRef,
    ownEchoGate: suppressCodeScrollEcho,
    flush: flushCode,
  });
  attachDriverScrollListener({
    driverPane: docPane,
    state: docState,
    syncingRef,
    ownEchoGate: suppressDocScrollEcho,
    flush: flushDoc,
  });
}

/** One-shot runners used when the mobile single-pane flip reveals the partner pane. */
type DualPaneScrollSyncRunners = {
  /** Apply code scroll position to the parallel-docs scroll element. */
  syncFromCodeToDoc: () => void;
  /** Apply parallel-docs scroll position to the code pane. */
  syncFromDocToCode: () => void;
  /**
   * Narrow single-pane flip: the outgoing pane must still be visible for viewport probes; the
   * incoming pane must be visible for geometry-based alignment — so capture first, flip
   * `data-dual-mobile-pane`, then {@link finishMobileFlipToCode} on the next frame.
   */
  prepareMobileFlipToCode: () => void;
  finishMobileFlipToCode: () => void;
  prepareMobileFlipToDoc: () => void;
  finishMobileFlipToDoc: () => void;
};

type BlockAwareScrollPaneBundle = {
  codePane: HTMLElement;
  docPane: HTMLElement;
  getLinks: () => BlockScrollLink[];
  lineIdPrefix: () => string;
  sticky: BlockAwareStickyBundle;
  /**
   * When false (block-snap-only strategy), gap and no-index paths skip proportional mirror plans so
   * the partner stays put until the next block snap.
   */
  allowProportionalMirror: boolean;
};

function blockAwareSyncFromCodeToDoc(
  bundle: BlockAwareScrollPaneBundle,
  driverDelta: number,
): void {
  const { codePane, docPane, getLinks, lineIdPrefix, sticky } = bundle;
  const docBefore = readPaneVerticalScroll(docPane);
  const prefix = lineIdPrefix();
  const p = buildCodeToDocFlipPlanBlockAware(
    codePane,
    docPane,
    getLinks,
    prefix,
    sticky,
    bundle.allowProportionalMirror,
  );
  applyCodeToDocFlipPlanImpl(codePane, docPane, p);
  const docAfter = readPaneVerticalScroll(docPane);
  scrollSyncTrace("code→doc.apply", {
    driverDelta,
    lineIdPrefix: prefix,
    plan: formatCodeToDocPlanForLog(p),
    docScrollTopBefore: docBefore,
    docScrollTopAfter: docAfter,
    docDelta: docAfter - docBefore,
    codeScrollTop: codePane.scrollTop,
  });
  enforceScrollSyncMonotonic({
    driverDelta,
    partnerBefore: docBefore,
    partnerPane: docPane,
    axis: "code→doc",
  });
}

function blockAwareSyncFromDocToCode(
  bundle: BlockAwareScrollPaneBundle,
  driverDelta: number,
): void {
  const { codePane, docPane, getLinks, lineIdPrefix, sticky } = bundle;
  const codeBefore = readPaneVerticalScroll(codePane);
  const prefix = lineIdPrefix();
  const p = buildDocToCodeFlipPlanBlockAware(
    docPane,
    codePane,
    getLinks,
    sticky,
    prefix,
    bundle.allowProportionalMirror,
  );
  applyDocToCodeFlipPlanImpl(codePane, docPane, p, prefix);
  const codeAfter = readPaneVerticalScroll(codePane);
  scrollSyncTrace("doc→code.apply", {
    driverDelta,
    lineIdPrefix: prefix,
    plan: formatDocToCodePlanForLog(p),
    codeScrollTopBefore: codeBefore,
    codeScrollTopAfter: codeAfter,
    codeDelta: codeAfter - codeBefore,
    docScrollTop: docPane.scrollTop,
  });
  enforceScrollSyncMonotonic({
    driverDelta,
    partnerBefore: codeBefore,
    partnerPane: codePane,
    axis: "doc→code",
  });
}

/** Index-backed scroll sync when `data-scroll-block-links-b64` is present; else see proportional fallback. */
function wireBlockAwareScrollSync(
  codePane: HTMLElement,
  docPane: HTMLElement,
  getLinks: () => BlockScrollLink[],
  lineIdPrefix: () => string,
  shouldUseProportionalDocToCodeOnMobileFlip?: () => boolean,
  options?: { allowProportionalMirror?: boolean },
): DualPaneScrollSyncRunners {
  const allowProportionalMirror = options?.allowProportionalMirror !== false;
  let pendingDocToCode: DocToCodeFlipPlan | null = null;
  let pendingCodeToDoc: CodeToDocFlipPlan | null = null;
  const sticky: BlockAwareStickyBundle = {
    sourceSticky: { lockedId: null },
    parallelDocsSticky: { lockedId: null },
    linksKey: { current: "" },
  };
  const bundle: BlockAwareScrollPaneBundle = {
    codePane,
    docPane,
    getLinks,
    lineIdPrefix,
    sticky,
    allowProportionalMirror,
  };
  const syncFromCodeToDocInner = (d: number): void => blockAwareSyncFromCodeToDoc(bundle, d);
  const syncFromDocToCodeInner = (d: number): void => blockAwareSyncFromDocToCode(bundle, d);
  const syncFromCodeToDoc = (): void => {
    blockAwareSyncFromCodeToDoc(bundle, 0);
  };
  const syncFromDocToCode = (): void => {
    blockAwareSyncFromDocToCode(bundle, 0);
  };
  const prepareMobileFlipToCode = (): void => {
    if (allowProportionalMirror && shouldUseProportionalDocToCodeOnMobileFlip?.() === true) {
      pendingDocToCode = { k: "mirrorW", ratio: windowScrollRatio() };
      return;
    }
    pendingDocToCode = buildDocToCodeFlipPlanBlockAware(
      docPane,
      codePane,
      getLinks,
      sticky,
      lineIdPrefix(),
      allowProportionalMirror,
    );
  };
  const finishMobileFlipToCode = (): void => {
    if (!pendingDocToCode) return;
    let p = pendingDocToCode;
    pendingDocToCode = null;
    if (p.k === "noop" && p.skipProportionalFallbackOnFlip !== true && allowProportionalMirror) {
      p = buildDocToCodeFlipPlanProportional(docPane);
    }
    applyDocToCodeFlipPlanImpl(codePane, docPane, p, lineIdPrefix());
  };
  const prepareMobileFlipToDoc = (): void => {
    pendingCodeToDoc = buildCodeToDocFlipPlanBlockAware(
      codePane,
      docPane,
      getLinks,
      lineIdPrefix(),
      sticky,
      allowProportionalMirror,
    );
  };
  const finishMobileFlipToDoc = (): void => {
    if (!pendingCodeToDoc) return;
    let p = pendingCodeToDoc;
    pendingCodeToDoc = null;
    if (p.k === "noop" && allowProportionalMirror) {
      p = buildCodeToDocFlipPlanProportional(codePane);
    }
    applyCodeToDocFlipPlanImpl(codePane, docPane, p);
  };
  wireBidirectionalScroll(codePane, docPane, syncFromCodeToDocInner, syncFromDocToCodeInner);
  return {
    syncFromCodeToDoc,
    syncFromDocToCode,
    prepareMobileFlipToCode,
    finishMobileFlipToCode,
    prepareMobileFlipToDoc,
    finishMobileFlipToDoc,
  };
}

/** Proportional scroll sync when there is no index-backed block map (GitHub Pages default). */
function wireProportionalScrollSync(
  codePane: HTMLElement,
  docPane: HTMLElement,
): DualPaneScrollSyncRunners {
  let pendingDocToCode: DocToCodeFlipPlan | null = null;
  let pendingCodeToDoc: CodeToDocFlipPlan | null = null;

  const syncFromCodeToDocInner = (driverDelta: number): void => {
    const docBefore = readPaneVerticalScroll(docPane);
    const p = buildCodeToDocFlipPlanProportional(codePane);
    applyCodeToDocFlipPlanImpl(codePane, docPane, p);
    scrollSyncTrace("code→doc.apply", {
      mode: "proportional-shell",
      driverDelta,
      plan: formatCodeToDocPlanForLog(p),
      docScrollTopBefore: docBefore,
      docScrollTopAfter: readPaneVerticalScroll(docPane),
      codeScrollTop: codePane.scrollTop,
    });
    enforceScrollSyncMonotonic({
      driverDelta,
      partnerBefore: docBefore,
      partnerPane: docPane,
      axis: "code→doc",
    });
  };
  const syncFromDocToCodeInner = (driverDelta: number): void => {
    const codeBefore = readPaneVerticalScroll(codePane);
    const p = buildDocToCodeFlipPlanProportional(docPane);
    applyDocToCodeFlipPlanImpl(codePane, docPane, p);
    scrollSyncTrace("doc→code.apply", {
      mode: "proportional-shell",
      driverDelta,
      plan: formatDocToCodePlanForLog(p),
      codeScrollTopBefore: codeBefore,
      codeScrollTopAfter: readPaneVerticalScroll(codePane),
      docScrollTop: docPane.scrollTop,
    });
    enforceScrollSyncMonotonic({
      driverDelta,
      partnerBefore: codeBefore,
      partnerPane: codePane,
      axis: "doc→code",
    });
  };
  const syncFromCodeToDoc = (): void => {
    syncFromCodeToDocInner(0);
  };
  const syncFromDocToCode = (): void => {
    syncFromDocToCodeInner(0);
  };
  const prepareMobileFlipToCode = (): void => {
    pendingDocToCode = buildDocToCodeFlipPlanProportional(docPane);
  };
  const finishMobileFlipToCode = (): void => {
    if (!pendingDocToCode) return;
    const p = pendingDocToCode;
    pendingDocToCode = null;
    applyDocToCodeFlipPlanImpl(codePane, docPane, p);
  };
  const prepareMobileFlipToDoc = (): void => {
    pendingCodeToDoc = buildCodeToDocFlipPlanProportional(codePane);
  };
  const finishMobileFlipToDoc = (): void => {
    if (!pendingCodeToDoc) return;
    const p = pendingCodeToDoc;
    pendingCodeToDoc = null;
    applyCodeToDocFlipPlanImpl(codePane, docPane, p);
  };
  wireBidirectionalScroll(codePane, docPane, syncFromCodeToDocInner, syncFromDocToCodeInner);
  return {
    syncFromCodeToDoc,
    syncFromDocToCode,
    prepareMobileFlipToCode,
    finishMobileFlipToCode,
    prepareMobileFlipToDoc,
    finishMobileFlipToDoc,
  };
}

function centerYInViewport(el: Element): number {
  const r = el.getBoundingClientRect();
  return (r.top + r.bottom) / 2;
}

/**
 * Vertical anchor for gutter rays on the source side. Must match the **numbered row** the reader
 * sees: the full `.code-line` row (line number + highlighted code) shares one grid row with
 * aligned line-heights. Measuring only `pre code` can shift Y (hljs spans, sub-pixel layout) so
 * rays sit above the line labels; the row’s geometric center tracks `lines:a-b` anchors reliably.
 */
function codeLineHighlightCenterYViewport(lineEl: HTMLElement): number {
  return centerYInViewport(lineEl);
}

function parallelDocsBandEndYViewport(
  docScrollEl: HTMLElement,
  next: BlockScrollLink | undefined,
  docTop: HTMLElement,
  clipThroughPageBreakGaps: boolean,
): number {
  if (next) {
    const nextEl = document.getElementById(`parallel-docs-block-${next.id}`);
    if (!nextEl) return centerYInViewport(docTop);
    const nextTop = nextEl.getBoundingClientRect().top - 3;
    if (!clipThroughPageBreakGaps) return nextTop;
    return parallelDocsGutterDocBandBottomViewport(docScrollEl, docTop, nextEl);
  }
  const dr = docScrollEl.getBoundingClientRect();
  let bottom = dr.bottom - 4;
  const lastKid = docScrollEl.children[docScrollEl.children.length - 1];
  if (lastKid) bottom = Math.min(bottom, lastKid.getBoundingClientRect().bottom - 4);
  if (clipThroughPageBreakGaps) {
    const docBandTop = docTop.getBoundingClientRect().top + 4;
    const contentBottom = maxRenderableParallelDocsContentBottomViewport(docScrollEl, docTop, null);
    bottom = Math.min(bottom, Math.max(docBandTop, contentBottom));
  }
  return bottom;
}

function sourceAnchorIndexFromId(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const n = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : null;
}

function findAnchorAtOrAfter(
  anchors: ReadonlyArray<{ line0: number; el: HTMLElement }>,
  line0: number,
): HTMLElement | null {
  let lo = 0;
  let hi = anchors.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = anchors[mid]?.line0 ?? -1;
    if (line >= line0) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans >= 0 ? (anchors[ans]?.el ?? null) : null;
}

function findAnchorAtOrBefore(
  anchors: ReadonlyArray<{ line0: number; el: HTMLElement }>,
  line0: number,
): HTMLElement | null {
  let lo = 0;
  let hi = anchors.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = anchors[mid]?.line0 ?? -1;
    if (line <= line0) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? (anchors[ans]?.el ?? null) : null;
}

function sourceAnchorsFromPrefix(prefix: string): Array<{ line0: number; el: HTMLElement }> {
  return Array.from(document.querySelectorAll<HTMLElement>(`[id^="${prefix}"]`))
    .map((el) => ({ line0: sourceAnchorIndexFromId(el.id, prefix), el }))
    .filter((x): x is { line0: number; el: HTMLElement } => x.line0 !== null)
    .sort((a, b) => a.line0 - b.line0);
}

function subscribeBlockRayRedraw(
  gutter: HTMLElement,
  codePane: HTMLElement,
  docScrollEl: HTMLElement,
  scheduleDraw: () => void,
): void {
  const onScrollOrResize = (): void => scheduleDraw();
  codePane.addEventListener("scroll", onScrollOrResize, { passive: true });
  docScrollEl.addEventListener("scroll", onScrollOrResize, { passive: true });
  globalThis.addEventListener("resize", onScrollOrResize);
  const ro = new ResizeObserver(onScrollOrResize);
  ro.observe(gutter);
  ro.observe(codePane);
  ro.observe(docScrollEl);
  const shell = gutter.parentElement;
  if (shell) ro.observe(shell);
}

/** Doc-aligned active block matches visible parallel-docs; code-only probe can lag in page gaps. */
function activeBlockIdForGutterRays(
  links: BlockScrollLink[],
  docScrollEl: HTMLElement,
  probeTopSourceLine1Based: () => number,
): string | null {
  const mdLine0ForRay = probeParallelDocsLine0FromDoc(docScrollEl);
  const haveAnchors = docScrollEl.querySelector(".parallel-docs-block-anchor") !== null;
  if (haveAnchors && mdLine0ForRay !== null) {
    return activeBlockIdForParallelDocsLine0(links, mdLine0ForRay);
  }
  return activeBlockIdForViewport(links, probeTopSourceLine1Based());
}

function drawBlockRaysIntoSvg(
  svg: SVGSVGElement,
  gutter: HTMLElement,
  docScrollEl: HTMLElement,
  getLinks: () => BlockScrollLink[],
  probeTopSourceLine1Based: () => number,
  lineIdPrefix: string,
): void {
  const links = dedupeBlockScrollLinksById(getLinks());
  const sorted = sortBlockLinksBySource(links);
  const gutterRect = gutter.getBoundingClientRect();
  const w = gutterRect.width;
  const h = gutterRect.height;
  if (w <= 0 || h <= 0 || sorted.length === 0) {
    svg.replaceChildren();
    return;
  }

  const activeId = activeBlockIdForGutterRays(links, docScrollEl, probeTopSourceLine1Based);
  const clipGutterRaysThroughPageBreakGaps = pageBreakPullEnabled();
  svg.setAttribute("viewBox", `0 0 ${String(w)} ${String(h)}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const parts: string[] = [];
  const sourceAnchors = Array.from(
    document.querySelectorAll<HTMLElement>(`[id^="${lineIdPrefix}"]`),
  )
    .map((el) => ({ line0: sourceAnchorIndexFromId(el.id, lineIdPrefix), el }))
    .filter((x): x is { line0: number; el: HTMLElement } => x.line0 !== null)
    .sort((a, b) => a.line0 - b.line0);

  for (let i = 0; i < sorted.length; i++) {
    const link = sorted[i];
    if (!link) continue;
    const next = nextBlockLinkInParallelDocsOrder(links, link);

    const i0 = codeLineDomIndex0(link.sourceStart);
    const i1 = codeLineDomIndex0(link.sourceEnd);
    const codeTop =
      document.getElementById(`${lineIdPrefix}${String(i0)}`) ??
      findAnchorAtOrAfter(sourceAnchors, i0);
    const codeBot =
      document.getElementById(`${lineIdPrefix}${String(i1)}`) ??
      findAnchorAtOrBefore(sourceAnchors, i1);
    const docTop = document.getElementById(`parallel-docs-block-${link.id}`);
    if (!codeTop || !codeBot || !docTop) continue;

    const docEndYViewport = parallelDocsBandEndYViewport(
      docScrollEl,
      next,
      docTop,
      clipGutterRaysThroughPageBreakGaps,
    );
    const yCodeTop = codeLineHighlightCenterYViewport(codeTop);
    const yCodeBot = codeLineHighlightCenterYViewport(codeBot);
    const yDocTop = docTop.getBoundingClientRect().top + 2;
    const yDocEnd = Math.max(docEndYViewport, yDocTop + 4);

    const c0 = clampViewportYToGutterLocal(yCodeTop, gutterRect.top, h);
    const c1 = clampViewportYToGutterLocal(yDocTop, gutterRect.top, h);
    const c2 = clampViewportYToGutterLocal(yCodeBot, gutterRect.top, h);
    const c3 = clampViewportYToGutterLocal(yDocEnd, gutterRect.top, h);

    const strokeClass =
      link.id === activeId ? "gutter__rays-path gutter__rays-path--active" : "gutter__rays-path";
    const trailClass = `${strokeClass} gutter__rays-path--trail`;

    const topPaths = gutterRayBezierPaths(0, c0.y, w, c1.y, {
      tension: 0.38,
      clipStart: c0.clipped,
      clipEnd: c1.clipped,
    });
    const botPaths = gutterRayBezierPaths(0, c2.y, w, c3.y, {
      tension: 0.38,
      clipStart: c2.clipped,
      clipEnd: c3.clipped,
    });

    const topExtra = topPaths.dotted ? `<path class="${trailClass}" d="${topPaths.dotted}" />` : "";
    const botExtra = botPaths.dotted ? `<path class="${trailClass}" d="${botPaths.dotted}" />` : "";

    parts.push(
      `<g class="gutter__rays-block" data-parallel-docs-block="${escapeHtmlText(link.id)}">` +
        `<path class="${strokeClass}" d="${topPaths.solid}" />` +
        topExtra +
        `<path class="${strokeClass}" d="${botPaths.solid}" />` +
        botExtra +
        `</g>`,
    );
  }

  svg.innerHTML = parts.join("");
}

/**
 * Splines in the gutter between each block’s source range and its parallel-docs band (dual pane,
 * index-backed blocks). Emphasizes the block aligned with the **doc** viewport when block anchors
 * exist; otherwise the source viewport. Clamps off-screen endpoints so readers see which way to scroll.
 *
 * @returns Request a redraw after DOM changes that do not resize the panes (e.g. multi-angle body swap).
 */
function wireBlockRayConnectors(args: {
  gutter: HTMLElement;
  codePane: HTMLElement;
  docScrollEl: HTMLElement;
  getLinks: () => BlockScrollLink[];
  probeTopSourceLine1Based: () => number;
  sourceLineIdPrefix?: () => string;
}): () => void {
  const { gutter, codePane, docScrollEl, getLinks, probeTopSourceLine1Based } = args;
  const sourceLineIdPrefix = args.sourceLineIdPrefix ?? (() => "code-line-");

  const svgNs = "http://www.w3.org/2000/svg";
  const host = document.createElement("div");
  host.className = "gutter__rays";
  host.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(svgNs, "svg");
  host.appendChild(svg);
  gutter.appendChild(host);

  let raf = 0;
  function scheduleDraw(): void {
    if (raf !== 0) return;
    raf = globalThis.requestAnimationFrame(() => {
      raf = 0;
      drawBlockRaysIntoSvg(
        svg,
        gutter,
        docScrollEl,
        getLinks,
        probeTopSourceLine1Based,
        sourceLineIdPrefix(),
      );
    });
  }

  subscribeBlockRayRedraw(gutter, codePane, docScrollEl, scheduleDraw);

  scheduleDraw();
  /** First paint can report gutter height 0 before flex layout settles; redraw after layout. */
  globalThis.requestAnimationFrame(() => {
    scheduleDraw();
    globalThis.requestAnimationFrame(scheduleDraw);
  });

  return scheduleDraw;
}

type DocumentedPairNav = {
  sourcePath: string;
  parallelDocsPath: string;
  sourceOnGithub?: string;
  parallelDocsOnGithub?: string;
  staticBrowseUrl?: string;
};

type NavJsonDoc = {
  documentedPairs?: unknown;
};

type TrieNode = {
  children: Map<string, TrieNode>;
  pairs: DocumentedPairNav[];
};

function isDocumentedPairNav(x: unknown): x is DocumentedPairNav {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.sourcePath !== "string" || typeof o.parallelDocsPath !== "string") return false;
  if (o.staticBrowseUrl !== undefined && typeof o.staticBrowseUrl !== "string") return false;
  const sg = o.sourceOnGithub;
  const cg = o.parallelDocsOnGithub;
  const hasSg = typeof sg === "string";
  const hasCg = typeof cg === "string";
  if (hasSg !== hasCg) return false;
  const browseOk = typeof o.staticBrowseUrl === "string" && o.staticBrowseUrl.trim().length > 0;
  if (!browseOk && !hasSg) return false;
  return true;
}

function pairsFromJsonArray(raw: unknown): DocumentedPairNav[] {
  const pairs: DocumentedPairNav[] = [];
  if (!Array.isArray(raw)) return pairs;
  for (const x of raw) {
    if (isDocumentedPairNav(x)) pairs.push(x);
  }
  return pairs;
}

function parallelDocsLineRowFromNavJson(r: Record<string, unknown>): Row | null {
  if (r.kind !== "parallelDocsLine") return null;
  if (typeof r.line !== "number" || typeof r.text !== "string") return null;
  const sp = typeof r.sourcePath === "string" ? r.sourcePath : "";
  const cr = typeof r.parallelDocsPath === "string" ? r.parallelDocsPath : "";
  return { kind: "md", line: r.line, text: r.text, spPath: sp, crPath: cr };
}

function pathRowFromNavJson(r: Record<string, unknown>, pathLine: number): Row | null {
  if (r.kind !== "sourcePath" && r.kind !== "parallelDocsPath") return null;
  const sp = typeof r.sourcePath === "string" ? r.sourcePath : "";
  const cr = typeof r.parallelDocsPath === "string" ? r.parallelDocsPath : "";
  const text = r.kind === "sourcePath" ? sp : cr;
  if (!text) return null;
  return { kind: "path", line: pathLine, text, spPath: sp, crPath: cr };
}

function rowsFromNavSearchJson(doc: unknown): Row[] {
  if (!doc || typeof doc !== "object") return [];
  const rowsRaw = (doc as { rows?: unknown }).rows;
  if (!Array.isArray(rowsRaw)) return [];
  const out: Row[] = [];
  let pathLine = 0;
  for (const raw of rowsRaw) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const mdRow = parallelDocsLineRowFromNavJson(r);
    if (mdRow) {
      out.push(mdRow);
      continue;
    }
    const pathRow = pathRowFromNavJson(r, pathLine);
    if (pathRow) {
      out.push(pathRow);
      pathLine += 1;
    }
  }
  return out;
}

/** Offline-first: UTF-8 base64 JSON array produced by the static Pages build. */
function parseDocumentedPairsFromEmbeddedB64(b64: string): DocumentedPairNav[] {
  const t = b64.trim();
  if (t === "") return [];
  try {
    const raw = JSON.parse(decodeBase64Utf8(t)) as unknown;
    return pairsFromJsonArray(raw);
  } catch {
    return [];
  }
}

function insertSourcePathTrie(root: TrieNode, pair: DocumentedPairNav): void {
  const segments = pair.sourcePath.split("/").filter(Boolean);
  if (segments.length === 0) return;
  let n = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === undefined) continue;
    if (!n.children.has(seg)) n.children.set(seg, { children: new Map(), pairs: [] });
    const next = n.children.get(seg);
    if (next === undefined) return;
    if (i === segments.length - 1) next.pairs.push(pair);
    n = next;
  }
}

function pathBasenamePosixStyle(p: string): string {
  const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = t.lastIndexOf("/");
  return i >= 0 ? t.slice(i + 1) : t;
}

/** Companion Markdown filename stem (e.g. `main` from `.../README.md/main.md`). */
function companionDocStem(parallelDocsPath: string): string {
  const norm = parallelDocsPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const lastSeg = norm.split("/").filter(Boolean).at(-1) ?? "";
  return lastSeg.replace(/\.md$/i, "");
}

function treeFileLinkLabel(pr: DocumentedPairNav, disambiguate: boolean): string {
  const base = pathBasenamePosixStyle(pr.sourcePath);
  if (!disambiguate) return base;
  const stem = companionDocStem(pr.parallelDocsPath);
  return stem !== "" && stem !== base ? `${base} · ${stem}` : base;
}

/** Prefer static hub browse page; optional SCM blob URL when the export has no `staticBrowseUrl`. */
function treeFileLinkHref(pr: DocumentedPairNav): string {
  const browse = (pr.staticBrowseUrl ?? "").trim();
  if (browse.length > 0) {
    return resolveStaticBrowseHref(
      browse,
      globalThis.location.pathname,
      globalThis.location.origin,
    );
  }
  const gh = (pr.parallelDocsOnGithub ?? "").trim();
  return gh.length > 0 ? gh : "#";
}

function treeFileLinkTitle(pr: DocumentedPairNav): string {
  const browse = (pr.staticBrowseUrl ?? "").trim();
  if (browse.length > 0) {
    return `${pr.sourcePath} — open this pair in the site viewer`;
  }
  if ((pr.parallelDocsOnGithub ?? "").trim().length > 0) {
    return `${pr.sourcePath} — open companion parallel-docs on the repository host`;
  }
  return pr.sourcePath;
}

function clearDocumentedTreePairHighlights(tree: HTMLElement): void {
  for (const el of tree.querySelectorAll("a.tree-file-link")) {
    if (!(el instanceof HTMLAnchorElement)) continue;
    el.classList.remove("tree-file-link--current");
    el.removeAttribute("aria-current");
  }
}

function markFirstDocumentedTreeLinkMatchingPair(
  tree: HTMLElement,
  curSrc: string,
  curCr: string,
): void {
  for (const el of tree.querySelectorAll("a.tree-file-link")) {
    if (!(el instanceof HTMLAnchorElement)) continue;
    const sp = el.getAttribute("data-pair-source-path")?.trim() ?? "";
    const cp = el.getAttribute("data-pair-parallel-docs-path")?.trim() ?? "";
    if (!isSameDocumentedPair({ sourcePath: sp, parallelDocsPath: cp }, curSrc, curCr)) continue;
    el.classList.add("tree-file-link--current");
    el.setAttribute("aria-current", "page");
    break;
  }
}

/** Marks the tree link for the pair shown in `#shell` (pair paths from server or multi-angle swap). */
function applyDocumentedTreeCurrentPairHighlight(): void {
  const shell = document.getElementById("shell");
  const tree = document.getElementById("documented-files-tree");
  if (!(shell instanceof HTMLElement) || !(tree instanceof HTMLElement)) return;
  clearDocumentedTreePairHighlights(tree);
  const curSrc = shell.getAttribute("data-parallel-docs-pair-source-path")?.trim() ?? "";
  const curCr = shell.getAttribute("data-parallel-docs-pair-parallel-docs-path")?.trim() ?? "";
  if (curSrc.length === 0 || curCr.length === 0) return;
  markFirstDocumentedTreeLinkMatchingPair(tree, curSrc, curCr);
}

function renderDocumentedTreeHtml(node: TrieNode): string {
  const keys = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return "";
  const lis: string[] = [];
  for (const name of keys) {
    const ch = node.children.get(name);
    if (ch === undefined) continue;
    if (ch.children.size > 0) {
      const inner = renderDocumentedTreeHtml(ch);
      lis.push(`<li><div class="tree-dir">${escapeHtmlText(name)}</div>${inner}</li>`);
    }
    if (ch.pairs.length > 0) {
      const multi = ch.pairs.length > 1;
      for (const pr of ch.pairs) {
        const label = escapeHtmlText(treeFileLinkLabel(pr, multi));
        const title = escapeHtmlText(treeFileLinkTitle(pr));
        const href = escapeHtmlText(treeFileLinkHref(pr));
        const spAttr = escapeHtmlText(normPosixPath(pr.sourcePath));
        const crAttr = escapeHtmlText(normPosixPath(pr.parallelDocsPath));
        const useSiteBrowse = (pr.staticBrowseUrl?.trim() ?? "").length > 0;
        const external = useSiteBrowse ? "" : ' target="_blank" rel="noopener noreferrer"';
        lis.push(
          `<li><div class="tree-file">` +
            `<a class="tree-file-link" href="${href}" data-pair-source-path="${spAttr}" data-pair-parallel-docs-path="${crAttr}"${external} title="${title}">${label}</a>` +
            `</div></li>`,
        );
      }
    }
  }
  return `<ul>${lis.join("")}</ul>`;
}

function renderDocumentedPairsIntoHost(
  treeHost: HTMLElement,
  pairs: DocumentedPairNav[],
  emptyBecauseFilter?: boolean,
): void {
  if (pairs.length === 0) {
    treeHost.innerHTML = emptyBecauseFilter
      ? '<p class="nav-rail__doc-hub-hint" role="status">No paths match this filter.</p>'
      : '<p class="nav-rail__doc-hub-hint" role="status">No documented pairs in this export.</p>';
    return;
  }
  const root: TrieNode = { children: new Map(), pairs: [] };
  for (const p of pairs) insertSourcePathTrie(root, p);
  treeHost.innerHTML = renderDocumentedTreeHtml(root);
  applyDocumentedTreeCurrentPairHighlight();
}

function loadDocumentedPairs(
  jsonUrl: string,
  embeddedB64: string,
): () => Promise<DocumentedPairNav[]> {
  let loaded: DocumentedPairNav[] | null = null;
  let loadPromise: Promise<void> | null = null;
  return async () => {
    if (loaded !== null) return loaded;
    if (loadPromise === null) {
      loadPromise = (async () => {
        if (embeddedB64.length > 0) {
          loaded = parseDocumentedPairsFromEmbeddedB64(embeddedB64);
          if (loaded.length > 0) return;
        }
        if (jsonUrl.length === 0) {
          loaded = [];
          return;
        }
        const res = await fetch(jsonUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`nav json ${String(res.status)}`);
        const body = (await res.json()) as NavJsonDoc;
        loaded = pairsFromJsonArray(body.documentedPairs);
      })();
    }
    await loadPromise;
    return loaded ?? [];
  };
}

/**
 * On narrow viewports the toolbar strip uses horizontal overflow; absolutely positioned
 * `.nav-rail__doc-hub-inner` is clipped. Pin the panel with `position: fixed` while open.
 */
function wireDocumentedFilesTreeMobileFlyout(hub: HTMLDetailsElement): () => void {
  const innerCandidate = hub.querySelector(".nav-rail__doc-hub-inner");
  if (!(innerCandidate instanceof HTMLElement)) {
    return (): void => {};
  }
  const flyoutInner: HTMLElement = innerCandidate;
  const mq = globalThis.matchMedia("(max-width: 767px)");

  function summaryEl(): HTMLElement | null {
    const s = hub.querySelector("summary");
    return s instanceof HTMLElement ? s : null;
  }

  function placeFlyout(): void {
    if (!hub.open || !mq.matches) {
      flyoutInner.style.removeProperty("position");
      flyoutInner.style.removeProperty("top");
      flyoutInner.style.removeProperty("left");
      flyoutInner.style.removeProperty("right");
      flyoutInner.style.removeProperty("width");
      flyoutInner.style.removeProperty("max-width");
      flyoutInner.style.removeProperty("max-height");
      flyoutInner.style.removeProperty("z-index");
      return;
    }
    const sum = summaryEl();
    if (!sum) return;
    const r = sum.getBoundingClientRect();
    const pad = 8;
    flyoutInner.style.position = "fixed";
    flyoutInner.style.top = `${String(Math.round(r.bottom + 4))}px`;
    flyoutInner.style.left = `${String(Math.round(pad))}px`;
    flyoutInner.style.right = `${String(Math.round(pad))}px`;
    flyoutInner.style.width = "auto";
    flyoutInner.style.maxWidth = "none";
    flyoutInner.style.maxHeight = "min(52vh, 400px)";
    flyoutInner.style.zIndex = "200";
  }

  mq.addEventListener("change", placeFlyout);
  globalThis.addEventListener("resize", placeFlyout);
  globalThis.addEventListener("scroll", placeFlyout, true);
  return placeFlyout;
}

function focusDocumentedFilesFilterInput(): void {
  const el = document.getElementById("documented-files-filter");
  if (!(el instanceof HTMLInputElement)) return;
  focusListRowAndReveal(el);
}

function focusDocumentedFilesHubSummaryIfPresent(hub: HTMLDetailsElement): void {
  const sum = hub.querySelector("summary");
  if (sum instanceof HTMLElement) sum.focus({ preventScroll: true });
}

/** Escape to close; pointer outside `#documented-files-hub` to close (capture). */
function wireDocumentedFilesHubDismissalHandlers(hub: HTMLDetailsElement): void {
  function onEscape(ev: KeyboardEvent): void {
    if (!hub.open || ev.key !== "Escape") return;
    ev.preventDefault();
    hub.open = false;
    focusDocumentedFilesHubSummaryIfPresent(hub);
  }
  document.addEventListener("keydown", onEscape, true);

  document.addEventListener(
    "pointerdown",
    (ev: PointerEvent) => {
      if (!hub.open) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (hub.contains(t)) return;
      hub.open = false;
      focusDocumentedFilesHubSummaryIfPresent(hub);
    },
    true,
  );
}

function wireDocumentedFilesTree(): void {
  const hub = document.getElementById("documented-files-hub");
  const treeHost = document.getElementById("documented-files-tree");
  const filterInput = document.getElementById("documented-files-filter");
  const shell = document.getElementById("shell");
  if (!(hub instanceof HTMLDetailsElement) || !(treeHost instanceof HTMLElement)) {
    return;
  }

  const detailsHub: HTMLDetailsElement = hub;
  const treeMount: HTMLElement = treeHost;

  const jsonUrl = detailsHub.getAttribute("data-nav-json-url")?.trim() ?? "";
  const embeddedB64 = shell?.getAttribute("data-documented-pairs-b64")?.trim() ?? "";
  if (jsonUrl.length === 0 && embeddedB64.length === 0) return;

  const placeDocHubFlyout = wireDocumentedFilesTreeMobileFlyout(detailsHub);

  const ensureLoaded = loadDocumentedPairs(jsonUrl, embeddedB64);
  let cachedPairs: DocumentedPairNav[] | null = null;

  function applyFilterAndRender(): void {
    if (cachedPairs === null) return;
    const q = filterInput instanceof HTMLInputElement ? filterInput.value : "";
    const pairs = filterPairsByDocumentedTreeQuery(cachedPairs, q);
    const filterActive = q.trim().length > 0;
    renderDocumentedPairsIntoHost(
      treeMount,
      pairs,
      filterActive && cachedPairs.length > 0 && pairs.length === 0,
    );
  }

  async function hydrateTree(): Promise<void> {
    try {
      const pairs = await ensureLoaded();
      cachedPairs = pairs;
      applyFilterAndRender();
    } catch {
      cachedPairs = null;
      treeMount.innerHTML =
        '<p class="nav-rail__doc-hub-hint" role="alert">Could not load the file list.</p>';
    }
  }

  detailsHub.addEventListener("toggle", () => {
    placeDocHubFlyout();
    if (detailsHub.open) {
      globalThis.requestAnimationFrame(() => {
        placeDocHubFlyout();
        focusDocumentedFilesFilterInput();
      });
    }
    if (!detailsHub.open) return;
    void hydrateTree();
  });

  wireDocumentedFilesHubDismissalHandlers(detailsHub);

  treeMount.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!detailsHub.open || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLAnchorElement) || !t.classList.contains("tree-file-link")) return;
    const links = listDocumentedTreeFileLinks(treeMount);
    if (links.length === 0) return;
    const idx = links.indexOf(t);
    if (idx < 0) return;
    if (e.key === "ArrowDown") {
      if (idx < links.length - 1) {
        focusListRowAndReveal(links[idx + 1]);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (idx > 0) {
        focusListRowAndReveal(links[idx - 1]);
        e.preventDefault();
        return;
      }
      if (filterInput instanceof HTMLInputElement) {
        focusListRowAndReveal(filterInput);
        e.preventDefault();
      }
    }
  });

  if (filterInput instanceof HTMLInputElement) {
    filterInput.addEventListener("input", () => {
      if (!detailsHub.open || cachedPairs === null) return;
      applyFilterAndRender();
    });
    filterInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!detailsHub.open || e.isComposing || e.key !== "ArrowDown") return;
      const links = listDocumentedTreeFileLinks(treeMount);
      if (links.length === 0) return;
      focusListRowAndReveal(links[0]);
      e.preventDefault();
    });
  }
}

function wireSplitter(
  storageSplit: string,
  shell: HTMLElement,
  codePane: HTMLElement,
  gutter: HTMLElement,
  initialPct: number,
): void {
  let dragging = false;
  let lastPct = initialPct;
  function onMove(ev: MouseEvent): void {
    if (!dragging) return;
    const rect = shell.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const p = clamp((x / rect.width) * 100, 15, 85);
    lastPct = p;
    codePane.style.flex = `0 0 ${p}%`;
    shell.style.setProperty("--split-pct", `${String(p)}%`);
  }
  function stop(): void {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", stop);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    writeWebStorageItem(localStorage, storageSplit, String(lastPct));
  }
  gutter.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
  });
}

const STORAGE_SPLIT_PCT = "parallel-docs.codeParallelDocsStatic.splitPct";
const STORAGE_WRAP_LINES = "parallel-docs.codeParallelDocsStatic.wrap";
const STORAGE_DUAL_MOBILE_PANE = "parallel-docs.codeParallelDocsStatic.dualMobilePane";
const STORAGE_SOURCE_MARKDOWN_PANE_MODE =
  "parallel-docs.codeParallelDocsStatic.sourceMarkdownPaneMode";
const STORAGE_PAGE_BREAKS_ENABLED = "parallel-docs.codeParallelDocsStatic.pageBreaksEnabled";
/** Matches `code-browser.ts` `@media (max-width: 767px)` (dual column from 768px up). */
const DUAL_MOBILE_SINGLE_PANE_MQ = "(max-width: 767px)";

function normalizedDualMobilePane(v: string | null | undefined): "code" | "doc" {
  return v === "code" ? "code" : "doc";
}

function splitLocationHashTokens(rawHash: string): string[] {
  const hash = rawHash.replace(/^#/, "").trim();
  if (hash.length === 0) return [];
  return hash
    .split(/--|&/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function mobilePaneHashToken(pane: "code" | "doc"): string {
  return `mobile-pane-${pane}`;
}

function mobilePaneFromLocationHash(rawHash: string): "code" | "doc" | null {
  const tokens = splitLocationHashTokens(rawHash);
  for (const token of tokens) {
    if (token === "mobile-pane-code") return "code";
    if (token === "mobile-pane-doc") return "doc";
  }
  return null;
}

function updateLocationHashToken(token: string, shouldReplace: (t: string) => boolean): void {
  const tokens = splitLocationHashTokens(globalThis.location.hash).filter((t) => !shouldReplace(t));
  tokens.push(token);
  const u = new URL(globalThis.location.href);
  u.hash = tokens.length > 0 ? tokens.join("&") : "";
  globalThis.history.replaceState(globalThis.history.state, "", u.toString());
}

function updateLocationHashForMobilePane(pane: "code" | "doc"): void {
  updateLocationHashToken(mobilePaneHashToken(pane), (t) => /^mobile-pane-(?:code|doc)$/.test(t));
}

function isNarrowViewport(): boolean {
  return globalThis.matchMedia(DUAL_MOBILE_SINGLE_PANE_MQ).matches;
}

function syncSinglePaneShellState(shell: HTMLElement, narrowSinglePane: boolean): void {
  if (narrowSinglePane) {
    shell.setAttribute("data-mobile-single-pane", "true");
    return;
  }
  shell.removeAttribute("data-mobile-single-pane");
}

function wireWideModeIntroTrigger(shell: HTMLElement): void {
  const btn = document.getElementById("parallel-docs-help-tour");
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener("click", () => {
    wireWideModeIntroTour(shell, isNarrowViewport, { force: true });
  });
}

function sourcePaneModeForShell(shell: HTMLElement): "source" | "rendered-markdown" {
  return shell.getAttribute("data-source-pane-mode") === "rendered-markdown"
    ? "rendered-markdown"
    : "source";
}

function pageBreaksEnabledFromStorage(raw: string | null): boolean {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "0" || t === "false" || t === "off") return false;
  return true;
}

function applyPageBreakFeatureToggle(shell: HTMLElement): void {
  const enabled = pageBreaksEnabledFromStorage(
    readWebStorageItem(localStorage, STORAGE_PAGE_BREAKS_ENABLED),
  );
  shell.setAttribute("data-page-breaks-enabled", enabled ? "true" : "false");
}

function wireResponsivePageBreakHeight(shell: HTMLElement): void {
  const setHeight = (): void => {
    const viewportHeight = Math.max(
      globalThis.innerHeight,
      document.documentElement?.clientHeight ?? 0,
    );
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
    const minHeightPx = Math.round(clamp(viewportHeight * 0.72, 260, 820));
    shell.style.setProperty("--parallel-docs-page-break-min-height", `${String(minHeightPx)}px`);
  };
  globalThis.addEventListener("resize", setHeight, { passive: true });
  globalThis.addEventListener("orientationchange", setHeight, { passive: true });
  globalThis.visualViewport?.addEventListener("resize", setHeight, { passive: true });
  setHeight();
}

function syncWrapLinesVisibilityForSourcePaneMode(shell: HTMLElement): void {
  const wrapToggle = document.querySelector("label.toolbar-wrap-lines");
  if (!(wrapToggle instanceof HTMLLabelElement)) return;
  wrapToggle.hidden = sourcePaneModeForShell(shell) === "rendered-markdown";
}

function sourceLineIdPrefixForShell(shell: HTMLElement): "code-line-" | "code-md-line-" {
  return sourcePaneModeForShell(shell) === "rendered-markdown" ? "code-md-line-" : "code-line-";
}

/** When the parallel-docs pane is visible, (re)run Mermaid so diagrams are not laid out under display:none. */
function scheduleMermaidWhenDualDocPaneVisible(shell: HTMLElement, mq: MediaQueryList): void {
  const kick = (): void => {
    if (shell.getAttribute("data-layout") !== "dual") return;
    if (!mq.matches) return;
    if (normalizedDualMobilePane(shell.getAttribute("data-dual-mobile-pane")) !== "doc") return;
    const docBody = document.getElementById("doc-pane-body");
    if (!(docBody instanceof HTMLElement)) return;
    void runMermaidOnFreshDocNodes(docBody);
  };
  queueMicrotask(() => {
    kick();
    requestAnimationFrame(() => {
      kick();
      requestAnimationFrame(kick);
    });
  });
}

function wireDualMobilePaneFlipScrollAffordance(
  primaryFlip: HTMLButtonElement,
  scrollFlip: HTMLButtonElement,
  mq: MediaQueryList,
): void {
  const hideScroll = (): void => {
    scrollFlip.hidden = true;
    scrollFlip.classList.remove("is-visible");
  };
  const showScroll = (): void => {
    scrollFlip.hidden = false;
    scrollFlip.classList.add("is-visible");
  };
  /** Prefer geometry over IntersectionObserver: a sliver “intersecting” the viewport is still unusable. */
  const tick = (): void => {
    if (!mq.matches) {
      hideScroll();
      return;
    }
    const r = primaryFlip.getBoundingClientRect();
    const vh = globalThis.innerHeight;
    const margin = 10;
    const offScreen = r.bottom < margin || r.top > vh - margin;
    if (offScreen) showScroll();
    else hideScroll();
  };
  globalThis.addEventListener("scroll", tick, { passive: true });
  globalThis.addEventListener("resize", tick, { passive: true });
  mq.addEventListener("change", tick);
  globalThis.requestAnimationFrame(tick);
}

function wireSourceMarkdownPaneFlipAffordance(
  primaryFlip: HTMLButtonElement,
  scrollFlip: HTMLButtonElement,
  signal?: AbortSignal,
): void {
  const hideScroll = (): void => {
    scrollFlip.hidden = true;
    scrollFlip.classList.remove("is-visible");
  };
  const showScroll = (): void => {
    scrollFlip.hidden = false;
    scrollFlip.classList.add("is-visible");
  };
  const tick = (): void => {
    if (primaryFlip.hidden || primaryFlip.getClientRects().length === 0) {
      hideScroll();
      return;
    }
    const r = primaryFlip.getBoundingClientRect();
    const vh = globalThis.innerHeight;
    const margin = 10;
    const offScreen = r.bottom < margin || r.top > vh - margin;
    if (offScreen) showScroll();
    else hideScroll();
  };
  globalThis.addEventListener("scroll", tick, { passive: true, signal });
  globalThis.addEventListener("resize", tick, { passive: true, signal });
  globalThis.requestAnimationFrame(tick);
}

function syncSourceMarkdownToggleVisibility(
  shell: HTMLElement,
  primaryFlip: HTMLButtonElement,
  scrollFlip: HTMLButtonElement | null,
): void {
  const hidden =
    isNarrowViewport() &&
    normalizedDualMobilePane(shell.getAttribute("data-dual-mobile-pane")) !== "code";
  primaryFlip.hidden = hidden;
  if (hidden) {
    primaryFlip.setAttribute("aria-hidden", "true");
    primaryFlip.style.setProperty("display", "none", "important");
  } else {
    primaryFlip.removeAttribute("aria-hidden");
    primaryFlip.style.removeProperty("display");
  }
  if (!(scrollFlip instanceof HTMLButtonElement)) return;
  scrollFlip.hidden = true;
  scrollFlip.classList.remove("is-visible");
}

function closestSourceLine0ForPaneTop(codePane: HTMLElement, idPrefix: string): number | null {
  const rows = codePane.querySelectorAll<HTMLElement>(`[id^="${idPrefix}"]`);
  if (rows.length === 0) return null;
  const y = paneUsesInternalYScroll(codePane)
    ? codePane.getBoundingClientRect().top + codePane.clientTop + 2
    : Math.max(0, codePane.getBoundingClientRect().top) + 2;
  for (const el of rows) {
    const r = el.getBoundingClientRect();
    if (r.bottom > y - 1e-3) {
      const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(el.id);
      if (!m?.[1]) return null;
      return Number.parseInt(m[1], 10);
    }
  }
  const last = rows[rows.length - 1];
  if (!last) return null;
  const m = /^(?:code-line-|code-md-line-)(\d+)$/.exec(last.id);
  if (!m?.[1]) return null;
  return Number.parseInt(m[1], 10);
}

function wireSourceMarkdownPaneFlip(
  shell: HTMLElement,
  codePane: HTMLElement,
  flipBtn: HTMLButtonElement,
  flipScrollBtn: HTMLButtonElement | null,
  signal: AbortSignal,
  onAfterFlip?: () => void,
): void {
  function sourceMarkdownBodies(): HTMLElement[] {
    return Array.from(codePane.querySelectorAll<HTMLElement>('[data-source-markdown-body="true"]'));
  }

  function syncSourceMarkdownFlipA11y(): void {
    const mode = sourcePaneModeForShell(shell);
    const renderedActive = mode === "rendered-markdown";
    const nextModeLabel = renderedActive ? "markdown source" : "rendered markdown";
    const currentModeLabel = renderedActive ? "rendered markdown" : "markdown source";
    const ariaLabel = `Switch source pane to ${nextModeLabel}`;
    const title = `Switch source pane to ${nextModeLabel} (currently ${currentModeLabel})`;
    const apply = (btn: HTMLButtonElement | null): void => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.setAttribute("aria-pressed", renderedActive ? "true" : "false");
      btn.setAttribute("aria-label", ariaLabel);
      btn.title = title;
    };
    apply(flipBtn);
    apply(flipScrollBtn);
  }

  syncSourceMarkdownFlipA11y();
  syncWrapLinesVisibilityForSourcePaneMode(shell);
  syncSourceMarkdownToggleVisibility(shell, flipBtn, flipScrollBtn);
  const onViewportChange = (): void => {
    syncSourceMarkdownToggleVisibility(shell, flipBtn, flipScrollBtn);
  };
  globalThis.addEventListener("resize", onViewportChange, { passive: true, signal });
  const mobileMq = globalThis.matchMedia(DUAL_MOBILE_SINGLE_PANE_MQ);
  mobileMq.addEventListener("change", onViewportChange, { signal });
  const observer = new MutationObserver(onViewportChange);
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ["data-dual-mobile-pane", "data-source-pane-mode"],
  });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  const runFlip = (): void => {
    const cur = sourcePaneModeForShell(shell);
    const currentPrefix = cur === "rendered-markdown" ? "code-md-line-" : "code-line-";
    const line0 = closestSourceLine0ForPaneTop(codePane, currentPrefix);
    const next = cur === "rendered-markdown" ? "source" : "rendered-markdown";
    const nextPrefix = next === "rendered-markdown" ? "code-md-line-" : "code-line-";
    shell.setAttribute("data-source-pane-mode", next);
    writeWebStorageItem(localStorage, STORAGE_SOURCE_MARKDOWN_PANE_MODE, next);
    if (isNarrowViewport()) {
      const curPane = normalizedDualMobilePane(shell.getAttribute("data-dual-mobile-pane"));
      if (curPane === "doc") {
        shell.setAttribute("data-dual-mobile-pane", "code");
        writeWebStorageItem(localStorage, STORAGE_DUAL_MOBILE_PANE, "code");
        updateLocationHashForMobilePane("code");
      }
    }
    syncSourceMarkdownFlipA11y();
    syncWrapLinesVisibilityForSourcePaneMode(shell);
    const shouldWriteRevealScroll = !isNarrowViewport() || paneUsesInternalYScroll(codePane);
    if (line0 !== null && shouldWriteRevealScroll) {
      const row = codePane.querySelector(`#${nextPrefix}${String(line0)}`);
      if (row instanceof HTMLElement) {
        applyRevealChildInPane(codePane, row, 0);
      }
    }
    if (next === "rendered-markdown") {
      for (const sourceMdBody of sourceMarkdownBodies()) {
        void runMermaidOnFreshDocNodes(sourceMdBody);
        rewriteHubRelativeBrowseAnchorsIn(sourceMdBody);
      }
    }
    onAfterFlip?.();
  };
  flipBtn.addEventListener("click", runFlip, { signal });
  if (flipScrollBtn) {
    flipScrollBtn.addEventListener("click", runFlip, { signal });
    wireSourceMarkdownPaneFlipAffordance(flipBtn, flipScrollBtn, signal);
  }
}

function wireDualMobilePaneFlip(
  shell: HTMLElement,
  flipBtn: HTMLButtonElement,
  scrollRunners: DualPaneScrollSyncRunners,
  flipScrollBtn: HTMLButtonElement | null,
): void {
  const mq = globalThis.matchMedia(DUAL_MOBILE_SINGLE_PANE_MQ);
  function readStoredPane(): "code" | "doc" {
    const fromHash = mobilePaneFromLocationHash(globalThis.location.hash);
    if (fromHash !== null) return fromHash;
    return normalizedDualMobilePane(readWebStorageItem(localStorage, STORAGE_DUAL_MOBILE_PANE));
  }
  function applyForViewport(): void {
    if (mq.matches) {
      syncSinglePaneShellState(shell, true);
      shell.setAttribute("data-dual-mobile-pane", readStoredPane());
    } else {
      syncSinglePaneShellState(shell, false);
      shell.removeAttribute("data-dual-mobile-pane");
    }
  }
  const runFlip = (): void => {
    if (!mq.matches) return;
    const cur = normalizedDualMobilePane(shell.getAttribute("data-dual-mobile-pane"));
    const next = cur === "code" ? "doc" : "code";
    const rootTopBeforeFlip = rootScrollingElement().scrollTop;
    if (next === "code") {
      scrollRunners.prepareMobileFlipToCode();
    } else {
      scrollRunners.prepareMobileFlipToDoc();
    }
    shell.setAttribute("data-dual-mobile-pane", next);
    writeWebStorageItem(localStorage, STORAGE_DUAL_MOBILE_PANE, next);
    updateLocationHashForMobilePane(next);
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        if (next === "code") {
          scrollRunners.finishMobileFlipToCode();
          const root = rootScrollingElement();
          if (rootTopBeforeFlip > 5 && root.scrollTop <= 1) {
            const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
            root.scrollTop = clamp(rootTopBeforeFlip, 0, maxY);
          }
        } else {
          scrollRunners.finishMobileFlipToDoc();
        }
      });
    });
    // Only here (not on every viewport apply): avoids redundant Mermaid passes on load/resize for the default parallel-docs-first shell.
    if (next === "doc") {
      scheduleMermaidWhenDualDocPaneVisible(shell, mq);
    }
  };
  flipBtn.addEventListener("click", runFlip);
  if (flipScrollBtn) {
    flipScrollBtn.addEventListener("click", runFlip);
    wireDualMobilePaneFlipScrollAffordance(flipBtn, flipScrollBtn, mq);
  }
  mq.addEventListener("change", applyForViewport);
  globalThis.addEventListener("hashchange", applyForViewport);
  applyForViewport();
}

function wireStretchMobilePaneFlip(
  shell: HTMLElement,
  codePane: HTMLElement,
  flipBtn: HTMLButtonElement,
  flipScrollBtn: HTMLButtonElement | null,
  onAfterFlip?: () => void,
): void {
  const stretchTable = codePane instanceof HTMLTableElement ? codePane : null;
  let anchorRow: HTMLTableRowElement | null = null;
  let anchorTopBefore = 0;
  let rootTopBefore = 0;

  const captureAnchor = (): void => {
    const root = rootScrollingElement();
    rootTopBefore = root.scrollTop;
    if (stretchTable === null) {
      anchorRow = null;
      anchorTopBefore = 0;
      return;
    }
    const rows = stretchBlockRows(stretchTable);
    anchorRow = rows.find((row) => row.getBoundingClientRect().bottom > 0) ?? null;
    anchorTopBefore = anchorRow?.getBoundingClientRect().top ?? 0;
  };

  const restoreAnchor = (): void => {
    const root = rootScrollingElement();
    if (anchorRow !== null) {
      const delta = anchorRow.getBoundingClientRect().top - anchorTopBefore;
      if (Math.abs(delta) > 0.5) {
        const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
        root.scrollTop = clamp(root.scrollTop + delta, 0, maxY);
        return;
      }
    }
    const maxY = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = clamp(rootTopBefore, 0, maxY);
  };

  const applyBuffersAndRestore = (): void => {
    if (stretchTable !== null) applyBlockStretchRowBuffers(stretchTable);
    restoreAnchor();
  };

  const runners: DualPaneScrollSyncRunners = {
    syncFromCodeToDoc: () => {},
    syncFromDocToCode: () => {},
    prepareMobileFlipToCode: captureAnchor,
    prepareMobileFlipToDoc: captureAnchor,
    finishMobileFlipToCode: () => {
      applyBuffersAndRestore();
      onAfterFlip?.();
    },
    finishMobileFlipToDoc: () => {
      applyBuffersAndRestore();
      onAfterFlip?.();
      void runMermaidOnFreshDocNodes(shell).then(() => {
        requestAnimationFrame(() => {
          applyBuffersAndRestore();
        });
      });
    },
  };

  wireDualMobilePaneFlip(shell, flipBtn, runners, flipScrollBtn);
}

/** Multi-angle stretch swaps `#shell` innerHTML; disconnect the previous table observer so listeners do not accumulate. */
let stretchRowBufferSyncHandle: BlockStretchBufferSyncHandle | null = null;
let stretchGutterConnectorHandle: { disconnect: () => void; request: () => void } | null = null;

function stretchFlowSynchronizerEnabled(shell: HTMLElement): boolean {
  return shell.getAttribute("data-stretch-buffer-sync") === "flow-synchronizer";
}

function stretchBlockRows(table: HTMLElement): HTMLTableRowElement[] {
  return Array.from(
    table.querySelectorAll<HTMLTableRowElement>(
      "tbody tr.stretch-row--block[data-parallel-docs-stretch-sync-id]",
    ),
  ).filter((row) => (row.dataset.parallelDocsStretchSyncId?.trim() ?? "").length > 0);
}

function stretchRowPairRects(
  row: HTMLTableRowElement,
): { id: string; codeRect: DOMRect; docRect: DOMRect } | null {
  const id = row.dataset.parallelDocsStretchSyncId?.trim() ?? "";
  if (id.length === 0) return null;
  const codeTd = row.querySelector<HTMLTableCellElement>(":scope > td.stretch-code");
  const docTd = row.querySelector<HTMLTableCellElement>(":scope > td.stretch-doc");
  if (!(codeTd instanceof HTMLTableCellElement) || !(docTd instanceof HTMLTableCellElement))
    return null;
  return { id, codeRect: codeTd.getBoundingClientRect(), docRect: docTd.getBoundingClientRect() };
}

function visibleElementRect(el: HTMLElement | null): DOMRect | null {
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const style = globalThis.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  return rect;
}

function stretchVisibleSourcePane(
  codeTd: HTMLTableCellElement,
  shell: HTMLElement,
): HTMLElement | null {
  const preferredSel =
    sourcePaneModeForShell(shell) === "rendered-markdown"
      ? ".source-pane--rendered-md"
      : ".source-pane--code";
  const preferred = codeTd.querySelector<HTMLElement>(preferredSel);
  if (visibleElementRect(preferred) !== null) return preferred;
  const fallbacks = codeTd.querySelectorAll<HTMLElement>(
    ".source-pane--code, .source-pane--rendered-md",
  );
  for (const el of fallbacks) {
    if (visibleElementRect(el) !== null) return el;
  }
  return null;
}

function stretchCodeContentBottomViewport(
  codeTd: HTMLTableCellElement,
  shell: HTMLElement,
): number {
  const visiblePane = stretchVisibleSourcePane(codeTd, shell);
  const paneRect = visibleElementRect(visiblePane);
  if (paneRect !== null) return paneRect.bottom;
  return codeTd.getBoundingClientRect().bottom;
}

function stretchDocContentBottomViewport(docTd: HTMLTableCellElement): number {
  const inner = docTd.querySelector<HTMLElement>(":scope .stretch-doc-inner");
  const innerRect = visibleElementRect(inner);
  if (innerRect !== null) return innerRect.bottom;
  return docTd.getBoundingClientRect().bottom;
}

function activeStretchSyncId(shell: HTMLElement, rows: HTMLTableRowElement[]): string | null {
  const shellRect = shell.getBoundingClientRect();
  const probeY = shellRect.top + Math.min(Math.max(shellRect.height * 0.18, 24), 120);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (rect.top <= probeY && rect.bottom >= probeY) {
      return row.dataset.parallelDocsStretchSyncId?.trim() ?? null;
    }
  }
  return rows[0]?.dataset.parallelDocsStretchSyncId?.trim() ?? null;
}

function drawStretchGutterConnectorsIntoSvg(
  svg: SVGSVGElement,
  shell: HTMLElement,
  table: HTMLElement,
  gutter: HTMLElement,
): void {
  const rows = stretchBlockRows(table);
  const gutterRect = gutter.getBoundingClientRect();
  const w = gutterRect.width;
  const h = gutterRect.height;
  if (w <= 0 || h <= 0 || rows.length === 0) {
    svg.replaceChildren();
    return;
  }

  svg.setAttribute("viewBox", `0 0 ${String(w)} ${String(h)}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const activeId = activeStretchSyncId(shell, rows);
  const parts: string[] = [];

  for (const row of rows) {
    const pair = stretchRowPairRects(row);
    if (pair === null) continue;
    const codeTd = row.querySelector<HTMLTableCellElement>(":scope > td.stretch-code");
    const docTd = row.querySelector<HTMLTableCellElement>(":scope > td.stretch-doc");
    if (!(codeTd instanceof HTMLTableCellElement) || !(docTd instanceof HTMLTableCellElement))
      continue;
    const codeContentBottom = stretchCodeContentBottomViewport(codeTd, shell);
    const docContentBottom = stretchDocContentBottomViewport(docTd);
    const codeTop = clampViewportYToGutterLocal(pair.codeRect.top + 1, gutterRect.top, h);
    const docTop = clampViewportYToGutterLocal(pair.docRect.top + 1, gutterRect.top, h);
    const codeBottom = clampViewportYToGutterLocal(codeContentBottom - 1, gutterRect.top, h);
    const docBottom = clampViewportYToGutterLocal(docContentBottom - 1, gutterRect.top, h);
    const strokeClass =
      pair.id === activeId ? "gutter__rays-path gutter__rays-path--active" : "gutter__rays-path";
    const trailClass = `${strokeClass} gutter__rays-path--trail`;
    const topPaths = gutterRayBezierPaths(0, codeTop.y, w, docTop.y, {
      tension: 0.38,
      clipStart: codeTop.clipped,
      clipEnd: docTop.clipped,
    });
    const bottomPaths = gutterRayBezierPaths(0, codeBottom.y, w, docBottom.y, {
      tension: 0.38,
      clipStart: codeBottom.clipped,
      clipEnd: docBottom.clipped,
    });
    const topExtra = topPaths.dotted ? `<path class="${trailClass}" d="${topPaths.dotted}" />` : "";
    const bottomExtra = bottomPaths.dotted
      ? `<path class="${trailClass}" d="${bottomPaths.dotted}" />`
      : "";
    parts.push(
      `<g class="gutter__rays-block" data-parallel-docs-block="${escapeHtmlText(pair.id)}">` +
        `<path class="${strokeClass}" d="${topPaths.solid}" />` +
        topExtra +
        `<path class="${strokeClass}" d="${bottomPaths.solid}" />` +
        bottomExtra +
        `</g>`,
    );
  }

  svg.innerHTML = parts.join("");
}

function wireStretchGutterConnectors(
  shell: HTMLElement,
  table: HTMLElement,
  gutter: HTMLElement,
): { disconnect: () => void; request: () => void } {
  gutter.querySelector(":scope > .gutter__rays")?.remove();
  const svgNs = "http://www.w3.org/2000/svg";
  const host = document.createElement("div");
  host.className = "gutter__rays";
  host.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(svgNs, "svg");
  host.appendChild(svg);
  gutter.appendChild(host);

  let raf = 0;
  const scheduleDraw = (): void => {
    if (raf !== 0) return;
    raf = globalThis.requestAnimationFrame(() => {
      raf = 0;
      drawStretchGutterConnectorsIntoSvg(svg, shell, table, gutter);
    });
  };
  const onScrollOrResize = (): void => scheduleDraw();
  shell.addEventListener("scroll", onScrollOrResize, { passive: true });
  globalThis.addEventListener("resize", onScrollOrResize);
  const ro = new ResizeObserver(onScrollOrResize);
  ro.observe(shell);
  ro.observe(table);
  ro.observe(gutter);

  scheduleDraw();
  globalThis.requestAnimationFrame(() => {
    scheduleDraw();
    globalThis.requestAnimationFrame(scheduleDraw);
  });

  return {
    disconnect: () => {
      if (raf !== 0) globalThis.cancelAnimationFrame(raf);
      shell.removeEventListener("scroll", onScrollOrResize);
      globalThis.removeEventListener("resize", onScrollOrResize);
      ro.disconnect();
      host.remove();
    },
    request: scheduleDraw,
  };
}

function wireStretchSplitter(shell: HTMLElement, codePane: HTMLElement): void {
  const gutter = document.getElementById("stretch-gutter");
  if (!(gutter instanceof HTMLElement)) return;

  const stored = Number.parseFloat(readWebStorageItem(localStorage, STORAGE_SPLIT_PCT) ?? "");
  const initial = clamp(Number.isFinite(stored) ? stored : 50, 15, 85);
  shell.style.setProperty("--stretch-code-pct", `${String(initial)}%`);

  let dragging = false;
  const onMove = (ev: MouseEvent): void => {
    if (!dragging) return;
    const rect = codePane.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ev.clientX - rect.left;
    const pct = clamp((x / rect.width) * 100, 15, 85);
    shell.style.setProperty("--stretch-code-pct", `${String(pct)}%`);
    writeWebStorageItem(localStorage, STORAGE_SPLIT_PCT, String(pct));
    stretchGutterConnectorHandle?.request();
  };
  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    globalThis.removeEventListener("mousemove", onMove);
    globalThis.removeEventListener("mouseup", onUp);
  };

  gutter.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    dragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
  });
}

/** Wrap toggle always; `BufferingFlowSynchronizer` padding pass only when `#shell` has `data-stretch-buffer-sync="flow-synchronizer"`. */
function wireStretchLayoutChrome(shell: HTMLElement, codePane: HTMLElement): void {
  if (codePane instanceof HTMLTableElement && stretchFlowSynchronizerEnabled(shell)) {
    stretchRowBufferSyncHandle?.disconnect();
    stretchRowBufferSyncHandle = wireBlockStretchBufferSync(codePane);
  } else {
    stretchRowBufferSyncHandle?.disconnect();
    stretchRowBufferSyncHandle = null;
  }
  const wrapCb = document.getElementById("wrap-lines") as HTMLInputElement | null;
  if (wrapCb) {
    wireWrapToggle(STORAGE_WRAP_LINES, codePane, wrapCb, () => {
      globalThis.dispatchEvent(new Event("resize"));
    });
  }
  const gutter = document.getElementById("stretch-gutter");
  stretchGutterConnectorHandle?.disconnect();
  stretchGutterConnectorHandle =
    codePane instanceof HTMLElement && gutter instanceof HTMLElement
      ? wireStretchGutterConnectors(shell, codePane, gutter)
      : null;
  wireStretchSplitter(shell, codePane);
}

type MultiAngleClientPayload = {
  /** `stretch`: swap `#shell` inner from precomputed table HTML (one scroll; no dual sync). */
  layoutMode?: "dual" | "stretch";
  defaultAngleId: string;
  angles: {
    id: string;
    title: string;
    docInnerHtmlB64: string;
    rawMdB64: string;
    scrollBlockLinksB64: string;
    parallelDocsPathForSearch: string;
    parallelDocsOnGithubUrl?: string;
    staticBrowseUrl?: string;
    stretchSwapInnerB64?: string;
  }[];
};

function multiAngleAngleRowLooksValid(row: unknown, layoutMode: "dual" | "stretch"): boolean {
  if (row === null || typeof row !== "object") return false;
  const a = row as { id?: unknown; docInnerHtmlB64?: unknown; stretchSwapInnerB64?: unknown };
  if (typeof a.id !== "string" || typeof a.docInnerHtmlB64 !== "string") return false;
  if (layoutMode !== "stretch") return true;
  return typeof a.stretchSwapInnerB64 === "string" && a.stretchSwapInnerB64.trim().length > 0;
}

function parseMultiAnglePayload(script: HTMLElement | null): MultiAngleClientPayload | null {
  const t = script?.textContent?.trim() ?? "";
  if (!t) return null;
  try {
    const raw = JSON.parse(decodeBase64Utf8(t)) as MultiAngleClientPayload;
    if (!raw || !Array.isArray(raw.angles) || raw.angles.length < 2) return null;
    const layoutMode: "dual" | "stretch" = raw.layoutMode === "stretch" ? "stretch" : "dual";
    if (!raw.angles.every((row) => multiAngleAngleRowLooksValid(row, layoutMode))) return null;
    return { ...raw, layoutMode };
  } catch {
    return null;
  }
}

function applyMultiAngleStretchAngleToShell(
  shell: HTMLElement,
  angle: MultiAngleClientPayload["angles"][number],
): void {
  const innerB64 = angle.stretchSwapInnerB64;
  if (innerB64 === undefined || innerB64.trim().length === 0) return;
  shell.innerHTML = decodeBase64Utf8(innerB64);
  const nextCodePane = document.getElementById("code-pane");
  if (nextCodePane instanceof HTMLElement) {
    wireStretchLayoutChrome(shell, nextCodePane);
    wireSourceMarkdownControls(shell, nextCodePane, () => {
      globalThis.dispatchEvent(new Event("resize"));
    });
    const flipBtn = document.getElementById("mobile-pane-flip");
    const flipScrollBtn = document.getElementById("mobile-pane-flip-scroll");
    if (flipBtn instanceof HTMLButtonElement) {
      wireStretchMobilePaneFlip(
        shell,
        nextCodePane,
        flipBtn,
        flipScrollBtn instanceof HTMLButtonElement ? flipScrollBtn : null,
        () => {
          globalThis.dispatchEvent(new Event("resize"));
        },
      );
    }
  }
  shell.setAttribute("data-scroll-block-links-b64", angle.scrollBlockLinksB64);
  shell.setAttribute("data-raw-md-b64", angle.rawMdB64);
  shell.setAttribute("data-search-parallel-docs-path", angle.parallelDocsPathForSearch);
  const crIdentity = normPosixPath(angle.parallelDocsPathForSearch);
  if (crIdentity.length > 0)
    shell.setAttribute("data-parallel-docs-pair-parallel-docs-path", crIdentity);
  else shell.removeAttribute("data-parallel-docs-pair-parallel-docs-path");
  const docPathEl = document.getElementById("nav-rail-doc-path");
  if (docPathEl) {
    const path = angle.parallelDocsPathForSearch.trim();
    docPathEl.textContent = path.length > 0 ? path : "—";
    if (path.length > 0) docPathEl.setAttribute("title", path);
    else docPathEl.removeAttribute("title");
  }
  const browse = angle.staticBrowseUrl?.trim() ?? "";
  if (browse.length > 0) {
    const resolved = staticBrowseHrefForShellDataAttribute(
      browse,
      globalThis.location.pathname,
      globalThis.location.origin,
    );
    shell.setAttribute("data-parallel-docs-pair-browse-href", resolved);
  } else {
    const ghu = angle.parallelDocsOnGithubUrl?.trim();
    if (ghu) shell.setAttribute("data-parallel-docs-pair-browse-href", ghu);
    else shell.removeAttribute("data-parallel-docs-pair-browse-href");
  }
  applyDocumentedTreeCurrentPairHighlight();
  assignLocationToCanonicalBrowsePermalinkIfNeeded(shell);
  void runMermaidOnFreshDocNodes(shell);
  rewriteHubRelativeBrowseAnchorsIn(shell);
  rootScrollingElement().scrollTop = 0;
}

function wireMultiAngleStretchAngleSelect(
  shell: HTMLElement,
  payload: MultiAngleClientPayload,
  onAngleApplied?: (angle: MultiAngleClientPayload["angles"][number]) => void,
): void {
  if (payload.layoutMode !== "stretch") return;
  const angleSel = document.getElementById("angle-select") as HTMLSelectElement | null;
  if (!angleSel) return;
  angleSel.addEventListener("change", () => {
    const a = payload.angles.find((x) => x.id === angleSel.value);
    if (!a) return;
    applyMultiAngleStretchAngleToShell(shell, a);
    onAngleApplied?.(a);
  });
}

function wireStretchSearchUi(shell: HTMLElement, codePane: HTMLElement): void {
  const searchDom = readDualPaneSearchDom();
  if (!searchDom) return;

  const bundle = buildDualPaneSearcherBundle(shell, codePane);
  const { searchInput, searchClear, searchResults } = searchDom;
  wireSearchUi({
    scope: bundle.scope,
    filePathLabel: bundle.filePathLabel,
    mutable: bundle.mutable,
    rawCode: bundle.rawCode,
    searchInput,
    searchClear,
    searchResults,
    docScrollEl: shell,
  });

  wireDualPaneNavSearchFetch(
    shell,
    bundle.pathInit.documentedPairs,
    bundle.indexState,
    bundle.mutable,
    bundle.rebuildSearcher,
    searchInput,
  );

  const multiScript = document.getElementById("parallel-docs-multi-angle-b64");
  const multiPayload = parseMultiAnglePayload(multiScript);
  if (multiPayload?.layoutMode !== "stretch") return;
  wireMultiAngleStretchAngleSelect(shell, multiPayload, (angle) => {
    bundle.mutable.rawMd = decodeBase64Utf8(angle.rawMdB64);
    bundle.mutable.mdLines = bundle.mutable.rawMd.split("\n");
    bundle.mutable.parallelDocsPathLabel = angle.parallelDocsPathForSearch;
    bundle.rebuildSearcher();
    searchInput.value = "";
    searchResults.innerHTML = "";
    searchResults.hidden = true;
  });
}

type DualPaneCoreDom = {
  docBody: HTMLElement | null;
  docScrollEl: HTMLElement;
  gutter: HTMLElement;
  wrapCb: HTMLInputElement;
};

type DualPaneSearchDom = {
  searchInput: HTMLInputElement;
  searchClear: HTMLElement;
  searchResults: HTMLElement;
};

function readDualPaneCoreDom(): DualPaneCoreDom | null {
  const docPane = document.getElementById("doc-pane");
  const gutter = document.getElementById("gutter");
  const wrapCb = document.getElementById("wrap-lines") as HTMLInputElement | null;
  if (!docPane || !gutter || !wrapCb) {
    return null;
  }
  const docBody = document.getElementById("doc-pane-body");
  const docScrollEl = docBody instanceof HTMLElement ? docBody : docPane;
  return { docBody, docScrollEl, gutter, wrapCb };
}

function readDualPaneSearchDom(): DualPaneSearchDom | null {
  const searchInput = document.getElementById("search-q") as HTMLInputElement | null;
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");
  if (!searchInput || !searchClear || !searchResults) {
    return null;
  }
  return { searchInput, searchClear, searchResults };
}

function hubSearcherRowsForDualPane(args: {
  scope: SearchScope;
  rawCode: string;
  filePathLabel: string;
  hubNavRows: Row[];
  pathRowsForOrdering: Row[];
  rawMd: string;
  parallelDocsPathLabel: string;
}): Row[] {
  const {
    scope,
    rawCode,
    filePathLabel,
    hubNavRows,
    pathRowsForOrdering,
    rawMd,
    parallelDocsPathLabel,
  } = args;
  if (scope !== "parallel-docs-and-paths") {
    return buildIndexedSearchRows(scope, rawCode, rawMd, filePathLabel, parallelDocsPathLabel);
  }
  if (hubNavRows.length > 0) return hubNavRows;
  const pathPart =
    pathRowsForOrdering.length > 0
      ? pathRowsForOrdering
      : buildIndexedSearchRows(scope, rawCode, rawMd, filePathLabel, parallelDocsPathLabel).filter(
          (r) => r.kind === "path",
        );
  const mdRows = rawMd.split("\n").map((text, line) => ({
    kind: "md" as const,
    line,
    text,
    spPath: filePathLabel,
    crPath: parallelDocsPathLabel,
  }));
  return [...pathPart, ...mdRows];
}

function initialParallelDocsScopePathState(
  shell: HTMLElement,
  scope: SearchScope,
  filePathLabel: string,
  parallelDocsPathLabel: string,
): { documentedPairs: DocumentedPairNav[]; pathRowsForOrdering: Row[]; pathBlobWide: string } {
  if (scope !== "parallel-docs-and-paths") {
    return { documentedPairs: [], pathRowsForOrdering: [], pathBlobWide: "" };
  }
  const documentedPairs = parseDocumentedPairsFromEmbeddedB64(
    shell.getAttribute("data-documented-pairs-b64")?.trim() ?? "",
  );
  const pathRowsForOrdering = pathRowsFromDocumentedPairs(documentedPairs);
  const pathBlobWide =
    pathRowsForOrdering.length > 0
      ? pathRowsForOrdering.map((r) => r.text).join("\n")
      : [filePathLabel, parallelDocsPathLabel].filter((s) => s.trim().length > 0).join("\n");
  return { documentedPairs, pathRowsForOrdering, pathBlobWide };
}

function effectiveParallelDocsPathLabelFromDocumentedPairs(
  scope: SearchScope,
  filePathLabel: string,
  parallelDocsPathLabel: string,
  documentedPairs: DocumentedPairNav[],
): string {
  if (scope !== "parallel-docs-and-paths") return parallelDocsPathLabel;
  const sourcePath = filePathLabel.trim();
  if (sourcePath.length === 0) return parallelDocsPathLabel;
  const pair = findDocumentedPair(documentedPairs, "", sourcePath);
  if (!pair) return parallelDocsPathLabel;

  const fromShell = parallelDocsPathLabel.trim();
  const fromPair = pair.parallelDocsPath.trim();
  if (fromPair.length === 0) return parallelDocsPathLabel;
  if (fromShell.length === 0) return fromPair;

  // Older hub HTML can carry placeholder `parallel-docs.md` while documentedPairs already has the real path.
  if (
    normPosixPath(fromShell) === "parallel-docs.md" &&
    normPosixPath(fromPair) !== "parallel-docs.md"
  ) {
    return fromPair;
  }

  return parallelDocsPathLabel;
}

type DualPaneSearchIndexState = {
  hubNavRows: Row[];
  documentedPairs: DocumentedPairNav[];
  pathRowsForOrdering: Row[];
};

/**
 * Fetched `parallel-docs-nav-search.json` sometimes omits `staticBrowseUrl` on pairs; the hub embed
 * carries browse URLs from the same build — merge so search hits open `_site/browse/…`, not GitHub.
 */
function mergeFetchedDocumentedPairsWithEmbeddedBrowse(
  embedded: DocumentedPairNav[],
  fetched: DocumentedPairNav[],
): DocumentedPairNav[] {
  if (fetched.length === 0) return embedded;
  if (embedded.length === 0) return fetched;
  const browseByCr = new Map<string, string>();
  for (const p of embedded) {
    const b = (p.staticBrowseUrl ?? "").trim();
    if (b.length === 0) continue;
    browseByCr.set(normPosixPath(p.parallelDocsPath), b);
  }
  return fetched.map((p) => {
    const have = (p.staticBrowseUrl ?? "").trim();
    if (have.length > 0) return p;
    const fromEmb = browseByCr.get(normPosixPath(p.parallelDocsPath));
    if (fromEmb !== undefined && fromEmb.length > 0) {
      return { ...p, staticBrowseUrl: fromEmb };
    }
    return p;
  });
}

function resolvedNavSearchJsonUrl(shell: HTMLElement): string {
  const raw = shell.getAttribute("data-nav-search-json-url")?.trim() ?? "";
  if (raw.length === 0) return "";
  try {
    return new URL(raw, globalThis.location.href).href;
  } catch {
    return raw;
  }
}

function wireDualPaneNavSearchFetch(
  shell: HTMLElement,
  embeddedPairs: DocumentedPairNav[],
  indexState: DualPaneSearchIndexState,
  mutable: MutableSearchFields,
  rebuildSearcher: () => void,
  searchInput: HTMLInputElement,
): void {
  const navSearchUrl = resolvedNavSearchJsonUrl(shell);
  if (navSearchUrl.length === 0) return;
  void (async () => {
    try {
      const res = await fetch(navSearchUrl, { credentials: "same-origin" });
      if (!res.ok) return;
      const doc = (await res.json()) as NavJsonDoc;
      const fetched = pairsFromJsonArray(doc.documentedPairs);
      const mergedPairs = mergeFetchedDocumentedPairsWithEmbeddedBrowse(embeddedPairs, fetched);
      if (mergedPairs.length > 0) {
        indexState.documentedPairs = mergedPairs;
        mutable.documentedPairs = mergedPairs;
      }
      const nr = rowsFromNavSearchJson(doc);
      if (nr.length === 0) return;
      indexState.hubNavRows = nr;
      indexState.pathRowsForOrdering = nr.filter((r) => r.kind === "path");
      mutable.pathRowsForOrdering = indexState.pathRowsForOrdering;
      mutable.pathBlobWide = indexState.pathRowsForOrdering.map((r) => r.text).join("\n");
      rebuildSearcher();
      if (searchInput.value.trim().length > 0) {
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch {
      /* keep embedded index */
    }
  })();
}

function applySelectedMultiAngle(args: {
  angle: NonNullable<MultiAngleClientPayload>["angles"][number];
  docBody: HTMLElement;
  mutable: MutableSearchFields;
  rebuildSearcher: () => void;
  scrollLinksRef: { current: BlockScrollLink[] };
  shell: HTMLElement;
  searchInput?: HTMLInputElement;
  searchResults?: HTMLElement;
  requestBlockRayRedraw?: () => void;
}): void {
  const {
    angle,
    docBody,
    mutable,
    rebuildSearcher,
    scrollLinksRef,
    shell,
    searchInput,
    searchResults,
    requestBlockRayRedraw,
  } = args;
  docBody.innerHTML = decodeBase64Utf8(angle.docInnerHtmlB64);
  void runMermaidOnFreshDocNodes(docBody);
  rewriteHubRelativeBrowseAnchorsIn(docBody);
  mutable.rawMd = decodeBase64Utf8(angle.rawMdB64);
  mutable.mdLines = mutable.rawMd.split("\n");
  mutable.parallelDocsPathLabel = angle.parallelDocsPathForSearch;
  rebuildSearcher();
  scrollLinksRef.current = parseScrollBlockLinksFromShell(angle.scrollBlockLinksB64);
  shell.setAttribute("data-scroll-block-links-b64", angle.scrollBlockLinksB64);
  shell.setAttribute("data-search-parallel-docs-path", angle.parallelDocsPathForSearch);
  const crIdentity = normPosixPath(angle.parallelDocsPathForSearch);
  if (crIdentity.length > 0)
    shell.setAttribute("data-parallel-docs-pair-parallel-docs-path", crIdentity);
  else shell.removeAttribute("data-parallel-docs-pair-parallel-docs-path");
  applyDocumentedTreeCurrentPairHighlight();
  const docPathEl = document.getElementById("nav-rail-doc-path");
  if (docPathEl) {
    const path = angle.parallelDocsPathForSearch.trim();
    docPathEl.textContent = path.length > 0 ? path : "—";
    if (path.length > 0) docPathEl.setAttribute("title", path);
    else docPathEl.removeAttribute("title");
  }
  const browse = angle.staticBrowseUrl?.trim() ?? "";
  if (browse.length > 0) {
    const resolved = staticBrowseHrefForShellDataAttribute(
      browse,
      globalThis.location.pathname,
      globalThis.location.origin,
    );
    shell.setAttribute("data-parallel-docs-pair-browse-href", resolved);
  } else {
    const ghu = angle.parallelDocsOnGithubUrl?.trim();
    if (ghu) shell.setAttribute("data-parallel-docs-pair-browse-href", ghu);
    else shell.removeAttribute("data-parallel-docs-pair-browse-href");
  }
  if (searchInput && searchResults) {
    searchInput.value = "";
    searchResults.innerHTML = "";
    searchResults.hidden = true;
  }
  assignLocationToCanonicalBrowsePermalinkIfNeeded(shell);
  requestBlockRayRedraw?.();
  globalThis.requestAnimationFrame(() => {
    requestBlockRayRedraw?.();
    globalThis.requestAnimationFrame(() => {
      requestBlockRayRedraw?.();
    });
  });
}

type WireDualPaneMultiAngleScrollArgs = {
  codePane: HTMLElement;
  docScrollEl: HTMLElement;
  docBody: HTMLElement | null;
  shell: HTMLElement;
  scrollLinksRef: { current: BlockScrollLink[] };
  multiPayload: MultiAngleClientPayload | null;
  mutable: MutableSearchFields;
  rebuildSearcher: () => void;
  searchInput?: HTMLInputElement;
  searchResults?: HTMLElement;
  requestBlockRayRedraw?: () => void;
};

/**
 * Indexed / multi-angle wiring plus proportional fallback when there is no block map.
 * `allowProportionalMirror: false` implements **block-snap-only** (partner holds in gaps / no index).
 */
function wireDualPaneScrollIndexedOrProportional(
  args: WireDualPaneMultiAngleScrollArgs,
  blockAwareOpts: { allowProportionalMirror: boolean },
): DualPaneScrollSyncRunners {
  const {
    codePane,
    docScrollEl,
    docBody,
    shell,
    scrollLinksRef,
    multiPayload,
    mutable,
    rebuildSearcher,
    searchInput,
    searchResults,
    requestBlockRayRedraw,
  } = args;
  if (multiPayload) {
    const runners = wireBlockAwareScrollSync(
      codePane,
      docScrollEl,
      () => scrollLinksRef.current,
      () => sourceLineIdPrefixForShell(shell),
      () => sourcePaneModeForShell(shell) === "rendered-markdown",
      blockAwareOpts,
    );
    const angleSel = document.getElementById("angle-select") as HTMLSelectElement | null;
    if (angleSel && docBody) {
      angleSel.addEventListener("change", () => {
        const a = multiPayload.angles.find((x) => x.id === angleSel.value);
        if (!a) return;
        applySelectedMultiAngle({
          angle: a,
          docBody,
          mutable,
          rebuildSearcher,
          scrollLinksRef,
          shell,
          searchInput,
          searchResults,
          requestBlockRayRedraw,
        });
      });
    }
    return runners;
  }
  if (scrollLinksRef.current.length > 0) {
    return wireBlockAwareScrollSync(
      codePane,
      docScrollEl,
      () => scrollLinksRef.current,
      () => sourceLineIdPrefixForShell(shell),
      () => sourcePaneModeForShell(shell) === "rendered-markdown",
      blockAwareOpts,
    );
  }
  if (blockAwareOpts.allowProportionalMirror) {
    return wireProportionalScrollSync(codePane, docScrollEl);
  }
  return wireBlockAwareScrollSync(
    codePane,
    docScrollEl,
    () => [],
    () => sourceLineIdPrefixForShell(shell),
    () => sourcePaneModeForShell(shell) === "rendered-markdown",
    blockAwareOpts,
  );
}

function wireDualPaneMultiAngleAndScroll(
  args: WireDualPaneMultiAngleScrollArgs,
): DualPaneScrollSyncRunners {
  const strategy = parseDualPaneScrollSyncStrategy(
    args.shell.getAttribute("data-scroll-sync-strategy"),
  );
  const blockAwareOpts =
    strategy === "block-snap-only"
      ? { allowProportionalMirror: false }
      : { allowProportionalMirror: true };
  return wireDualPaneScrollIndexedOrProportional(args, blockAwareOpts);
}

function wireDualPaneParallelDocsLocationHash(
  docScrollEl: HTMLElement,
  mdLineCount: () => number,
): void {
  function parallelDocsMdLineFromLocationHash(rawHash: string): number | null {
    const hash = rawHash.replace(/^#/, "").trim();
    if (hash.length === 0) return null;
    const tokens = hash
      .split(/--|&/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    for (const token of tokens) {
      const m = /^parallel-docs-md-line-(\d+)$/.exec(token);
      if (!m?.[1]) continue;
      const line0 = Number.parseInt(m[1], 10);
      if (Number.isFinite(line0)) return line0;
    }
    return null;
  }

  function applyParallelDocsLocationHash(): void {
    const line0 = parallelDocsMdLineFromLocationHash(globalThis.location.hash);
    if (line0 === null) return;
    scrollDocToMarkdownLine0(docScrollEl, line0, mdLineCount());
  }
  globalThis.addEventListener("hashchange", applyParallelDocsLocationHash);
  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(applyParallelDocsLocationHash);
  });
}

type DualPaneSearcherBundle = {
  rawCode: string;
  rawMd: string;
  scrollLinksRef: { current: BlockScrollLink[] };
  scope: SearchScope;
  filePathLabel: string;
  parallelDocsPathLabel: string;
  pathInit: ReturnType<typeof initialParallelDocsScopePathState>;
  indexState: DualPaneSearchIndexState;
  mutable: MutableSearchFields;
  rebuildSearcher: () => void;
};

function initializeSourceMarkdownPane(shell: HTMLElement): void {
  if (sourcePaneModeForShell(shell) !== "rendered-markdown") return;
  const codePane = document.getElementById("code-pane");
  if (!(codePane instanceof HTMLElement)) return;
  for (const sourceMdBody of codePane.querySelectorAll<HTMLElement>(
    '[data-source-markdown-body="true"]',
  )) {
    void runMermaidOnFreshDocNodes(sourceMdBody);
    rewriteHubRelativeBrowseAnchorsIn(sourceMdBody);
  }
}

let sourceMarkdownControlsAbort: AbortController | null = null;

function wireSourceMarkdownControls(
  shell: HTMLElement,
  codePane: HTMLElement,
  onAfterFlip?: () => void,
): void {
  const sourceMdFlip = document.getElementById("source-markdown-pane-flip");
  const sourceMdFlipScroll = document.getElementById("source-markdown-pane-flip-scroll");
  if (!(sourceMdFlip instanceof HTMLButtonElement)) return;
  sourceMarkdownControlsAbort?.abort();
  sourceMarkdownControlsAbort = new AbortController();
  wireSourceMarkdownPaneFlip(
    shell,
    codePane,
    sourceMdFlip,
    sourceMdFlipScroll instanceof HTMLButtonElement ? sourceMdFlipScroll : null,
    sourceMarkdownControlsAbort.signal,
    onAfterFlip,
  );
  initializeSourceMarkdownPane(shell);
}

function buildDualPaneSearcherBundle(
  shell: HTMLElement,
  codePane: HTMLElement,
): DualPaneSearcherBundle {
  const { rawCodeB64, rawMdB64 } = readEmbeddedRawB64Strings(shell, codePane);
  const rawCode = decodeBase64Utf8(rawCodeB64);
  const rawMd = decodeBase64Utf8(rawMdB64);
  const scrollLinks = parseScrollBlockLinksFromShell(
    shell.getAttribute("data-scroll-block-links-b64") || "",
  );
  const scrollLinksRef = { current: scrollLinks };
  const { scope, filePathLabel, parallelDocsPathLabel } = readSearchScopeFromShell(shell);

  const pathInit = initialParallelDocsScopePathState(
    shell,
    scope,
    filePathLabel,
    parallelDocsPathLabel,
  );
  const effectiveParallelDocsPathLabel = effectiveParallelDocsPathLabelFromDocumentedPairs(
    scope,
    filePathLabel,
    parallelDocsPathLabel,
    pathInit.documentedPairs,
  );
  if (effectiveParallelDocsPathLabel.trim().length > 0) {
    shell.setAttribute("data-search-parallel-docs-path", effectiveParallelDocsPathLabel);
    const docPathEl = document.getElementById("nav-rail-doc-path");
    if (docPathEl) {
      docPathEl.textContent = effectiveParallelDocsPathLabel;
      docPathEl.setAttribute("title", effectiveParallelDocsPathLabel);
    }
  }
  const indexState: DualPaneSearchIndexState = {
    hubNavRows: [],
    documentedPairs: pathInit.documentedPairs,
    pathRowsForOrdering: pathInit.pathRowsForOrdering,
  };

  const mutable: MutableSearchFields = {
    rawMd,
    mdLines: rawMd.split("\n"),
    parallelDocsPathLabel: effectiveParallelDocsPathLabel,
    searcher: indexSearchLineRows([]),
    pathBlobWide: pathInit.pathBlobWide,
    pathRowsForOrdering: indexState.pathRowsForOrdering,
    documentedPairs: indexState.documentedPairs,
  };

  function rebuildSearcher(): void {
    mutable.searcher = indexSearchLineRows(
      hubSearcherRowsForDualPane({
        scope,
        rawCode,
        filePathLabel,
        hubNavRows: indexState.hubNavRows,
        pathRowsForOrdering: indexState.pathRowsForOrdering,
        rawMd: mutable.rawMd,
        parallelDocsPathLabel: mutable.parallelDocsPathLabel,
      }),
    );
  }
  rebuildSearcher();

  return {
    rawCode,
    rawMd,
    scrollLinksRef,
    scope,
    filePathLabel,
    parallelDocsPathLabel: effectiveParallelDocsPathLabel,
    pathInit,
    indexState,
    mutable,
    rebuildSearcher,
  };
}

function wireDualPaneCodeBrowser(shell: HTMLElement, codePane: HTMLElement): void {
  const coreDom = readDualPaneCoreDom();
  if (!coreDom) {
    return;
  }
  const { docBody, docScrollEl, gutter, wrapCb } = coreDom;
  const searchDom = readDualPaneSearchDom();

  const bundle = buildDualPaneSearcherBundle(shell, codePane);

  rewriteHubRelativeBrowseAnchorsIn(document);

  if (searchDom) {
    const { searchInput, searchClear, searchResults } = searchDom;
    wireSearchUi({
      scope: bundle.scope,
      filePathLabel: bundle.filePathLabel,
      mutable: bundle.mutable,
      rawCode: bundle.rawCode,
      searchInput,
      searchClear,
      searchResults,
      docScrollEl,
    });

    wireDualPaneNavSearchFetch(
      shell,
      bundle.pathInit.documentedPairs,
      bundle.indexState,
      bundle.mutable,
      bundle.rebuildSearcher,
      searchInput,
    );
  }

  const pct0 = parseFloat(readWebStorageItem(localStorage, STORAGE_SPLIT_PCT) || "46");
  const pct = clamp(Number.isFinite(pct0) ? pct0 : 46, 15, 85);
  codePane.style.flex = `0 0 ${pct}%`;
  shell.style.setProperty("--split-pct", `${String(pct)}%`);

  const docPaneEl = document.getElementById("doc-pane");
  const docPaneForWrap = docPaneEl instanceof HTMLElement ? docPaneEl : null;
  const sourceMdBodyForWrap = document.getElementById("code-pane-markdown-body");

  const blockRayRedraw: { request?: () => void } = {};
  wireWrapToggle(
    STORAGE_WRAP_LINES,
    codePane,
    wrapCb,
    () => {
      blockRayRedraw.request?.();
    },
    docPaneForWrap,
    docBody,
    sourceMdBodyForWrap instanceof HTMLElement ? sourceMdBodyForWrap : null,
  );
  wireSplitter(STORAGE_SPLIT_PCT, shell, codePane, gutter, pct);

  const multiScript = document.getElementById("parallel-docs-multi-angle-b64");
  const multiPayload = parseMultiAnglePayload(multiScript);
  const shouldWireBlockRays = multiPayload !== null || bundle.scrollLinksRef.current.length > 0;
  const requestBlockRayRedraw = shouldWireBlockRays
    ? wireBlockRayConnectors({
        gutter,
        codePane,
        docScrollEl,
        getLinks: () => bundle.scrollLinksRef.current,
        probeTopSourceLine1Based: () =>
          probeCodeLine1FromViewport(codePane, sourceLineIdPrefixForShell(shell)),
        sourceLineIdPrefix: () => sourceLineIdPrefixForShell(shell),
      })
    : undefined;
  blockRayRedraw.request = requestBlockRayRedraw;
  const scrollRunners = wireDualPaneMultiAngleAndScroll({
    codePane,
    docScrollEl,
    docBody,
    shell,
    scrollLinksRef: bundle.scrollLinksRef,
    multiPayload,
    mutable: bundle.mutable,
    rebuildSearcher: bundle.rebuildSearcher,
    searchInput: searchDom?.searchInput,
    searchResults: searchDom?.searchResults,
    requestBlockRayRedraw,
  });

  const flipBtn = document.getElementById("mobile-pane-flip");
  const flipScrollBtn = document.getElementById("mobile-pane-flip-scroll");
  if (flipBtn instanceof HTMLButtonElement) {
    wireDualMobilePaneFlip(
      shell,
      flipBtn,
      scrollRunners,
      flipScrollBtn instanceof HTMLButtonElement ? flipScrollBtn : null,
    );
  }
  wireSourceMarkdownControls(shell, codePane, () => {
    requestBlockRayRedraw?.();
  });
  wireWideModeIntroTour(shell, isNarrowViewport);

  wireDualPaneParallelDocsLocationHash(docScrollEl, () => bundle.mutable.mdLines.length);
}

function parallelDocsThemeModeLabel(mode: ParallelDocsColorThemeMode): string {
  if (mode === "light") return "Light";
  if (mode === "dark") return "Dark";
  return "System";
}

function setParallelDocsThemeTriggerHints(
  trigger: HTMLButtonElement,
  mode: ParallelDocsColorThemeMode,
): void {
  const label = parallelDocsThemeModeLabel(mode);
  trigger.setAttribute(
    "aria-label",
    `Color theme: ${label}. Left-click opens the menu. Right-click cycles System, Light, and Dark.`,
  );
  trigger.title = `Appearance: ${label} — left-click menu, right-click cycle`;
}

function wireColorThemeToolbar(): void {
  const wrapEl = document.querySelector(".toolbar-theme");
  const triggerEl = document.getElementById("parallel-docs-theme-trigger");
  const menuEl = document.getElementById("parallel-docs-theme-menu");
  if (!wrapEl || !(triggerEl instanceof HTMLButtonElement) || !(menuEl instanceof HTMLElement))
    return;

  const themeToolbarWrap: Element = wrapEl;
  const themeButton: HTMLButtonElement = triggerEl;
  const themeMenu: HTMLElement = menuEl;

  let currentMode: ParallelDocsColorThemeMode = parseParallelDocsColorThemeMode(
    readWebStorageItem(localStorage, PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY),
  );
  applyParallelDocsColorTheme(currentMode);

  let menuOpen = false;

  function syncUi(): void {
    themeButton.dataset.parallelDocsTriggerMode = currentMode;
    themeButton.setAttribute("aria-expanded", menuOpen ? "true" : "false");
    setParallelDocsThemeTriggerHints(themeButton, currentMode);
    for (const el of themeMenu.querySelectorAll<HTMLButtonElement>(
      "[data-parallel-docs-theme-value]",
    )) {
      const v = parseParallelDocsColorThemeMode(el.dataset.parallelDocsThemeValue ?? "");
      el.setAttribute("aria-checked", v === currentMode ? "true" : "false");
    }
  }

  function openMenu(): void {
    menuOpen = true;
    themeMenu.removeAttribute("hidden");
    syncUi();
    const checked = themeMenu.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    (checked ?? themeMenu.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }

  function closeMenu(): void {
    menuOpen = false;
    themeMenu.setAttribute("hidden", "");
    syncUi();
  }

  function persistAndApply(mode: ParallelDocsColorThemeMode): void {
    currentMode = mode;
    writeWebStorageItem(localStorage, PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY, mode);
    applyParallelDocsColorTheme(mode);
    syncUi();
  }

  themeButton.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  themeButton.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    if (menuOpen) closeMenu();
    persistAndApply(nextParallelDocsColorThemeMode(currentMode));
  });

  for (const item of themeMenu.querySelectorAll<HTMLButtonElement>(
    "[data-parallel-docs-theme-value]",
  )) {
    item.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const mode = parseParallelDocsColorThemeMode(item.dataset.parallelDocsThemeValue ?? "");
      persistAndApply(mode);
      closeMenu();
      themeButton.focus();
    });
  }

  function onDocumentPointerDown(ev: Event): void {
    if (!menuOpen) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (themeToolbarWrap.contains(t)) return;
    closeMenu();
  }

  function onDocumentKeydown(ev: KeyboardEvent): void {
    if (!menuOpen || ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    closeMenu();
    themeButton.focus();
  }

  document.addEventListener("mousedown", onDocumentPointerDown, true);
  document.addEventListener("touchstart", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown, true);

  syncUi();
}

function safePermalinkHref(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  if (/^(javascript|data):/i.test(t)) return null;
  try {
    return new URL(t, globalThis.location.href).toString();
  } catch {
    return null;
  }
}

function makeAbsoluteUrlAgainst(raw: string, baseHref: string): string {
  return new URL(raw, baseHref).toString();
}

function absolutizeNavJsonUrls(shell: HTMLElement, beforeHref: string): void {
  const navSearchRaw = shell.getAttribute("data-nav-search-json-url")?.trim() ?? "";
  if (navSearchRaw.length > 0) {
    shell.setAttribute(
      "data-nav-search-json-url",
      makeAbsoluteUrlAgainst(navSearchRaw, beforeHref),
    );
  }
  const navTree = document.getElementById("documented-files-hub");
  if (navTree instanceof HTMLElement) {
    const navRaw = navTree.getAttribute("data-nav-json-url")?.trim() ?? "";
    if (navRaw.length > 0) {
      navTree.setAttribute("data-nav-json-url", makeAbsoluteUrlAgainst(navRaw, beforeHref));
    }
  }
}

function normalizePairBrowseHrefForCurrentPath(shell: HTMLElement, pathname: string): void {
  const pairBrowseRaw = shell.getAttribute("data-parallel-docs-pair-browse-href")?.trim() ?? "";
  if (pairBrowseRaw.length > 0 && isHubRelativeStaticBrowseHref(pairBrowseRaw)) {
    shell.setAttribute(
      "data-parallel-docs-pair-browse-href",
      resolveStaticBrowseHref(pairBrowseRaw, pathname, globalThis.location.origin),
    );
  }
}

function activeParallelDocsHashTokenFromViewport(): string | null {
  const docPane = document.getElementById("doc-pane");
  if (!(docPane instanceof HTMLElement)) return null;
  const docBody = document.getElementById("doc-pane-body");
  const docScrollEl = docBody instanceof HTMLElement ? docBody : docPane;
  const anchors = docScrollEl.querySelectorAll<HTMLElement>(".parallel-docs-block-anchor");
  if (anchors.length === 0) return null;
  const mdLine0 = probeParallelDocsLine0FromDoc(docScrollEl);
  if (mdLine0 === null || !Number.isFinite(mdLine0) || mdLine0 < 0) return null;
  return `parallel-docs-md-line-${String(mdLine0)}`;
}

/**
 * Resolves hub-relative `data-nav-*` and pair-browse attributes against the current document URL so
 * `fetch()` and toolbar targets work from deep `/browse/…/index.html` pages (static HTML stays portable).
 */
function resolveEmbeddedStaticNavUrlsForCurrentPage(shell: HTMLElement): void {
  if ((shell.getAttribute("data-layout") ?? "dual") !== "dual") return;
  const pathname = globalThis.location.pathname;
  const beforeHref = globalThis.location.href;
  absolutizeNavJsonUrls(shell, beforeHref);
  normalizePairBrowseHrefForCurrentPath(shell, pathname);
}

/**
 * Absolute base URL for the pair browse / permalink target from `#shell` `data-parallel-docs-pair-browse-href`
 * (hub-relative `./browse/…` resolved via {@link resolveStaticBrowseHref}; same contract as static build).
 */
function pairBrowsePermalinkBaseHrefFromShell(shell: HTMLElement): string {
  const raw = shell.getAttribute("data-parallel-docs-pair-browse-href") ?? "";
  const t = raw.trim();
  const canonical =
    isHubRelativeStaticBrowseHref(t) && t.length > 0
      ? resolveStaticBrowseHref(t, globalThis.location.pathname, globalThis.location.origin)
      : safePermalinkHref(t);
  return canonical ?? globalThis.location.href;
}

function permalinkHashSuffixFromUi(): string {
  const tokens: string[] = [];
  const pushUnique = (token: string): void => {
    const t = token.trim();
    if (t.length === 0) return;
    if (!tokens.includes(t)) tokens.push(t);
  };
  const angleSel = document.getElementById("angle-select");
  if (angleSel instanceof HTMLSelectElement) {
    const id = angleSel.value.trim();
    if (id.length > 0) {
      pushUnique(`angle-${encodeURIComponent(id)}`);
    }
  }
  const shell = document.getElementById("shell");
  if (shell instanceof HTMLElement && shell.getAttribute("data-mobile-single-pane") === "true") {
    const pane = normalizedDualMobilePane(shell.getAttribute("data-dual-mobile-pane"));
    pushUnique(mobilePaneHashToken(pane));
  }
  const activeAnchor = activeParallelDocsHashTokenFromViewport();
  if (activeAnchor) pushUnique(activeAnchor);
  return tokens.length > 0 ? `#${tokens.join("&")}` : "";
}

function sharePermalinkFromShell(shell: HTMLElement): string {
  const u = new URL(pairBrowsePermalinkBaseHrefFromShell(shell), globalThis.location.href);
  const hash = permalinkHashSuffixFromUi();
  u.hash = hash.length > 0 ? hash.slice(1) : "";
  return u.toString();
}

/**
 * Static multi-angle: each angle has its own `/browse/…/<angle>/index.html`. After `#angle-select`
 * changes, load that canonical page without a `#angle-…` fragment (path is the permalink).
 */
function assignLocationToCanonicalBrowsePermalinkIfNeeded(shell: HTMLElement): void {
  let target: URL;
  try {
    target = new URL(pairBrowsePermalinkBaseHrefFromShell(shell), globalThis.location.href);
  } catch {
    return;
  }
  if (target.origin !== globalThis.location.origin) return;
  target.hash = "";
  const here = new URL(globalThis.location.href);
  if (here.pathname === target.pathname && here.search === target.search) return;
  globalThis.location.assign(target.toString());
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }
}

function wireSharePermalinkButton(): void {
  const shell = document.getElementById("shell");
  const btn = document.getElementById("parallel-docs-share-link");
  if (!(shell instanceof HTMLElement) || !(btn instanceof HTMLButtonElement)) return;
  const baseLabel = "Copy shareable permalink";
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener("click", () => {
    void (async () => {
      const shareUrl = sharePermalinkFromShell(shell);
      const copied = await writeTextToClipboard(shareUrl);
      if (!copied) return;
      btn.dataset.copied = "true";
      btn.setAttribute("aria-label", "Permalink copied");
      btn.title = "Permalink copied";
      if (copiedTimer !== undefined) globalThis.clearTimeout(copiedTimer);
      copiedTimer = globalThis.setTimeout(() => {
        delete btn.dataset.copied;
        btn.setAttribute("aria-label", baseLabel);
        btn.title = baseLabel;
      }, 1200);
    })();
  });
}

function main(): void {
  announceScrollSyncTraceOnBoot();
  wireSharePermalinkButton();
  wireColorThemeToolbar();
  wireDocumentedFilesTree();

  const shell = document.getElementById("shell");
  const codePane = document.getElementById("code-pane");
  if (!shell || !codePane) {
    return;
  }
  applyPageBreakFeatureToggle(shell);
  wireResponsivePageBreakHeight(shell);
  wireWideModeIntroTrigger(shell);

  const layout = shell.getAttribute("data-layout") || "dual";
  if (layout === "stretch") {
    wireStretchLayoutChrome(shell, codePane);
    wireStretchSearchUi(shell, codePane);
    wireSourceMarkdownControls(shell, codePane, () => {
      globalThis.dispatchEvent(new Event("resize"));
    });
    const flipBtn = document.getElementById("mobile-pane-flip");
    const flipScrollBtn = document.getElementById("mobile-pane-flip-scroll");
    if (flipBtn instanceof HTMLButtonElement) {
      wireStretchMobilePaneFlip(
        shell,
        codePane,
        flipBtn,
        flipScrollBtn instanceof HTMLButtonElement ? flipScrollBtn : null,
        () => {
          globalThis.dispatchEvent(new Event("resize"));
        },
      );
    }
    return;
  }

  wireDualPaneCodeBrowser(shell, codePane);
  resolveEmbeddedStaticNavUrlsForCurrentPage(shell);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

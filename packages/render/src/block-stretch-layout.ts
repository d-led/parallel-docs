import {
  type BlockScrollLink,
  type SideTrackIndex,
  DEFAULT_STRETCH_BUFFER_SYNC,
  MARKER_ID_BODY,
  buildBlockScrollLinks,
} from "@sidetrack/core";

import { escapeHtml } from "./html-utils.js";
import { renderHighlightedCodeLineRows } from "./highlighted-code-lines.js";
import { injectSourceMarkdownAnchors } from "./inject-md-line-anchors.js";
import { type SideTrackOutputUrlOptions, renderMarkdownToHtml } from "./markdown-pipeline.js";

const BLOCK_MARKER_LINE = new RegExp(
  `^<!--\\s*sidetrack:block\\s+id=(${MARKER_ID_BODY})\\s*-->$`,
  "i",
);

/**
 * Stretch column slack strategy (see `CodeBrowserPageOptions.stretchBufferSync`).
 * - `flow-synchronizer` (default): row sync ids + measure wrappers + client `BufferingFlowSynchronizer` padding.
 * - `table`: `<table>` row height only (legacy; no client buffer pass).
 */
export type StretchBufferSyncStrategy = "table" | "flow-synchronizer";

export type BlockStretchTableOptions = {
  code: string;
  language: string;
  sidetrackMarkdown: string;
  index: SideTrackIndex;
  sourceRelative: string;
  sidetrackPathRel: string;
  sidetrackOutputUrls?: SideTrackOutputUrlOptions;
  sourceMarkdownOutputUrls?: SideTrackOutputUrlOptions;
  /** Omitted uses `DEFAULT_STRETCH_BUFFER_SYNC` from `@sidetrack/core` (`flow-synchronizer`). */
  stretchBufferSync?: StretchBufferSyncStrategy;
};

type StretchRenderContext = {
  lines: string[];
  language: string;
  mode: StretchBufferSyncStrategy;
  gapSyncSeq: { n: number } | null;
  sourceMarkdownSlicesEnabled: boolean;
  sourceMarkdownOutputUrls?: SideTrackOutputUrlOptions;
  renderedById: Map<string, string>;
};

function sourceMarkdownEnabled(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === "md" || normalized === "markdown" || normalized === "mdx";
}

async function renderSourceMarkdownSlice(
  lines: string[],
  startLine0: number,
  endLine0: number,
  outputUrls: SideTrackOutputUrlOptions | undefined,
): Promise<string> {
  const markdown = lines.slice(startLine0, endLine0 + 1).join("\n");
  const anchored = injectSourceMarkdownAnchors(markdown, startLine0);
  const rendered = await renderMarkdownToHtml(anchored.trim().length > 0 ? anchored : " ", {
    sidetrackOutputUrls: outputUrls,
  });
  return `<div class="source-pane source-pane--rendered-md stretch-source-markdown-body" data-source-markdown-body="true">${rendered}</div>`;
}

function wrapStretchSourceCell(
  codeHtml: string,
  renderedMarkdownHtml: string | undefined,
  mode: StretchBufferSyncStrategy,
): string {
  const rendered = renderedMarkdownHtml ?? "";
  const inner = `<div class="source-pane source-pane--code">${codeHtml}</div>${rendered}`;
  return mode === "flow-synchronizer" ? `<div class="stretch-cell-measure">${inner}</div>` : inner;
}

export function splitSideTrackMarkdownSegments(markdown: string): {
  preamble: string;
  segments: { id: string; body: string }[];
} {
  const lines = markdown.split("\n");
  const preambleLines: string[] = [];
  const segments: { id: string; body: string }[] = [];
  let seenMarker = false;
  let currentId: string | null = null;
  const currentBody: string[] = [];

  function flush(): void {
    if (currentId !== null) {
      segments.push({ id: currentId, body: currentBody.join("\n").trimEnd() });
      currentBody.length = 0;
    }
  }

  for (const line of lines) {
    const m = BLOCK_MARKER_LINE.exec(line);
    if (m && m[1] !== undefined) {
      seenMarker = true;
      flush();
      currentId = m[1];
    } else if (!seenMarker) {
      preambleLines.push(line);
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return { preamble: preambleLines.join("\n").trimEnd(), segments };
}

/** Renders a contiguous 0-based inclusive range of source lines into one stacked column. */
async function renderCodeLineStack(
  lines: string[],
  startLine0: number,
  endLine0: number,
  language: string,
): Promise<string> {
  const slice = lines.slice(startLine0, endLine0 + 1).join("\n");
  const inner = await renderHighlightedCodeLineRows(slice, language, {
    lineIndexOffset: startLine0,
  });
  return `<div class="stretch-code-stack">${inner}</div>`;
}

async function renderSideTrackSegmentBodies(
  segments: { id: string; body: string }[],
  outputUrls: SideTrackOutputUrlOptions | undefined,
): Promise<Map<string, string>> {
  const mdOpts = { sidetrackOutputUrls: outputUrls };
  const renderedById = new Map<string, string>();
  for (const s of segments) {
    renderedById.set(
      s.id,
      await renderMarkdownToHtml(s.body.trim().length > 0 ? s.body : " ", mdOpts),
    );
  }
  return renderedById;
}

function buildLineToBlockLookup(links: BlockScrollLink[]): Map<number, BlockScrollLink> {
  const lineToBlock = new Map<number, BlockScrollLink>();
  for (const b of links) {
    const { lo, hiExclusive } = b.markerViewportHalfOpen1Based;
    for (let line1 = lo; line1 < hiExclusive; line1++) {
      lineToBlock.set(line1, b);
    }
  }
  return lineToBlock;
}

async function maybeRenderSourceMarkdownSlice(
  ctx: StretchRenderContext,
  startLine0: number,
  endLine0: number,
): Promise<string | undefined> {
  if (!ctx.sourceMarkdownSlicesEnabled) return undefined;
  return renderSourceMarkdownSlice(ctx.lines, startLine0, endLine0, ctx.sourceMarkdownOutputUrls);
}

function nextGapSyncId(gapSyncSeq: { n: number } | null): string | null {
  if (gapSyncSeq === null) return null;
  const gapId = `__gap__${gapSyncSeq.n}`;
  gapSyncSeq.n += 1;
  return gapId;
}

async function buildStretchGapRowHtml(
  ctx: StretchRenderContext,
  lineIndex0: number,
): Promise<string> {
  const codeLineHtml = await renderHighlightedCodeLineRows(
    ctx.lines[lineIndex0] ?? "",
    ctx.language,
    {
      lineIndexOffset: lineIndex0,
      omitLineStackWrapper: true,
    },
  );
  const renderedSourceMarkdownHtml = await maybeRenderSourceMarkdownSlice(
    ctx,
    lineIndex0,
    lineIndex0,
  );
  const sourceCellInner = wrapStretchSourceCell(codeLineHtml, renderedSourceMarkdownHtml, ctx.mode);
  const gapId = ctx.mode === "flow-synchronizer" ? nextGapSyncId(ctx.gapSyncSeq) : null;
  if (gapId !== null) {
    return (
      `<tr class="stretch-row stretch-row--gap" data-sidetrack-stretch-sync-id="${escapeHtml(gapId)}">` +
      `<td class="stretch-code">${sourceCellInner}</td>` +
      `<td class="stretch-doc stretch-doc--gap"><div class="stretch-cell-measure"></div></td></tr>`
    );
  }
  return (
    `<tr class="stretch-row stretch-row--gap"><td class="stretch-code">${sourceCellInner}</td>` +
    `<td class="stretch-doc stretch-doc--gap"></td></tr>`
  );
}

async function buildStretchBlockRowHtml(
  ctx: StretchRenderContext,
  block: BlockScrollLink,
): Promise<string> {
  const start0 = block.sourceStart - 1;
  const end0 = block.sourceEnd - 1;
  const stackHtml = await renderCodeLineStack(ctx.lines, start0, end0, ctx.language);
  const renderedSourceMarkdownHtml = await maybeRenderSourceMarkdownSlice(ctx, start0, end0);
  const sourceCellInner = wrapStretchSourceCell(stackHtml, renderedSourceMarkdownHtml, ctx.mode);
  const docInner =
    ctx.renderedById.get(block.id) ??
    `<p class="stretch-doc-missing"><em>No sidetrack segment for block <code>${escapeHtml(block.id)}</code>.</em></p>`;
  if (ctx.mode === "flow-synchronizer") {
    return (
      `<tr class="stretch-row stretch-row--block" data-sidetrack-stretch-sync-id="${escapeHtml(block.id)}">` +
      `<td class="stretch-code">${sourceCellInner}</td>` +
      `<td class="stretch-doc"><div class="stretch-cell-measure"><div class="stretch-doc-inner">${docInner}</div></div></td></tr>`
    );
  }
  return (
    `<tr class="stretch-row stretch-row--block"><td class="stretch-code">${sourceCellInner}</td>` +
    `<td class="stretch-doc"><div class="stretch-doc-inner">${docInner}</div></td></tr>`
  );
}

async function buildStretchRows(
  ctx: StretchRenderContext,
  lineToBlock: Map<number, BlockScrollLink>,
): Promise<string[]> {
  const rows: string[] = [];
  let lineIndex0 = 0;
  while (lineIndex0 < ctx.lines.length) {
    const block = lineToBlock.get(lineIndex0 + 1);
    if (block === undefined || lineIndex0 < block.sourceStart - 1) {
      rows.push(await buildStretchGapRowHtml(ctx, lineIndex0));
      lineIndex0 += 1;
      continue;
    }
    rows.push(await buildStretchBlockRowHtml(ctx, block));
    lineIndex0 = block.sourceEnd;
  }
  return rows;
}

/**
 * When index blocks + markdown markers align, builds a two-column **`<table>`**: each logical
 * pair (gap line, or one indexed block) is one `<tr>`. Row height is one number — the taller cell
 * wins; the shorter cell shows top-aligned content with empty space below (browser table layout).
 * “Buffer” rows (`stretch-row--gap`) absorb one-sided slack the same way: one code line + a doc
 * em-dash still share one row height. A single outer scroll (`shell--stretch-rows`) keeps both
 * columns in lockstep — no dual-pane scroll sync. The client may add per-cell bottom padding via
 * `BufferingFlowSynchronizer` so row heights stay matched after async reflow (same idea as `BBBB`
 * fills in `buffering-flow-synchronizer.approvals/`). Default is `flow-synchronizer`; pass
 * `stretchBufferSync: "table"` for legacy table-only markup.
 */
export async function tryBuildBlockStretchTableHtml(
  opts: BlockStretchTableOptions,
): Promise<{ preambleHtml: string; tableInnerHtml: string } | null> {
  const mode: StretchBufferSyncStrategy = opts.stretchBufferSync ?? DEFAULT_STRETCH_BUFFER_SYNC;
  const links = buildBlockScrollLinks(
    opts.index,
    opts.sourceRelative,
    opts.sidetrackPathRel,
    opts.sidetrackMarkdown,
    opts.code,
  );

  const { preamble, segments } = splitSideTrackMarkdownSegments(opts.sidetrackMarkdown);
  const lines = opts.code.split("\n");
  const lnMinCh = Math.max(2, String(Math.max(1, lines.length)).length);
  const mdOpts = { sidetrackOutputUrls: opts.sidetrackOutputUrls };
  const renderedById = await renderSideTrackSegmentBodies(segments, opts.sidetrackOutputUrls);
  const ctx: StretchRenderContext = {
    lines,
    language: opts.language,
    mode,
    gapSyncSeq: mode === "flow-synchronizer" ? { n: 0 } : null,
    sourceMarkdownSlicesEnabled: sourceMarkdownEnabled(opts.language),
    sourceMarkdownOutputUrls: opts.sourceMarkdownOutputUrls,
    renderedById,
  };
  const rows = await buildStretchRows(ctx, buildLineToBlockLookup(links));

  const preambleHtml =
    preamble.trim().length > 0
      ? `<section class="stretch-preamble" aria-label="Introduction">${await renderMarkdownToHtml(preamble, mdOpts)}</section>`
      : "";

  const tableInnerHtml =
    `<div class="stretch-grid" id="stretch-grid">` +
    `${preambleHtml}` +
    `<table class="block-stretch pane--code" id="code-pane" role="presentation" style="--code-ln-min-ch:${String(
      lnMinCh,
    )}">` +
    `<colgroup><col class="stretch-col-code" /><col class="stretch-col-doc" /></colgroup>` +
    `<tbody>\n${rows.join("\n")}\n</tbody>` +
    `</table>` +
    `<div class="stretch-gutter" id="stretch-gutter" role="separator" aria-orientation="vertical" aria-label="Resize columns"></div>` +
    `</div>`;

  return { preambleHtml: "", tableInnerHtml };
}

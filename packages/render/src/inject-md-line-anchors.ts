import { MARKER_ID_BODY, type BlockScrollLink } from "@sidetrack/core";

import { escapeHtml } from "./html-utils.js";

/** Single capture: marker id (avoid a wrapping group around the whole comment — that shifted indices). */
const BLOCK_MARKER_HTML_LINE = new RegExp(
  `^<!--\\s*sidetrack:block\\s+id=(${MARKER_ID_BODY})\\s*-->$`,
  "i",
);
const PAGE_BREAK_MARKER_HTML_LINE = /^<!--\s*sidetrack:page-break\s*-->$/i;

function trimEndSpacesTabs(s: string): string {
  let end = s.length;
  while (end > 0) {
    const c = s[end - 1];
    if (c !== " " && c !== "\t") break;
    end--;
  }
  return s.slice(0, end);
}

function isSetextUnderlineLine(line: string): boolean {
  const t = trimEndSpacesTabs(line);
  return /^\s{0,3}=+\s*$/.test(t) || /^\s{0,3}-+\s*$/.test(t);
}

function isThematicBreakLine(line: string): boolean {
  const t = trimEndSpacesTabs(line);
  return (
    /^\s{0,3}(?:\*[ \t]*){3,}\s*$/.test(t) ||
    /^\s{0,3}(?:-[ \t]*){3,}\s*$/.test(t) ||
    /^\s{0,3}(?:_[ \t]*){3,}\s*$/.test(t)
  );
}

type FenceState = { ch: "`" | "~"; len: number };

function parseFenceDelimiter(line: string): { ch: "`" | "~"; runLen: number; rest: string } | null {
  const t = trimEndSpacesTabs(line);
  const m = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(t);
  if (!m) return null;
  const run = m[2];
  const head = run[0];
  if (head !== "`" && head !== "~") return null;
  const ch: "`" | "~" = head === "`" ? "`" : "~";
  return { ch, runLen: run.length, rest: m[3] ?? "" };
}

function isClosingFenceLine(
  info: NonNullable<ReturnType<typeof parseFenceDelimiter>>,
  open: FenceState,
): boolean {
  if (info.ch !== open.ch || info.runLen < open.len) return false;
  return info.rest.trim() === "";
}

/**
 * GFM delimiter row: cells between pipes contain only colons, hyphens, and spaces; each cell has
 * at least three hyphens (same rule remark-gfm uses). Used so we do not append raw HTML to table
 * lines — trailing `<span>` breaks GFM table recognition in the Markdown parser.
 */
function isGfmTableDelimiterRow(line: string): boolean {
  const t = trimEndSpacesTabs(line);
  if (!t.includes("|")) return false;
  const cells = t
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (cells.length === 0) return false;
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return false;
  }
  return true;
}

/**
 * 0-based line indices that must not receive a trailing line-anchor span: they belong to a GFM
 * table (header + delimiter + following rows until a blank line). Scans full `lines` so indices
 * align with {@link injectSideTrackDocAnchors}; lines inside fenced code are harmless to mark
 * because that pass never appends anchors there anyway.
 */
function gfmTableLineIndicesWithoutAnchors(lines: string[]): Set<number> {
  const skip = new Set<number>();
  const n = lines.length;
  for (let i = 0; i < n - 1; i++) {
    const header = lines[i] ?? "";
    const delim = lines[i + 1] ?? "";
    if (header === "") continue;
    if (!trimEndSpacesTabs(header).includes("|")) continue;
    if (isSetextUnderlineLine(header) || isThematicBreakLine(header)) continue;
    if (!isGfmTableDelimiterRow(delim)) continue;
    skip.add(i);
    skip.add(i + 1);
    let j = i + 2;
    while (j < n) {
      const row = lines[j] ?? "";
      if (row === "") break;
      if (isSetextUnderlineLine(row) || isThematicBreakLine(row)) break;
      if (isGfmTableDelimiterRow(row)) break;
      skip.add(j);
      j++;
    }
  }
  return skip;
}

function lineAnchorHtml(mdLine0: number): string {
  const mdLine = String(mdLine0);
  return `<span class="sidetrack-line-anchor" data-sidetrack-md-line="${mdLine}" id="sidetrack-md-line-${mdLine}" aria-hidden="true"></span>`;
}

function sourceLineAnchorHtml(line0: number): string {
  const s = String(line0);
  return `<span class="sidetrack-line-anchor sidetrack-line-anchor--source" data-source-md-line="${s}" id="code-md-line-${s}" aria-hidden="true"></span>`;
}

function appendMdLineAnchorWhenAllowed(line: string, mdLine0: number): string {
  if (isSetextUnderlineLine(line) || isThematicBreakLine(line)) return line;
  /** Blank lines must stay blank: a line that is only `<span …>` breaks CommonMark HTML / paragraph starts after block markers. */
  if (line === "") return "";
  return `${line}${lineAnchorHtml(mdLine0)}`;
}

function appendSourceMdLineAnchorWhenAllowed(line: string, line0: number): string {
  if (isSetextUnderlineLine(line) || isThematicBreakLine(line)) return line;
  if (line === "") return "";
  return `${line}${sourceLineAnchorHtml(line0)}`;
}

/**
 * `viewportSourceLine1Based` is `BlockScrollLink.markerViewportHalfOpen1Based.lo` — the source
 * line that should appear at the top of the code viewport when the next block becomes active.
 * For marker-backed blocks this is typically the line above the start marker, which is two lines
 * earlier than {@link BlockScrollLink.sourceStart} (the first inner line of the block). Using it
 * here keeps the page-break-pull target aligned with the block-from-md-probe target so the two
 * mappers agree and monotonicity is preserved across page-break crossings.
 */
type PageBreakNextBlockMeta = {
  sidetrackLine: number;
  viewportSourceLine1Based?: number;
};

function pageBreakNextBlockMetaByLine(
  lines: string[],
  byId?: Map<string, BlockScrollLink>,
): Map<number, PageBreakNextBlockMeta> {
  const out = new Map<number, PageBreakNextBlockMeta>();
  let nextMeta: PageBreakNextBlockMeta | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const blockMatch = BLOCK_MARKER_HTML_LINE.exec(line);
    if (blockMatch?.[1]) {
      const id = blockMatch[1];
      const viewportSourceLine1Based = byId?.get(id)?.markerViewportHalfOpen1Based.lo;
      nextMeta =
        viewportSourceLine1Based !== undefined
          ? { sidetrackLine: i, viewportSourceLine1Based }
          : { sidetrackLine: i };
      continue;
    }
    if (!PAGE_BREAK_MARKER_HTML_LINE.test(line) || nextMeta === null) continue;
    out.set(i, nextMeta);
  }
  return out;
}

function blockAnchorAttrs(link: BlockScrollLink | undefined): string {
  if (link === undefined) return "";
  return ` data-source-start="${String(link.sourceStart)}" data-sidetrack-line="${String(link.sidetrackLine)}"`;
}

function pageBreakNextAttrs(next: PageBreakNextBlockMeta | undefined): string {
  if (next === undefined) return "";
  const nextSideTrackAttr = ` data-next-sidetrack-line="${String(next.sidetrackLine)}"`;
  const nextSourceAttr =
    next.viewportSourceLine1Based !== undefined
      ? ` data-next-source-viewport-line="${String(next.viewportSourceLine1Based)}"`
      : "";
  return `${nextSideTrackAttr}${nextSourceAttr}`;
}

/**
 * Inserts per-line anchors for search / hash jumps and block separator anchors after each
 * `<!-- sidetrack:block … -->` line (optional index attrs).
 *
 * Anchors are appended to the line when safe. A **leading** `<span>` breaks CommonMark block
 * recognition (`#` headings, lists, thematic breaks, fences). Fenced code lines must not get a
 * trailing anchor either (would corrupt fence delimiters or appear inside code). **GFM pipe
 * tables** must not get a trailing anchor: extra HTML after the row breaks `remark-gfm` table
 * detection, so tables would render as plain text.
 */
export function injectSideTrackDocAnchors(markdown: string, links?: BlockScrollLink[]): string {
  const byId = links ? new Map(links.map((l) => [l.id, l])) : undefined;
  const lines = markdown.split("\n");
  const pageBreakNextByLine = pageBreakNextBlockMetaByLine(lines, byId);
  const skipLineAnchor = gfmTableLineIndicesWithoutAnchors(lines);
  let fence: FenceState | null = null;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const delim = parseFenceDelimiter(line);
    if (fence) {
      if (delim && isClosingFenceLine(delim, fence)) {
        fence = null;
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }

    if (delim) {
      fence = { ch: delim.ch, len: delim.runLen };
      out.push(line);
      continue;
    }

    const m = BLOCK_MARKER_HTML_LINE.exec(line);
    if (m?.[1]) {
      const id = m[1];
      const attrs = blockAnchorAttrs(byId?.get(id));
      /** One `push` with embedded `\n\n` merged poorly with `join("\\n")`; keep real blank lines around raw `<div>`. */
      out.push(`${line}${lineAnchorHtml(i)}`);
      out.push("");
      out.push(
        `<div id="sidetrack-block-${escapeHtml(id)}" class="sidetrack-block-anchor" aria-hidden="true"${attrs}></div>`,
      );
      out.push("");
      continue;
    }

    if (PAGE_BREAK_MARKER_HTML_LINE.test(line)) {
      const nextAttrs = pageBreakNextAttrs(pageBreakNextByLine.get(i));
      out.push(`${line}${lineAnchorHtml(i)}`);
      out.push("");
      out.push(
        `<div class="sidetrack-page-break" data-sidetrack-page-break="true"${nextAttrs} aria-hidden="true"><div class="sidetrack-page-break__rule"></div></div>`,
      );
      out.push("");
      continue;
    }

    if (skipLineAnchor.has(i)) {
      out.push(line);
      continue;
    }

    out.push(appendMdLineAnchorWhenAllowed(line, i));
  }

  return out.join("\n");
}

/**
 * Adds stable source-line anchors (`id="code-line-N"`) to Markdown so rendered-source mode can
 * preserve block-aware scroll sync and block ray geometry.
 */
export function injectSourceMarkdownAnchors(markdown: string, lineIndexOffset = 0): string {
  const lines = markdown.split("\n");
  const skipLineAnchor = gfmTableLineIndicesWithoutAnchors(lines);
  let fence: FenceState | null = null;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const delim = parseFenceDelimiter(line);
    if (fence) {
      if (delim && isClosingFenceLine(delim, fence)) {
        fence = null;
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }
    if (delim) {
      fence = { ch: delim.ch, len: delim.runLen };
      out.push(line);
      continue;
    }
    if (skipLineAnchor.has(i)) {
      out.push(line);
      continue;
    }
    out.push(appendSourceMdLineAnchorWhenAllowed(line, lineIndexOffset + i));
  }
  return out.join("\n");
}

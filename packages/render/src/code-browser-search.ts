/**
 * Whole-document search: tokens must appear in order as case-insensitive substrings,
 * but may span multiple lines (any offsets in `text`).
 */

const MAX_ORDERED_SPANS = 400;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML-safe snippet for search hit lists: escapes `display`, wrapping each case-insensitive
 * occurrence of any `tokens` substring in `<mark class="search-hit">…</mark>`.
 */
export function escapeHtmlHighlightingSearchTokens(display: string, tokens: string[]): string {
  const parts = tokens.map((t) => t.trim()).filter(Boolean);
  if (parts.length === 0) return escapeHtml(display);
  try {
    const escaped = parts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    const bits = display.split(re);
    return bits
      .map((bit, i) =>
        i % 2 === 1 ? `<mark class="search-hit">${escapeHtml(bit)}</mark>` : escapeHtml(bit),
      )
      .join("");
  } catch {
    return escapeHtml(display);
  }
}

/**
 * Returns every minimal span [start, end) where each non-empty token appears in order
 * in `text` (case-insensitive). Spans may overlap; iteration advances by one code unit
 * from the start of the previous match.
 */
export function findOrderedTokenSpans(
  text: string,
  tokens: string[],
): Array<{ start: number; end: number }> {
  const parts = tokens.map((t) => t.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const lower = text.toLowerCase();
  const needle = parts.map((t) => t.toLowerCase());
  const out: Array<{ start: number; end: number }> = [];
  let scan = 0;
  let produced = 0;
  while (scan < text.length && produced < MAX_ORDERED_SPANS) {
    let pos = scan;
    let first = -1;
    let ok = true;
    for (const tok of needle) {
      if (tok.length === 0) continue;
      const idx = lower.indexOf(tok, pos);
      if (idx < 0) {
        ok = false;
        break;
      }
      if (first < 0) first = idx;
      pos = idx + tok.length;
    }
    if (!ok || first < 0) break;
    out.push({ start: first, end: pos });
    produced++;
    scan = first + 1;
  }
  return out;
}

/** 0-based line index for the line containing `offset` (offset clamped to [0, length]). */
export function offsetToLineIndex(text: string, offset: number): number {
  const o = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  for (let i = 0; i < o; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

export function lineAtIndex(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return "";
  return lines[lineIndex] ?? "";
}

/** Same whitespace tokenization as the hub search field. */
export function tokenizeQuery(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

/**
 * Documented-files tree filter: ordered case-insensitive substring tokens on normalized `sourcePath`
 * (forward slashes), matching hub path search behavior.
 */
export function filterPairsByDocumentedTreeQuery<T extends { sourcePath: string }>(
  pairs: T[],
  query: string,
): T[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [...pairs];
  return pairs.filter((p) => {
    const pathText = p.sourcePath.replace(/\\/g, "/");
    return findOrderedTokenSpans(pathText, tokens).length > 0;
  });
}

/** Hub path search row: `text` is shown; `spPath` / `crPath` tie hits to a documented pair. */
export type HubPathSearchRow = {
  kind: "path";
  line: number;
  text: string;
  spPath: string;
  crPath: string;
};

/**
 * Builds path rows for the static hub search index from documented pairs.
 *
 * When several pairs share the same source filename (multi-angle), we must emit one source-path
 * row per pair — same visible `text`, distinct `crPath` — so ordered path hits open the right
 * companion (not only the first pair after lexicographic sort of sidetrack paths).
 */
export function pathRowsFromDocumentedPairs(
  pairs: Array<{ sourcePath: string; sidetrackPath: string }>,
): HubPathSearchRow[] {
  const seenSourceWithCompanion = new Set<string>();
  const seenSideTrack = new Set<string>();
  const out: HubPathSearchRow[] = [];
  let line = 0;
  for (const p of pairs) {
    const sp = p.sourcePath.trim();
    const cr = p.sidetrackPath.trim();
    if (sp.length > 0) {
      const spKey = `${sp}\0${cr}`;
      if (!seenSourceWithCompanion.has(spKey)) {
        seenSourceWithCompanion.add(spKey);
        out.push({
          kind: "path",
          line: line++,
          text: sp,
          spPath: p.sourcePath,
          crPath: p.sidetrackPath,
        });
      }
    }
    if (cr.length > 0 && !seenSideTrack.has(cr)) {
      seenSideTrack.add(cr);
      out.push({
        kind: "path",
        line: line++,
        text: cr,
        spPath: p.sourcePath,
        crPath: p.sidetrackPath,
      });
    }
  }
  return out;
}

/** Max source paths shown when the user opens the empty-query browse preview (ArrowDown). */
export const MAX_BROWSE_SOURCE_FILE_PREVIEW = 80;

export type SourceFilePreviewRow = {
  sourcePath: string;
  sidetrackPath: string;
};

/**
 * One preview row per distinct `sourcePath`. When several pairs share a source (multi-angle),
 * keeps the pair with the lexicographically smallest `sidetrackPath` so navigation is stable.
 */
export function uniqueSourceFilePreviewRows(
  pairs: Array<{ sourcePath: string; sidetrackPath: string }>,
  maxRows: number = MAX_BROWSE_SOURCE_FILE_PREVIEW,
): { rows: SourceFilePreviewRow[]; totalUnique: number } {
  const bySource = new Map<string, SourceFilePreviewRow>();
  for (const p of pairs) {
    const sp = p.sourcePath.trim();
    if (sp.length === 0) continue;
    const prev = bySource.get(sp);
    const candidate: SourceFilePreviewRow = {
      sourcePath: p.sourcePath.trim(),
      sidetrackPath: p.sidetrackPath.trim(),
    };
    if (!prev) {
      bySource.set(sp, candidate);
      continue;
    }
    if (candidate.sidetrackPath.localeCompare(prev.sidetrackPath) < 0) {
      bySource.set(sp, candidate);
    }
  }
  const totalUnique = bySource.size;
  const rows = [...bySource.values()]
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
    .slice(0, maxRows);
  return { rows, totalUnique };
}

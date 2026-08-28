import { buildSideTrackSnippetV1, parseSideTrackSnippetV1 } from "./block-snippet.js";
import { formatMarkerAnchor } from "./anchors.js";
import { assertValidMarkerId } from "./marker-ids.js";
import { findSideTrackMarkerPairs, leadingIndentOfLine } from "./region-marker-convert.js";
import {
  sidetrackRegionInsertions,
  parseSideTrackRegionBoundary,
  sourceLineRangeForMarkerId,
} from "./source-markers.js";
import type { SideTrackBlock, SideTrackIndex, SourceFileIndexEntry } from "./model.js";

/** 1-based inclusive range of source lines a block points to. */
export type BlockRange = {
  startLine: number;
  endLine: number;
};

export type CreateBlockForRangeInput = {
  /**
   * Repo-relative path to the primary source file. Shown in the block's
   * heading so readers can see where the range lives without leaving the
   * sidetrack pane.
   */
  sourcePath: string;
  /** Full source text (lines separated by `\n`). */
  sourceText: string;
  /** Selected range to anchor the block to. */
  range: BlockRange;
  /** Optional explicit id; one is generated when omitted. */
  id?: string;
  /** Seam for deterministic tests. Default: `Math.random`. */
  rng?: () => number;
};

export type CreatedBlock = {
  block: SideTrackBlock;
  /**
   * Markdown fragment to append to the sidetrack file. Starts with the
   * invisible `<!-- sidetrack:block ... -->` marker and ends with a
   * trailing newline so subsequent appends stay separated.
   */
  markdown: string;
  /**
   * 0-based line offset within `markdown` where the author's caret should
   * land after insertion — the placeholder line ready to be overwritten.
   */
  caretLineOffset: number;
};

const BLOCK_MARKER_PREFIX = "<!-- sidetrack:block id=";
const BLOCK_MARKER_SUFFIX = " -->";
const CARET_PLACEHOLDER = "_(write sidetrack here)_";

/**
 * Create a block (domain entity) together with the Markdown fragment that
 * carries it in the sidetrack file. Pure: no I/O, deterministic when a
 * fixed `rng` and `id` are supplied.
 */
export type WrapSourceLineRangeWithSideTrackMarkersInput = {
  sourceText: string;
  range: BlockRange;
  languageId: string;
  /** Must equal the block id used in `marker:<id>` anchors and companion markers. */
  markerId: string;
};

export type WrapSourceLineRangeWithSideTrackMarkersResult = {
  sourceText: string;
  /** 1-based inclusive lines inside the delimiter pair (content only, not marker lines). */
  innerRange: BlockRange;
};

/**
 * Wraps an inclusive 1-based line range with language-appropriate SideTrack
 * start/end delimiters (e.g. `<!-- #region sidetrack:… -->` in Markdown,
 * `# sidetrack:start id=…` in TOML/YAML). Does not write files.
 */
export function wrapSourceLineRangeWithSideTrackMarkers(
  input: WrapSourceLineRangeWithSideTrackMarkersInput,
): WrapSourceLineRangeWithSideTrackMarkersResult {
  const id = assertValidMarkerId(input.markerId);
  const rawLines = input.sourceText.replaceAll("\r\n", "\n").split("\n");
  const r = clampRange(input.range, input.sourceText);
  const start0 = r.startLine - 1;
  const end0 = r.endLine - 1;
  const firstLine = rawLines[start0] ?? "";
  const indent = leadingIndentOfLine(firstLine);
  const { start, end } = sidetrackRegionInsertions(input.languageId, id, indent);
  const innerLines = rawLines.slice(start0, end0 + 1);
  const innerPart = innerLines.join("\n");
  const combined =
    innerLines.length > 0 ? `${start}${innerPart}${end}` : `${start.replace(/\n$/, "")}${end}`;
  const wrappedLines = combined.split("\n");
  const newLines = [...rawLines.slice(0, start0), ...wrappedLines, ...rawLines.slice(end0 + 1)];
  return {
    sourceText: newLines.join("\n"),
    innerRange: { startLine: start0 + 2, endLine: end0 + 2 },
  };
}

export function createBlockForRange(input: CreateBlockForRangeInput): CreatedBlock {
  const range = clampRange(input.range, input.sourceText);
  const id = input.id !== undefined ? assertValidMarkerId(input.id) : generateBlockId(input.rng);
  const anchor = formatMarkerAnchor(id);
  const snippet = snippetFromRange(input.sourceText, range);
  const block: SideTrackBlock = { id, anchor, markerId: id, snippet };
  const markdown = renderBlockMarkdown({ block, sourcePath: input.sourcePath, range });
  const caretLineOffset = placeholderLineOffset(markdown);
  return { block, markdown, caretLineOffset };
}

/**
 * Append `blockMarkdown` to existing sidetrack content, guaranteeing a
 * single blank-line separator regardless of how the existing content ended.
 */
export function appendBlockToSideTrack(existing: string, blockMarkdown: string): string {
  const trimmed = existing.trimEnd();
  const body = trimmed.length === 0 ? "" : `${trimmed}\n\n`;
  const fragment = blockMarkdown.endsWith("\n") ? blockMarkdown : `${blockMarkdown}\n`;
  return `${body}${fragment}`;
}

export type SideTrackBlockMarkerHit = {
  id: string;
  start: number;
};

/**
 * Inserts `blockMarkdown` into companion markdown based on source-region order.
 *
 * The insertion point is chosen from existing `<!-- sidetrack:block id=... -->`
 * sections: the new block is inserted before the first section whose marker id
 * appears *after* `markerId` in source order. If ordering cannot be resolved,
 * falls back to {@link appendBlockToSideTrack}.
 */
export function insertBlockBySourceMarkerOrder(args: {
  existingSideTrack: string;
  blockMarkdown: string;
  sourceText: string;
  markerId: string;
}): string {
  const markerId = assertValidMarkerId(args.markerId);
  const order = markerStartOrderMap(args.sourceText);
  const targetRank = order.get(markerId);
  if (targetRank === undefined) {
    return appendBlockToSideTrack(args.existingSideTrack, args.blockMarkdown);
  }

  const hits = findSideTrackBlockMarkerHits(args.existingSideTrack);
  if (hits.length === 0) {
    return appendBlockToSideTrack(args.existingSideTrack, args.blockMarkdown);
  }

  let insertionIndex: number | null = null;
  for (const hit of hits) {
    const rank = order.get(hit.id);
    if (rank === undefined || rank <= targetRank) continue;
    insertionIndex = hit.start;
    break;
  }
  if (insertionIndex === null) {
    return appendBlockToSideTrack(args.existingSideTrack, args.blockMarkdown);
  }

  const left = args.existingSideTrack.slice(0, insertionIndex).trimEnd();
  const right = args.existingSideTrack.slice(insertionIndex).trimStart();
  const fragment = args.blockMarkdown.endsWith("\n")
    ? args.blockMarkdown
    : `${args.blockMarkdown}\n`;
  const leftPart = left.length === 0 ? "" : `${left}\n\n`;
  const rightPart = right.length === 0 ? "" : `\n\n${right}`;
  return `${leftPart}${fragment.trimEnd()}${rightPart}\n`;
}

function markerStartOrderMap(sourceText: string): Map<string, number> {
  const order = new Map<string, number>();
  let next = 0;

  // Prefer first explicit start-boundary position so ordering still works while a region is mid-edit.
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  for (const line of lines) {
    const hit = parseSideTrackRegionBoundary(line);
    if (!hit || hit.kind !== "start") continue;
    if (order.has(hit.id)) continue;
    order.set(hit.id, next++);
  }

  // Keep pair-based fallback for any id represented by a full pair but missing from start scan.
  for (const pair of findSideTrackMarkerPairs(sourceText)) {
    if (order.has(pair.id)) continue;
    order.set(pair.id, next++);
  }

  return order;
}

export function findSideTrackBlockMarkerHits(markdown: string): SideTrackBlockMarkerHit[] {
  const hits: SideTrackBlockMarkerHit[] = [];
  const markerRe = /<!--\s*sidetrack:block\s+id=([a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?)\s*-->/gi;
  for (const m of markdown.matchAll(markerRe)) {
    const idRaw = m[1];
    if (idRaw === undefined) continue;
    const start = m.index ?? -1;
    if (start < 0) continue;
    try {
      hits.push({ id: assertValidMarkerId(idRaw), start });
    } catch {
      /* ignore malformed marker ids */
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

export type AddBlockToIndexInput = {
  sourcePath: string;
  sidetrackPath: string;
  block: SideTrackBlock;
};

/**
 * Return a new index with the block added under the given source file.
 * The source entry is created lazily when it does not exist yet. Throws
 * when the block id already exists under that source so callers cannot
 * silently corrupt the index.
 */
export function addBlockToIndex(
  index: SideTrackIndex,
  input: AddBlockToIndexInput,
): SideTrackIndex {
  const key = input.sidetrackPath;
  const existing = index.bySideTrackPath[key];
  if (existing && existing.sourcePath !== input.sourcePath) {
    throw new Error(
      `sidetrackPath ${key} is already indexed for ${existing.sourcePath}, not ${input.sourcePath}`,
    );
  }
  const previousBlocks = existing?.blocks ?? [];
  if (previousBlocks.some((b) => b.id === input.block.id)) {
    throw new Error(
      `block id ${input.block.id} already exists under ${key}; choose a different id`,
    );
  }
  const nextEntry: SourceFileIndexEntry = {
    sourcePath: input.sourcePath,
    sidetrackPath: input.sidetrackPath,
    blocks: [...previousBlocks, input.block],
  };
  return {
    schemaVersion: index.schemaVersion,
    bySideTrackPath: { ...index.bySideTrackPath, [key]: nextEntry },
  };
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 6;

/**
 * Six-character base-36 id. Alphabet excludes uppercase so ids are case-
 * insensitive-safe on filesystems and URLs. Collision space ≈ 2 billion,
 * comfortably larger than any plausible per-file block count.
 */
export function generateBlockId(rng: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[Math.floor(rng() * ID_ALPHABET.length)];
  }
  return id;
}

function clampRange(range: BlockRange, sourceText: string): BlockRange {
  const lineCount = Math.max(1, sourceText.split("\n").length);
  const start = Math.max(1, Math.min(Math.floor(range.startLine), lineCount));
  const endRaw = Math.max(start, Math.floor(range.endLine));
  const end = Math.min(endRaw, lineCount);
  return { startLine: start, endLine: end };
}

export function snippetFromRange(sourceText: string, range: BlockRange): string {
  const lines = sourceText.split("\n");
  const trimmed: string[] = [];
  for (let ln = range.startLine; ln <= range.endLine; ln++) {
    trimmed.push((lines[ln - 1] ?? "").trim());
  }
  return buildSideTrackSnippetV1(trimmed);
}

function renderBlockMarkdown(args: {
  block: SideTrackBlock;
  sourcePath: string;
  range: BlockRange;
}): string {
  const marker = `${BLOCK_MARKER_PREFIX}${args.block.id}${BLOCK_MARKER_SUFFIX}`;
  const heading = `## \`${args.sourcePath}\` ${rangeLabel(args.range)}`;
  return `${marker}\n${heading}\n\n${CARET_PLACEHOLDER}\n`;
}

function rangeLabel(range: BlockRange): string {
  if (range.startLine === range.endLine) return `line ${range.startLine}`;
  return `lines ${range.startLine}–${range.endLine}`;
}

function placeholderLineOffset(markdown: string): number {
  const lines = markdown.split("\n");
  return Math.max(0, lines.indexOf(CARET_PLACEHOLDER));
}

export function removeBlockFromSideTrack(markdown: string, blockId: string): string {
  const normalizedId = assertValidMarkerId(blockId);
  const hits = findSideTrackBlockMarkerHits(markdown);
  const targetHitIndex = hits.findIndex((h) => h.id === normalizedId);
  if (targetHitIndex === -1) {
    return markdown;
  }
  const targetHit = hits[targetHitIndex];
  if (!targetHit) return markdown;

  const firstHit = hits[0];
  if (!firstHit) return markdown;
  // The prelude is from 0 to the start of the first hit.
  const prelude = markdown.slice(0, firstHit.start);

  // We filter out the block that has the target ID
  const segments: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (i === targetHitIndex) continue;
    const hit = hits[i];
    if (!hit) continue;
    const nextHit = hits[i + 1];
    const end = nextHit ? nextHit.start : markdown.length;
    segments.push(markdown.slice(hit.start, end));
  }

  // Combine prelude and other segments
  let result = prelude;
  for (const segment of segments) {
    result = appendBlockToSideTrack(result, segment);
  }
  return result;
}

export function removeSourceMarkersFromText(sourceText: string, markerId: string): string {
  const normalizedId = assertValidMarkerId(markerId);
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const filtered = lines.filter((line) => {
    const hit = parseSideTrackRegionBoundary(line);
    return hit === null || hit.id !== normalizedId;
  });
  return filtered.join("\n");
}

export function removeBlockFromIndex(
  index: SideTrackIndex,
  sidetrackPath: string,
  blockId: string,
): SideTrackIndex {
  const entry = index.bySideTrackPath[sidetrackPath];
  if (!entry) {
    return index;
  }
  const nextBlocks = entry.blocks.filter((b) => b.id !== blockId);
  if (nextBlocks.length === entry.blocks.length) {
    return index;
  }
  if (nextBlocks.length === 0) {
    const { [sidetrackPath]: _, ...nextBySideTrackPath } = index.bySideTrackPath;
    return {
      ...index,
      bySideTrackPath: nextBySideTrackPath,
    };
  }
  return {
    ...index,
    bySideTrackPath: {
      ...index.bySideTrackPath,
      [sidetrackPath]: {
        ...entry,
        blocks: nextBlocks,
      },
    },
  };
}

export type AlignAndCleanRegionsInput = {
  sourceText: string;
  sidetrackMarkdown: string;
  index: SideTrackIndex;
  sidetrackPath: string;
  sourcePath: string;
};

export function alignAndCleanRegions(args: AlignAndCleanRegionsInput): {
  sidetrackMarkdown: string;
  index: SideTrackIndex;
} {
  const sourcePairs = findSideTrackMarkerPairs(args.sourceText);
  const sourceMarkerIds = Array.from(new Set(sourcePairs.map((p) => p.id)));

  // 1. Extract prelude and existing blocks from markdown
  const hits = findSideTrackBlockMarkerHits(args.sidetrackMarkdown);
  const firstHit = hits[0];
  const prelude =
    hits.length > 0 && firstHit
      ? args.sidetrackMarkdown.slice(0, firstHit.start)
      : args.sidetrackMarkdown;

  const segmentMap = new Map<string, string>();
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (!hit) continue;
    const nextHit = hits[i + 1];
    const end = nextHit ? nextHit.start : args.sidetrackMarkdown.length;
    const segment = args.sidetrackMarkdown.slice(hit.start, end);
    // Keep the first segment if duplicates exist
    if (!segmentMap.has(hit.id)) {
      segmentMap.set(hit.id, segment);
    }
  }

  // 2. Reconstruct markdown and index blocks based on source order
  const entry = args.index.bySideTrackPath[args.sidetrackPath];
  const nextBlocks: SideTrackBlock[] = [];
  let nextMarkdown = prelude;

  for (const markerId of sourceMarkerIds) {
    const rawRange = sourceLineRangeForMarkerId(args.sourceText, markerId);
    if (!rawRange) continue;
    const range: BlockRange = { startLine: rawRange.start, endLine: rawRange.end };
    const snippet = snippetFromRange(args.sourceText, range);

    // Get or create markdown segment
    let prose = "";
    const existingSegment = segmentMap.get(markerId);
    if (existingSegment !== undefined) {
      const parsed = parseBlockSegment(existingSegment);
      prose = parsed.prose;
    }

    // Construct segment
    const marker = `${BLOCK_MARKER_PREFIX}${markerId}${BLOCK_MARKER_SUFFIX}`;
    const heading = `## \`${args.sourcePath}\` ${rangeLabel(range)}`;
    const newSegment = `${marker}\n${heading}\n\n${prose || CARET_PLACEHOLDER}\n`;

    nextMarkdown = appendBlockToSideTrack(nextMarkdown, newSegment);

    // Get or create index block
    const existingBlock = entry?.blocks.find((b) => b.id === markerId);
    const updatedBlock: SideTrackBlock = {
      ...existingBlock,
      id: markerId,
      anchor: `marker:${markerId}`,
      markerId,
      snippet,
    };
    nextBlocks.push(updatedBlock);
  }

  // 3. Construct new index
  let nextBySideTrackPath: SideTrackIndex["bySideTrackPath"];
  if (nextBlocks.length > 0) {
    nextBySideTrackPath = {
      ...args.index.bySideTrackPath,
      [args.sidetrackPath]: {
        sourcePath: args.sourcePath,
        sidetrackPath: args.sidetrackPath,
        blocks: nextBlocks,
      },
    };
  } else {
    const { [args.sidetrackPath]: _, ...rest } = args.index.bySideTrackPath;
    nextBySideTrackPath = rest;
  }

  return {
    sidetrackMarkdown: nextMarkdown,
    index: {
      ...args.index,
      bySideTrackPath: nextBySideTrackPath,
    },
  };
}

function parseBlockSegment(segment: string): { heading: string; prose: string } {
  const lines = segment.split("\n");
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.startsWith("## ")) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) {
    return { heading: "", prose: segment.trim() };
  }
  const heading = lines[headingIdx] ?? "";
  const prose = lines
    .slice(headingIdx + 1)
    .join("\n")
    .trim();
  return { heading, prose };
}

export function recoverSourceMarkersFromSnippet(args: {
  sourceText: string;
  languageId: string;
  block: SideTrackBlock;
}): { sourceText: string; healed: boolean; range?: BlockRange } {
  if (!args.block.snippet) {
    return { sourceText: args.sourceText, healed: false };
  }
  const snippetLines = parseSideTrackSnippetV1(args.block.snippet);
  if (!snippetLines || snippetLines.length === 0) {
    return { sourceText: args.sourceText, healed: false };
  }

  const sourceLines = args.sourceText.replaceAll("\r\n", "\n").split("\n");
  const S = sourceLines.length;
  const N = snippetLines.length;

  const matches: number[] = [];
  for (let i = 0; i <= S - N; i++) {
    let match = true;
    for (let j = 0; j < N; j++) {
      if ((sourceLines[i + j] ?? "").trim() !== snippetLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      matches.push(i);
    }
  }

  if (matches.length !== 1) {
    return { sourceText: args.sourceText, healed: false };
  }

  const matchIdx = matches[0];
  if (matchIdx === undefined) {
    return { sourceText: args.sourceText, healed: false };
  }
  const startLine = matchIdx + 1;
  const endLine = matchIdx + N;

  const wrapped = wrapSourceLineRangeWithSideTrackMarkers({
    sourceText: args.sourceText,
    range: { startLine, endLine },
    languageId: args.languageId,
    markerId: args.block.id,
  });

  return {
    sourceText: wrapped.sourceText,
    healed: true,
    range: wrapped.innerRange,
  };
}

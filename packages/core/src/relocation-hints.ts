import { parseAnchor } from "./anchors.js";
import { parseParallelDocsSnippetV1 } from "./block-snippet.js";
import type { ParallelDocsBlock, ParallelDocsIndex, SourceFileIndexEntry } from "./model.js";
import { normalizeRepoRelativePath } from "./paths.js";
import { findParallelDocsMarkerPairs } from "./region-marker-convert.js";
import type { ScmPathRename } from "./scm/scm-provider.js";

export type RelocationHintsInput = {
  index: ParallelDocsIndex;
  /** Normalized repo-relative paths that are indexed but not readable on disk */
  missingSourcePathsNorm: ReadonlySet<string>;
  /** Optional Git renames (same shape as `sync-moved-paths`, e.g. `HEAD~1` → `HEAD`) */
  gitRenames?: readonly ScmPathRename[];
  /** Readable indexed primaries: normalized path → LF source text */
  indexedSourceTextsByPath: ReadonlyMap<string, string>;
};

function entriesForNormalizedSource(
  index: ParallelDocsIndex,
  missingNorm: string,
): SourceFileIndexEntry[] {
  return Object.values(index.byParallelDocsPath).filter(
    (e) => normalizeRepoRelativePath(e.sourcePath) === missingNorm,
  );
}

function markerPathsContainingId(
  markerId: string,
  textsByPath: ReadonlyMap<string, string>,
  excludeNorm: string,
): string[] {
  const out: string[] = [];
  for (const [p, text] of textsByPath) {
    if (p === excludeNorm) continue;
    const pairs = findParallelDocsMarkerPairs(text);
    if (pairs.some((pair) => pair.id === markerId)) out.push(p);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function snippetNeedleFromBlock(block: ParallelDocsBlock): string | null {
  if (!block.snippet) return null;
  const lines = parseParallelDocsSnippetV1(block.snippet);
  if (!lines || lines.length === 0) return null;
  const substantive = lines.map((l) => l.trim()).filter((l) => l.length >= 3);
  if (substantive.length === 0) return null;
  const needle = substantive.slice(0, 4).join("\n");
  return needle.length >= 12 ? needle : null;
}

function pathsContainingSnippetNeedle(
  needle: string,
  textsByPath: ReadonlyMap<string, string>,
  excludeNorm: string,
): string[] {
  const out: string[] = [];
  for (const [p, text] of textsByPath) {
    if (p === excludeNorm) continue;
    if (text.includes(needle)) out.push(p);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function markerIdFromBlock(block: ParallelDocsBlock): string | null {
  try {
    const a = parseAnchor(block.anchor);
    if (a.kind === "marker") return a.id;
  } catch {
    /* ignore */
  }
  return null;
}

function collectMarkerIds(entries: readonly SourceFileIndexEntry[]): Set<string> {
  const markerIds = new Set<string>();
  for (const e of entries) {
    for (const b of e.blocks) {
      const mid = markerIdFromBlock(b);
      if (mid) markerIds.add(mid);
    }
  }
  return markerIds;
}

function gitRenameHint(prefix: string, gitHit: ScmPathRename): string {
  const to = normalizeRepoRelativePath(gitHit.to);
  return (
    `${prefix}: Git lists a rename to "${to}". Run: parallel-docs sync-moved-paths --from HEAD~1 --to HEAD ` +
    `(adjust --from/--to to the commit range that contains the rename).`
  );
}

function markerHintsForMissing(
  prefix: string,
  markerIds: ReadonlySet<string>,
  texts: ReadonlyMap<string, string>,
  missingNorm: string,
): string[] {
  const out: string[] = [];
  for (const mid of [...markerIds].sort((a, b) => a.localeCompare(b))) {
    const paths = markerPathsContainingId(mid, texts, missingNorm);
    if (paths.length === 1) {
      out.push(
        `${prefix}: marker id "${mid}" appears in indexed source "${paths[0]}". ` +
          `If parallel-docs should follow that file, update index sourcePath (e.g. apply renames then sync-moved-paths, or edit index.json).`,
      );
    } else if (paths.length > 1) {
      out.push(
        `${prefix}: marker id "${mid}" appears in several indexed sources (${paths.join(", ")}); pick the intended file and update the index.`,
      );
    }
  }
  return out;
}

function snippetHintLineForBlock(
  prefix: string,
  block: ParallelDocsBlock,
  texts: ReadonlyMap<string, string>,
  missingNorm: string,
): string | null {
  let anchorKind: string;
  try {
    anchorKind = parseAnchor(block.anchor).kind;
  } catch {
    return null;
  }
  if (anchorKind !== "lines") return null;
  const needle = snippetNeedleFromBlock(block);
  if (!needle) return null;
  const hits = pathsContainingSnippetNeedle(needle, texts, missingNorm);
  if (hits.length === 1) {
    return (
      `${prefix}: block "${block.id}" snippet text matches indexed source "${hits[0]}" ` +
      `(lines: anchor may need new line numbers after the move).`
    );
  }
  if (hits.length > 1) {
    return `${prefix}: block "${block.id}" snippet text matches multiple indexed sources (${hits.join(", ")}); narrow manually.`;
  }
  return null;
}

function snippetHintsForMissing(
  prefix: string,
  entries: readonly SourceFileIndexEntry[],
  texts: ReadonlyMap<string, string>,
  missingNorm: string,
): string[] {
  const out: string[] = [];
  for (const e of entries) {
    for (const b of e.blocks) {
      const line = snippetHintLineForBlock(prefix, b, texts, missingNorm);
      if (line) out.push(line);
    }
  }
  return out;
}

function symbolOpaqueHints(
  prefix: string,
  entries: readonly SourceFileIndexEntry[],
  affectedMd: readonly string[],
): string[] {
  let needsSymbolNote = false;
  let needsOpaqueNote = false;
  for (const e of entries) {
    for (const b of e.blocks) {
      try {
        const k = parseAnchor(b.anchor).kind;
        if (k === "symbol") needsSymbolNote = true;
        if (k === "opaque") needsOpaqueNote = true;
      } catch {
        /* handled elsewhere */
      }
    }
  }
  const out: string[] = [];
  if (needsSymbolNote) {
    out.push(
      `${prefix}: one or more blocks use symbol: anchors (${affectedMd.join(", ")}). ` +
        `After a cross-file move, re-point anchors with language tooling or by hand — ParallelDocs does not resolve symbols across files yet.`,
    );
  }
  if (needsOpaqueNote) {
    out.push(
      `${prefix}: one or more blocks use opaque anchors; update those anchors manually after the move.`,
    );
  }
  return out;
}

function hintsForOneMissingPath(missingNorm: string, input: RelocationHintsInput): string[] {
  const entries = entriesForNormalizedSource(input.index, missingNorm);
  const affectedMd = [...new Set(entries.map((e) => e.parallelDocsPath))].sort((a, b) =>
    a.localeCompare(b),
  );
  const prefix = `Missing primary "${missingNorm}"`;

  const gitHit = input.gitRenames?.find((r) => normalizeRepoRelativePath(r.from) === missingNorm);
  const markerIds = collectMarkerIds(entries);
  const parts: string[] = [
    ...(gitHit ? [gitRenameHint(prefix, gitHit)] : []),
    ...markerHintsForMissing(prefix, markerIds, input.indexedSourceTextsByPath, missingNorm),
    ...snippetHintsForMissing(prefix, entries, input.indexedSourceTextsByPath, missingNorm),
    ...symbolOpaqueHints(prefix, entries, affectedMd),
  ];

  if (parts.length === 0) {
    parts.push(
      `${prefix}: no Git rename in the supplied range and no marker/snippet matches in other indexed primaries. ` +
        `Remove stale index rows, restore the file, or point sourcePath at the new primary.`,
    );
  }

  return parts;
}

/**
 * Non-authoritative hints when indexed primary files are missing: Git renames,
 * marker ids found under other indexed sources, and snippet-shaped matches.
 * Intended for validation / doctor output — does not modify the index.
 */
export function relocationHintMessages(input: RelocationHintsInput): string[] {
  const sortedMissing = [...input.missingSourcePathsNorm].sort((a, b) => a.localeCompare(b));
  return sortedMissing.flatMap((m) => hintsForOneMissingPath(m, input));
}

import { buildSideTrackSnippetV1 } from "./block-snippet.js";
import type { SideTrackBlock, SideTrackIndex, SourceFileIndexEntry } from "./model.js";

type LegacyFingerprint = {
  startLine: string;
  endLine: string;
  lineCount: number;
};

function isLegacyFingerprint(value: unknown): value is LegacyFingerprint {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.startLine === "string" &&
    typeof o.endLine === "string" &&
    typeof o.lineCount === "number" &&
    Number.isInteger(o.lineCount) &&
    o.lineCount >= 1
  );
}

function snippetFromLegacyFingerprint(fp: LegacyFingerprint): string {
  if (fp.lineCount === 1) {
    return buildSideTrackSnippetV1([fp.startLine]);
  }
  if (fp.lineCount === 2) {
    return buildSideTrackSnippetV1([fp.startLine, fp.endLine]);
  }
  const omitted = fp.lineCount - 2;
  return buildSideTrackSnippetV1([
    fp.startLine,
    `… (${omitted} line${omitted === 1 ? "" : "s"} omitted) …`,
    fp.endLine,
  ]);
}

/**
 * Drops legacy `fingerprint` objects from index.json into a single `snippet`
 * string (diff-style). Returns a fresh index when anything changed.
 */
export function normalizeSideTrackIndex(index: SideTrackIndex): {
  index: SideTrackIndex;
  changed: boolean;
} {
  let changed = false;
  const nextByPath: Record<string, SourceFileIndexEntry> = { ...index.bySideTrackPath };
  for (const [key, entry] of Object.entries(index.bySideTrackPath)) {
    const blocks = entry.blocks.map((block) => normalizeBlock(block));
    const entryChanged =
      JSON.stringify({ ...entry, blocks }) !== JSON.stringify({ ...entry, blocks: entry.blocks });
    if (entryChanged) {
      changed = true;
      nextByPath[key] = { ...entry, blocks };
    }
  }
  if (!changed) return { index, changed: false };
  return {
    index: { schemaVersion: index.schemaVersion, bySideTrackPath: nextByPath },
    changed: true,
  };
}

function normalizeBlock(block: SideTrackBlock): SideTrackBlock {
  const raw = block as Record<string, unknown>;
  if (!isLegacyFingerprint(raw.fingerprint)) return block;
  if (typeof raw.snippet === "string" && raw.snippet.trim() !== "") {
    const { fingerprint: _f, ...rest } = raw;
    return rest as SideTrackBlock;
  }
  const snippet = snippetFromLegacyFingerprint(raw.fingerprint);
  const { fingerprint: _f, ...rest } = raw;
  return { ...rest, snippet } as SideTrackBlock;
}

/** SideTrack block aligned to a region of a primary source file. */
export type SideTrackBlock = {
  /** Stable id within the side-track markdown file. */
  id: string;
  /** Human or machine anchor string (see anchor grammar in docs). */
  anchor: string;
  /**
   * Optional unified-diff–style capture of the anchored source lines (see
   * `block-snippet.ts`). Self-contained string in index.json — not a nested
   * JSON region object.
   */
  snippet?: string;
  /**
   * When the anchor is `marker:<id>`, the same id appears in source as the
   * region name `sidetrack:<id>` (e.g. `//#region` / `//#endregion` in
   * TypeScript, aligned with the Region Marker extension), or in legacy
   * `sidetrack:start id=…` / `sidetrack:end id=…` line comments.
   */
  markerId?: string;
  /** Last human-verified commit (full SHA) when this block was considered accurate. */
  lastVerifiedCommit?: string;
  /** Git blob id at verification time for the primary file (when known). */
  lastVerifiedBlob?: string;
  /** Optional notes for agents or reviewers. */
  notes?: string;
};

export type SourceFileIndexEntry = {
  /** Repo-relative path to the primary file this sidetrack belongs to. */
  sourcePath: string;
  /** Repo-relative path to the Markdown sidetrack file. */
  sidetrackPath: string;
  blocks: SideTrackBlock[];
};

/** Root metadata document stored as JSON under `.sidetrack/metadata/`. */
export type SideTrackIndex = {
  schemaVersion: number;
  /**
   * Blocks grouped by repo-relative sidetrack Markdown path so multiple **Angles**
   * for the same `sourcePath` each keep their own block lists (schema v3+).
   */
  bySideTrackPath: Record<string, SourceFileIndexEntry>;
};

export const CURRENT_SCHEMA_VERSION = 3 as const;

/**
 * Normalizes `index.json` `schemaVersion` after `JSON.parse` (integer, or
 * rare string forms like `"3"`).
 */
export function coerceIndexSchemaVersion(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
  }
  return null;
}

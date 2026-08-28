import { readFile } from "node:fs/promises";

import {
  sidetrackPairSourceFileExistsOnDisk,
  discoverSideTrackPairsOnDisk,
  githubRepoBlobFileUrl,
  readIndex,
  resolvePathUnderRepoRoot,
} from "@sidetrack/core";

export const SIDETRACK_NAV_SEARCH_SCHEMA_VERSION = 1 as const;

/** One searchable unit for a future hub or external tooling — never primary source lines. */
export type SideTrackNavSearchRow =
  | { kind: "sourcePath"; sourcePath: string; sidetrackPath: string }
  | { kind: "sidetrackPath"; sourcePath: string; sidetrackPath: string }
  | {
      kind: "sidetrackLine";
      sourcePath: string;
      sidetrackPath: string;
      line: number;
      text: string;
    };

/**
 * One indexed source ↔ sidetrack pair for the static hub.
 * Optional SCM blob URLs are filled when `[static_site].github_url` is set (GitHub-style today;
 * configurable host URL — see plan). Same-site `./browse/…` links are added by the static-site
 * build so navigation stays on the exported HTML without requiring an external host.
 */
export type DocumentedPairNav = {
  sourcePath: string;
  sidetrackPath: string;
  sourceOnGithub?: string;
  sidetrackOnGithub?: string;
  /**
   * When the static Pages build emits per-pair browse HTML under `_site/browse/`, a URL relative
   * to the site root `index.html` (e.g. `./browse/src/x.ts/index.html` or `./browse/README.md/main/index.html`)
   * so the hub can open the same SideTrack UI without leaving the site.
   */
  staticBrowseUrl?: string;
};

export type SideTrackNavSearchDocument = {
  schemaVersion: typeof SIDETRACK_NAV_SEARCH_SCHEMA_VERSION;
  rows: SideTrackNavSearchRow[];
  /** Present when `githubBlobBase` was passed to the builder — drives the documented-files tree. */
  documentedPairs?: DocumentedPairNav[];
};

export type BuildSideTrackNavSearchFallback = {
  /** Repo-relative primary path (toolbar / manifest label). */
  sourcePath: string;
  /** Repo-relative sidetrack Markdown path. */
  sidetrackPath: string;
  /** Absolute path to that Markdown file on disk. */
  markdownAbs: string;
};

export type BuildSideTrackNavSearchGithubBlobBase = {
  owner: string;
  repo: string;
  branch: string;
};

function buildDocumentedPairs(
  pairs: { sourcePath: string; sidetrackPath: string }[],
  gh?: BuildSideTrackNavSearchGithubBlobBase,
): DocumentedPairNav[] {
  const uniq = new Map<string, DocumentedPairNav>();
  for (const { sourcePath, sidetrackPath } of pairs) {
    const key = `${sourcePath}\0${sidetrackPath}`;
    if (uniq.has(key)) continue;
    const row: DocumentedPairNav = { sourcePath, sidetrackPath };
    if (gh !== undefined) {
      row.sourceOnGithub = githubRepoBlobFileUrl(gh.owner, gh.repo, gh.branch, sourcePath);
      row.sidetrackOnGithub = githubRepoBlobFileUrl(gh.owner, gh.repo, gh.branch, sidetrackPath);
    }
    uniq.set(key, row);
  }
  return [...uniq.values()].sort((a, b) =>
    a.sourcePath === b.sourcePath
      ? a.sidetrackPath.localeCompare(b.sidetrackPath)
      : a.sourcePath.localeCompare(b.sourcePath),
  );
}

function mergeNavSearchPairs(
  indexPairs: { sidetrackPath: string; sourcePath: string }[],
  diskPairs: { sidetrackPath: string; sourcePath: string }[],
  fallback?: BuildSideTrackNavSearchFallback,
): { sourcePath: string; sidetrackPath: string }[] {
  const byCr = new Map<string, { sourcePath: string; sidetrackPath: string }>();
  for (const p of diskPairs) {
    byCr.set(p.sidetrackPath, { sourcePath: p.sourcePath, sidetrackPath: p.sidetrackPath });
  }
  for (const e of indexPairs) {
    byCr.set(e.sidetrackPath, { sourcePath: e.sourcePath, sidetrackPath: e.sidetrackPath });
  }
  if (fallback !== undefined) {
    const fp = {
      sourcePath: fallback.sourcePath,
      sidetrackPath: fallback.sidetrackPath,
    };
    if (!byCr.has(fp.sidetrackPath)) {
      byCr.set(fp.sidetrackPath, fp);
    }
  }
  return [...byCr.values()].sort((a, b) => a.sidetrackPath.localeCompare(b.sidetrackPath));
}

function markdownAbsForMergedPair(
  repoRoot: string,
  pair: { sourcePath: string; sidetrackPath: string },
  fallback?: BuildSideTrackNavSearchFallback,
): string {
  if (
    fallback !== undefined &&
    pair.sidetrackPath === fallback.sidetrackPath &&
    pair.sourcePath === fallback.sourcePath
  ) {
    return fallback.markdownAbs;
  }
  return resolvePathUnderRepoRoot(repoRoot, pair.sidetrackPath);
}

async function appendPairRowsSync(
  rows: SideTrackNavSearchRow[],
  sourcePath: string,
  sidetrackPath: string,
  markdownAbs: string,
): Promise<void> {
  rows.push({ kind: "sourcePath", sourcePath, sidetrackPath });
  rows.push({ kind: "sidetrackPath", sourcePath, sidetrackPath });
  try {
    const md = await readFile(markdownAbs, "utf8");
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      rows.push({ kind: "sidetrackLine", sourcePath, sidetrackPath, line: i, text: lines[i] });
    }
  } catch {
    /* keep path rows when the companion file is missing */
  }
}

/**
 * Builds a JSON-serialisable search corpus: **filenames / paths** plus **sidetrack Markdown lines**
 * for each indexed pair. Primary source file contents are intentionally omitted.
 *
 * `documentedPairs` lists every merged pair. When `githubBlobBase` is set, GitHub-style **blob**
 * URLs are included for optional outbound links; the static-site build always adds same-site
 * `staticBrowseUrl` when it emits `_site/browse/` (mirrored `…/index.html` paths; see `@sidetrack/core`).
 *
 * Pairs are merged from the metadata index, a walk of the configured storage `source` tree for
 * every `*.md` companion (flat or Angles layout), and an optional single-page `fallback`. For the
 * same `sidetrackPath`, the index wins over disk-inferred paths.
 */
export async function buildSideTrackNavSearchDocument(
  repoRoot: string,
  fallback?: BuildSideTrackNavSearchFallback,
  githubBlobBase?: BuildSideTrackNavSearchGithubBlobBase,
  storageDir = ".sidetrack",
): Promise<SideTrackNavSearchDocument> {
  const rows: SideTrackNavSearchRow[] = [];
  const idx = await readIndex(repoRoot);
  const indexPairs =
    idx !== null && Object.keys(idx.bySideTrackPath).length > 0
      ? Object.entries(idx.bySideTrackPath).map(([crPath, e]) => ({
          sidetrackPath: crPath,
          sourcePath: e.sourcePath,
        }))
      : [];

  const diskPairs = await discoverSideTrackPairsOnDisk(repoRoot, storageDir);
  const mergedRaw = mergeNavSearchPairs(indexPairs, diskPairs, fallback);
  const merged: typeof mergedRaw = [];
  for (const p of mergedRaw) {
    if (await sidetrackPairSourceFileExistsOnDisk(repoRoot, p.sourcePath)) merged.push(p);
  }

  if (merged.length === 0) {
    return { schemaVersion: SIDETRACK_NAV_SEARCH_SCHEMA_VERSION, rows };
  }

  for (const p of merged) {
    await appendPairRowsSync(
      rows,
      p.sourcePath,
      p.sidetrackPath,
      markdownAbsForMergedPair(repoRoot, p, fallback),
    );
  }

  const documentedPairs = buildDocumentedPairs(merged, githubBlobBase);

  return {
    schemaVersion: SIDETRACK_NAV_SEARCH_SCHEMA_VERSION,
    rows,
    documentedPairs,
  };
}

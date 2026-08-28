import { readFile } from "node:fs/promises";

import {
  parallelDocsPairSourceFileExistsOnDisk,
  discoverParallelDocsPairsOnDisk,
  githubRepoBlobFileUrl,
  readIndex,
  resolvePathUnderRepoRoot,
} from "@parallel-docs/core";

export const PARALLEL_DOCS_NAV_SEARCH_SCHEMA_VERSION = 1 as const;

/** One searchable unit for a future hub or external tooling — never primary source lines. */
export type ParallelDocsNavSearchRow =
  | { kind: "sourcePath"; sourcePath: string; parallelDocsPath: string }
  | { kind: "parallelDocsPath"; sourcePath: string; parallelDocsPath: string }
  | {
      kind: "parallelDocsLine";
      sourcePath: string;
      parallelDocsPath: string;
      line: number;
      text: string;
    };

/**
 * One indexed source ↔ parallel-docs pair for the static hub.
 * Optional SCM blob URLs are filled when `[static_site].github_url` is set (GitHub-style today;
 * configurable host URL — see plan). Same-site `./browse/…` links are added by the static-site
 * build so navigation stays on the exported HTML without requiring an external host.
 */
export type DocumentedPairNav = {
  sourcePath: string;
  parallelDocsPath: string;
  sourceOnGithub?: string;
  parallelDocsOnGithub?: string;
  /**
   * When the static Pages build emits per-pair browse HTML under `_site/browse/`, a URL relative
   * to the site root `index.html` (e.g. `./browse/src/x.ts/index.html` or `./browse/README.md/main/index.html`)
   * so the hub can open the same ParallelDocs UI without leaving the site.
   */
  staticBrowseUrl?: string;
};

export type ParallelDocsNavSearchDocument = {
  schemaVersion: typeof PARALLEL_DOCS_NAV_SEARCH_SCHEMA_VERSION;
  rows: ParallelDocsNavSearchRow[];
  /** Present when `githubBlobBase` was passed to the builder — drives the documented-files tree. */
  documentedPairs?: DocumentedPairNav[];
};

export type BuildParallelDocsNavSearchFallback = {
  /** Repo-relative primary path (toolbar / manifest label). */
  sourcePath: string;
  /** Repo-relative parallel-docs Markdown path. */
  parallelDocsPath: string;
  /** Absolute path to that Markdown file on disk. */
  markdownAbs: string;
};

export type BuildParallelDocsNavSearchGithubBlobBase = {
  owner: string;
  repo: string;
  branch: string;
};

function buildDocumentedPairs(
  pairs: { sourcePath: string; parallelDocsPath: string }[],
  gh?: BuildParallelDocsNavSearchGithubBlobBase,
): DocumentedPairNav[] {
  const uniq = new Map<string, DocumentedPairNav>();
  for (const { sourcePath, parallelDocsPath } of pairs) {
    const key = `${sourcePath}\0${parallelDocsPath}`;
    if (uniq.has(key)) continue;
    const row: DocumentedPairNav = { sourcePath, parallelDocsPath };
    if (gh !== undefined) {
      row.sourceOnGithub = githubRepoBlobFileUrl(gh.owner, gh.repo, gh.branch, sourcePath);
      row.parallelDocsOnGithub = githubRepoBlobFileUrl(
        gh.owner,
        gh.repo,
        gh.branch,
        parallelDocsPath,
      );
    }
    uniq.set(key, row);
  }
  return [...uniq.values()].sort((a, b) =>
    a.sourcePath === b.sourcePath
      ? a.parallelDocsPath.localeCompare(b.parallelDocsPath)
      : a.sourcePath.localeCompare(b.sourcePath),
  );
}

function mergeNavSearchPairs(
  indexPairs: { parallelDocsPath: string; sourcePath: string }[],
  diskPairs: { parallelDocsPath: string; sourcePath: string }[],
  fallback?: BuildParallelDocsNavSearchFallback,
): { sourcePath: string; parallelDocsPath: string }[] {
  const byCr = new Map<string, { sourcePath: string; parallelDocsPath: string }>();
  for (const p of diskPairs) {
    byCr.set(p.parallelDocsPath, {
      sourcePath: p.sourcePath,
      parallelDocsPath: p.parallelDocsPath,
    });
  }
  for (const e of indexPairs) {
    byCr.set(e.parallelDocsPath, {
      sourcePath: e.sourcePath,
      parallelDocsPath: e.parallelDocsPath,
    });
  }
  if (fallback !== undefined) {
    const fp = {
      sourcePath: fallback.sourcePath,
      parallelDocsPath: fallback.parallelDocsPath,
    };
    if (!byCr.has(fp.parallelDocsPath)) {
      byCr.set(fp.parallelDocsPath, fp);
    }
  }
  return [...byCr.values()].sort((a, b) => a.parallelDocsPath.localeCompare(b.parallelDocsPath));
}

function markdownAbsForMergedPair(
  repoRoot: string,
  pair: { sourcePath: string; parallelDocsPath: string },
  fallback?: BuildParallelDocsNavSearchFallback,
): string {
  if (
    fallback !== undefined &&
    pair.parallelDocsPath === fallback.parallelDocsPath &&
    pair.sourcePath === fallback.sourcePath
  ) {
    return fallback.markdownAbs;
  }
  return resolvePathUnderRepoRoot(repoRoot, pair.parallelDocsPath);
}

async function appendPairRowsSync(
  rows: ParallelDocsNavSearchRow[],
  sourcePath: string,
  parallelDocsPath: string,
  markdownAbs: string,
): Promise<void> {
  rows.push({ kind: "sourcePath", sourcePath, parallelDocsPath });
  rows.push({ kind: "parallelDocsPath", sourcePath, parallelDocsPath });
  try {
    const md = await readFile(markdownAbs, "utf8");
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      rows.push({
        kind: "parallelDocsLine",
        sourcePath,
        parallelDocsPath,
        line: i,
        text: lines[i],
      });
    }
  } catch {
    /* keep path rows when the companion file is missing */
  }
}

/**
 * Builds a JSON-serialisable search corpus: **filenames / paths** plus **parallel-docs Markdown lines**
 * for each indexed pair. Primary source file contents are intentionally omitted.
 *
 * `documentedPairs` lists every merged pair. When `githubBlobBase` is set, GitHub-style **blob**
 * URLs are included for optional outbound links; the static-site build always adds same-site
 * `staticBrowseUrl` when it emits `_site/browse/` (mirrored `…/index.html` paths; see `@parallel-docs/core`).
 *
 * Pairs are merged from the metadata index, a walk of the configured storage `source` tree for
 * every `*.md` companion (flat or Angles layout), and an optional single-page `fallback`. For the
 * same `parallelDocsPath`, the index wins over disk-inferred paths.
 */
export async function buildParallelDocsNavSearchDocument(
  repoRoot: string,
  fallback?: BuildParallelDocsNavSearchFallback,
  githubBlobBase?: BuildParallelDocsNavSearchGithubBlobBase,
  storageDir = ".parallel-docs",
): Promise<ParallelDocsNavSearchDocument> {
  const rows: ParallelDocsNavSearchRow[] = [];
  const idx = await readIndex(repoRoot);
  const indexPairs =
    idx !== null && Object.keys(idx.byParallelDocsPath).length > 0
      ? Object.entries(idx.byParallelDocsPath).map(([crPath, e]) => ({
          parallelDocsPath: crPath,
          sourcePath: e.sourcePath,
        }))
      : [];

  const diskPairs = await discoverParallelDocsPairsOnDisk(repoRoot, storageDir);
  const mergedRaw = mergeNavSearchPairs(indexPairs, diskPairs, fallback);
  const merged: typeof mergedRaw = [];
  for (const p of mergedRaw) {
    if (await parallelDocsPairSourceFileExistsOnDisk(repoRoot, p.sourcePath)) merged.push(p);
  }

  if (merged.length === 0) {
    return { schemaVersion: PARALLEL_DOCS_NAV_SEARCH_SCHEMA_VERSION, rows };
  }

  for (const p of merged) {
    await appendPairRowsSync(
      rows,
      p.sourcePath,
      p.parallelDocsPath,
      markdownAbsForMergedPair(repoRoot, p, fallback),
    );
  }

  const documentedPairs = buildDocumentedPairs(merged, githubBlobBase);

  return {
    schemaVersion: PARALLEL_DOCS_NAV_SEARCH_SCHEMA_VERSION,
    rows,
    documentedPairs,
  };
}

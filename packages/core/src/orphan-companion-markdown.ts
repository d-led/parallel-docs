import { rm, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { parallelDocsAnglesLayoutEnabled, normalizeRepoRelativePath } from "./paths.js";
import {
  parallelDocsPairSourceFileExistsOnDisk,
  pairFromParallelDocsSourceRel,
} from "./parallel-docs-disk-pairs.js";
import { collectMdRelPathsUnderSourceAbs } from "./walk-parallel-docs-source-md.js";

export type OrphanCompanionMarkdownTarget = {
  /** Repo-relative companion path (POSIX, e.g. `.parallel-docs/source/docs/plan/plan.md/main.md`). */
  parallelDocsPath: string;
  /** Inferred primary source path the companion belongs to (missing as a regular file). */
  sourcePath: string;
  /** Absolute path to remove: a single `.md` file (flat) or an Angles directory under `source/`. */
  absCleanupPath: string;
  /** When true, `pruneOrphanCompanionMarkdown` removes a directory tree; otherwise one file. */
  cleanupIsDirectory: boolean;
};

/**
 * Absolute path under `{storage}/source/` to remove so this companion no longer appears in discovery.
 * Flat: the lone `*.md` file. Angles: the per-source directory (parent of `*.md` angle files).
 */
export function orphanCompanionCleanupAbsPath(
  repoRoot: string,
  storageDirNorm: string,
  relFromSourceDir: string,
  anglesOn: boolean,
): string {
  const sourceAbs = path.join(repoRoot, ...storageDirNorm.split("/"), "source");
  if (!anglesOn) {
    return path.join(sourceAbs, ...relFromSourceDir.split("/"));
  }
  const parent = path.posix.dirname(relFromSourceDir);
  if (parent === "." || parent === "") {
    return path.join(sourceAbs, ...relFromSourceDir.split("/"));
  }
  return path.join(sourceAbs, ...parent.split("/"));
}

/**
 * Lists companion Markdown trees/files under `{storage}/source/` whose inferred primary source file
 * is missing from the repo (same rule as static nav / discover).
 */
export async function collectOrphanCompanionMarkdownTargets(
  repoRoot: string,
  storageDir = ".parallel-docs",
): Promise<OrphanCompanionMarkdownTarget[]> {
  const storageNorm = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const sourceAbs = path.join(repoRoot, ...storageNorm.split("/"), "source");
  let rels: string[];
  try {
    rels = await collectMdRelPathsUnderSourceAbs(sourceAbs);
  } catch {
    return [];
  }
  const anglesOn = parallelDocsAnglesLayoutEnabled(repoRoot, storageDir);
  const byCleanupAbs = new Map<string, OrphanCompanionMarkdownTarget>();

  for (const rel of rels) {
    const pair = pairFromParallelDocsSourceRel(storageNorm, rel, anglesOn);
    if (!pair) continue;
    if (await parallelDocsPairSourceFileExistsOnDisk(repoRoot, pair.sourcePath)) continue;

    const absCleanupPath = orphanCompanionCleanupAbsPath(repoRoot, storageNorm, rel, anglesOn);
    let cleanupIsDirectory: boolean;
    try {
      const st = await stat(absCleanupPath);
      cleanupIsDirectory = st.isDirectory();
    } catch {
      continue;
    }

    const key = absCleanupPath;
    if (byCleanupAbs.has(key)) continue;
    byCleanupAbs.set(key, {
      parallelDocsPath: pair.parallelDocsPath,
      sourcePath: pair.sourcePath,
      absCleanupPath,
      cleanupIsDirectory,
    });
  }

  return [...byCleanupAbs.values()].sort((a, b) =>
    a.parallelDocsPath.localeCompare(b.parallelDocsPath),
  );
}

export type PruneOrphanCompanionMarkdownResult = {
  /** Repo-relative POSIX paths that were removed (files) or directories (shown as trailing `/` optional — use absolute in log). */
  removedAbsPaths: string[];
};

/**
 * Deletes orphan companion storage discovered by {@link collectOrphanCompanionMarkdownTargets}.
 * Only removes paths previously identified as orphan cleanup targets (under `{storage}/source/`).
 */
export async function pruneOrphanCompanionMarkdown(
  repoRoot: string,
  storageDir = ".parallel-docs",
  options?: { dryRun?: boolean },
): Promise<PruneOrphanCompanionMarkdownResult> {
  const targets = await collectOrphanCompanionMarkdownTargets(repoRoot, storageDir);
  const removedAbsPaths: string[] = [];
  const dryRun = options?.dryRun === true;
  const storageNorm = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const sourceAbs = path.join(repoRoot, ...storageNorm.split("/"), "source");

  for (const t of targets) {
    if (!t.absCleanupPath.startsWith(sourceAbs)) continue;
    if (dryRun) {
      removedAbsPaths.push(t.absCleanupPath);
      continue;
    }
    if (t.cleanupIsDirectory) {
      await rm(t.absCleanupPath, { recursive: true, maxRetries: 2, retryDelay: 50 });
    } else {
      await unlink(t.absCleanupPath);
    }
    removedAbsPaths.push(t.absCleanupPath);
  }
  return { removedAbsPaths };
}

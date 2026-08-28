import fs from "node:fs/promises";
import path from "node:path";

import { assertValidAngleId } from "./angles.js";
import type { SideTrackIndex, SourceFileIndexEntry } from "./model.js";
import {
  sidetrackAnglesLayoutEnabled,
  sidetrackMarkdownPathForAngle,
  normalizeRepoRelativePath,
} from "./paths.js";
import { collectMdRelPathsUnderSourceAbs } from "./walk-sidetrack-source-md.js";

export type FlatCompanionEntry = {
  /** Repo-relative path, e.g. `.sidetrack/source/README.md.md`. */
  flatSideTrackPath: string;
  /** Repo-relative primary source path, e.g. `README.md`. */
  sourcePath: string;
};

export type AnglesMigrationMove = {
  fromRepoRel: string;
  toRepoRel: string;
  sourcePath: string;
};

export type AnglesMigrationPlan = {
  moves: AnglesMigrationMove[];
  /** Old flat companion path → new angle Markdown path (repo-relative). */
  flatToAnglePath: Map<string, string>;
};

/**
 * Lists every flat-layout companion Markdown file under `{storage}/source/`.
 * Returns an empty list when Angles layout is already enabled (sentinel present).
 */
export async function discoverFlatCompanionMarkdownFiles(
  repoRoot: string,
  storageDir = ".sidetrack",
): Promise<FlatCompanionEntry[]> {
  if (sidetrackAnglesLayoutEnabled(repoRoot, storageDir)) {
    return [];
  }
  const storageNorm = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const sourceAbs = path.join(repoRoot, ...storageNorm.split("/"), "source");
  let stat;
  try {
    stat = await fs.stat(sourceAbs);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const rels = await collectMdRelPathsUnderSourceAbs(sourceAbs);
  const out: FlatCompanionEntry[] = [];
  for (const rel of rels) {
    if (rel === ".default" || rel.startsWith(".default/")) continue;
    if (!rel.endsWith(".md")) continue;
    const sourcePath = flatRelToSourcePath(rel);
    const flatSideTrackPath = path.posix.join(storageNorm, "source", rel);
    out.push({ flatSideTrackPath, sourcePath });
  }
  out.sort((a, b) => a.flatSideTrackPath.localeCompare(b.flatSideTrackPath));
  return out;
}

/** `rel` is relative to `{storage}/source/` using `/` separators. */
export function flatRelToSourcePath(relFromSourceDir: string): string {
  if (!relFromSourceDir.endsWith(".md")) {
    throw new Error(`Expected *.md under source, got: ${relFromSourceDir}`);
  }
  return relFromSourceDir.slice(0, Math.max(0, relFromSourceDir.length - 3));
}

export function planAnglesMigrationFromCompanions(
  companions: FlatCompanionEntry[],
  angleId: string,
  storageDir: string,
): AnglesMigrationPlan {
  const id = assertValidAngleId(angleId);
  const moves: AnglesMigrationMove[] = [];
  const flatToAnglePath = new Map<string, string>();
  for (const c of companions) {
    const toRepoRel = sidetrackMarkdownPathForAngle(c.sourcePath, id, storageDir);
    if (c.flatSideTrackPath === toRepoRel) continue;
    moves.push({
      fromRepoRel: c.flatSideTrackPath,
      toRepoRel: toRepoRel,
      sourcePath: c.sourcePath,
    });
    flatToAnglePath.set(c.flatSideTrackPath, toRepoRel);
  }
  return { moves, flatToAnglePath };
}

export function rewriteIndexKeysForAnglesMigration(
  index: SideTrackIndex,
  flatToAnglePath: Map<string, string>,
): SideTrackIndex {
  const next: Record<string, SourceFileIndexEntry> = {};
  for (const [k, entry] of Object.entries(index.bySideTrackPath)) {
    const newKey = flatToAnglePath.get(k) ?? k;
    next[newKey] = { ...entry, sidetrackPath: newKey };
  }
  return { ...index, bySideTrackPath: next };
}

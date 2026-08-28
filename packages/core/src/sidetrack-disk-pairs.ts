import { stat } from "node:fs/promises";
import path from "node:path";

import {
  sidetrackAnglesLayoutEnabled,
  normalizeRepoRelativePath,
  resolvePathUnderRepoRoot,
} from "./paths.js";
import { collectMdRelPathsUnderSourceAbs } from "./walk-sidetrack-source-md.js";

export type DiskSideTrackPair = {
  sourcePath: string;
  sidetrackPath: string;
};

/**
 * True when `sourcePath` resolves to a regular file under `repoRoot`.
 * Used so nav / browse never advertise pairs whose companion exists but the primary source is missing
 * (otherwise static browse emits URLs with no backing HTML).
 */
export async function sidetrackPairSourceFileExistsOnDisk(
  repoRoot: string,
  sourcePath: string,
): Promise<boolean> {
  const rel = sourcePath.trim();
  if (rel.length === 0) return false;
  try {
    const st = await stat(resolvePathUnderRepoRoot(repoRoot, rel));
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * Maps a Markdown path relative to `{storage}/source/` to `(sourcePath, sidetrackPath)` using
 * the same flat vs Angles rules as the rest of SideTrack.
 */
export function pairFromSideTrackSourceRel(
  storageDirNorm: string,
  relFromSourceDir: string,
  anglesOn: boolean,
): DiskSideTrackPair | null {
  const norm = relFromSourceDir.replaceAll("\\", "/");
  if (!norm.endsWith(".md") || norm === ".default" || norm.startsWith(".default/")) return null;
  const crPath = path.posix.join(storageDirNorm, "source", norm);
  if (!anglesOn) {
    return { sourcePath: norm.slice(0, Math.max(0, norm.length - 3)), sidetrackPath: crPath };
  }
  const dir = path.posix.dirname(norm);
  const base = path.posix.basename(norm);
  const stem = base.slice(0, Math.max(0, base.length - 3));
  const angleStemValid = /^[a-zA-Z0-9_-]{1,64}$/.test(stem);
  if (dir !== "." && dir !== "" && angleStemValid) {
    return { sourcePath: dir, sidetrackPath: crPath };
  }
  return { sourcePath: norm.slice(0, Math.max(0, norm.length - 3)), sidetrackPath: crPath };
}

/**
 * Lists every `*.md` under `{storage}/source/` as source ↔ sidetrack path pairs (flat or Angles).
 */
export async function discoverSideTrackPairsOnDisk(
  repoRoot: string,
  storageDir = ".sidetrack",
): Promise<DiskSideTrackPair[]> {
  const storageNorm = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const sourceAbs = path.join(repoRoot, ...storageNorm.split("/"), "source");
  const anglesOn = sidetrackAnglesLayoutEnabled(repoRoot, storageDir);
  let rels: string[];
  try {
    rels = await collectMdRelPathsUnderSourceAbs(sourceAbs);
  } catch {
    return [];
  }
  const out: DiskSideTrackPair[] = [];
  const seen = new Set<string>();
  for (const rel of rels) {
    const pair = pairFromSideTrackSourceRel(storageNorm, rel, anglesOn);
    if (!pair || seen.has(pair.sidetrackPath)) continue;
    if (!(await sidetrackPairSourceFileExistsOnDisk(repoRoot, pair.sourcePath))) continue;
    seen.add(pair.sidetrackPath);
    out.push(pair);
  }
  out.sort((a, b) => a.sidetrackPath.localeCompare(b.sidetrackPath));
  return out;
}

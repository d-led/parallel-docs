import fs from "node:fs";
import path from "node:path";

import { assertValidAngleId } from "./angles.js";
import { normalizeRepoRelativePath } from "./repo-relative-path.js";

export { normalizeRepoRelativePath } from "./repo-relative-path.js";

/**
 * Resolve `repoRelative` under `repoRootAbs` after {@link normalizeRepoRelativePath} validation,
 * then assert the absolute path cannot escape `repoRootAbs` (defense in depth for index or
 * nav-derived paths, not only hand-edited config).
 */
export function resolvePathUnderRepoRoot(repoRootAbs: string, repoRelative: string): string {
  const rel = normalizeRepoRelativePath(repoRelative);
  const root = path.resolve(repoRootAbs);
  const resolved = path.resolve(root, rel);
  const back = path.relative(root, resolved);
  if (back.startsWith("..") || path.isAbsolute(back)) {
    throw new Error(`Resolved path leaves repository root: ${repoRelative}`);
  }
  return resolved;
}

/** SideTrack Markdown path for a repo-relative source file (implicit default angle, flat layout). */
export function sidetrackMarkdownPath(
  sourceRepoRelativePath: string,
  storageDir = ".sidetrack",
): string {
  const normalized = normalizeRepoRelativePath(sourceRepoRelativePath);
  const root = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  return path.posix.join(root, "source", `${normalized}.md`);
}

/**
 * Repo-relative path to the **Angles sentinel**: if this path exists as a file or directory under
 * the storage root, the repository opts into per-source **Angles** layout (see `docs/spec/storage.md`).
 * When absent, the flat `{storage}/source/{P}.md` layout is the only supported shape.
 */
export function sidetrackAnglesSentinelPath(storageDir = ".sidetrack"): string {
  const root = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  return path.posix.join(root, "source", ".default");
}

/**
 * Returns true when the repository opts into **Angles** layout: `{storage}/source/.default` exists
 * (file or directory). When false, only the flat `{storage}/source/{P}.md` mapping applies.
 */
export function sidetrackAnglesLayoutEnabled(repoRoot: string, storageDir = ".sidetrack"): boolean {
  const sentinel = sidetrackAnglesSentinelPath(storageDir);
  const absolute = path.join(repoRoot, ...sentinel.split("/"));
  return fs.existsSync(absolute);
}

/**
 * Repo-relative path to sidetrack for `sourceRepoRelativePath` at a named **Angle** (multi-angle layout).
 * Example: `README.md` + `architecture` → `.sidetrack/source/README.md/architecture.md` (with default storage dir).
 */
export function sidetrackMarkdownPathForAngle(
  sourceRepoRelativePath: string,
  angleId: string,
  storageDir = ".sidetrack",
): string {
  const normalized = normalizeRepoRelativePath(sourceRepoRelativePath);
  const sid = assertValidAngleId(angleId);
  const root = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  return path.posix.join(root, "source", normalized, `${sid}.md`);
}

/** Default metadata index location (repo-relative). */
export function defaultMetadataIndexPath(): string {
  return path.posix.join(".sidetrack", "metadata", "index.json");
}

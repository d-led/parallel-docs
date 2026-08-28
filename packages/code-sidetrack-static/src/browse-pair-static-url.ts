import path from "node:path";

import {
  type SideTrackStaticBrowsePairPaths,
  staticBrowseIndexRelPathFromPair,
} from "@sidetrack/core";

/** Normalise repo-relative paths for browse alias and URL construction. */
export function normPosixPath(s: string): string {
  return s.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/**
 * Relative `href` from `_site/browse/<alias>/index.html` to another file under `_site/browse/`.
 * The `from` path must be the alias **directory** (`path.posix.dirname(join("browse", aliasRelPath))`),
 * not `join("browse", aliasRelPath)` as a faux file — otherwise `../../target.html` resolves
 * from `/browse/docs/manual.md` (no trailing slash) to `/target.html` and static hosts 404.
 *
 * @param targetRelPathFromBrowseDir — path under `browse/` (e.g. `src/x.ts/index.html` or
 *   `README.md/main/index.html`), no leading `browse/`.
 */
export function canonicalHumaneBrowseRedirectHref(
  aliasRelPath: string,
  targetRelPathFromBrowseDir: string,
): string {
  const rel = path.posix.relative(
    path.posix.dirname(path.posix.join("browse", aliasRelPath)),
    path.posix.join("browse", targetRelPathFromBrowseDir),
  );
  if (rel.length > 0) return rel;
  return path.posix.basename(targetRelPathFromBrowseDir) === "index.html"
    ? "./index.html"
    : `./${path.posix.basename(targetRelPathFromBrowseDir)}`;
}

/**
 * Hub-relative URL for opening a pair in the static code browser: mirrors
 * `{storageDir}/source/…` under `./browse/…/index.html` (see {@link staticBrowseIndexRelPathFromPair}).
 */
export function browsePairStaticBrowseRelUrl(
  pair: SideTrackStaticBrowsePairPaths,
  storageDir: string,
): string {
  return `./browse/${staticBrowseIndexRelPathFromPair(pair, storageDir)}`;
}

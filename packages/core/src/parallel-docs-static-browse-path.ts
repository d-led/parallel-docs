import type { ParallelDocsStaticBrowsePairPaths } from "./browse-contract.js";
import { normalizeRepoRelativePath } from "./repo-relative-path.js";

/** POSIX `dirname` for repo-relative paths (no `node:path`; safe for browser bundles). */
function posixDirname(p: string): string {
  const s = p.replaceAll("\\", "/").replace(/\/+$/, "");
  if (s === "") return ".";
  const i = s.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  const d = s.slice(0, i);
  return d === "" ? "." : d;
}

/** POSIX `basename` for repo-relative paths (no `node:path`; safe for browser bundles). */
function posixBasename(p: string): string {
  const s = p.replaceAll("\\", "/").replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  return i < 0 ? s : s.slice(i + 1);
}

/**
 * Encodes a repo-relative source file path as URL path segments (dot-leading → `%2E…`), matching
 * static host rules for “hidden” filenames.
 */
function encodedSourcePathToBrowseSegments(sourcePath: string): string {
  const norm = normalizeRepoRelativePath(sourcePath.replaceAll("\\", "/"));
  return norm
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      seg.startsWith(".") ? `%2E${encodeURIComponent(seg.slice(1))}` : encodeURIComponent(seg),
    )
    .join("/");
}

/**
 * Maps a path relative to `{storage}/source/` to the directory layout under `_site/browse/`.
 * Example: `README.md/main.md` → `README.md/main/index.html`.
 */
function browseIndexRelFromSourceRel(rel: string): string {
  const dir = posixDirname(rel);
  const base = posixBasename(rel);
  if (!/\.md$/i.test(base)) {
    return "pair/index.html";
  }
  const stem = base.replace(/\.md$/i, "");
  if (dir === "." || dir === "") {
    return `${stem}/index.html`;
  }
  return `${dir}/${stem}/index.html`;
}

/**
 * Repo-relative path to the static pair page under `_site/browse/` (POSIX, ends with
 * `index.html`). Mirrors the companion’s path under `{storage}/source/`: the same relative
 * structure as on disk (e.g. `.parallel-docs/source/.parallel-docs.toml/main.md` →
 * `browse/.parallel-docs.toml/main/index.html`).
 */
export function staticBrowseIndexRelPathFromPair(
  pair: ParallelDocsStaticBrowsePairPaths,
  storageDir: string,
): string {
  const norm = normalizeRepoRelativePath(pair.parallelDocsPath.replaceAll("\\", "/"));
  const store = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const prefix = `${store}/source/`;
  if (norm.toLowerCase().endsWith(".md") && norm.startsWith(prefix)) {
    return browseIndexRelFromSourceRel(norm.slice(prefix.length));
  }
  const enc = encodedSourcePathToBrowseSegments(pair.sourcePath);
  return enc.length > 0 ? `${enc}/index.html` : "pair/index.html";
}

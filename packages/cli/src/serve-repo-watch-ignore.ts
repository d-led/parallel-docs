import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ignore from "ignore";

/**
 * Paths always skipped by `parallel-docs serve` watching, even if missing from `.gitignore`
 * (avoids rebuild feedback from `_site/` output, dependencies, and git metadata).
 */
export const SERVE_WATCH_ALWAYS_IGNORE_LINES = [
  "_site/",
  "_site/**",
  ".git/",
  ".git/**",
  "node_modules/",
  "node_modules/**",
].join("\n");

/** POSIX path relative to `repoRoot`, or `""` for the root itself, or `null` if outside the repo. */
export function repoRelativePosix(repoRoot: string, absPath: string): string | null {
  const root = path.resolve(repoRoot);
  const abs = path.isAbsolute(absPath) ? path.resolve(absPath) : path.resolve(root, absPath);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return rel.split(path.sep).join("/");
}

export type ServeRepoWatchIgnoreOptions = {
  /**
   * Repo-relative POSIX directory from `[storage].dir` in `.parallel-docs.toml` (same normalization as
   * `loadParallelDocsConfig`). Paths under this directory are **never** ignored by serve watching so
   * companion edits always rebuild, even if a parent path is gitignored by mistake. If an entire
   * ancestor directory is ignored and chokidar never descends into it, add a `!` negation in
   * `.gitignore`; this option only affects the ignore predicate for paths the watcher already sees.
   */
  storageDirRepoRelative?: string;
};

/**
 * Builds the `ignored` predicate for `chokidar.watch(repoRoot, …)` so everything under the repo is
 * watched except paths ignored by Git (root `.gitignore`, `.git/info/exclude`, and nested
 * `.gitignore` files on ancestor directories). Always ignores `.git/`; always skips `_site/` and
 * `node_modules/` (see {@link SERVE_WATCH_ALWAYS_IGNORE_LINES}). Configured `[storage].dir` is never
 * ignored when passed via {@link ServeRepoWatchIgnoreOptions.storageDirRepoRelative}.
 */
export function createServeRepoWatchIgnored(
  repoRoot: string,
  opts: ServeRepoWatchIgnoreOptions = {},
): (rawPath: string) => boolean {
  const root = path.resolve(repoRoot);
  const storageDir = opts.storageDirRepoRelative?.trim() ?? "";
  const rootIg = ignore();

  rootIg.add(SERVE_WATCH_ALWAYS_IGNORE_LINES);

  const rootGitignore = path.join(root, ".gitignore");
  if (existsSync(rootGitignore)) {
    rootIg.add(readFileSync(rootGitignore, "utf8"));
  }
  const exclude = path.join(root, ".git", "info", "exclude");
  if (existsSync(exclude)) {
    rootIg.add(readFileSync(exclude, "utf8"));
  }

  const nestedCache = new Map<string, ReturnType<typeof ignore>>();

  function nestedGitignoresRel(relPosix: string): boolean {
    let parent = path.posix.dirname(relPosix);
    while (parent !== ".") {
      const nestedFile = path.join(root, parent, ".gitignore");
      if (existsSync(nestedFile)) {
        let nestedIg = nestedCache.get(parent);
        if (nestedIg === undefined) {
          nestedIg = ignore().add(readFileSync(nestedFile, "utf8"));
          nestedCache.set(parent, nestedIg);
        }
        const fragment = path.posix.relative(parent, relPosix);
        if (fragment !== "" && nestedIg.ignores(fragment)) {
          return true;
        }
      }
      parent = path.posix.dirname(parent);
    }
    return false;
  }

  return (rawPath: string): boolean => {
    const rel = repoRelativePosix(root, rawPath);
    if (rel === null) return true;
    if (rel === "" || rel === ".") return false;
    if (rel === ".git" || rel.startsWith(".git/")) return true;

    if (storageDir !== "" && (rel === storageDir || rel.startsWith(`${storageDir}/`))) {
      return false;
    }

    if (rootIg.ignores(rel)) return true;

    return nestedGitignoresRel(rel);
  };
}

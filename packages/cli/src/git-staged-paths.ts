import { spawnSync } from "node:child_process";

import { normalizeRepoRelativePath } from "@parallel-docs/core";

/**
 * Lists repo-relative paths of staged files (Git index), POSIX-normalized.
 * Returns `undefined` when `git` fails (not a checkout, or error).
 */
export function readGitStagedRepoRelativePaths(repoRoot: string): string[] | undefined {
  const r = spawnSync(
    "git",
    ["-C", repoRoot, "diff", "--cached", "--name-only", "--diff-filter=ACMRT"],
    { encoding: "utf8" },
  );
  if (r.error || r.status !== 0) return undefined;
  const raw = r.stdout.trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => normalizeRepoRelativePath(line.trim().replaceAll("\\", "/")))
    .filter((p) => p.length > 0);
}

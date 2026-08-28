import path from "node:path";

import { pathExists } from "@parallel-docs/core";

/**
 * How a project root was located. `config` means a `.parallel-docs.toml` was
 * found; `git` means a `.git` directory; `cwd` means no marker was found
 * and the starting directory itself is used (useful for first-time `init`).
 */
export type ProjectRootSource = "config" | "git" | "cwd";

export type ProjectRoot = {
  dir: string;
  source: ProjectRootSource;
};

async function walkUpFor(startDir: string, marker: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  for (;;) {
    if (await pathExists(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Locate a ParallelDocs project root from `startDir`, in priority order:
 *
 *   1. Nearest ancestor containing `.parallel-docs.toml` (the declarative marker).
 *   2. Nearest ancestor containing a `.git` directory (natural project boundary).
 *   3. `startDir` itself — so `parallel-docs init` can bootstrap a fresh directory.
 *
 * Never throws: callers decide whether the resolved source is acceptable for
 * their command (e.g. `init scm` insists on a git checkout).
 */
export async function findProjectRoot(startDir: string): Promise<ProjectRoot> {
  const configRoot = await walkUpFor(startDir, ".parallel-docs.toml");
  if (configRoot) return { dir: configRoot, source: "config" };

  const gitRoot = await walkUpFor(startDir, ".git");
  if (gitRoot) return { dir: gitRoot, source: "git" };

  return { dir: path.resolve(startDir), source: "cwd" };
}

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Walk up from `cwd` looking for a Commentray project root.
 * Checks for `.commentray.toml` first, then `.git` as fallback.
 * Returns `cwd` if nothing found.
 */
export async function repoRootFrom(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  for (;;) {
    try {
      await fs.access(path.join(current, ".commentray.toml"));
      return current;
    } catch {
      // not found
    }
    try {
      await fs.access(path.join(current, ".git"));
      return current;
    } catch {
      // not found
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(cwd);
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Starting directory for locating the monorepo `packages/` folder: typically
 * `dirname(import.meta.url)` in normal ESM, or `dirname(process.argv[1])` when
 * `import.meta.url` is missing (e.g. code bundled into the sidetrack CLI's single
 * CJS file, where esbuild emits empty `import.meta` shims for nested packages).
 */
export function monorepoLayoutStartDir(importMetaUrl: string | undefined): string {
  if (importMetaUrl !== undefined && importMetaUrl !== null) {
    const s = String(importMetaUrl).trim();
    if (s.length > 0) {
      return path.dirname(fileURLToPath(s));
    }
  }
  const arg = process.argv[1];
  if (!arg) {
    throw new Error(
      "Cannot resolve monorepo layout: import.meta.url is missing and process.argv[1] is empty.",
    );
  }
  return path.dirname(path.resolve(arg));
}

/**
 * Absolute path to the monorepo `packages/` directory (contains `render/`,
 * `core/`, `cli/`, etc.). Walks upward from `layoutStartDir` until both
 * `render/package.json` and `core/package.json` exist as siblings.
 */
export function findMonorepoPackagesDir(layoutStartDir: string): string {
  let dir = path.resolve(layoutStartDir);
  for (let i = 0; i < 20; i++) {
    const renderPkg = path.join(dir, "render", "package.json");
    const corePkg = path.join(dir, "core", "package.json");
    if (fs.existsSync(renderPkg) && fs.existsSync(corePkg)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `Could not find SideTrack monorepo packages/ (expected .../packages/render/package.json) starting from ${layoutStartDir}`,
  );
}

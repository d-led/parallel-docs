import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findMonorepoPackagesDir, monorepoLayoutStartDir } from "@parallel-docs/core";

/**
 * Reads `version` from this package’s `package.json` (works for both `src/` and `dist/` layouts).
 */
export function parallelDocsRenderVersion(): string {
  const packagesDir = findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url));
  const packageDir = join(packagesDir, "render");
  const raw = readFileSync(join(packageDir, "package.json"), "utf8");
  const j = JSON.parse(raw) as { version?: string };
  return j.version ?? "0.0.0";
}

import { createHash } from "node:crypto";

/**
 * Legacy hash stem (28-char base64url) from `sourcePath` + `parallelDocsPath`.
 * Static Pages browse HTML now uses human-readable paths under `_site/browse/`; this helper
 * remains for tests and any tooling that still keys off the old filename shape.
 */
export function browsePageSlugFromPair(pair: {
  sourcePath: string;
  parallelDocsPath: string;
}): string {
  return createHash("sha256")
    .update(`${pair.parallelDocsPath}\0${pair.sourcePath}`, "utf8")
    .digest("base64url")
    .slice(0, 28);
}

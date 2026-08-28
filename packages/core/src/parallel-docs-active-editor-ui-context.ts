import { pairFromParallelDocsSourceRel } from "./parallel-docs-disk-pairs.js";
import { parallelDocsAnglesLayoutEnabled, normalizeRepoRelativePath } from "./paths.js";

/** `{storageDir}/source/` as used for repo-relative path checks (matches extension + `resolvePairedPaths`). */
export function parallelDocsStorageSourcePrefix(storageDir: string): string {
  const sd = storageDir.replaceAll("\\", "/");
  return `${sd}/source/`;
}

export type ParallelDocsActiveEditorUiFlags = {
  /** Active path is under `{storageDir}/source/`. */
  underCompanionSourceTree: boolean;
  /** Companion `.md` path maps to a primary source path (flat or Angles). */
  isResolvableCompanionMarkdown: boolean;
};

/**
 * Pure rules for VS Code `when` / `enablement`: which ParallelDocs commands fit the active workspace file.
 *
 * @param normalizedRepoRelativePath — repo-relative path with `/` separators (e.g. from `normalizeRepoRelativePath`).
 */
export function parallelDocsActiveEditorUiFlags(input: {
  normalizedRepoRelativePath: string;
  storageDir: string;
  repoRoot: string;
  staticSiteParallelDocsMarkdownFile?: string;
}): ParallelDocsActiveEditorUiFlags {
  const normalized = normalizeRepoRelativePath(
    input.normalizedRepoRelativePath.replaceAll("\\", "/"),
  );
  const configuredStaticCompanion = input.staticSiteParallelDocsMarkdownFile
    ? normalizeRepoRelativePath(input.staticSiteParallelDocsMarkdownFile.replaceAll("\\", "/"))
    : "";
  const sourcePrefix = parallelDocsStorageSourcePrefix(input.storageDir);
  if (!normalized.startsWith(sourcePrefix)) {
    if (
      configuredStaticCompanion.length > 0 &&
      normalized === configuredStaticCompanion &&
      normalized.endsWith(".md")
    ) {
      return { underCompanionSourceTree: true, isResolvableCompanionMarkdown: true };
    }
    return { underCompanionSourceTree: false, isResolvableCompanionMarkdown: false };
  }
  const relFromSourceDir = normalized.slice(sourcePrefix.length);
  const storageNorm = normalizeRepoRelativePath(input.storageDir.replaceAll("\\", "/"));
  const anglesOn = parallelDocsAnglesLayoutEnabled(input.repoRoot, input.storageDir);
  const pair = pairFromParallelDocsSourceRel(storageNorm, relFromSourceDir, anglesOn);
  return {
    underCompanionSourceTree: true,
    isResolvableCompanionMarkdown: Boolean(pair),
  };
}

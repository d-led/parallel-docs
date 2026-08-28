import { pairFromSideTrackSourceRel } from "./sidetrack-disk-pairs.js";
import { sidetrackAnglesLayoutEnabled, normalizeRepoRelativePath } from "./paths.js";

/** `{storageDir}/source/` as used for repo-relative path checks (matches extension + `resolvePairedPaths`). */
export function sidetrackStorageSourcePrefix(storageDir: string): string {
  const sd = storageDir.replaceAll("\\", "/");
  return `${sd}/source/`;
}

export type SideTrackActiveEditorUiFlags = {
  /** Active path is under `{storageDir}/source/`. */
  underCompanionSourceTree: boolean;
  /** Companion `.md` path maps to a primary source path (flat or Angles). */
  isResolvableCompanionMarkdown: boolean;
};

/**
 * Pure rules for VS Code `when` / `enablement`: which SideTrack commands fit the active workspace file.
 *
 * @param normalizedRepoRelativePath — repo-relative path with `/` separators (e.g. from `normalizeRepoRelativePath`).
 */
export function sidetrackActiveEditorUiFlags(input: {
  normalizedRepoRelativePath: string;
  storageDir: string;
  repoRoot: string;
  staticSiteSideTrackMarkdownFile?: string;
}): SideTrackActiveEditorUiFlags {
  const normalized = normalizeRepoRelativePath(
    input.normalizedRepoRelativePath.replaceAll("\\", "/"),
  );
  const configuredStaticCompanion = input.staticSiteSideTrackMarkdownFile
    ? normalizeRepoRelativePath(input.staticSiteSideTrackMarkdownFile.replaceAll("\\", "/"))
    : "";
  const sourcePrefix = sidetrackStorageSourcePrefix(input.storageDir);
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
  const anglesOn = sidetrackAnglesLayoutEnabled(input.repoRoot, input.storageDir);
  const pair = pairFromSideTrackSourceRel(storageNorm, relFromSourceDir, anglesOn);
  return {
    underCompanionSourceTree: true,
    isResolvableCompanionMarkdown: Boolean(pair),
  };
}

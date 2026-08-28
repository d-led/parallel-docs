import type { ResolvedParallelDocsConfig } from "./config.js";
import { assertValidAngleId } from "./angles.js";
import {
  parallelDocsAnglesLayoutEnabled,
  parallelDocsMarkdownPath,
  parallelDocsMarkdownPathForAngle,
} from "./paths.js";

/**
 * When Angles layout is on and the user has not configured a default, tools pick this id so a
 * concrete file path exists (`…/main.md`). Authors may rename via `[angles]` in `.parallel-docs.toml`.
 */
export const FALLBACK_DEFAULT_ANGLE_ID = "main" as const;

export function defaultAngleIdForOpen(config: ResolvedParallelDocsConfig): string {
  if (config.angles.defaultAngleId) return config.angles.defaultAngleId;
  const first = config.angles.definitions[0];
  if (first) return first.id;
  return FALLBACK_DEFAULT_ANGLE_ID;
}

export type ResolvedParallelDocsMarkdownPath = {
  /** Repo-relative path to the paired `.md` file. */
  parallelDocsPath: string;
  /** Present when `{storage}/source/.default` exists (Angles layout). */
  angleId: string | null;
  anglesLayout: boolean;
};

/**
 * Resolves the parallel-docs Markdown path for a primary source file, honoring Angles layout and
 * optional explicit `angleId` (when Angles layout is active).
 */
export function resolveParallelDocsMarkdownPath(
  repoRoot: string,
  sourceRepoRelativePath: string,
  config: ResolvedParallelDocsConfig,
  angleId?: string | null,
): ResolvedParallelDocsMarkdownPath {
  const anglesLayout = parallelDocsAnglesLayoutEnabled(repoRoot, config.storageDir);
  if (!anglesLayout) {
    return {
      parallelDocsPath: parallelDocsMarkdownPath(sourceRepoRelativePath, config.storageDir),
      angleId: null,
      anglesLayout: false,
    };
  }
  const id =
    angleId !== undefined && angleId !== null && String(angleId).trim() !== ""
      ? assertValidAngleId(String(angleId))
      : defaultAngleIdForOpen(config);
  return {
    parallelDocsPath: parallelDocsMarkdownPathForAngle(
      sourceRepoRelativePath,
      id,
      config.storageDir,
    ),
    angleId: id,
    anglesLayout: true,
  };
}

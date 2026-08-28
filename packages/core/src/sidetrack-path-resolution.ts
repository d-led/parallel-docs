import type { ResolvedSideTrackConfig } from "./config.js";
import { assertValidAngleId } from "./angles.js";
import {
  sidetrackAnglesLayoutEnabled,
  sidetrackMarkdownPath,
  sidetrackMarkdownPathForAngle,
} from "./paths.js";

/**
 * When Angles layout is on and the user has not configured a default, tools pick this id so a
 * concrete file path exists (`…/main.md`). Authors may rename via `[angles]` in `.sidetrack.toml`.
 */
export const FALLBACK_DEFAULT_ANGLE_ID = "main" as const;

export function defaultAngleIdForOpen(config: ResolvedSideTrackConfig): string {
  if (config.angles.defaultAngleId) return config.angles.defaultAngleId;
  const first = config.angles.definitions[0];
  if (first) return first.id;
  return FALLBACK_DEFAULT_ANGLE_ID;
}

export type ResolvedSideTrackMarkdownPath = {
  /** Repo-relative path to the paired `.md` file. */
  sidetrackPath: string;
  /** Present when `{storage}/source/.default` exists (Angles layout). */
  angleId: string | null;
  anglesLayout: boolean;
};

/**
 * Resolves the sidetrack Markdown path for a primary source file, honoring Angles layout and
 * optional explicit `angleId` (when Angles layout is active).
 */
export function resolveSideTrackMarkdownPath(
  repoRoot: string,
  sourceRepoRelativePath: string,
  config: ResolvedSideTrackConfig,
  angleId?: string | null,
): ResolvedSideTrackMarkdownPath {
  const anglesLayout = sidetrackAnglesLayoutEnabled(repoRoot, config.storageDir);
  if (!anglesLayout) {
    return {
      sidetrackPath: sidetrackMarkdownPath(sourceRepoRelativePath, config.storageDir),
      angleId: null,
      anglesLayout: false,
    };
  }
  const id =
    angleId !== undefined && angleId !== null && String(angleId).trim() !== ""
      ? assertValidAngleId(String(angleId))
      : defaultAngleIdForOpen(config);
  return {
    sidetrackPath: sidetrackMarkdownPathForAngle(sourceRepoRelativePath, id, config.storageDir),
    angleId: id,
    anglesLayout: true,
  };
}

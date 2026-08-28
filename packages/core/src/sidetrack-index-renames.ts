import { assertValidAngleId } from "./angles.js";
import type { ResolvedSideTrackConfig } from "./config.js";
import type { SideTrackIndex, SourceFileIndexEntry } from "./model.js";
import type { ScmPathRename } from "./scm/scm-provider.js";
import {
  sidetrackAnglesLayoutEnabled,
  sidetrackMarkdownPath,
  sidetrackMarkdownPathForAngle,
  normalizeRepoRelativePath,
} from "./paths.js";

export type { ScmPathRename as PathRename } from "./scm/scm-provider.js";

function applyExactPathRenames(
  repoRelativePath: string,
  renames: readonly ScmPathRename[],
): string {
  let p = normalizeRepoRelativePath(repoRelativePath);
  for (const { from, to } of renames) {
    if (p === from) p = to;
  }
  return p;
}

/**
 * When Angles layout is active, returns the angle id segment from a sidetrack path under
 * `{storage}/source/<sourcePath>/<angle>.md`, or null if the path does not match that shape.
 */
export function inferAngleIdFromSideTrackPath(
  sidetrackPath: string,
  sourcePath: string,
  storageDir: string,
): string | null {
  const sd = normalizeRepoRelativePath(storageDir.replaceAll("\\", "/"));
  const src = normalizeRepoRelativePath(sourcePath);
  const prefix = `${sd}/source/${src}/`;
  if (!sidetrackPath.startsWith(prefix)) return null;
  const rest = sidetrackPath.slice(prefix.length);
  if (!rest.endsWith(".md")) return null;
  const id = rest.slice(0, -".md".length);
  return id.length > 0 ? id : null;
}

/**
 * Applies Git-style **full-path** renames to `index.json` entries:
 * - exact renames on `sourcePath` and `sidetrackPath` (string equality),
 * - when `sourcePath` changes, recomputes `sidetrackPath` from layout rules so companion paths stay paired.
 *
 * Renames should be sorted longest-`from` first by the caller; this function sorts defensively.
 */
export function applyPathRenamesToSideTrackIndex(
  index: SideTrackIndex,
  renames: readonly ScmPathRename[],
  repoRoot: string,
  config: ResolvedSideTrackConfig,
): { index: SideTrackIndex; changed: boolean } {
  const sorted = [...renames]
    .map((r) => ({
      from: normalizeRepoRelativePath(r.from),
      to: normalizeRepoRelativePath(r.to),
    }))
    .filter((r) => r.from !== r.to)
    .sort((a, b) => b.from.length - a.from.length);

  if (sorted.length === 0) return { index, changed: false };

  const anglesLayout = sidetrackAnglesLayoutEnabled(repoRoot, config.storageDir);
  const next: Record<string, SourceFileIndexEntry> = {};
  let changed = false;

  for (const [, entry] of Object.entries(index.bySideTrackPath)) {
    const sp = applyExactPathRenames(entry.sourcePath, sorted);
    let cp = applyExactPathRenames(entry.sidetrackPath, sorted);

    if (sp !== entry.sourcePath) {
      if (anglesLayout) {
        const angleId = inferAngleIdFromSideTrackPath(
          entry.sidetrackPath,
          entry.sourcePath,
          config.storageDir,
        );
        if (angleId) {
          try {
            cp = sidetrackMarkdownPathForAngle(sp, assertValidAngleId(angleId), config.storageDir);
          } catch {
            /* keep cp from exact renames if angle segment is not a valid id */
          }
        }
      } else {
        cp = sidetrackMarkdownPath(sp, config.storageDir);
      }
    }

    const newEntry: SourceFileIndexEntry = {
      ...entry,
      sourcePath: sp,
      sidetrackPath: cp,
    };

    if (sp !== entry.sourcePath || cp !== entry.sidetrackPath) {
      changed = true;
    }

    if (next[cp]) {
      throw new Error(
        `After applying renames, two index entries map to the same sidetrackPath "${cp}" ` +
          `(merge or fix renames before retrying).`,
      );
    }
    next[cp] = newEntry;
  }

  return {
    index: { schemaVersion: index.schemaVersion, bySideTrackPath: next },
    changed,
  };
}

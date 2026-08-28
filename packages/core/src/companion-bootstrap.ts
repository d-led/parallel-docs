import fs from "node:fs/promises";
import path from "node:path";

import { loadSideTrackConfig } from "./config.js";
import { emptyIndex } from "./metadata.js";
import type { SourceFileIndexEntry } from "./model.js";
import { resolveSideTrackMarkdownPath } from "./sidetrack-path-resolution.js";
import { normalizeRepoRelativePath } from "./paths.js";
import { readIndex, writeIndex } from "./validate-project.js";

export type EnsureCompanionForSourceOptions = {
  angleId?: string | null;
  initialMarkdown?: string;
  sidetrackPath?: string;
};

export type EnsureCompanionForSourceResult = {
  sourcePath: string;
  sidetrackPath: string;
  createdMarkdown: boolean;
  createdIndexEntry: boolean;
};

export function companionPlaceholderMarkdown(sourcePath?: string): string {
  const normalized = sourcePath?.trim();
  if (!normalized) return "# SideTrack\n\n";
  return `# ${normalized}\n\nWrite documentation for ${normalized} here.\n`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function ensureEntryMatchesSource(entry: SourceFileIndexEntry, sourcePath: string): void {
  const existing = normalizeRepoRelativePath(entry.sourcePath);
  const requested = normalizeRepoRelativePath(sourcePath);
  if (existing !== requested) {
    throw new Error(
      `sidetrack path ${entry.sidetrackPath} is already indexed for ${entry.sourcePath}, not ${sourcePath}`,
    );
  }
}

export async function ensureCompanionForSource(
  repoRoot: string,
  sourcePath: string,
  opts: EnsureCompanionForSourceOptions = {},
): Promise<EnsureCompanionForSourceResult> {
  const cfg = await loadSideTrackConfig(repoRoot);
  const normalizedSourcePath = normalizeRepoRelativePath(sourcePath.replaceAll("\\", "/"));
  const explicitSideTrackPath = opts.sidetrackPath?.trim();
  const sidetrackPath =
    explicitSideTrackPath && explicitSideTrackPath.length > 0
      ? normalizeRepoRelativePath(explicitSideTrackPath.replaceAll("\\", "/"))
      : resolveSideTrackMarkdownPath(repoRoot, normalizedSourcePath, cfg, opts.angleId ?? undefined)
          .sidetrackPath;
  const mdAbs = path.resolve(repoRoot, sidetrackPath);

  let createdMarkdown = false;
  if (!(await pathExists(mdAbs))) {
    await fs.mkdir(path.dirname(mdAbs), { recursive: true });
    await fs.writeFile(
      mdAbs,
      opts.initialMarkdown ?? companionPlaceholderMarkdown(normalizedSourcePath),
      "utf8",
    );
    createdMarkdown = true;
  }

  let index = (await readIndex(repoRoot)) ?? emptyIndex();
  const existing = index.bySideTrackPath[sidetrackPath];
  let createdIndexEntry = false;
  if (!existing) {
    index = {
      ...index,
      bySideTrackPath: {
        ...index.bySideTrackPath,
        [sidetrackPath]: {
          sourcePath: normalizedSourcePath,
          sidetrackPath,
          blocks: [],
        },
      },
    };
    await writeIndex(repoRoot, index);
    createdIndexEntry = true;
  } else {
    ensureEntryMatchesSource(existing, normalizedSourcePath);
  }

  return {
    sourcePath: normalizedSourcePath,
    sidetrackPath,
    createdMarkdown,
    createdIndexEntry,
  };
}

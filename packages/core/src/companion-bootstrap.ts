import fs from "node:fs/promises";
import path from "node:path";

import { loadParallelDocsConfig } from "./config.js";
import { emptyIndex } from "./metadata.js";
import type { SourceFileIndexEntry } from "./model.js";
import { resolveParallelDocsMarkdownPath } from "./parallel-docs-path-resolution.js";
import { normalizeRepoRelativePath } from "./paths.js";
import { readIndex, writeIndex } from "./validate-project.js";

export type EnsureCompanionForSourceOptions = {
  angleId?: string | null;
  initialMarkdown?: string;
  parallelDocsPath?: string;
};

export type EnsureCompanionForSourceResult = {
  sourcePath: string;
  parallelDocsPath: string;
  createdMarkdown: boolean;
  createdIndexEntry: boolean;
};

export function companionPlaceholderMarkdown(sourcePath?: string): string {
  const normalized = sourcePath?.trim();
  if (!normalized) return "# ParallelDocs\n\n";
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
      `parallel-docs path ${entry.parallelDocsPath} is already indexed for ${entry.sourcePath}, not ${sourcePath}`,
    );
  }
}

export async function ensureCompanionForSource(
  repoRoot: string,
  sourcePath: string,
  opts: EnsureCompanionForSourceOptions = {},
): Promise<EnsureCompanionForSourceResult> {
  const cfg = await loadParallelDocsConfig(repoRoot);
  const normalizedSourcePath = normalizeRepoRelativePath(sourcePath.replaceAll("\\", "/"));
  const explicitParallelDocsPath = opts.parallelDocsPath?.trim();
  const parallelDocsPath =
    explicitParallelDocsPath && explicitParallelDocsPath.length > 0
      ? normalizeRepoRelativePath(explicitParallelDocsPath.replaceAll("\\", "/"))
      : resolveParallelDocsMarkdownPath(
          repoRoot,
          normalizedSourcePath,
          cfg,
          opts.angleId ?? undefined,
        ).parallelDocsPath;
  const mdAbs = path.resolve(repoRoot, parallelDocsPath);

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
  const existing = index.byParallelDocsPath[parallelDocsPath];
  let createdIndexEntry = false;
  if (!existing) {
    index = {
      ...index,
      byParallelDocsPath: {
        ...index.byParallelDocsPath,
        [parallelDocsPath]: {
          sourcePath: normalizedSourcePath,
          parallelDocsPath,
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
    parallelDocsPath,
    createdMarkdown,
    createdIndexEntry,
  };
}

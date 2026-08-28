import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  type ParallelDocsIndex,
  type ResolvedParallelDocsConfig,
  type ResolvedStaticSite,
  parallelDocsAnglesLayoutEnabled,
  parallelDocsMarkdownPathForAngle,
  defaultAngleIdForOpen,
  githubRepoBlobFileUrl,
  parseGithubRepoWebUrl,
  resolveParallelDocsMarkdownPath,
} from "@parallel-docs/core";
import {
  type CodeBrowserMultiAngleBrowsing,
  type CodeBrowserMultiAngleSpec,
} from "@parallel-docs/render";

import { browsePairStaticBrowseRelUrl } from "./browse-pair-static-url.js";
import type { BuildParallelDocsStaticOptions } from "./build.js";
import {
  composeParallelDocsMarkdown,
  emptyParallelDocsMarkdown,
  pathExists,
} from "./github-pages-site-shared.js";

export type GithubNavBase = { owner: string; repo: string; branch: string };

export function resolveGithubNavBase(ss: ResolvedStaticSite): GithubNavBase | null {
  const ghWeb = ss.githubUrl ? parseGithubRepoWebUrl(ss.githubUrl) : null;
  if (!ghWeb) return null;
  return { owner: ghWeb.owner, repo: ghWeb.repo, branch: ss.githubBlobBranch || "main" };
}

async function multiAngleSpecForDefinition(
  repoRoot: string,
  cfg: ResolvedParallelDocsConfig,
  ss: ResolvedStaticSite,
  projectIndex: ParallelDocsIndex | null,
  ghNavBase: GithubNavBase | null,
  def: NonNullable<ResolvedParallelDocsConfig["angles"]>["definitions"][number],
): Promise<CodeBrowserMultiAngleSpec | undefined> {
  const rel = parallelDocsMarkdownPathForAngle(ss.sourceFile, def.id, cfg.storageDir);
  const abs = path.join(repoRoot, rel);
  if (!(await pathExists(abs))) return undefined;
  const rawFile = await readFile(abs, "utf8");
  const composed = composeParallelDocsMarkdown(ss.introMarkdown, rawFile);
  let angleBlockStretch: CodeBrowserMultiAngleSpec["blockStretchRows"];
  if (projectIndex) {
    const entry = projectIndex.byParallelDocsPath[rel];
    if (
      (entry && entry.blocks.length > 0 && entry.sourcePath === ss.sourceFile) ||
      entry === undefined
    ) {
      angleBlockStretch = {
        index: projectIndex,
        sourceRelative: ss.sourceFile,
        parallelDocsPathRel: rel,
      };
    }
  }
  const parallelDocsOnGithubUrl =
    ghNavBase !== null
      ? githubRepoBlobFileUrl(ghNavBase.owner, ghNavBase.repo, ghNavBase.branch, rel)
      : undefined;
  return {
    id: def.id,
    title: def.title,
    markdown: composed,
    parallelDocsPathRel: rel,
    parallelDocsOnGithubUrl,
    ...(angleBlockStretch ? { blockStretchRows: angleBlockStretch } : {}),
  };
}

export async function loadMultiAngleBrowsingIfEnabled(
  repoRoot: string,
  cfg: ResolvedParallelDocsConfig,
  ss: ResolvedStaticSite,
  projectIndex: ParallelDocsIndex | null,
  ghNavBase: GithubNavBase | null,
): Promise<CodeBrowserMultiAngleBrowsing | undefined> {
  const anglesOn = parallelDocsAnglesLayoutEnabled(repoRoot, cfg.storageDir);
  const angleDefs = cfg.angles?.definitions ?? [];
  if (!anglesOn || angleDefs.length < 2) return undefined;

  const angles: CodeBrowserMultiAngleSpec[] = [];
  for (const def of angleDefs) {
    const spec = await multiAngleSpecForDefinition(repoRoot, cfg, ss, projectIndex, ghNavBase, def);
    if (spec !== undefined) angles.push(spec);
  }
  if (angles.length < 2) return undefined;
  for (const a of angles) {
    a.staticBrowseUrl = browsePairStaticBrowseRelUrl(
      { sourcePath: ss.sourceFile, parallelDocsPath: a.parallelDocsPathRel },
      cfg.storageDir,
    );
  }
  return { defaultAngleId: defaultAngleIdForOpen(cfg), angles };
}

export async function readFlatCompanionMarkdown(
  repoRoot: string,
  cfg: ResolvedParallelDocsConfig,
  ss: ResolvedStaticSite,
): Promise<string> {
  const configuredRel = ss.parallelDocsMarkdownFile?.trim();
  const fallbackRel = resolveParallelDocsMarkdownPath(
    repoRoot,
    ss.sourceFile,
    cfg,
  ).parallelDocsPath;
  const candidates =
    configuredRel && configuredRel.length > 0
      ? [configuredRel]
      : [fallbackRel].filter((p): p is string => typeof p === "string" && p.length > 0);

  for (const rel of candidates) {
    const mdAbs = path.join(repoRoot, rel);
    try {
      const st = await stat(mdAbs);
      if (!st.isFile()) continue;
      return await readFile(mdAbs, "utf8");
    } catch {
      continue;
    }
  }

  // Missing companion markdown is a valid state for onboarding; caller will render empty-state UI.
  return "";
}

export function pickParallelDocsBody(
  multi: CodeBrowserMultiAngleBrowsing | undefined,
  intro: string,
  fileMarkdown: string,
): string {
  if (multi) {
    return (
      (multi.angles.find((a) => a.id === multi.defaultAngleId) ?? multi.angles[0])?.markdown ??
      emptyParallelDocsMarkdown()
    );
  }
  return composeParallelDocsMarkdown(intro, fileMarkdown);
}

export function pickDefaultParallelDocsRel(
  multi: CodeBrowserMultiAngleBrowsing | undefined,
  parallelDocsMarkdownFile: string,
): string {
  if (multi) {
    return (
      (multi.angles.find((a) => a.id === multi.defaultAngleId) ?? multi.angles[0])
        ?.parallelDocsPathRel ?? ""
    );
  }
  return parallelDocsMarkdownFile ?? "";
}

/**
 * Resolves index-backed block scroll wiring for one documented source ↔ parallel-docs path.
 * Used for static per-pair browse pages (and the flat hub when multi-angle is off).
 */
export function blockStretchRowsForDocumentedPair(
  projectIndex: ParallelDocsIndex | null,
  sourcePath: string,
  parallelDocsPathRel: string,
): BuildParallelDocsStaticOptions["blockStretchRows"] {
  const rel = parallelDocsPathRel.trim();
  if (!projectIndex || rel.length === 0) return undefined;
  const entry = projectIndex.byParallelDocsPath[rel];
  if (!entry || entry.blocks.length === 0 || entry.sourcePath !== sourcePath) return undefined;
  return {
    index: projectIndex,
    sourceRelative: entry.sourcePath,
    parallelDocsPathRel: rel,
  };
}

export function flatBlockStretchRows(
  projectIndex: ParallelDocsIndex | null,
  ss: ResolvedStaticSite,
  hasMultiAngle: boolean,
): BuildParallelDocsStaticOptions["blockStretchRows"] {
  const sourceLower = ss.sourceFile.trim().toLowerCase();
  const sourceIsMarkdown =
    sourceLower.endsWith(".md") ||
    sourceLower.endsWith(".mdx") ||
    sourceLower.endsWith(".markdown");
  if (hasMultiAngle || !ss.parallelDocsMarkdownFile || sourceIsMarkdown) return undefined;
  return blockStretchRowsForDocumentedPair(
    projectIndex,
    ss.sourceFile,
    ss.parallelDocsMarkdownFile,
  );
}

export function sourceAndParallelDocsGithubUrls(
  ghNavBase: GithubNavBase | null,
  ss: ResolvedStaticSite,
  defaultParallelDocsRel: string,
): { sourceOnGithubUrl?: string; parallelDocsOnGithubUrl?: string; documentedNavJsonUrl?: string } {
  const nav: {
    sourceOnGithubUrl?: string;
    parallelDocsOnGithubUrl?: string;
    documentedNavJsonUrl?: string;
  } = {
    documentedNavJsonUrl: "./parallel-docs-nav-search.json",
  };
  if (ghNavBase === null) {
    return nav;
  }
  const sourceOnGithubUrl = githubRepoBlobFileUrl(
    ghNavBase.owner,
    ghNavBase.repo,
    ghNavBase.branch,
    ss.sourceFile,
  );
  const parallelDocsOnGithubUrl = defaultParallelDocsRel
    ? githubRepoBlobFileUrl(
        ghNavBase.owner,
        ghNavBase.repo,
        ghNavBase.branch,
        defaultParallelDocsRel,
      )
    : undefined;
  return {
    ...nav,
    sourceOnGithubUrl,
    ...(parallelDocsOnGithubUrl ? { parallelDocsOnGithubUrl } : {}),
  };
}

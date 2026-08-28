import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  type SideTrackIndex,
  type ResolvedSideTrackConfig,
  type ResolvedStaticSite,
  sidetrackAnglesLayoutEnabled,
  sidetrackMarkdownPathForAngle,
  defaultAngleIdForOpen,
  githubRepoBlobFileUrl,
  parseGithubRepoWebUrl,
  resolveSideTrackMarkdownPath,
} from "@sidetrack/core";
import {
  type CodeBrowserMultiAngleBrowsing,
  type CodeBrowserMultiAngleSpec,
} from "@sidetrack/render";

import { browsePairStaticBrowseRelUrl } from "./browse-pair-static-url.js";
import type { BuildSideTrackStaticOptions } from "./build.js";
import {
  composeSideTrackMarkdown,
  emptySideTrackMarkdown,
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
  cfg: ResolvedSideTrackConfig,
  ss: ResolvedStaticSite,
  projectIndex: SideTrackIndex | null,
  ghNavBase: GithubNavBase | null,
  def: NonNullable<ResolvedSideTrackConfig["angles"]>["definitions"][number],
): Promise<CodeBrowserMultiAngleSpec | undefined> {
  const rel = sidetrackMarkdownPathForAngle(ss.sourceFile, def.id, cfg.storageDir);
  const abs = path.join(repoRoot, rel);
  if (!(await pathExists(abs))) return undefined;
  const rawFile = await readFile(abs, "utf8");
  const composed = composeSideTrackMarkdown(ss.introMarkdown, rawFile);
  let angleBlockStretch: CodeBrowserMultiAngleSpec["blockStretchRows"];
  if (projectIndex) {
    const entry = projectIndex.bySideTrackPath[rel];
    if (
      (entry && entry.blocks.length > 0 && entry.sourcePath === ss.sourceFile) ||
      entry === undefined
    ) {
      angleBlockStretch = {
        index: projectIndex,
        sourceRelative: ss.sourceFile,
        sidetrackPathRel: rel,
      };
    }
  }
  const sidetrackOnGithubUrl =
    ghNavBase !== null
      ? githubRepoBlobFileUrl(ghNavBase.owner, ghNavBase.repo, ghNavBase.branch, rel)
      : undefined;
  return {
    id: def.id,
    title: def.title,
    markdown: composed,
    sidetrackPathRel: rel,
    sidetrackOnGithubUrl,
    ...(angleBlockStretch ? { blockStretchRows: angleBlockStretch } : {}),
  };
}

export async function loadMultiAngleBrowsingIfEnabled(
  repoRoot: string,
  cfg: ResolvedSideTrackConfig,
  ss: ResolvedStaticSite,
  projectIndex: SideTrackIndex | null,
  ghNavBase: GithubNavBase | null,
): Promise<CodeBrowserMultiAngleBrowsing | undefined> {
  const anglesOn = sidetrackAnglesLayoutEnabled(repoRoot, cfg.storageDir);
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
      { sourcePath: ss.sourceFile, sidetrackPath: a.sidetrackPathRel },
      cfg.storageDir,
    );
  }
  return { defaultAngleId: defaultAngleIdForOpen(cfg), angles };
}

export async function readFlatCompanionMarkdown(
  repoRoot: string,
  cfg: ResolvedSideTrackConfig,
  ss: ResolvedStaticSite,
): Promise<string> {
  const configuredRel = ss.sidetrackMarkdownFile?.trim();
  const fallbackRel = resolveSideTrackMarkdownPath(repoRoot, ss.sourceFile, cfg).sidetrackPath;
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

export function pickSideTrackBody(
  multi: CodeBrowserMultiAngleBrowsing | undefined,
  intro: string,
  fileMarkdown: string,
): string {
  if (multi) {
    return (
      (multi.angles.find((a) => a.id === multi.defaultAngleId) ?? multi.angles[0])?.markdown ??
      emptySideTrackMarkdown()
    );
  }
  return composeSideTrackMarkdown(intro, fileMarkdown);
}

export function pickDefaultSideTrackRel(
  multi: CodeBrowserMultiAngleBrowsing | undefined,
  sidetrackMarkdownFile: string,
): string {
  if (multi) {
    return (
      (multi.angles.find((a) => a.id === multi.defaultAngleId) ?? multi.angles[0])
        ?.sidetrackPathRel ?? ""
    );
  }
  return sidetrackMarkdownFile ?? "";
}

/**
 * Resolves index-backed block scroll wiring for one documented source ↔ sidetrack path.
 * Used for static per-pair browse pages (and the flat hub when multi-angle is off).
 */
export function blockStretchRowsForDocumentedPair(
  projectIndex: SideTrackIndex | null,
  sourcePath: string,
  sidetrackPathRel: string,
): BuildSideTrackStaticOptions["blockStretchRows"] {
  const rel = sidetrackPathRel.trim();
  if (!projectIndex || rel.length === 0) return undefined;
  const entry = projectIndex.bySideTrackPath[rel];
  if (!entry || entry.blocks.length === 0 || entry.sourcePath !== sourcePath) return undefined;
  return {
    index: projectIndex,
    sourceRelative: entry.sourcePath,
    sidetrackPathRel: rel,
  };
}

export function flatBlockStretchRows(
  projectIndex: SideTrackIndex | null,
  ss: ResolvedStaticSite,
  hasMultiAngle: boolean,
): BuildSideTrackStaticOptions["blockStretchRows"] {
  const sourceLower = ss.sourceFile.trim().toLowerCase();
  const sourceIsMarkdown =
    sourceLower.endsWith(".md") ||
    sourceLower.endsWith(".mdx") ||
    sourceLower.endsWith(".markdown");
  if (hasMultiAngle || !ss.sidetrackMarkdownFile || sourceIsMarkdown) return undefined;
  return blockStretchRowsForDocumentedPair(projectIndex, ss.sourceFile, ss.sidetrackMarkdownFile);
}

export function sourceAndSideTrackGithubUrls(
  ghNavBase: GithubNavBase | null,
  ss: ResolvedStaticSite,
  defaultSideTrackRel: string,
): { sourceOnGithubUrl?: string; sidetrackOnGithubUrl?: string; documentedNavJsonUrl?: string } {
  const nav: {
    sourceOnGithubUrl?: string;
    sidetrackOnGithubUrl?: string;
    documentedNavJsonUrl?: string;
  } = {
    documentedNavJsonUrl: "./sidetrack-nav-search.json",
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
  const sidetrackOnGithubUrl = defaultSideTrackRel
    ? githubRepoBlobFileUrl(ghNavBase.owner, ghNavBase.repo, ghNavBase.branch, defaultSideTrackRel)
    : undefined;
  return {
    ...nav,
    sourceOnGithubUrl,
    ...(sidetrackOnGithubUrl ? { sidetrackOnGithubUrl } : {}),
  };
}

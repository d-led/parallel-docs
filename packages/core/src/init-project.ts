import fs from "node:fs/promises";
import path from "node:path";

import { loadParallelDocsConfig } from "./config.js";
import { emptyIndex } from "./metadata.js";
import { parallelDocsAnglesSentinelPath, defaultMetadataIndexPath } from "./paths.js";
import {
  refreshIndexMigrationsOnDisk,
  validateProject,
  writeIndex,
  type ValidationIssue,
} from "./validate-project.js";

export const DEFAULT_PARALLEL_DOCS_TOML = [
  "# ParallelDocs configuration (defaults are commented)",
  "",
  "[storage]",
  "# Repo-relative. Must not live inside .git/ (Git treats that directory as",
  "# opaque metadata and routine operations can wipe it).",
  '# dir = ".parallel-docs"',
  "",
  "[scm]",
  '# provider = "git"',
  "",
  "[render]",
  "# mermaid = true",
  '# mermaid_runtime_path = "vendor/mermaid.min.js"',
  '# syntaxTheme = "github-dark"',
  "# When true, GitHub blob/tree links for static_site.github_url rewrite to paths",
  "# relative to generated HTML (Pages, `parallel-docs render`). Needs a repo home URL.",
  "# relative_github_blob_links = false",
  "# Local images: `/repo/path` = repo root; `./x` or `sub/x` = next to the parallel-docs `.md`",
  "# (see docs/spec/storage.md — Images; vocabulary — ParallelDocs vs parallel-docs).",
  "",
  "[anchors]",
  "# defaultStrategy = [",
  '#   "symbol",',
  '#   "lines",',
  "# ]",
  "",
  "# Named **Angles** — multiple parallel-docss per source (Introduction, Architecture, …).",
  "# Optional UI list + default selection. On disk, multi-angle layout is enabled only when",
  "# `{storage.dir}/source/.default` exists (file or dir); see docs/spec/storage.md.",
  "# [angles]",
  '# default_angle = "introduction"',
  "# [[angles.definitions]]",
  '# id = "introduction"',
  '# title = "Introduction"',
  "# [[angles.definitions]]",
  '# id = "architecture"',
  '# title = "Architecture"',
  "",
  "# GitHub Pages static browser (optional). `related_github_files` adds toolbar links",
  "# to other repo paths on github.com (single index.html cannot serve every file).",
  "# [static_site]",
  '# title = "My project"',
  '# github_url = "https://github.com/you/repo"',
  '# github_blob_branch = "main"',
  '# source_file = "README.md"',
  '# parallel_docs_markdown = ".parallel-docs/source/README.md/main.md"',
  "# [[static_site.related_github_files]]",
  '# path = "CONTRIBUTING.md"',
  "",
].join("\n");

export type InitializeParallelDocsProjectOptions = {
  ensureSiteGitignore?: boolean;
  runValidation?: boolean;
};

export type InitializeParallelDocsProjectResult = {
  createdIndex: boolean;
  migratedIndex: boolean;
  createdToml: boolean;
  addedSiteGitignore: boolean;
  validationIssues: ValidationIssue[];
};

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureSiteIgnoredInGitignore(repoRoot: string): Promise<boolean> {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  let raw = "";
  try {
    raw = await fs.readFile(gitignorePath, "utf8");
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }

  const normalized = raw.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n").map((line) => line.trim());
  if (lines.includes("_site") || lines.includes("_site/")) return false;

  const needsLeadingBreak = normalized.length > 0 && !normalized.endsWith("\n");
  const next = `${normalized}${needsLeadingBreak ? "\n" : ""}_site\n`;
  await fs.writeFile(gitignorePath, next, "utf8");
  return true;
}

export async function initializeParallelDocsProject(
  repoRoot: string,
  opts: InitializeParallelDocsProjectOptions = {},
): Promise<InitializeParallelDocsProjectResult> {
  const cfg = await loadParallelDocsConfig(repoRoot);
  const storage = path.join(repoRoot, cfg.storageDir);
  await fs.mkdir(path.join(storage, "source"), { recursive: true });
  await fs.mkdir(path.join(storage, "metadata"), { recursive: true });
  const anglesSentinel = path.join(repoRoot, parallelDocsAnglesSentinelPath(cfg.storageDir));
  if (!(await pathExists(anglesSentinel))) {
    await fs.writeFile(anglesSentinel, "", "utf8");
  }

  const indexPath = path.join(repoRoot, defaultMetadataIndexPath());
  const createdIndex = !(await pathExists(indexPath));
  if (createdIndex) {
    await writeIndex(repoRoot, emptyIndex());
  }

  const migration = await refreshIndexMigrationsOnDisk(repoRoot);

  const tomlPath = path.join(repoRoot, ".parallel-docs.toml");
  let createdToml = false;
  try {
    await fs.stat(tomlPath);
  } catch {
    await fs.writeFile(tomlPath, DEFAULT_PARALLEL_DOCS_TOML, "utf8");
    createdToml = true;
  }

  const addedSiteGitignore =
    opts.ensureSiteGitignore === false ? false : await ensureSiteIgnoredInGitignore(repoRoot);

  const validationIssues =
    opts.runValidation === false ? [] : (await validateProject(repoRoot)).issues;

  return {
    createdIndex,
    migratedIndex: migration.changed,
    createdToml,
    addedSiteGitignore,
    validationIssues,
  };
}

export async function isParallelDocsProjectInitialized(repoRoot: string): Promise<boolean> {
  const tomlPath = path.join(repoRoot, ".parallel-docs.toml");
  if (!(await pathExists(tomlPath))) return false;

  const cfg = await loadParallelDocsConfig(repoRoot);
  const storageAbs = path.resolve(repoRoot, cfg.storageDir);
  const sourceAbs = path.join(storageAbs, "source");
  const metadataAbs = path.join(storageAbs, "metadata");
  const indexAbs = path.join(repoRoot, defaultMetadataIndexPath());

  return (
    (await pathExists(sourceAbs)) && (await pathExists(metadataAbs)) && (await pathExists(indexAbs))
  );
}

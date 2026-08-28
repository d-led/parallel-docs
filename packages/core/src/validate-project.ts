import fs from "node:fs/promises";
import path from "node:path";
import { type ResolvedSideTrackConfig, loadSideTrackConfig } from "./config.js";
import { parseGithubRepoWebUrl } from "./github-url.js";
import { normalizeSideTrackIndex } from "./index-normalize.js";
import { assertValidIndex } from "./metadata.js";
import { migrateIndex } from "./migrate.js";
import { coerceIndexSchemaVersion, CURRENT_SCHEMA_VERSION, type SideTrackIndex } from "./model.js";
import { defaultMetadataIndexPath, normalizeRepoRelativePath } from "./paths.js";
import {
  extractSideTrackBlockIdsInMarkdownOrder,
  extractSideTrackBlockIdsFromMarkdown,
  validateIndexMarkerSemantics,
  validateMarkerBoundariesInSource,
  validateMarkerRegionsAgainstIndexedSources,
} from "./marker-validation.js";
import { loadGitTrackedSourceTextsOutsideIndex } from "./git-relocation-scan.js";
import { relocationHintMessages } from "./relocation-hints.js";
import { collectOrphanCompanionMarkdownTargets } from "./orphan-companion-markdown.js";
import { GitScmProvider } from "./scm/git-scm-provider.js";

export type ValidationIssue = { level: "error" | "warn"; message: string };

export type ValidationResult = {
  issues: ValidationIssue[];
};

export type ValidateProjectOptions = {
  /**
   * When non-empty, only validate `index.json` entries whose primary or companion path matches one
   * of these repo-relative paths (after {@link normalizeRepoRelativePath}), unless the staged set
   * includes `.sidetrack/metadata/index.json` or `.sidetrack.toml` (then the full index is used).
   */
  stagedRepoRelativePaths?: readonly string[];
};

function stagedPathsSet(paths: readonly string[]): Set<string> {
  return new Set(paths.map((p) => normalizeRepoRelativePath(p)));
}

function stagedScopeNeedsFullIndexValidation(staged: ReadonlySet<string>): boolean {
  const indexJson = normalizeRepoRelativePath(".sidetrack/metadata/index.json");
  const toml = normalizeRepoRelativePath(".sidetrack.toml");
  return staged.has(indexJson) || staged.has(toml);
}

async function loadMarkdownBlockIdsByIndexedSource(
  repoRoot: string,
  index: SideTrackIndex,
): Promise<{
  idsBySourceNorm: Map<string, Set<string>>;
  orderBySideTrackPath: Map<string, string[]>;
}> {
  const bySource = new Map<string, Set<string>>();
  const orderBySideTrackPath = new Map<string, string[]>();
  for (const [crPath, entry] of Object.entries(index.bySideTrackPath)) {
    const norm = normalizeRepoRelativePath(entry.sourcePath);
    let set = bySource.get(norm);
    if (!set) {
      set = new Set();
      bySource.set(norm, set);
    }
    const abs = path.join(repoRoot, crPath);
    try {
      const md = await fs.readFile(abs, "utf8");
      orderBySideTrackPath.set(crPath, extractSideTrackBlockIdsInMarkdownOrder(md));
      for (const id of extractSideTrackBlockIdsFromMarkdown(md)) {
        set.add(id);
      }
    } catch {
      /* missing or unreadable companion — other validation may warn */
    }
  }
  return { idsBySourceNorm: bySource, orderBySideTrackPath };
}

function indexFilteredForStaged(
  index: SideTrackIndex,
  staged: ReadonlySet<string>,
): SideTrackIndex {
  const next: SideTrackIndex["bySideTrackPath"] = {};
  for (const [crPath, entry] of Object.entries(index.bySideTrackPath)) {
    const sp = normalizeRepoRelativePath(entry.sourcePath);
    const cp = normalizeRepoRelativePath(crPath);
    if (staged.has(sp) || staged.has(cp)) {
      next[crPath] = entry;
    }
  }
  return { ...index, bySideTrackPath: next };
}

async function collectIssuesForLoadedIndex(
  repoRoot: string,
  index: SideTrackIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const issue of validateIndexMarkerSemantics(index)) {
    issues.push({ level: issue.level, message: issue.message });
  }
  const uniqueSourcesNorm = [
    ...new Set(
      Object.values(index.bySideTrackPath).map((e) => normalizeRepoRelativePath(e.sourcePath)),
    ),
  ];
  const indexedSourceTexts = new Map<string, string>();
  const missingSourcesNorm = new Set<string>();

  for (const norm of uniqueSourcesNorm) {
    const abs = path.join(repoRoot, ...norm.split("/"));
    try {
      const text = await fs.readFile(abs, "utf8");
      indexedSourceTexts.set(norm, text);
    } catch {
      missingSourcesNorm.add(norm);
      const affected = Object.values(index.bySideTrackPath)
        .filter((e) => normalizeRepoRelativePath(e.sourcePath) === norm)
        .map((e) => e.sidetrackPath);
      const uniqAffected = [...new Set(affected)].sort((a, b) => a.localeCompare(b));
      issues.push({
        level: "warn",
        message:
          `Primary source "${norm}" is not readable (deleted, moved, or not checked out). ` +
          `SideTrack: ${uniqAffected.join(", ")}. ` +
          `If Git renamed it, try: sidetrack sync-moved-paths --from HEAD~1 --to HEAD`,
      });
    }
  }

  for (const [norm, text] of indexedSourceTexts) {
    for (const issue of validateMarkerBoundariesInSource(text, norm)) {
      issues.push({ level: issue.level, message: issue.message });
    }
  }

  const markdownIndexSignals = await loadMarkdownBlockIdsByIndexedSource(repoRoot, index);
  for (const issue of validateMarkerRegionsAgainstIndexedSources(
    index,
    indexedSourceTexts,
    markdownIndexSignals.idsBySourceNorm,
    markdownIndexSignals.orderBySideTrackPath,
  )) {
    issues.push({ level: issue.level, message: issue.message });
  }

  if (missingSourcesNorm.size === 0) return issues;

  let gitRenames: { from: string; to: string }[] | undefined;
  try {
    const scm = new GitScmProvider();
    if (scm.listPathRenamesBetweenTreeishes) {
      gitRenames = await scm.listPathRenamesBetweenTreeishes(repoRoot, "HEAD~1", "HEAD");
    }
  } catch {
    /* no Git or shallow history — hints still run without renames */
  }
  let textsForRelocationHints: Map<string, string> = indexedSourceTexts;
  try {
    const extra = await loadGitTrackedSourceTextsOutsideIndex(
      repoRoot,
      new Set(indexedSourceTexts.keys()),
    );
    if (extra.size > 0) {
      textsForRelocationHints = new Map([...extra, ...indexedSourceTexts]);
    }
  } catch {
    /* not a git checkout or ls-files failed — use indexed primaries only */
  }
  for (const hint of relocationHintMessages({
    index,
    missingSourcePathsNorm: missingSourcesNorm,
    gitRenames,
    indexedSourceTextsByPath: textsForRelocationHints,
  })) {
    issues.push({ level: "warn", message: hint });
  }
  return issues;
}

async function pushMissingStorageSubdirWarnings(
  repoRoot: string,
  storageDir: string,
  issues: ValidationIssue[],
): Promise<void> {
  const storageAbs = path.join(repoRoot, storageDir);
  for (const sub of ["source", "metadata"]) {
    const p = path.join(storageAbs, sub);
    try {
      await fs.stat(p);
    } catch {
      issues.push({
        level: "warn",
        message: `Missing directory: ${path.join(storageDir, sub)}`,
      });
    }
  }
}

async function pushOrphanCompanionMarkdownIssues(
  repoRoot: string,
  storageDir: string,
  issues: ValidationIssue[],
): Promise<void> {
  try {
    const orphans = await collectOrphanCompanionMarkdownTargets(repoRoot, storageDir);
    for (const o of orphans) {
      const relCleanup = normalizeRepoRelativePath(
        path.relative(repoRoot, o.absCleanupPath).replaceAll("\\", "/"),
      );
      issues.push({
        level: "error",
        message:
          `Orphan companion Markdown: primary source "${o.sourcePath}" is not a readable file, but ` +
          `companion storage exists (${o.sidetrackPath}). Static browse and search would advertise a broken pair. ` +
          `Delete this orphan with: sidetrack doctor --allow-deletions (removes ${relCleanup})`,
      });
    }
  } catch (err) {
    issues.push({
      level: "warn",
      message: `Could not scan for orphan companion Markdown: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export async function validateProject(
  repoRoot: string,
  options?: ValidateProjectOptions,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  let config: ResolvedSideTrackConfig;
  try {
    config = await loadSideTrackConfig(repoRoot);
  } catch (err) {
    issues.push({
      level: "error",
      message: `Failed to load .sidetrack.toml: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { issues };
  }

  await pushMissingStorageSubdirWarnings(repoRoot, config.storageDir, issues);
  await pushOrphanCompanionMarkdownIssues(repoRoot, config.storageDir, issues);

  let index: SideTrackIndex | null = null;
  try {
    index = await readIndex(repoRoot);
    if (index === null) {
      issues.push({ level: "warn", message: `No metadata index at ${defaultMetadataIndexPath()}` });
    }
  } catch (err) {
    issues.push({
      level: "error",
      message: `Invalid metadata index: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  let indexForMarkers: SideTrackIndex | null = index;
  const staged = options?.stagedRepoRelativePaths;
  if (index && staged && staged.length > 0) {
    const stagedSet = stagedPathsSet(staged);
    if (!stagedScopeNeedsFullIndexValidation(stagedSet)) {
      const narrowed = indexFilteredForStaged(index, stagedSet);
      if (Object.keys(narrowed.bySideTrackPath).length === 0) {
        issues.push({
          level: "warn",
          message:
            "validate --staged: staged files do not match any indexed SideTrack pairs; skipping marker checks for index entries.",
        });
        indexForMarkers = null;
      } else {
        indexForMarkers = narrowed;
      }
    }
  }

  if (indexForMarkers) {
    issues.push(...(await collectIssuesForLoadedIndex(repoRoot, indexForMarkers)));
  }

  pushRelativeGithubLinkConfigWarnings(config, issues);

  return { issues };
}

function pushRelativeGithubLinkConfigWarnings(
  config: ResolvedSideTrackConfig,
  issues: ValidationIssue[],
): void {
  if (!config.render.relativeGithubBlobLinks) return;
  const gh = config.staticSite.githubUrl;
  if (gh && parseGithubRepoWebUrl(gh)) return;
  issues.push({
    level: "warn",
    message:
      "render.relative_github_blob_links is true but static_site.github_url is missing or " +
      "not a repository home URL (expected https://github.com/owner/repo). Link rewriting is skipped at build time.",
  });
}

/**
 * Reads `index.json`, applies schema migration and snippet/fingerprint normalization,
 * and persists when anything changed. Throws if the file is missing or not valid JSON.
 */
export async function refreshIndexMigrationsOnDisk(
  repoRoot: string,
): Promise<{ index: SideTrackIndex; changed: boolean }> {
  const indexPath = path.join(repoRoot, defaultMetadataIndexPath());
  const raw = await fs.readFile(indexPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const priorSchema =
    typeof parsed === "object" && parsed !== null
      ? coerceIndexSchemaVersion((parsed as Record<string, unknown>).schemaVersion)
      : null;
  if (typeof priorSchema === "number" && priorSchema > CURRENT_SCHEMA_VERSION) {
    const metaDir = path.dirname(indexPath);
    const backupName = `index.schema-${String(priorSchema)}-backup-${String(Date.now())}.json`;
    await fs.writeFile(path.join(metaDir, backupName), raw, "utf8");
  }
  const { index: migrated, changed: schemaChanged } = migrateIndex(parsed);
  const { index: normalized, changed: snippetChanged } = normalizeSideTrackIndex(migrated);
  const index = assertValidIndex(normalized as unknown);
  const changed = schemaChanged || snippetChanged;
  if (changed) {
    await writeIndex(repoRoot, index);
  }
  return { index, changed };
}

export async function readIndex(repoRoot: string): Promise<SideTrackIndex | null> {
  try {
    const { index } = await refreshIndexMigrationsOnDisk(repoRoot);
    return index;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Write the metadata index to the default location under `repoRoot`, creating
 * the `.sidetrack/metadata/` directory if missing. The file is written with
 * two-space indentation and a trailing newline so diffs are easy to read.
 */
export async function writeIndex(repoRoot: string, index: SideTrackIndex): Promise<void> {
  const indexPath = path.join(repoRoot, defaultMetadataIndexPath());
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  await fs.writeFile(indexPath, serialized, "utf8");
}

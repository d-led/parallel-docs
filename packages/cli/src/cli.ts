#!/usr/bin/env node
// Also runnable as `npx parallel-docs`; `--help` prints Usage: parallel-docs [options] [command].
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import cliPackage from "../package.json" with { type: "json" };
import {
  applyPathRenamesToParallelDocsIndex,
  convertParallelDocsSourceMarkersToLanguage,
  defaultMetadataIndexPath,
  GitScmProvider,
  loadParallelDocsConfig,
  refreshIndexMigrationsOnDisk,
  normalizeRepoRelativePath,
  parseGithubRepoWebUrl,
  readIndex,
  resolveParallelDocsMarkdownPath,
  resolveMermaidRuntimePath,
  runCommanderMain,
  type ValidationIssue,
  pruneOrphanCompanionMarkdown,
  validateProject,
  type ValidateProjectOptions,
  writeIndex,
} from "@parallel-docs/core";
import { renderSideBySideHtml } from "@parallel-docs/render";
import { Command } from "commander";

import { runInitConfig, runInitFull, runInitScm } from "./init.js";
import { runMigrateAnglesFromCwd } from "./migrate-angles-cmd.js";
import { findProjectRoot } from "./project-root.js";
import { resolveRenderInputs, type RenderCliOptions } from "./render-inputs.js";
import { logCliValidationIssue, logCliWarning } from "./cli-output.js";
import { runAnglesAddFromCwd } from "./angles-add-cmd.js";
import { readGitStagedRepoRelativePaths } from "./git-staged-paths.js";
import { runServeStaticPages, runPagesBuild } from "./serve.js";
import { installMcpConfigs } from "@parallel-docs/mcp-server";

async function repoRootFromCwd(): Promise<string> {
  const root = await findProjectRoot(process.cwd());
  return root.dir;
}

function summarizeValidation(issues: ValidationIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.level === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

function pluralize(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? "" : "s"}`;
}

async function cmdValidate(opts?: { staged?: boolean }): Promise<number> {
  const repoRoot = await repoRootFromCwd();
  let validateOpts: ValidateProjectOptions | undefined;
  if (opts?.staged) {
    const staged = readGitStagedRepoRelativePaths(repoRoot);
    if (staged === undefined) {
      console.error(
        "validate --staged: could not read staged paths (not a Git checkout or git failed).",
      );
      return 1;
    }
    if (staged.length === 0) {
      console.error("validate --staged: no staged changes.");
      return 1;
    }
    validateOpts = { stagedRepoRelativePaths: staged };
  }
  const result = await validateProject(repoRoot, validateOpts);
  for (const issue of result.issues) {
    logCliValidationIssue(issue);
  }
  const { errors, warnings } = summarizeValidation(result.issues);
  const summary = `validate: ${pluralize(errors, "error")}, ${pluralize(warnings, "warning")}`;
  if (errors === 0) {
    console.log(`OK ${summary}`);
    return 0;
  }
  console.error(`FAIL ${summary}`);
  return 1;
}

async function cmdDoctor(opts?: { allowDeletions?: boolean }): Promise<number> {
  const repoRoot = await repoRootFromCwd();
  if (opts?.allowDeletions) {
    const cfg = await loadParallelDocsConfig(repoRoot);
    const { removedAbsPaths } = await pruneOrphanCompanionMarkdown(repoRoot, cfg.storageDir);
    if (removedAbsPaths.length > 0) {
      console.log(
        `doctor --allow-deletions: removed ${String(removedAbsPaths.length)} orphan companion path(s).`,
      );
      for (const abs of removedAbsPaths) {
        console.log(`  - ${path.relative(repoRoot, abs).replaceAll("\\", "/")}`);
      }
    }
  }
  const code = await cmdValidate();
  const gitPath = path.join(repoRoot, ".git");
  try {
    await fs.access(gitPath);
    console.log(`OK doctor: Git checkout detected at ${gitPath}`);
  } catch {
    logCliWarning(
      `[warn] No .git at resolved project root (${repoRoot}); SCM features require a Git checkout.`,
    );
  }
  return code;
}

async function cmdConvertSourceMarkers(opts: {
  file: string;
  language: string;
  dryRun: boolean;
}): Promise<number> {
  const repoRoot = await repoRootFromCwd();
  const rel = normalizeRepoRelativePath(opts.file);
  const abs = path.join(repoRoot, ...rel.split("/"));
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error(`File not found: ${rel}`);
      return 1;
    }
    throw err;
  }
  const { sourceText, changed, convertedPairs } = convertParallelDocsSourceMarkersToLanguage(
    raw,
    opts.language,
  );
  if (!changed) {
    console.log(
      "No changes (no marker pairs, already target style, or only line-ending normalisation).",
    );
    return 0;
  }
  if (opts.dryRun) {
    console.log("Dry run: preview only (no file written). Re-run without --dry-run to apply.");
    console.log(`Would rewrite ${convertedPairs} marker pair(s) in ${rel}.`);
    return 0;
  }
  await fs.writeFile(abs, sourceText, "utf8");
  console.log(`Rewrote ${convertedPairs} marker pair(s) in ${rel}.`);
  return 0;
}

async function cmdSyncMovedPaths(opts: {
  fromRef: string;
  toRef: string;
  dryRun: boolean;
}): Promise<number> {
  const repoRoot = await repoRootFromCwd();
  const scm = new GitScmProvider();
  if (!scm.listPathRenamesBetweenTreeishes) {
    console.error("SCM provider does not support rename listing.");
    return 1;
  }
  let renames;
  try {
    renames = await scm.listPathRenamesBetweenTreeishes(repoRoot, opts.fromRef, opts.toRef);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Could not list renames (${opts.fromRef} → ${opts.toRef}): ${msg}`);
    console.error("Try explicit refs, e.g. --from abc123 --to def456 or --from HEAD~1 --to HEAD.");
    return 1;
  }
  if (renames.length === 0) {
    console.log("No Git-detected renames in that range.");
    return 0;
  }
  const cfg = await loadParallelDocsConfig(repoRoot);
  const index = await readIndex(repoRoot);
  if (index === null) {
    console.error(`No index at ${defaultMetadataIndexPath()}. Run: parallel-docs init`);
    return 1;
  }
  let next;
  try {
    next = applyPathRenamesToParallelDocsIndex(index, renames, repoRoot, cfg);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
  if (!next.changed) {
    console.log("Index paths already match those renames (nothing to update).");
    return 0;
  }
  if (opts.dryRun) {
    console.log(
      "Dry run: preview only (index.json not written). Re-run without --dry-run to apply.",
    );
    console.log(`Would apply ${renames.length} rename(s) to index.json (dry run).`);
    for (const r of renames) {
      console.log(`  ${r.from} -> ${r.to}`);
    }
    return 0;
  }
  await writeIndex(repoRoot, next.index);
  console.log(`Updated index.json for ${renames.length} path rename(s).`);
  for (const r of renames) {
    console.log(`  ${r.from} -> ${r.to}`);
  }
  return 0;
}

async function cmdMigrate(): Promise<number> {
  const repoRoot = await repoRootFromCwd();
  try {
    const { changed } = await refreshIndexMigrationsOnDisk(repoRoot);
    if (changed) {
      console.log("Migrated metadata index (schema and/or snippet normalization).");
    } else {
      console.log("No metadata migration needed.");
    }
    return 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error(`Missing index at ${defaultMetadataIndexPath()}. Run: parallel-docs init`);
      return 1;
    }
    throw err;
  }
}

async function cmdRender(opts: RenderCliOptions & { mermaid: boolean }) {
  const repoRoot = await repoRootFromCwd();
  const cfg = await loadParallelDocsConfig(repoRoot);
  const inputs = resolveRenderInputs(cfg, opts, repoRoot);
  const source = normalizeRepoRelativePath(inputs.source);
  const md = await fs.readFile(path.resolve(repoRoot, inputs.markdown), "utf8");
  const code = await fs.readFile(path.resolve(repoRoot, source), "utf8");
  const ext = path.extname(source).slice(1) || "txt";
  const outPath = path.resolve(repoRoot, inputs.out);
  const mdAbs = path.resolve(repoRoot, inputs.markdown);
  const ghParsed =
    cfg.render.relativeGithubBlobLinks && cfg.staticSite.githubUrl
      ? parseGithubRepoWebUrl(cfg.staticSite.githubUrl)
      : null;
  const parallelDocsStorageRootAbs = path.resolve(repoRoot, cfg.storageDir);
  const parallelDocsOutputUrls = {
    repoRootAbs: repoRoot,
    htmlOutputFileAbs: outPath,
    markdownUrlBaseDirAbs: path.dirname(mdAbs),
    parallelDocsStorageRootAbs,
    sourceLinkPrefix:
      cfg.staticSite.sourceLinkPrefix ??
      (ghParsed
        ? `https://github.com/${encodeURIComponent(ghParsed.owner)}/${encodeURIComponent(
            ghParsed.repo,
          )}/blob/${encodeURIComponent(cfg.staticSite.githubBlobBranch)}`
        : undefined),
    ...(ghParsed ? { githubBlobRepo: { owner: ghParsed.owner, repo: ghParsed.repo } } : {}),
  };
  const html = await renderSideBySideHtml({
    title: source,
    code,
    language: ext === "ts" ? "ts" : ext,
    parallelDocsMarkdown: md,
    hljsTheme: cfg.render.syntaxTheme,
    includeMermaidRuntime: opts.mermaid,
    mermaidRuntimePath: resolveMermaidRuntimePath(repoRoot, cfg.render.mermaidRuntimePath),
    parallelDocsOutputUrls,
  });
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

const program = new Command();
program.name("parallel-docs").description("ParallelDocs CLI").version(cliPackage.version);

const initCmd = program
  .command("init")
  .description(
    "Idempotent workspace setup: storage dirs, index.json if missing, .parallel-docs.toml if missing; " +
      "merges d-led.parallel-docs-vscode into .vscode/extensions.json when mergeable; " +
      "always refreshes index migrations and runs validate (exit 1 on validation errors)",
  );

initCmd
  .command("config")
  .description(
    "Ensure .parallel-docs.toml exists with commented defaults (use --force to overwrite)",
  )
  .option("--force", "Replace an existing .parallel-docs.toml", false)
  .action(async (opts: { force?: boolean }) => {
    process.exitCode = await runInitConfig(await repoRootFromCwd(), { force: Boolean(opts.force) });
  });

initCmd
  .command("scm")
  .description(
    "Install or refresh ParallelDocs's block in .git/hooks/pre-commit (runs validate when CLI is present)",
  )
  .action(async () => {
    process.exitCode = await runInitScm(await repoRootFromCwd());
  });

initCmd.action(async () => {
  process.exitCode = await runInitFull(await repoRootFromCwd());
});

program
  .command("validate")
  .description("Validate ParallelDocs metadata and configuration")
  .option("--staged", "Only validate index entries touched by staged files (Git index)", false)
  .action(async (opts: { staged?: boolean }) => {
    process.exitCode = await cmdValidate({ staged: Boolean(opts.staged) });
  });

program
  .command("doctor")
  .description(
    "Validate plus environment checks; optionally delete companion Markdown with no primary source file",
  )
  .option(
    "--allow-deletions",
    "Remove orphan companion trees/files under [storage]/source/ (no matching repo primary source); then run validate",
    false,
  )
  .action(async (opts: { allowDeletions?: boolean }) => {
    process.exitCode = await cmdDoctor({ allowDeletions: Boolean(opts.allowDeletions) });
  });

program
  .command("migrate")
  .description("Migrate metadata JSON to the current schema")
  .action(async () => {
    process.exitCode = await cmdMigrate();
  });

program
  .command("migrate-angles")
  .description(
    "Convert flat .parallel-docs/source companions (*.md beside path) to Angles layout (per-source folders + [angles])",
  )
  .option("--angle-id <id>", "Angle id for migrated files", "main")
  .option("--dry-run", "Print planned moves without writing files", false)
  .action(async (opts: { angleId?: string; dryRun?: boolean }) => {
    process.exitCode = await runMigrateAnglesFromCwd({
      angleId:
        typeof opts.angleId === "string" && opts.angleId.trim() ? opts.angleId.trim() : "main",
      dryRun: Boolean(opts.dryRun),
    });
  });

const anglesCmd = program
  .command("angles")
  .description(
    "Work with ParallelDocs Angles (multi-companion layout under .parallel-docs/source/)",
  );

anglesCmd
  .command("add")
  .description(
    "Register a new angle in .parallel-docs.toml and create its companion Markdown file for the chosen primary",
  )
  .argument("<angleId>", "New angle id (letters, digits, underscores, hyphens)")
  .option(
    "--source <path>",
    "Repo-relative primary path (defaults to [static_site].source_file from .parallel-docs.toml)",
  )
  .option("--title <text>", "Angle label in the UI (defaults to a title-cased angle id)")
  .option("--make-default", "Set angles.default_angle to this id after registration", false)
  .action(
    async (
      angleId: string,
      opts: { source?: string; title?: string; makeDefault?: boolean },
    ): Promise<void> => {
      process.exitCode = await runAnglesAddFromCwd({
        angleId,
        sourcePath: typeof opts.source === "string" ? opts.source : undefined,
        title: typeof opts.title === "string" ? opts.title : undefined,
        makeDefault: Boolean(opts.makeDefault),
      });
    },
  );

program
  .command("sync-moved-paths")
  .description(
    "Rewrite index.json paths using Git rename detection between two tree-ish refs (default HEAD~1 → HEAD)",
  )
  .option("--from <ref>", "Older tree-ish", "HEAD~1")
  .option("--to <ref>", "Newer tree-ish", "HEAD")
  .option("--dry-run", "List renames that would be applied without writing index.json", false)
  .action(async (opts: { from?: string; to?: string; dryRun?: boolean }) => {
    process.exitCode = await cmdSyncMovedPaths({
      fromRef: (opts.from as string) || "HEAD~1",
      toRef: (opts.to as string) || "HEAD",
      dryRun: Boolean(opts.dryRun),
    });
  });

program
  .command("convert-source-markers")
  .description(
    "Rewrite ParallelDocs marker pairs in a source file to the delimiter style for a VS Code language id",
  )
  .requiredOption("--file <path>", "Repo-relative path to the source file")
  .requiredOption("--language <id>", "VS Code language id (e.g. typescript, rust, yaml, css)")
  .option("--dry-run", "Report how many pairs would change without writing the file", false)
  .action(async (opts: { file?: string; language?: string; dryRun?: boolean }) => {
    process.exitCode = await cmdConvertSourceMarkers({
      file: opts.file as string,
      language: opts.language as string,
      dryRun: Boolean(opts.dryRun),
    });
  });

program
  .command("paths")
  .argument("<file>", "Repo-relative source file path")
  .description("Print the parallel-docs Markdown path for a source file")
  .action(async (file: string) => {
    const repoRoot = await repoRootFromCwd();
    const cfg = await loadParallelDocsConfig(repoRoot);
    const normalized = normalizeRepoRelativePath(file);
    const resolved = resolveParallelDocsMarkdownPath(repoRoot, normalized, cfg);
    console.log(resolved.parallelDocsPath);
  });

program
  .command("serve")
  .description(
    "Watch `.parallel-docs.toml`, `[static_site].source_file`, `.parallel-docs/metadata/index.json`, " +
      "and Markdown under the configured storage `source/` tree; rebuild `_site` on change, " +
      "and serve it over HTTP (same output as `pages:build`)",
  )
  .option("-p, --port <n>", "HTTP port", "4173")
  .action(async (opts: { port?: string }) => {
    const port = parseInt(String(opts.port ?? "4173"), 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.error("serve: --port must be a number from 1 to 65535");
      process.exitCode = 1;
      return;
    }
    try {
      await runServeStaticPages(await repoRootFromCwd(), { port });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

const pagesCmd = program.command("pages").description("GitHub Pages build helpers");

pagesCmd
  .command("build")
  .description(
    "Build the static `_site/` tree from `.parallel-docs.toml` [static_site] config. " +
      "Use in CI workflows before deploying to GitHub Pages or any static host.",
  )
  .action(async () => {
    try {
      await runPagesBuild(await repoRootFromCwd());
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

program
  .command("render")
  .description(
    "Render a side-by-side HTML view; missing flags fall back to .parallel-docs.toml [static_site] " +
      "(default --out: _site/index.html)",
  )
  .option("--source <path>", "Repo-relative source file (defaults to static_site.source_file)")
  .option(
    "--markdown <path>",
    "Path to side-track markdown file (defaults to static_site.parallel_docs_markdown, " +
      "or the conventional .parallel-docs/source/<src>.md)",
  )
  .option("--out <path>", "Output HTML path (defaults to _site/index.html)")
  .option("--mermaid", "Include Mermaid runtime in HTML output", false)
  .action(async (opts: RenderCliOptions & { mermaid?: boolean }) => {
    await cmdRender({
      source: opts.source,
      markdown: opts.markdown,
      out: opts.out,
      mermaid: Boolean(opts.mermaid),
    });
  });

// ── mcp commands ─────────────────────────────────────────────────────────

const mcpCmd = program
  .command("mcp")
  .description("Start or install the ParallelDocs MCP server for AI coding assistants");

mcpCmd
  .command("serve")
  .description(
    "Start the MCP server via stdio (used by MCP clients like Claude, VS Code Copilot, etc.)",
  )
  .action(async () => {
    // Dynamic import — the mcp-server package is heavy and only needed here.
    const { createMcpServer } = await import("@parallel-docs/mcp-server");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const repoRoot = await repoRootFromCwd();
    const server = createMcpServer(repoRoot);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

mcpCmd
  .command("install")
  .description(
    "Write repo-local MCP config files (.vscode/mcp.json, .claude/mcp.json, etc.) " +
      "so AI coding assistants can discover the ParallelDocs MCP server. " +
      "Uses 'parallel-docs mcp serve' as the command — fully portable, no absolute paths.",
  )
  .option("--dry-run", "Print what would be written without touching files", false)
  .option(
    "--force",
    "Overwrite existing ParallelDocs entries (default: skip if already present)",
    false,
  )
  .action(async (opts: { dryRun?: boolean; force?: boolean }) => {
    const repoRoot = await repoRootFromCwd();
    const results = await installMcpConfigs(repoRoot, {
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
    });
    for (const r of results) {
      const label = r.action.replace(/_/g, " ");
      console.log(`  [${label}] ${r.harness}: ${r.configFile}`);
    }
    if (opts.dryRun) {
      console.log("\nDry run — no files written. Re-run without --dry-run to apply.");
    } else {
      console.log("\nDone. AI assistants in this repo can now use ParallelDocs tools.");
    }
  });

void runCommanderMain(() => program.parseAsync(process.argv));

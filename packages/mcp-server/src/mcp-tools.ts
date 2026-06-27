import { createServer, type Server } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  applyAnglesFlatMigrationToCommentrayToml,
  applyPathRenamesToCommentrayIndex,
  collectOrphanCompanionMarkdownTargets,
  convertCommentraySourceMarkersToLanguage,
  defaultMetadataIndexPath,
  discoverCommentrayPairsOnDisk,
  discoverFlatCompanionMarkdownFiles,
  ensureAnglesSentinelFile,
  GitScmProvider,
  initializeCommentrayProject,
  loadCommentrayConfig,
  normalizeRepoRelativePath,
  planAnglesMigrationFromCompanions,
  pruneOrphanCompanionMarkdown,
  readIndex,
  refreshIndexMigrationsOnDisk,
  resolveCommentrayMarkdownPath,
  rewriteIndexKeysForAnglesMigration,
  upsertAngleDefinitionInCommentrayToml,
  validateProject,
  type ValidateProjectOptions,
  writeIndex,
} from "@commentray/core";
import { renderSideBySideHtml } from "@commentray/render";
import { z } from "zod";

// ── Tool definition type ────────────────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (repoRoot: string, args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [x: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function textResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ── Serve state (module-level singleton) ────────────────────────────────

let serveServer: Server | null = null;
let servePort = 0;

function stopServeServer(): void {
  if (!serveServer) return;
  serveServer.close();
  serveServer.closeAllConnections?.();
  serveServer = null;
  servePort = 0;
}

// ── Tool definitions ─────────────────────────────────────────────────────

export const ALL_TOOLS: McpToolDef[] = [
  // ── commentray_init ──────────────────────────────────────────────────
  {
    name: "commentray_init",
    description:
      "Initialize a Commentray project in the current workspace. " +
      "Creates the .commentray/ storage directory, index.json, and .commentray.toml " +
      "configuration file. Idempotent — safe to run multiple times.",
    schema: {},
    handler: async (repoRoot) => {
      const result = await initializeCommentrayProject(repoRoot);
      const msgs: string[] = [];
      if (result.createdToml) msgs.push("Created .commentray.toml");
      if (result.createdIndex) msgs.push("Created index.json");
      if (result.migratedIndex) msgs.push("Migrated index to current schema");
      if (result.addedSiteGitignore) msgs.push("Added _site to .gitignore");
      if (result.validationIssues.length > 0) {
        for (const issue of result.validationIssues) {
          msgs.push(`[${issue.level.toUpperCase()}] ${issue.message}`);
        }
      }
      if (msgs.length === 0) msgs.push("Project already initialized (no changes).");
      return textResult(msgs.join("\n"));
    },
  },

  // ── commentray_validate ──────────────────────────────────────────────
  {
    name: "commentray_validate",
    description:
      "Validate the Commentray project metadata and configuration. " +
      "Returns errors and warnings. Set staged=true to only validate index entries " +
      "touched by staged Git files.",
    schema: {
      staged: z.boolean().optional().default(false).describe("Only validate staged Git changes"),
    },
    handler: async (repoRoot, args) => {
      const opts: ValidateProjectOptions | undefined = args.staged
        ? { stagedRepoRelativePaths: [] }
        : undefined;
      const result = await validateProject(repoRoot, opts);
      const errors = result.issues.filter((i) => i.level === "error").length;
      const warnings = result.issues.filter((i) => i.level === "warn").length;
      const lines: string[] = [];
      if (result.issues.length === 0) {
        lines.push("OK: no validation issues.");
      } else {
        for (const issue of result.issues) {
          lines.push(`[${issue.level.toUpperCase()}] ${issue.message}`);
        }
        lines.push("");
        lines.push(`Summary: ${errors} error(s), ${warnings} warning(s)`);
      }
      return errors === 0 ? textResult(lines.join("\n")) : errorResult(lines.join("\n"));
    },
  },

  // ── commentray_paths ─────────────────────────────────────────────────
  {
    name: "commentray_paths",
    description:
      "Resolve and return the Commentray Markdown companion path for a source file. " +
      "Given a repo-relative source file path, returns the corresponding .md path.",
    schema: {
      file: z.string().describe("Repo-relative path to the source file"),
    },
    handler: async (repoRoot, args) => {
      const rel = normalizeRepoRelativePath(String(args.file));
      const cfg = await loadCommentrayConfig(repoRoot);
      const resolved = resolveCommentrayMarkdownPath(repoRoot, rel, cfg);
      return textResult(resolved.commentrayPath);
    },
  },

  // ── commentray_render ────────────────────────────────────────────────
  {
    name: "commentray_render",
    description:
      "Render a side-by-side HTML page (source code + Commentray Markdown). " +
      "Reads the source and markdown files from disk, writes HTML output.",
    schema: {
      source: z.string().optional().describe("Repo-relative source file path"),
      markdown: z.string().optional().describe("Path to Commentray Markdown file"),
      out: z.string().optional().default("_site/index.html").describe("Output HTML path"),
      mermaid: z.boolean().optional().default(false).describe("Include Mermaid diagram runtime"),
    },
    handler: async (repoRoot, args) => {
      const cfg = await loadCommentrayConfig(repoRoot);
      const srcRel = args.source ?? cfg.staticSite?.sourceFile;
      const mdRel = args.markdown ?? cfg.staticSite?.commentrayMarkdownFile;
      const outRel = String(args.out ?? "_site/index.html");

      if (!srcRel) {
        return errorResult(
          "No source file provided. Pass source or set [static_site].source_file in .commentray.toml.",
        );
      }
      if (!mdRel) {
        return errorResult(
          "No markdown file provided. Pass markdown or set [static_site].commentray_markdown in .commentray.toml.",
        );
      }

      const srcAbs = path.join(repoRoot, normalizeRepoRelativePath(String(srcRel)));
      const mdAbs = path.join(repoRoot, normalizeRepoRelativePath(String(mdRel)));
      const outAbs = path.resolve(repoRoot, outRel);

      let code: string;
      let mdText: string;
      try {
        code = await fs.readFile(srcAbs, "utf8");
        mdText = await fs.readFile(mdAbs, "utf8");
      } catch (err) {
        const codeErr = (err as NodeJS.ErrnoException).code;
        if (codeErr === "ENOENT") {
          return errorResult("Source or markdown file not found. Check paths.");
        }
        throw err;
      }

      const ext = path.extname(String(srcRel)).slice(1) || "txt";
      const html = await renderSideBySideHtml({
        code,
        language: ext,
        commentrayMarkdown: mdText,
        hljsTheme: cfg.render.syntaxTheme,
        includeMermaidRuntime: Boolean(args.mermaid),
      });

      await fs.mkdir(path.dirname(outAbs), { recursive: true });
      await fs.writeFile(outAbs, html, "utf8");
      return textResult(`Rendered HTML to ${outRel}`);
    },
  },

  // ── commentray_doctor ────────────────────────────────────────────────
  {
    name: "commentray_doctor",
    description:
      "Run validation plus environment checks. With allowDeletions=true, also " +
      "removes orphan companion Markdown files (no matching primary source file).",
    schema: {
      allowDeletions: z
        .boolean()
        .optional()
        .default(false)
        .describe("Remove orphan companion Markdown files"),
    },
    handler: async (repoRoot, args) => {
      const lines: string[] = [];
      if (args.allowDeletions) {
        const cfg = await loadCommentrayConfig(repoRoot);
        const { removedAbsPaths } = await pruneOrphanCompanionMarkdown(repoRoot, cfg.storageDir);
        if (removedAbsPaths.length > 0) {
          lines.push(`Removed ${removedAbsPaths.length} orphan companion path(s):`);
          for (const abs of removedAbsPaths) {
            lines.push(`  - ${path.relative(repoRoot, abs)}`);
          }
        }
      }
      const result = await validateProject(repoRoot);
      const errors = result.issues.filter((i) => i.level === "error").length;
      const warnings = result.issues.filter((i) => i.level === "warn").length;
      if (result.issues.length === 0) {
        lines.push("OK: no validation issues.");
      } else {
        for (const issue of result.issues) {
          lines.push(`[${issue.level.toUpperCase()}] ${issue.message}`);
        }
        lines.push(`Summary: ${errors} error(s), ${warnings} warning(s)`);
      }
      try {
        await fs.access(path.join(repoRoot, ".git"));
        lines.push("OK: Git checkout detected.");
      } catch {
        lines.push("[WARN] No .git directory — SCM features require a Git checkout.");
      }
      return errors === 0 ? textResult(lines.join("\n")) : errorResult(lines.join("\n"));
    },
  },

  // ── commentray_migrate ───────────────────────────────────────────────
  {
    name: "commentray_migrate",
    description:
      "Migrate the metadata index.json to the current schema version. " +
      "Safe to run multiple times — only applies pending migrations.",
    schema: {},
    handler: async (repoRoot) => {
      const { changed } = await refreshIndexMigrationsOnDisk(repoRoot);
      if (changed) {
        return textResult("Index migrated to current schema.");
      }
      return textResult("Index already at current schema (no migration needed).");
    },
  },

  // ── commentray_migrate_angles ────────────────────────────────────────
  {
    name: "commentray_migrate_angles",
    description:
      "Convert flat .commentray/source/ companions to the Angles layout " +
      "(per-source folders under angle directories). Use dryRun=true to preview.",
    schema: {
      angleId: z.string().optional().default("main").describe("Angle ID for migrated files"),
      dryRun: z.boolean().optional().default(false).describe("Preview moves without writing files"),
    },
    handler: async (repoRoot, args) => {
      const cfg = await loadCommentrayConfig(repoRoot);
      const storageDir = cfg.storageDir;
      const companions = await discoverFlatCompanionMarkdownFiles(repoRoot, storageDir);
      if (companions.length === 0) {
        return textResult("No files to migrate (already in Angles layout or no flat companions).");
      }

      const angleId = String(args.angleId ?? "main");
      const plan = planAnglesMigrationFromCompanions(companions, angleId, storageDir);

      if (args.dryRun) {
        const lines = [`Dry run: ${plan.moves.length} file(s) would be moved:`];
        for (const m of plan.moves) {
          lines.push(`  ${m.fromRepoRel} → ${m.toRepoRel}`);
        }
        return textResult(lines.join("\n"));
      }

      // Apply filesystem moves
      for (const m of plan.moves) {
        const fromAbs = path.join(repoRoot, m.fromRepoRel);
        const toAbs = path.join(repoRoot, m.toRepoRel);
        await fs.mkdir(path.dirname(toAbs), { recursive: true });
        await fs.rename(fromAbs, toAbs);
      }

      // Update .commentray.toml
      const firstCompanion = companions[0];
      const firstTarget = plan.moves[0];
      const sourceFile = firstCompanion.sourcePath;
      const fromCommentray = path.posix.join(storageDir, "source", `${sourceFile}.md`);
      const toCommentray = firstTarget?.toRepoRel;

      await applyAnglesFlatMigrationToCommentrayToml(repoRoot, {
        angleId,
        staticCommentrayMarkdownFrom: fromCommentray,
        staticCommentrayMarkdownTo: toCommentray,
      });

      // Rewrite index keys
      const index = await readIndex(repoRoot);
      if (index) {
        const newIndex = rewriteIndexKeysForAnglesMigration(index, plan.flatToAnglePath);
        await writeIndex(repoRoot, newIndex);
      }

      return textResult(`Migrated ${plan.moves.length} file(s) to angle "${angleId}".`);
    },
  },

  // ── commentray_angles_add ────────────────────────────────────────────
  {
    name: "commentray_angles_add",
    description:
      "Register a new angle in .commentray.toml and create the Angles sentinel. " +
      "Use makeDefault=true to set it as the default angle.",
    schema: {
      angleId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .describe("New angle ID (letters, digits, underscores, hyphens)"),
      source: z.string().optional().describe("Repo-relative primary source path"),
      title: z.string().optional().describe("Human-readable angle label"),
      makeDefault: z.boolean().optional().default(false).describe("Set as the default angle"),
    },
    handler: async (repoRoot, args) => {
      await upsertAngleDefinitionInCommentrayToml(repoRoot, {
        id: String(args.angleId),
        title: args.title ? String(args.title) : undefined,
        makeDefault: Boolean(args.makeDefault),
      });
      const cfg = await loadCommentrayConfig(repoRoot);
      await ensureAnglesSentinelFile(repoRoot, cfg.storageDir);
      return textResult(
        `Angle "${args.angleId}" registered${args.makeDefault ? " (default)" : ""}.`,
      );
    },
  },

  // ── commentray_sync_moved_paths ──────────────────────────────────────
  {
    name: "commentray_sync_moved_paths",
    description:
      "Rewrite index.json paths using Git rename detection between two tree-ish refs. " +
      "Use dryRun=true to preview without writing.",
    schema: {
      from: z.string().optional().default("HEAD~1").describe("Older tree-ish ref"),
      to: z.string().optional().default("HEAD").describe("Newer tree-ish ref"),
      dryRun: z.boolean().optional().default(false).describe("Preview renames without writing"),
    },
    handler: async (repoRoot, args) => {
      const scm = new GitScmProvider();
      if (!scm.listPathRenamesBetweenTreeishes) {
        return errorResult("SCM provider does not support rename listing.");
      }
      const fromRef = String(args.from ?? "HEAD~1");
      const toRef = String(args.to ?? "HEAD");
      const renames = await scm.listPathRenamesBetweenTreeishes(repoRoot, fromRef, toRef);
      if (renames.length === 0) {
        return textResult("No Git-detected renames in that range.");
      }
      const cfg = await loadCommentrayConfig(repoRoot);
      const index = await readIndex(repoRoot);
      if (!index) {
        return errorResult(`No index at ${defaultMetadataIndexPath()}. Run commentray_init first.`);
      }
      const next = applyPathRenamesToCommentrayIndex(index, renames, repoRoot, cfg);
      if (!next.changed) {
        return textResult("Index paths already match those renames (nothing to update).");
      }
      if (args.dryRun) {
        const lines = [`Dry run: would apply ${renames.length} rename(s):`];
        for (const r of renames) {
          lines.push(`  ${r.from} → ${r.to}`);
        }
        return textResult(lines.join("\n"));
      }
      await writeIndex(repoRoot, next.index);
      return textResult(`Applied ${renames.length} rename(s) to index.json.`);
    },
  },

  // ── commentray_convert_source_markers ────────────────────────────────
  {
    name: "commentray_convert_source_markers",
    description:
      "Rewrite Commentray marker pairs in a source file to the delimiter style " +
      "for a given VS Code language ID. Use dryRun=true to preview.",
    schema: {
      file: z.string().describe("Repo-relative path to the source file"),
      language: z.string().describe("VS Code language ID (e.g. typescript, rust, yaml, css)"),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("Preview changes without writing the file"),
    },
    handler: async (repoRoot, args) => {
      const rel = normalizeRepoRelativePath(String(args.file));
      const abs = path.join(repoRoot, ...rel.split("/"));
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return errorResult(`File not found: ${rel}`);
        throw err;
      }
      const { sourceText, changed, convertedPairs } = convertCommentraySourceMarkersToLanguage(
        raw,
        String(args.language),
      );
      if (!changed) {
        return textResult(
          "No changes (no marker pairs, already target style, or only line-ending normalization).",
        );
      }
      if (args.dryRun) {
        return textResult(`Dry run: would rewrite ${convertedPairs} marker pair(s) in ${rel}.`);
      }
      await fs.writeFile(abs, sourceText, "utf8");
      return textResult(`Rewrote ${convertedPairs} marker pair(s) in ${rel}.`);
    },
  },

  // ── Read-only discovery tools ────────────────────────────────────────

  {
    name: "commentray_list_pairs",
    description:
      "List all source→commentary pairs in the project. " +
      "Returns repo-relative paths for each source file and its companion Markdown. " +
      "Use this to discover what files already have commentary.",
    schema: {},
    handler: async (repoRoot) => {
      const cfg = await loadCommentrayConfig(repoRoot);
      const pairs = await discoverCommentrayPairsOnDisk(repoRoot, cfg.storageDir);
      if (pairs.length === 0) {
        return textResult(
          "No commentray pairs found. Run commentray_init first, then add commentary.",
        );
      }
      const lines = [`${pairs.length} source→commentary pair(s):`];
      for (const p of pairs) {
        lines.push(`  ${p.sourcePath}  →  ${p.commentrayPath}`);
      }
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "commentray_read_commentray",
    description:
      "Read the commentary Markdown for a given source file. " +
      "Returns the full Markdown content. Use this before writing or editing commentary.",
    schema: {
      file: z.string().describe("Repo-relative path to the source file"),
      angleId: z.string().optional().describe("Angle ID (uses default if omitted)"),
    },
    handler: async (repoRoot, args) => {
      const rel = normalizeRepoRelativePath(String(args.file));
      const cfg = await loadCommentrayConfig(repoRoot);
      const resolved = resolveCommentrayMarkdownPath(
        repoRoot,
        rel,
        cfg,
        args.angleId ? String(args.angleId) : undefined,
      );
      const absPath = path.join(repoRoot, ...resolved.commentrayPath.split("/"));
      try {
        const content = await fs.readFile(absPath, "utf8");
        return textResult(content);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return errorResult(
            `No commentary found for ${rel}. Run commentray_init and add commentary first.`,
          );
        }
        throw err;
      }
    },
  },

  {
    name: "commentray_read_source",
    description:
      "Read a source file's content. Returns the full file text. " +
      "Use this to understand the code before writing commentary for it.",
    schema: {
      file: z.string().describe("Repo-relative path to the source file"),
    },
    handler: async (repoRoot, args) => {
      const rel = normalizeRepoRelativePath(String(args.file));
      const abs = path.join(repoRoot, ...rel.split("/"));
      try {
        const content = await fs.readFile(abs, "utf8");
        const lines = content.split("\n");
        const header = `// ${rel}  (${lines.length} lines, ${content.length} bytes)\n`;
        return textResult(header + content);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return errorResult(`File not found: ${rel}`);
        throw err;
      }
    },
  },

  {
    name: "commentray_list_orphans",
    description:
      "List orphan companion Markdown files — commentary without a matching " +
      "primary source file. Use commentray_doctor with allowDeletions=true to remove them.",
    schema: {},
    handler: async (repoRoot) => {
      const cfg = await loadCommentrayConfig(repoRoot);
      const orphans = await collectOrphanCompanionMarkdownTargets(repoRoot, cfg.storageDir);
      if (orphans.length === 0) {
        return textResult(
          "No orphan companions found. All commentary files have matching source files.",
        );
      }
      const lines = [`${orphans.length} orphan companion(s) found:`];
      for (const o of orphans) {
        const kind = o.cleanupIsDirectory ? "dir" : "file";
        lines.push(`  [${kind}] ${o.commentrayPath}  (missing source: ${o.sourcePath})`);
      }
      lines.push("");
      lines.push(
        "To remove them: use commentray_doctor with allowDeletions=true, or run `commentray doctor --allow-deletions` from the CLI.",
      );
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "commentray_find_uncommented",
    description:
      "Find source files in the repo that could have commentary but don't. " +
      "Scans Git-tracked files, filters by common source extensions, and " +
      "compares against the index. Use this to discover documentation opportunities.",
    schema: {
      maxFiles: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum files to return (prevents overwhelming output)"),
    },
    handler: async (repoRoot, args) => {
      // Get git-tracked files
      let tracked: string;
      try {
        tracked = execSync("git ls-files -z --cached", {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch {
        return errorResult(
          "Could not list Git-tracked files. Ensure the repo has a Git checkout and git is on PATH.",
        );
      }
      const allFiles = tracked.split("\0").filter(Boolean);

      const sourceExts = new Set([
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".py",
        ".rs",
        ".go",
        ".java",
        ".kt",
        ".swift",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".rb",
        ".php",
        ".scala",
        ".clj",
        ".ex",
        ".exs",
        ".elm",
        ".hs",
        ".lua",
        ".r",
        ".nim",
        ".zig",
        ".ml",
        ".mli",
        ".yaml",
        ".yml",
        ".toml",
        ".json",
        ".md",
        ".mdx",
      ]);

      const index = await readIndex(repoRoot);
      const indexedPaths = new Set<string>();
      if (index) {
        for (const entry of Object.values(index.byCommentrayPath)) {
          indexedPaths.add(entry.sourcePath);
        }
      }

      const uncommented: string[] = [];
      for (const f of allFiles) {
        const ext = path.extname(f).toLowerCase();
        if (!sourceExts.has(ext)) continue;
        if (indexedPaths.has(f)) continue;
        uncommented.push(f);
        if (uncommented.length >= (args.maxFiles as number)) break;
      }

      const totalSource = allFiles.filter((f) =>
        sourceExts.has(path.extname(f).toLowerCase()),
      ).length;
      const commented = totalSource - uncommented.length;

      if (uncommented.length === 0) {
        return textResult(`All ${totalSource} tracked source files have commentary. Great job!`);
      }

      const lines = [
        `${uncommented.length} uncommented source file(s) (${commented} already have commentary, ${totalSource} total tracked source files):`,
      ];
      for (const f of uncommented) {
        lines.push(`  ${f}`);
      }
      if (uncommented.length >= (args.maxFiles as number)) {
        lines.push(`  ... (capped at ${args.maxFiles}; increase maxFiles to see more)`);
      }
      return textResult(lines.join("\n"));
    },
  },

  // ── commentray_serve ─────────────────────────────────────────────────
  {
    name: "commentray_serve",
    description:
      "Build the Commentray static site and serve it over HTTP. " +
      "Starts a local server on the given port (default 4173). " +
      "Returns the URL. The server keeps running until stop_serve is called " +
      "or the MCP session ends. Call again to rebuild and restart.",
    schema: {
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .optional()
        .default(4173)
        .describe("Port to listen on"),
    },
    handler: async (repoRoot, args) => {
      const port = Number(args.port ?? 4173);

      // Stop existing server if running (on any port)
      stopServeServer();

      // Dynamic import: static-site stack may pull heavy dependencies
      const { buildGithubPagesStaticSite } =
        await import("@commentray/code-commentray-static/github-pages-site");
      const { default: serveHandler } = await import("serve-handler");

      await buildGithubPagesStaticSite({ repoRoot });

      const siteAbs = path.join(repoRoot, "_site");

      const server = createServer((req, res) => {
        void serveHandler(req, res, {
          public: siteAbs,
          etag: true,
          cleanUrls: false,
          rewrites: [{ source: "/", destination: "/index.html" }],
        }).catch((err: unknown) => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", () => {
          server.off("error", reject);
          resolve();
        });
        server.listen(port, "0.0.0.0");
      });

      serveServer = server;
      servePort = port;

      return textResult(`Serving at http://127.0.0.1:${String(port)}/`);
    },
  },

  // ── commentray_stop_serve ────────────────────────────────────────────
  {
    name: "commentray_stop_serve",
    description:
      "Stop the Commentray HTTP server started by commentray_serve. " +
      "Safe to call when no server is running.",
    schema: {},
    handler: async () => {
      if (!serveServer) {
        return textResult("No server running.");
      }
      const wasPort = servePort;
      stopServeServer();
      return textResult(`Server stopped (was http://127.0.0.1:${String(wasPort)}/).`);
    },
  },

  {
    name: "commentray_get_index",
    description:
      "Return the full Commentray index as formatted JSON. " +
      "Shows all tracked source files, their companion paths, block IDs, anchors, and marker IDs. " +
      "Use this to understand the complete state of the project's commentary.",
    schema: {},
    handler: async (repoRoot) => {
      const index = await readIndex(repoRoot);
      if (!index) {
        return errorResult(`No index found. Run commentray_init first.`);
      }
      const summary = {
        schemaVersion: index.schemaVersion,
        pairCount: Object.keys(index.byCommentrayPath).length,
        pairs: Object.entries(index.byCommentrayPath).map(([cp, entry]) => ({
          sourcePath: entry.sourcePath,
          commentrayPath: cp,
          blockCount: entry.blocks.length,
          blocks: entry.blocks.map((b) => ({
            id: b.id,
            anchor: b.anchor,
            markerId: b.markerId,
          })),
        })),
      };
      return textResult(JSON.stringify(summary, null, 2));
    },
  },
];

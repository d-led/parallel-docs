#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCommanderMain } from "@parallel-docs/core";
import { Command } from "commander";
import { buildParallelDocsStatic } from "./build.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, "..");
const defaultSource = path.join(pkgRoot, "fixtures", "sample.ts");
const defaultMarkdown = path.join(pkgRoot, "fixtures", "sample.md");
const defaultOut = path.join(pkgRoot, "site", "index.html");

const program = new Command();
program
  .name("@parallel-docs/code-parallel-docs-static")
  .description("Emit a static HTML code + parallel-docs browser page")
  .option("--source <path>", "Source file to display", defaultSource)
  .option("--markdown <path>", "ParallelDocs Markdown file", defaultMarkdown)
  .option("--out <path>", "Output HTML file", defaultOut)
  .option("--title <text>", "HTML title override")
  .option(
    "--file-path <text>",
    "Repo-relative path label shown in the toolbar (defaults to basename of --source)",
  )
  .option("--mermaid", "Include Mermaid runtime (CDN)", false)
  .action(async (opts) => {
    await buildParallelDocsStatic({
      sourceFile: opts.source as string,
      markdownFile: opts.markdown as string,
      outHtml: opts.out as string,
      title: opts.title as string | undefined,
      filePath: opts.filePath as string | undefined,
      includeMermaidRuntime: Boolean(opts.mermaid),
    });
    console.log(`Wrote ${path.resolve(opts.out as string)}`);
  });

void runCommanderMain(() => program.parseAsync(process.argv));

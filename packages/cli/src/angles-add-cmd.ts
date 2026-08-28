import fs from "node:fs/promises";
import path from "node:path";

import {
  assertValidAngleId,
  parallelDocsMarkdownPathForAngle,
  ensureAnglesSentinelFile,
  loadParallelDocsConfig,
  normalizeRepoRelativePath,
  upsertAngleDefinitionInParallelDocsToml,
} from "@parallel-docs/core";

import { findProjectRoot } from "./project-root.js";

export type RunAnglesAddFromCwdInput = {
  angleId: string;
  sourcePath?: string;
  title?: string;
  makeDefault?: boolean;
};

export async function runAnglesAddFromCwd(input: RunAnglesAddFromCwdInput): Promise<number> {
  const repoRoot = (await findProjectRoot(process.cwd())).dir;
  const id = assertValidAngleId(input.angleId.trim());
  const cfg = await loadParallelDocsConfig(repoRoot);
  await ensureAnglesSentinelFile(repoRoot, cfg.storageDir);

  const sourceRaw = (input.sourcePath ?? cfg.staticSite.sourceFile).trim();
  if (!sourceRaw) {
    console.error("angles add: set [static_site].source_file or pass --source <path>.");
    return 1;
  }
  const source = normalizeRepoRelativePath(sourceRaw);
  const absSource = path.join(repoRoot, ...source.split("/"));
  try {
    await fs.access(absSource);
  } catch {
    console.error(`angles add: primary not found: ${source}`);
    return 1;
  }

  try {
    await upsertAngleDefinitionInParallelDocsToml(repoRoot, {
      id,
      title: input.title?.trim() || undefined,
      makeDefault: input.makeDefault ? true : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already listed")) {
      console.error(msg);
      return 1;
    }
    console.log(`angles add: angle "${id}" already listed in .parallel-docs.toml`);
  }

  const rel = parallelDocsMarkdownPathForAngle(source, id, cfg.storageDir);
  const abs = path.join(repoRoot, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  try {
    await fs.access(abs);
    console.log(`angles add: companion already exists: ${rel}`);
    return 0;
  } catch {
    // write new companion
  }

  const heading =
    input.title?.trim() ||
    id
      .split(/[-_]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join(" ");
  const body = `# ${heading}\n\n_(ParallelDocs angle \`${id}\` for \`${source}\`)_\n`;
  await fs.writeFile(abs, body, "utf8");
  console.log(`angles add: wrote ${rel}`);
  return 0;
}

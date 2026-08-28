import fs from "node:fs/promises";
import path from "node:path";

import {
  applyAnglesFlatMigrationToParallelDocsToml,
  parallelDocsAnglesLayoutEnabled,
  discoverFlatCompanionMarkdownFiles,
  ensureAnglesSentinelFile,
  loadParallelDocsConfig,
  planAnglesMigrationFromCompanions,
  readIndex,
  rewriteIndexKeysForAnglesMigration,
  writeIndex,
  type AnglesMigrationPlan,
} from "@parallel-docs/core";

import { findProjectRoot } from "./project-root.js";

export type MigrateAnglesCliOptions = {
  angleId: string;
  dryRun: boolean;
  /** When set (e.g. in tests), use this root instead of discovering from `process.cwd()`. */
  repoRootOverride?: string;
};

async function printDryRun(
  repoRoot: string,
  plan: AnglesMigrationPlan,
  angleId: string,
): Promise<void> {
  console.log("Dry run: preview only (no files written). Re-run without --dry-run to apply.");
  console.log(
    `Would migrate ${String(plan.moves.length)} companion file(s) to angle "${angleId}":`,
  );
  for (const m of plan.moves) {
    console.log(`  ${m.fromRepoRel} -> ${m.toRepoRel}`);
  }
  console.log(
    "Would create .parallel-docs/source/.default and update .parallel-docs.toml [angles].",
  );
  const idx = await readIndex(repoRoot);
  if (!idx) return;
  const keys = Object.keys(idx.byParallelDocsPath).filter((k) => plan.flatToAnglePath.has(k));
  if (keys.length > 0) {
    console.log(`Would rewrite ${String(keys.length)} index.json path key(s).`);
  }
}

/** Returns exit code 1 when a destination file already exists. */
async function executeMoves(repoRoot: string, plan: AnglesMigrationPlan): Promise<number> {
  for (const m of plan.moves) {
    const fromAbs = path.join(repoRoot, ...m.fromRepoRel.split("/"));
    const toAbs = path.join(repoRoot, ...m.toRepoRel.split("/"));
    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    try {
      await fs.access(toAbs);
      console.error(`Refusing to overwrite existing file: ${m.toRepoRel}`);
      return 1;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    await fs.rename(fromAbs, toAbs);
  }
  return 0;
}

export async function runMigrateAnglesFromCwd(opts: MigrateAnglesCliOptions): Promise<number> {
  const repoRoot = opts.repoRootOverride ?? (await findProjectRoot(process.cwd())).dir;
  const cfg = await loadParallelDocsConfig(repoRoot);
  const storageDir = cfg.storageDir;

  if (parallelDocsAnglesLayoutEnabled(repoRoot, storageDir)) {
    console.log(
      "Angles layout is already enabled (.parallel-docs/source/.default exists). Nothing to do.",
    );
    return 0;
  }

  const companions = await discoverFlatCompanionMarkdownFiles(repoRoot, storageDir);
  if (companions.length === 0) {
    console.log(
      "No flat companion Markdown files found under .parallel-docs/source/. Nothing to migrate.",
    );
    return 0;
  }

  const plan = planAnglesMigrationFromCompanions(companions, opts.angleId, storageDir);

  if (opts.dryRun) {
    await printDryRun(repoRoot, plan, opts.angleId);
    return 0;
  }

  const moveCode = await executeMoves(repoRoot, plan);
  if (moveCode !== 0) return moveCode;

  await ensureAnglesSentinelFile(repoRoot, storageDir);

  const staticFrom = cfg.staticSite.parallelDocsMarkdownFile.trim();
  const staticTo = staticFrom ? (plan.flatToAnglePath.get(staticFrom) ?? "") : "";
  await applyAnglesFlatMigrationToParallelDocsToml(repoRoot, {
    angleId: opts.angleId,
    ...(staticFrom && staticTo
      ? { staticParallelDocsMarkdownFrom: staticFrom, staticParallelDocsMarkdownTo: staticTo }
      : {}),
  });

  const idx = await readIndex(repoRoot);
  if (idx) {
    const next = rewriteIndexKeysForAnglesMigration(idx, plan.flatToAnglePath);
    await writeIndex(repoRoot, next);
  }

  console.log(
    `Migrated ${String(plan.moves.length)} flat companion(s) to Angles layout (angle "${opts.angleId}").`,
  );
  console.log("Updated .parallel-docs.toml [angles] and index.json where paths matched.");
  return 0;
}

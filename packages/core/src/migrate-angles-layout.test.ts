import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parallelDocsAnglesSentinelPath, parallelDocsMarkdownPathForAngle } from "./paths.js";
import {
  discoverFlatCompanionMarkdownFiles,
  flatRelToSourcePath,
  planAnglesMigrationFromCompanions,
  rewriteIndexKeysForAnglesMigration,
} from "./migrate-angles-layout.js";
import type { ParallelDocsIndex } from "./model.js";

describe("Flat companion paths to primary source paths", () => {
  it("strips the trailing companion .md suffix", () => {
    expect(flatRelToSourcePath("README.md.md")).toBe("README.md");
    expect(flatRelToSourcePath("packages/cli/src/init.ts.md")).toBe("packages/cli/src/init.ts");
  });
});

describe("Planning migration from flat companions to angles layout", () => {
  it("maps each flat companion to an angle path under the source folder", () => {
    const plan = planAnglesMigrationFromCompanions(
      [
        {
          flatParallelDocsPath: ".parallel-docs/source/README.md.md",
          sourcePath: "README.md",
        },
      ],
      "main",
      ".parallel-docs",
    );
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]?.toRepoRel).toBe(
      parallelDocsMarkdownPathForAngle("README.md", "main", ".parallel-docs"),
    );
    expect(plan.flatToAnglePath.get(".parallel-docs/source/README.md.md")).toBe(
      plan.moves[0]?.toRepoRel,
    );
  });
});

describe("Rewriting index keys after an angles migration", () => {
  it("rewrites byParallelDocsPath keys and entry.parallelDocsPath", () => {
    const index: ParallelDocsIndex = {
      schemaVersion: 3,
      byParallelDocsPath: {
        ".parallel-docs/source/README.md.md": {
          sourcePath: "README.md",
          parallelDocsPath: ".parallel-docs/source/README.md.md",
          blocks: [],
        },
      },
    };
    const map = new Map([
      [
        ".parallel-docs/source/README.md.md",
        parallelDocsMarkdownPathForAngle("README.md", "main", ".parallel-docs"),
      ],
    ]);
    const next = rewriteIndexKeysForAnglesMigration(index, map);
    const k = parallelDocsMarkdownPathForAngle("README.md", "main", ".parallel-docs");
    expect(Object.keys(next.byParallelDocsPath)).toEqual([k]);
    expect(next.byParallelDocsPath[k]?.parallelDocsPath).toBe(k);
  });
});

describe("Discovering flat companion Markdown files", () => {
  it("given a repo with only flat companions, lists every *.md under source", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-migrate-discover-"));
    const storage = ".parallel-docs";
    const sourceDir = path.join(dir, storage, "source");
    await mkdir(path.join(sourceDir, "docs", "spec"), { recursive: true });
    await writeFile(path.join(sourceDir, "README.md.md"), "# x\n", "utf8");
    await writeFile(path.join(sourceDir, "docs", "spec", "blocks.md.md"), "# y\n", "utf8");
    const found = await discoverFlatCompanionMarkdownFiles(dir, storage);
    expect(found.map((f) => f.sourcePath).sort()).toEqual(
      ["README.md", "docs/spec/blocks.md"].sort(),
    );
    await rm(dir, { recursive: true, force: true });
  });

  it("given the angles sentinel exists, returns an empty list", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-migrate-sentinel-"));
    const storage = ".parallel-docs";
    const sentinel = path.join(dir, ...parallelDocsAnglesSentinelPath(storage).split("/"));
    await mkdir(path.dirname(sentinel), { recursive: true });
    await writeFile(sentinel, "", "utf8");
    await writeFile(path.join(dir, storage, "source", "README.md.md"), "# x\n", "utf8");
    expect(await discoverFlatCompanionMarkdownFiles(dir, storage)).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});

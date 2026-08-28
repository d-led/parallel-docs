import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeParallelDocsConfig } from "./config.js";
import {
  applyPathRenamesToParallelDocsIndex,
  inferAngleIdFromParallelDocsPath,
} from "./parallel-docs-index-renames.js";
import { CURRENT_SCHEMA_VERSION } from "./model.js";

describe("Inferring angle ids from companion paths", () => {
  it("extracts the angle file stem from an Angles-layout path", () => {
    expect(
      inferAngleIdFromParallelDocsPath(
        ".parallel-docs/source/pkg/foo.ts/intro.md",
        "pkg/foo.ts",
        ".parallel-docs",
      ),
    ).toBe("intro");
  });
});

describe("Applying Git path renames to the ParallelDocs index", () => {
  it("updates flat-layout source and parallel-docs paths", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-rename-flat-"));
    try {
      await mkdir(path.join(repo, ".parallel-docs", "source"), { recursive: true });
      const cfg = mergeParallelDocsConfig(null);
      const index = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        byParallelDocsPath: {
          ".parallel-docs/source/src/old.ts.md": {
            sourcePath: "src/old.ts",
            parallelDocsPath: ".parallel-docs/source/src/old.ts.md",
            blocks: [],
          },
        },
      };
      const { index: next, changed } = applyPathRenamesToParallelDocsIndex(
        index,
        [{ from: "src/old.ts", to: "src/new.ts" }],
        repo,
        cfg,
      );
      expect(changed).toBe(true);
      const cp = ".parallel-docs/source/src/new.ts.md";
      expect(next.byParallelDocsPath[cp]).toEqual({
        sourcePath: "src/new.ts",
        parallelDocsPath: cp,
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("updates Angles-layout paths when the source file moves", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-rename-ang-"));
    try {
      const sd = path.join(repo, ".parallel-docs", "source");
      await mkdir(sd, { recursive: true });
      await writeFile(path.join(sd, ".default"), "sentinel\n", "utf8");
      const cfg = mergeParallelDocsConfig(null);
      const oldCp = ".parallel-docs/source/src/a.ts/intro.md";
      const index = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        byParallelDocsPath: {
          [oldCp]: {
            sourcePath: "src/a.ts",
            parallelDocsPath: oldCp,
            blocks: [],
          },
        },
      };
      const { index: next, changed } = applyPathRenamesToParallelDocsIndex(
        index,
        [{ from: "src/a.ts", to: "src/b/a.ts" }],
        repo,
        cfg,
      );
      expect(changed).toBe(true);
      const newCp = ".parallel-docs/source/src/b/a.ts/intro.md";
      expect(next.byParallelDocsPath[newCp]?.sourcePath).toBe("src/b/a.ts");
      expect(next.byParallelDocsPath[newCp]?.parallelDocsPath).toBe(newCp);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  parallelDocsActiveEditorUiFlags,
  parallelDocsStorageSourcePrefix,
} from "./parallel-docs-active-editor-ui-context.js";

async function withParallelDocsAnglesSentinelRepo(
  tmpPrefix: string,
  fn: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), tmpPrefix));
  try {
    const sentinel = path.join(tmpRepo, ".parallel-docs", "source", ".default");
    await mkdir(path.dirname(sentinel), { recursive: true });
    await writeFile(sentinel, "", "utf8");
    await fn(tmpRepo);
  } finally {
    await rm(tmpRepo, { recursive: true, force: true }).catch(() => {});
  }
}

describe("parallelDocsStorageSourcePrefix", () => {
  it("given a storage dir with backslashes, when building the prefix, then the prefix uses forward slashes", () => {
    expect(parallelDocsStorageSourcePrefix(".parallel-docs")).toBe(".parallel-docs/source/");
    expect(parallelDocsStorageSourcePrefix("docs-cr")).toBe("docs-cr/source/");
  });
});

describe("parallelDocsActiveEditorUiFlags", () => {
  it("given a primary source path outside storage, when computing flags, then neither companion flag is set", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: "packages/core/src/foo.ts",
      storageDir: ".parallel-docs",
      repoRoot: "/tmp/ignored-for-this-case",
    });
    expect(flags).toEqual({
      underCompanionSourceTree: false,
      isResolvableCompanionMarkdown: false,
    });
  });

  it("given a flat companion markdown path and angles off, when computing flags, then both companion flags are set", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: ".parallel-docs/source/src/sample.ts.md",
      storageDir: ".parallel-docs",
      repoRoot: "/tmp/ignored",
    });
    expect(flags).toEqual({
      underCompanionSourceTree: true,
      isResolvableCompanionMarkdown: true,
    });
  });

  it("given a path under storage that is not companion markdown, when computing flags, then under-tree is true but markdown is not resolvable", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: ".parallel-docs/source/README.txt",
      storageDir: ".parallel-docs",
      repoRoot: "/tmp/ignored",
    });
    expect(flags).toEqual({
      underCompanionSourceTree: true,
      isResolvableCompanionMarkdown: false,
    });
  });

  it("given a custom storage dir, when the path is under that dir’s source tree, then flags use the same prefix rule", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: "docs-cr/source/a.ts.md",
      storageDir: "docs-cr",
      repoRoot: "/tmp/ignored",
    });
    expect(flags).toEqual({
      underCompanionSourceTree: true,
      isResolvableCompanionMarkdown: true,
    });
  });

  it("given angles sentinel exists on disk, when the path is a per-angle companion markdown, then markdown is resolvable", async () => {
    await withParallelDocsAnglesSentinelRepo("cr-ui-angles-", async (tmpRepo) => {
      const flags = parallelDocsActiveEditorUiFlags({
        normalizedRepoRelativePath: ".parallel-docs/source/pkg/mod.ts/main.md",
        storageDir: ".parallel-docs",
        repoRoot: tmpRepo,
      });
      expect(flags).toEqual({
        underCompanionSourceTree: true,
        isResolvableCompanionMarkdown: true,
      });
    });
  });

  it("given angles sentinel exists, when the companion uses another angle id, then markdown is still resolvable", async () => {
    await withParallelDocsAnglesSentinelRepo("cr-ui-angles-readme-", async (tmpRepo) => {
      const flags = parallelDocsActiveEditorUiFlags({
        normalizedRepoRelativePath: ".parallel-docs/source/README.md/architecture.md",
        storageDir: ".parallel-docs",
        repoRoot: tmpRepo,
      });
      expect(flags).toEqual({
        underCompanionSourceTree: true,
        isResolvableCompanionMarkdown: true,
      });
    });
  });

  it("given angles sentinel is missing, when the path looks like nested folders plus markdown, then flat slice rule applies", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: ".parallel-docs/source/pkg/mod.ts/main.md",
      storageDir: ".parallel-docs",
      repoRoot: "/tmp/no-sentinel",
    });
    expect(flags.underCompanionSourceTree).toBe(true);
    expect(flags.isResolvableCompanionMarkdown).toBe(true);
  });

  it("given static_site.parallel_docs_markdown points outside storage, when that file is active, then it is still treated as a resolvable companion", () => {
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: "README.md.md",
      storageDir: ".parallel-docs",
      repoRoot: "/tmp/ignored",
      staticSiteParallelDocsMarkdownFile: "README.md.md",
    });
    expect(flags).toEqual({
      underCompanionSourceTree: true,
      isResolvableCompanionMarkdown: true,
    });
  });
});

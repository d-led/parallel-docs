import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { SERVE_ROUTE_GENERATE_ENTRY, SERVE_ROUTE_INIT, runServeAction } from "./serve.js";

async function readIndexByParallelDocsPath(repo: string): Promise<
  Record<
    string,
    {
      sourcePath: string;
      parallelDocsPath: string;
      blocks?: unknown[];
    }
  >
> {
  const indexRaw = await readFile(
    path.join(repo, ".parallel-docs", "metadata", "index.json"),
    "utf8",
  );
  const index = JSON.parse(indexRaw) as {
    byParallelDocsPath: Record<
      string,
      {
        sourcePath: string;
        parallelDocsPath: string;
        blocks?: unknown[];
      }
    >;
  };
  return index.byParallelDocsPath;
}

describe("serve actions", () => {
  it("init action creates ParallelDocs bootstrap files and triggers rebuild", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-init-"));
    const rebuild = vi.fn(async () => {});
    try {
      await runServeAction(SERVE_ROUTE_INIT, { repoRoot: repo, rebuild });
      const index = await readFile(
        path.join(repo, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      expect(index).toContain("schemaVersion");
      expect(rebuild).toHaveBeenCalledWith(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("generate-entry creates companion markdown for static_site.source_file and rebuilds", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-entry-"));
    const rebuild = vi.fn(async () => {});
    try {
      await writeFile(
        path.join(repo, ".parallel-docs.toml"),
        ["[static_site]", 'source_file = "docs/overview.md"', ""].join("\n"),
        "utf8",
      );
      await runServeAction(SERVE_ROUTE_GENERATE_ENTRY, { repoRoot: repo, rebuild });

      const generated = await readFile(
        path.join(repo, ".parallel-docs", "source", "docs", "overview.md", "main.md"),
        "utf8",
      );
      expect(generated).toContain("docs/overview.md");

      const indexRaw = await readFile(
        path.join(repo, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as {
        byParallelDocsPath: Record<
          string,
          { sourcePath: string; parallelDocsPath: string; blocks: unknown[] }
        >;
      };
      const key = ".parallel-docs/source/docs/overview.md/main.md";
      expect(index.byParallelDocsPath[key]).toEqual({
        sourcePath: "docs/overview.md",
        parallelDocsPath: key,
        blocks: [],
      });
      expect(rebuild).toHaveBeenCalledWith(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("generate-entry uses angle layout after init action", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-entry-init-first-"));
    const rebuild = vi.fn(async () => {});
    try {
      await writeFile(
        path.join(repo, ".parallel-docs.toml"),
        ["[static_site]", 'source_file = "docs/overview.md"', ""].join("\n"),
        "utf8",
      );

      await runServeAction(SERVE_ROUTE_INIT, { repoRoot: repo, rebuild });
      await runServeAction(SERVE_ROUTE_GENERATE_ENTRY, { repoRoot: repo, rebuild });

      const generated = await readFile(
        path.join(repo, ".parallel-docs", "source", "docs", "overview.md", "main.md"),
        "utf8",
      );
      expect(generated).toContain("docs/overview.md");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe("serve actions (explicit static companion path)", () => {
  it("generate-entry honors explicit static_site.parallel_docs_markdown path", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-entry-explicit-"));
    const rebuild = vi.fn(async () => {});
    try {
      await writeFile(
        path.join(repo, ".parallel-docs.toml"),
        [
          "[static_site]",
          'source_file = "README.md"',
          'parallel_docs_markdown = "parallel-docs.md"',
          "",
        ].join("\n"),
        "utf8",
      );

      await runServeAction(SERVE_ROUTE_GENERATE_ENTRY, { repoRoot: repo, rebuild });

      const generated = await readFile(path.join(repo, "parallel-docs.md"), "utf8");
      expect(generated).toContain("README.md");

      const byParallelDocsPath = await readIndexByParallelDocsPath(repo);
      const entry = byParallelDocsPath["parallel-docs.md"];
      expect(entry?.sourcePath).toBe("README.md");
      expect(entry?.parallelDocsPath).toBe("parallel-docs.md");
      expect(Array.isArray(entry?.blocks)).toBe(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

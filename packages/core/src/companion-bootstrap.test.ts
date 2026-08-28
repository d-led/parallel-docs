import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureCompanionForSource } from "./companion-bootstrap.js";

describe("ensureCompanionForSource", () => {
  it("creates companion markdown and index entry when missing", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-core-companion-"));
    try {
      await writeFile(path.join(repo, ".parallel-docs.toml"), "", "utf8");
      const out = await ensureCompanionForSource(repo, "README.md");

      expect(out.createdMarkdown).toBe(true);
      expect(out.createdIndexEntry).toBe(true);
      expect(out.parallelDocsPath).toBe(".parallel-docs/source/README.md.md");

      const md = await readFile(path.join(repo, out.parallelDocsPath), "utf8");
      expect(md).toContain("# README.md");

      const indexRaw = await readFile(
        path.join(repo, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as {
        byParallelDocsPath: Record<string, { sourcePath: string; blocks: unknown[] }>;
      };
      expect(index.byParallelDocsPath[out.parallelDocsPath]).toEqual({
        sourcePath: "README.md",
        parallelDocsPath: out.parallelDocsPath,
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("is idempotent when companion and index entry already exist", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-core-companion-idem-"));
    try {
      await writeFile(path.join(repo, ".parallel-docs.toml"), "", "utf8");
      await ensureCompanionForSource(repo, "README.md");

      const out = await ensureCompanionForSource(repo, "README.md");
      expect(out.createdMarkdown).toBe(false);
      expect(out.createdIndexEntry).toBe(false);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("respects explicit parallel-docs path override and still upserts index", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "parallel-docs-core-companion-explicit-"));
    try {
      await writeFile(path.join(repo, ".parallel-docs.toml"), "", "utf8");
      const out = await ensureCompanionForSource(repo, "README.md", {
        parallelDocsPath: "parallel-docs.md",
      });

      expect(out.parallelDocsPath).toBe("parallel-docs.md");
      const md = await readFile(path.join(repo, "parallel-docs.md"), "utf8");
      expect(md).toContain("# README.md");

      const indexRaw = await readFile(
        path.join(repo, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as {
        byParallelDocsPath: Record<string, { sourcePath: string; parallelDocsPath: string }>;
      };
      expect(index.byParallelDocsPath["parallel-docs.md"]).toEqual({
        sourcePath: "README.md",
        parallelDocsPath: "parallel-docs.md",
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

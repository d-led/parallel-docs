import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@parallel-docs/core";

import {
  PARALLEL_DOCS_VSCODE_EXTENSION_ID,
  mergeParallelDocsVscodeExtensionRecommendation,
  runInitFull,
} from "./init.js";

describe("Full init in an empty or partial repository", () => {
  it("creates storage, index, config, and MCP harness configs on a fresh directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-"));
    try {
      const code = await runInitFull(dir);
      expect(code).toBe(0);
      const indexRaw = await readFile(
        path.join(dir, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as { schemaVersion: number };
      expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      await readFile(path.join(dir, ".parallel-docs.toml"), "utf8");
      const extRaw = await readFile(path.join(dir, ".vscode", "extensions.json"), "utf8");
      const ext = JSON.parse(extRaw) as { recommendations: string[] };
      expect(ext.recommendations).toContain(PARALLEL_DOCS_VSCODE_EXTENSION_ID);

      // MCP harness configs should be written during init
      const vscodeMcp = JSON.parse(await readFile(path.join(dir, ".vscode", "mcp.json"), "utf8"));
      expect(vscodeMcp).toHaveProperty("servers.parallel-docs.type", "stdio");
      expect(vscodeMcp).toHaveProperty("servers.parallel-docs.command", "parallel-docs");
      expect(vscodeMcp).toHaveProperty("servers.parallel-docs.description");

      const claudeMcp = JSON.parse(await readFile(path.join(dir, ".claude", "mcp.json"), "utf8"));
      expect(claudeMcp).toHaveProperty("servers.parallel-docs.type", "stdio");
      expect(claudeMcp).toHaveProperty("servers.parallel-docs.description");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent on a second run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-2-"));
    try {
      expect(await runInitFull(dir)).toBe(0);
      expect(await runInitFull(dir)).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates an existing legacy index on disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-mig-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await mkdir(path.join(dir, ".parallel-docs", "metadata"), { recursive: true });
      await mkdir(path.join(dir, ".parallel-docs", "source"), { recursive: true });
      const legacy = {
        schemaVersion: 2,
        bySourceFile: {
          "src/a.ts": {
            sourcePath: "src/a.ts",
            parallelDocsPath: ".parallel-docs/source/src/a.ts.md",
            blocks: [{ id: "b1", anchor: "lines:1-2" }],
          },
        },
      };
      await writeFile(
        path.join(dir, ".parallel-docs", "metadata", "index.json"),
        JSON.stringify(legacy, null, 2),
        "utf8",
      );
      expect(await runInitFull(dir)).toBe(0);
      const round = JSON.parse(
        await readFile(path.join(dir, ".parallel-docs", "metadata", "index.json"), "utf8"),
      ) as { schemaVersion: number; byParallelDocsPath?: Record<string, unknown> };
      expect(round.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(round.byParallelDocsPath).toBeDefined();
    } finally {
      warn.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns non-zero when index.json is invalid JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-bad-"));
    try {
      await mkdir(path.join(dir, ".parallel-docs", "metadata"), { recursive: true });
      await mkdir(path.join(dir, ".parallel-docs", "source"), { recursive: true });
      await writeFile(
        path.join(dir, ".parallel-docs", "metadata", "index.json"),
        "{not json\n",
        "utf8",
      );
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await runInitFull(dir)).toBe(1);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Init gitignore integration", () => {
  it("appends _site to .gitignore when missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-gitignore-"));
    try {
      await writeFile(path.join(dir, ".gitignore"), "node_modules\n", "utf8");
      expect(await runInitFull(dir)).toBe(0);
      const next = await readFile(path.join(dir, ".gitignore"), "utf8");
      expect(next).toContain("node_modules\n");
      expect(next.endsWith("_site\n")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate _site in .gitignore", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-init-gitignore-dupe-"));
    try {
      await writeFile(path.join(dir, ".gitignore"), "node_modules\n_site\n", "utf8");
      expect(await runInitFull(dir)).toBe(0);
      const next = await readFile(path.join(dir, ".gitignore"), "utf8");
      const lines = next.split(/\r?\n/).filter((line) => line === "_site");
      expect(lines).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("VS Code extension recommendations for ParallelDocs", () => {
  it("creates .vscode/extensions.json when absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-ext-"));
    try {
      expect(await mergeParallelDocsVscodeExtensionRecommendation(dir)).toBe("wrote");
      const ext = JSON.parse(
        await readFile(path.join(dir, ".vscode", "extensions.json"), "utf8"),
      ) as { recommendations: string[] };
      expect(ext.recommendations).toEqual([PARALLEL_DOCS_VSCODE_EXTENSION_ID]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("appends ParallelDocs without removing other recommendations", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-ext-2-"));
    try {
      await mkdir(path.join(dir, ".vscode"), { recursive: true });
      await writeFile(
        path.join(dir, ".vscode", "extensions.json"),
        JSON.stringify({ recommendations: ["ms-python.python"] }, null, 2) + "\n",
        "utf8",
      );
      expect(await mergeParallelDocsVscodeExtensionRecommendation(dir)).toBe("wrote");
      const ext = JSON.parse(
        await readFile(path.join(dir, ".vscode", "extensions.json"), "utf8"),
      ) as { recommendations: string[] };
      expect(ext.recommendations).toEqual(["ms-python.python", PARALLEL_DOCS_VSCODE_EXTENSION_ID]);
      expect(await mergeParallelDocsVscodeExtensionRecommendation(dir)).toBe("unchanged");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves invalid JSON untouched and returns skipped", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-ext-bad-"));
    try {
      await mkdir(path.join(dir, ".vscode"), { recursive: true });
      const bad = "{ not json\n";
      await writeFile(path.join(dir, ".vscode", "extensions.json"), bad, "utf8");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await mergeParallelDocsVscodeExtensionRecommendation(dir)).toBe("skipped");
      expect(await readFile(path.join(dir, ".vscode", "extensions.json"), "utf8")).toBe(bad);
      warn.mockRestore();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

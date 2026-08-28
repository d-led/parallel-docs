import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION } from "./model.js";
import { initializeParallelDocsProject, isParallelDocsProjectInitialized } from "./init-project.js";

describe("initializeParallelDocsProject", () => {
  it("creates config and storage metadata by default", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-core-init-"));
    try {
      const init = await initializeParallelDocsProject(dir);
      expect(init.createdIndex).toBe(true);
      expect(init.createdToml).toBe(true);
      expect(init.addedSiteGitignore).toBe(true);

      const indexRaw = await readFile(
        path.join(dir, ".parallel-docs", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as { schemaVersion: number };
      expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const sentinelRaw = await readFile(
        path.join(dir, ".parallel-docs", "source", ".default"),
        "utf8",
      );
      expect(sentinelRaw).toBe("");
      expect(await isParallelDocsProjectInitialized(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate _site in .gitignore", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "parallel-docs-core-init-ignore-"));
    try {
      await writeFile(path.join(dir, ".gitignore"), "node_modules\n_site\n", "utf8");
      const init = await initializeParallelDocsProject(dir);
      expect(init.addedSiteGitignore).toBe(false);

      const gitignore = await readFile(path.join(dir, ".gitignore"), "utf8");
      const siteLines = gitignore.split(/\r?\n/).filter((line) => line === "_site");
      expect(siteLines).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

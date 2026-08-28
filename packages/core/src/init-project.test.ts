import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION } from "./model.js";
import { initializeSideTrackProject, isSideTrackProjectInitialized } from "./init-project.js";

describe("initializeSideTrackProject", () => {
  it("creates config and storage metadata by default", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sidetrack-core-init-"));
    try {
      const init = await initializeSideTrackProject(dir);
      expect(init.createdIndex).toBe(true);
      expect(init.createdToml).toBe(true);
      expect(init.addedSiteGitignore).toBe(true);

      const indexRaw = await readFile(
        path.join(dir, ".sidetrack", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as { schemaVersion: number };
      expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const sentinelRaw = await readFile(
        path.join(dir, ".sidetrack", "source", ".default"),
        "utf8",
      );
      expect(sentinelRaw).toBe("");
      expect(await isSideTrackProjectInitialized(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate _site in .gitignore", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sidetrack-core-init-ignore-"));
    try {
      await writeFile(path.join(dir, ".gitignore"), "node_modules\n_site\n", "utf8");
      const init = await initializeSideTrackProject(dir);
      expect(init.addedSiteGitignore).toBe(false);

      const gitignore = await readFile(path.join(dir, ".gitignore"), "utf8");
      const siteLines = gitignore.split(/\r?\n/).filter((line) => line === "_site");
      expect(siteLines).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

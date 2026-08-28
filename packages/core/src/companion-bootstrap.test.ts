import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureCompanionForSource } from "./companion-bootstrap.js";

describe("ensureCompanionForSource", () => {
  it("creates companion markdown and index entry when missing", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "sidetrack-core-companion-"));
    try {
      await writeFile(path.join(repo, ".sidetrack.toml"), "", "utf8");
      const out = await ensureCompanionForSource(repo, "README.md");

      expect(out.createdMarkdown).toBe(true);
      expect(out.createdIndexEntry).toBe(true);
      expect(out.sidetrackPath).toBe(".sidetrack/source/README.md.md");

      const md = await readFile(path.join(repo, out.sidetrackPath), "utf8");
      expect(md).toContain("# README.md");

      const indexRaw = await readFile(
        path.join(repo, ".sidetrack", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as {
        bySideTrackPath: Record<string, { sourcePath: string; blocks: unknown[] }>;
      };
      expect(index.bySideTrackPath[out.sidetrackPath]).toEqual({
        sourcePath: "README.md",
        sidetrackPath: out.sidetrackPath,
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("is idempotent when companion and index entry already exist", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "sidetrack-core-companion-idem-"));
    try {
      await writeFile(path.join(repo, ".sidetrack.toml"), "", "utf8");
      await ensureCompanionForSource(repo, "README.md");

      const out = await ensureCompanionForSource(repo, "README.md");
      expect(out.createdMarkdown).toBe(false);
      expect(out.createdIndexEntry).toBe(false);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("respects explicit sidetrack path override and still upserts index", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "sidetrack-core-companion-explicit-"));
    try {
      await writeFile(path.join(repo, ".sidetrack.toml"), "", "utf8");
      const out = await ensureCompanionForSource(repo, "README.md", {
        sidetrackPath: "sidetrack.md",
      });

      expect(out.sidetrackPath).toBe("sidetrack.md");
      const md = await readFile(path.join(repo, "sidetrack.md"), "utf8");
      expect(md).toContain("# README.md");

      const indexRaw = await readFile(
        path.join(repo, ".sidetrack", "metadata", "index.json"),
        "utf8",
      );
      const index = JSON.parse(indexRaw) as {
        bySideTrackPath: Record<string, { sourcePath: string; sidetrackPath: string }>;
      };
      expect(index.bySideTrackPath["sidetrack.md"]).toEqual({
        sourcePath: "README.md",
        sidetrackPath: "sidetrack.md",
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

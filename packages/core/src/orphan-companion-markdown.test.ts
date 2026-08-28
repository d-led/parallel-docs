import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { sidetrackAnglesSentinelPath } from "./paths.js";
import {
  collectOrphanCompanionMarkdownTargets,
  orphanCompanionCleanupAbsPath,
  pruneOrphanCompanionMarkdown,
} from "./orphan-companion-markdown.js";

describe("orphanCompanionCleanupAbsPath", () => {
  it("targets the flat companion file when Angles layout is off", () => {
    const root = "/repo";
    const storage = ".sidetrack";
    const got = orphanCompanionCleanupAbsPath(root, storage, "README.md.md", false);
    expect(got).toBe(path.join(root, ".sidetrack", "source", "README.md.md"));
  });

  it("targets the per-source directory when Angles layout is on", () => {
    const root = "/repo";
    const storage = ".sidetrack";
    const got = orphanCompanionCleanupAbsPath(root, storage, "docs/plan/plan.md/main.md", true);
    expect(got).toBe(path.join(root, ".sidetrack", "source", "docs", "plan", "plan.md"));
  });
});

describe("collectOrphanCompanionMarkdownTargets", () => {
  it("lists Angles companions whose primary source file is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-orph-collect-"));
    const storage = ".sidetrack";
    const sentinel = sidetrackAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    await mkdir(path.join(dir, storage, "source", "docs", "plan", "plan.md"), { recursive: true });
    await writeFile(
      path.join(dir, storage, "source", "docs", "plan", "plan.md", "main.md"),
      "# orphan\n",
      "utf8",
    );

    const orphans = await collectOrphanCompanionMarkdownTargets(dir, storage);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.sourcePath).toBe("docs/plan/plan.md");
    expect(orphans[0]?.cleanupIsDirectory).toBe(true);
  });
});

describe("pruneOrphanCompanionMarkdown", () => {
  it("dry-run does not delete files but returns planned paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-orph-dry-"));
    const storage = ".sidetrack";
    const sentinel = sidetrackAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    const mdPath = path.join(dir, storage, "source", "docs", "orph", "x.md", "main.md");
    await mkdir(path.dirname(mdPath), { recursive: true });
    await writeFile(mdPath, "# x\n", "utf8");

    const { removedAbsPaths } = await pruneOrphanCompanionMarkdown(dir, storage, {
      dryRun: true,
    });
    expect(removedAbsPaths.length).toBe(1);
    await expect(readFile(mdPath, "utf8")).resolves.toContain("# x");
  });

  it("removes orphan Angles companion directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-orph-prune-"));
    const storage = ".sidetrack";
    const sentinel = sidetrackAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    const mdPath = path.join(dir, storage, "source", "docs", "orph2", "y.md", "main.md");
    await mkdir(path.dirname(mdPath), { recursive: true });
    await writeFile(mdPath, "# y\n", "utf8");

    const { removedAbsPaths } = await pruneOrphanCompanionMarkdown(dir, storage);
    expect(removedAbsPaths.length).toBe(1);
    await expect(access(mdPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

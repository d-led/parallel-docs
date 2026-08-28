import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureAnglesSentinelFile } from "./angles-toml.js";
import { mergeParallelDocsConfig } from "./config.js";
import { resolveParallelDocsMarkdownPath } from "./parallel-docs-path-resolution.js";

describe("Resolving companion Markdown paths from CLI arguments", () => {
  it("uses flat mapping when the Angles sentinel is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-flat-"));
    const cfg = mergeParallelDocsConfig(null);
    const r = resolveParallelDocsMarkdownPath(dir, "README.md", cfg, null);
    expect(r.anglesLayout).toBe(false);
    expect(r.angleId).toBeNull();
    expect(r.parallelDocsPath).toBe(".parallel-docs/source/README.md.md");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("uses per-angle paths when the sentinel exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-ang-"));
    const storage = ".parallel-docs";
    const sourceDir = path.join(dir, storage, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, ".default"), "", "utf8");
    const cfg = mergeParallelDocsConfig({
      angles: { default_angle: "intro", definitions: [{ id: "intro", title: "Intro" }] },
    });
    const r = resolveParallelDocsMarkdownPath(dir, "README.md", cfg, null);
    expect(r.anglesLayout).toBe(true);
    expect(r.angleId).toBe("intro");
    expect(r.parallelDocsPath).toBe(".parallel-docs/source/README.md/intro.md");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("honors an explicit angle id", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-ang2-"));
    const storage = ".parallel-docs";
    const sourceDir = path.join(dir, storage, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, ".default"), "", "utf8");
    const cfg = mergeParallelDocsConfig(null);
    const r = resolveParallelDocsMarkdownPath(dir, "src/a.ts", cfg, "deep-dive");
    expect(r.angleId).toBe("deep-dive");
    expect(r.parallelDocsPath).toBe(".parallel-docs/source/src/a.ts/deep-dive.md");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("when Angles layout is turned on, tooling resolves per-angle paths but legacy flat files stay on disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-flat-to-ang-"));
    const storage = ".parallel-docs";
    const flatMd = path.join(dir, storage, "source", "pkg", "mod.ts.md");
    await fs.mkdir(path.dirname(flatMd), { recursive: true });
    await fs.writeFile(flatMd, "legacy flat body\n", "utf8");

    await ensureAnglesSentinelFile(dir, storage);
    const cfg = mergeParallelDocsConfig({
      angles: { default_angle: "main", definitions: [{ id: "main", title: "Main" }] },
    });
    const r = resolveParallelDocsMarkdownPath(dir, "pkg/mod.ts", cfg, null);

    expect(r.anglesLayout).toBe(true);
    expect(r.angleId).toBe("main");
    expect(r.parallelDocsPath).toBe(".parallel-docs/source/pkg/mod.ts/main.md");

    expect(await fs.readFile(flatMd, "utf8")).toBe("legacy flat body\n");
    const angleAbs = path.join(dir, ...r.parallelDocsPath.split("/"));
    await expect(fs.access(angleAbs)).rejects.toMatchObject({ code: "ENOENT" });

    await fs.rm(dir, { recursive: true, force: true });
  });
});

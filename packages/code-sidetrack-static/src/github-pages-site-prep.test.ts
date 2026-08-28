import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION } from "@sidetrack/core";

import {
  blockStretchRowsForDocumentedPair,
  loadMultiAngleBrowsingIfEnabled,
  readFlatCompanionMarkdown,
} from "./github-pages-site-prep.js";

async function cleanupTempDirs(tempDirs: string[]): Promise<void> {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }),
  );
}

function flatCfg() {
  return { storageDir: ".sidetrack", angles: { definitions: [] } };
}

function flatStaticSite(sourceFile: string, sidetrackMarkdownFile?: string) {
  return {
    sourceFile,
    ...(sidetrackMarkdownFile ? { sidetrackMarkdownFile } : {}),
    introMarkdown: "",
    githubUrl: "",
    githubBlobBranch: "main",
  };
}

describe("blockStretchRowsForDocumentedPair", () => {
  const cr = ".sidetrack/source/extra.ts/main.md";
  const index = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bySideTrackPath: {
      [cr]: {
        sourcePath: "extra.ts",
        sidetrackPath: cr,
        blocks: [{ id: "b1", anchor: "lines:1-2" }],
      },
    },
  };

  it("returns undefined when the index is missing", () => {
    expect(blockStretchRowsForDocumentedPair(null, "extra.ts", cr)).toBeUndefined();
  });

  it("returns undefined when the source path does not match the index entry", () => {
    expect(blockStretchRowsForDocumentedPair(index, "other.ts", cr)).toBeUndefined();
  });

  it("returns wiring for a matching pair with blocks", () => {
    expect(blockStretchRowsForDocumentedPair(index, "extra.ts", cr)).toEqual({
      index,
      sourceRelative: "extra.ts",
      sidetrackPathRel: cr,
    });
  });

  it("returns undefined when the sidetrack path is not a key in the index", () => {
    expect(
      blockStretchRowsForDocumentedPair(index, "extra.ts", ".sidetrack/source/extra.ts/other.md"),
    ).toBeUndefined();
  });

  it("returns undefined when the index entry has no blocks", () => {
    const emptyBlocks = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [cr]: {
          sourcePath: "extra.ts",
          sidetrackPath: cr,
          blocks: [],
        },
      },
    };
    expect(blockStretchRowsForDocumentedPair(emptyBlocks, "extra.ts", cr)).toBeUndefined();
  });
});

describe("loadMultiAngleBrowsingIfEnabled", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await cleanupTempDirs(tempDirs);
  });

  it("keeps block stretch wiring for angles that rely on marker fallback instead of their own index slice", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-"));
    tempDirs.push(repoRoot);

    const angleDir = path.join(repoRoot, ".sidetrack/source/README.md");
    await mkdir(angleDir, { recursive: true });
    await writeFile(path.join(repoRoot, ".sidetrack/source/.default"), "", "utf8");
    await writeFile(
      path.join(angleDir, "main.md"),
      "<!-- sidetrack:block id=readme-lede -->\n",
      "utf8",
    );
    await writeFile(
      path.join(angleDir, "architecture.md"),
      "<!-- sidetrack:block id=readme-lede -->\n",
      "utf8",
    );

    const cfg = {
      storageDir: ".sidetrack",
      angles: {
        definitions: [
          { id: "main", title: "Main" },
          { id: "architecture", title: "Architecture" },
        ],
      },
    };
    const ss = {
      sourceFile: "README.md",
      introMarkdown: "",
      githubUrl: "https://github.com/d-led/sidetrack",
      githubBlobBranch: "main",
    };
    const projectIndex = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        ".sidetrack/source/README.md/main.md": {
          sourcePath: "README.md",
          sidetrackPath: ".sidetrack/source/README.md/main.md",
          blocks: [{ id: "readme-lede", anchor: "marker:readme-lede", markerId: "readme-lede" }],
        },
      },
    };

    const multi = await loadMultiAngleBrowsingIfEnabled(
      repoRoot,
      cfg as never,
      ss as never,
      projectIndex,
      { owner: "d-led", repo: "sidetrack", branch: "main" },
    );

    expect(multi?.angles).toHaveLength(2);
    const architecture = multi?.angles.find((angle) => angle.id === "architecture");
    expect(architecture?.blockStretchRows).toEqual({
      index: projectIndex,
      sourceRelative: "README.md",
      sidetrackPathRel: ".sidetrack/source/README.md/architecture.md",
    });
  });
});

describe("readFlatCompanionMarkdown", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await cleanupTempDirs(tempDirs);
  });

  it("reads explicit static_site.sidetrack_markdown when configured", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-flat-explicit-"));
    tempDirs.push(repoRoot);
    const rel = ".sidetrack/source/docs/guide.md.md";
    const abs = path.join(repoRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, "# guide\n", "utf8");

    const cfg = flatCfg();
    const ss = flatStaticSite("docs/guide.md", rel);

    const md = await readFlatCompanionMarkdown(repoRoot, cfg as never, ss as never);
    expect(md).toContain("# guide");
  });

  it("falls back to core-resolved default companion path when sidetrack_markdown is omitted", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-flat-fallback-"));
    tempDirs.push(repoRoot);
    const rel = ".sidetrack/source/README.md.md";
    const abs = path.join(repoRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, "# readme\n", "utf8");

    const cfg = flatCfg();
    const ss = flatStaticSite("README.md");

    const md = await readFlatCompanionMarkdown(repoRoot, cfg as never, ss as never);
    expect(md).toContain("# readme");
  });

  it("returns empty markdown when neither configured nor fallback companion file exists", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-flat-missing-"));
    tempDirs.push(repoRoot);

    const cfg = flatCfg();
    const ss = flatStaticSite("README.md");

    const md = await readFlatCompanionMarkdown(repoRoot, cfg as never, ss as never);
    expect(md).toBe("");
  });

  it("returns empty when explicit sidetrack_markdown points to a directory", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-flat-eisdir-"));
    tempDirs.push(repoRoot);

    const configuredDir = path.join(repoRoot, ".sidetrack", "source", "README.md");
    await mkdir(configuredDir, { recursive: true });

    const cfg = flatCfg();
    const ss = flatStaticSite("README.md", ".sidetrack/source/README.md");

    const md = await readFlatCompanionMarkdown(repoRoot, cfg as never, ss as never);
    expect(md).toBe("");
  });

  it("returns empty when explicit sidetrack_markdown file is missing", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "sidetrack-prep-flat-explicit-missing-"));
    tempDirs.push(repoRoot);

    const cfg = flatCfg();
    const ss = flatStaticSite("README.md", "sidetrack.md");

    const md = await readFlatCompanionMarkdown(repoRoot, cfg as never, ss as never);
    expect(md).toBe("");
  });
});

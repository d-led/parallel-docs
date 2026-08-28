import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION, parallelDocsAnglesSentinelPath } from "@parallel-docs/core";
import { describe, expect, it } from "vitest";

import { buildParallelDocsNavSearchDocument } from "./build-parallel-docs-nav-search.js";

async function setupRepoWithIndexedPair(opts: {
  sourcePath: string;
  parallelDocsPath: string;
  parallelDocsBody: string;
}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
  const srcDir = path.join(dir, path.dirname(opts.sourcePath));
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(dir, opts.sourcePath), "// indexed source\n", "utf8");
  await mkdir(path.join(dir, path.dirname(opts.parallelDocsPath)), { recursive: true });
  await writeFile(path.join(dir, opts.parallelDocsPath), opts.parallelDocsBody, "utf8");
  await mkdir(path.join(dir, ".parallel-docs/metadata"), { recursive: true });
  await writeFile(
    path.join(dir, ".parallel-docs/metadata/index.json"),
    JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [opts.parallelDocsPath]: {
          sourcePath: opts.sourcePath,
          parallelDocsPath: opts.parallelDocsPath,
          blocks: [],
        },
      },
    }),
    "utf8",
  );
  return dir;
}

describe("Cross-file search manifest — index and fallback", () => {
  it("should index paths and companion lines from metadata without ingesting primary source text", async () => {
    const cr = ".parallel-docs/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      parallelDocsPath: cr,
      parallelDocsBody: "# Title\n\nHello.\n",
    });

    const doc = await buildParallelDocsNavSearchDocument(dir);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.documentedPairs).toEqual([{ sourcePath: "src/a.ts", parallelDocsPath: cr }]);
    expect(doc.rows.some((r) => r.kind === "sourcePath" && r.sourcePath === "src/a.ts")).toBe(true);
    expect(doc.rows.some((r) => r.kind === "parallelDocsPath" && r.parallelDocsPath === cr)).toBe(
      true,
    );
    const lines = doc.rows.filter((r) => r.kind === "parallelDocsLine");
    expect(lines.map((r) => r.text)).toEqual(["# Title", "", "Hello.", ""]);
    expect(lines[0]?.line).toBe(0);
  });

  it("should attach documentedPairs with GitHub blob URLs when a blob base is configured", async () => {
    const cr = ".parallel-docs/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      parallelDocsPath: cr,
      parallelDocsBody: "# Title\n",
    });

    const doc = await buildParallelDocsNavSearchDocument(dir, undefined, {
      owner: "acme",
      repo: "demo",
      branch: "main",
    });
    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "src/a.ts",
        parallelDocsPath: cr,
        sourceOnGithub: "https://github.com/acme/demo/blob/main/src/a.ts",
        parallelDocsOnGithub:
          "https://github.com/acme/demo/blob/main/.parallel-docs/source/src/a.ts.md",
      },
    ]);
  });

  it("should build from a lone companion when metadata is missing and still skip source bodies", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "lib", "x.ts"), "// fallback source\n", "utf8");
    const mdAbs = path.join(dir, "notes.md");
    await writeFile(mdAbs, "One\nTwo\n", "utf8");

    const doc = await buildParallelDocsNavSearchDocument(dir, {
      sourcePath: "lib/x.ts",
      parallelDocsPath: ".parallel-docs/source/lib/x.ts.md",
      markdownAbs: mdAbs,
    });

    expect(doc.rows.filter((r) => r.kind === "sourcePath")).toHaveLength(1);
    expect(doc.rows.filter((r) => r.kind === "parallelDocsLine").map((r) => r.text)).toEqual([
      "One",
      "Two",
      "",
    ]);
    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "lib/x.ts",
        parallelDocsPath: ".parallel-docs/source/lib/x.ts.md",
      },
    ]);
  });

  it("should still emit documentedPairs for fallback-only pairs when GitHub metadata is present", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "lib", "x.ts"), "// fallback source\n", "utf8");
    const mdAbs = path.join(dir, "notes.md");
    await writeFile(mdAbs, "One\n", "utf8");

    const doc = await buildParallelDocsNavSearchDocument(
      dir,
      {
        sourcePath: "lib/x.ts",
        parallelDocsPath: ".parallel-docs/source/lib/x.ts.md",
        markdownAbs: mdAbs,
      },
      { owner: "acme", repo: "demo", branch: "develop" },
    );

    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "lib/x.ts",
        parallelDocsPath: ".parallel-docs/source/lib/x.ts.md",
        sourceOnGithub: "https://github.com/acme/demo/blob/develop/lib/x.ts",
        parallelDocsOnGithub:
          "https://github.com/acme/demo/blob/develop/.parallel-docs/source/lib/x.ts.md",
      },
    ]);
  });
});

describe("Cross-file search manifest — disk merge", () => {
  it("should still list disk companions when the index exists but has no entries yet", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-empty-idx-"));
    await mkdir(path.join(dir, ".parallel-docs", "metadata"), { recursive: true });
    await mkdir(path.join(dir, ".parallel-docs", "source", "src"), { recursive: true });
    await writeFile(
      path.join(dir, ".parallel-docs", "metadata", "index.json"),
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, byParallelDocsPath: {} }, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(dir, ".parallel-docs", "source", "src", "solo.ts.md"),
      "# Solo\n",
      "utf8",
    );
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "solo.ts"), "// solo\n", "utf8");

    const doc = await buildParallelDocsNavSearchDocument(dir);

    expect(doc.documentedPairs).toEqual([
      { sourcePath: "src/solo.ts", parallelDocsPath: ".parallel-docs/source/src/solo.ts.md" },
    ]);
  });

  it("should merge disk-only companions with index-backed pairs for search rows and documentedPairs", async () => {
    const cr = ".parallel-docs/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      parallelDocsPath: cr,
      parallelDocsBody: "# A\n",
    });
    await writeFile(
      path.join(dir, ".parallel-docs", "source", "README.md.md"),
      "# Readme companion\n",
      "utf8",
    );
    await writeFile(path.join(dir, "README.md"), "# root readme\n", "utf8");

    const doc = await buildParallelDocsNavSearchDocument(dir, undefined, {
      owner: "acme",
      repo: "demo",
      branch: "main",
    });

    expect(doc.documentedPairs).toEqual(
      expect.arrayContaining([
        {
          sourcePath: "README.md",
          parallelDocsPath: ".parallel-docs/source/README.md.md",
          sourceOnGithub: "https://github.com/acme/demo/blob/main/README.md",
          parallelDocsOnGithub:
            "https://github.com/acme/demo/blob/main/.parallel-docs/source/README.md.md",
        },
        {
          sourcePath: "src/a.ts",
          parallelDocsPath: cr,
          sourceOnGithub: "https://github.com/acme/demo/blob/main/src/a.ts",
          parallelDocsOnGithub:
            "https://github.com/acme/demo/blob/main/.parallel-docs/source/src/a.ts.md",
        },
      ]),
    );
    expect(doc.documentedPairs).toHaveLength(2);
    expect(doc.rows.some((r) => r.kind === "sourcePath" && r.sourcePath === "README.md")).toBe(
      true,
    );
    const readmeLines = doc.rows.filter(
      (r) =>
        r.kind === "parallelDocsLine" &&
        r.parallelDocsPath === ".parallel-docs/source/README.md.md",
    );
    expect(readmeLines.map((r) => r.text)).toEqual(["# Readme companion", ""]);
  });

  it("omits pairs whose companion exists on disk but the primary source file does not", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-missing-src-"));
    const storage = ".parallel-docs";
    await mkdir(path.join(dir, storage, "metadata"), { recursive: true });
    await writeFile(
      path.join(dir, storage, "metadata", "index.json"),
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, byParallelDocsPath: {} }, null, 2),
      "utf8",
    );
    const sentinel = parallelDocsAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    const cr = `${storage}/source/docs/plan/plan.md/main.md`;
    await mkdir(path.join(dir, path.dirname(cr)), { recursive: true });
    await writeFile(path.join(dir, cr), "# no matching source on disk\n", "utf8");

    const doc = await buildParallelDocsNavSearchDocument(dir);

    expect(doc.documentedPairs ?? []).toHaveLength(0);
    expect(doc.rows).toHaveLength(0);
  });
});

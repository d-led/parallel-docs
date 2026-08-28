import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION, sidetrackAnglesSentinelPath } from "@sidetrack/core";
import { describe, expect, it } from "vitest";

import { buildSideTrackNavSearchDocument } from "./build-sidetrack-nav-search.js";

async function setupRepoWithIndexedPair(opts: {
  sourcePath: string;
  sidetrackPath: string;
  sidetrackBody: string;
}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
  const srcDir = path.join(dir, path.dirname(opts.sourcePath));
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(dir, opts.sourcePath), "// indexed source\n", "utf8");
  await mkdir(path.join(dir, path.dirname(opts.sidetrackPath)), { recursive: true });
  await writeFile(path.join(dir, opts.sidetrackPath), opts.sidetrackBody, "utf8");
  await mkdir(path.join(dir, ".sidetrack/metadata"), { recursive: true });
  await writeFile(
    path.join(dir, ".sidetrack/metadata/index.json"),
    JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [opts.sidetrackPath]: {
          sourcePath: opts.sourcePath,
          sidetrackPath: opts.sidetrackPath,
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
    const cr = ".sidetrack/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      sidetrackPath: cr,
      sidetrackBody: "# Title\n\nHello.\n",
    });

    const doc = await buildSideTrackNavSearchDocument(dir);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.documentedPairs).toEqual([{ sourcePath: "src/a.ts", sidetrackPath: cr }]);
    expect(doc.rows.some((r) => r.kind === "sourcePath" && r.sourcePath === "src/a.ts")).toBe(true);
    expect(doc.rows.some((r) => r.kind === "sidetrackPath" && r.sidetrackPath === cr)).toBe(true);
    const lines = doc.rows.filter((r) => r.kind === "sidetrackLine");
    expect(lines.map((r) => r.text)).toEqual(["# Title", "", "Hello.", ""]);
    expect(lines[0]?.line).toBe(0);
  });

  it("should attach documentedPairs with GitHub blob URLs when a blob base is configured", async () => {
    const cr = ".sidetrack/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      sidetrackPath: cr,
      sidetrackBody: "# Title\n",
    });

    const doc = await buildSideTrackNavSearchDocument(dir, undefined, {
      owner: "acme",
      repo: "demo",
      branch: "main",
    });
    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "src/a.ts",
        sidetrackPath: cr,
        sourceOnGithub: "https://github.com/acme/demo/blob/main/src/a.ts",
        sidetrackOnGithub: "https://github.com/acme/demo/blob/main/.sidetrack/source/src/a.ts.md",
      },
    ]);
  });

  it("should build from a lone companion when metadata is missing and still skip source bodies", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "lib", "x.ts"), "// fallback source\n", "utf8");
    const mdAbs = path.join(dir, "notes.md");
    await writeFile(mdAbs, "One\nTwo\n", "utf8");

    const doc = await buildSideTrackNavSearchDocument(dir, {
      sourcePath: "lib/x.ts",
      sidetrackPath: ".sidetrack/source/lib/x.ts.md",
      markdownAbs: mdAbs,
    });

    expect(doc.rows.filter((r) => r.kind === "sourcePath")).toHaveLength(1);
    expect(doc.rows.filter((r) => r.kind === "sidetrackLine").map((r) => r.text)).toEqual([
      "One",
      "Two",
      "",
    ]);
    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "lib/x.ts",
        sidetrackPath: ".sidetrack/source/lib/x.ts.md",
      },
    ]);
  });

  it("should still emit documentedPairs for fallback-only pairs when GitHub metadata is present", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-"));
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "lib", "x.ts"), "// fallback source\n", "utf8");
    const mdAbs = path.join(dir, "notes.md");
    await writeFile(mdAbs, "One\n", "utf8");

    const doc = await buildSideTrackNavSearchDocument(
      dir,
      {
        sourcePath: "lib/x.ts",
        sidetrackPath: ".sidetrack/source/lib/x.ts.md",
        markdownAbs: mdAbs,
      },
      { owner: "acme", repo: "demo", branch: "develop" },
    );

    expect(doc.documentedPairs).toEqual([
      {
        sourcePath: "lib/x.ts",
        sidetrackPath: ".sidetrack/source/lib/x.ts.md",
        sourceOnGithub: "https://github.com/acme/demo/blob/develop/lib/x.ts",
        sidetrackOnGithub:
          "https://github.com/acme/demo/blob/develop/.sidetrack/source/lib/x.ts.md",
      },
    ]);
  });
});

describe("Cross-file search manifest — disk merge", () => {
  it("should still list disk companions when the index exists but has no entries yet", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-empty-idx-"));
    await mkdir(path.join(dir, ".sidetrack", "metadata"), { recursive: true });
    await mkdir(path.join(dir, ".sidetrack", "source", "src"), { recursive: true });
    await writeFile(
      path.join(dir, ".sidetrack", "metadata", "index.json"),
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, bySideTrackPath: {} }, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(dir, ".sidetrack", "source", "src", "solo.ts.md"),
      "# Solo\n",
      "utf8",
    );
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "solo.ts"), "// solo\n", "utf8");

    const doc = await buildSideTrackNavSearchDocument(dir);

    expect(doc.documentedPairs).toEqual([
      { sourcePath: "src/solo.ts", sidetrackPath: ".sidetrack/source/src/solo.ts.md" },
    ]);
  });

  it("should merge disk-only companions with index-backed pairs for search rows and documentedPairs", async () => {
    const cr = ".sidetrack/source/src/a.ts.md";
    const dir = await setupRepoWithIndexedPair({
      sourcePath: "src/a.ts",
      sidetrackPath: cr,
      sidetrackBody: "# A\n",
    });
    await writeFile(
      path.join(dir, ".sidetrack", "source", "README.md.md"),
      "# Readme companion\n",
      "utf8",
    );
    await writeFile(path.join(dir, "README.md"), "# root readme\n", "utf8");

    const doc = await buildSideTrackNavSearchDocument(dir, undefined, {
      owner: "acme",
      repo: "demo",
      branch: "main",
    });

    expect(doc.documentedPairs).toEqual(
      expect.arrayContaining([
        {
          sourcePath: "README.md",
          sidetrackPath: ".sidetrack/source/README.md.md",
          sourceOnGithub: "https://github.com/acme/demo/blob/main/README.md",
          sidetrackOnGithub:
            "https://github.com/acme/demo/blob/main/.sidetrack/source/README.md.md",
        },
        {
          sourcePath: "src/a.ts",
          sidetrackPath: cr,
          sourceOnGithub: "https://github.com/acme/demo/blob/main/src/a.ts",
          sidetrackOnGithub: "https://github.com/acme/demo/blob/main/.sidetrack/source/src/a.ts.md",
        },
      ]),
    );
    expect(doc.documentedPairs).toHaveLength(2);
    expect(doc.rows.some((r) => r.kind === "sourcePath" && r.sourcePath === "README.md")).toBe(
      true,
    );
    const readmeLines = doc.rows.filter(
      (r) => r.kind === "sidetrackLine" && r.sidetrackPath === ".sidetrack/source/README.md.md",
    );
    expect(readmeLines.map((r) => r.text)).toEqual(["# Readme companion", ""]);
  });

  it("omits pairs whose companion exists on disk but the primary source file does not", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-nav-missing-src-"));
    const storage = ".sidetrack";
    await mkdir(path.join(dir, storage, "metadata"), { recursive: true });
    await writeFile(
      path.join(dir, storage, "metadata", "index.json"),
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, bySideTrackPath: {} }, null, 2),
      "utf8",
    );
    const sentinel = sidetrackAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    const cr = `${storage}/source/docs/plan/plan.md/main.md`;
    await mkdir(path.join(dir, path.dirname(cr)), { recursive: true });
    await writeFile(path.join(dir, cr), "# no matching source on disk\n", "utf8");

    const doc = await buildSideTrackNavSearchDocument(dir);

    expect(doc.documentedPairs ?? []).toHaveLength(0);
    expect(doc.rows).toHaveLength(0);
  });
});

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CURRENT_SCHEMA_VERSION,
  ensureAnglesSentinelFile,
  staticBrowseIndexRelPathFromPair,
  writeIndex,
} from "@parallel-docs/core";
import { buildGithubPagesStaticSite } from "./github-pages-site.js";

async function writeMinimalPagesFixture(
  repo: string,
  opts: {
    title: string;
    githubUrl?: string;
    githubBlobBranch?: string;
    parallelDocsMarkdown?: string;
  },
): Promise<void> {
  const staticSite: string[] = [
    "[static_site]",
    `title = "${opts.title}"`,
    'source_file = "src/x.ts"',
  ];
  const parallelDocsMarkdown = opts.parallelDocsMarkdown ?? ".parallel-docs/source/src/x.ts.md";
  if (parallelDocsMarkdown.trim().length > 0) {
    staticSite.push(`parallel_docs_markdown = "${parallelDocsMarkdown}"`);
  }
  if (opts.githubUrl !== undefined) {
    staticSite.push(`github_url = "${opts.githubUrl}"`);
  }
  if (opts.githubBlobBranch !== undefined) {
    staticSite.push(`github_blob_branch = "${opts.githubBlobBranch}"`);
  }
  await writeFile(
    path.join(repo, ".parallel-docs.toml"),
    [...staticSite, "", "[render]", "mermaid = false", ""].join("\n"),
    "utf8",
  );
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "src", "x.ts"), "export const x = 1;\n", "utf8");
  await mkdir(path.join(repo, ".parallel-docs", "source", "src"), { recursive: true });
  await writeFile(path.join(repo, ".parallel-docs", "source", "src", "x.ts.md"), "# Doc\n", "utf8");
}

/** Shared `[angles]` + `[[angles.definitions]]` + `[render]` tail for README.md hub fixtures. */
const README_ANGLES_TOML_TAIL = [
  "",
  "[angles]",
  'default_angle = "main"',
  "",
  "[[angles.definitions]]",
  'id = "main"',
  'title = "Main"',
  "",
  "[[angles.definitions]]",
  'id = "architecture"',
  'title = "Architecture"',
  "",
  "[render]",
  "mermaid = false",
  "",
] as const;

async function writeReadmeMultiAngleHubToml(repo: string, title: string): Promise<void> {
  await writeFile(
    path.join(repo, ".parallel-docs.toml"),
    [
      "[static_site]",
      `title = "${title}"`,
      'source_file = "README.md"',
      'parallel_docs_markdown = ".parallel-docs/source/README.md/main.md"',
      ...README_ANGLES_TOML_TAIL,
    ].join("\n"),
    "utf8",
  );
}

async function writeReadmeAnglesCompanionStubs(repo: string): Promise<void> {
  await writeFile(path.join(repo, "README.md"), "# App\n", "utf8");
  await mkdir(path.join(repo, ".parallel-docs", "source", "README.md"), { recursive: true });
  await writeFile(
    path.join(repo, ".parallel-docs", "source", "README.md", "main.md"),
    "# Main angle\n",
    "utf8",
  );
  await writeFile(
    path.join(repo, ".parallel-docs", "source", "README.md", "architecture.md"),
    "# Architecture angle\n",
    "utf8",
  );
}

async function seedReadmeAnglesPagesFixture(repo: string, title: string): Promise<void> {
  await ensureAnglesSentinelFile(repo, ".parallel-docs");
  await writeReadmeMultiAngleHubToml(repo, title);
  await writeReadmeAnglesCompanionStubs(repo);
}

const README_MAIN_ANGLE_MD = ".parallel-docs/source/README.md/main.md";
const EXTRA_TS_MAIN_MD = ".parallel-docs/source/extra.ts/main.md";

/** `#shell` opening tag only (matches validate-pages-github-links.mjs). */
function dataParallelDocsPairBrowseHrefFromShellTag(html: string): string | null {
  const m = /<div\b[^>]*\bid="shell"(?=\s|>)[^>]*>/.exec(html);
  if (!m) return null;
  const am = /\bdata-parallel-docs-pair-browse-href="([^"]*)"/.exec(m[0]);
  return am?.[1] ?? null;
}

/** Every emitted browse page must carry the same pair URL the nav indexer exposes (no `/browse/…` drift). */
async function expectBrowseShellPairHrefMatchesNavStaticBrowseUrlForEveryPair(
  siteRoot: string,
): Promise<void> {
  const navPath = path.join(siteRoot, "parallel-docs-nav-search.json");
  const nav = JSON.parse(await readFile(navPath, "utf8")) as {
    documentedPairs?: Array<{ staticBrowseUrl?: string }>;
  };
  for (const p of nav.documentedPairs ?? []) {
    const u = p.staticBrowseUrl?.trim();
    if (u === undefined || u.length === 0) continue;
    const rel = u.replace(/^\.\//, "");
    const pagePath = path.join(siteRoot, rel);
    const html = await readFile(pagePath, "utf8");
    expect(dataParallelDocsPairBrowseHrefFromShellTag(html)).toBe(u);
  }
}

/** README multi-angle hub + `extra.ts` indexed pair (shared by browse scroll-link tests). */
async function seedAnglesHubWithIndexedExtraPair(input: {
  tmpPrefix: string;
  hubTitle: string;
  /** Second source + companion on disk only — not added to `index.json`. */
  withDiskOnlyOrphan: boolean;
}): Promise<{
  repo: string;
  extraCr: string;
  orphanCr: string | undefined;
}> {
  const repo = await mkdtemp(path.join(tmpdir(), input.tmpPrefix));
  await seedReadmeAnglesPagesFixture(repo, input.hubTitle);
  await writeFile(path.join(repo, "extra.ts"), "a\nb\n", "utf8");
  await mkdir(path.join(repo, ".parallel-docs", "source", "extra.ts"), { recursive: true });
  await writeFile(
    path.join(repo, EXTRA_TS_MAIN_MD),
    "<!-- parallelDocs:block id=b1 -->\n\n## Extra doc\n",
    "utf8",
  );

  let orphanCr: string | undefined;
  if (input.withDiskOnlyOrphan) {
    await writeFile(path.join(repo, "orphan.ts"), "x\n", "utf8");
    await mkdir(path.join(repo, ".parallel-docs", "source", "orphan.ts"), { recursive: true });
    orphanCr = ".parallel-docs/source/orphan.ts/main.md";
    await writeFile(
      path.join(repo, orphanCr),
      "<!-- parallelDocs:block id=o1 -->\n\n## Orphan doc\n",
      "utf8",
    );
  }

  await writeIndex(repo, {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byParallelDocsPath: {
      [README_MAIN_ANGLE_MD]: {
        sourcePath: "README.md",
        parallelDocsPath: README_MAIN_ANGLE_MD,
        blocks: [],
      },
      [EXTRA_TS_MAIN_MD]: {
        sourcePath: "extra.ts",
        parallelDocsPath: EXTRA_TS_MAIN_MD,
        blocks: [{ id: "b1", anchor: "lines:1-2" }],
      },
    },
  });

  return { repo, extraCr: EXTRA_TS_MAIN_MD, orphanCr };
}

async function runWritesSiteAndNavFromFlatCompanions(): Promise<string> {
  const r = await mkdtemp(path.join(tmpdir(), "cr-pages-"));
  await writeMinimalPagesFixture(r, {
    title: "Demo",
    githubUrl: "https://github.com/acme/demo",
  });

  const { outHtml, navSearchPath } = await buildGithubPagesStaticSite({ repoRoot: r });

  const html = await readFile(outHtml, "utf8");
  expect(html).toMatch(/hljs language-ts/);
  expect(html).toContain("x =");
  expect(html).toContain("Doc");
  const nav = JSON.parse(await readFile(navSearchPath, "utf8")) as {
    rows?: unknown[];
    documentedPairs?: { staticBrowseUrl?: string }[];
  };
  expect(Array.isArray(nav.rows)).toBe(true);
  expect(nav.documentedPairs?.[0]?.staticBrowseUrl).toBe("./browse/src/x.ts/index.html");
  const browseHtml = await readFile(
    path.join(r, "_site", "browse", "src", "x.ts", "index.html"),
    "utf8",
  );
  const browseFiles = await readdir(path.join(r, "_site", "browse"));
  expect(browseFiles).toContain("src");
  const serveJson = JSON.parse(await readFile(path.join(r, "_site", "serve.json"), "utf8")) as {
    renderSingle?: boolean;
  };
  expect(serveJson.renderSingle).toBe(true);
  expect(browseHtml).toMatch(/hljs language-ts/);
  expect(browseHtml).not.toContain("Redirecting…");
  expect(html).toContain('aria-label="Documentation home"');
  expect(html).toContain('href="./"');
  expect(browseHtml).toContain('href="../../../index.html"');
  expect(browseHtml).toContain('aria-label="Documentation home"');
  expect(browseHtml).toMatch(
    /id="shell"[^>]*data-parallel-docs-pair-browse-href="\.\/browse\/[^"]+"/,
  );
  return r;
}

async function runAngleSelectorOnBrowsePermalinks(): Promise<string> {
  const r = await mkdtemp(path.join(tmpdir(), "cr-pages-ang-"));
  await seedReadmeAnglesPagesFixture(r, "Angles");

  await buildGithubPagesStaticSite({ repoRoot: r });

  const browseDir = path.join(r, "_site", "browse");
  for (const angleId of ["main", "architecture"] as const) {
    const browseHtml = await readFile(
      path.join(browseDir, "README.md", angleId, "index.html"),
      "utf8",
    );
    expect(browseHtml).toContain('aria-label="ParallelDocs angle"');
    expect(browseHtml).toContain('id="parallel-docs-multi-angle-b64"');
    expect(browseHtml).not.toContain("Redirecting…");
    expect(browseHtml).toContain('href="../../../index.html"');
    expect(browseHtml).toContain('aria-label="Documentation home"');
  }
  return r;
}

async function runGithubToolbarUsesBlobUrlsForRealisticHost(): Promise<string> {
  const r = await mkdtemp(path.join(tmpdir(), "cr-pages-realgh-"));
  await writeMinimalPagesFixture(r, {
    title: "Blob shape",
    githubUrl: "https://github.com/d-led/parallel-docs",
    githubBlobBranch: "main",
  });

  const { outHtml, navSearchPath } = await buildGithubPagesStaticSite({ repoRoot: r });
  const html = await readFile(outHtml, "utf8");
  /** Hub `index.html` prefers same-site pair browse; GitHub blobs live in `parallel-docs-nav-search.json`. */
  expect(html).toMatch(/data-parallel-docs-pair-browse-href="\.\/browse\/[^"]+"/);
  expect(html).not.toContain("/browse/browse/");
  const nav = JSON.parse(await readFile(navSearchPath, "utf8")) as {
    documentedPairs?: { sourceOnGithub?: string; parallelDocsOnGithub?: string }[];
  };
  expect(nav.documentedPairs?.[0]?.sourceOnGithub).toBe(
    "https://github.com/d-led/parallel-docs/blob/main/src/x.ts",
  );
  expect(nav.documentedPairs?.[0]?.parallelDocsOnGithub).toBe(
    "https://github.com/d-led/parallel-docs/blob/main/.parallel-docs/source/src/x.ts.md",
  );
  const browseHtml = await readFile(
    path.join(r, "_site", "browse", "src", "x.ts", "index.html"),
    "utf8",
  );
  expect(browseHtml).toMatch(/data-parallel-docs-pair-browse-href="\.\/browse\/[^"]+"/);
  expect(browseHtml).not.toContain("/browse/browse/");
  expect(browseHtml).toMatch(/id="shell"/);
  return r;
}

async function runBrowseWithoutGithubUrl(): Promise<string> {
  const r = await mkdtemp(path.join(tmpdir(), "cr-pages-"));
  await writeMinimalPagesFixture(r, { title: "Local" });

  const { outHtml, navSearchPath } = await buildGithubPagesStaticSite({ repoRoot: r });

  const html = await readFile(outHtml, "utf8");
  expect(html).not.toMatch(/aria-label="Source file on GitHub"/);
  expect(html).toContain('aria-label="Documentation home"');
  expect(html).toContain('href="./"');
  expect(html).toContain('data-nav-search-json-url="./parallel-docs-nav-search.json"');
  const nav = JSON.parse(await readFile(navSearchPath, "utf8")) as {
    documentedPairs?: { staticBrowseUrl?: string; sourceOnGithub?: string }[];
  };
  expect(nav.documentedPairs?.[0]?.staticBrowseUrl).toBe("./browse/src/x.ts/index.html");
  expect(nav.documentedPairs?.[0]?.sourceOnGithub).toBeUndefined();
  const browseFiles = await readdir(path.join(r, "_site", "browse"));
  expect(browseFiles).toContain("src");
  return r;
}

/** Hub uses two README angles; a second source has only one angle file so browse is not multi-angle. */
async function runBrowseSingleAnglePairEmbedsScrollBlockLinks(): Promise<string> {
  const { repo: r, extraCr } = await seedAnglesHubWithIndexedExtraPair({
    tmpPrefix: "cr-pages-bss-",
    hubTitle: "Angles + extra",
    withDiskOnlyOrphan: false,
  });

  await buildGithubPagesStaticSite({ repoRoot: r });

  const nav = JSON.parse(
    await readFile(path.join(r, "_site", "parallel-docs-nav-search.json"), "utf8"),
  ) as {
    documentedPairs?: { sourcePath: string; staticBrowseUrl?: string }[];
  };
  const extraPair = nav.documentedPairs?.find((p) => p.sourcePath === "extra.ts");
  expect(extraPair?.staticBrowseUrl).toBe("./browse/extra.ts/main/index.html");
  const extraRel = staticBrowseIndexRelPathFromPair(
    { sourcePath: "extra.ts", parallelDocsPath: extraCr },
    ".parallel-docs",
  );
  const browseHtml = await readFile(
    path.join(r, "_site", "browse", ...extraRel.split("/")),
    "utf8",
  );
  const b64 = /data-scroll-block-links-b64="([^"]*)"/.exec(browseHtml)?.[1];
  if (!b64)
    throw new Error("expected non-empty data-scroll-block-links-b64 on extra.ts browse page");
  const links = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as unknown[];
  expect(Array.isArray(links)).toBe(true);
  expect(links.length).toBeGreaterThan(0);
  return r;
}

/**
 * Documents the split between **nav / browse** (disk + index merge) and **block scroll + rays**
 * (index `blocks` only). Without this, a repo can list many pairs while only hub defaults get
 * obvious block sync — easy to mistake for a renderer regression.
 */
async function runBrowseIndexedPairGetsScrollLinksDiskOnlyPairGetsEmptyPayload(): Promise<string> {
  const {
    repo: r,
    extraCr,
    orphanCr,
  } = await seedAnglesHubWithIndexedExtraPair({
    tmpPrefix: "cr-pages-idx-disk-",
    hubTitle: "Indexed vs disk-only",
    withDiskOnlyOrphan: true,
  });
  if (orphanCr === undefined) throw new Error("expected disk-only orphan path");

  await buildGithubPagesStaticSite({ repoRoot: r });

  const nav = JSON.parse(
    await readFile(path.join(r, "_site", "parallel-docs-nav-search.json"), "utf8"),
  ) as { documentedPairs?: { sourcePath: string }[] };
  const sources = new Set((nav.documentedPairs ?? []).map((p) => p.sourcePath));
  expect(sources.has("extra.ts")).toBe(true);
  // Disk-only pair: still listed for browse/search, but not in index.json.
  expect(sources.has("orphan.ts")).toBe(true);

  const extraRel = staticBrowseIndexRelPathFromPair(
    { sourcePath: "extra.ts", parallelDocsPath: extraCr },
    ".parallel-docs",
  );
  const extraHtml = await readFile(path.join(r, "_site", "browse", ...extraRel.split("/")), "utf8");
  const extraAttr = /data-scroll-block-links-b64="([^"]*)"/.exec(extraHtml);
  expect(extraAttr).not.toBeNull();
  if (extraAttr?.[1] === undefined) throw new Error("expected capture");
  expect(extraAttr[1].length).toBeGreaterThan(0);
  const extraLinks = JSON.parse(Buffer.from(extraAttr[1], "base64").toString("utf8")) as unknown[];
  expect(extraLinks.length).toBeGreaterThan(0);

  const orphanRel = staticBrowseIndexRelPathFromPair(
    { sourcePath: "orphan.ts", parallelDocsPath: orphanCr },
    ".parallel-docs",
  );
  const orphanHtml = await readFile(
    path.join(r, "_site", "browse", ...orphanRel.split("/")),
    "utf8",
  );
  const orphanAttr = /data-scroll-block-links-b64="([^"]*)"/.exec(orphanHtml);
  expect(orphanAttr).not.toBeNull();
  if (orphanAttr?.[1] === undefined) throw new Error("expected capture");
  // No index entry → no block links for gutter rays / block-aware scroll in the shell.
  expect(orphanAttr[1]).toBe("");

  return r;
}

describe("GitHub Pages static site output — hub, angles, and defaults", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("writes _site/index.html and nav search from [static_site] flat companions", async () => {
    repo = await runWritesSiteAndNavFromFlatCompanions();
  });

  it("uses resolved storage companion path when static_site.parallel_docs_markdown is unset", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-flat-default-rel-"));
    await writeMinimalPagesFixture(repo, {
      title: "Demo",
      githubUrl: "https://github.com/acme/demo",
      parallelDocsMarkdown: "",
    });

    await buildGithubPagesStaticSite({ repoRoot: repo });

    const html = await readFile(path.join(repo, "_site", "index.html"), "utf8");
    expect(html).toContain('data-search-parallel-docs-path=".parallel-docs/source/src/x.ts.md"');
    expect(html).toContain(
      'title=".parallel-docs/source/src/x.ts.md">.parallel-docs/source/src/x.ts.md<',
    );
  });

  it("stamps pagesBuildCommitSha into the hub and browse footers when the builder passes it", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-foot-sha-"));
    await writeMinimalPagesFixture(repo, {
      title: "Sha footer",
      githubUrl: "https://github.com/acme/demo",
    });
    const sha = "0123456789abcdef0123456789abcdef01234567";
    await buildGithubPagesStaticSite({ repoRoot: repo, pagesBuildCommitSha: sha });
    const hub = await readFile(path.join(repo, "_site", "index.html"), "utf8");
    expect(hub).toContain(`>${sha}</code>`);
    const browseHtml = await readFile(
      path.join(repo, "_site", "browse", "src", "x.ts", "index.html"),
      "utf8",
    );
    expect(browseHtml).toContain(`>${sha}</code>`);
  });

  it("includes the angle selector on browse permalinks when multi-angle is enabled", async () => {
    repo = await runAngleSelectorOnBrowsePermalinks();
  });

  it("embeds block scroll links on browse for a single-angle pair when the hub uses angles", async () => {
    repo = await runBrowseSingleAnglePairEmbedsScrollBlockLinks();
  });

  it("embeds non-empty scroll-link payload only for index-backed pairs; disk-only pairs get an empty attribute", async () => {
    repo = await runBrowseIndexedPairGetsScrollLinksDiskOnlyPairGetsEmptyPayload();
  });

  it("writes browse pages and hub nav without static_site.github_url (same-site navigation only)", async () => {
    repo = await runBrowseWithoutGithubUrl();
  });
});

describe("GitHub Pages static site output — nav pairs and toolbar", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("does not set staticBrowseUrl when the indexed companion path is missing on disk (avoids hub 404s)", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-stale-cr-"));
    await writeMinimalPagesFixture(repo, {
      title: "Stale index",
      githubUrl: "https://github.com/acme/demo",
    });
    await writeIndex(repo, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        ".parallel-docs/source/src/x.ts.md": {
          sourcePath: "src/x.ts",
          parallelDocsPath: ".parallel-docs/source/src/x.ts.md",
          blocks: [],
        },
        ".parallel-docs/source/src/missing.md": {
          sourcePath: "src/x.ts",
          parallelDocsPath: ".parallel-docs/source/src/missing.md",
          blocks: [],
        },
      },
    });

    await buildGithubPagesStaticSite({ repoRoot: repo });

    const nav = JSON.parse(
      await readFile(path.join(repo, "_site", "parallel-docs-nav-search.json"), "utf8"),
    ) as {
      documentedPairs?: Array<{ parallelDocsPath: string; staticBrowseUrl?: string }>;
    };
    const real = nav.documentedPairs?.find(
      (p) => p.parallelDocsPath === ".parallel-docs/source/src/x.ts.md",
    );
    const ghost = nav.documentedPairs?.find(
      (p) => p.parallelDocsPath === ".parallel-docs/source/src/missing.md",
    );
    expect(real?.staticBrowseUrl).toBe("./browse/src/x.ts/index.html");
    expect(ghost?.staticBrowseUrl).toBeUndefined();
  });

  it("writes GitHub blob toolbar URLs for d-led/parallel-docs + main when configured", async () => {
    repo = await runGithubToolbarUsesBlobUrlsForRealisticHost();
  });
});

describe("GitHub Pages static site — pair-browse shell matches nav JSON (regression)", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("sets each browse #shell data-parallel-docs-pair-browse-href to that pair's staticBrowseUrl", async () => {
    const { repo: r } = await seedAnglesHubWithIndexedExtraPair({
      tmpPrefix: "cr-pages-shell-nav-",
      hubTitle: "Shell nav parity",
      withDiskOnlyOrphan: true,
    });
    repo = r;
    await buildGithubPagesStaticSite({ repoRoot: repo });
    await expectBrowseShellPairHrefMatchesNavStaticBrowseUrlForEveryPair(path.join(repo, "_site"));
  });

  it("sets the hub #shell pair-browse href to the same staticBrowseUrl string as in parallel-docs-nav-search.json", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-hub-shell-nav-"));
    await writeMinimalPagesFixture(repo, {
      title: "Hub shell",
      githubUrl: "https://github.com/acme/demo",
    });
    await buildGithubPagesStaticSite({ repoRoot: repo });
    const nav = JSON.parse(
      await readFile(path.join(repo, "_site", "parallel-docs-nav-search.json"), "utf8"),
    ) as { documentedPairs?: Array<{ staticBrowseUrl?: string }> };
    const expected = nav.documentedPairs?.[0]?.staticBrowseUrl;
    expect(expected).toBe("./browse/src/x.ts/index.html");
    const hubHtml = await readFile(path.join(repo, "_site", "index.html"), "utf8");
    expect(dataParallelDocsPairBrowseHrefFromShellTag(hubHtml)).toBe(expected);
  });
});

describe("GitHub Pages static site output — assets and rendered hub", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("mirrors companion storage images under _site/parallel-docs-static-assets for Pages-style hosts", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-img-"));
    await writeMinimalPagesFixture(repo, { title: "Img" });
    await mkdir(path.join(repo, ".parallel-docs", "source", "src", "assets"), { recursive: true });
    await writeFile(
      path.join(repo, ".parallel-docs", "source", "src", "assets", "x.svg"),
      "<svg/>",
      "utf8",
    );
    await writeFile(
      path.join(repo, ".parallel-docs", "source", "src", "x.ts.md"),
      "# Doc\n\n![](assets/x.svg)\n",
      "utf8",
    );
    await buildGithubPagesStaticSite({ repoRoot: repo });
    const mirrored = path.join(
      repo,
      "_site",
      "parallel-docs-static-assets",
      "source",
      "src",
      "assets",
      "x.svg",
    );
    expect(await readFile(mirrored, "utf8")).toContain("<svg");
    const indexHtml = await readFile(path.join(repo, "_site", "index.html"), "utf8");
    expect(indexHtml).toMatch(/parallel-docs-static-assets\/source\/src\/assets\/x\.svg/);
  });

  it("rewrites rendered source-markdown local links to GitHub blob URLs when enabled", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "cr-pages-src-links-"));
    await writeFile(
      path.join(repo, ".parallel-docs.toml"),
      [
        "[static_site]",
        'title = "Src links"',
        'github_url = "https://github.com/acme/demo"',
        'source_file = "README.md"',
        'parallel_docs_markdown = ".parallel-docs/source/README.md.md"',
        "",
        "[render]",
        "mermaid = false",
        "relative_github_blob_links = true",
        "",
      ].join("\n"),
      "utf8",
    );
    await mkdir(path.join(repo, "docs", "user"), { recursive: true });
    await writeFile(path.join(repo, "README.md"), "[Install](docs/user/install.md)\n", "utf8");
    await writeFile(path.join(repo, "docs", "user", "install.md"), "# Install\n", "utf8");
    await mkdir(path.join(repo, ".parallel-docs", "source"), { recursive: true });
    await writeFile(path.join(repo, ".parallel-docs", "source", "README.md.md"), "# Doc\n", "utf8");
    await buildGithubPagesStaticSite({ repoRoot: repo });
    const html = await readFile(path.join(repo, "_site", "index.html"), "utf8");
    expect(html).toContain('href="https://github.com/acme/demo/blob/main/docs/user/install.md"');
    expect(html).not.toContain('href="docs/user/install.md"');
  });
});

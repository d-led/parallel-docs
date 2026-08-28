import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION } from "@sidetrack/core";
import { describe, expect, it } from "vitest";

import { mkTempRepoWithBrowsePairHtmlLayout } from "./browse-pair-html-test-fixtures.js";
import { SIDETRACK_COLOR_THEME_STORAGE_KEY } from "./code-browser-color-theme.js";
import { type CodeBrowserPageOptions, renderCodeBrowserHtml } from "./code-browser.js";

function textContentWithoutTags(html: string): string {
  let cur = html;
  for (;;) {
    const next = cur.replaceAll(/<[^>]+>/g, "");
    if (next === cur) return cur;
    cur = next;
  }
}

/** First `role="banner"` header — where primary chrome (search, wrap, theme) lives. */
function bannerRegionHtml(html: string): string {
  const m = /<header[^>]*role="banner"[^>]*>[\s\S]*?<\/header>/i.exec(html);
  return m?.[0] ?? "";
}

/** Opening `#shell` tag only (avoid matching the client bundle source, which mentions the same data attribute). */
function stretchShellOpenTag(html: string): string {
  const m = html.match(/<div class="shell shell--stretch-rows" id="shell"[^>]*>/);
  return m?.[0] ?? "";
}

/** The stretch `<table>` only (the bundle references class names in source strings). */
function blockStretchTableHtml(html: string): string {
  const m = /<table class="block-stretch[^"]*"[^>]*>[\s\S]*?<\/table>/.exec(html);
  return m?.[0] ?? "";
}

function shellOpenTag(html: string): string {
  const m = /<div class="shell[^"]*" id="shell"[^>]*>/.exec(html);
  return m?.[0] ?? "";
}

function decodeShellDataAttr(html: string, attr: string): string {
  const shell = shellOpenTag(html);
  const rx = new RegExp(`${attr}="([^"]*)"`);
  const b64 = rx.exec(shell)?.[1] ?? "";
  if (b64.length === 0) return "";
  return Buffer.from(b64, "base64").toString("utf8");
}

function readmeTwoAngleStretchIndex(mainPath: string, altPath: string) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bySideTrackPath: {
      [mainPath]: {
        sourcePath: "README.md",
        sidetrackPath: mainPath,
        blocks: [{ id: "b1", anchor: "lines:1-2" }],
      },
      [altPath]: {
        sourcePath: "README.md",
        sidetrackPath: altPath,
        blocks: [{ id: "b1", anchor: "lines:1-2" }],
      },
    },
  };
}

function readmeStretchAngle(
  index: ReturnType<typeof readmeTwoAngleStretchIndex>,
  id: string,
  title: string,
  markdown: string,
  sidetrackPathRel: string,
) {
  return {
    id,
    title,
    markdown,
    sidetrackPathRel,
    blockStretchRows: {
      index,
      sourceRelative: "README.md",
      sidetrackPathRel,
    },
  };
}

function sidetrackOutputUrlsForReadmeSourcePane(
  repoRoot: string,
  storageRoot: string,
  outHtml: string,
): {
  repoRootAbs: string;
  htmlOutputFileAbs: string;
  markdownUrlBaseDirAbs: string;
  sidetrackStorageRootAbs: string;
} {
  return {
    repoRootAbs: repoRoot,
    htmlOutputFileAbs: outHtml,
    markdownUrlBaseDirAbs: path.join(storageRoot, "source", "README.md"),
    sidetrackStorageRootAbs: storageRoot,
  };
}

const readmeWithRelativeInstallLink = "# Hello\n\n[Install](docs/user/install.md)\n";

async function renderReadmeInstallLinkSourcePaneHtml(
  repoRoot: string,
  storageRoot: string,
  outHtml: string,
  extra?: Partial<CodeBrowserPageOptions>,
): Promise<string> {
  return renderCodeBrowserHtml({
    filePath: "README.md",
    code: readmeWithRelativeInstallLink,
    language: "md",
    sidetrackMarkdown: "Companion docs",
    sidetrackOutputUrls: sidetrackOutputUrlsForReadmeSourcePane(repoRoot, storageRoot, outHtml),
    ...extra,
  });
}

describe("Code browser page — layout shell and search", () => {
  it("should declare a tab favicon without a separate favicon file", async () => {
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: "body",
    });
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
    const m = /<link rel="icon" href="(data:image\/svg\+xml,[^"]+)"/.exec(html);
    expect(m).not.toBeNull();
    if (m === null || m[1] === undefined) {
      throw new Error("expected favicon data URI");
    }
    const raw = decodeURIComponent(m[1].slice("data:image/svg+xml,".length));
    expect(raw).toContain('fill="#e8ba26"');
    expect(raw).toContain('fill="#13203b"');
    expect(raw).toContain('fill="#ffffff"');
  });

  it("should embed raw payloads on the shell element for the client bundle", async () => {
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: "body",
    });
    const shell = shellOpenTag(html);
    expect(shell.length).toBeGreaterThan(0);
    if (shell.length === 0) {
      throw new Error("expected shell opening tag");
    }
    expect(shell).toContain('data-layout="stretch"');
    expect(shell).toContain("data-raw-code-b64=");
    expect(shell).toContain("data-raw-md-b64=");
    expect(shell).not.toContain("data-search-scope=");
    expect(shell).toContain('data-source-pane-mode="source"');
    expect(html).not.toContain('id="source-markdown-pane-flip"');
  });

  it("should narrow search to sidetrack paths when staticSearchScope requests it", async () => {
    const html = await renderCodeBrowserHtml({
      code: "const secret = 1;",
      language: "ts",
      sidetrackMarkdown: "## Notes\n",
      filePath: "src/a.ts",
      sidetrackPathForSearch: ".sidetrack/source/src/a.ts.md",
      staticSearchScope: "sidetrack-and-paths",
    });
    expect(html).toContain('placeholder="Filename, path, or keywords…"');
    expect(html).toContain("sidetrack-nav-search.json");
    expect(html).toContain('data-search-scope="sidetrack-and-paths"');
    expect(html).toContain('data-search-file-path="src/a.ts"');
    expect(html).toContain('data-search-sidetrack-path=".sidetrack/source/src/a.ts.md"');
  });

  it("should expose appearance controls and a head script so the first paint matches saved theme", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "y",
    });
    const banner = bannerRegionHtml(html);
    expect(banner).toMatch(/aria-haspopup="menu"/);
    expect(banner).toMatch(/role="menu"/);
    expect(banner).toMatch(/role="menuitemradio"[^>]*>System</);
    expect(banner).toMatch(/role="menuitemradio"[^>]*>Light</);
    expect(banner).toMatch(/role="menuitemradio"[^>]*>Dark</);
    expect(banner).toContain('id="sidetrack-share-link"');
    expect(banner).toContain('aria-label="Copy shareable permalink"');
    expect(banner).toMatch(/id="sidetrack-share-link"[\s\S]*id="sidetrack-theme-trigger"/);
    expect(html).toMatch(/<html[^>]*data-sidetrack-theme="system"/i);
    expect(html).toContain(SIDETRACK_COLOR_THEME_STORAGE_KEY);
  });
});

describe("Code browser page — document shell and chrome", () => {
  it("inlines github (light) and github-dark (dark) theme CSS with no CDN when syntax theme is github-dark", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "const x = 1;",
      language: "ts",
      sidetrackMarkdown: "## Notes\n",
      hljsTheme: "github-dark",
    });
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain('id="sidetrack-hljs-light" media="(prefers-color-scheme: light)"');
    expect(html).toContain('id="sidetrack-hljs-dark" media="(prefers-color-scheme: dark)"');
    expect(html).toContain("Theme: GitHub Dark");
  });

  it("given a TypeScript source and Markdown pair, should publish a navigable reading shell with search, split panes, wrap, and theme", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "const x = 1;",
      language: "ts",
      sidetrackMarkdown: "## Notes\n\nHello.",
    });
    const banner = bannerRegionHtml(html);
    const plain = textContentWithoutTags(html);

    expect(banner).toContain('aria-label="View options"');
    expect(banner).toMatch(/<h1[^>]*>\s*Demo\s*</i);
    expect(banner).toMatch(/aria-haspopup="menu"/);

    expect(html).toContain('data-layout="stretch"');
    expect(html).toContain('data-stretch-buffer-sync="flow-synchronizer"');
    expect(html).toContain('role="region" aria-label="Search"');
    expect(html).toContain('for="search-q"');
    expect(banner).toContain("Wrap lines");
    expect(banner).toContain("toolbar-wrap-lines__box");
    expect(banner).toContain('id="sidetrack-share-link"');
    expect(html).toContain('id="mobile-pane-flip"');
    expect(html).toContain('id="mobile-pane-flip-scroll"');
    expect(html).toContain('aria-label="Switch between source code and sidetrack"');

    expect(plain).toContain("const x = 1;");
    expect(plain).toContain("Notes");
    expect(html).toMatch(/hljs|language-ts/);

    expect(html).toMatch(
      /<meta\s+name="description"\s+content="Demo — Side-by-side source and sidetrack documentation."\s*\/>/,
    );
    expect(html).toMatch(/<main\b[^>]*id="main-content"/);
    expect(html).toMatch(/<a[^>]+href="#main-content"[^>]*>\s*Skip to main content\s*</i);
  });

  it("should use a custom meta description when provided", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      metaDescription: "Custom summary for listings.",
    });
    expect(html).toContain('<meta name="description" content="Custom summary for listings." />');
  });

  it("should preserve markdown content after block markers in shell payload", async () => {
    const md =
      "# Title\n\n<!-- sidetrack:block id=blk -->\n\n_Italic lede_ and **bold** after the marker.\n";
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "//",
      language: "ts",
      sidetrackMarkdown: md,
    });
    const rawMd = decodeShellDataAttr(html, "data-raw-md-b64");
    expect(rawMd).toContain("<!-- sidetrack:block id=blk -->");
    expect(rawMd).toContain("_Italic lede_");
    expect(rawMd).toContain("**bold**");
  });

  it("should include a generator meta tag when a generator label is provided", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      generatorLabel: "SideTrack @sidetrack/render@9.9.9-test",
    });
    expect(html).toContain(
      '<meta name="generator" content="SideTrack @sidetrack/render@9.9.9-test" />',
    );
  });
});

describe("Code browser page — companion GFM tables in HTML shell", () => {
  it("given a GFM table in companion Markdown, should emit a semantic table and doc-pane table chrome in CSS", async () => {
    const md = ["| Goal | Command |", "| --- | --- |", "| Build | `npm run build` |"].join("\n");
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "//",
      language: "ts",
      sidetrackMarkdown: md,
    });
    expect(html).toMatch(/<table[\s\S]*<\/table>/);
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("npm run build");
    expect(html).toContain(".pane--doc .doc-pane-body :where(thead th)");
    expect(html).toContain("tbody tr:nth-child(even)");
    /** Per-line anchors must not be injected into table rows (would break remark-gfm table parse). */
    expect(html).not.toMatch(/\| --- \| --- \|<span class="sidetrack-line-anchor"/);
  });

  it("given a wide three-column GFM table like the VS Code README, should still parse as HTML table", async () => {
    const md = [
      "| Goal                                                                                  | Bash (preferred)                                            | npm alias                                                   |",
      "| ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |",
      "| Regenerate **desktop** `vscode-*.png` here                                            | `bash scripts/a.sh`                                         | `npm run extension:vscode-readme-screenshots:desktop`       |",
    ].join("\n");
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "//",
      language: "ts",
      sidetrackMarkdown: md,
    });
    expect(html).toMatch(/<table[\s\S]*<\/table>/);
    expect(html).toContain("extension:vscode-readme-screenshots:desktop");
  });
});

describe("Code browser page — toolbar chrome", () => {
  it("should show optional related GitHub file links when configured", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      relatedGithubNav: [
        { label: "CONTRIBUTING", href: "https://github.com/acme/demo/blob/main/CONTRIBUTING.md" },
      ],
    });
    expect(html).toContain('aria-label="Open other repository files on GitHub"');
    expect(html).toContain("Also on GitHub");
    expect(html).toContain('href="https://github.com/acme/demo/blob/main/CONTRIBUTING.md"');
  });

  it("should expose GitHub blob links and the Side-tracked files hub with nav JSON hooks", async () => {
    const pairsB64 = Buffer.from(
      JSON.stringify([
        {
          sourcePath: "README.md",
          sidetrackPath: ".sidetrack/source/README.md.md",
          sourceOnGithub: "https://github.com/acme/demo/blob/main/README.md",
          sidetrackOnGithub:
            "https://github.com/acme/demo/blob/main/.sidetrack/source/README.md.md",
        },
      ]),
      "utf8",
    ).toString("base64");
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      filePath: "README.md",
      sidetrackPathForSearch: ".sidetrack/source/README.md.md",
      sourceOnGithubUrl: "https://github.com/acme/demo/blob/main/README.md",
      sidetrackOnGithubUrl: "https://github.com/acme/demo/blob/main/.sidetrack/source/README.md.md",
      documentedNavJsonUrl: "./sidetrack-nav-search.json",
      documentedPairsEmbeddedB64: pairsB64,
    });
    expect(html).toContain('aria-label="Current documentation pair"');
    expect(html).toContain("README.md");
    expect(html).toContain(".sidetrack/source/README.md.md");
    expect(html).toContain('data-sidetrack-pair-source-path="README.md"');
    expect(html).toContain('data-sidetrack-pair-sidetrack-path=".sidetrack/source/README.md.md"');
    expect(html).toContain(
      'data-sidetrack-pair-browse-href="https://github.com/acme/demo/blob/main/.sidetrack/source/README.md.md"',
    );
    expect(html).toContain("Side-tracked files");
    expect(html).toContain('placeholder="Filename, path, or keywords…"');
    expect(html).toContain('placeholder="Filter by path…"');
    expect(html).toContain('role="tree"');
    expect(html).toContain('data-nav-json-url="./sidetrack-nav-search.json"');
    expect(html).toContain('data-nav-search-json-url="./sidetrack-nav-search.json"');
    expect(html).toContain('data-documented-pairs-b64="');
  });

  it("should hydrate the Side-tracked files tree from embedded pairs alone", async () => {
    const pairsB64 = Buffer.from(
      JSON.stringify([
        {
          sourcePath: "src/a.ts",
          sidetrackPath: ".sidetrack/source/src/a.ts.md",
          sourceOnGithub: "https://github.com/acme/w/blob/main/src/a.ts",
          sidetrackOnGithub: "https://github.com/acme/w/blob/main/.sidetrack/source/src/a.ts.md",
        },
      ]),
      "utf8",
    ).toString("base64");
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      documentedPairsEmbeddedB64: pairsB64,
    });
    expect(html).toContain("Side-tracked files");
    expect(html).toContain('placeholder="Filter by path…"');
    expect(html).toContain('data-nav-json-url=""');
    expect(html).toContain('data-documented-pairs-b64="');
  });
});

describe("Code browser page — source line chrome", () => {
  it("should print one-based line numbers beside each source line (non-selectable gutter)", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "one\ntwo\nthree",
      language: "txt",
      sidetrackMarkdown: "body",
    });
    expect(html).toContain(">1</span>");
    expect(html).toContain(">2</span>");
    expect(html).toContain(">3</span>");
    expect(html).toMatch(/\.code-line \.ln[\s\S]*?user-select: none/);
  });

  it("should wrap highlighted rows in a stack whose gutter width matches the highest line number", async () => {
    const code = Array.from({ length: 100 }, (_, i) => `// ${i}`).join("\n");
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code,
      language: "ts",
      sidetrackMarkdown: "body",
    });
    expect(html).toMatch(/>100<\/span>/);
    expect(html).toMatch(/--code-ln-min-ch:\s*3/);
  });
});

describe("Code browser page — file path display", () => {
  it("should show the repo-relative source path in the nav rail context", async () => {
    const html = await renderCodeBrowserHtml({
      filePath: "packages/render/src/code-browser.ts",
      code: "export {};",
      language: "ts",
      sidetrackMarkdown: "body",
    });
    expect(html).toContain('aria-label="Current documentation pair"');
    expect(html).toContain("packages/render/src/code-browser.ts");
  });

  it("should fall back to basename-only labelling when paths are shallow", async () => {
    const html = await renderCodeBrowserHtml({
      filePath: "README.md",
      code: "# hi\n",
      language: "md",
      sidetrackMarkdown: "body",
    });
    expect(html).toContain("README.md");
    expect(html).toContain('data-source-pane-mode="source"');
    expect(html).toContain('id="source-markdown-pane-flip"');
    expect(html).toContain('id="source-markdown-pane-flip-scroll"');
    expect(html).not.toContain('id="code-pane-markdown-body"');
  });

  it("should escape file path labels so angle brackets cannot inject markup", async () => {
    const html = await renderCodeBrowserHtml({
      filePath: "<script>x</script>/evil.ts",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
    });
    expect(html).not.toContain("<script>x</script>/evil.ts");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;/");
  });
});

describe("Code browser page — source markdown link resolution", () => {
  it("resolves rendered source-markdown links from the source tree, not companion storage", async () => {
    const { repoRoot, storageRoot, outHtml } =
      await mkTempRepoWithBrowsePairHtmlLayout("cr-source-pane-link-");
    await writeFile(path.join(repoRoot, "README.md"), readmeWithRelativeInstallLink, "utf8");

    const html = await renderReadmeInstallLinkSourcePaneHtml(repoRoot, storageRoot, outHtml);

    expect(html).toContain('href="../../docs/user/install.md"');
    expect(html).not.toContain(".sidetrack/source/README.md/docs/user/install.md");
  });

  it("keeps pair browse links stable while resolving source-markdown links from source tree", async () => {
    const { repoRoot, storageRoot, outHtml } = await mkTempRepoWithBrowsePairHtmlLayout(
      "cr-source-pane-pair-link-",
    );
    await writeFile(path.join(repoRoot, "README.md"), readmeWithRelativeInstallLink, "utf8");

    const html = await renderReadmeInstallLinkSourcePaneHtml(repoRoot, storageRoot, outHtml, {
      sidetrackPathForSearch: ".sidetrack/source/README.md/main.md",
      sidetrackOnGithubUrl:
        "https://github.com/acme/demo/blob/main/.sidetrack/source/README.md/main.md",
      sidetrackStaticBrowseUrl: "./browse/README.md/main/index.html",
    });

    expect(html).toContain('href="../../docs/user/install.md"');
    expect(html).toContain('data-sidetrack-pair-browse-href="./browse/README.md/main/index.html"');
    expect(html).not.toContain(
      'data-sidetrack-pair-browse-href="https://github.com/acme/demo/blob/main/.sidetrack/source/README.md/main.md"',
    );
  });
});

describe("Code browser page — toolbar link policy", () => {
  it("should emit Octocat and SideTrack links only for safe http(s) URLs", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      githubRepoUrl: "https://github.com/example/demo",
      toolHomeUrl: "https://github.com/d-led/sidetrack",
    });
    expect(html).toContain('aria-label="View repository on GitHub"');
    expect(html).toContain('href="https://github.com/example/demo"');
    expect(html).toContain('href="https://github.com/d-led/sidetrack"');
    expect(html).toMatch(/<footer[\s\S]*Rendered with[\s\S]*v\d+\.\d+\.\d+[\s\S]*<\/footer>/);
  });

  it("should prefer same-site documentation home over GitHub when siteHubUrl is set", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      siteHubUrl: "./",
      githubRepoUrl: "https://github.com/example/demo",
      toolHomeUrl: "https://github.com/d-led/sidetrack",
    });
    expect(html).toContain('aria-label="Documentation home"');
    expect(html).toContain('href="./"');
    expect(html).not.toContain('aria-label="View repository on GitHub"');
    expect(html).toContain('href="https://github.com/d-led/sidetrack"');
  });

  it("should include a footer with ISO and local wall-clock when no tool home URL is set", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      builtAt: new Date("2026-05-01T12:00:00.000Z"),
    });
    expect(html).toContain("HTML generated");
    expect(html).toContain('datetime="2026-05-01T12:00:00.000Z"');
  });

  it("should put SideTrack attribution in the footer with version and the same build timestamp", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      toolHomeUrl: "https://github.com/d-led/sidetrack",
      builtAt: new Date("2026-05-01T12:00:00.000Z"),
    });
    expect(html).toMatch(/<footer[\s\S]*Rendered with[\s\S]*v\d+\.\d+\.\d+<\/span>\s*:\s*<time/);
    expect(html).toContain('datetime="2026-05-01T12:00:00.000Z"');
    expect(html).not.toContain("HTML generated");
  });

  it("should append a normalized commit id to the attribution footer when pagesBuildCommitSha is set", async () => {
    const sha = "a1b2c3d4e5f6789012345678901234567890abcd";
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      toolHomeUrl: "https://github.com/d-led/sidetrack",
      builtAt: new Date("2026-05-01T12:00:00.000Z"),
      pagesBuildCommitSha: sha,
    });
    expect(html).toContain(`>${sha}</code>`);
    expect(html).toContain('class="app__footer-attribution__sha"');
  });

  it("should ignore pagesBuildCommitSha that is not a Git hex object id", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      toolHomeUrl: "https://github.com/d-led/sidetrack",
      pagesBuildCommitSha: "main",
    });
    expect(html).not.toContain('class="app__footer-attribution__sha"');
  });

  it("should omit executable toolbar links when URLs are not http(s)", async () => {
    const html = await renderCodeBrowserHtml({
      title: "Demo",
      code: "x",
      language: "ts",
      sidetrackMarkdown: "body",
      githubRepoUrl: "javascript:alert(1)",
      toolHomeUrl: "data:text/html,hi",
    });
    expect(html).not.toContain('aria-label="View repository on GitHub"');
    expect(html).not.toContain("Rendered with");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="data:text/html');
  });
});

describe("Code browser page — companion Markdown rendering basics", () => {
  it("should render headings, emphasis, and links without corrupting fenced code", async () => {
    const md = [
      "# Title",
      "",
      "Paragraph with **bold** and [link](https://example.com).",
      "",
      "```js",
      "const fenced = 1",
      "```",
    ].join("\n");
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: md,
    });
    expect(html).toMatch(/<h1[^>]*>\s*Title/);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("const fenced = 1<span ");
  });

  it("styles inline code chips for light and dark themes without touching fenced blocks", async () => {
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: "Use `sidetrack validate` first.\n\n```bash\nsidetrack validate\n```",
    });
    expect(html).toContain(":where(p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6) > code");
    const styleFlat = html.replace(/\s+/g, " ");
    expect(styleFlat).toContain(':root[data-sidetrack-theme="dark"] .pane--doc .doc-pane-body');
    expect(html).toContain("#doc-pane-body.wrap pre code");
  });
});

describe("Code browser page — companion Markdown page-break rendering", () => {
  it("preserves deliberate page-break markers and surrounding markdown in shell payload", async () => {
    const md = [
      "# Chapter one",
      "",
      "Lead in.",
      "",
      "<!-- sidetrack:page-break -->",
      "",
      "## Chapter two",
      "",
      "Continuation.",
    ].join("\n");
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: md,
    });
    const rawMd = decodeShellDataAttr(html, "data-raw-md-b64");
    expect(rawMd).toContain("<!-- sidetrack:page-break -->");
    expect(rawMd).toContain("## Chapter two");
    expect(rawMd).toContain("Continuation.");
  });

  it("annotates page breaks with next block metadata when block links are available", async () => {
    const crPath = ".sidetrack/source/pkg/x.txt.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [crPath]: {
          sourcePath: "pkg/x.txt",
          sidetrackPath: crPath,
          blocks: [
            { id: "b1", anchor: "lines:1-4" },
            { id: "b2", anchor: "lines:20-25" },
          ],
        },
      },
    };
    const md = [
      "<!-- sidetrack:block id=b1 -->",
      "",
      "one",
      "",
      "<!-- sidetrack:page-break -->",
      "",
      "<!-- sidetrack:block id=b2 -->",
      "",
      "two",
    ].join("\n");
    const html = await renderCodeBrowserHtml({
      code: "a\nb\nc\nd",
      language: "txt",
      sidetrackMarkdown: md,
      codeBrowserLayout: "dual",
      blockStretchRows: {
        index,
        sourceRelative: "pkg/x.txt",
        sidetrackPathRel: crPath,
      },
    });
    expect(html).toContain('class="sidetrack-page-break"');
    expect(html).toContain('data-next-sidetrack-line="6"');
    expect(html).toContain('data-next-source-viewport-line="20"');
  });
});

describe("Code browser page — page-break next-block alignment and fenced-text guard", () => {
  it("aligns the page-break next-block target with the marker viewport top line, not the inner source start", async () => {
    const crPath = ".sidetrack/source/x.toml.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [crPath]: {
          sourcePath: "x.toml",
          sidetrackPath: crPath,
          blocks: [
            { id: "first", anchor: "marker:first" },
            { id: "second", anchor: "marker:second" },
          ],
        },
      },
    };
    const md = [
      "<!-- sidetrack:block id=first -->",
      "",
      "lede",
      "",
      "<!-- sidetrack:page-break -->",
      "",
      "<!-- sidetrack:block id=second -->",
      "",
      "more",
    ].join("\n");
    const source = [
      "# sidetrack:start id=first",
      "[first]",
      "# sidetrack:end id=first",
      "",
      "# sidetrack:start id=second",
      "[second]",
      "# sidetrack:end id=second",
    ].join("\n");
    const html = await renderCodeBrowserHtml({
      code: source,
      language: "toml",
      filePath: "x.toml",
      sidetrackMarkdown: md,
      codeBrowserLayout: "dual",
      blockStretchRows: {
        index,
        sourceRelative: "x.toml",
        sidetrackPathRel: crPath,
      },
    });
    expect(html).toContain('class="sidetrack-page-break"');
    expect(html).toContain('data-next-source-viewport-line="4"');
    expect(html).not.toContain('data-next-source-viewport-line="6"');
  });

  it("does not turn fenced sidetrack:page-break text into layout separators", async () => {
    const md = ["```md", "<!-- sidetrack:page-break -->", "```"].join("\n");
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: md,
    });
    expect(html).not.toContain('class="sidetrack-page-break"');
    expect(html).toContain("sidetrack:page-break -->");
  });
});

describe("Code browser page — multi-angle browsing", () => {
  it("should emit an angle selector and a base64 multi-angle payload when two angles are configured", async () => {
    const html = await renderCodeBrowserHtml({
      code: "// x",
      language: "ts",
      sidetrackMarkdown: "## Default pane\n",
      multiAngleBrowsing: {
        defaultAngleId: "main",
        angles: [
          {
            id: "main",
            title: "Main",
            markdown: "## Main angle\n\nBody **one**.",
            sidetrackPathRel: ".sidetrack/source/README.md/main.md",
            sidetrackOnGithubUrl:
              "https://github.com/acme/r/blob/main/.sidetrack/source/README.md/main.md",
          },
          {
            id: "architecture",
            title: "Architecture",
            markdown: "## Architecture angle\n\nBody **two**.",
            sidetrackPathRel: ".sidetrack/source/README.md/architecture.md",
            sidetrackOnGithubUrl:
              "https://github.com/acme/r/blob/main/.sidetrack/source/README.md/architecture.md",
          },
        ],
      },
    });
    expect(html).toContain('aria-label="SideTrack angle"');
    expect(html).toContain('value="main"');
    expect(html).toContain('value="architecture"');
    expect(html).toContain('id="sidetrack-multi-angle-b64"');
    expect(html).toContain("Main angle");
    expect(html).toContain("<strong>one</strong>");
  });

  it("should keep markdown-source render mode and flip controls for markdown files with multi-angle docs", async () => {
    const html = await renderCodeBrowserHtml({
      filePath: "README.md",
      code: "# Source title\n\nSome text.",
      language: "md",
      sidetrackMarkdown: "## Default pane\n",
      multiAngleBrowsing: {
        defaultAngleId: "main",
        angles: [
          {
            id: "main",
            markdown: "## Main\n",
            sidetrackPathRel: ".sidetrack/source/README.md/main.md",
          },
          {
            id: "alt",
            markdown: "## Alt\n",
            sidetrackPathRel: ".sidetrack/source/README.md/alt.md",
          },
        ],
      },
    });
    expect(html).toContain('data-source-pane-mode="rendered-markdown"');
    expect(html).toContain('id="source-markdown-pane-flip"');
    expect(html).toContain('id="code-pane-markdown-body"');
    expect(html).toContain('id="code-md-line-0"');
  });
});

describe("Code browser page — multi-angle block stretch", () => {
  it("should use stretch when every angle has a block table that builds", async () => {
    const mainPath = ".sidetrack/source/README.md/main.md";
    const altPath = ".sidetrack/source/README.md/alt.md";
    const index = readmeTwoAngleStretchIndex(mainPath, altPath);
    const html = await renderCodeBrowserHtml({
      filePath: "README.md",
      code: "a\nb",
      language: "txt",
      sidetrackMarkdown: "",
      multiAngleBrowsing: {
        defaultAngleId: "main",
        angles: [
          readmeStretchAngle(
            index,
            "main",
            "Main",
            "<!-- sidetrack:block id=b1 -->\n## M\n",
            mainPath,
          ),
          readmeStretchAngle(
            index,
            "alt",
            "Alt",
            "<!-- sidetrack:block id=b1 -->\n## A\n",
            altPath,
          ),
        ],
      },
    });
    expect(html).toContain('data-layout="stretch"');
    expect(stretchShellOpenTag(html)).toContain('data-stretch-buffer-sync="flow-synchronizer"');
    expect(blockStretchTableHtml(html)).toContain("stretch-cell-measure");
    expect(html).not.toContain('id="doc-pane"');
    expect(html).toContain('class="shell__pair-context"');
    expect(html).toContain('title="README.md"');
    expect(html).toContain(`title="${mainPath}"`);
    const script = /<script[^>]*id="sidetrack-multi-angle-b64"[^>]*>([^<]*)<\/script>/i.exec(html);
    expect(script?.[1]).toBeDefined();
    const payload = JSON.parse(Buffer.from(script?.[1] ?? "", "base64").toString("utf8")) as {
      layoutMode?: string;
      angles: Array<{ stretchSwapInnerB64?: string }>;
    };
    expect(payload.layoutMode).toBe("stretch");
    expect(payload.angles.every((a) => typeof a.stretchSwapInnerB64 === "string")).toBe(true);
    expect(
      payload.angles.every((a) =>
        Buffer.from(a.stretchSwapInnerB64 ?? "", "base64")
          .toString("utf8")
          .includes('class="shell__pair-context"'),
      ),
    ).toBe(true);
  });

  it("keeps stretch for markdown sources while preserving the source markdown toggle", async () => {
    const mainPath = ".sidetrack/source/README.md/main.md";
    const altPath = ".sidetrack/source/README.md/alt.md";
    const index = readmeTwoAngleStretchIndex(mainPath, altPath);
    const html = await renderCodeBrowserHtml({
      filePath: "README.md",
      code: "# Title\n\nBody\n",
      language: "md",
      sidetrackMarkdown: "",
      multiAngleBrowsing: {
        defaultAngleId: "main",
        angles: [
          readmeStretchAngle(
            index,
            "main",
            "Main",
            "<!-- sidetrack:block id=b1 -->\n## Main\n",
            mainPath,
          ),
          readmeStretchAngle(
            index,
            "alt",
            "Alt",
            "<!-- sidetrack:block id=b1 -->\n## Alt\n",
            altPath,
          ),
        ],
      },
    });
    expect(html).toContain('data-layout="stretch"');
    expect(html).toContain('id="source-markdown-pane-flip"');
    expect(html).toContain('id="source-markdown-pane-flip-scroll"');
    expect(html).toContain('data-source-pane-mode="source"');
    expect(blockStretchTableHtml(html)).toContain('data-source-markdown-body="true"');
  });
});

describe("Code browser page — multi-angle index isolation", () => {
  it("should omit scroll links for an angle when blockStretchRows targets another companion path", async () => {
    const mainPath = ".sidetrack/source/README.md/main.md";
    const archPath = ".sidetrack/source/README.md/architecture.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [mainPath]: {
          sourcePath: "README.md",
          sidetrackPath: mainPath,
          blocks: [{ id: "readme-lede", anchor: "lines:1-3" }],
        },
      },
    };
    const html = await renderCodeBrowserHtml({
      filePath: "README.md",
      code: "a\nb\nc\n",
      language: "txt",
      sidetrackMarkdown: "",
      multiAngleBrowsing: {
        defaultAngleId: "main",
        angles: [
          {
            id: "main",
            markdown: "<!-- sidetrack:block id=readme-lede -->\n## Lede\n",
            sidetrackPathRel: mainPath,
            blockStretchRows: {
              index,
              sourceRelative: "README.md",
              sidetrackPathRel: mainPath,
            },
          },
          {
            id: "architecture",
            markdown: "<!-- sidetrack:block id=readme-lede -->\n## Arch\n",
            sidetrackPathRel: archPath,
            blockStretchRows: {
              index,
              sourceRelative: "README.md",
              sidetrackPathRel: mainPath,
            },
          },
        ],
      },
    });
    const script = /<script[^>]*id="sidetrack-multi-angle-b64"[^>]*>([^<]*)<\/script>/i.exec(html);
    expect(script?.[1]).toBeDefined();
    const payload = JSON.parse(Buffer.from(script?.[1] ?? "", "base64").toString("utf8")) as {
      angles: Array<{ id: string; scrollBlockLinksB64: string }>;
    };
    const main = payload.angles.find((a) => a.id === "main");
    const arch = payload.angles.find((a) => a.id === "architecture");
    expect((main?.scrollBlockLinksB64 ?? "").length).toBeGreaterThan(0);
    expect(arch?.scrollBlockLinksB64 ?? "").toBe("");
  });
});

describe("Code browser page — block markers", () => {
  it("should preserve block marker lines in shell payload", async () => {
    const html = await renderCodeBrowserHtml({
      code: "x",
      language: "txt",
      sidetrackMarkdown: "<!-- sidetrack:block id=myblock -->\n\n## Title\n",
    });
    const rawMd = decodeShellDataAttr(html, "data-raw-md-b64");
    expect(rawMd).toContain("<!-- sidetrack:block id=myblock -->");
    expect(rawMd).toContain("## Title");
  });
});

async function expectDualPaneBlockScrollLinksPayload(): Promise<void> {
  const crPath = ".sidetrack/source/pkg/x.txt.md";
  const index = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bySideTrackPath: {
      [crPath]: {
        sourcePath: "pkg/x.txt",
        sidetrackPath: crPath,
        blocks: [{ id: "b1", anchor: "lines:1-2" }],
      },
    },
  };
  const md = "<!-- sidetrack:block id=b1 -->\n\n## Hi\n";
  const html = await renderCodeBrowserHtml({
    code: "a\nb",
    language: "txt",
    sidetrackMarkdown: md,
    codeBrowserLayout: "dual",
    blockStretchRows: {
      index,
      sourceRelative: "pkg/x.txt",
      sidetrackPathRel: crPath,
    },
  });
  expect(html).toContain('data-sidetrack-line="0"');
  expect(html).toContain('data-source-start="1"');
  const m = /data-scroll-block-links-b64="([^"]*)"/.exec(html);
  expect(m).not.toBeNull();
  if (m === null || m[1] === undefined) {
    throw new Error("expected data-scroll-block-links-b64 attribute with a value");
  }
  const links = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as unknown[];
  expect(links).toEqual([
    {
      id: "b1",
      sidetrackLine: 0,
      sourceStart: 1,
      sourceEnd: 2,
      markerViewportHalfOpen1Based: { lo: 1, hiExclusive: 3 },
    },
  ]);
}

describe("Code browser page — scroll sync payload", () => {
  it("should embed base64 block scroll links on #shell when dual panes align with the index", async () => {
    await expectDualPaneBlockScrollLinksPayload();
  });

  it("should choose stretch layout with one shared scroll when the block table can be built", async () => {
    const crPath = ".sidetrack/source/pkg/readme.md.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [crPath]: {
          sourcePath: "pkg/readme.md",
          sidetrackPath: crPath,
          blocks: [{ id: "b1", anchor: "lines:1-2" }],
        },
      },
    };
    const md = "<!-- sidetrack:block id=b1 -->\n\n## Sync\n";
    const html = await renderCodeBrowserHtml({
      code: "one\ntwo",
      language: "txt",
      sidetrackMarkdown: md,
      blockStretchRows: {
        index,
        sourceRelative: "pkg/readme.md",
        sidetrackPathRel: crPath,
      },
    });
    expect(html).toContain('data-layout="stretch"');
    expect(html).toContain("Sync");
    expect(stretchShellOpenTag(html)).toContain('data-stretch-buffer-sync="flow-synchronizer"');
    expect(stretchShellOpenTag(html)).toContain('data-dual-mobile-pane="doc"');
    expect(html).toContain('class="shell__pair-context"');
    expect(html).toContain('title="pkg/readme.md"');
    expect(html).toContain(`title="${crPath}"`);
    expect(blockStretchTableHtml(html)).toContain("stretch-cell-measure");
    expect(blockStretchTableHtml(html)).toContain('data-sidetrack-stretch-sync-id="b1"');
    expect(html).not.toContain('id="doc-pane"');
    expect(html).toContain('id="mobile-pane-flip"');
    expect(html).toContain('id="mobile-pane-flip-scroll"');
  });

  it("legacy stretch omits flow-synchronizer shell flag when stretchBufferSync is table", async () => {
    const crPath = ".sidetrack/source/pkg/readme.md.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [crPath]: {
          sourcePath: "pkg/readme.md",
          sidetrackPath: crPath,
          blocks: [{ id: "b1", anchor: "lines:1-2" }],
        },
      },
    };
    const md = "<!-- sidetrack:block id=b1 -->\n\n## Sync\n";
    const html = await renderCodeBrowserHtml({
      code: "one\ntwo",
      language: "txt",
      sidetrackMarkdown: md,
      blockStretchRows: {
        index,
        sourceRelative: "pkg/readme.md",
        sidetrackPathRel: crPath,
      },
      stretchBufferSync: "table",
    });
    expect(html).toContain('data-layout="stretch"');
    expect(stretchShellOpenTag(html)).not.toContain("data-stretch-buffer-sync");
    expect(blockStretchTableHtml(html)).not.toContain("stretch-cell-measure");
  });

  it("keeps markdown sources in stretch layout while preserving the markdown render toggle", async () => {
    const crPath = ".sidetrack/source/README.md/main.md";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [crPath]: {
          sourcePath: "README.md",
          sidetrackPath: crPath,
          blocks: [{ id: "b1", anchor: "lines:1-2" }],
        },
      },
    };
    const html = await renderCodeBrowserHtml({
      code: "# Title\n\nHello\n",
      language: "md",
      filePath: "README.md",
      sidetrackMarkdown: "<!-- sidetrack:block id=b1 -->\n\n## Notes\n",
      blockStretchRows: {
        index,
        sourceRelative: "README.md",
        sidetrackPathRel: crPath,
      },
    });
    expect(html).toContain('data-layout="stretch"');
    expect(html).toContain('id="mobile-pane-flip"');
    expect(html).toContain('id="source-markdown-pane-flip"');
    expect(html).toContain('id="source-markdown-pane-flip-scroll"');
    expect(html).toContain('data-source-pane-mode="source"');
    expect(blockStretchTableHtml(html)).toContain('data-source-markdown-body="true"');
    expect(blockStretchTableHtml(html)).toContain('id="code-md-line-0"');
  });
});

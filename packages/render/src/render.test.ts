import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mkTempRepoWithBrowsePairHtmlLayout } from "./browse-pair-html-test-fixtures.js";
import {
  type CommentrayStaticAssetCopy,
  type MarkdownPipelineOptions,
  renderMarkdownToHtml,
} from "./markdown-pipeline.js";
import { renderSideBySideHtml } from "./side-by-side.js";

function markdownWithAcmeDemoGithubBlob(opts: {
  repoRootAbs: string;
  htmlOutputFileAbs: string;
  markdownUrlBaseDirAbs: string;
  commentrayStorageRootAbs: string;
}): MarkdownPipelineOptions {
  return {
    commentrayOutputUrls: {
      ...opts,
      githubBlobRepo: { owner: "acme", repo: "demo" },
    },
  };
}

describe("Markdown to HTML pipeline", () => {
  it("should turn headings and inline emphasis into semantic HTML", async () => {
    const html = await renderMarkdownToHtml("# Title\n\nHello **world**.");
    expect(html).toContain("<h1");
    expect(html).toContain("world");
  });

  it("should emit GitHub-flavored Markdown constructs that readers expect", async () => {
    const md = [
      "## Heading slug",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- [ ] todo",
      "- [x] done",
      "",
      "~~gone~~",
      "",
      "https://example.com",
      "",
      "Ref[^1]",
      "",
      "[^1]: footnote body",
      "",
    ].join("\n");
    const html = await renderMarkdownToHtml(md);
    expect(html).toMatch(/<h2[^>]*id="heading-slug"/);
    expect(html).toContain("<table>");
    expect(html).toContain('class="contains-task-list"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain("footnote body");
  });

  it("should keep mermaid source as plain text under pre.mermaid so the browser runtime can parse it", async () => {
    const md = "```mermaid\nflowchart LR\n  A --> B\n```";
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("flowchart LR");
    expect(html).not.toMatch(/<pre[^>]*class="mermaid"[^>]*>[\s\S]*?<code\b/);
  });

  it("should rewrite in-repo GitHub blob links to paths relative to the output HTML file", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-gh-"));
    const repoRoot = path.join(tmp, "repo");
    await mkdir(path.join(repoRoot, "docs", "spec"), { recursive: true });
    await writeFile(path.join(repoRoot, "docs", "spec", "storage.md"), "# hi\n", "utf8");
    const outHtml = path.join(repoRoot, "_site", "index.html");
    await mkdir(path.dirname(outHtml), { recursive: true });
    const storageRoot = path.join(repoRoot, ".commentray");
    await mkdir(storageRoot, { recursive: true });

    const md =
      "[Storage](https://github.com/acme/demo/blob/main/docs/spec/storage.md) " +
      "and [other](https://github.com/other/repo/blob/main/x.md).";
    const html = await renderMarkdownToHtml(
      md,
      markdownWithAcmeDemoGithubBlob({
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: repoRoot,
        commentrayStorageRootAbs: storageRoot,
      }),
    );
    expect(html).toContain('href="../docs/spec/storage.md"');
    expect(html).toContain("github.com/other/repo");
  });

  it("should leave GitHub links untouched when owner or repo does not match the configured repo", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-gh2-"));
    const repoRoot = path.join(tmp, "r");
    await mkdir(repoRoot, { recursive: true });
    const outHtml = path.join(repoRoot, "out.html");
    const md = "[x](https://github.com/wrong/repo/blob/main/README.md)";
    const storageRoot = path.join(repoRoot, ".commentray");
    await mkdir(storageRoot, { recursive: true });
    const html = await renderMarkdownToHtml(
      md,
      markdownWithAcmeDemoGithubBlob({
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: repoRoot,
        commentrayStorageRootAbs: storageRoot,
      }),
    );
    expect(html).toContain("github.com/wrong/repo");
  });
});

describe("Side-by-side static HTML layout", () => {
  it("should lay out source and companion columns with grid CSS", async () => {
    const html = await renderSideBySideHtml({
      title: "Demo",
      code: "const x = 1;",
      language: "ts",
      commentrayMarkdown: "## Notes\n\nSee `x`.",
      includeMermaidRuntime: false,
    });
    expect(html).toContain("grid-template-columns");
    expect(html).toMatch(/const.*x.*1/);
    expect(html).toContain("Notes");
  });

  it("inlines default highlight.js theme CSS for fenced code without CDN", async () => {
    const html = await renderSideBySideHtml({
      title: "Demo",
      code: "x",
      language: "txt",
      commentrayMarkdown: "y",
      includeMermaidRuntime: false,
    });
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain('<style media="(prefers-color-scheme: light)">');
    expect(html).toContain('<style media="(prefers-color-scheme: dark)">');
    expect(html).toContain("Theme: GitHub");
  });

  it("reuses the chosen dark hljs theme for the dark color-scheme slot without CDN", async () => {
    const html = await renderSideBySideHtml({
      title: "Demo",
      code: "x",
      language: "txt",
      commentrayMarkdown: "y",
      hljsTheme: "github-dark",
      includeMermaidRuntime: false,
    });
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain('<style media="(prefers-color-scheme: light)">');
    expect(html).toContain('<style media="(prefers-color-scheme: dark)">');
    expect(html).toContain("Theme: GitHub Dark");
  });

  it("should apply commentrayOutputUrls when rewriting links in the companion column", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-sbs-"));
    const repoRoot = path.join(tmp, "repo");
    await mkdir(path.join(repoRoot, "a"), { recursive: true });
    await writeFile(path.join(repoRoot, "a", "b.md"), "x", "utf8");
    const outHtml = path.join(repoRoot, "dist", "x.html");
    await mkdir(path.dirname(outHtml), { recursive: true });
    await mkdir(path.join(repoRoot, ".commentray"), { recursive: true });

    const html = await renderSideBySideHtml({
      title: "Demo",
      code: "x",
      language: "txt",
      commentrayMarkdown: "[b](https://github.com/o/r/blob/main/a/b.md)",
      includeMermaidRuntime: false,
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: repoRoot,
        commentrayStorageRootAbs: path.join(repoRoot, ".commentray"),
        githubBlobRepo: { owner: "o", repo: "r" },
      },
    });
    expect(html).toContain('href="../a/b.md"');
  });
});

describe("Markdown to HTML — static asset URL rewriting (storage sandbox)", () => {
  it("should resolve companion-local images and block repo-root images outside Commentray storage", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-img-"));
    const repoRoot = path.join(tmp, "repo");
    const storageRoot = path.join(repoRoot, ".commentray");
    const companionDir = path.join(storageRoot, "source");
    await mkdir(companionDir, { recursive: true });
    await writeFile(path.join(companionDir, "diagram.svg"), "<svg/>", "utf8");
    await mkdir(path.join(repoRoot, "docs"), { recursive: true });
    await writeFile(path.join(repoRoot, "docs", "logo.svg"), "<svg/>", "utf8");
    const outHtml = path.join(repoRoot, "_site", "index.html");
    await mkdir(path.dirname(outHtml), { recursive: true });

    const md = "![local](./diagram.svg) ![root](/docs/logo.svg)";
    const html = await renderMarkdownToHtml(md, {
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: companionDir,
        commentrayStorageRootAbs: storageRoot,
      },
    });
    expect(html).toContain('src="../.commentray/source/diagram.svg"');
    expect(html).not.toContain("commentray-static-assets");
    expect(html).not.toContain("docs/logo.svg");
    const imgTags = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(imgTags.some((t) => t.includes("diagram.svg"))).toBe(true);
    expect(imgTags.some((t) => t.includes("logo"))).toBe(false);
  });

  it("should resolve figures next to the companion file without a leading ./", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-img2-"));
    const repoRoot = path.join(tmp, "repo");
    const storageRoot = path.join(repoRoot, ".commentray");
    const companionDir = path.join(storageRoot, "source");
    await mkdir(path.join(companionDir, "figures"), { recursive: true });
    await writeFile(path.join(companionDir, "figures", "a.svg"), "<svg/>", "utf8");
    const outHtml = path.join(repoRoot, "out", "index.html");
    await mkdir(path.dirname(outHtml), { recursive: true });

    const html = await renderMarkdownToHtml("![](figures/a.svg)", {
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: companionDir,
        commentrayStorageRootAbs: storageRoot,
      },
    });
    expect(html).toContain('src="../.commentray/source/figures/a.svg"');
  });

  it("should block images that escape storage via relative traversal", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "cr-img3-"));
    const repoRoot = path.join(tmp, "repo");
    const storageRoot = path.join(repoRoot, ".commentray");
    const companionDir = path.join(storageRoot, "source", "pkg");
    await mkdir(companionDir, { recursive: true });
    await mkdir(path.join(repoRoot, "docs"), { recursive: true });
    await writeFile(path.join(repoRoot, "docs", "leak.svg"), "<svg/>", "utf8");
    const outHtml = path.join(repoRoot, "_site", "index.html");
    await mkdir(path.dirname(outHtml), { recursive: true });

    const html = await renderMarkdownToHtml("![](../../../docs/leak.svg)", {
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: companionDir,
        commentrayStorageRootAbs: storageRoot,
      },
    });
    expect(html).not.toContain("leak.svg");
    expect(html).not.toMatch(/<img[^>]*src=/);
  });
});

type MirrorRenderFixture = {
  html: string;
  repoRoot: string;
  companionDir: string;
  companionStaticAssetCopies: CommentrayStaticAssetCopy[];
};

async function renderStorageDiagramWithSiteMirror(
  tmpPrefix: string,
  outHtmlUnderRepo: string[],
): Promise<MirrorRenderFixture> {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), tmpPrefix));
  const repoRoot = path.join(tmpRoot, "repo");
  await mkdir(repoRoot, { recursive: true });
  const storageRoot = path.join(repoRoot, ".commentray");
  const companionDir = path.join(storageRoot, "source");
  await mkdir(companionDir, { recursive: true });
  await writeFile(path.join(companionDir, "diagram.svg"), "<svg/>", "utf8");
  const outHtml = path.join(repoRoot, ...outHtmlUnderRepo);
  await mkdir(path.dirname(outHtml), { recursive: true });
  const companionStaticAssetCopies: CommentrayStaticAssetCopy[] = [];
  const html = await renderMarkdownToHtml("![d](./diagram.svg)", {
    commentrayOutputUrls: {
      repoRootAbs: repoRoot,
      htmlOutputFileAbs: outHtml,
      markdownUrlBaseDirAbs: companionDir,
      commentrayStorageRootAbs: storageRoot,
      staticSiteOutDirAbs: path.join(repoRoot, "_site"),
      companionStaticAssetCopies,
    },
  });
  return { html, repoRoot, companionDir, companionStaticAssetCopies };
}

describe("Markdown to HTML — static asset URL rewriting (site mirror)", () => {
  it("should mirror storage images into the static site segment when staticSiteOutDirAbs is set", async () => {
    const { html, repoRoot, companionDir, companionStaticAssetCopies } =
      await renderStorageDiagramWithSiteMirror("cr-img-mirror-", ["_site", "index.html"]);

    expect(html).toContain('src="commentray-static-assets/source/diagram.svg"');
    expect(companionStaticAssetCopies).toHaveLength(1);
    expect(companionStaticAssetCopies[0]?.fromAbs).toBe(path.join(companionDir, "diagram.svg"));
    expect(companionStaticAssetCopies[0]?.toAbs).toBe(
      path.join(repoRoot, "_site", "commentray-static-assets", "source", "diagram.svg"),
    );
  });

  it("should use ../commentray-static-assets from browse HTML nested under the site root", async () => {
    const { html, companionStaticAssetCopies } = await renderStorageDiagramWithSiteMirror(
      "cr-img-mirror2-",
      ["_site", "browse", "pair.html"],
    );

    expect(html).toContain('src="../commentray-static-assets/source/diagram.svg"');
    expect(companionStaticAssetCopies).toHaveLength(1);
  });
});

describe("Markdown to HTML — source link prefix fallback", () => {
  it("rewrites local links to source_link_prefix when target is outside static site root", async () => {
    const { repoRoot, storageRoot, outHtml } =
      await mkTempRepoWithBrowsePairHtmlLayout("cr-source-prefix-");

    const html = await renderMarkdownToHtml("[Install](docs/user/install.md)", {
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: repoRoot,
        commentrayStorageRootAbs: storageRoot,
        staticSiteOutDirAbs: path.join(repoRoot, "_site"),
        sourceLinkPrefix: "https://github.com/acme/demo/blob/main",
      },
    });

    expect(html).toContain('href="https://github.com/acme/demo/blob/main/docs/user/install.md"');
    expect(html).not.toContain('href="../../docs/user/install.md"');
  });

  it("normalizes source_link_prefix with trailing slashes", async () => {
    const { repoRoot, storageRoot, outHtml } = await mkTempRepoWithBrowsePairHtmlLayout(
      "cr-source-prefix-trailing-",
    );

    const html = await renderMarkdownToHtml("[Install](docs/user/install.md)", {
      commentrayOutputUrls: {
        repoRootAbs: repoRoot,
        htmlOutputFileAbs: outHtml,
        markdownUrlBaseDirAbs: repoRoot,
        commentrayStorageRootAbs: storageRoot,
        staticSiteOutDirAbs: path.join(repoRoot, "_site"),
        sourceLinkPrefix: "https://github.com/acme/demo/blob/main////",
      },
    });

    expect(html).toContain('href="https://github.com/acme/demo/blob/main/docs/user/install.md"');
    expect(html).not.toContain(
      'href="https://github.com/acme/demo/blob/main////docs/user/install.md"',
    );
  });
});

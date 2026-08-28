import { parse as parseToml } from "@iarna/toml";
import { describe, expect, it } from "vitest";

import {
  type ParallelDocsToml,
  DEFAULT_STRETCH_BUFFER_SYNC,
  mergeParallelDocsConfig,
} from "./config.js";

describe("Merging ParallelDocs TOML configuration — basics", () => {
  it("applies defaults for empty input", () => {
    const cfg = mergeParallelDocsConfig(null);
    expect(cfg.storageDir).toBe(".parallel-docs");
    expect(cfg.scmProvider).toBe("git");
    expect(cfg.render.mermaid).toBe(true);
    expect(cfg.render.mermaidRuntimePath).toBeNull();
    expect(cfg.render.relativeGithubBlobLinks).toBe(false);
    expect(cfg.angles.defaultAngleId).toBeNull();
    expect(cfg.angles.definitions).toEqual([]);
    expect(cfg.staticSite.stretchBufferSync).toBe(DEFAULT_STRETCH_BUFFER_SYNC);
  });

  it("merges render.relative_github_blob_links from TOML", () => {
    const cfg = mergeParallelDocsConfig({
      render: { relative_github_blob_links: true },
    });
    expect(cfg.render.relativeGithubBlobLinks).toBe(true);
  });

  it("merges render.mermaid_runtime_path from TOML", () => {
    const cfg = mergeParallelDocsConfig({
      render: { mermaid_runtime_path: "vendor/mermaid.min.js" },
    });
    expect(cfg.render.mermaidRuntimePath).toBe("vendor/mermaid.min.js");
  });

  it("rejects unsupported scm providers", () => {
    expect(() => mergeParallelDocsConfig({ scm: { provider: "p4" } })).toThrow(/Unsupported/);
  });
});

describe("Merging ParallelDocs TOML configuration — static site", () => {
  it("merges static_site from TOML", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: {
        title: "Docs",
        intro: "## Hello",
        github_url: "https://github.com/a/b",
        source_link_prefix: "https://github.com/a/b/blob/main",
        default_source_file: "src/index.ts",
        default_angle: "architecture",
      },
    });
    expect(cfg.staticSite.title).toBe("Docs");
    expect(cfg.staticSite.introMarkdown).toBe("## Hello");
    expect(cfg.staticSite.githubUrl).toBe("https://github.com/a/b");
    expect(cfg.staticSite.sourceLinkPrefix).toBe("https://github.com/a/b/blob/main");
    expect(cfg.staticSite.sourceFile).toBe("src/index.ts");
    expect(cfg.staticSite.defaultAngleId).toBe("architecture");
    expect(cfg.staticSite.parallelDocsMarkdownFile).toBe(
      ".parallel-docs/source/src/index.ts/architecture.md",
    );
    expect(cfg.staticSite.githubBlobBranch).toBe("main");
    expect(cfg.staticSite.relatedGithubNav).toEqual([]);
    expect(cfg.staticSite.stretchBufferSync).toBe(DEFAULT_STRETCH_BUFFER_SYNC);
  });

  it("merges static_site.stretch_buffer_sync table when set explicitly", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: { stretch_buffer_sync: "table" },
    });
    expect(cfg.staticSite.stretchBufferSync).toBe("table");
  });

  it("merges static_site.stretch_buffer_sync flow-synchronizer when set explicitly", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: { stretch_buffer_sync: "flow-synchronizer" },
    });
    expect(cfg.staticSite.stretchBufferSync).toBe("flow-synchronizer");
  });

  it("rejects invalid static_site.stretch_buffer_sync", () => {
    expect(() => mergeParallelDocsConfig({ static_site: { stretch_buffer_sync: "nope" } })).toThrow(
      /stretch_buffer_sync/,
    );
  });

  it("keeps backward compatibility for source_file + parallel_docs_markdown", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: {
        source_file: "src/index.ts",
        parallel_docs_markdown: "docs/x.md",
      },
    });
    expect(cfg.staticSite.sourceFile).toBe("src/index.ts");
    expect(cfg.staticSite.defaultAngleId).toBeNull();
    expect(cfg.staticSite.parallelDocsMarkdownFile).toBe("docs/x.md");
  });

  it("builds related_github_nav from github_url and repo-relative paths", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: {
        github_url: "https://github.com/acme/demo",
        github_blob_branch: "develop",
        related_github_files: [
          { path: "CONTRIBUTING.md" },
          { label: "Storage spec", path: "docs/spec/storage.md" },
        ],
      },
    });
    expect(cfg.staticSite.relatedGithubNav).toEqual([
      {
        label: "CONTRIBUTING.md",
        href: "https://github.com/acme/demo/blob/develop/CONTRIBUTING.md",
      },
      {
        label: "Storage spec",
        href: "https://github.com/acme/demo/blob/develop/docs/spec/storage.md",
      },
    ]);
  });

  it("leaves related_github_nav empty when github_url is missing", () => {
    const cfg = mergeParallelDocsConfig({
      static_site: { related_github_files: [{ path: "README.md" }] },
    });
    expect(cfg.staticSite.relatedGithubNav).toEqual([]);
  });
});

describe("ParallelDocs config merge — TOML edge cases and path safety", () => {
  it("accepts multiline basic strings and multiline arrays from real TOML", () => {
    const raw = parseToml(`
[anchors]
defaultStrategy = [
  "symbol",
  "lines",
]

[static_site]
github_url = """
https://github.com/foo/bar"""
parallel_docs_markdown = """
.parallel-docs/source/README.md.md"""
`) as ParallelDocsToml;
    const cfg = mergeParallelDocsConfig(raw);
    expect(cfg.anchors.defaultStrategy).toEqual(["symbol", "lines"]);
    expect(cfg.staticSite.githubUrl).toBe("https://github.com/foo/bar");
    expect(cfg.staticSite.parallelDocsMarkdownFile).toBe(".parallel-docs/source/README.md.md");
  });

  it("rejects invalid static_site.default_angle", () => {
    expect(() =>
      mergeParallelDocsConfig({
        static_site: { default_source_file: "README.md", default_angle: "bad angle id" },
      }),
    ).toThrow(/angle id/i);
  });

  it("rejects a storage.dir that escapes the repository root", () => {
    expect(() => mergeParallelDocsConfig({ storage: { dir: "../evil" } })).toThrow(
      /storage\.dir.*repository-relative/,
    );
  });

  it("rejects static_site paths that escape the repository root", () => {
    expect(() =>
      mergeParallelDocsConfig({ static_site: { default_source_file: "../../../etc/passwd" } }),
    ).toThrow(/static_site\.default_source_file/);
    expect(() =>
      mergeParallelDocsConfig({ static_site: { source_file: "../../../etc/passwd" } }),
    ).toThrow(/static_site\.source_file/);
    expect(() =>
      mergeParallelDocsConfig({ static_site: { parallel_docs_markdown: "../outside.md" } }),
    ).toThrow(/static_site\.parallel_docs_markdown/);
  });

  it("rejects invalid static_site.source_link_prefix", () => {
    expect(() =>
      mergeParallelDocsConfig({ static_site: { source_link_prefix: "javascript:alert(1)" } }),
    ).toThrow(/static_site\.source_link_prefix/);
    expect(() =>
      mergeParallelDocsConfig({ static_site: { source_link_prefix: "relative/prefix" } }),
    ).toThrow(/static_site\.source_link_prefix/);
  });

  describe("Rejecting storage.dir inside the .git directory", () => {
    it("rejects exactly .git", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".git" } })).toThrow(
        /storage\.dir must not live inside \.git\//,
      );
    });

    it("rejects nested paths under .git", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".git/parallel-docs" } })).toThrow(
        /storage\.dir must not live inside \.git\//,
      );
    });

    it("rejects Windows-style separators under .git", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".git\\state" } })).toThrow(
        /storage\.dir must not live inside \.git\//,
      );
    });

    it("rejects case variants (fs may be case-insensitive)", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".GIT/foo" } })).toThrow(
        /storage\.dir must not live inside \.git\//,
      );
    });

    it("accepts sibling names that merely share a prefix", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".gitignore" } })).not.toThrow();
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".git-backup" } })).not.toThrow();
    });

    it("accepts the default .parallel-docs dir", () => {
      expect(() => mergeParallelDocsConfig({ storage: { dir: ".parallel-docs" } })).not.toThrow();
    });
  });
});

describe("ParallelDocs config merge — angles", () => {
  describe("Angle definitions in TOML", () => {
    it("merges definitions and default_angle", () => {
      const cfg = mergeParallelDocsConfig({
        angles: {
          default_angle: "architecture",
          definitions: [
            { id: "introduction", title: "Introduction" },
            { id: "architecture", title: "Architecture" },
          ],
        },
      });
      expect(cfg.angles.defaultAngleId).toBe("architecture");
      expect(cfg.angles.definitions).toEqual([
        { id: "introduction", title: "Introduction" },
        { id: "architecture", title: "Architecture" },
      ]);
    });

    it("uses the id as title when title is omitted", () => {
      const cfg = mergeParallelDocsConfig({
        angles: {
          definitions: [{ id: "main" }],
        },
      });
      expect(cfg.angles.definitions).toEqual([{ id: "main", title: "main" }]);
    });

    it("rejects duplicate definition ids", () => {
      expect(() =>
        mergeParallelDocsConfig({
          angles: { definitions: [{ id: "x" }, { id: "x" }] },
        }),
      ).toThrow(/Duplicate angles\.definitions id: x/);
    });

    it("rejects default_angle that is not listed when definitions is non-empty", () => {
      expect(() =>
        mergeParallelDocsConfig({
          angles: {
            default_angle: "missing",
            definitions: [{ id: "a" }],
          },
        }),
      ).toThrow(/angles\.default_angle "missing" must match one of angles\.definitions/);
    });

    it("allows default_angle without definitions (disk-only angles)", () => {
      const cfg = mergeParallelDocsConfig({
        angles: { default_angle: "main" },
      });
      expect(cfg.angles.defaultAngleId).toBe("main");
      expect(cfg.angles.definitions).toEqual([]);
    });
  });
});

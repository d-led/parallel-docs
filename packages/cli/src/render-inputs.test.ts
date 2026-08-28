import { describe, expect, it } from "vitest";
import { mergeParallelDocsConfig, type ParallelDocsToml } from "@parallel-docs/core";

import { DEFAULT_RENDER_OUT, resolveRenderInputs } from "./render-inputs.js";

function configFrom(partial: ParallelDocsToml): ReturnType<typeof mergeParallelDocsConfig> {
  return mergeParallelDocsConfig(partial);
}

describe("Resolving static render CLI inputs", () => {
  it("falls back to .parallel-docs.toml [static_site] when every flag is omitted", () => {
    const cfg = configFrom({
      static_site: {
        default_source_file: "README.md",
        default_angle: "main",
      },
    });

    const inputs = resolveRenderInputs(cfg, {});

    expect(inputs).toEqual({
      source: "README.md",
      markdown: ".parallel-docs/source/README.md/main.md",
      out: DEFAULT_RENDER_OUT,
    });
  });

  it("derives the conventional companion Markdown when only --source is provided", () => {
    const cfg = configFrom({
      static_site: {
        source_file: "README.md",
        parallel_docs_markdown: ".parallel-docs/source/README.md.md",
      },
    });

    const inputs = resolveRenderInputs(cfg, { source: "src/foo.ts" });

    expect(inputs.source).toBe("src/foo.ts");
    expect(inputs.markdown).toBe(".parallel-docs/source/src/foo.ts.md");
  });

  it("derives the conventional companion Markdown when [static_site] is unconfigured", () => {
    const cfg = configFrom({});

    const inputs = resolveRenderInputs(cfg, {});

    expect(inputs.source).toBe("README.md");
    expect(inputs.markdown).toBe(".parallel-docs/source/README.md.md");
    expect(inputs.out).toBe(DEFAULT_RENDER_OUT);
  });

  it("honours a custom storage dir when deriving the companion Markdown", () => {
    const cfg = configFrom({ storage: { dir: "docs/.parallel-docs" } });

    const inputs = resolveRenderInputs(cfg, { source: "lib/x.ts" });

    expect(inputs.markdown).toBe("docs/.parallel-docs/source/lib/x.ts.md");
  });

  it("lets explicit flags override every default", () => {
    const cfg = configFrom({
      static_site: {
        source_file: "README.md",
        parallel_docs_markdown: ".parallel-docs/source/README.md.md",
      },
    });

    const inputs = resolveRenderInputs(cfg, {
      source: "a.ts",
      markdown: "notes/a.md",
      out: "build/a.html",
    });

    expect(inputs).toEqual({ source: "a.ts", markdown: "notes/a.md", out: "build/a.html" });
  });
});

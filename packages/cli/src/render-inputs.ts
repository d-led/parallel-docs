import path from "node:path";

import {
  parallelDocsMarkdownPath,
  normalizeRepoRelativePath,
  resolveParallelDocsMarkdownPath,
  type ResolvedParallelDocsConfig,
} from "@parallel-docs/core";

/** Raw `parallel-docs render` flags as parsed by Commander; all three may be omitted. */
export type RenderCliOptions = {
  source?: string;
  markdown?: string;
  out?: string;
};

/** Repo-relative inputs ready to feed into the render pipeline. */
export type ResolvedRenderInputs = {
  source: string;
  markdown: string;
  out: string;
};

/** Default static-output location when `--out` is omitted (matches `npm run pages:build`). */
export const DEFAULT_RENDER_OUT = path.posix.join("_site", "index.html");

/**
 * Fill in `parallel-docs render` flags from `.parallel-docs.toml`. Omitting every flag should
 * "just work" inside a configured tree; passing `--source` on its own derives the companion
 * Markdown via ParallelDocs's path convention rather than reusing the static-site default,
 * which is tied to a specific source file.
 */
export function resolveRenderInputs(
  cfg: ResolvedParallelDocsConfig,
  opts: RenderCliOptions,
  repoRoot?: string,
): ResolvedRenderInputs {
  const source = opts.source ?? cfg.staticSite.sourceFile;
  const staticSiteMarkdown = cfg.staticSite.parallelDocsMarkdownFile.trim();
  const useStaticSiteMarkdown = opts.source === undefined && staticSiteMarkdown.length > 0;
  const normalizedSource = normalizeRepoRelativePath(source);
  const markdown =
    opts.markdown ??
    (useStaticSiteMarkdown
      ? staticSiteMarkdown
      : repoRoot
        ? resolveParallelDocsMarkdownPath(repoRoot, normalizedSource, cfg).parallelDocsPath
        : parallelDocsMarkdownPath(source, cfg.storageDir));
  const out = opts.out ?? DEFAULT_RENDER_OUT;
  return { source, markdown, out };
}

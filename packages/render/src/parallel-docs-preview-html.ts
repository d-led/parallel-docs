import type { BlockScrollLink } from "@parallel-docs/core";

import { injectParallelDocsDocAnchors } from "./inject-md-line-anchors.js";
import { renderMarkdownToHtml, type MarkdownPipelineOptions } from "./markdown-pipeline.js";

export type RenderParallelDocsPreviewHtmlArgs = {
  markdown: string;
  blockScrollLinks?: BlockScrollLink[];
  pipeline?: MarkdownPipelineOptions;
};

/**
 * Renders companion Markdown the same way as static pages: injects per-line / block anchors (for
 * scroll sync), then runs the shared remark/rehype pipeline.
 */
export async function renderParallelDocsPreviewHtml(
  args: RenderParallelDocsPreviewHtmlArgs,
): Promise<string> {
  const links = args.blockScrollLinks?.length ? args.blockScrollLinks : undefined;
  const prepared = injectParallelDocsDocAnchors(args.markdown, links);
  return renderMarkdownToHtml(prepared, args.pipeline);
}

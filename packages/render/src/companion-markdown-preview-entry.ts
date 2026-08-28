/**
 * Narrow entry for embedders that only need companion Markdown → HTML (same pipeline as static
 * pages) without pulling in the full code-browser shell, search UI, or other site chrome.
 */
export {
  renderParallelDocsPreviewHtml,
  type RenderParallelDocsPreviewHtmlArgs,
} from "./parallel-docs-preview-html.js";
export type { ParallelDocsOutputUrlOptions, MarkdownPipelineOptions } from "./markdown-pipeline.js";

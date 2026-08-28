/**
 * Narrow entry for embedders that only need companion Markdown → HTML (same pipeline as static
 * pages) without pulling in the full code-browser shell, search UI, or other site chrome.
 */
export {
  renderSideTrackPreviewHtml,
  type RenderSideTrackPreviewHtmlArgs,
} from "./sidetrack-preview-html.js";
export type { SideTrackOutputUrlOptions, MarkdownPipelineOptions } from "./markdown-pipeline.js";

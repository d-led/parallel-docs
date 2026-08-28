export { renderCodeBrowserHtml } from "./code-browser.js";
export type {
  CodeBrowserMultiAngleBrowsing,
  CodeBrowserMultiAngleSpec,
  CodeBrowserPageOptions,
  DualPaneScrollSyncStrategyId,
  StretchBufferSyncStrategy,
} from "./code-browser.js";
export { parallelDocsRenderVersion } from "./package-version.js";
export type {
  ParallelDocsOutputUrlOptions,
  ParallelDocsStaticAssetCopy,
  MarkdownPipelineOptions,
} from "./markdown-pipeline.js";
export {
  PARALLEL_DOCS_STATIC_COMPANION_ASSETS_SEGMENT,
  renderFencedCode,
  renderMarkdownToHtml,
} from "./markdown-pipeline.js";
export {
  renderParallelDocsPreviewHtml,
  type RenderParallelDocsPreviewHtmlArgs,
} from "./parallel-docs-preview-html.js";
export {
  injectParallelDocsDocAnchors,
  injectSourceMarkdownAnchors,
} from "./inject-md-line-anchors.js";
export { renderSideBySideHtml } from "./side-by-side.js";
export type { SideBySideOptions } from "./side-by-side.js";
export { browsePageSlugFromPair } from "./browse-page-slug.js";
export {
  appendHtmlToOpaqueBrowsePathname,
  appendHtmlToOpaqueBrowseRequestUrl,
} from "./code-browser-pair-nav.js";
export {
  buildParallelDocsNavSearchDocument,
  PARALLEL_DOCS_NAV_SEARCH_SCHEMA_VERSION,
} from "./build-parallel-docs-nav-search.js";
export type {
  BuildParallelDocsNavSearchFallback,
  BuildParallelDocsNavSearchGithubBlobBase,
  ParallelDocsNavSearchDocument,
  ParallelDocsNavSearchRow,
  DocumentedPairNav,
} from "./build-parallel-docs-nav-search.js";

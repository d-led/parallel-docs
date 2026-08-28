export { renderCodeBrowserHtml } from "./code-browser.js";
export type {
  CodeBrowserMultiAngleBrowsing,
  CodeBrowserMultiAngleSpec,
  CodeBrowserPageOptions,
  DualPaneScrollSyncStrategyId,
  StretchBufferSyncStrategy,
} from "./code-browser.js";
export { sidetrackRenderVersion } from "./package-version.js";
export type {
  SideTrackOutputUrlOptions,
  SideTrackStaticAssetCopy,
  MarkdownPipelineOptions,
} from "./markdown-pipeline.js";
export {
  SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT,
  renderFencedCode,
  renderMarkdownToHtml,
} from "./markdown-pipeline.js";
export {
  renderSideTrackPreviewHtml,
  type RenderSideTrackPreviewHtmlArgs,
} from "./sidetrack-preview-html.js";
export {
  injectSideTrackDocAnchors,
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
  buildSideTrackNavSearchDocument,
  SIDETRACK_NAV_SEARCH_SCHEMA_VERSION,
} from "./build-sidetrack-nav-search.js";
export type {
  BuildSideTrackNavSearchFallback,
  BuildSideTrackNavSearchGithubBlobBase,
  SideTrackNavSearchDocument,
  SideTrackNavSearchRow,
  DocumentedPairNav,
} from "./build-sidetrack-nav-search.js";

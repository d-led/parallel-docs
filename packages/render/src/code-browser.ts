import { existsSync, readFileSync } from "node:fs";
import path, { join } from "node:path";

import {
  buildBlockScrollLinks,
  type BlockScrollLink,
  type CommentrayIndex,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_STRETCH_BUFFER_SYNC,
  findMonorepoPackagesDir,
  monorepoLayoutStartDir,
  normalizeRepoRelativePath,
} from "@commentray/core";

import {
  tryBuildBlockStretchTableHtml,
  type StretchBufferSyncStrategy,
} from "./block-stretch-layout.js";
import { formatCommentrayBuiltAtLocal } from "./build-stamp.js";
import { escapeHtml } from "./html-utils.js";
import { commentrayColorThemeHeadBoot } from "./code-browser-color-theme.js";
import { hljsThemeCss } from "./hljs-theme-css.js";
import { hljsStylesheetThemes } from "./hljs-stylesheet-themes.js";
import { renderHighlightedCodeLineRows } from "./highlighted-code-lines.js";
import { COMMENTRAY_FAVICON_LINK_HTML } from "./inline-favicon.js";
import { mermaidRuntimeScriptHtml } from "./mermaid-runtime-html.js";
import { type CommentrayOutputUrlOptions, renderMarkdownToHtml } from "./markdown-pipeline.js";
import { commentrayRenderVersion } from "./package-version.js";
import { normPosixPath } from "./code-browser-pair-nav.js";
import {
  injectCommentrayDocAnchors,
  injectSourceMarkdownAnchors,
} from "./inject-md-line-anchors.js";
import {
  DEFAULT_DUAL_PANE_SCROLL_SYNC_STRATEGY,
  type DualPaneScrollSyncStrategyId,
} from "./code-browser-scroll-sync-strategy.js";

/** One angle tab; field semantics: `code-browser.ts` commentray. */
export type CodeBrowserMultiAngleSpec = {
  id: string;
  title?: string;
  markdown: string;
  commentrayPathRel: string;
  commentrayOnGithubUrl?: string;
  /** Same-tab Doc toolbar target for static `./browse/…` pages (vs GitHub blob). */
  staticBrowseUrl?: string;
  /** Must match this angle’s paths + primary `filePath` or scroll links are dropped. */
  blockStretchRows?: {
    index: CommentrayIndex;
    sourceRelative: string;
    commentrayPathRel: string;
  };
};

export type CodeBrowserMultiAngleBrowsing = {
  defaultAngleId: string;
  angles: CodeBrowserMultiAngleSpec[];
};

export type CodeBrowserPageOptions = {
  title?: string;
  /** Repo-relative (or otherwise meaningful) path to display prominently in the toolbar. */
  filePath?: string;
  code: string;
  language: string;
  commentrayMarkdown: string;
  includeMermaidRuntime?: boolean;
  /** Absolute path to a local Mermaid UMD build, used instead of the vendored one. */
  mermaidRuntimePath?: string;
  /** Highlight.js stylesheet base name (e.g. github, github-dark). */
  hljsTheme?: string;
  /**
   * Public Git (or other) URL for the repository whose source is shown — renders
   * as an Octocat link in the toolbar (top-right cluster on wide viewports).
   * Only `http:` / `https:` URLs are emitted.
   * When {@link siteHubUrl} is set (static hub export), that link takes this slot instead.
   */
  githubRepoUrl?: string;
  /**
   * Same-site URL for the static documentation hub (e.g. `./` on `index.html`, or a
   * depth-correct relative path to the hub from nested `browse/…` pages — see static export).
   * When set, the first toolbar control is a **home** link here instead of
   * {@link githubRepoUrl}. Uses the same path safety rules as {@link commentrayStaticBrowseUrl}.
   */
  siteHubUrl?: string;
  /**
   * Home URL for the Commentray project (footer shows "Rendered with Commentray" plus semver
   * and build date/time, linking here).
   * Only `http:` / `https:` URLs are emitted.
   */
  toolHomeUrl?: string;
  /**
   * When set, local `img`/`a` URLs and optional GitHub blob/tree rewrites resolve to paths
   * relative to the generated HTML file.
   */
  commentrayOutputUrls?: CommentrayOutputUrlOptions;
  /**
   * Optional “Also on GitHub …” toolbar links (other repo files). Used when only a single
   * `index.html` is published so in-repo Markdown links cannot target sibling paths on Pages.
   */
  relatedGithubNav?: { label: string; href: string }[];
  /**
   * Free-form label for `<meta name="generator">` (e.g. package versions). Omitted when unset.
   */
  generatorLabel?: string;
  /**
   * `<meta name="description">` content. When omitted, a short string is derived from the page title.
   */
  metaDescription?: string;
  /**
   * Instant this HTML was produced (footer “generated at” line and default generator meta).
   * Defaults to `new Date()` when omitted.
   */
  builtAt?: Date;
  /**
   * When set and index blocks align with `<!-- commentray:block id=… -->` markers,
   * emits a two-column **blame-style** table: **one row per block** (plus gap rows for
   * unmapped lines). Code and commentary cells share the **same row height** (the taller
   * side wins; the shorter side is top-aligned with natural padding below). One shell
   * scroll keeps both columns aligned.
   */
  blockStretchRows?: {
    index: CommentrayIndex;
    sourceRelative: string;
    commentrayPathRel: string;
  };
  /**
   * `auto` (default): when `blockStretchRows` is set and a block-stretch table can be built,
   * use the stretch layout; otherwise dual panes.
   * `dual`: always use side-by-side panes (skips stretch), so block markers + index can drive
   * **block-aware** scroll sync and separator lines in the commentray pane.
   */
  codeBrowserLayout?: "auto" | "dual";
  /**
   * Stretch layout only. Omitted uses `DEFAULT_STRETCH_BUFFER_SYNC` from `@commentray/core`
   * (`flow-synchronizer`: sync ids + measure wrappers + client `BufferingFlowSynchronizer`).
   * `table`: legacy row height only, no shell flag / client padding pass.
   */
  stretchBufferSync?: StretchBufferSyncStrategy;
  /**
   * Dual-pane scroll correlation (`#shell data-scroll-sync-strategy`). Strategies are mutually
   * exclusive in the client; omit or set to the default for normal builds. `filler-blocks` is
   * reserved until height-matched buffer layout exists (currently behaves like the default).
   */
  dualPaneScrollSyncStrategy?: DualPaneScrollSyncStrategyId;
  /**
   * `full` (default): in-page search indexes every source line and every commentray line.
   * `commentray-and-paths`: search only **toolbar path labels** plus commentray Markdown (no code-body line corpus).
   */
  staticSearchScope?: "full" | "commentray-and-paths";
  /** Repo-relative companion Markdown path; used with `staticSearchScope: "commentray-and-paths"` for path labels. */
  commentrayPathForSearch?: string;
  /**
   * GitHub **blob** URL for the primary `filePath` (static hub). Shown in the toolbar when set
   * (`http`/`https` only).
   */
  sourceOnGithubUrl?: string;
  /**
   * GitHub **blob** URL for the companion commentray Markdown (same constraints as `sourceOnGithubUrl`).
   */
  commentrayOnGithubUrl?: string;
  /**
   * When set (e.g. `./browse/…/index.html`, `/browse/…/index.html`, or `./browse/<hash>.html` from
   * the static Pages build), the Doc toolbar icon opens this URL on the **same origin** instead of GitHub.
   */
  commentrayStaticBrowseUrl?: string;
  /**
   * Relative URL to a nav JSON document (e.g. `./commentray-nav-search.json`) that includes
   * `documentedPairs` — enables the **Comment-rayed files** tree in the toolbar.
   */
  documentedNavJsonUrl?: string;
  /**
   * Base64 UTF-8 JSON array of documented pairs (same shape as `documentedPairs` in the nav JSON).
   * When set on `#shell`, the tree loads **without** fetching `documentedNavJsonUrl` — works offline
   * and with `file://` where `fetch` to a sidecar JSON is unavailable.
   */
  documentedPairsEmbeddedB64?: string;
  /**
   * When **two or more** angles are listed for the same static browse session, the shell renders
   * an Angle selector. If every angle can build a block-stretch table (`layout` `auto`), the shell
   * uses **stretch** (one scroll + row-aligned table); otherwise **dual** panes with client swap.
   */
  multiAngleBrowsing?: CodeBrowserMultiAngleBrowsing;
  /**
   * When set to a valid Git object id (7–40 hex digits, e.g. CI `github.sha`), appended to the
   * page footer after the build time so published static output is traceable to a commit.
   * Omit for local builds.
   */
  pagesBuildCommitSha?: string;
};

function renderGeneratorMetaHtml(label: string | undefined): string {
  const t = label?.trim();
  if (!t) return "";
  return `<meta name="generator" content="${escapeHtml(t)}" />\n    `;
}

/** Accepts short or full SHA; returns lowercase hex or undefined if the string is not a Git object name. */
function normalizePagesBuildCommitSha(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(lower)) return undefined;
  return lower;
}

function footerCommitSuffixHtml(commitSha: string): string {
  const esc = escapeHtml(commitSha);
  return ` · <code class="app__footer-attribution__sha" translate="no">${esc}</code>`;
}

const META_DESCRIPTION_MAX_LEN = 320;

function codeBrowserMetaDescription(opts: CodeBrowserPageOptions, title: string): string {
  const custom = opts.metaDescription?.trim();
  if (custom) return custom.slice(0, META_DESCRIPTION_MAX_LEN);
  const fallback = `${title} — Side-by-side source and commentray documentation.`;
  return fallback.slice(0, META_DESCRIPTION_MAX_LEN);
}

function renderMetaDescriptionHtml(opts: CodeBrowserPageOptions, title: string): string {
  const content = codeBrowserMetaDescription(opts, title);
  return `<meta name="description" content="${escapeHtml(content)}" />\n    `;
}

/** GitHub “mark” glyph (Octicons-style path), MIT-licensed silhouette. */
const GITHUB_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>' +
  "</svg>";

/** Simple home glyph for same-site hub link (matches Octocat control size). */
const SITE_HOME_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
  '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>' +
  "</svg>";

/** Folder-with-list glyph (file tree / documented pairs hub). */
const TOOLBAR_ICON_TREE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 20h16a1 1 0 0 0 1-1V9a2 2 0 0 0-2-2h-5.5a2 2 0 0 1-1.6-.8L10.5 4.5a2 2 0 0 0-1.6-.8H5a2 2 0 0 0-2 2v14a1 1 0 0 0 1 1Z"/>' +
  '<path d="M8 12h8M8 16h6M8 20h4"/>' +
  "</svg>";

/**
 * Line wrap — Material "wrap_text" glyph (Apache-2.0), same visual family as
 * https://www.svgrepo.com/svg/376703/text-wrap-line (filled 24dp path scaled to 18px).
 */
const TOOLBAR_ICON_WRAP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
  '<path d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3 3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"/>' +
  "</svg>";

const CHROME_ICON_SEARCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="11" cy="11" r="7"/>' +
  '<path d="m21 21-4.3-4.3"/>' +
  "</svg>";

/** Swap / flip: circle split by a diameter, one arrow per half (narrow viewports). */
const TOOLBAR_ICON_FLIP_PANES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/>' +
  '<path d="M12 4v16"/>' +
  '<path d="M10.5 12H6l2.5-2.5M6 12l2.5 2.5"/>' +
  '<path d="M13.5 12H18l-2.5-2.5M18 12l-2.5 2.5"/>' +
  "</svg>";

/** Source markdown mode flip: rendered page <-> plain markdown rows. */
const TOOLBAR_ICON_FLIP_SOURCE_MARKDOWN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="8" height="16" rx="1.5"/>' +
  '<path d="M6 8h2M6 11h2M6 14h2"/>' +
  '<rect x="13" y="4" width="8" height="16" rx="1.5"/>' +
  '<path d="m15.5 12 2-2 2 2"/>' +
  '<path d="m19.5 12-2 2-2-2"/>' +
  "</svg>";

/** Link/share glyph for copying a permalink to the current documentation pair. */
const TOOLBAR_ICON_SHARE_LINK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 6"/>' +
  '<path d="M14 10a5 5 0 0 0-7.07 0L4.1 12.83a5 5 0 0 0 7.07 7.07L14 17"/>' +
  "</svg>";

/** Help glyph for re-running the onboarding walkthrough. */
const TOOLBAR_ICON_HELP_TOUR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/>' +
  '<path d="M9.1 9a3 3 0 1 1 4.92 2.3c-.8.6-1.52 1.08-1.52 2.2"/>' +
  '<circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/>' +
  "</svg>";

function safeExternalHttpUrl(url: string | undefined): string | null {
  const t = url?.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/** Allows relative static browse links (`./browse/…`) and `http(s):` URLs; rejects `javascript:` / `data:`. */
function safeToolbarNavigationHref(url: string | undefined): string | null {
  const t = url?.trim();
  if (!t) return null;
  if (/^(javascript|data):/i.test(t)) return null;
  return t;
}

function buildToolbarSiteHubHtml(siteHubUrl: string | undefined): string {
  const site = safeToolbarNavigationHref(siteHubUrl);
  if (!site) return "";
  const se = escapeHtml(site);
  return `<a class="toolbar-github" href="${se}" aria-label="Documentation home" title="Back to this site (hub)">${SITE_HOME_SVG}</a>`;
}

/** GitHub Octocat in the toolbar when a repo URL is set and the hub link does not replace it. */
function buildToolbarEndHtml(
  githubRepoUrl: string | undefined,
  siteHubUrl: string | undefined,
): string {
  const site = safeToolbarNavigationHref(siteHubUrl);
  const gh = safeExternalHttpUrl(githubRepoUrl);
  if (!site && gh) {
    const he = escapeHtml(gh);
    return `<div class="toolbar__end"><a class="toolbar-github" href="${he}" target="_blank" rel="noopener noreferrer" aria-label="View repository on GitHub" title="View repository on GitHub">${GITHUB_MARK_SVG}</a></div>`;
  }
  return "";
}

function renderPageFooterHtml(input: {
  builtAt: Date;
  toolHomeUrl: string | undefined;
  commentrayRenderSemver: string;
  pagesBuildCommitSha: string | undefined;
}): string {
  const { builtAt, toolHomeUrl, commentrayRenderSemver, pagesBuildCommitSha } = input;
  const iso = builtAt.toISOString();
  const human = formatCommentrayBuiltAtLocal(builtAt);
  const commitSuffix = pagesBuildCommitSha ? footerCommitSuffixHtml(pagesBuildCommitSha) : "";
  const tool = safeExternalHttpUrl(toolHomeUrl);
  if (tool) {
    const te = escapeHtml(tool);
    const ver = escapeHtml(commentrayRenderSemver);
    return (
      `<footer class="app__footer" role="contentinfo">` +
      `<p class="app__footer-line app__footer-attribution" role="note">` +
      `Rendered with <a href="${te}" target="_blank" rel="noopener noreferrer">Commentray</a> ` +
      `<span class="app__footer-attribution__version" translate="no">v${ver}</span>: ` +
      `<time datetime="${escapeHtml(iso)}">${escapeHtml(human)}</time>` +
      commitSuffix +
      `</p>` +
      `</footer>`
    );
  }
  return (
    `<footer class="app__footer" role="contentinfo">` +
    `<p class="app__footer-line">HTML generated <time datetime="${escapeHtml(iso)}">${escapeHtml(human)}</time>` +
    commitSuffix +
    `</p>` +
    `</footer>`
  );
}

function renderRelatedGithubNavHtml(links: { label: string; href: string }[]): string {
  if (links.length === 0) return "";
  const parts = links.map(
    (l) =>
      `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`,
  );
  return (
    `<nav class="toolbar-related" aria-label="Open other repository files on GitHub">` +
    `<span class="toolbar-related__prefix">Also on GitHub</span>` +
    `<span class="toolbar-related__links">${parts.join('<span class="toolbar-related__sep" aria-hidden="true"> · </span>')}</span>` +
    `</nav>`
  );
}

function renderToolbarDocHubHtml(opts: {
  documentedNavJsonUrl?: string;
  documentedPairsEmbeddedB64?: string;
}): { toolbarDocHubHtml: string; navRailDocumentedHtml: string } {
  const nav = opts.documentedNavJsonUrl?.trim();
  const hasEmbed = (opts.documentedPairsEmbeddedB64?.trim() ?? "").length > 0;
  const showDocumentedTree = Boolean(nav) || hasEmbed;
  const toolbarDocHubHtml = "";
  const navAttr = escapeHtml(nav ?? "");
  const navRailDocumentedHtml = showDocumentedTree
    ? loadNavRailDocHubTemplate()
        .replaceAll("__NAV_JSON_URL__", navAttr)
        .replaceAll("__TREE_ICON_SVG__", TOOLBAR_ICON_TREE_SVG)
    : "";
  return { toolbarDocHubHtml, navRailDocumentedHtml };
}

function dualPanePanesInnerHtml(
  codeHtml: string,
  commentrayHtml: string,
  sourceMarkdownRenderedHtml?: string,
): string {
  const sourceRenderedPaneHtml =
    typeof sourceMarkdownRenderedHtml === "string" && sourceMarkdownRenderedHtml.trim().length > 0
      ? `          <div class="source-pane source-pane--rendered-md" id="code-pane-markdown-body" data-source-markdown-body="true">${sourceMarkdownRenderedHtml}</div>\n`
      : "";
  return (
    `        <section class="pane--code" id="code-pane" aria-label="Source code">` +
    `          <div class="source-pane source-pane--code" id="code-pane-code-body">${codeHtml}</div>\n` +
    sourceRenderedPaneHtml +
    `        </section>\n` +
    `        <div class="gutter" id="gutter" role="separator" aria-orientation="vertical" aria-label="Resize panes"></div>\n` +
    `        <section class="pane--doc commentray" id="doc-pane" aria-label="Commentray">\n` +
    `          <div id="doc-pane-body" class="doc-pane-body">\n` +
    `          ${commentrayHtml}\n` +
    `          </div>\n` +
    `        </section>\n`
  );
}

function sourceMarkdownToggleControlsHtml(enabled: boolean): {
  sourceMarkdownToggleHtml: string;
  sourceMarkdownFlipScrollAffordanceHtml: string;
} {
  if (!enabled) {
    return { sourceMarkdownToggleHtml: "", sourceMarkdownFlipScrollAffordanceHtml: "" };
  }
  const label = "Switch source pane between rendered markdown and markdown source";
  const title = "Switch source pane between rendered markdown and markdown source";
  const btn = `<button type="button" id="source-markdown-pane-flip" class="toolbar-source-render-toggle" aria-controls="code-pane" aria-pressed="false" aria-label="${label}" title="${title}"><span class="toolbar-source-render-toggle__box" aria-hidden="true"></span><span class="toolbar-source-render-toggle__face" aria-hidden="true">${TOOLBAR_ICON_FLIP_SOURCE_MARKDOWN_SVG}</span><span class="toolbar-source-render-toggle__caption">Render</span></button>`;
  const floating = `<button type="button" id="source-markdown-pane-flip-scroll" class="toolbar-icon-btn toolbar-icon-btn--source-markdown-scroll-narrow" hidden aria-controls="code-pane" aria-pressed="false" aria-label="${label}" title="${title}">${TOOLBAR_ICON_FLIP_SOURCE_MARKDOWN_SVG}</button>`;
  return {
    sourceMarkdownToggleHtml: btn,
    sourceMarkdownFlipScrollAffordanceHtml: floating,
  };
}

function isMarkdownLikeSource(opts: CodeBrowserPageOptions): boolean {
  const lang = opts.language.trim().toLowerCase();
  if (lang === "md" || lang === "markdown" || lang === "mdx") return true;
  if (lang.length > 0) return false;
  const filePath = (opts.filePath ?? "").trim().toLowerCase();
  return filePath.endsWith(".md") || filePath.endsWith(".mdx") || filePath.endsWith(".markdown");
}

/** For source-pane Markdown, resolve local links from the source file directory (repo tree), not companion storage. */
function sourcePaneOutputUrls(
  opts: CodeBrowserPageOptions,
): CommentrayOutputUrlOptions | undefined {
  const out = opts.commentrayOutputUrls;
  if (!out) return undefined;
  const srcRel = (opts.filePath ?? "").trim();
  if (srcRel.length === 0) return out;
  const repoRoot = path.resolve(out.repoRootAbs);
  const candidate = path.resolve(repoRoot, srcRel);
  const rel = path.relative(repoRoot, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return out;
  return { ...out, markdownUrlBaseDirAbs: path.dirname(candidate) };
}

/** Pair paths above the panes; column widths track the resizable split via `--split-pct`. */
function renderShellPairContextHtml(
  filePath: string | undefined,
  commentrayPath: string | undefined,
): string {
  const fpRaw = (filePath ?? "").trim();
  const crRaw = (commentrayPath ?? "").trim();
  if (fpRaw.length === 0 && crRaw.length === 0) return "";
  const fp = escapeHtml(fpRaw);
  const cr = escapeHtml(crRaw);
  const fpDisp = fpRaw.length > 0 ? fp : "—";
  const crDisp = crRaw.length > 0 ? cr : "—";
  return `<div class="shell__pair-context" aria-label="Current documentation pair">
    <div class="shell__pair-cell shell__pair-cell--src">
      <span class="shell__pair-path" title="${fp}">${fpDisp}</span>
    </div>
    <div class="shell__pair-gutter-spacer" aria-hidden="true"></div>
    <div class="shell__pair-cell shell__pair-cell--doc">
      <span class="shell__pair-path shell__pair-path--secondary" id="nav-rail-doc-path" title="${cr}">${crDisp}</span>
    </div>
  </div>`;
}

function shellPairSourcePath(
  filePath: string | undefined,
  sourceRelative: string | undefined,
): string {
  const filePathTrimmed = (filePath ?? "").trim();
  if (filePathTrimmed.length > 0) return filePathTrimmed;
  return (sourceRelative ?? "").trim();
}

function shellPairCommentrayPath(
  commentrayPath: string | undefined,
  fallbackCommentrayPath: string | undefined,
): string {
  const commentrayPathTrimmed = (commentrayPath ?? "").trim();
  if (commentrayPathTrimmed.length > 0) return commentrayPathTrimmed;
  return (fallbackCommentrayPath ?? "").trim();
}

function wrapShellInnerWithPairContext(pairContextHtml: string, mainHtml: string): string {
  const row = pairContextHtml.trim().length > 0 ? `        ${pairContextHtml.trim()}\n` : "";
  return `${row}${mainHtml}`;
}

function wrapDualShellInner(pairContextHtml: string, panesHtml: string): string {
  return wrapShellInnerWithPairContext(
    pairContextHtml,
    `        <div class="shell__panes">\n${panesHtml}        </div>\n`,
  );
}

/** IIFE produced by `npm run build -w @commentray/render` (esbuild of `code-browser-client.ts`). */
function loadCodeBrowserClientBundle(): string {
  const packagesDir = findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url));
  const renderDistDir = join(packagesDir, "render", "dist");
  const inDist = join(renderDistDir, "code-browser-client.bundle.js");
  const fromSrc = join(packagesDir, "render", "code-browser-client.bundle.js");
  for (const p of [inDist, fromSrc]) {
    if (existsSync(p)) {
      return readFileSync(p, "utf8");
    }
  }
  throw new Error(
    "Missing code-browser-client.bundle.js. Run `npm run build -w @commentray/render` to bundle the browser client.",
  );
}

/** Intro-tour specific stylesheet; kept in a dedicated CSS file for easier tweaking. */
function loadCodeBrowserIntroStyles(): string {
  const packagesDir = findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url));
  const renderDistDir = join(packagesDir, "render", "dist");
  const inDist = join(renderDistDir, "code-browser-intro.css");
  const fromSrc = join(packagesDir, "render", "src", "code-browser-intro.css");
  for (const p of [inDist, fromSrc]) {
    if (existsSync(p)) {
      return readFileSync(p, "utf8");
    }
  }
  throw new Error(
    "Missing code-browser-intro.css. Ensure the render package includes intro tour styles.",
  );
}

/**
 * Compact theme control: primary click opens a menu (readme.io–style), secondary click cycles
 * system → light → dark. Paired with {@link ./code-browser-color-theme.ts} and the client bundle.
 */
const TOOLBAR_COLOR_THEME_HTML = `          <div class="toolbar-theme">
            <button type="button" id="commentray-theme-trigger" class="toolbar-theme__trigger" data-commentray-trigger-mode="system" aria-haspopup="menu" aria-expanded="false" aria-label="Color theme" title="Appearance: left-click opens the theme menu. Right-click cycles System, Light, and Dark.">
              <span class="toolbar-theme__icon toolbar-theme__icon--system" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg></span>
              <span class="toolbar-theme__icon toolbar-theme__icon--light" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 6.34L4.93 4.93m12.02 12.02l1.41 1.41M17.66 6.34l1.41-1.41M6.34 17.66l-1.41 1.41"/></svg></span>
              <span class="toolbar-theme__icon toolbar-theme__icon--dark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
            </button>
            <div id="commentray-theme-menu" class="toolbar-theme__menu" role="menu" hidden aria-labelledby="commentray-theme-trigger">
              <button type="button" role="menuitemradio" class="toolbar-theme__menuitem" data-commentray-theme-value="system" aria-checked="true">System</button>
              <button type="button" role="menuitemradio" class="toolbar-theme__menuitem" data-commentray-theme-value="light" aria-checked="false">Light</button>
              <button type="button" role="menuitemradio" class="toolbar-theme__menuitem" data-commentray-theme-value="dark" aria-checked="false">Dark</button>
            </div>
          </div>
`;

const TOOLBAR_SHARE_LINK_HTML = `          <button type="button" id="commentray-share-link" class="toolbar-theme__trigger toolbar-share-link-btn" aria-label="Copy shareable permalink" title="Copy shareable permalink">${TOOLBAR_ICON_SHARE_LINK_SVG}</button>
`;

const TOOLBAR_HELP_TOUR_HTML = `          <button type="button" id="commentray-help-tour" class="toolbar-theme__trigger toolbar-help-tour-btn" aria-label="Restart onboarding walkthrough" title="Restart onboarding walkthrough">${TOOLBAR_ICON_HELP_TOUR_SVG}</button>
`;

const CODE_BROWSER_INTRO_STYLES = loadCodeBrowserIntroStyles();

const COMMENTRAY_SHELL_INTRO_PLACEHOLDER = "/* __COMMENTRAY_INTRO_CSS__ */";

/** Code browser chrome + panes; intro tour rules are spliced from {@link ./code-browser-intro.css}. */
function loadCodeBrowserShellStylesFile(): string {
  const packagesDir = findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url));
  const renderDistDir = join(packagesDir, "render", "dist");
  const inDist = join(renderDistDir, "code-browser-shell.css");
  const fromSrc = join(packagesDir, "render", "src", "code-browser-shell.css");
  for (const tryPath of [inDist, fromSrc]) {
    if (existsSync(tryPath)) {
      return readFileSync(tryPath, "utf8");
    }
  }
  throw new Error(
    "Missing code-browser-shell.css. Run `npm run build -w @commentray/render` or ensure the file exists under render/src.",
  );
}

let cachedCodeBrowserShellCss: string | undefined;
function getCodeBrowserShellCss(): string {
  if (cachedCodeBrowserShellCss === undefined) {
    cachedCodeBrowserShellCss = loadCodeBrowserShellStylesFile();
    if (!cachedCodeBrowserShellCss.includes(COMMENTRAY_SHELL_INTRO_PLACEHOLDER)) {
      throw new Error("code-browser-shell.css is missing the intro splice placeholder.");
    }
  }
  return cachedCodeBrowserShellCss;
}

const CODE_BROWSER_STYLES = getCodeBrowserShellCss().replace(
  COMMENTRAY_SHELL_INTRO_PLACEHOLDER,
  CODE_BROWSER_INTRO_STYLES,
);

let cachedNavRailDocHubTemplate: string | undefined;
function loadNavRailDocHubTemplate(): string {
  if (cachedNavRailDocHubTemplate === undefined) {
    const packagesDir = findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url));
    const renderDistDir = join(packagesDir, "render", "dist");
    const inDist = join(renderDistDir, "code-browser-nav-rail-doc-hub.html");
    const fromSrc = join(packagesDir, "render", "src", "code-browser-nav-rail-doc-hub.html");
    for (const tryPath of [inDist, fromSrc]) {
      if (existsSync(tryPath)) {
        cachedNavRailDocHubTemplate = readFileSync(tryPath, "utf8").trimEnd();
        break;
      }
    }
    if (cachedNavRailDocHubTemplate === undefined) {
      throw new Error(
        "Missing code-browser-nav-rail-doc-hub.html under render/src or render/dist.",
      );
    }
  }
  return cachedNavRailDocHubTemplate;
}

/** Native tooltip on #search-q (short hint is visible under the search row). */
const CODE_BROWSER_SEARCH_INPUT_TITLE =
  "Filename, path, or words. Matches this pair (source + commentray lines) first; merges commentray-nav-search.json when the export includes it (indexed paths + commentray lines).";

type CodeBrowserPageParts = {
  title: string;
  metaDescriptionHtml: string;
  generatorMetaHtml: string;
  /** Same-site hub control; first in `toolbar__primary-main` when present. */
  toolbarSiteHubHtml: string;
  /**
   * When non-empty, ` data-commentray-pair-source-path="…" data-commentray-pair-commentray-path="…"` on `#shell`
   * so the documented-files tree can mark the active pair (incl. multi-angle updates on the client).
   */
  shellPairIdentityDataAttrs: string;
  /** When non-empty, ` data-commentray-pair-browse-href="…"` on `#shell` (same-site browse or GitHub blob). */
  shellPairDocDataAttr: string;
  angleSelectHtml: string;
  toolbarDocHubHtml: string;
  navRailDocumentedHtml: string;
  relatedNavHtml: string;
  toolbarEndHtml: string;
  pageFooterHtml: string;
  /** `dual`: resizable panes; `stretch`: rowspan table aligned to index blocks. */
  layout: "dual" | "stretch";
  shellInner: string;
  rawCodeB64: string;
  rawMdB64: string;
  /** Base64 JSON of `BlockScrollLink[]` when dual pane uses index-backed scroll sync; empty otherwise. */
  scrollBlockLinksB64: string;
  /** When non-empty, ` data-documented-pairs-b64="…"` on `#shell` for offline tree hydration. */
  shellDocumentedPairsAttr: string;
  hljsLightCss: string;
  hljsDarkCss: string;
  mermaidScript: string;
  searchPlaceholder: string;
  shellSearchAttrs: string;
  /** Base64 JSON payload for multi-angle static browsing (see `code-browser-client.ts`). */
  multiAngleScriptBlock: string;
  /** Markdown source pages can flip between rendered/source in the source pane. */
  sourceMarkdownToggleHtml: string;
  sourceMarkdownFlipScrollAffordanceHtml: string;
  sourcePaneModeAttr: string;
  /** Optional ` data-scroll-sync-strategy="…"` fragment on `#shell` (empty when default / unset). */
  scrollSyncStrategyShellAttr?: string;
  /** Optional ` data-stretch-buffer-sync="flow-synchronizer"` on `#shell` when stretch uses the algo path. */
  stretchBufferSyncShellAttr?: string;
};

function buildCodeBrowserPageHtml(p: CodeBrowserPageParts): string {
  const shellClass = p.layout === "stretch" ? "shell shell--stretch-rows" : "shell";
  const dualFlipControlHtml =
    p.layout === "dual" || p.layout === "stretch"
      ? `<button type="button" id="mobile-pane-flip" class="toolbar-icon-btn toolbar-icon-btn--flip-only-narrow" aria-label="Switch between source code and commentary" title="Switch between source code and commentary">${TOOLBAR_ICON_FLIP_PANES_SVG}</button>`
      : "";
  const dualFlipScrollAffordanceHtml =
    p.layout === "dual" || p.layout === "stretch"
      ? `<button type="button" id="mobile-pane-flip-scroll" class="toolbar-icon-btn toolbar-icon-btn--flip-scroll-narrow" hidden aria-label="Switch between source code and commentary" title="Switch between source code and commentary">${TOOLBAR_ICON_FLIP_PANES_SVG}</button>`
      : "";
  return `<!doctype html>
<html lang="en" data-commentray-theme="system">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${COMMENTRAY_FAVICON_LINK_HTML}
    ${p.metaDescriptionHtml}${p.generatorMetaHtml}<title>${escapeHtml(p.title)}</title>
    <style id="commentray-hljs-light" media="(prefers-color-scheme: light)">${p.hljsLightCss}</style>
    <style id="commentray-hljs-dark" media="(prefers-color-scheme: dark)">${p.hljsDarkCss}</style>
    <script>
${commentrayColorThemeHeadBoot()}
    </script>
    <style>
${CODE_BROWSER_STYLES}
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <div class="app">
      <header class="toolbar" role="banner" aria-label="View options">
        <h1 class="sr-only">${escapeHtml(p.title)}</h1>
        <div class="toolbar__primary">
          <div class="toolbar__primary-main">
          ${p.toolbarSiteHubHtml}
          ${p.navRailDocumentedHtml}
          ${p.angleSelectHtml}
          ${dualFlipControlHtml}
          <label class="toolbar-wrap-lines" title="Wrap long lines in the source pane; in commentary, wrap long words and fenced code when on (wide tables and diagrams scroll horizontally).">
            <input type="checkbox" id="wrap-lines" class="toolbar-wrap-lines__input" />
            <span class="toolbar-wrap-lines__box" aria-hidden="true"></span>
            <span class="toolbar-wrap-lines__face" aria-hidden="true">${TOOLBAR_ICON_WRAP_SVG}</span>
            <span class="toolbar-wrap-lines__caption">Wrap lines</span>
          </label>
          ${p.sourceMarkdownToggleHtml}
          ${p.toolbarDocHubHtml}
          ${p.relatedNavHtml}
          </div>
          <div class="toolbar__primary-trail">
        ${p.toolbarEndHtml}
${TOOLBAR_SHARE_LINK_HTML}
${TOOLBAR_HELP_TOUR_HTML}
${TOOLBAR_COLOR_THEME_HTML}
          </div>
        </div>
      </header>
      ${dualFlipScrollAffordanceHtml}
      ${p.sourceMarkdownFlipScrollAffordanceHtml}
      <header class="app__chrome" role="region" aria-label="Search">
        <div class="chrome__search-row">
          <label class="chrome__search-label" for="search-q" aria-label="Search" title="Search"><span class="chrome__search-label__caption nav-rail__search-label">Search</span><span class="chrome__search-label__glyph" aria-hidden="true">${CHROME_ICON_SEARCH_SVG}</span></label>
          <input type="search" id="search-q" placeholder="${escapeHtml(p.searchPlaceholder)}" title="${escapeHtml(CODE_BROWSER_SEARCH_INPUT_TITLE)}" autocomplete="off" spellcheck="false" />
          <button type="button" id="search-clear" aria-label="Clear search" title="Clear search">Clear</button>
        </div>
        <div class="search-results" id="search-results" hidden aria-live="polite"></div>
      </header>
      <main id="main-content" class="app__main" tabindex="-1">
        <div class="${shellClass}" id="shell" data-layout="${p.layout}"${p.layout === "dual" || p.layout === "stretch" ? ' data-dual-mobile-pane="doc"' : ""}${p.sourcePaneModeAttr} data-raw-code-b64="${escapeHtml(p.rawCodeB64)}" data-raw-md-b64="${escapeHtml(p.rawMdB64)}" data-scroll-block-links-b64="${escapeHtml(p.scrollBlockLinksB64)}"${p.shellDocumentedPairsAttr}${p.shellSearchAttrs}${p.shellPairIdentityDataAttrs}${p.shellPairDocDataAttr}${p.scrollSyncStrategyShellAttr ?? ""}${p.stretchBufferSyncShellAttr ?? ""}>
${p.shellInner}
        </div>
      </main>
      ${p.pageFooterHtml}
    </div>
    <script type="text/plain" id="commentray-multi-angle-b64">${p.multiAngleScriptBlock}</script>
    ${p.mermaidScript}
    <script>
${loadCodeBrowserClientBundle()}
    </script>
  </body>
</html>`;
}

type CodeBrowserShell = {
  layout: "dual" | "stretch";
  shellInner: string;
  scrollBlockLinksB64: string;
  angleSelectHtml: string;
  multiAnglePayloadB64: string;
  sourceMarkdownToggleEnabled: boolean;
  sourcePaneDefaultMode: "source" | "rendered-markdown";
  /** Set when `layout` is `stretch`; drives `data-stretch-buffer-sync` on `#shell`. */
  stretchBufferSync?: StretchBufferSyncStrategy;
  /** When multi-angle browsing is active, overrides shell `data-raw-md-b64` / search path / GitHub link. */
  multiShell?: {
    rawMdB64: string;
    scrollBlockLinksB64: string;
    commentrayPathForSearch: string;
    commentrayOnGithubUrl?: string;
    commentrayStaticBrowseUrl?: string;
  };
};

type MultiAngleJsonRow = {
  id: string;
  title: string;
  docInnerHtmlB64: string;
  rawMdB64: string;
  scrollBlockLinksB64: string;
  commentrayPathForSearch: string;
  commentrayOnGithubUrl?: string;
  staticBrowseUrl?: string;
  /** Multi-angle stretch: base64 UTF-8 of `#shell` inner HTML for this angle (table row “arithmetics”). */
  stretchSwapInnerB64?: string;
};

type MultiAngleDefaultSelection = {
  defaultMarkdown: string;
  defaultScrollB64: string;
  defaultPathSearch: string;
  defaultGh: string | undefined;
  defaultStaticBrowse: string;
  defaultPaneHtml: string;
};

function firstNonEmpty(values: string[]): string | undefined {
  return values.find((v) => v.trim().length > 0);
}

function stretchBufferSyncFromOpts(opts: CodeBrowserPageOptions): StretchBufferSyncStrategy {
  return opts.stretchBufferSync ?? DEFAULT_STRETCH_BUFFER_SYNC;
}

function angleBlockStretchRowsPathOk(
  spec: CodeBrowserMultiAngleSpec,
  opts: CodeBrowserPageOptions,
): boolean {
  const rows = spec.blockStretchRows;
  if (rows === undefined) return false;
  const angleCrNorm = normalizeRepoRelativePath(spec.commentrayPathRel.replaceAll("\\", "/"));
  const primaryNorm = normalizeRepoRelativePath((opts.filePath ?? "").replaceAll("\\", "/"));
  return (
    normalizeRepoRelativePath(rows.commentrayPathRel.replaceAll("\\", "/")) === angleCrNorm &&
    normalizeRepoRelativePath(rows.sourceRelative.replaceAll("\\", "/")) === primaryNorm
  );
}

function multiAngleToolbarAngleSelectHtml(
  multi: CodeBrowserMultiAngleBrowsing,
  defaultId: string,
): string {
  const selOpts = multi.angles
    .map((a) => {
      const lab = escapeHtml(a.title?.trim() || a.id);
      return `<option value="${escapeHtml(a.id)}"${a.id === defaultId ? " selected" : ""}>${lab}</option>`;
    })
    .join("");
  return `<span class="toolbar-angle-picker"><label class="toolbar-angle-picker__lab nav-rail__search-label" for="angle-select">Angle</label><select id="angle-select" aria-label="Commentray angle">${selOpts}</select></span>`;
}

function resolveMultiAngleDefaultSelection(args: {
  multi: CodeBrowserMultiAngleBrowsing;
  defaultId: string;
  opts: CodeBrowserPageOptions;
  builtAngles: Array<{
    spec: CodeBrowserMultiAngleSpec;
    commentrayHtml: string;
    scrollB64: string;
  }>;
}): MultiAngleDefaultSelection {
  const { multi, defaultId, opts, builtAngles } = args;
  let defaultMarkdown = opts.commentrayMarkdown;
  let defaultScrollB64 = "";
  let defaultPathSearch = (opts.commentrayPathForSearch ?? "").trim();
  let defaultGh = opts.commentrayOnGithubUrl;
  let defaultStaticBrowse = (opts.commentrayStaticBrowseUrl ?? "").trim();
  let defaultPaneHtml = "";
  for (const b of builtAngles) {
    if (b.spec.id !== defaultId) continue;
    defaultMarkdown = b.spec.markdown;
    defaultScrollB64 = b.scrollB64;
    defaultPathSearch = b.spec.commentrayPathRel.trim();
    defaultGh = b.spec.commentrayOnGithubUrl;
    defaultStaticBrowse = (b.spec.staticBrowseUrl ?? "").trim();
    defaultPaneHtml = b.commentrayHtml;
    break;
  }
  if (defaultStaticBrowse.length === 0) {
    defaultStaticBrowse =
      firstNonEmpty(multi.angles.map((a) => (a.staticBrowseUrl ?? "").trim())) ?? "";
  }
  if ((defaultGh ?? "").trim().length === 0) {
    defaultGh = firstNonEmpty(multi.angles.map((a) => (a.commentrayOnGithubUrl ?? "").trim()));
  }
  return {
    defaultMarkdown,
    defaultScrollB64,
    defaultPathSearch,
    defaultGh,
    defaultStaticBrowse,
    defaultPaneHtml,
  };
}

async function multiAngleJsonRowAndDocHtml(
  opts: CodeBrowserPageOptions,
  spec: CodeBrowserMultiAngleSpec,
): Promise<{ jsonRow: MultiAngleJsonRow; commentrayHtml: string; scrollB64: string }> {
  const rows = spec.blockStretchRows;
  const rowsPathOk = angleBlockStretchRowsPathOk(spec, opts);
  const angleCrNorm = normalizeRepoRelativePath(spec.commentrayPathRel.replaceAll("\\", "/"));
  const links =
    rows !== undefined && rowsPathOk
      ? buildBlockScrollLinks(
          rows.index,
          rows.sourceRelative,
          angleCrNorm,
          spec.markdown,
          opts.code,
        )
      : [];
  const mdForDoc = injectCommentrayDocAnchors(spec.markdown, links.length > 0 ? links : undefined);
  const scrollB64 =
    links.length > 0 ? Buffer.from(JSON.stringify(links), "utf8").toString("base64") : "";
  const commentrayHtml = await renderMarkdownToHtml(mdForDoc, {
    commentrayOutputUrls: opts.commentrayOutputUrls,
  });
  return {
    jsonRow: {
      id: spec.id,
      title: spec.title?.trim() || spec.id,
      docInnerHtmlB64: Buffer.from(commentrayHtml, "utf8").toString("base64"),
      rawMdB64: Buffer.from(spec.markdown, "utf8").toString("base64"),
      scrollBlockLinksB64: scrollB64,
      commentrayPathForSearch: spec.commentrayPathRel.trim(),
      commentrayOnGithubUrl: spec.commentrayOnGithubUrl,
      staticBrowseUrl: spec.staticBrowseUrl,
    },
    commentrayHtml,
    scrollB64,
  };
}

/**
 * When every angle has a valid block index and `tryBuildBlockStretchTableHtml` succeeds for each,
 * emit one outer scroll (table rows = aligned block “arithmetics”) instead of dual-pane sync.
 */
async function buildMultiAngleBlockStretchShell(
  opts: CodeBrowserPageOptions,
  multi: CodeBrowserMultiAngleBrowsing,
): Promise<CodeBrowserShell | null> {
  const defaultId = multi.angles.some((a) => a.id === multi.defaultAngleId)
    ? multi.defaultAngleId
    : (multi.angles[0]?.id ?? "main");
  const sourceMarkdownEnabled = isMarkdownLikeSource(opts);
  const sourceMarkdownUrls = sourceMarkdownEnabled ? sourcePaneOutputUrls(opts) : undefined;

  const perAngle: Array<{
    spec: CodeBrowserMultiAngleSpec;
    stretched: { preambleHtml: string; tableInnerHtml: string };
    jsonRow: MultiAngleJsonRow;
    commentrayHtml: string;
    scrollB64: string;
  }> = [];

  for (const spec of multi.angles) {
    if (!angleBlockStretchRowsPathOk(spec, opts)) return null;
    const rows = spec.blockStretchRows;
    if (rows === undefined) return null;
    const stretched = await tryBuildBlockStretchTableHtml({
      code: opts.code,
      language: opts.language,
      commentrayMarkdown: spec.markdown,
      index: rows.index,
      sourceRelative: rows.sourceRelative,
      commentrayPathRel: rows.commentrayPathRel,
      commentrayOutputUrls: opts.commentrayOutputUrls,
      sourceMarkdownOutputUrls: sourceMarkdownUrls,
      stretchBufferSync: stretchBufferSyncFromOpts(opts),
    });
    if (stretched === null) return null;
    const { jsonRow, commentrayHtml, scrollB64 } = await multiAngleJsonRowAndDocHtml(opts, spec);
    const stretchPairHtml = renderShellPairContextHtml(
      shellPairSourcePath(opts.filePath, rows.sourceRelative),
      jsonRow.commentrayPathForSearch,
    );
    const stretchSwapInner = wrapShellInnerWithPairContext(
      stretchPairHtml,
      `        ${stretched.preambleHtml}\n        ${stretched.tableInnerHtml}\n`,
    );
    perAngle.push({
      spec,
      stretched,
      jsonRow: {
        ...jsonRow,
        stretchSwapInnerB64: Buffer.from(stretchSwapInner, "utf8").toString("base64"),
      },
      commentrayHtml,
      scrollB64,
    });
  }

  const builtAngles = perAngle.map((p) => ({
    spec: p.spec,
    commentrayHtml: p.commentrayHtml,
    scrollB64: p.scrollB64,
  }));
  const { defaultMarkdown, defaultScrollB64, defaultPathSearch, defaultGh, defaultStaticBrowse } =
    resolveMultiAngleDefaultSelection({ multi, defaultId, opts, builtAngles });

  const defaultStretch = perAngle.find((p) => p.spec.id === defaultId) ?? perAngle[0];
  if (defaultStretch === undefined) return null;

  const shellInner = wrapShellInnerWithPairContext(
    renderShellPairContextHtml(
      shellPairSourcePath(opts.filePath, defaultStretch.spec.blockStretchRows?.sourceRelative),
      defaultPathSearch,
    ),
    `        ${defaultStretch.stretched.preambleHtml}\n` +
      `        ${defaultStretch.stretched.tableInnerHtml}\n`,
  );

  const payloadObj = {
    layoutMode: "stretch" as const,
    defaultAngleId: defaultId,
    angles: perAngle.map((p) => p.jsonRow),
  };
  const multiAnglePayloadB64 = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");

  return {
    layout: "stretch",
    shellInner,
    scrollBlockLinksB64: defaultScrollB64,
    angleSelectHtml: multiAngleToolbarAngleSelectHtml(multi, defaultId),
    multiAnglePayloadB64,
    sourceMarkdownToggleEnabled: sourceMarkdownEnabled,
    sourcePaneDefaultMode: "source",
    stretchBufferSync: stretchBufferSyncFromOpts(opts),
    multiShell: {
      rawMdB64: Buffer.from(defaultMarkdown, "utf8").toString("base64"),
      scrollBlockLinksB64: defaultScrollB64,
      commentrayPathForSearch: defaultPathSearch,
      commentrayOnGithubUrl: defaultGh,
      ...(defaultStaticBrowse.length > 0 ? { commentrayStaticBrowseUrl: defaultStaticBrowse } : {}),
    },
  };
}

async function buildMultiAngleDualPaneShell(
  opts: CodeBrowserPageOptions,
  multi: CodeBrowserMultiAngleBrowsing,
): Promise<{
  shellInner: string;
  multiShell: NonNullable<CodeBrowserShell["multiShell"]>;
  angleSelectHtml: string;
  multiAnglePayloadB64: string;
  sourceMarkdownToggleEnabled: boolean;
  sourcePaneDefaultMode: "source" | "rendered-markdown";
}> {
  const defaultId = multi.angles.some((a) => a.id === multi.defaultAngleId)
    ? multi.defaultAngleId
    : (multi.angles[0]?.id ?? "main");
  const jsonAngles: MultiAngleJsonRow[] = [];
  const builtAngles: Array<{
    spec: CodeBrowserMultiAngleSpec;
    commentrayHtml: string;
    scrollB64: string;
  }> = [];

  const sourceMarkdownEnabled = isMarkdownLikeSource(opts);
  const sourceMdForPane = sourceMarkdownEnabled ? injectSourceMarkdownAnchors(opts.code) : "";
  const sourcePaneUrls = sourcePaneOutputUrls(opts);
  const [codeHtml, sourceMarkdownPaneHtml] = await Promise.all([
    renderHighlightedCodeLineRows(opts.code, opts.language),
    sourceMarkdownEnabled
      ? renderMarkdownToHtml(sourceMdForPane, {
          commentrayOutputUrls: sourcePaneUrls,
        })
      : Promise.resolve(""),
  ]);

  for (const spec of multi.angles) {
    const { jsonRow, commentrayHtml, scrollB64 } = await multiAngleJsonRowAndDocHtml(opts, spec);
    builtAngles.push({ spec, commentrayHtml, scrollB64 });
    jsonAngles.push(jsonRow);
  }
  const {
    defaultMarkdown,
    defaultScrollB64,
    defaultPathSearch,
    defaultGh,
    defaultStaticBrowse,
    defaultPaneHtml,
  } = resolveMultiAngleDefaultSelection({ multi, defaultId, opts, builtAngles });

  const angleSelectHtml = multiAngleToolbarAngleSelectHtml(multi, defaultId);

  const pairHtml = renderShellPairContextHtml(
    shellPairSourcePath(opts.filePath, opts.blockStretchRows?.sourceRelative),
    defaultPathSearch,
  );
  const shellInner = wrapDualShellInner(
    pairHtml,
    dualPanePanesInnerHtml(codeHtml, defaultPaneHtml, sourceMarkdownPaneHtml),
  );

  const payloadObj = { defaultAngleId: defaultId, angles: jsonAngles };
  const multiAnglePayloadB64 = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");

  return {
    shellInner,
    multiShell: {
      rawMdB64: Buffer.from(defaultMarkdown, "utf8").toString("base64"),
      scrollBlockLinksB64: defaultScrollB64,
      commentrayPathForSearch: defaultPathSearch,
      commentrayOnGithubUrl: defaultGh,
      ...(defaultStaticBrowse.length > 0 ? { commentrayStaticBrowseUrl: defaultStaticBrowse } : {}),
    },
    angleSelectHtml,
    multiAnglePayloadB64,
    sourceMarkdownToggleEnabled: sourceMarkdownEnabled,
    sourcePaneDefaultMode: sourceMarkdownEnabled ? "rendered-markdown" : "source",
  };
}

async function buildDualPaneSingleAngleShell(
  opts: CodeBrowserPageOptions,
): Promise<CodeBrowserShell> {
  const rows = opts.blockStretchRows;
  const links: BlockScrollLink[] =
    rows !== undefined
      ? buildBlockScrollLinks(
          rows.index,
          rows.sourceRelative,
          rows.commentrayPathRel,
          opts.commentrayMarkdown,
          opts.code,
        )
      : [];
  const mdForDoc = injectCommentrayDocAnchors(
    opts.commentrayMarkdown,
    links.length > 0 ? links : undefined,
  );
  let scrollBlockLinksB64 = "";
  if (links.length > 0) {
    scrollBlockLinksB64 = Buffer.from(JSON.stringify(links), "utf8").toString("base64");
  }
  const sourceMarkdownEnabled = isMarkdownLikeSource(opts);
  const sourceMdForPane = sourceMarkdownEnabled ? injectSourceMarkdownAnchors(opts.code) : "";
  const sourcePaneUrls = sourcePaneOutputUrls(opts);
  const [codeHtml, commentrayHtml, sourceMarkdownPaneHtml] = await Promise.all([
    renderHighlightedCodeLineRows(opts.code, opts.language),
    renderMarkdownToHtml(mdForDoc, {
      commentrayOutputUrls: opts.commentrayOutputUrls,
    }),
    sourceMarkdownEnabled
      ? renderMarkdownToHtml(sourceMdForPane, {
          commentrayOutputUrls: sourcePaneUrls,
        })
      : Promise.resolve(""),
  ]);
  const pairHtml = renderShellPairContextHtml(
    shellPairSourcePath(opts.filePath, opts.blockStretchRows?.sourceRelative),
    shellPairCommentrayPath(opts.commentrayPathForSearch, opts.blockStretchRows?.commentrayPathRel),
  );
  const shellInner = wrapDualShellInner(
    pairHtml,
    dualPanePanesInnerHtml(codeHtml, commentrayHtml, sourceMarkdownPaneHtml),
  );
  return {
    layout: "dual",
    shellInner,
    scrollBlockLinksB64,
    angleSelectHtml: "",
    multiAnglePayloadB64: "",
    sourceMarkdownToggleEnabled: sourceMarkdownEnabled,
    sourcePaneDefaultMode: "source",
  };
}

async function buildSingleAngleCodeBrowserShell(
  opts: CodeBrowserPageOptions,
  layoutPref: "auto" | "dual",
): Promise<CodeBrowserShell> {
  let layout: "dual" | "stretch" = "dual";
  let shellInner = "";
  const sourceMarkdownEnabled = isMarkdownLikeSource(opts);
  const sourceMarkdownUrls = sourceMarkdownEnabled ? sourcePaneOutputUrls(opts) : undefined;

  if (layoutPref !== "dual") {
    const fallbackSourceRelative =
      (opts.filePath ?? "").trim().length > 0 ? (opts.filePath ?? "").trim() : "source";
    const fallbackCommentrayPathRel =
      (opts.commentrayPathForSearch ?? "").trim().length > 0
        ? (opts.commentrayPathForSearch ?? "").trim()
        : "commentray.md";
    const fallbackSourceLineCount = Math.max(1, opts.code.split("\n").length);
    const fallbackBlockId = "commentray-full";
    const fallbackStretchMarkdown =
      opts.blockStretchRows === undefined
        ? `<!-- commentray:block id=${fallbackBlockId} -->\n${opts.commentrayMarkdown}`
        : opts.commentrayMarkdown;
    const stretchRows =
      opts.blockStretchRows ??
      ({
        index: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          byCommentrayPath: {
            [fallbackCommentrayPathRel]: {
              sourcePath: fallbackSourceRelative,
              commentrayPath: fallbackCommentrayPathRel,
              blocks: [
                { id: fallbackBlockId, anchor: `lines:1-${String(fallbackSourceLineCount)}` },
              ],
            },
          },
        } satisfies CommentrayIndex,
        sourceRelative: fallbackSourceRelative,
        commentrayPathRel: fallbackCommentrayPathRel,
      } as const);
    const stretched = await tryBuildBlockStretchTableHtml({
      code: opts.code,
      language: opts.language,
      commentrayMarkdown: fallbackStretchMarkdown,
      index: stretchRows.index,
      sourceRelative: stretchRows.sourceRelative,
      commentrayPathRel: stretchRows.commentrayPathRel,
      commentrayOutputUrls: opts.commentrayOutputUrls,
      sourceMarkdownOutputUrls: sourceMarkdownUrls,
      stretchBufferSync: stretchBufferSyncFromOpts(opts),
    });
    if (stretched) {
      layout = "stretch";
      shellInner = wrapShellInnerWithPairContext(
        renderShellPairContextHtml(
          shellPairSourcePath(opts.filePath, stretchRows.sourceRelative),
          shellPairCommentrayPath(opts.commentrayPathForSearch, stretchRows.commentrayPathRel),
        ),
        `        ${stretched.preambleHtml}\n` + `        ${stretched.tableInnerHtml}\n`,
      );
    }
  }

  if (layout === "dual") {
    return buildDualPaneSingleAngleShell(opts);
  }

  const rows = opts.blockStretchRows;
  const links: BlockScrollLink[] =
    rows !== undefined
      ? buildBlockScrollLinks(
          rows.index,
          rows.sourceRelative,
          rows.commentrayPathRel,
          opts.commentrayMarkdown,
          opts.code,
        )
      : [];
  let scrollBlockLinksB64 = "";
  if (links.length > 0) {
    scrollBlockLinksB64 = Buffer.from(JSON.stringify(links), "utf8").toString("base64");
  }

  return {
    layout,
    shellInner,
    scrollBlockLinksB64,
    angleSelectHtml: "",
    multiAnglePayloadB64: "",
    sourceMarkdownToggleEnabled: sourceMarkdownEnabled,
    sourcePaneDefaultMode: "source",
    stretchBufferSync: stretchBufferSyncFromOpts(opts),
  };
}

async function buildCodeBrowserShell(
  opts: CodeBrowserPageOptions,
  layoutPref: "auto" | "dual",
): Promise<CodeBrowserShell> {
  const multi = opts.multiAngleBrowsing;
  const multiActive = Boolean(multi && multi.angles.length >= 2);

  if (multiActive && multi) {
    if (layoutPref !== "dual") {
      const stretchMulti = await buildMultiAngleBlockStretchShell(opts, multi);
      if (stretchMulti !== null) return stretchMulti;
    }
    const built = await buildMultiAngleDualPaneShell(opts, multi);
    const ms = built.multiShell;
    return {
      layout: "dual",
      shellInner: built.shellInner,
      scrollBlockLinksB64: ms.scrollBlockLinksB64,
      angleSelectHtml: built.angleSelectHtml,
      multiAnglePayloadB64: built.multiAnglePayloadB64,
      sourceMarkdownToggleEnabled: built.sourceMarkdownToggleEnabled,
      sourcePaneDefaultMode: built.sourcePaneDefaultMode,
      multiShell: ms,
    };
  }

  return buildSingleAngleCodeBrowserShell(opts, layoutPref);
}

function searchChromeFromOptions(
  opts: CodeBrowserPageOptions,
  commentrayPathOverride?: string,
): {
  searchPlaceholder: string;
  shellSearchAttrs: string;
} {
  const crPath = (commentrayPathOverride ?? opts.commentrayPathForSearch ?? "").trim();
  if (opts.staticSearchScope === "commentray-and-paths") {
    return {
      searchPlaceholder: "Filename, path, or keywords…",
      shellSearchAttrs: ` data-search-scope="commentray-and-paths" data-search-file-path="${escapeHtml(
        opts.filePath ?? "",
      )}" data-search-commentray-path="${escapeHtml(crPath)}"`,
    };
  }
  return {
    searchPlaceholder: "Filename, path, or keywords…",
    shellSearchAttrs: "",
  };
}

function shellDocumentedPairsAttrFromOptions(opts: CodeBrowserPageOptions): string {
  const emb = opts.documentedPairsEmbeddedB64?.trim() ?? "";
  if (emb.length === 0) return "";
  return ` data-documented-pairs-b64="${escapeHtml(emb)}"`;
}

function codeBrowserPageTitle(opts: CodeBrowserPageOptions): string {
  return opts.title ?? opts.filePath ?? "Commentray";
}

function toolbarCommentrayGithubFromShell(
  shell: CodeBrowserShell,
  opts: CodeBrowserPageOptions,
): string | undefined {
  return shell.multiShell?.commentrayOnGithubUrl ?? opts.commentrayOnGithubUrl;
}

function rawMdB64FromShell(shell: CodeBrowserShell, opts: CodeBrowserPageOptions): string {
  return (
    shell.multiShell?.rawMdB64 ?? Buffer.from(opts.commentrayMarkdown, "utf8").toString("base64")
  );
}

function currentPairCommentrayPathRel(
  shell: CodeBrowserShell,
  opts: CodeBrowserPageOptions,
): string {
  return (
    shell.multiShell?.commentrayPathForSearch ??
    opts.commentrayPathForSearch ??
    opts.blockStretchRows?.commentrayPathRel ??
    ""
  ).trim();
}

/** Repo-relative source + companion Markdown paths for matching the current page to nav pairs
 * (see `code-browser-client.ts` documented-files tree).
 */
function shellPairIdentityDataAttrs(shell: CodeBrowserShell, opts: CodeBrowserPageOptions): string {
  const src = normPosixPath(opts.filePath ?? "");
  const cr = normPosixPath(currentPairCommentrayPathRel(shell, opts));
  if (src.length === 0 || cr.length === 0) return "";
  return ` data-commentray-pair-source-path="${escapeHtml(src)}" data-commentray-pair-commentray-path="${escapeHtml(cr)}"`;
}

/** Canonical doc target for static validation: same-site `./browse/…` when present, else GitHub blob. */
function shellPairDocDataAttr(shell: CodeBrowserShell, opts: CodeBrowserPageOptions): string {
  const browseRaw = (
    shell.multiShell?.commentrayStaticBrowseUrl ??
    opts.commentrayStaticBrowseUrl ??
    ""
  ).trim();
  if (browseRaw.length > 0) {
    const href = safeToolbarNavigationHref(browseRaw);
    if (href !== null) {
      return ` data-commentray-pair-browse-href="${escapeHtml(href)}"`;
    }
  }
  const gh = safeExternalHttpUrl(toolbarCommentrayGithubFromShell(shell, opts));
  if (gh !== null) {
    return ` data-commentray-pair-browse-href="${escapeHtml(gh)}"`;
  }
  return "";
}

function shellSearchAttrsWithNavJson(
  shellSearchAttrsBase: string,
  documentedNavJsonUrl?: string,
): string {
  const navJson = documentedNavJsonUrl?.trim() ?? "";
  if (navJson.length === 0) return shellSearchAttrsBase;
  return `${shellSearchAttrsBase} data-nav-search-json-url="${escapeHtml(navJson)}"`;
}

/**
 * Static HTML shell for a minimal “code browser”: code + rendered commentray,
 * draggable vertical splitter, togglable line wrap for the code pane, and
 * token-in-line quick search (all non-whitespace tokens must appear on the same line).
 */
export async function renderCodeBrowserHtml(opts: CodeBrowserPageOptions): Promise<string> {
  const rawCodeB64 = Buffer.from(opts.code, "utf8").toString("base64");

  const title = codeBrowserPageTitle(opts);
  const metaDescriptionHtml = renderMetaDescriptionHtml(opts, title);
  const builtAt = opts.builtAt ?? new Date();
  const renderSemver = commentrayRenderVersion();
  const toolbarSiteHubHtml = buildToolbarSiteHubHtml(opts.siteHubUrl);
  const toolbarEndHtml = buildToolbarEndHtml(opts.githubRepoUrl, opts.siteHubUrl);
  const pageFooterHtml = renderPageFooterHtml({
    builtAt,
    toolHomeUrl: opts.toolHomeUrl,
    commentrayRenderSemver: renderSemver,
    pagesBuildCommitSha: normalizePagesBuildCommitSha(opts.pagesBuildCommitSha),
  });
  const { hljsLight, hljsDark } = hljsStylesheetThemes(opts.hljsTheme);
  const hljsLightCss = hljsThemeCss(hljsLight);
  const hljsDarkCss = hljsThemeCss(hljsDark);

  const mermaidScript = mermaidRuntimeScriptHtml(
    opts.includeMermaidRuntime,
    opts.mermaidRuntimePath,
  );

  const relatedNavHtml = renderRelatedGithubNavHtml(opts.relatedGithubNav ?? []);
  const generatorMetaHtml = renderGeneratorMetaHtml(opts.generatorLabel);

  const layoutPref = opts.codeBrowserLayout ?? "auto";
  const shell = await buildCodeBrowserShell(opts, layoutPref);

  const { toolbarDocHubHtml, navRailDocumentedHtml } = renderToolbarDocHubHtml({
    documentedNavJsonUrl: opts.documentedNavJsonUrl,
    documentedPairsEmbeddedB64: opts.documentedPairsEmbeddedB64,
  });

  const rawMdB64 = rawMdB64FromShell(shell, opts);
  const scrollBlockLinksB64 = shell.scrollBlockLinksB64;

  const { searchPlaceholder, shellSearchAttrs: shellSearchAttrsBase } = searchChromeFromOptions(
    opts,
    shell.multiShell?.commentrayPathForSearch,
  );
  const shellDocumentedPairsAttr = shellDocumentedPairsAttrFromOptions(opts);
  const shellSearchAttrs = shellSearchAttrsWithNavJson(
    shellSearchAttrsBase,
    opts.documentedNavJsonUrl,
  );
  const pairDocDataAttr = shellPairDocDataAttr(shell, opts);
  const pairIdentityDataAttrs = shellPairIdentityDataAttrs(shell, opts);
  const sourceMarkdownToggles = sourceMarkdownToggleControlsHtml(shell.sourceMarkdownToggleEnabled);
  const sourcePaneModeAttr = ` data-source-pane-mode="${shell.sourcePaneDefaultMode}"`;
  const scrollSyncStrategyShellAttr =
    opts.dualPaneScrollSyncStrategy !== undefined &&
    opts.dualPaneScrollSyncStrategy !== DEFAULT_DUAL_PANE_SCROLL_SYNC_STRATEGY
      ? ` data-scroll-sync-strategy="${escapeHtml(opts.dualPaneScrollSyncStrategy)}"`
      : "";
  const stretchBufferSyncShellAttr =
    shell.layout === "stretch" && shell.stretchBufferSync === "flow-synchronizer"
      ? ` data-stretch-buffer-sync="flow-synchronizer"`
      : "";

  return buildCodeBrowserPageHtml({
    title,
    metaDescriptionHtml,
    generatorMetaHtml,
    toolbarSiteHubHtml,
    shellPairIdentityDataAttrs: pairIdentityDataAttrs,
    shellPairDocDataAttr: pairDocDataAttr,
    angleSelectHtml: shell.angleSelectHtml,
    toolbarDocHubHtml,
    navRailDocumentedHtml,
    relatedNavHtml,
    toolbarEndHtml,
    pageFooterHtml,
    layout: shell.layout,
    shellInner: shell.shellInner,
    rawCodeB64,
    rawMdB64,
    scrollBlockLinksB64,
    shellDocumentedPairsAttr,
    hljsLightCss,
    hljsDarkCss,
    mermaidScript,
    searchPlaceholder,
    shellSearchAttrs,
    multiAngleScriptBlock: shell.multiAnglePayloadB64,
    sourceMarkdownToggleHtml: sourceMarkdownToggles.sourceMarkdownToggleHtml,
    sourceMarkdownFlipScrollAffordanceHtml:
      sourceMarkdownToggles.sourceMarkdownFlipScrollAffordanceHtml,
    sourcePaneModeAttr,
    scrollSyncStrategyShellAttr,
    stretchBufferSyncShellAttr,
  });
}

export type { DualPaneScrollSyncStrategyId } from "./code-browser-scroll-sync-strategy.js";
export type { StretchBufferSyncStrategy } from "./block-stretch-layout.js";

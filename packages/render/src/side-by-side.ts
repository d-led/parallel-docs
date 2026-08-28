import { escapeHtml } from "./html-utils.js";
import { SIDETRACK_FAVICON_LINK_HTML } from "./inline-favicon.js";
import { hljsThemeCss } from "./hljs-theme-css.js";
import { hljsStylesheetThemes } from "./hljs-stylesheet-themes.js";
import { SIDE_BY_SIDE_LAYOUT_CSS } from "./side-by-side-layout-css.js";
import {
  type SideTrackOutputUrlOptions,
  renderFencedCode,
  renderMarkdownToHtml,
} from "./markdown-pipeline.js";
import { mermaidRuntimeScriptHtml } from "./mermaid-runtime-html.js";

export type SideBySideOptions = {
  title?: string;
  /** Source code text (not yet fenced). */
  code: string;
  /** Highlight.js / common language id, e.g. ts, go, json */
  language: string;
  /** SideTrack markdown body. */
  sidetrackMarkdown: string;
  /** Highlight.js theme base name (e.g. `github`, `github-dark`); matches static code browser. */
  hljsTheme?: string;
  /** When true, include the Mermaid runtime (vendored or `mermaidRuntimePath`) in the footer. */
  includeMermaidRuntime?: boolean;
  /** Absolute path to a local Mermaid UMD build, used instead of the vendored one. */
  mermaidRuntimePath?: string;
  /** Optional static URL rewriting for the sidetrack pane (images, local links, GitHub blob). */
  sidetrackOutputUrls?: SideTrackOutputUrlOptions;
};

export async function renderSideBySideHtml(opts: SideBySideOptions): Promise<string> {
  const fence = "```" + opts.language + "\n" + opts.code + "\n```\n";
  const [codeHtml, sidetrackHtml] = await Promise.all([
    renderFencedCode(fence),
    renderMarkdownToHtml(opts.sidetrackMarkdown, {
      sidetrackOutputUrls: opts.sidetrackOutputUrls,
    }),
  ]);

  const mermaidScript = mermaidRuntimeScriptHtml(
    opts.includeMermaidRuntime,
    opts.mermaidRuntimePath,
  );

  const title = opts.title ?? "SideTrack";
  const { hljsLight, hljsDark } = hljsStylesheetThemes(opts.hljsTheme);
  const hljsLightCss = hljsThemeCss(hljsLight);
  const hljsDarkCss = hljsThemeCss(hljsDark);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${SIDETRACK_FAVICON_LINK_HTML}
    <title>${escapeHtml(title)}</title>
    <style media="(prefers-color-scheme: light)">${hljsLightCss}</style>
    <style media="(prefers-color-scheme: dark)">${hljsDarkCss}</style>
    <style>
${SIDE_BY_SIDE_LAYOUT_CSS}
    </style>
  </head>
  <body>
    <div class="layout">
      <section class="pane" aria-label="Source">
        <h2>Code</h2>
        ${codeHtml}
      </section>
      <section class="pane sidetrack" aria-label="SideTrack">
        <h2>SideTrack</h2>
        ${sidetrackHtml}
      </section>
    </div>
    ${mermaidScript}
  </body>
</html>`;
}

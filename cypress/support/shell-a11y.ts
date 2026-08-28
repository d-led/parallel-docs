/**
 * Selectors and copy hooks for the static code-browser shell used by accessibility E2E.
 *
 * **When the shell markup or static site config changes**, update this module (and the
 * custom commands under `cypress/support/custom-commands/`) rather than hunting through individual specs.
 *
 * Prefer roles and accessible names over class names; a few IDs stay because they are
 * stable in `packages/render/src/code-browser.ts` and easier to scope than long chains.
 */

/** Substring or pattern for `document.title` — keep aligned with `.sidetrack.toml` `[static_site].title`. */
export const STATIC_SITE_TITLE_PATTERN = /SideTrack/i;

/** Expected primary language of the generated HTML shell. */
export const DOCUMENT_LANG = "en";

/**
 * Copy Mermaid surfaces on parse failure — keep aligned with `packages/render/src/markdown-pipeline.ts`
 * and guarded E2E assertions.
 */
export const MERMAID_SYNTAX_ERROR_SNIPPET = "Syntax error in text";

export const shellA11y = {
  main: "main#main-content",
  skipToMainLink: 'a[href="#main-content"]',
  /** Banner landmark wrapping toolbar chrome (not the search row below it). */
  banner: "header[role=banner]",
  /** One document title for assistive tech; lives in the banner in the current shell. */
  documentTitleHeading: "header[role=banner] h1",
  contentinfo: "[role=contentinfo]",
  search: {
    region: '[role="region"][aria-label="Search"]',
    /** Prefer scoping by region over bare `#search-q` so IDs can move inside the region. */
    input: '[role="region"][aria-label="Search"] input[type="search"]',
    /** Matches `for` on the search `<input>` id in `code-browser.ts`. */
    label: 'label[for="search-q"]',
    clearButton: "#search-clear",
    results: "#search-results",
    /** In-page search hit rows (`code-browser-client.ts` `button.hit`). */
    hitButton: "#search-results button.hit",
  },
  /** Side-tracked files hub (`code-browser.ts` nav rail). */
  documentedFiles: {
    hub: "#documented-files-hub",
    filter: "#documented-files-filter",
    /** Tree mount: `#documented-files-tree` carries `role="tree"`. */
    tree: "#documented-files-tree",
    fileLink: "#documented-files-tree a.tree-file-link",
  },
  panes: {
    source: '[aria-label="Source code"]',
    sidetrack: '[aria-label="SideTrack"]',
  },
  resizeSplitter: '[role="separator"][aria-label="Resize panes"]',
  wrapLinesCheckbox: "#wrap-lines",
  /** Label wraps the checkbox in the toolbar. */
  wrapLinesLabel: "label:has(#wrap-lines)",
  /** System / light / dark: compact trigger + popover (static code browser client bundle). */
  colorThemeTrigger: "#sidetrack-theme-trigger",
  colorThemeMenu: "#sidetrack-theme-menu",
  angleSelect: '[aria-label="SideTrack angle"]',
  /** Plain-text Src/Doc path strip above the dual panes (inside `#shell`). */
  documentationPairLandmark: '[aria-label="Current documentation pair"]',
  /** Static code-browser root (`code-browser.ts` `#shell`). */
  shell: "#shell",
  /** Mobile single-pane flip control (`code-browser.ts` `#mobile-pane-flip`). */
  mobilePaneFlip: "#mobile-pane-flip",
  /** Fixed duplicate flip when the toolbar flip is off-screen (narrow dual layout). */
  mobilePaneFlipScroll: "#mobile-pane-flip-scroll",
  /** SideTrack markdown scroll body (`code-browser.ts` `#doc-pane-body`). */
  docPaneBody: "#doc-pane-body",
  /** Wrapper class for fenced Mermaid blocks from the render pipeline. */
  sidetrackMermaid: ".sidetrack-mermaid",
} as const;

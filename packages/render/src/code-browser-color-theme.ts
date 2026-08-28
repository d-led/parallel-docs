/** Persisted in {@link readWebStorageItem} / {@link writeWebStorageItem} for the static code browser. */
export const PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY =
  "parallel-docs.codeParallelDocsStatic.colorTheme";

export type ParallelDocsColorThemeMode = "system" | "light" | "dark";

/** Order used when cycling the theme via secondary click (e.g. context menu). */
export const PARALLEL_DOCS_COLOR_THEME_CYCLE: readonly ParallelDocsColorThemeMode[] = [
  "system",
  "light",
  "dark",
];

export function nextParallelDocsColorThemeMode(
  mode: ParallelDocsColorThemeMode,
): ParallelDocsColorThemeMode {
  const i = PARALLEL_DOCS_COLOR_THEME_CYCLE.indexOf(mode);
  const next = (i >= 0 ? i + 1 : 0) % PARALLEL_DOCS_COLOR_THEME_CYCLE.length;
  return PARALLEL_DOCS_COLOR_THEME_CYCLE[next] ?? "system";
}

export function parseParallelDocsColorThemeMode(
  stored: string | null | undefined,
): ParallelDocsColorThemeMode {
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function syncHighlightJsStylesheets(mode: ParallelDocsColorThemeMode): void {
  const doc = globalThis.document;
  if (!doc) return;
  const light = doc.getElementById("parallel-docs-hljs-light");
  const darkEl = doc.getElementById("parallel-docs-hljs-dark");
  if (!(light instanceof HTMLStyleElement) || !(darkEl instanceof HTMLStyleElement)) return;

  if (mode === "light") {
    light.disabled = false;
    light.removeAttribute("media");
    darkEl.disabled = true;
    darkEl.setAttribute("media", "(prefers-color-scheme: dark)");
    return;
  }
  if (mode === "dark") {
    darkEl.disabled = false;
    darkEl.removeAttribute("media");
    light.disabled = true;
    light.setAttribute("media", "(prefers-color-scheme: light)");
    return;
  }
  light.disabled = false;
  darkEl.disabled = false;
  light.media = "(prefers-color-scheme: light)";
  darkEl.media = "(prefers-color-scheme: dark)";
}

export function applyParallelDocsColorTheme(mode: ParallelDocsColorThemeMode): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.parallelDocsTheme = mode;
  syncHighlightJsStylesheets(mode);
}

/**
 * Synchronous boot snippet for `<head>` (after the two Highlight.js `<link>` nodes). Applies
 * stored theme before first paint. Must stay aligned with {@link applyParallelDocsColorTheme}.
 */
export function parallelDocsColorThemeHeadBoot(): string {
  const key = PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY;
  return (
    "(function(){" +
    `var k=${JSON.stringify(key)};` +
    "var m='system';" +
    "try{var v=localStorage.getItem(k);if(v==='light'||v==='dark'||v==='system')m=v;}catch(e){}" +
    "document.documentElement.dataset.parallelDocsTheme=m;" +
    "var L=document.getElementById('parallel-docs-hljs-light');" +
    "var D=document.getElementById('parallel-docs-hljs-dark');" +
    "if(!L||!D||!(L instanceof HTMLStyleElement)||!(D instanceof HTMLStyleElement))return;" +
    "if(m==='light'){L.disabled=false;L.removeAttribute('media');D.disabled=true;D.setAttribute('media','(prefers-color-scheme: dark)');return;}" +
    "if(m==='dark'){D.disabled=false;D.removeAttribute('media');L.disabled=true;L.setAttribute('media','(prefers-color-scheme: light)');return;}" +
    "L.disabled=false;D.disabled=false;" +
    "L.media='(prefers-color-scheme: light)';D.media='(prefers-color-scheme: dark)';" +
    "})();"
  );
}

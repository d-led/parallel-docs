/** Persisted in {@link readWebStorageItem} / {@link writeWebStorageItem} for the static code browser. */
export const COMMENTRAY_COLOR_THEME_STORAGE_KEY = "commentray.codeCommentrayStatic.colorTheme";

export type CommentrayColorThemeMode = "system" | "light" | "dark";

/** Order used when cycling the theme via secondary click (e.g. context menu). */
export const COMMENTRAY_COLOR_THEME_CYCLE: readonly CommentrayColorThemeMode[] = [
  "system",
  "light",
  "dark",
];

export function nextCommentrayColorThemeMode(
  mode: CommentrayColorThemeMode,
): CommentrayColorThemeMode {
  const i = COMMENTRAY_COLOR_THEME_CYCLE.indexOf(mode);
  const next = (i >= 0 ? i + 1 : 0) % COMMENTRAY_COLOR_THEME_CYCLE.length;
  return COMMENTRAY_COLOR_THEME_CYCLE[next] ?? "system";
}

export function parseCommentrayColorThemeMode(
  stored: string | null | undefined,
): CommentrayColorThemeMode {
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function syncHighlightJsStylesheets(mode: CommentrayColorThemeMode): void {
  const doc = globalThis.document;
  if (!doc) return;
  const light = doc.getElementById("commentray-hljs-light");
  const darkEl = doc.getElementById("commentray-hljs-dark");
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

export function applyCommentrayColorTheme(mode: CommentrayColorThemeMode): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.commentrayTheme = mode;
  syncHighlightJsStylesheets(mode);
}

/**
 * Synchronous boot snippet for `<head>` (after the two Highlight.js `<link>` nodes). Applies
 * stored theme before first paint. Must stay aligned with {@link applyCommentrayColorTheme}.
 */
export function commentrayColorThemeHeadBoot(): string {
  const key = COMMENTRAY_COLOR_THEME_STORAGE_KEY;
  return (
    "(function(){" +
    `var k=${JSON.stringify(key)};` +
    "var m='system';" +
    "try{var v=localStorage.getItem(k);if(v==='light'||v==='dark'||v==='system')m=v;}catch(e){}" +
    "document.documentElement.dataset.commentrayTheme=m;" +
    "var L=document.getElementById('commentray-hljs-light');" +
    "var D=document.getElementById('commentray-hljs-dark');" +
    "if(!L||!D||!(L instanceof HTMLStyleElement)||!(D instanceof HTMLStyleElement))return;" +
    "if(m==='light'){L.disabled=false;L.removeAttribute('media');D.disabled=true;D.setAttribute('media','(prefers-color-scheme: dark)');return;}" +
    "if(m==='dark'){D.disabled=false;D.removeAttribute('media');L.disabled=true;L.setAttribute('media','(prefers-color-scheme: light)');return;}" +
    "L.disabled=false;D.disabled=false;" +
    "L.media='(prefers-color-scheme: light)';D.media='(prefers-color-scheme: dark)';" +
    "})();"
  );
}

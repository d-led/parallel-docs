/** Persisted in {@link readWebStorageItem} / {@link writeWebStorageItem} for the static code browser. */
export const SIDETRACK_COLOR_THEME_STORAGE_KEY = "sidetrack.codeSideTrackStatic.colorTheme";

export type SideTrackColorThemeMode = "system" | "light" | "dark";

/** Order used when cycling the theme via secondary click (e.g. context menu). */
export const SIDETRACK_COLOR_THEME_CYCLE: readonly SideTrackColorThemeMode[] = [
  "system",
  "light",
  "dark",
];

export function nextSideTrackColorThemeMode(
  mode: SideTrackColorThemeMode,
): SideTrackColorThemeMode {
  const i = SIDETRACK_COLOR_THEME_CYCLE.indexOf(mode);
  const next = (i >= 0 ? i + 1 : 0) % SIDETRACK_COLOR_THEME_CYCLE.length;
  return SIDETRACK_COLOR_THEME_CYCLE[next] ?? "system";
}

export function parseSideTrackColorThemeMode(
  stored: string | null | undefined,
): SideTrackColorThemeMode {
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function syncHighlightJsStylesheets(mode: SideTrackColorThemeMode): void {
  const doc = globalThis.document;
  if (!doc) return;
  const light = doc.getElementById("sidetrack-hljs-light");
  const darkEl = doc.getElementById("sidetrack-hljs-dark");
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

export function applySideTrackColorTheme(mode: SideTrackColorThemeMode): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.sidetrackTheme = mode;
  syncHighlightJsStylesheets(mode);
}

/**
 * Synchronous boot snippet for `<head>` (after the two Highlight.js `<link>` nodes). Applies
 * stored theme before first paint. Must stay aligned with {@link applySideTrackColorTheme}.
 */
export function sidetrackColorThemeHeadBoot(): string {
  const key = SIDETRACK_COLOR_THEME_STORAGE_KEY;
  return (
    "(function(){" +
    `var k=${JSON.stringify(key)};` +
    "var m='system';" +
    "try{var v=localStorage.getItem(k);if(v==='light'||v==='dark'||v==='system')m=v;}catch(e){}" +
    "document.documentElement.dataset.sidetrackTheme=m;" +
    "var L=document.getElementById('sidetrack-hljs-light');" +
    "var D=document.getElementById('sidetrack-hljs-dark');" +
    "if(!L||!D||!(L instanceof HTMLStyleElement)||!(D instanceof HTMLStyleElement))return;" +
    "if(m==='light'){L.disabled=false;L.removeAttribute('media');D.disabled=true;D.setAttribute('media','(prefers-color-scheme: dark)');return;}" +
    "if(m==='dark'){D.disabled=false;D.removeAttribute('media');L.disabled=true;L.setAttribute('media','(prefers-color-scheme: light)');return;}" +
    "L.disabled=false;D.disabled=false;" +
    "L.media='(prefers-color-scheme: light)';D.media='(prefers-color-scheme: dark)';" +
    "})();"
  );
}

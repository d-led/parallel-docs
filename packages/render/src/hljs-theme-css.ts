import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves Highlight.js theme CSS as inline text so generated pages never load
 * styles from a CDN.
 *
 * Themes are vendored under `src/hljs-themes/` and copied to `dist/hljs-themes/`
 * at build time (see `copy-static-assets.mjs`). Only vendored themes are
 * available; unknown names fall back to the default `github` theme.
 */

const DEFAULT_THEME = "github";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));

const THEME_DIRS = [
  // Compiled module lives in dist/: look next to it.
  join(MODULE_DIR, "hljs-themes"),
  // Running from src/ (tests, tsx): look in the sibling build output.
  join(MODULE_DIR, "..", "dist", "hljs-themes"),
  // Running from dist/ in a source checkout: fall back to the source tree.
  join(MODULE_DIR, "..", "src", "hljs-themes"),
];

function readThemeCss(name: string): string | undefined {
  for (const dir of THEME_DIRS) {
    const file = join(dir, `${name}.min.css`);
    if (existsSync(file)) {
      return readFileSync(file, "utf8");
    }
  }
  return undefined;
}

export function hljsThemeCss(themeBaseName: string | undefined): string {
  const requested = themeBaseName?.trim();
  const css = (requested ? readThemeCss(requested) : undefined) ?? readThemeCss(DEFAULT_THEME);
  if (css === undefined) {
    throw new Error(
      "Missing vendored Highlight.js theme CSS; run `npm run build -w @sidetrack/render`.",
    );
  }
  return css;
}

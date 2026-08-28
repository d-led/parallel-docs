import * as path from "node:path";

export type PreviewHrefRoute = "ignore" | "external" | "workspace";

export function isInsideDirectory(fileAbs: string, rootAbs: string): boolean {
  const rel = path.relative(path.resolve(rootAbs), path.resolve(fileAbs));
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * Routing policy for links clicked inside the rendered companion preview.
 * - `ignore`: empty or hash-only links
 * - `external`: any absolute URL (`scheme:...`)
 * - `workspace`: repo-relative/relative paths to open in-editor
 */
export function routePreviewHref(href: string): PreviewHrefRoute {
  const t = href.trim();
  if (!t || t.startsWith("#")) return "ignore";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return "external";
  return "workspace";
}

/** `L10` / `L10,5` fragment -> 0-based line/column (VS Code-style jump targets). */
export function parseLineColumnFragment(frag: string): { line: number; char: number } | undefined {
  const lm = /^L(\d+)(?:,(\d+))?$/.exec(frag);
  if (!lm) return undefined;
  return {
    line: Math.max(0, Number.parseInt(lm[1], 10) - 1),
    char: lm[2] !== undefined ? Math.max(0, Number.parseInt(lm[2], 10) - 1) : 0,
  };
}

export function resolveWorkspaceHrefToAbsolutePath(
  href: string,
  htmlDirAbs: string,
  repoRoot: string,
): string | null {
  const htmlDir = path.resolve(htmlDirAbs);
  const root = path.resolve(repoRoot);
  const pathPart = href.split("#")[0] ?? href;
  try {
    const dec = decodeURIComponent(pathPart);
    const resolved = dec.startsWith("/")
      ? path.normalize(path.join(root, dec.replace(/^\/+/, "")))
      : path.normalize(path.resolve(htmlDir, dec));
    if (!isInsideDirectory(resolved, root)) return null;
    return resolved;
  } catch {
    return null;
  }
}

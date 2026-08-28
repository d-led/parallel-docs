/**
 * Static hub: resolve per-pair browse URLs and match search hits to documented pairs.
 * (Keeps path logic testable without a browser.)
 */

export type DocumentedPairNavLike = {
  sourcePath: string;
  parallelDocsPath: string;
  staticBrowseUrl?: string;
  parallelDocsOnGithub?: string;
};

export function normPosixPath(s: string): string {
  return s.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Path prefix for the site “root” (where the hub `index.html` lives), even when the current
 * page is under `/browse/*.html`. Used so `./browse/foo.html` does not become `/browse/browse/foo.html`.
 */
export function siteRootPathnameFromPathname(pathname: string): string {
  const idx = pathname.indexOf("/browse/");
  if (idx >= 0) {
    const prefix = pathname.slice(0, idx).replace(/\/+$/, "");
    return prefix === "" ? "/" : prefix;
  }
  const noFile = pathname.replace(/\/[^/]*$/, "");
  if (noFile === "" || noFile === "/") return "/";
  return noFile.replace(/\/+$/, "") || "/";
}

/** Indexed pair page: `./browse/…/index.html` or path-absolute `/browse/…/index.html`. */
const STATIC_BROWSE_INDEXED = /^(?:\.\/|\/)?browse\/(.+)\/index\.html$/i;

/**
 * Flat HTML under `browse/`: a lone `*.html` file (e.g. legacy or opaque slug). Multi-angle pairs
 * use indexed `./browse/…/…/index.html` only. Must not match indexed URLs ending in `/index.html`
 * (check {@link STATIC_BROWSE_INDEXED} first).
 */
const STATIC_BROWSE_FLAT_HTML = /^(?:\.\/|\/)?browse\/(.+\.html)$/i;

/** True when `href` is hub-root-relative static browse (not same-dir `./other.html`). */
function isStaticBrowseIndexedHref(t: string): boolean {
  return STATIC_BROWSE_INDEXED.test(t);
}

function isStaticBrowseFlatHtmlHref(t: string): boolean {
  return STATIC_BROWSE_FLAT_HTML.test(t) && !t.toLowerCase().endsWith("/index.html");
}

export function isHubRelativeStaticBrowseHref(href: string): boolean {
  const t = href.trim();
  return isStaticBrowseIndexedHref(t) || isStaticBrowseFlatHtmlHref(t);
}

/**
 * Resolves `staticBrowseUrl` from nav JSON (`./browse/…/index.html` or legacy flat `./browse/…@….html`) to an absolute href.
 */
export function resolveStaticBrowseHref(
  relativeBrowse: string,
  pathname: string,
  origin: string,
): string {
  const r = relativeBrowse.trim();
  if (r.startsWith("/")) return `${origin}${r}`;
  const root = siteRootPathnameFromPathname(pathname);
  const mIdx = STATIC_BROWSE_INDEXED.exec(r);
  if (mIdx?.[1]) {
    const inner = mIdx[1];
    const path =
      root === "/" ? `/browse/${inner}/index.html` : `${root}/browse/${inner}/index.html`;
    return `${origin}${path}`;
  }
  const mFlat = STATIC_BROWSE_FLAT_HTML.exec(r);
  if (mFlat?.[1] && !r.toLowerCase().endsWith("/index.html")) {
    const path = root === "/" ? `/browse/${mFlat[1]}` : `${root}/browse/${mFlat[1]}`;
    return `${origin}${path}`;
  }
  return new URL(r, `${origin}${pathname}`).href;
}

/**
 * Value for `#shell` `data-parallel-docs-pair-browse-href`: keep portable `./browse/…` hub-relative
 * URLs when the static site emits them (`*.html` or `…/index.html`); otherwise resolve like
 * {@link resolveStaticBrowseHref} for anchors and odd relative forms.
 */
export function staticBrowseHrefForShellDataAttribute(
  staticBrowseUrl: string,
  pathname: string,
  origin: string,
): string {
  const r = staticBrowseUrl.trim();
  if (r.length === 0) return "";
  const indexed = STATIC_BROWSE_INDEXED.exec(r);
  if (indexed?.[1]) return `./browse/${indexed[1]}/index.html`;
  const flat = STATIC_BROWSE_FLAT_HTML.exec(r);
  if (flat?.[1] && !r.toLowerCase().endsWith("/index.html")) return `./browse/${flat[1]}`;
  return resolveStaticBrowseHref(r, pathname, origin);
}

export function findDocumentedPair<T extends DocumentedPairNavLike>(
  pairs: readonly T[],
  parallelDocsPath: string,
  sourcePath: string,
): T | undefined {
  const cr = normPosixPath(parallelDocsPath);
  const sp = normPosixPath(sourcePath);
  if (cr.length > 0) {
    const hit = pairs.find((x) => normPosixPath(x.parallelDocsPath) === cr);
    if (hit) return hit;
  }
  if (sp.length > 0) {
    const hit = pairs.find((x) => normPosixPath(x.sourcePath) === sp);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Opaque browse pages are files `browse/<slug>.html`. A bare `/…/browse/<slug>` (one segment after
 * `browse/`, no `.` in the slug) has no static file on disk — append `.html` so dev server and
 * address-bar sync match emitted assets (same link shape users should share).
 */
export function appendHtmlToOpaqueBrowsePathname(pathname: string): string {
  const needle = "/browse/";
  const idx = pathname.lastIndexOf(needle);
  if (idx < 0) return pathname;
  const rest = pathname.slice(idx + needle.length);
  if (rest.length === 0 || rest.includes("/") || rest.includes(".")) return pathname;
  return `${pathname.slice(0, idx + needle.length)}${rest}.html`;
}

/** Apply {@link appendHtmlToOpaqueBrowsePathname} to the path part of a request URL. */
export function appendHtmlToOpaqueBrowseRequestUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, "http://localhost");
    const nextPath = appendHtmlToOpaqueBrowsePathname(u.pathname);
    if (nextPath === u.pathname) return rawUrl;
    u.pathname = nextPath;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return rawUrl;
  }
}

export function isSameDocumentedPair(
  a: DocumentedPairNavLike,
  curSourcePath: string,
  curParallelDocsPath: string,
): boolean {
  return (
    normPosixPath(a.sourcePath) === normPosixPath(curSourcePath) &&
    normPosixPath(a.parallelDocsPath) === normPosixPath(curParallelDocsPath)
  );
}

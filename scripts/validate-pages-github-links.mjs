#!/usr/bin/env node
/**
 * Post-`npm run pages:build` checks for `_site/`:
 * - Optional GitHub blob URLs match `https://github.com/<owner>/<repo>/blob/<branch>/…` (no doubled `/blob/`).
 * - `#shell` carries `data-sidetrack-pair-browse-href` (same-site `./browse/…/index.html`, optional legacy flat `./browse/…@….html`, or GitHub blob). Host-root `/browse/…` is forbidden so static shells stay aligned with `sidetrack-nav-search.json` and work on GitHub Pages project URLs. Resolves without `/browse/browse/` stacking.
 * - `sidetrack-nav-search.json` `documentedPairs[].staticBrowseUrl`, when present, uses the same `./browse/…` prefix.
 * - `_site/serve.json` sets `renderSingle: true` so local `serve` serves lone `index.html` in humane dirs (not directory listings).
 * - Every generated local `href` / `src` in each `.html` file under `_site/` (recursive) resolves to an existing static file.
 * - No generated HTML is a client-side redirect shim (meta refresh + `window.location.replace`).
 *
 * Optional live check (network): `SIDETRACK_VALIDATE_PAGES_LIVE=1` sends HEAD to the first GitHub blob URL found in the hub index.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const GITHUB_BLOB_RE =
  /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/blob\/(?<branch>[^/]+)\/(?<path>.+)$/;

const BROWSE_FLAT_RE = /^(?:\.\/|\/)browse\/[^/]+\.html$/;
const BROWSE_INDEXED_RE = /^(?:\.\/|\/)browse\/.+\/index\.html$/;

function isHubRelativeBrowseHref(href) {
  return BROWSE_FLAT_RE.test(href) || BROWSE_INDEXED_RE.test(href);
}

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const siteDir = join(repoRoot, "_site");
const indexPath = join(siteDir, "index.html");
const pairNavPath = join(repoRoot, "packages", "render", "dist", "code-browser-pair-nav.js");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** Reads a `name="…"` attribute from the opening tag of `#shell`. */
function shellAttr(html, attrName) {
  // Do not use a trailing `\b` after `id="shell"`: the closing `"` and the next
  // character are often both non-word (e.g. `"` then space), so `\b` fails and
  // the whole tag match is lost on long static shells.
  const m = /<div\b[^>]*\bid="shell"(?=\s|>)[^>]*>/.exec(html);
  if (!m) return null;
  const tag = m[0];
  const am = new RegExp(`\\b${attrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}="([^"]*)"`).exec(
    tag,
  );
  return am?.[1] ?? null;
}

function firstGithubBlobHrefIn(html) {
  const m = /href="(https:\/\/github\.com\/[^"]+\/blob\/[^"]+)"/.exec(html);
  return m?.[1] ?? null;
}

function assertNoBrowseStack(html, label) {
  const needle = "/browse/browse/";
  const idx = html.indexOf(needle);
  if (idx < 0) return;
  const lo = Math.max(0, idx - 48);
  const hi = Math.min(html.length, idx + needle.length + 48);
  const snippet = html.slice(lo, hi).replace(/\s+/g, " ");
  fail(
    `${label}: emitted HTML contains ${needle} (full-document substring check).\n` +
      `Often prose or highlighted source that illustrates the bug — rephrase, or fix a real doubled browse path.\n` +
      `Near: ${JSON.stringify(snippet)}`,
  );
}

function assertGithubBlobUrl(label, href) {
  if (!href) fail(`${label}: missing href`);
  const m = GITHUB_BLOB_RE.exec(href);
  if (!m?.groups) fail(`${label}: not a GitHub blob URL: ${href}`);
  return m.groups;
}

function assertDocPairHref(label, href) {
  if (href.startsWith("https://github.com/")) {
    assertGithubBlobUrl(`${label} (GitHub fallback)`, href);
    return;
  }
  if (!isHubRelativeBrowseHref(href)) {
    fail(`${label}: expected ./browse/… (.html or …/index.html), or GitHub blob, got: ${href}`);
  }
}

/**
 * Same-site static browse must use `./browse/…` (nav JSON shape). Host-root `/browse/…` breaks
 * project-site hosting and diverges from `documentedPairs[].staticBrowseUrl`.
 */
function assertSameSiteStaticPairBrowseUsesNavJsonDotSlashPrefix(label, href) {
  if (!href || href.startsWith("https://github.com/")) return;
  if (!isHubRelativeBrowseHref(href)) return;
  if (!href.startsWith("./browse/")) {
    fail(
      `${label}: same-site static pair browse must start with "./browse/" (same as sidetrack-nav-search.json staticBrowseUrl), not host-root "/browse/…". Got: ${href}`,
    );
  }
}

function validateNavSearchJsonStaticBrowseUrls() {
  const p = join(siteDir, "sidetrack-nav-search.json");
  if (!existsSync(p)) return;
  let doc;
  try {
    doc = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${p}: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const pairs = doc?.documentedPairs;
  if (!Array.isArray(pairs)) return;
  for (let i = 0; i < pairs.length; i++) {
    const u = pairs[i]?.staticBrowseUrl;
    if (typeof u !== "string") continue;
    const t = u.trim();
    if (t.length === 0) continue;
    if (!isHubRelativeBrowseHref(t)) {
      fail(
        `sidetrack-nav-search.json documentedPairs[${String(i)}].staticBrowseUrl: expected hub-relative browse or omit, got: ${t}`,
      );
    }
    assertSameSiteStaticPairBrowseUsesNavJsonDotSlashPrefix(
      `sidetrack-nav-search.json documentedPairs[${String(i)}].staticBrowseUrl`,
      t,
    );
  }
}

function isBrowseRedirectShimHtml(html) {
  const hasRefresh = /<meta\s+http-equiv="refresh"\s+content="0;url=[^"]+\.html"\s*\/?>/i.test(
    html,
  );
  const hasRedirectTitle = /<title>\s*Redirecting…\s*<\/title>/i.test(html);
  const hasReplaceCall = /window\.location\.replace\(/i.test(html);
  return hasRefresh && hasRedirectTitle && hasReplaceCall;
}

async function maybeHeadGithub(url) {
  if (process.env.SIDETRACK_VALIDATE_PAGES_LIVE !== "1") return;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    if (res.status < 200 || res.status >= 400) {
      fail(`Live HEAD ${url} → HTTP ${String(res.status)}`);
    }
    console.log(`OK live HEAD ${url} → ${String(res.status)}`);
  } finally {
    clearTimeout(t);
  }
}

async function assertBrowseMatrixResolves(docHubHref, pairNav, origins, pathnames) {
  if (!existsSync(pairNav) || !isHubRelativeBrowseHref(docHubHref)) return;
  const { resolveStaticBrowseHref } = await import(pathToFileURL(pairNav).href);
  for (const origin of origins) {
    for (const pathname of pathnames) {
      const resolved = resolveStaticBrowseHref(docHubHref, pathname, origin);
      if (resolved.includes("/browse/browse/")) {
        fail(`resolveStaticBrowseHref(${docHubHref}, ${pathname}, ${origin}) → ${resolved}`);
      }
    }
  }
}

function walkHtmlFiles(absDir) {
  const out = [];
  for (const ent of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkHtmlFiles(abs));
      continue;
    }
    if (ent.isFile() && ent.name.endsWith(".html")) out.push(abs);
  }
  return out;
}

function localSitePathFromUrlPath(pathname) {
  const clean = pathname.replace(/^\/+/, "");
  const abs = join(siteDir, clean);
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    const idx = join(abs, "index.html");
    if (existsSync(idx) && statSync(idx).isFile()) return idx;
  }
  return null;
}

function localTargetPathFromRef(ref, fromHtmlAbsPath) {
  const trimmed = ref.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("javascript:")
  ) {
    return null;
  }
  const baseUrl = new URL(`file://${fromHtmlAbsPath}`);
  const resolved = new URL(trimmed, baseUrl);
  if (resolved.protocol !== "file:") return null;
  return localSitePathFromUrlPath(resolved.pathname);
}

function assertStaticLocalRefsResolve(htmlAbsPath, html) {
  const relHtml = relative(siteDir, htmlAbsPath).replaceAll("\\", "/");
  const attrRe = /\b(?:href|src)="([^"]+)"/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const ref = m[1] ?? "";
    const target = localTargetPathFromRef(ref, htmlAbsPath);
    if (target === null) continue;
    if (!existsSync(target)) {
      fail(`${relHtml}: local ref ${JSON.stringify(ref)} resolves to missing target`);
    }
  }
}

async function validateHubIndex(indexHtml) {
  assertNoBrowseStack(indexHtml, "hub index.html");

  const srcHref = firstGithubBlobHrefIn(indexHtml);
  if (srcHref) {
    assertGithubBlobUrl("hub (first GitHub blob link in HTML)", srcHref);
    await maybeHeadGithub(srcHref);
  }

  const docHubHref = shellAttr(indexHtml, "data-sidetrack-pair-browse-href");
  if (!docHubHref) {
    fail('hub index.html: missing data-sidetrack-pair-browse-href on id="shell"');
  }
  assertDocPairHref("hub shell data-sidetrack-pair-browse-href", docHubHref);
  assertSameSiteStaticPairBrowseUsesNavJsonDotSlashPrefix(
    "hub shell data-sidetrack-pair-browse-href",
    docHubHref,
  );

  const origins = ["https://d-led.github.io", "http://127.0.0.1:14173"];
  const flatSlug = /^(?:\.\/|\/)browse\/([^/]+\.html)$/.exec(docHubHref)?.[1];
  const indexedInner = /^(?:\.\/|\/)browse\/(.+)\/index\.html$/.exec(docHubHref)?.[1];
  const pathnames = flatSlug
    ? [`/browse/${flatSlug}`, `/sidetrack/browse/${flatSlug}`]
    : indexedInner
      ? [`/browse/${indexedInner}/index.html`, `/sidetrack/browse/${indexedInner}/index.html`]
      : [];
  if (pathnames.length > 0) {
    await assertBrowseMatrixResolves(docHubHref, pairNavPath, origins, pathnames);
  }
}

async function validateBrowsePage(name, html) {
  assertNoBrowseStack(html, `browse/${name}`);
  const doc = shellAttr(html, "data-sidetrack-pair-browse-href");
  if (!doc) {
    fail(`browse/${name}: missing data-sidetrack-pair-browse-href on #shell`);
  }

  const src = firstGithubBlobHrefIn(html);
  if (src) assertGithubBlobUrl(`browse/${name} (first GitHub blob link)`, src);
  assertDocPairHref(`browse/${name} shell data-sidetrack-pair-browse-href`, doc);
  assertSameSiteStaticPairBrowseUsesNavJsonDotSlashPrefix(
    `browse/${name} shell data-sidetrack-pair-browse-href`,
    doc,
  );

  if (!existsSync(pairNavPath) || !isHubRelativeBrowseHref(doc)) return;
  const { resolveStaticBrowseHref } = await import(pathToFileURL(pairNavPath).href);
  const flatSlug = /^(?:\.\/|\/)browse\/([^/]+\.html)$/.exec(doc)?.[1];
  const indexedInner = /^(?:\.\/|\/)browse\/(.+)\/index\.html$/.exec(doc)?.[1];
  const pathnameProbe = flatSlug
    ? `/browse/${flatSlug}`
    : indexedInner
      ? `/browse/${indexedInner}/index.html`
      : `/browse/${name}`;
  const resolved = resolveStaticBrowseHref(doc, pathnameProbe, "http://127.0.0.1:14173");
  if (resolved.includes("/browse/browse/")) {
    fail(`browse/${name}: resolved pair browse → ${resolved}`);
  }
}

async function validateBrowseHtmlFiles() {
  const browseDir = join(siteDir, "browse");
  if (!existsSync(browseDir)) {
    console.log("No _site/browse/ — skipping browse HTML checks.");
    return;
  }
  const files = walkHtmlFiles(browseDir);
  for (const p of files) {
    const html = readFileSync(p, "utf8");
    if (isBrowseRedirectShimHtml(html)) {
      fail(
        `browse/${relative(browseDir, p).replaceAll("\\", "/")}: redirect shim HTML is forbidden`,
      );
    }
    await validateBrowsePage(relative(browseDir, p).replaceAll("\\", "/"), html);
  }
}

function validateServeJsonForLocalStaticHost() {
  const p = join(siteDir, "serve.json");
  if (!existsSync(p)) {
    fail(
      `Missing ${p} — humane browse dirs need serve-handler renderSingle locally (see github-pages-site).`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${p}: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (parsed?.renderSingle !== true) {
    fail(`${p}: must set "renderSingle": true for local static preview of humane browse paths.`);
  }
}

function validateAllStaticHtmlLinks() {
  const htmlFiles = walkHtmlFiles(siteDir);
  for (const htmlPath of htmlFiles) {
    const html = readFileSync(htmlPath, "utf8");
    if (isBrowseRedirectShimHtml(html)) {
      fail(`${relative(siteDir, htmlPath).replaceAll("\\", "/")}: redirect shim HTML is forbidden`);
    }
    assertStaticLocalRefsResolve(htmlPath, html);
  }
}

async function main() {
  if (!existsSync(indexPath)) {
    fail(`Missing ${indexPath} — run npm run pages:build first.`);
  }
  validateServeJsonForLocalStaticHost();
  const indexHtml = readFileSync(indexPath, "utf8");
  await validateHubIndex(indexHtml);
  validateNavSearchJsonStaticBrowseUrls();
  await validateBrowseHtmlFiles();
  validateAllStaticHtmlLinks();
  console.log(
    "pages:validate — OK (GitHub blob shapes, ./browse/ nav+shell parity, no /browse/browse/ stacking, serve.json, static local links).",
  );
}

await main();

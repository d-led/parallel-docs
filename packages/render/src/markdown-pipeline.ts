import path from "node:path";

import type { Code, Definition, Html, Image, Link, Root as MdastRoot } from "mdast";
import type { Element, Root as HastRoot, Text } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { escapeHtml } from "./html-utils.js";

/**
 * When generating static HTML (Pages, `sidetrack render`), rewrites `img[src]` and `a[href]`
 * so local assets work from the output file location.
 *
 * **URL rules** (same sidetrack file as in the editor):
 * - **`/path/to/file`** — resolved from the **repository root** (leading slash), POSIX-style,
 *   after `..` normalization; must stay **inside** `repoRootAbs`.
 * - **`./` / `../` / `figures/a.png`** — resolved with `path.resolve(markdownUrlBaseDirAbs, …)`;
 *   must stay **inside** `repoRootAbs`.
 *
 * **Images (`img[src]`)** — resolved path must also lie **inside** `sidetrackStorageRootAbs`
 * (typically `{repo}/.sidetrack`). Raster or SVG assets for sidetrack belong next to the
 * Markdown under storage; repo-root images are **not** emitted (src removed) so static pages
 * cannot pull arbitrary repo files as image bytes.
 *
 * **Links (`a[href]`)** — any in-repo file under `repoRootAbs` may still be linked (e.g. specs
 * under `docs/`). Only images are restricted to storage.
 *
 * **Static publish (`staticSiteOutDirAbs`)** — GitHub Pages and `sidetrack serve` only deploy
 * files under the output site root (e.g. `_site/`). Local `img[src]` that would point outside
 * that tree (typically `../.sidetrack/…`) are rewritten to
 * `{@link SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT}/…` **under the site root**, and the
 * pipeline records copies in {@link SideTrackOutputUrlOptions.companionStaticAssetCopies} for
 * the build step to materialize on disk.
 */
export const SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT = "sidetrack-static-assets";

export type SideTrackStaticAssetCopy = { fromAbs: string; toAbs: string };

export type SideTrackOutputUrlOptions = {
  repoRootAbs: string;
  htmlOutputFileAbs: string;
  markdownUrlBaseDirAbs: string;
  /**
   * Absolute path to SideTrack storage (e.g. `{repoRoot}/.sidetrack`). Used to sandbox
   * **local image** URLs; see package JSDoc above.
   */
  sidetrackStorageRootAbs: string;
  /** When set, `https://github.com/<owner>/<repo>/blob|tree/<branch>/…` becomes a `/…` repo path. */
  githubBlobRepo?: { owner: string; repo: string };
  /**
   * Absolute path to the deployed static site root (e.g. `{repo}/_site`). When set, companion
   * images under storage that are not already inside this directory are emitted as URLs under
   * {@link SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT} and listed for copying.
   */
  staticSiteOutDirAbs?: string;
  /**
   * When {@link staticSiteOutDirAbs} is set, populated with `{ fromAbs, toAbs }` for each mirrored
   * image so the HTML writer can `copyFile` after render.
   */
  companionStaticAssetCopies?: SideTrackStaticAssetCopy[];
  /**
   * Optional prefix for local repo file links when static hosting does not serve the source tree.
   * Supported forms: absolute `http(s)` URL prefix or absolute path prefix (`/...`).
   */
  sourceLinkPrefix?: string;
};

export type MarkdownPipelineOptions = {
  sidetrackOutputUrls?: SideTrackOutputUrlOptions;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripUrlQueryAndHash(s: string): string {
  let end = s.length;
  const q = s.indexOf("?");
  const h = s.indexOf("#");
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return s.slice(0, end);
}

function tryExtractRepoFilePathFromGithubUrl(
  url: string,
  owner: string,
  repo: string,
): string | null {
  const re = new RegExp(
    `^https://github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/(?:blob|tree)/[^/]+/(.+)$`,
    "i",
  );
  const m = re.exec(url.trim());
  if (!m) return null;
  let tail = m[1];
  try {
    tail = decodeURIComponent(tail);
  } catch {
    // keep encoded path
  }
  return stripUrlQueryAndHash(tail);
}

function remarkGithubBlobToRepoPaths(opts: { owner: string; repo: string }) {
  const { owner, repo } = opts;
  return (tree: MdastRoot) => {
    const rewrite = (url: string): string | null => {
      const next = tryExtractRepoFilePathFromGithubUrl(url, owner, repo);
      if (!next) return null;
      const posix = next.replace(/\\/g, "/").replace(/^\/+/, "");
      return posix ? `/${posix}` : null;
    };
    visit(tree, "link", (node: Link) => {
      const next = rewrite(node.url);
      if (next) node.url = next;
    });
    visit(tree, "image", (node: Image) => {
      const next = rewrite(node.url);
      if (next) node.url = next;
    });
    visit(tree, "definition", (node: Definition) => {
      const next = rewrite(node.url);
      if (next) node.url = next;
    });
  };
}

function posixHref(fsPath: string): string {
  return fsPath.split(path.sep).join("/");
}

function decodeUrlPath(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function isResolvedPathInsideRoot(resolvedAbs: string, rootAbs: string): boolean {
  const rel = path.relative(path.resolve(rootAbs), path.resolve(resolvedAbs));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return true;
}

function normalizeSourceLinkPrefix(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t.startsWith("/")) return trimTrailingSlashes(t);
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") return null;
  return trimTrailingSlashes(t);
}

function trimTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return input.slice(0, end);
}

function prefixedSourceHref(prefix: string, repoRoot: string, resolvedAbs: string): string | null {
  const rel = path.relative(repoRoot, resolvedAbs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const tail = rel
    .split(path.sep)
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  if (tail.length === 0) return null;
  return `${prefix}/${tail}`;
}

type LocalUrlRewrite = { relativeToHtml: string } | { blockedImage: true } | null;

function skipNonFilesystemLocalUrl(raw: string): boolean {
  const t = raw.trim();
  return !t || t.startsWith("#") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(t) || t.startsWith("//");
}

function resolveRepoLocalFilesystemTarget(
  raw: string,
  repoRoot: string,
  baseDir: string,
): string | null {
  if (skipNonFilesystemLocalUrl(raw)) return null;
  const t = raw.trim();
  let resolved: string;
  if (t.startsWith("/")) {
    const rest = decodeUrlPath(t.replace(/^\/+/, ""));
    if (!rest || rest.includes("\0")) return null;
    resolved = path.normalize(path.join(repoRoot, rest));
  } else {
    resolved = path.normalize(path.resolve(baseDir, decodeUrlPath(t)));
  }
  if (!isResolvedPathInsideRoot(resolved, repoRoot)) return null;
  return resolved;
}

type MirrorCopyList = NonNullable<SideTrackOutputUrlOptions["companionStaticAssetCopies"]>;

/** When publishing under `siteRootAbs`, storage-only images outside the site tree map into {@link SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT}. */
function mirroredAbsoluteTargetForSitePublish(
  resolved: string,
  storageRoot: string,
  siteRootAbs: string,
  mirrorCopies: MirrorCopyList,
  mirroredToAbs: Set<string>,
): string | "blocked" {
  if (isResolvedPathInsideRoot(resolved, siteRootAbs)) return resolved;
  const mirrorRel = path.relative(storageRoot, resolved);
  if (mirrorRel.startsWith("..") || path.isAbsolute(mirrorRel)) return "blocked";
  const toAbs = path.normalize(
    path.join(siteRootAbs, SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT, mirrorRel),
  );
  if (!isResolvedPathInsideRoot(toAbs, siteRootAbs)) return "blocked";
  if (!mirroredToAbs.has(toAbs)) {
    mirroredToAbs.add(toAbs);
    mirrorCopies.push({ fromAbs: resolved, toAbs });
  }
  return toAbs;
}

function rehypeSideTrackOutputUrls(ctx: SideTrackOutputUrlOptions) {
  const repoRoot = path.resolve(ctx.repoRootAbs);
  const storageRoot = path.resolve(ctx.sidetrackStorageRootAbs);
  const htmlDir = path.dirname(path.resolve(ctx.htmlOutputFileAbs));
  const baseDir = path.resolve(ctx.markdownUrlBaseDirAbs);
  const siteRootAbs = ctx.staticSiteOutDirAbs ? path.resolve(ctx.staticSiteOutDirAbs) : null;
  const sourceLinkPrefix = normalizeSourceLinkPrefix(ctx.sourceLinkPrefix ?? "");
  const mirrorCopies = ctx.companionStaticAssetCopies;
  const mirroredToAbs = new Set<string>();

  function resolveTargetAbs(raw: string, tagName: "a" | "img"): LocalUrlRewrite {
    const resolved = resolveRepoLocalFilesystemTarget(raw, repoRoot, baseDir);
    if (resolved == null) return null;

    if (tagName === "img" && !isResolvedPathInsideRoot(resolved, storageRoot)) {
      return { blockedImage: true };
    }

    let targetAbsForUrl = resolved;
    if (tagName === "img" && siteRootAbs && mirrorCopies) {
      const mirrored = mirroredAbsoluteTargetForSitePublish(
        resolved,
        storageRoot,
        siteRootAbs,
        mirrorCopies,
        mirroredToAbs,
      );
      if (mirrored === "blocked") return { blockedImage: true };
      targetAbsForUrl = mirrored;
    }

    const out = path.relative(htmlDir, targetAbsForUrl);
    if (path.isAbsolute(out)) return null;

    if (
      tagName === "a" &&
      sourceLinkPrefix &&
      siteRootAbs &&
      !isResolvedPathInsideRoot(targetAbsForUrl, siteRootAbs)
    ) {
      const prefixed = prefixedSourceHref(sourceLinkPrefix, repoRoot, resolved);
      if (prefixed) return { relativeToHtml: prefixed };
    }

    return { relativeToHtml: posixHref(out) };
  }

  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a" && node.tagName !== "img") return;
      const key = node.tagName === "a" ? "href" : "src";
      const raw = node.properties?.[key];
      if (typeof raw !== "string") return;
      const next = resolveTargetAbs(raw, node.tagName);
      if (next == null) return;
      node.properties ??= {};
      if ("blockedImage" in next) {
        if (node.tagName === "a") {
          delete node.properties.href;
        } else {
          delete node.properties.src;
        }
        return;
      }
      if (node.tagName === "a") {
        node.properties.href = next.relativeToHtml;
      } else {
        node.properties.src = next.relativeToHtml;
      }
    });
  };
}

function remarkMermaidPlaceholders() {
  return (tree: MdastRoot) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (node.lang !== "mermaid" || parent === undefined || index === undefined) return;
      const value = node.value;
      const html: Html = {
        type: "html",
        /** Diagram text must end up as direct text under `<pre class="mermaid">` (see {@link rehypeMermaidUnwrapInnerCode}). */
        value: `<div class="sidetrack-mermaid"><pre class="mermaid">${escapeHtml(
          value,
        )}</pre></div>`,
      };
      parent.children[index] = html;
    });
  };
}

function hastPlainTextFromElement(node: Element): string {
  let out = "";
  for (const c of node.children) {
    if (c.type === "text") {
      out += c.value;
    } else if (c.type === "element") {
      out += hastPlainTextFromElement(c);
    }
  }
  return out;
}

/**
 * `rehype-highlight` may leave (or introduce) `<pre class="mermaid"><code class="language-mermaid">…</code></pre>`.
 * Mermaid 11's browser runtime expects the diagram source as **text** under `<pre class="mermaid">`, otherwise it
 * shows "Syntax error in text".
 */
function rehypeMermaidUnwrapInnerCode() {
  return (tree: HastRoot): void => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const cls = node.properties?.className;
      if (!Array.isArray(cls) || !cls.map(String).includes("mermaid")) return;

      const codeChild = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!codeChild) return;

      const value = hastPlainTextFromElement(codeChild);
      const textNode: Text = { type: "text", value };
      node.children = [textNode];
    });
  };
}

const sanitizeSchema = structuredClone(defaultSchema);

/** Companion Markdown is repo-controlled; keep `id` unprefixed so `sidetrack-block-*` anchors are stable. */
sanitizeSchema.clobber = ["ariaDescribedBy", "ariaLabelledBy", "name"];

sanitizeSchema.attributes = {
  ...sanitizeSchema.attributes,
  code: [...(sanitizeSchema.attributes?.code ?? []), "className"],
  pre: [...(sanitizeSchema.attributes?.pre ?? []), "className"],
  span: [...(sanitizeSchema.attributes?.span ?? []), "className"],
  div: [
    ...(sanitizeSchema.attributes?.div ?? []),
    "className",
    "id",
    "ariaHidden",
    /** Block scroll sync markers from `injectSideTrackDocAnchors` (hast property names). */
    "dataSourceStart",
    "dataSidetrackLine",
    "dataSidetrackPageBreak",
    "dataNextSidetrackLine",
    "dataNextSourceViewportLine",
  ],
};

export async function renderMarkdownToHtml(
  markdown: string,
  options?: MarkdownPipelineOptions,
): Promise<string> {
  const outUrls = options?.sidetrackOutputUrls;
  const file = await unified()
    .use(remarkParse)
    /** GFM: autolink literals, footnotes, strikethrough, tables, task lists (see `remark-gfm`). */
    .use(remarkGfm, { singleTilde: false })
    .use(function remarkGithubBlobMaybe() {
      return (tree: MdastRoot) => {
        const gh = outUrls?.githubBlobRepo;
        if (!gh) return;
        remarkGithubBlobToRepoPaths({ owner: gh.owner, repo: gh.repo })(tree);
      };
    })
    .use(remarkMermaidPlaceholders)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizeSchema)
    .use(function rehypeOutputUrlsMaybe() {
      return (tree: HastRoot) => {
        if (!outUrls) return;
        rehypeSideTrackOutputUrls(outUrls)(tree);
      };
    })
    .use(rehypeHighlight, { plainText: ["mermaid"] })
    .use(rehypeMermaidUnwrapInnerCode)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

export async function renderFencedCode(markdownFence: string): Promise<string> {
  return renderMarkdownToHtml(markdownFence);
}

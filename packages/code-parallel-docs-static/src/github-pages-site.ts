import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type ParallelDocsIndex,
  type ResolvedParallelDocsConfig,
  type ResolvedStaticSite,
  loadParallelDocsConfig,
  readIndex,
  resolveParallelDocsMarkdownPath,
  resolveMermaidRuntimePath,
  resolvePathUnderRepoRoot,
  staticBrowseIndexRelPathFromPair,
} from "@parallel-docs/core";
import {
  PARALLEL_DOCS_STATIC_COMPANION_ASSETS_SEGMENT,
  type CodeBrowserMultiAngleBrowsing,
  type ParallelDocsNavSearchDocument,
  type ParallelDocsStaticAssetCopy,
  buildParallelDocsNavSearchDocument,
} from "@parallel-docs/render";

import { type BuildParallelDocsStaticOptions, buildParallelDocsStatic } from "./build.js";
import {
  blockStretchRowsForDocumentedPair,
  flatBlockStretchRows,
  type GithubNavBase,
  loadMultiAngleBrowsingIfEnabled,
  pickParallelDocsBody,
  pickDefaultParallelDocsRel,
  readFlatCompanionMarkdown,
  resolveGithubNavBase,
  sourceAndParallelDocsGithubUrls,
} from "./github-pages-site-prep.js";
import { pathExists } from "./github-pages-site-shared.js";
import { browsePairStaticBrowseRelUrl } from "./browse-pair-static-url.js";

const DEFAULT_TOOL_HOME = "https://github.com/d-led/parallel-docs";

/**
 * `vercel/serve` + `serve-handler`: canonical pair pages mirror `{storage}/source/…` under
 * `browse/…/index.html` (or encoded `sourcePath` when the companion is not under that tree).
 * `renderSingle: true` serves lone `index.html` in those dirs without directory listings locally.
 */
const SERVE_JSON_FOR_LOCAL_PREVIEW = `${JSON.stringify({ renderSingle: true }, null, 2)}\n`;

function staticSourceLinkPrefix(
  ss: ResolvedStaticSite,
  ghNavBase: GithubNavBase | null,
  relativeGithubBlobLinks: boolean,
): string | undefined {
  const explicit = ss.sourceLinkPrefix?.trim();
  if (explicit) return explicit;
  if (!relativeGithubBlobLinks) return undefined;
  if (!ghNavBase) return undefined;
  return `https://github.com/${encodeURIComponent(ghNavBase.owner)}/${encodeURIComponent(
    ghNavBase.repo,
  )}/blob/${encodeURIComponent(ghNavBase.branch)}`;
}

function browseParallelDocsOutputUrls(input: {
  repoRoot: string;
  outPath: string;
  markdownUrlBaseDirAbs: string;
  cfg: ResolvedParallelDocsConfig;
  outDir: string;
  companionStaticAssetCopies: ParallelDocsStaticAssetCopy[];
  sourceLinkPrefix: string | undefined;
}) {
  return {
    repoRootAbs: input.repoRoot,
    htmlOutputFileAbs: input.outPath,
    markdownUrlBaseDirAbs: input.markdownUrlBaseDirAbs,
    parallelDocsStorageRootAbs: path.resolve(
      input.repoRoot,
      input.cfg.storageDir.replaceAll("\\", "/"),
    ),
    staticSiteOutDirAbs: input.outDir,
    companionStaticAssetCopies: input.companionStaticAssetCopies,
    sourceLinkPrefix: input.sourceLinkPrefix,
  };
}

/**
 * Relative `href` from an emitted browse page to the site-root `index.html`.
 * Nested permalinks (`browse/pkg/a.ts/main/index.html`) need more `..` segments than flat
 * `browse/foo/index.html`; encoding depth here avoids brittle client-side URL rewriting.
 */
function siteHubUrlRelativeFromBrowsePageDir(browsePageDirUnderSite: string): string {
  const segments = browsePageDirUnderSite.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return "./index.html";
  return `${segments.map(() => "..").join("/")}/index.html`;
}

function browseBlockStretchRowsOpts(
  projectIndex: ParallelDocsIndex | null,
  p: { sourcePath: string; parallelDocsPath: string },
): Pick<BuildParallelDocsStaticOptions, "blockStretchRows"> | undefined {
  const sourceLower = p.sourcePath.trim().toLowerCase();
  const sourceIsMarkdown =
    sourceLower.endsWith(".md") ||
    sourceLower.endsWith(".mdx") ||
    sourceLower.endsWith(".markdown");
  if (sourceIsMarkdown) return undefined;
  const blockStretchRows = blockStretchRowsForDocumentedPair(
    projectIndex,
    p.sourcePath,
    p.parallelDocsPath,
  );
  if (!blockStretchRows) return undefined;
  return { blockStretchRows };
}

async function writeBrowsePageForPair(input: {
  repoRoot: string;
  outDir: string;
  browseDir: string;
  pair: {
    sourcePath: string;
    parallelDocsPath: string;
    sourceOnGithub?: string;
    parallelDocsOnGithub?: string;
    staticBrowseUrl?: string;
  };
  cfg: ResolvedParallelDocsConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: ParallelDocsIndex | null;
  ghNavBase: GithubNavBase | null;
  documentedPairsEmbeddedB64?: string;
}): Promise<void> {
  const p = input.pair;
  const canonicalBrowseRelPath = staticBrowseIndexRelPathFromPair(p, input.cfg.storageDir);
  const browsePageDirUnderSite = path.posix.dirname(
    path.posix.join("browse", canonicalBrowseRelPath),
  );
  const navSearchJsonRelToPage = path.posix.relative(
    browsePageDirUnderSite,
    "parallel-docs-nav-search.json",
  );
  const pairBrowseHubRelUrl = browsePairStaticBrowseRelUrl(p, input.cfg.storageDir);
  const outPath = path.join(input.browseDir, ...canonicalBrowseRelPath.split("/"));
  const sourceAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sourcePath);
  const mdAbs = resolvePathUnderRepoRoot(input.repoRoot, p.parallelDocsPath);
  if (!(await pathExists(mdAbs)) || !(await pathExists(sourceAbs))) return;

  const markdownUrlBaseDirAbs = path.dirname(mdAbs);
  const companionStaticAssetCopies: ParallelDocsStaticAssetCopy[] = [];
  const parallelDocsOutputUrls = browseParallelDocsOutputUrls({
    repoRoot: input.repoRoot,
    outPath,
    markdownUrlBaseDirAbs,
    cfg: input.cfg,
    outDir: input.outDir,
    companionStaticAssetCopies,
    sourceLinkPrefix: staticSourceLinkPrefix(
      input.ss,
      input.ghNavBase,
      input.cfg.render.relativeGithubBlobLinks,
    ),
  });
  const multiAngleBrowsing = await multiAngleBrowsingForBrowsePair(
    input.repoRoot,
    input.cfg,
    input.ss,
    input.projectIndex,
    input.ghNavBase,
    p,
  );
  const browseBlockStretchOpts = browseBlockStretchRowsOpts(input.projectIndex, p);
  const parallelDocsPathForSearch = pickDefaultParallelDocsRel(
    multiAngleBrowsing,
    p.parallelDocsPath,
  );
  await buildParallelDocsStatic({
    sourceFile: sourceAbs,
    markdownFile: mdAbs,
    outHtml: outPath,
    title: p.sourcePath,
    filePath: p.sourcePath,
    includeMermaidRuntime: input.cfg.render.mermaid,
    mermaidRuntimePath: resolveMermaidRuntimePath(
      input.repoRoot,
      input.cfg.render.mermaidRuntimePath,
    ),
    hljsTheme: input.cfg.render.syntaxTheme,
    siteHubUrl: siteHubUrlRelativeFromBrowsePageDir(browsePageDirUnderSite),
    toolHomeUrl: input.toolHomeUrl,
    parallelDocsOutputUrls,
    relatedGithubNav: input.ss.relatedGithubNav.length > 0 ? input.ss.relatedGithubNav : undefined,
    staticSearchScope: "parallel-docs-and-paths",
    parallelDocsPathForSearch,
    ...(multiAngleBrowsing ? { multiAngleBrowsing } : {}),
    ...(browseBlockStretchOpts ?? {}),
    ...(p.sourceOnGithub ? { sourceOnGithubUrl: p.sourceOnGithub } : {}),
    ...(p.parallelDocsOnGithub ? { parallelDocsOnGithubUrl: p.parallelDocsOnGithub } : {}),
    /** Hub-relative `./browse/…` so pair nav matches `parallel-docs-nav-search.json` and resolves on project pages. */
    parallelDocsStaticBrowseUrl: pairBrowseHubRelUrl,
    documentedNavJsonUrl: navSearchJsonRelToPage,
    builtAt: input.builtAt,
    ...(input.documentedPairsEmbeddedB64
      ? { documentedPairsEmbeddedB64: input.documentedPairsEmbeddedB64 }
      : {}),
    ...(input.pagesBuildCommitSha ? { pagesBuildCommitSha: input.pagesBuildCommitSha } : {}),
    stretchBufferSync: input.ss.stretchBufferSync,
  });
}

async function multiAngleBrowsingForBrowsePair(
  repoRoot: string,
  cfg: ResolvedParallelDocsConfig,
  ss: ResolvedStaticSite,
  projectIndex: ParallelDocsIndex | null,
  ghNavBase: GithubNavBase | null,
  pair: { sourcePath: string; parallelDocsPath: string },
): Promise<CodeBrowserMultiAngleBrowsing | undefined> {
  const multiForSource = await loadMultiAngleBrowsingIfEnabled(
    repoRoot,
    cfg,
    { ...ss, sourceFile: pair.sourcePath },
    projectIndex,
    ghNavBase,
  );
  if (!multiForSource) return undefined;
  const angleForPair = multiForSource.angles.find(
    (a) => a.parallelDocsPathRel === pair.parallelDocsPath,
  );
  return {
    ...multiForSource,
    defaultAngleId: angleForPair?.id ?? multiForSource.defaultAngleId,
  };
}

/**
 * Emits one static code browser HTML per documented pair under `_site/browse/…/index.html` and
 * adds `staticBrowseUrl` on each pair so the hub search can open the same ParallelDocs UI for other files.
 */
async function writePerPairBrowseHtmlPages(input: {
  repoRoot: string;
  outDir: string;
  navDoc: ParallelDocsNavSearchDocument;
  cfg: ResolvedParallelDocsConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: ParallelDocsIndex | null;
  ghNavBase: GithubNavBase | null;
}): Promise<ParallelDocsNavSearchDocument> {
  const pairs = input.navDoc.documentedPairs;
  if (!pairs?.length) return input.navDoc;

  /** Only pairs whose companion + source exist get `staticBrowseUrl`; otherwise nav would link to 404s. */
  const augmented: typeof pairs = [];
  for (const p of pairs) {
    const sourceAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sourcePath);
    const mdAbs = resolvePathUnderRepoRoot(input.repoRoot, p.parallelDocsPath);
    const bothExist = (await pathExists(mdAbs)) && (await pathExists(sourceAbs));
    if (!bothExist) {
      const rest = { ...p };
      delete rest.staticBrowseUrl;
      augmented.push(rest);
      continue;
    }
    augmented.push({
      ...p,
      staticBrowseUrl: browsePairStaticBrowseRelUrl(p, input.cfg.storageDir),
    });
  }
  const navWithUrls: ParallelDocsNavSearchDocument = {
    ...input.navDoc,
    documentedPairs: augmented,
  };
  const emb = documentedPairsEmbeddedB64FromNav(navWithUrls);

  const browseDir = path.join(input.outDir, "browse");
  await mkdir(browseDir, { recursive: true });
  for (const p of augmented) {
    await writeBrowsePageForPair({
      repoRoot: input.repoRoot,
      outDir: input.outDir,
      browseDir,
      pair: p,
      cfg: input.cfg,
      ss: input.ss,
      toolHomeUrl: input.toolHomeUrl,
      builtAt: input.builtAt,
      pagesBuildCommitSha: input.pagesBuildCommitSha,
      projectIndex: input.projectIndex,
      ghNavBase: input.ghNavBase,
      documentedPairsEmbeddedB64: emb,
    });
  }

  return navWithUrls;
}

function documentedPairsEmbeddedB64FromNav(
  navDoc: ParallelDocsNavSearchDocument,
): string | undefined {
  if (!Array.isArray(navDoc.documentedPairs) || navDoc.documentedPairs.length === 0) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(navDoc.documentedPairs), "utf8").toString("base64");
}

function staticBrowseUrlForConfiguredPair(
  navDoc: ParallelDocsNavSearchDocument,
  sourceFile: string,
  parallelDocsRel: string,
): string | undefined {
  const pairs = navDoc.documentedPairs;
  if (!pairs?.length || parallelDocsRel.length === 0) return undefined;
  const hit = pairs.find(
    (p) => p.sourcePath === sourceFile && p.parallelDocsPath === parallelDocsRel,
  );
  const u = hit?.staticBrowseUrl?.trim();
  return u && u.length > 0 ? u : undefined;
}

function staticRenderOptions(input: {
  repoRoot: string;
  sourceAbs: string;
  tmpMd: string;
  outHtml: string;
  ss: ResolvedStaticSite;
  cfg: ResolvedParallelDocsConfig;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  parallelDocsOutputUrls: NonNullable<BuildParallelDocsStaticOptions["parallelDocsOutputUrls"]>;
  blockStretchRows: BuildParallelDocsStaticOptions["blockStretchRows"];
  multiAngleBrowsing: CodeBrowserMultiAngleBrowsing | undefined;
  ghToolbar: ReturnType<typeof sourceAndParallelDocsGithubUrls>;
  defaultParallelDocsRel: string;
  documentedPairsEmbeddedB64: string | undefined;
  parallelDocsStaticBrowseUrl?: string;
}): BuildParallelDocsStaticOptions {
  return {
    sourceFile: input.sourceAbs,
    markdownFile: input.tmpMd,
    outHtml: input.outHtml,
    title: input.ss.title,
    filePath: input.ss.sourceFile,
    codeBrowserLayout: "auto",
    includeMermaidRuntime: input.cfg.render.mermaid,
    mermaidRuntimePath: resolveMermaidRuntimePath(
      input.repoRoot,
      input.cfg.render.mermaidRuntimePath,
    ),
    hljsTheme: input.cfg.render.syntaxTheme,
    siteHubUrl: "./",
    toolHomeUrl: input.toolHomeUrl,
    parallelDocsOutputUrls: input.parallelDocsOutputUrls,
    relatedGithubNav: input.ss.relatedGithubNav.length > 0 ? input.ss.relatedGithubNav : undefined,
    staticSearchScope: "parallel-docs-and-paths",
    parallelDocsPathForSearch: input.defaultParallelDocsRel,
    ...(input.blockStretchRows ? { blockStretchRows: input.blockStretchRows } : {}),
    ...(input.multiAngleBrowsing ? { multiAngleBrowsing: input.multiAngleBrowsing } : {}),
    ...(input.ghToolbar.sourceOnGithubUrl
      ? { sourceOnGithubUrl: input.ghToolbar.sourceOnGithubUrl }
      : {}),
    ...(input.ghToolbar.parallelDocsOnGithubUrl
      ? { parallelDocsOnGithubUrl: input.ghToolbar.parallelDocsOnGithubUrl }
      : {}),
    ...(input.ghToolbar.documentedNavJsonUrl
      ? { documentedNavJsonUrl: input.ghToolbar.documentedNavJsonUrl }
      : {}),
    ...(input.documentedPairsEmbeddedB64
      ? { documentedPairsEmbeddedB64: input.documentedPairsEmbeddedB64 }
      : {}),
    ...(input.parallelDocsStaticBrowseUrl
      ? { parallelDocsStaticBrowseUrl: input.parallelDocsStaticBrowseUrl }
      : {}),
    builtAt: input.builtAt,
    ...(input.pagesBuildCommitSha ? { pagesBuildCommitSha: input.pagesBuildCommitSha } : {}),
    stretchBufferSync: input.ss.stretchBufferSync,
  };
}

export type BuildGithubPagesStaticSiteOptions = {
  repoRoot: string;
  /** Footer “Rendered with …” link; defaults to the public ParallelDocs repository. */
  toolHomeUrl?: string;
  /**
   * Git commit SHA for this build (7–40 hex), shown in the footer on every static page.
   * Omit for local builds; CI sets this via `PARALLEL_DOCS_PAGES_BUILD_SHA` / workflow env.
   */
  pagesBuildCommitSha?: string;
};

async function emitGithubPagesSiteArtifacts(input: {
  repoRoot: string;
  outDir: string;
  tmpMd: string;
  navDoc: ParallelDocsNavSearchDocument;
  cfg: ResolvedParallelDocsConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: ParallelDocsIndex | null;
  ghNavBase: GithubNavBase | null;
  parallelDocsOutputUrls: NonNullable<BuildParallelDocsStaticOptions["parallelDocsOutputUrls"]>;
  blockStretchRows: BuildParallelDocsStaticOptions["blockStretchRows"];
  multiAngleBrowsing: CodeBrowserMultiAngleBrowsing | undefined;
  ghToolbar: ReturnType<typeof sourceAndParallelDocsGithubUrls>;
  defaultParallelDocsRel: string;
  sourceAbs: string;
  outHtml: string;
  navSearchPath: string;
}): Promise<ParallelDocsNavSearchDocument> {
  let { navDoc } = input;
  await mkdir(input.outDir, { recursive: true });
  await rm(path.join(input.outDir, PARALLEL_DOCS_STATIC_COMPANION_ASSETS_SEGMENT), {
    recursive: true,
    force: true,
  });
  await rm(path.join(input.outDir, "browse"), {
    recursive: true,
    force: true,
  });
  if (Array.isArray(navDoc.documentedPairs) && navDoc.documentedPairs.length > 0) {
    navDoc = await writePerPairBrowseHtmlPages({
      repoRoot: input.repoRoot,
      outDir: input.outDir,
      navDoc,
      cfg: input.cfg,
      ss: input.ss,
      toolHomeUrl: input.toolHomeUrl,
      builtAt: input.builtAt,
      pagesBuildCommitSha: input.pagesBuildCommitSha,
      projectIndex: input.projectIndex,
      ghNavBase: input.ghNavBase,
    });
  }
  const documentedPairsEmbeddedB64 = documentedPairsEmbeddedB64FromNav(navDoc);
  const hubStaticBrowseUrl =
    input.defaultParallelDocsRel.length > 0
      ? staticBrowseUrlForConfiguredPair(navDoc, input.ss.sourceFile, input.defaultParallelDocsRel)
      : undefined;

  const staticOpts = staticRenderOptions({
    repoRoot: input.repoRoot,
    sourceAbs: input.sourceAbs,
    tmpMd: input.tmpMd,
    outHtml: input.outHtml,
    ss: input.ss,
    cfg: input.cfg,
    toolHomeUrl: input.toolHomeUrl,
    builtAt: input.builtAt,
    pagesBuildCommitSha: input.pagesBuildCommitSha,
    parallelDocsOutputUrls: input.parallelDocsOutputUrls,
    blockStretchRows: input.blockStretchRows,
    multiAngleBrowsing: input.multiAngleBrowsing,
    ghToolbar: input.ghToolbar,
    defaultParallelDocsRel: input.defaultParallelDocsRel,
    documentedPairsEmbeddedB64,
    parallelDocsStaticBrowseUrl: hubStaticBrowseUrl,
  });

  await buildParallelDocsStatic(staticOpts);
  await writeFile(input.navSearchPath, `${JSON.stringify(navDoc, null, 2)}\n`, "utf8");
  await writeFile(path.join(input.outDir, "serve.json"), SERVE_JSON_FOR_LOCAL_PREVIEW, "utf8");
  return navDoc;
}

/**
 * Builds `_site/index.html` and `parallel-docs-nav-search.json` from `.parallel-docs.toml` `[static_site]`
 * (same behaviour as `scripts/build-static-pages.mjs`).
 */
export async function buildGithubPagesStaticSite(
  opts: BuildGithubPagesStaticSiteOptions,
): Promise<{ outHtml: string; navSearchPath: string }> {
  const repoRoot = path.resolve(opts.repoRoot);
  const toolHomeUrl = opts.toolHomeUrl?.trim() || DEFAULT_TOOL_HOME;
  const pagesBuildCommitSha = opts.pagesBuildCommitSha?.trim();
  const builtAt = new Date();

  const cfg = await loadParallelDocsConfig(repoRoot);
  const ss = cfg.staticSite;

  const sourceAbs = path.join(repoRoot, ss.sourceFile);
  if (!(await pathExists(sourceAbs))) {
    throw new Error(`static_site.source_file not found: ${ss.sourceFile}`);
  }

  const projectIndex = await readIndex(repoRoot);
  const ghNavBase = resolveGithubNavBase(ss);
  const multiAngleBrowsing = await loadMultiAngleBrowsingIfEnabled(
    repoRoot,
    cfg,
    ss,
    projectIndex,
    ghNavBase,
  );
  const fileMarkdown = multiAngleBrowsing ? "" : await readFlatCompanionMarkdown(repoRoot, cfg, ss);
  const parallelDocsBody = pickParallelDocsBody(multiAngleBrowsing, ss.introMarkdown, fileMarkdown);
  const tmpMd = path.join(tmpdir(), `parallel-docs-pages-${process.pid}.md`);
  await writeFile(tmpMd, parallelDocsBody, "utf8");

  const outDir = path.join(repoRoot, "_site");
  const outHtml = path.join(outDir, "index.html");
  const resolvedDefaultParallelDocsRel = resolveParallelDocsMarkdownPath(
    repoRoot,
    ss.sourceFile,
    cfg,
  ).parallelDocsPath;
  const defaultParallelDocsRel = pickDefaultParallelDocsRel(
    multiAngleBrowsing,
    ss.parallelDocsMarkdownFile?.trim() || resolvedDefaultParallelDocsRel,
  );
  const markdownUrlBaseDirAbs = defaultParallelDocsRel
    ? path.join(repoRoot, path.dirname(defaultParallelDocsRel))
    : repoRoot;

  const parallelDocsStorageRootAbs = path.resolve(repoRoot, cfg.storageDir.replaceAll("\\", "/"));
  const companionStaticAssetCopies: ParallelDocsStaticAssetCopy[] = [];
  const parallelDocsOutputUrls = {
    repoRootAbs: repoRoot,
    htmlOutputFileAbs: outHtml,
    markdownUrlBaseDirAbs,
    parallelDocsStorageRootAbs,
    staticSiteOutDirAbs: outDir,
    companionStaticAssetCopies,
    sourceLinkPrefix: staticSourceLinkPrefix(ss, ghNavBase, cfg.render.relativeGithubBlobLinks),
  };

  const blockStretchRows = flatBlockStretchRows(projectIndex, ss, Boolean(multiAngleBrowsing));
  const ghToolbar = sourceAndParallelDocsGithubUrls(ghNavBase, ss, defaultParallelDocsRel);

  const navSearchPath = path.join(outDir, "parallel-docs-nav-search.json");
  const navDoc = await buildParallelDocsNavSearchDocument(
    repoRoot,
    defaultParallelDocsRel
      ? {
          sourcePath: ss.sourceFile,
          parallelDocsPath: defaultParallelDocsRel,
          markdownAbs: path.join(repoRoot, defaultParallelDocsRel),
        }
      : undefined,
    ghNavBase ?? undefined,
    cfg.storageDir,
  );

  try {
    await emitGithubPagesSiteArtifacts({
      repoRoot,
      outDir,
      tmpMd,
      navDoc,
      cfg,
      ss,
      toolHomeUrl,
      builtAt,
      pagesBuildCommitSha: pagesBuildCommitSha || undefined,
      projectIndex,
      ghNavBase,
      parallelDocsOutputUrls,
      blockStretchRows,
      multiAngleBrowsing,
      ghToolbar,
      defaultParallelDocsRel,
      sourceAbs,
      outHtml,
      navSearchPath,
    });
  } finally {
    await unlink(tmpMd).catch(() => {});
  }

  return { outHtml, navSearchPath };
}

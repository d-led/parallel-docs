import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type SideTrackIndex,
  type ResolvedSideTrackConfig,
  type ResolvedStaticSite,
  loadSideTrackConfig,
  readIndex,
  resolveSideTrackMarkdownPath,
  resolveMermaidRuntimePath,
  resolvePathUnderRepoRoot,
  staticBrowseIndexRelPathFromPair,
} from "@sidetrack/core";
import {
  SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT,
  type CodeBrowserMultiAngleBrowsing,
  type SideTrackNavSearchDocument,
  type SideTrackStaticAssetCopy,
  buildSideTrackNavSearchDocument,
} from "@sidetrack/render";

import { type BuildSideTrackStaticOptions, buildSideTrackStatic } from "./build.js";
import {
  blockStretchRowsForDocumentedPair,
  flatBlockStretchRows,
  type GithubNavBase,
  loadMultiAngleBrowsingIfEnabled,
  pickSideTrackBody,
  pickDefaultSideTrackRel,
  readFlatCompanionMarkdown,
  resolveGithubNavBase,
  sourceAndSideTrackGithubUrls,
} from "./github-pages-site-prep.js";
import { pathExists } from "./github-pages-site-shared.js";
import { browsePairStaticBrowseRelUrl } from "./browse-pair-static-url.js";

const DEFAULT_TOOL_HOME = "https://github.com/d-led/sidetrack";

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

function browseSideTrackOutputUrls(input: {
  repoRoot: string;
  outPath: string;
  markdownUrlBaseDirAbs: string;
  cfg: ResolvedSideTrackConfig;
  outDir: string;
  companionStaticAssetCopies: SideTrackStaticAssetCopy[];
  sourceLinkPrefix: string | undefined;
}) {
  return {
    repoRootAbs: input.repoRoot,
    htmlOutputFileAbs: input.outPath,
    markdownUrlBaseDirAbs: input.markdownUrlBaseDirAbs,
    sidetrackStorageRootAbs: path.resolve(
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
  projectIndex: SideTrackIndex | null,
  p: { sourcePath: string; sidetrackPath: string },
): Pick<BuildSideTrackStaticOptions, "blockStretchRows"> | undefined {
  const sourceLower = p.sourcePath.trim().toLowerCase();
  const sourceIsMarkdown =
    sourceLower.endsWith(".md") ||
    sourceLower.endsWith(".mdx") ||
    sourceLower.endsWith(".markdown");
  if (sourceIsMarkdown) return undefined;
  const blockStretchRows = blockStretchRowsForDocumentedPair(
    projectIndex,
    p.sourcePath,
    p.sidetrackPath,
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
    sidetrackPath: string;
    sourceOnGithub?: string;
    sidetrackOnGithub?: string;
    staticBrowseUrl?: string;
  };
  cfg: ResolvedSideTrackConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: SideTrackIndex | null;
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
    "sidetrack-nav-search.json",
  );
  const pairBrowseHubRelUrl = browsePairStaticBrowseRelUrl(p, input.cfg.storageDir);
  const outPath = path.join(input.browseDir, ...canonicalBrowseRelPath.split("/"));
  const sourceAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sourcePath);
  const mdAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sidetrackPath);
  if (!(await pathExists(mdAbs)) || !(await pathExists(sourceAbs))) return;

  const markdownUrlBaseDirAbs = path.dirname(mdAbs);
  const companionStaticAssetCopies: SideTrackStaticAssetCopy[] = [];
  const sidetrackOutputUrls = browseSideTrackOutputUrls({
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
  const sidetrackPathForSearch = pickDefaultSideTrackRel(multiAngleBrowsing, p.sidetrackPath);
  await buildSideTrackStatic({
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
    sidetrackOutputUrls,
    relatedGithubNav: input.ss.relatedGithubNav.length > 0 ? input.ss.relatedGithubNav : undefined,
    staticSearchScope: "sidetrack-and-paths",
    sidetrackPathForSearch,
    ...(multiAngleBrowsing ? { multiAngleBrowsing } : {}),
    ...(browseBlockStretchOpts ?? {}),
    ...(p.sourceOnGithub ? { sourceOnGithubUrl: p.sourceOnGithub } : {}),
    ...(p.sidetrackOnGithub ? { sidetrackOnGithubUrl: p.sidetrackOnGithub } : {}),
    /** Hub-relative `./browse/…` so pair nav matches `sidetrack-nav-search.json` and resolves on project pages. */
    sidetrackStaticBrowseUrl: pairBrowseHubRelUrl,
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
  cfg: ResolvedSideTrackConfig,
  ss: ResolvedStaticSite,
  projectIndex: SideTrackIndex | null,
  ghNavBase: GithubNavBase | null,
  pair: { sourcePath: string; sidetrackPath: string },
): Promise<CodeBrowserMultiAngleBrowsing | undefined> {
  const multiForSource = await loadMultiAngleBrowsingIfEnabled(
    repoRoot,
    cfg,
    { ...ss, sourceFile: pair.sourcePath },
    projectIndex,
    ghNavBase,
  );
  if (!multiForSource) return undefined;
  const angleForPair = multiForSource.angles.find((a) => a.sidetrackPathRel === pair.sidetrackPath);
  return {
    ...multiForSource,
    defaultAngleId: angleForPair?.id ?? multiForSource.defaultAngleId,
  };
}

/**
 * Emits one static code browser HTML per documented pair under `_site/browse/…/index.html` and
 * adds `staticBrowseUrl` on each pair so the hub search can open the same SideTrack UI for other files.
 */
async function writePerPairBrowseHtmlPages(input: {
  repoRoot: string;
  outDir: string;
  navDoc: SideTrackNavSearchDocument;
  cfg: ResolvedSideTrackConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: SideTrackIndex | null;
  ghNavBase: GithubNavBase | null;
}): Promise<SideTrackNavSearchDocument> {
  const pairs = input.navDoc.documentedPairs;
  if (!pairs?.length) return input.navDoc;

  /** Only pairs whose companion + source exist get `staticBrowseUrl`; otherwise nav would link to 404s. */
  const augmented: typeof pairs = [];
  for (const p of pairs) {
    const sourceAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sourcePath);
    const mdAbs = resolvePathUnderRepoRoot(input.repoRoot, p.sidetrackPath);
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
  const navWithUrls: SideTrackNavSearchDocument = { ...input.navDoc, documentedPairs: augmented };
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

function documentedPairsEmbeddedB64FromNav(navDoc: SideTrackNavSearchDocument): string | undefined {
  if (!Array.isArray(navDoc.documentedPairs) || navDoc.documentedPairs.length === 0) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(navDoc.documentedPairs), "utf8").toString("base64");
}

function staticBrowseUrlForConfiguredPair(
  navDoc: SideTrackNavSearchDocument,
  sourceFile: string,
  sidetrackRel: string,
): string | undefined {
  const pairs = navDoc.documentedPairs;
  if (!pairs?.length || sidetrackRel.length === 0) return undefined;
  const hit = pairs.find((p) => p.sourcePath === sourceFile && p.sidetrackPath === sidetrackRel);
  const u = hit?.staticBrowseUrl?.trim();
  return u && u.length > 0 ? u : undefined;
}

function staticRenderOptions(input: {
  repoRoot: string;
  sourceAbs: string;
  tmpMd: string;
  outHtml: string;
  ss: ResolvedStaticSite;
  cfg: ResolvedSideTrackConfig;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  sidetrackOutputUrls: NonNullable<BuildSideTrackStaticOptions["sidetrackOutputUrls"]>;
  blockStretchRows: BuildSideTrackStaticOptions["blockStretchRows"];
  multiAngleBrowsing: CodeBrowserMultiAngleBrowsing | undefined;
  ghToolbar: ReturnType<typeof sourceAndSideTrackGithubUrls>;
  defaultSideTrackRel: string;
  documentedPairsEmbeddedB64: string | undefined;
  sidetrackStaticBrowseUrl?: string;
}): BuildSideTrackStaticOptions {
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
    sidetrackOutputUrls: input.sidetrackOutputUrls,
    relatedGithubNav: input.ss.relatedGithubNav.length > 0 ? input.ss.relatedGithubNav : undefined,
    staticSearchScope: "sidetrack-and-paths",
    sidetrackPathForSearch: input.defaultSideTrackRel,
    ...(input.blockStretchRows ? { blockStretchRows: input.blockStretchRows } : {}),
    ...(input.multiAngleBrowsing ? { multiAngleBrowsing: input.multiAngleBrowsing } : {}),
    ...(input.ghToolbar.sourceOnGithubUrl
      ? { sourceOnGithubUrl: input.ghToolbar.sourceOnGithubUrl }
      : {}),
    ...(input.ghToolbar.sidetrackOnGithubUrl
      ? { sidetrackOnGithubUrl: input.ghToolbar.sidetrackOnGithubUrl }
      : {}),
    ...(input.ghToolbar.documentedNavJsonUrl
      ? { documentedNavJsonUrl: input.ghToolbar.documentedNavJsonUrl }
      : {}),
    ...(input.documentedPairsEmbeddedB64
      ? { documentedPairsEmbeddedB64: input.documentedPairsEmbeddedB64 }
      : {}),
    ...(input.sidetrackStaticBrowseUrl
      ? { sidetrackStaticBrowseUrl: input.sidetrackStaticBrowseUrl }
      : {}),
    builtAt: input.builtAt,
    ...(input.pagesBuildCommitSha ? { pagesBuildCommitSha: input.pagesBuildCommitSha } : {}),
    stretchBufferSync: input.ss.stretchBufferSync,
  };
}

export type BuildGithubPagesStaticSiteOptions = {
  repoRoot: string;
  /** Footer “Rendered with …” link; defaults to the public SideTrack repository. */
  toolHomeUrl?: string;
  /**
   * Git commit SHA for this build (7–40 hex), shown in the footer on every static page.
   * Omit for local builds; CI sets this via `SIDETRACK_PAGES_BUILD_SHA` / workflow env.
   */
  pagesBuildCommitSha?: string;
};

async function emitGithubPagesSiteArtifacts(input: {
  repoRoot: string;
  outDir: string;
  tmpMd: string;
  navDoc: SideTrackNavSearchDocument;
  cfg: ResolvedSideTrackConfig;
  ss: ResolvedStaticSite;
  toolHomeUrl: string;
  builtAt: Date;
  pagesBuildCommitSha: string | undefined;
  projectIndex: SideTrackIndex | null;
  ghNavBase: GithubNavBase | null;
  sidetrackOutputUrls: NonNullable<BuildSideTrackStaticOptions["sidetrackOutputUrls"]>;
  blockStretchRows: BuildSideTrackStaticOptions["blockStretchRows"];
  multiAngleBrowsing: CodeBrowserMultiAngleBrowsing | undefined;
  ghToolbar: ReturnType<typeof sourceAndSideTrackGithubUrls>;
  defaultSideTrackRel: string;
  sourceAbs: string;
  outHtml: string;
  navSearchPath: string;
}): Promise<SideTrackNavSearchDocument> {
  let { navDoc } = input;
  await mkdir(input.outDir, { recursive: true });
  await rm(path.join(input.outDir, SIDETRACK_STATIC_COMPANION_ASSETS_SEGMENT), {
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
    input.defaultSideTrackRel.length > 0
      ? staticBrowseUrlForConfiguredPair(navDoc, input.ss.sourceFile, input.defaultSideTrackRel)
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
    sidetrackOutputUrls: input.sidetrackOutputUrls,
    blockStretchRows: input.blockStretchRows,
    multiAngleBrowsing: input.multiAngleBrowsing,
    ghToolbar: input.ghToolbar,
    defaultSideTrackRel: input.defaultSideTrackRel,
    documentedPairsEmbeddedB64,
    sidetrackStaticBrowseUrl: hubStaticBrowseUrl,
  });

  await buildSideTrackStatic(staticOpts);
  await writeFile(input.navSearchPath, `${JSON.stringify(navDoc, null, 2)}\n`, "utf8");
  await writeFile(path.join(input.outDir, "serve.json"), SERVE_JSON_FOR_LOCAL_PREVIEW, "utf8");
  return navDoc;
}

/**
 * Builds `_site/index.html` and `sidetrack-nav-search.json` from `.sidetrack.toml` `[static_site]`
 * (same behaviour as `scripts/build-static-pages.mjs`).
 */
export async function buildGithubPagesStaticSite(
  opts: BuildGithubPagesStaticSiteOptions,
): Promise<{ outHtml: string; navSearchPath: string }> {
  const repoRoot = path.resolve(opts.repoRoot);
  const toolHomeUrl = opts.toolHomeUrl?.trim() || DEFAULT_TOOL_HOME;
  const pagesBuildCommitSha = opts.pagesBuildCommitSha?.trim();
  const builtAt = new Date();

  const cfg = await loadSideTrackConfig(repoRoot);
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
  const sidetrackBody = pickSideTrackBody(multiAngleBrowsing, ss.introMarkdown, fileMarkdown);
  const tmpMd = path.join(tmpdir(), `sidetrack-pages-${process.pid}.md`);
  await writeFile(tmpMd, sidetrackBody, "utf8");

  const outDir = path.join(repoRoot, "_site");
  const outHtml = path.join(outDir, "index.html");
  const resolvedDefaultSideTrackRel = resolveSideTrackMarkdownPath(
    repoRoot,
    ss.sourceFile,
    cfg,
  ).sidetrackPath;
  const defaultSideTrackRel = pickDefaultSideTrackRel(
    multiAngleBrowsing,
    ss.sidetrackMarkdownFile?.trim() || resolvedDefaultSideTrackRel,
  );
  const markdownUrlBaseDirAbs = defaultSideTrackRel
    ? path.join(repoRoot, path.dirname(defaultSideTrackRel))
    : repoRoot;

  const sidetrackStorageRootAbs = path.resolve(repoRoot, cfg.storageDir.replaceAll("\\", "/"));
  const companionStaticAssetCopies: SideTrackStaticAssetCopy[] = [];
  const sidetrackOutputUrls = {
    repoRootAbs: repoRoot,
    htmlOutputFileAbs: outHtml,
    markdownUrlBaseDirAbs,
    sidetrackStorageRootAbs,
    staticSiteOutDirAbs: outDir,
    companionStaticAssetCopies,
    sourceLinkPrefix: staticSourceLinkPrefix(ss, ghNavBase, cfg.render.relativeGithubBlobLinks),
  };

  const blockStretchRows = flatBlockStretchRows(projectIndex, ss, Boolean(multiAngleBrowsing));
  const ghToolbar = sourceAndSideTrackGithubUrls(ghNavBase, ss, defaultSideTrackRel);

  const navSearchPath = path.join(outDir, "sidetrack-nav-search.json");
  const navDoc = await buildSideTrackNavSearchDocument(
    repoRoot,
    defaultSideTrackRel
      ? {
          sourcePath: ss.sourceFile,
          sidetrackPath: defaultSideTrackRel,
          markdownAbs: path.join(repoRoot, defaultSideTrackRel),
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
      sidetrackOutputUrls,
      blockStretchRows,
      multiAngleBrowsing,
      ghToolbar,
      defaultSideTrackRel,
      sourceAbs,
      outHtml,
      navSearchPath,
    });
  } finally {
    await unlink(tmpMd).catch(() => {});
  }

  return { outHtml, navSearchPath };
}

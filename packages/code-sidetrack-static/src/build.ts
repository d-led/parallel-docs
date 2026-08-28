import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type SideTrackIndex,
  findMonorepoPackagesDir,
  monorepoLayoutStartDir,
} from "@sidetrack/core";
import {
  type CodeBrowserMultiAngleBrowsing,
  type SideTrackOutputUrlOptions,
  type SideTrackStaticAssetCopy,
  type StretchBufferSyncStrategy,
  sidetrackRenderVersion,
  renderCodeBrowserHtml,
} from "@sidetrack/render";

export type BuildSideTrackStaticOptions = {
  /** Absolute or cwd-relative path to the source file whose contents are shown as code. */
  sourceFile: string;
  /** Absolute or cwd-relative path to sidetrack Markdown. */
  markdownFile: string;
  /** Output HTML path (directories created as needed). */
  outHtml: string;
  title?: string;
  /**
   * Repo-relative path displayed prominently in the toolbar so viewers can see at a glance
   * which file they are looking at. Falls back to the source file's basename.
   */
  filePath?: string;
  includeMermaidRuntime?: boolean;
  /** Absolute path to a local Mermaid UMD build, used instead of the vendored one. */
  mermaidRuntimePath?: string;
  /** Highlight.js theme base name (e.g. github, github-dark); forwarded to `renderCodeBrowserHtml`. */
  hljsTheme?: string;
  /** If set, toolbar shows an Octocat link to this repository (`http`/`https` only). Omitted when {@link siteHubUrl} is used for the same slot. */
  githubRepoUrl?: string;
  /** Same-site link to the static hub (`./` on index; under `browse/…` a depth-correct `../../…/index.html`). */
  siteHubUrl?: string;
  /** Footer "Rendered with SideTrack" link plus semver and build time (`http`/`https` only). */
  toolHomeUrl?: string;
  /** When set, rewrites local and GitHub blob links in sidetrack for static HTML output. */
  sidetrackOutputUrls?: SideTrackOutputUrlOptions;
  /** Optional toolbar links to other files on GitHub (forwarded to `renderCodeBrowserHtml`). */
  relatedGithubNav?: { label: string; href: string }[];
  /**
   * `<meta name="generator">` value. When omitted, a default is built from `@sidetrack/render` and
   * this package’s versions. Pass an empty string to omit the meta tag.
   */
  generatorLabel?: string;
  /**
   * Single clock for one static build (footer + default generator `builtAt=`). Defaults to
   * `new Date()` when omitted.
   */
  builtAt?: Date;
  /** Forwarded to `renderCodeBrowserHtml` — narrows in-page search away from raw code lines. */
  staticSearchScope?: "full" | "sidetrack-and-paths";
  /** Repo-relative companion Markdown path (with `staticSearchScope: "sidetrack-and-paths"`). */
  sidetrackPathForSearch?: string;
  /**
   * Passed through to `renderCodeBrowserHtml` (default `"auto"`). Per-pair static browse pages omit
   * this so layout follows the same rules as other renders: stretch when a block-stretch table
   * builds, dual otherwise.
   */
  codeBrowserLayout?: "auto" | "dual";
  /**
   * When markers + index blocks align, `renderCodeBrowserHtml` may emit one scrollable
   * blame-style table (`codeBrowserLayout: "auto"`, default).
   */
  blockStretchRows?: {
    index: SideTrackIndex;
    sourceRelative: string;
    sidetrackPathRel: string;
  };
  /** Stretch layout only; forwarded to `renderCodeBrowserHtml` (default `"table"`). */
  stretchBufferSync?: StretchBufferSyncStrategy;
  /** GitHub blob URL for the primary `filePath` (static hub toolbar). */
  sourceOnGithubUrl?: string;
  /** GitHub blob URL for the companion sidetrack Markdown file. */
  sidetrackOnGithubUrl?: string;
  /** Same-site browse URL for the companion (e.g. `./browse/…/index.html`); overrides GitHub for the Doc icon when set. */
  sidetrackStaticBrowseUrl?: string;
  /** Relative URL to `sidetrack-nav-search.json` for the documented-files tree. */
  documentedNavJsonUrl?: string;
  /** Base64 UTF-8 JSON of `documentedPairs` embedded on `#shell` for offline tree hydration. */
  documentedPairsEmbeddedB64?: string;
  /** When set with two or more angles, renders an Angle switcher (GitHub Pages static hub). */
  multiAngleBrowsing?: CodeBrowserMultiAngleBrowsing;
  /**
   * Optional Git commit for the published static build (7–40 hex); shown in the page footer.
   * Set from CI (e.g. `SIDETRACK_PAGES_BUILD_SHA`); omit locally.
   */
  pagesBuildCommitSha?: string;
};

const staticPackageDir = path.join(
  findMonorepoPackagesDir(monorepoLayoutStartDir(import.meta.url)),
  "code-sidetrack-static",
);

function defaultGeneratorLabel(builtAt: Date): string {
  const raw = readFileSync(path.join(staticPackageDir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { version?: string; name?: string };
  const name = pkg.name ?? "@sidetrack/code-sidetrack-static";
  const sv = pkg.version ?? "0.0.0";
  const iso = builtAt.toISOString();
  return `SideTrack @sidetrack/render@${sidetrackRenderVersion()}; ${name}@${sv}; builtAt=${iso}`;
}

function resolveGeneratorLabel(explicit: string | undefined, builtAt: Date): string | undefined {
  if (explicit !== undefined) {
    const t = explicit.trim();
    return t.length > 0 ? t : undefined;
  }
  return defaultGeneratorLabel(builtAt);
}

async function readSideTrackMarkdownForStaticBuild(
  mdPath: string,
  multi: BuildSideTrackStaticOptions["multiAngleBrowsing"],
): Promise<string> {
  if (!multi || multi.angles.length < 2) {
    return readFile(mdPath, "utf8");
  }
  const pick = multi.angles.find((a) => a.id === multi.defaultAngleId) ?? multi.angles[0];
  return pick?.markdown ?? readFile(mdPath, "utf8");
}

async function copyCompanionStaticMirrors(
  copies: SideTrackStaticAssetCopy[] | undefined,
): Promise<void> {
  if (!copies?.length) return;
  for (const { fromAbs, toAbs } of copies) {
    await mkdir(path.dirname(toAbs), { recursive: true });
    await copyFile(fromAbs, toAbs);
  }
}

export async function buildSideTrackStatic(opts: BuildSideTrackStaticOptions): Promise<void> {
  const sourcePath = path.resolve(opts.sourceFile);
  const mdPath = path.resolve(opts.markdownFile);
  const outPath = path.resolve(opts.outHtml);
  const builtAt = opts.builtAt ?? new Date();

  const code = await readFile(sourcePath, "utf8");
  const sidetrackMarkdown = await readSideTrackMarkdownForStaticBuild(
    mdPath,
    opts.multiAngleBrowsing,
  );
  const ext = path.extname(sourcePath).slice(1) || "txt";
  const language = ext === "ts" ? "ts" : ext === "tsx" ? "tsx" : ext;

  const filePath = opts.filePath ?? path.basename(sourcePath);
  const html = await renderCodeBrowserHtml({
    title: opts.title ?? filePath,
    filePath,
    code,
    language,
    sidetrackMarkdown,
    includeMermaidRuntime: opts.includeMermaidRuntime ?? false,
    mermaidRuntimePath: opts.mermaidRuntimePath,
    hljsTheme: opts.hljsTheme,
    githubRepoUrl: opts.githubRepoUrl,
    siteHubUrl: opts.siteHubUrl,
    toolHomeUrl: opts.toolHomeUrl,
    sidetrackOutputUrls: opts.sidetrackOutputUrls,
    relatedGithubNav: opts.relatedGithubNav,
    generatorLabel: resolveGeneratorLabel(opts.generatorLabel, builtAt),
    builtAt,
    staticSearchScope: opts.staticSearchScope,
    sidetrackPathForSearch: opts.sidetrackPathForSearch,
    ...(opts.codeBrowserLayout ? { codeBrowserLayout: opts.codeBrowserLayout } : {}),
    blockStretchRows: opts.blockStretchRows,
    ...(opts.stretchBufferSync !== undefined ? { stretchBufferSync: opts.stretchBufferSync } : {}),
    sourceOnGithubUrl: opts.sourceOnGithubUrl,
    sidetrackOnGithubUrl: opts.sidetrackOnGithubUrl,
    sidetrackStaticBrowseUrl: opts.sidetrackStaticBrowseUrl,
    documentedNavJsonUrl: opts.documentedNavJsonUrl,
    documentedPairsEmbeddedB64: opts.documentedPairsEmbeddedB64,
    multiAngleBrowsing: opts.multiAngleBrowsing,
    ...(opts.pagesBuildCommitSha ? { pagesBuildCommitSha: opts.pagesBuildCommitSha } : {}),
  });

  await copyCompanionStaticMirrors(opts.sidetrackOutputUrls?.companionStaticAssetCopies);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
}

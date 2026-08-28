import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";

import { assertValidAngleId } from "./angles.js";
import { githubRepoBlobFileUrl, parseGithubRepoWebUrl } from "./github-url.js";
import { parallelDocsMarkdownPathForAngle, normalizeRepoRelativePath } from "./paths.js";

export type ParallelDocsToml = {
  storage?: { dir?: string };
  scm?: { provider?: string };
  render?: {
    mermaid?: boolean;
    /**
     * Absolute or repo-relative path to a local Mermaid runtime build (UMD) used
     * instead of the bundled one. Keeps generated pages free of CDN references.
     */
    mermaid_runtime_path?: string;
    syntaxTheme?: string;
    /**
     * When true, `https://github.com/<owner>/<repo>/blob|tree/<branch>/…` links in parallel-docs
     * Markdown are rewritten to paths relative to the generated HTML file (see
     * `static_site.github_url` for owner/repo). Requires a parseable repository URL.
     */
    relative_github_blob_links?: boolean;
  };
  anchors?: { defaultStrategy?: string[] };
  /**
   * Named **Angles** — multiple parallel-docss per source file (see `docs/spec/storage.md`).
   * Keys use snake_case in TOML (`[angles]`).
   */
  angles?: {
    /** Which Angle is selected by default in tooling and the static viewer (must match a `definitions` id when that list is non-empty). */
    default_angle?: string;
    /** Optional list of known Angles with display titles for UI (static browser, editor). */
    definitions?: { id: string; title?: string }[];
  };
  /**
   * Optional settings for publishing a single-file static “code browser” (GitHub Pages, etc.).
   * Keys use snake_case in TOML (`[static_site]`).
   */
  static_site?: {
    title?: string;
    /** Markdown shown above the optional parallel-docs file and GitHub link. */
    intro?: string;
    github_url?: string;
    /** Optional prefix used for source links when static hosting does not serve repo files. */
    source_link_prefix?: string;
    /** Repo-relative path to the source file shown in the code pane (default README.md). */
    default_source_file?: string;
    /** Repo-relative path to the source file shown in the code pane (default README.md). */
    /** @deprecated Renamed to `default_source_file`. */
    source_file?: string;
    /**
     * Angle id used for the default companion when rendering the static hub's primary pair.
     * This intentionally does not control editor defaults (`[angles].default_angle`).
     */
    default_angle?: string;
    /** Repo-relative path to additional parallel-docs Markdown (optional). */
    parallel_docs_markdown?: string;
    /** Branch name embedded in GitHub blob URLs for `related_github_files` (default `main`). */
    github_blob_branch?: string;
    /**
     * Optional toolbar links on the static code browser: open other repo files on GitHub
     * (single-page Pages deploys cannot serve arbitrary paths next to `index.html`).
     */
    related_github_files?: { label?: string; path: string }[];
    /**
     * Stretch layout only: `"table"` or `"flow-synchronizer"` (client `BufferingFlowSynchronizer`
     * padding on `#shell`). Omitted key uses {@link DEFAULT_STRETCH_BUFFER_SYNC}. Ignored when the
     * page is dual panes.
     */
    stretch_buffer_sync?: string;
  };
};

export type ResolvedGithubNavLink = { label: string; href: string };

/** Stretch-only; forwarded to `renderCodeBrowserHtml` when layout is stretch. */
export type StaticSiteStretchBufferSync = "table" | "flow-synchronizer";

/**
 * Default for `[static_site].stretch_buffer_sync` and for `renderCodeBrowserHtml` when
 * `stretchBufferSync` is omitted. Change this single export to change product default; tests
 * should compare to this constant or pass an explicit strategy instead of hardcoding literals.
 */
export const DEFAULT_STRETCH_BUFFER_SYNC: StaticSiteStretchBufferSync = "flow-synchronizer";

export type ResolvedStaticSite = {
  title: string;
  introMarkdown: string;
  githubUrl: string | null;
  /** Optional source link prefix for published pages (e.g. GitHub blob base or `/src`). */
  sourceLinkPrefix: string | null;
  /** Branch used when building `relatedGithubNav` blob URLs. */
  githubBlobBranch: string;
  sourceFile: string;
  defaultAngleId: string | null;
  parallelDocsMarkdownFile: string;
  /** Toolbar “Also on GitHub …” links for the static code browser. */
  relatedGithubNav: ResolvedGithubNavLink[];
  stretchBufferSync: StaticSiteStretchBufferSync;
};

export type ResolvedAngleDefinition = { id: string; title: string };

export type ResolvedAngles = {
  /** When `definitions` is non-empty, this must match one of them (enforced at merge). */
  defaultAngleId: string | null;
  definitions: ResolvedAngleDefinition[];
};

export type ResolvedParallelDocsConfig = {
  storageDir: string;
  scmProvider: "git";
  render: {
    mermaid: boolean;
    syntaxTheme: string;
    relativeGithubBlobLinks: boolean;
    mermaidRuntimePath: string | null;
  };
  anchors: { defaultStrategy: string[] };
  angles: ResolvedAngles;
  staticSite: ResolvedStaticSite;
};

const defaultStaticSite: ResolvedStaticSite = {
  title: "ParallelDocs",
  introMarkdown: "",
  githubUrl: null,
  sourceLinkPrefix: null,
  githubBlobBranch: "main",
  sourceFile: "README.md",
  defaultAngleId: null,
  parallelDocsMarkdownFile: "",
  relatedGithubNav: [],
  stretchBufferSync: DEFAULT_STRETCH_BUFFER_SYNC,
};

const defaultAngles: ResolvedAngles = { defaultAngleId: null, definitions: [] };

const defaultConfig: ResolvedParallelDocsConfig = {
  storageDir: ".parallel-docs",
  scmProvider: "git",
  render: {
    mermaid: true,
    syntaxTheme: "github-dark",
    relativeGithubBlobLinks: false,
    mermaidRuntimePath: null,
  },
  anchors: { defaultStrategy: ["symbol", "lines"] },
  angles: { ...defaultAngles },
  staticSite: { ...defaultStaticSite },
};

function nonEmptyTrimmed(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/**
 * Resolves a config-relative asset path (e.g. `render.mermaid_runtime_path`) to
 * an absolute path for the render functions to read.
 */
export function resolveMermaidRuntimePath(
  repoRoot: string,
  rel: string | null | undefined,
): string | undefined {
  const trimmed = rel?.trim();
  return trimmed ? path.resolve(repoRoot, trimmed) : undefined;
}

/**
 * Reject `.parallel-docs.toml` path values that would escape the repository
 * root. Trusting raw config strings would let a malicious `.parallel-docs.toml`
 * redirect ParallelDocs's `mkdir`/read operations outside the repo on an
 * otherwise unsuspecting developer machine.
 */
function assertSafeRepoRelativePath(label: string, value: string | undefined): void {
  if (value === undefined || value === "") return;
  try {
    normalizeRepoRelativePath(value);
  } catch {
    throw new Error(
      `.parallel-docs.toml ${label} must be a repository-relative path without ".." segments (got: ${value})`,
    );
  }
}

/**
 * ParallelDocs's storage directory must never live inside `.git/`. Git treats
 * `.git/` as opaque metadata; colocating our storage there would both
 * confuse Git (adding untracked-but-inside-.git files) and risk being wiped
 * by routine Git operations (e.g. `git gc`, `git clean -fdx`, re-clone).
 */
function assertStorageDirNotInsideGit(value: string | undefined): void {
  if (value === undefined || value === "") return;
  const normalized = normalizeRepoRelativePath(value);
  const firstSegment = normalized.split("/")[0] ?? "";
  if (firstSegment.toLowerCase() === ".git") {
    throw new Error(
      `.parallel-docs.toml storage.dir must not live inside .git/ (got: ${value}). ` +
        `Git treats .git/ as opaque metadata and routine operations can wipe it.`,
    );
  }
}

function mergeAngleDefinitions(
  raw: { id: string; title?: string }[] | undefined,
): ResolvedAngleDefinition[] {
  if (!raw?.length) return [];
  const out: ResolvedAngleDefinition[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const id = assertValidAngleId(row.id);
    if (seen.has(id)) {
      throw new Error(`Duplicate angles.definitions id: ${id}`);
    }
    seen.add(id);
    const title = row.title?.trim() || id;
    out.push({ id, title });
  }
  return out;
}

function resolveAngles(parsed: ParallelDocsToml): ResolvedAngles {
  const a = parsed.angles;
  if (!a) {
    return { ...defaultAngles };
  }
  const definitions = mergeAngleDefinitions(a.definitions);
  const defaultRaw = a.default_angle?.trim();
  const defaultAngleId = defaultRaw ? assertValidAngleId(defaultRaw) : null;

  if (
    definitions.length > 0 &&
    defaultAngleId &&
    !definitions.some((d) => d.id === defaultAngleId)
  ) {
    throw new Error(
      `angles.default_angle "${defaultAngleId}" must match one of angles.definitions (got: ${definitions.map((d) => d.id).join(", ")})`,
    );
  }

  return { defaultAngleId, definitions };
}

function mergeRelatedGithubNav(
  githubUrl: string | null,
  branch: string,
  raw: { label?: string; path: string }[] | undefined,
): ResolvedGithubNavLink[] {
  const gh = githubUrl ? parseGithubRepoWebUrl(githubUrl) : null;
  if (!gh || !raw?.length) return [];
  const b = branch.trim() || defaultStaticSite.githubBlobBranch;
  const out: ResolvedGithubNavLink[] = [];
  for (const row of raw) {
    if (!row?.path?.trim()) continue;
    const p = normalizeRepoRelativePath(row.path.trim());
    const label = row.label?.trim() || path.posix.basename(p);
    out.push({
      label,
      href: githubRepoBlobFileUrl(gh.owner, gh.repo, b, p),
    });
  }
  return out;
}

function resolvedStaticSiteSourceFile(ss: ParallelDocsToml["static_site"] | undefined): string {
  return (
    nonEmptyTrimmed(ss?.default_source_file) ??
    nonEmptyTrimmed(ss?.source_file) ??
    defaultStaticSite.sourceFile
  );
}

function resolvedStaticSiteDefaultAngleId(
  ss: ParallelDocsToml["static_site"] | undefined,
): string | null {
  const raw = nonEmptyTrimmed(ss?.default_angle);
  return raw ? assertValidAngleId(raw) : null;
}

function resolvedStaticSiteMarkdownFile(
  ss: ParallelDocsToml["static_site"] | undefined,
  sourceFile: string,
  storageDir: string,
  defaultAngleId: string | null,
): string {
  const explicit = nonEmptyTrimmed(ss?.parallel_docs_markdown) ?? null;
  if (explicit) return explicit;
  if (!defaultAngleId) return defaultStaticSite.parallelDocsMarkdownFile;
  return parallelDocsMarkdownPathForAngle(sourceFile, defaultAngleId, storageDir);
}

function resolveStaticSite(parsed: ParallelDocsToml, storageDir: string): ResolvedStaticSite {
  const ss = parsed.static_site;
  const githubUrl = nonEmptyTrimmed(ss?.github_url);
  const githubBlobBranch =
    nonEmptyTrimmed(ss?.github_blob_branch) ?? defaultStaticSite.githubBlobBranch;
  const sourceFile = resolvedStaticSiteSourceFile(ss);
  const defaultAngleId = resolvedStaticSiteDefaultAngleId(ss);
  return {
    title: nonEmptyTrimmed(ss?.title) ?? defaultStaticSite.title,
    introMarkdown: ss?.intro ?? defaultStaticSite.introMarkdown,
    githubUrl,
    sourceLinkPrefix: nonEmptyTrimmed(ss?.source_link_prefix),
    githubBlobBranch,
    sourceFile,
    defaultAngleId,
    parallelDocsMarkdownFile: resolvedStaticSiteMarkdownFile(
      ss,
      sourceFile,
      storageDir,
      defaultAngleId,
    ),
    relatedGithubNav: mergeRelatedGithubNav(githubUrl, githubBlobBranch, ss?.related_github_files),
    stretchBufferSync: resolvedStretchBufferSync(ss?.stretch_buffer_sync),
  };
}

function resolvedStretchBufferSync(raw: string | undefined): StaticSiteStretchBufferSync {
  const t = raw?.trim();
  if (t === undefined || t === "") return DEFAULT_STRETCH_BUFFER_SYNC;
  if (t === "table" || t === "flow-synchronizer") return t;
  throw new Error(
    `.parallel-docs.toml static_site.stretch_buffer_sync must be "table" or "flow-synchronizer" (got: ${String(raw)})`,
  );
}

function assertValidSourceLinkPrefix(value: string | undefined): void {
  if (!value?.trim()) return;
  const t = value.trim();
  if (t.startsWith("/")) return;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error(
      `.parallel-docs.toml static_site.source_link_prefix must be an absolute path prefix or http(s) URL (got: ${value})`,
    );
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    throw new Error(
      `.parallel-docs.toml static_site.source_link_prefix must be an absolute path prefix or http(s) URL (got: ${value})`,
    );
  }
}

function assertSafeConfigPaths(parsed: ParallelDocsToml): void {
  assertSafeRepoRelativePath("storage.dir", parsed.storage?.dir);
  assertStorageDirNotInsideGit(parsed.storage?.dir);
  const ss = parsed.static_site;
  assertSafeRepoRelativePath("static_site.default_source_file", ss?.default_source_file);
  assertSafeRepoRelativePath("static_site.source_file", ss?.source_file);
  assertSafeRepoRelativePath("static_site.parallel_docs_markdown", ss?.parallel_docs_markdown);
  assertValidSourceLinkPrefix(ss?.source_link_prefix);
  for (let i = 0; i < (ss?.related_github_files?.length ?? 0); i++) {
    assertSafeRepoRelativePath(
      `static_site.related_github_files[${i}].path`,
      ss?.related_github_files?.[i]?.path,
    );
  }
}

function resolveRenderConfig(
  parsed: ParallelDocsToml | null,
): ResolvedParallelDocsConfig["render"] {
  const r = parsed?.render;
  return {
    mermaid: r?.mermaid ?? defaultConfig.render.mermaid,
    syntaxTheme: r?.syntaxTheme ?? defaultConfig.render.syntaxTheme,
    relativeGithubBlobLinks:
      r?.relative_github_blob_links ?? defaultConfig.render.relativeGithubBlobLinks,
    mermaidRuntimePath: nonEmptyTrimmed(r?.mermaid_runtime_path),
  };
}

export function mergeParallelDocsConfig(
  parsed: ParallelDocsToml | null,
): ResolvedParallelDocsConfig {
  if (!parsed) return { ...defaultConfig };
  const scm = parsed.scm?.provider ?? defaultConfig.scmProvider;
  if (scm !== "git") {
    throw new Error(`Unsupported scm.provider: ${String(scm)} (only "git" is implemented)`);
  }
  assertSafeConfigPaths(parsed);
  const storageDir = parsed.storage?.dir ?? defaultConfig.storageDir;
  return {
    storageDir,
    scmProvider: "git",
    render: resolveRenderConfig(parsed),
    anchors: {
      defaultStrategy: parsed.anchors?.defaultStrategy ?? defaultConfig.anchors.defaultStrategy,
    },
    angles: resolveAngles(parsed),
    staticSite: resolveStaticSite(parsed, storageDir),
  };
}

export async function loadParallelDocsConfig(
  repoRoot: string,
): Promise<ResolvedParallelDocsConfig> {
  const configPath = path.join(repoRoot, ".parallel-docs.toml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    if (!raw.trim()) return { ...defaultConfig };
    const parsed = parseToml(raw) as ParallelDocsToml;
    return mergeParallelDocsConfig(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ...defaultConfig };
    throw err;
  }
}

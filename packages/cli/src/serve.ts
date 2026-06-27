import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";

import {
  ensureCompanionForSource,
  isCommentrayProjectInitialized,
  loadCommentrayConfig,
  resolveCommentrayMarkdownPath,
} from "@commentray/core";
import { appendHtmlToOpaqueBrowseRequestUrl } from "@commentray/render";
import handler from "serve-handler";

import { runInitFull } from "./init.js";
import { injectServeDevBuildWatchIntoSite } from "./serve-dev-build-watch.js";
import { startServeRebuildWatcher } from "./serve-rebuild-watcher.js";
import { startLivereloadServer } from "./serve-livereload.js";

export type ServeCliOptions = {
  port: number;
};

const EMPTY_STATE_MARKDOWN_ENV = "COMMENTRAY_EMPTY_STATE_MARKDOWN" as const;
export const SERVE_ROUTE_INIT = "/__commentray/serve/init" as const;
export const SERVE_ROUTE_GENERATE_ENTRY = "/__commentray/serve/generate-entry" as const;

type ServeActionContext = {
  repoRoot: string;
  rebuild: (notifyBrowser?: boolean) => Promise<void>;
};

async function serveEmptyStateMarkdown(port: number, repoRoot: string): Promise<string> {
  const base = `http://127.0.0.1:${String(port)}`;
  try {
    const initialized = await isCommentrayProjectInitialized(repoRoot);
    if (!initialized) {
      return [
        "Use local actions to bootstrap this page:",
        `- [Initialize Commentray in this repository](${base}${SERVE_ROUTE_INIT})`,
      ].join("\n");
    }
    const cfg = await loadCommentrayConfig(repoRoot);
    const explicit = cfg.staticSite.commentrayMarkdownFile?.trim();
    const desiredCommentrayPath =
      explicit && explicit.length > 0
        ? explicit
        : resolveCommentrayMarkdownPath(repoRoot, cfg.staticSite.sourceFile, cfg).commentrayPath;
    const mdAbs = path.resolve(repoRoot, desiredCommentrayPath);
    if (!existsSync(mdAbs)) {
      return [
        "Use local actions to bootstrap this page:",
        `- [Generate commentray for \`${cfg.staticSite.sourceFile}\`](${base}${SERVE_ROUTE_GENERATE_ENTRY})`,
      ].join("\n");
    }
  } catch {
    // config not yet readable — fall through to no CTA
  }
  return "";
}

async function withServeEmptyStateMarkdown<T>(
  markdown: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = process.env[EMPTY_STATE_MARKDOWN_ENV];
  process.env[EMPTY_STATE_MARKDOWN_ENV] = markdown;
  try {
    return await work();
  } finally {
    process.env[EMPTY_STATE_MARKDOWN_ENV] = previous;
  }
}

function pathnameFromReq(req: IncomingMessage): string | undefined {
  const raw = req.url;
  if (typeof raw !== "string") return undefined;
  try {
    return new URL(raw, "http://127.0.0.1").pathname;
  } catch {
    return undefined;
  }
}

function redirectHome(res: ServerResponse): void {
  res.writeHead(303, { Location: "/" });
  res.end();
}

function writePlain(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export async function runServeAction(pathname: string, ctx: ServeActionContext): Promise<void> {
  if (pathname === SERVE_ROUTE_INIT) {
    const code = await runInitFull(ctx.repoRoot);
    if (code !== 0) {
      throw new Error("commentray init reported validation errors; fix them, then retry.");
    }
    process.stderr.write("[commentray serve] initialized repository via serve action\n");
    await ctx.rebuild(true);
    return;
  }

  if (pathname === SERVE_ROUTE_GENERATE_ENTRY) {
    const initCode = await runInitFull(ctx.repoRoot);
    if (initCode !== 0) {
      throw new Error("commentray init reported validation errors; fix them, then retry.");
    }
    const cfg = await loadCommentrayConfig(ctx.repoRoot);
    const generated = await ensureCompanionForSource(ctx.repoRoot, cfg.staticSite.sourceFile, {
      commentrayPath: cfg.staticSite.commentrayMarkdownFile,
    });
    const actionWord = generated.createdMarkdown ? "created" : "already existed";
    const indexWord = generated.createdIndexEntry ? "added" : "already indexed";
    process.stderr.write(
      `[commentray serve] ${actionWord}: ${generated.commentrayPath} (for ${generated.sourcePath}; index ${indexWord})\n`,
    );
    await ctx.rebuild(true);
    return;
  }

  throw new Error(`Unknown serve action route: ${pathname}`);
}

function tryServeActionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServeActionContext,
): boolean {
  const pathname = pathnameFromReq(req);
  if (pathname !== SERVE_ROUTE_INIT && pathname !== SERVE_ROUTE_GENERATE_ENTRY) return false;

  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    writePlain(res, 405, "Method not allowed\n");
    return true;
  }

  void (async () => {
    try {
      await runServeAction(pathname, ctx);
      redirectHome(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[commentray serve] action failed: ${message}\n`);
      if (!res.headersSent) writePlain(res, 500, `${message}\n`);
    }
  })();
  return true;
}

function serveHandlerOptions(siteAbs: string): Parameters<typeof handler>[2] {
  let renderSingle = true;
  const serveJsonPath = path.join(siteAbs, "serve.json");
  if (existsSync(serveJsonPath)) {
    try {
      const extra = JSON.parse(readFileSync(serveJsonPath, "utf8")) as { renderSingle?: boolean };
      if (typeof extra.renderSingle === "boolean") renderSingle = extra.renderSingle;
    } catch {
      /* ignore invalid serve.json */
    }
  }
  return {
    public: siteAbs,
    etag: true,
    cleanUrls: false,
    renderSingle,
    // Same hub entry as GitHub Pages: GET `/` serves `_site/index.html` (not a directory index).
    rewrites: [{ source: "/", destination: "/index.html" }],
    // Local preview only: avoid disk-cache + 304 loops (especially with dev build-id polling after
    // `serve-with-package-watch` restarts the process while the bar URL stays `http://localhost:4173/`).
    headers: [
      {
        source: "**/*.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ],
  };
}

function tryServeDevBuildIdRoute(
  req: IncomingMessage,
  res: ServerResponse,
  buildId: string,
): boolean {
  if (!buildId || req.method !== "GET") return false;
  const raw = req.url;
  if (typeof raw !== "string") return false;
  let pathname: string;
  try {
    pathname = new URL(raw, "http://127.0.0.1").pathname;
  } catch {
    return false;
  }
  if (pathname !== "/__commentray/dev/build-id") return false;
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(buildId);
  return true;
}

function attachStaticSiteHandler(
  siteAbs: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  const opts = serveHandlerOptions(siteAbs);
  return (req: IncomingMessage, res: ServerResponse) => {
    const raw = req.url;
    if (typeof raw === "string" && raw.length > 0) {
      req.url = appendHtmlToOpaqueBrowseRequestUrl(raw);
    }
    // `cleanUrls: true` (serve-handler default) 301-strips trailing `/index` and `.html`, which breaks
    // portable `…/index.html` shims. Keep literal paths like GitHub Pages. `_site/serve.json` supplies
    // `renderSingle` (lone `index.html` in humane browse dirs); see `github-pages-site.ts`.
    void handler(req, res, opts).catch((err: unknown) => {
      process.stderr.write(
        `[commentray serve] request error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  };
}

function listenHttp(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = (err: Error) => {
      server.off("listening", onListen);
      reject(err);
    };
    const onListen = () => {
      server.off("error", onErr);
      resolve();
    };
    server.once("error", onErr);
    server.once("listening", onListen);
    server.listen(port, "0.0.0.0");
  });
}

/**
 * Serves the generated `_site/` tree over HTTP for **local development and CLI dogfooding** only.
 * Production static sites use the same build output (`pages:build` / `buildGithubPagesStaticSite`)
 * but are deployed by your host (for example GitHub Pages), not this Node `serve-handler` loop.
 */
export async function runServeStaticPages(
  repoRootAbs: string,
  opts: ServeCliOptions,
): Promise<void> {
  // Dynamic import: the static-site stack pulls `renderCodeBrowserHtml` and filesystem reads that
  // assume a Commentray **source** checkout. Consumer repos (and the Homebrew/SEA binary) only
  // ship the bundled CLI — load this stack when `serve` actually runs, not for `--help` / `--version`.
  const { buildGithubPagesStaticSite } =
    await import("@commentray/code-commentray-static/github-pages-site");
  const repoRoot = path.resolve(repoRootAbs);
  const siteRel = "_site";
  const siteAbs = path.join(repoRoot, siteRel);
  const livereload = await startLivereloadServer(opts.port + 1);
  const serveDevBuildId = process.env.COMMENTRAY_SERVE_BUILD_ID?.trim() ?? "";

  async function rebuild(notifyBrowser = false): Promise<void> {
    process.stderr.write("[commentray serve] rebuilding…\n");
    const emptyStateMarkdown = await serveEmptyStateMarkdown(opts.port, repoRoot);
    await withServeEmptyStateMarkdown(emptyStateMarkdown, async () => {
      await buildGithubPagesStaticSite({ repoRoot });
    });
    await livereload?.injectIntoSite(siteAbs);
    await injectServeDevBuildWatchIntoSite(siteAbs, serveDevBuildId);
    process.stderr.write("[commentray serve] rebuild finished\n");
    if (notifyBrowser) livereload?.notifyReload();
  }

  await rebuild();

  const httpServer = createServer((req, res) => {
    if (tryServeDevBuildIdRoute(req, res, serveDevBuildId)) return;
    if (tryServeActionRoute(req, res, { repoRoot, rebuild })) return;
    attachStaticSiteHandler(siteAbs)(req, res);
  });
  try {
    await listenHttp(httpServer, opts.port);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[commentray serve] failed to listen on port ${String(opts.port)}: ${msg}\n`,
    );
    throw err;
  }
  process.stderr.write(
    `[commentray serve] HTTP listening on http://127.0.0.1:${String(opts.port)}/ (${siteRel})\n`,
  );

  const rebuildWatcher = await startServeRebuildWatcher(repoRoot, rebuild);

  async function stopHttpServerAsync(): Promise<void> {
    if (!httpServer.listening) return;
    const exitPromise = once(httpServer, "close");
    httpServer.close();
    const killTimer = setTimeout(() => {
      httpServer.closeAllConnections?.();
    }, 8000);
    try {
      await exitPromise;
    } finally {
      clearTimeout(killTimer);
    }
  }

  let exiting = false;
  const exitClean = (): void => {
    if (exiting) return;
    exiting = true;
    void (async () => {
      await rebuildWatcher.close();
      await livereload?.close();
      await stopHttpServerAsync();
      process.exit(0);
    })();
  };

  process.once("SIGINT", exitClean);
  // `serve-with-package-watch.mjs` restarts the CLI via SIGTERM.
  process.once("SIGTERM", exitClean);
}

/**
 * Build the static `_site/` tree without starting an HTTP server.
 * Useful for CI / GitHub Pages workflows that call `commentray pages build`.
 */
export async function runPagesBuild(repoRootAbs: string): Promise<void> {
  const { buildGithubPagesStaticSite } =
    await import("@commentray/code-commentray-static/github-pages-site");
  const repoRoot = path.resolve(repoRootAbs);

  // Ensure the project is initialized before building
  const initialized = await isCommentrayProjectInitialized(repoRoot);
  if (!initialized) {
    const code = await runInitFull(repoRoot);
    if (code !== 0) {
      throw new Error(
        `Failed to initialize Commentray project at ${repoRoot} (exit code: ${String(code)})`,
      );
    }
  }

  const { outHtml, navSearchPath } = await buildGithubPagesStaticSite({ repoRoot });
  process.stderr.write(`Wrote ${outHtml}\n`);
  process.stderr.write(`Wrote ${navSearchPath}\n`);
}

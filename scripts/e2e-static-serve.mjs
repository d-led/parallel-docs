#!/usr/bin/env node
/**
 * Serves prebuilt `_site` for Cypress E2E (see `package.json` `e2e:server`).
 *
 * Uses the same `serve-handler` wiring as `parallel-docs serve` (`packages/cli/src/serve.ts`):
 * `serve.json` `renderSingle`, `/` → `index.html`, and opaque `/browse/…` URL normalization.
 * That matches `npm run serve` and GitHub Pages without the external Vercel **`serve`** CLI
 * (it is not a workspace dependency and was never required for local dev).
 *
 * Default port **14173** — override with **`PARALLEL_DOCS_E2E_PORT`** so it does not collide with
 * **`parallel-docs serve`** on **4173**.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import handler from "serve-handler";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteAbs = path.join(repoRoot, "_site");
const port = Number.parseInt((process.env.PARALLEL_DOCS_E2E_PORT ?? "14173").trim(), 10);

if (!Number.isFinite(port) || port < 1 || port > 65535) {
  process.stderr.write("e2e-static-serve: PARALLEL_DOCS_E2E_PORT must be 1–65535\n");
  process.exit(1);
}

const { appendHtmlToOpaqueBrowseRequestUrl } = await import(
  new URL("../packages/render/dist/index.js", import.meta.url).href
);

function serveHandlerOptions() {
  let renderSingle = true;
  const serveJsonPath = path.join(siteAbs, "serve.json");
  if (existsSync(serveJsonPath)) {
    try {
      const extra = JSON.parse(readFileSync(serveJsonPath, "utf8"));
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
    rewrites: [{ source: "/", destination: "/index.html" }],
  };
}

const opts = serveHandlerOptions();

const server = createServer((req, res) => {
  const raw = req.url;
  if (typeof raw === "string" && raw.length > 0) {
    req.url = appendHtmlToOpaqueBrowseRequestUrl(raw);
  }
  void handler(req, res, opts).catch((err) => {
    process.stderr.write(
      `[e2e-static-serve] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
});

server.on("error", (err) => {
  process.stderr.write(
    `[e2e-static-serve] listen failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  process.stderr.write(`[e2e-static-serve] http://127.0.0.1:${String(port)}/ (_site)\n`);
});

import { readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type { Writable } from "node:stream";

const EVENT_PATH = "/__sidetrack_livereload/events";
const SCRIPT_MARKER = "sidetrack-livereload";

export function livereloadScript(port: number): string {
  return `<script data-${SCRIPT_MARKER}>
(() => {
  try {
    const u0 = new URL(window.location.href);
    if (u0.searchParams.has("_sidetrack_bust")) {
      u0.searchParams.delete("_sidetrack_bust");
      const q = u0.searchParams.toString();
      history.replaceState(null, "", u0.pathname + (q ? "?" + q : "") + u0.hash);
    }
  } catch (_) {}
  const host = window.location.hostname || "127.0.0.1";
  const events = new EventSource("http://" + host + ":${port}${EVENT_PATH}");
  events.addEventListener("reload", () => location.reload());
})();
</script>`;
}

export function injectLivereloadScript(html: string, port: number): string {
  if (html.includes(`data-${SCRIPT_MARKER}`)) return html;

  const script = livereloadScript(port);
  const bodyClose = /<\/body>/i;
  if (bodyClose.test(html)) {
    return html.replace(bodyClose, `${script}\n</body>`);
  }
  return `${html}\n${script}\n`;
}

export async function injectLivereloadIntoSite(siteRoot: string, port: number): Promise<void> {
  await injectLivereloadIntoDir(siteRoot, port);
}

async function injectLivereloadIntoDir(dir: string, port: number): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await injectLivereloadIntoDir(entryPath, port);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html")) return;

      const html = await readFile(entryPath, "utf8");
      const nextHtml = injectLivereloadScript(html, port);
      if (nextHtml !== html) await writeFile(entryPath, nextHtml, "utf8");
    }),
  );
}

export type LivereloadServer = {
  port: number;
  injectIntoSite(siteRoot: string): Promise<void>;
  notifyReload(): void;
  close(): Promise<void>;
};

export async function startLivereloadServer(
  preferredPort: number,
  stderr: Writable = process.stderr,
): Promise<LivereloadServer | undefined> {
  const clients = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    if (req.url !== EVENT_PATH) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
  });

  const port = await listen(server, preferredPort).catch(async (err: unknown) => {
    if (isAddressInUse(err)) return listen(server, 0);
    throw err;
  });

  if (port === undefined) {
    stderr.write("[sidetrack serve] browser livereload disabled: could not bind listener\n");
    return undefined;
  }

  stderr.write(`[sidetrack serve] browser livereload listening on ${port}\n`);
  return {
    port,
    injectIntoSite: (siteRoot: string) => injectLivereloadIntoSite(siteRoot, port),
    notifyReload: () => {
      const payload = `event: reload\ndata: ${Date.now()}\n\n`;
      for (const client of clients) client.write(payload);
    },
    close: () =>
      new Promise((resolve) => {
        for (const client of clients) client.end();
        server.close(() => resolve());
      }),
  };
}

function isAddressInUse(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "EADDRINUSE";
}

function listen(server: Server, port: number): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error & { code?: string }): void => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : undefined);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SCRIPT_MARKER = "parallel-docs-serve-watch";

/** Injected when `PARALLEL_DOCS_SERVE_BUILD_ID` is set (repo `serve-with-package-watch` dev loop only; never part of shipped static hosting). */
export function injectServeDevBuildWatch(html: string, buildId: string): string {
  if (!buildId) return html;
  const script = serveDevBuildWatchScript(buildId);
  const markerRe = new RegExp(
    `<script data-${SCRIPT_MARKER}>` + String.raw`[\s\S]*?` + `</script>`,
    "i",
  );
  if (markerRe.test(html)) return html.replace(markerRe, script);
  const bodyClose = /<\/body>/i;
  if (bodyClose.test(html)) return html.replace(bodyClose, `${script}\n</body>`);
  return `${html}\n${script}\n`;
}

function serveDevBuildWatchScript(buildId: string): string {
  return `<script data-${SCRIPT_MARKER}>
(() => {
  try {
    const u0 = new URL(window.location.href);
    if (u0.searchParams.has("_parallel_docs_bust")) {
      u0.searchParams.delete("_parallel_docs_bust");
      const q = u0.searchParams.toString();
      history.replaceState(null, "", u0.pathname + (q ? "?" + q : "") + u0.hash);
    }
  } catch (_) {}
  const expect = "${buildId}";
  console.log("[parallelDocs:dev-watch] poll-init", { buildId: expect });
  setInterval(async () => {
    try {
      const r = await fetch("/__parallel_docs/dev/build-id", { cache: "no-store" });
      if (!r.ok) return;
      const cur = (await r.text()).trim();
      if (cur.length > 0 && cur !== expect && !cur.startsWith("<")) {
        console.log("[parallelDocs:dev-watch] reload", { from: expect, to: cur });
        location.reload();
      }
    } catch (err) {
      console.log("[parallelDocs:dev-watch] poll-error", { msg: String(err) });
    }
  }, 600);
})();
</script>`;
}

export async function injectServeDevBuildWatchIntoSite(
  siteRoot: string,
  buildId: string,
): Promise<void> {
  if (!buildId) return;
  await injectIntoDir(siteRoot, buildId);
}

async function injectIntoDir(dir: string, buildId: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await injectIntoDir(entryPath, buildId);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html")) return;
      const html = await readFile(entryPath, "utf8");
      const next = injectServeDevBuildWatch(html, buildId);
      if (next !== html) await writeFile(entryPath, next, "utf8");
    }),
  );
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Injects a locally vendored, self-contained Mermaid build (no CDN) into
 * generated pages. The UMD bundle defines `globalThis.mermaid`; the small
 * bootstrap below initializes it and renders diagrams, dispatching the events
 * the static code browser listens for (see `parallel-docs-mermaid-events.ts`).
 */

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));

const BOOTSTRAP_JS = `(function () {
  var mermaid = globalThis.mermaid;
  if (!mermaid) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: "antiscript" });
  globalThis.parallelDocsMermaid = mermaid;
  try {
    globalThis.dispatchEvent(new CustomEvent("parallel-docs-mermaid-module-ready"));
  } catch (_) {}
  var shell = document.getElementById("shell");
  var layout = shell && shell.getAttribute("data-layout");
  var skipInitial =
    globalThis.matchMedia("(max-width:767px)").matches &&
    shell &&
    shell.getAttribute("data-dual-mobile-pane") === "code" &&
    (layout === "dual" || layout === "stretch");
  if (!skipInitial) {
    void mermaid
      .run({ querySelector: "#doc-pane-body pre.mermaid, .stretch-doc-inner pre.mermaid" })
      .then(function () {
        try {
          globalThis.dispatchEvent(new CustomEvent("parallel-docs-mermaid-done"));
        } catch (_) {}
      })
      .catch(function (err) {
        console.error("ParallelDocs: mermaid.run failed", err);
      });
  }
})();`;

export function mermaidRuntimeScriptHtml(
  include: boolean | undefined,
  mermaidScriptPath?: string | null,
): string {
  if (!include) return "";
  const umd = mermaidScriptPath ? loadMermaidFromPath(mermaidScriptPath) : loadVendoredMermaidUmd();
  // Guard against a literal `</script>` in the bundled build breaking the HTML.
  return (
    `<script>${umd.replace(/<\/script/gi, "<\\/script")}</script>\n` +
    `<script>${BOOTSTRAP_JS}</script>`
  );
}

const cachedMermaidByPath = new Map<string, string>();

function loadMermaidFromPath(absPath: string): string {
  const cached = cachedMermaidByPath.get(absPath);
  if (cached !== undefined) return cached;
  if (!existsSync(absPath)) {
    throw new Error(`Mermaid runtime not found at ${absPath} (check render.mermaid_runtime_path).`);
  }
  const source = readFileSync(absPath, "utf8");
  cachedMermaidByPath.set(absPath, source);
  return source;
}

let cachedMermaidUmd: string | undefined;

function loadVendoredMermaidUmd(): string {
  if (cachedMermaidUmd === undefined) {
    const candidates = [
      join(MODULE_DIR, "mermaid.min.js"),
      join(MODULE_DIR, "..", "dist", "mermaid.min.js"),
      join(MODULE_DIR, "..", "src", "mermaid.min.js"),
    ];
    for (const file of candidates) {
      if (existsSync(file)) {
        cachedMermaidUmd = readFileSync(file, "utf8");
        break;
      }
    }
    if (cachedMermaidUmd === undefined) {
      throw new Error(
        "Missing vendored mermaid.min.js; run `npm run build -w @parallel-docs/render`.",
      );
    }
  }
  return cachedMermaidUmd;
}

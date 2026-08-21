import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const assets = [
  {
    from: join(here, "src", "code-browser-intro.css"),
    to: join(here, "dist", "code-browser-intro.css"),
  },
  {
    from: join(here, "src", "code-browser-shell.css"),
    to: join(here, "dist", "code-browser-shell.css"),
  },
  {
    from: join(here, "src", "code-browser-nav-rail-doc-hub.html"),
    to: join(here, "dist", "code-browser-nav-rail-doc-hub.html"),
  },
];

for (const { from, to } of assets) {
  cpSync(from, to);
}

// Vendored Highlight.js theme CSS is inlined into generated pages (no CDN).
cpSync(join(here, "src", "hljs-themes"), join(here, "dist", "hljs-themes"), {
  recursive: true,
});

// Self-contained Mermaid UMD bundle, vendored from node_modules (no CDN).
cpSync(require.resolve("mermaid/dist/mermaid.min.js"), join(here, "dist", "mermaid.min.js"));

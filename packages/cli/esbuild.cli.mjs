import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bundles the already-compiled CLI (`dist/cli.js` from tsc) and every workspace
// dependency it reaches (at runtime) into a single CommonJS file that Node SEA
// can embed. CJS is the robust target for SEA because it sidesteps
// `import.meta.url` and top-level `await` edge cases inside the virtual FS.

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(pkgRoot, "dist");
mkdirSync(distDir, { recursive: true });

const entry = join(distDir, "cli.js");
const outfile = join(distDir, "cli.bundle.cjs");

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node20"],
  outfile,
  legalComments: "none",
  logLevel: "info",
  // The `@parallel-docs/render` barrel re-exports `code-browser.ts`, which uses
  // `import.meta.url`. The CLI never reaches that code path and esbuild
  // tree-shakes it out, but the static scan still emits a warning.
  logOverride: {
    "empty-import-meta": "silent",
  },
});

console.error(`wrote ${outfile}`);

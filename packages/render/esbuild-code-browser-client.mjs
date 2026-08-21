import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const outDir = join(pkgRoot, "dist");
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, "code-browser-client.bundle.js");

await esbuild.build({
  entryPoints: [join(pkgRoot, "src", "code-browser-client.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  minify: false,
  legalComments: "none",
  outfile,
});

console.error("wrote", outfile);

import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bundle the extension and its workspace dependency (`@parallel-docs/core`) into a
// single CommonJS file so the resulting .vsix is self-contained. VS Code loads
// `main` from the packaged extension via CJS `require`, so we overwrite the
// tsc-emitted `dist/extension.js` with the bundled version at package time.
// `vscode` is always provided by the host and must stay external.

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(pkgRoot, "dist");
mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(pkgRoot, "src", "extension.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node20"],
  external: ["vscode"],
  outfile: join(distDir, "extension.js"),
  minify: false,
  keepNames: true,
  legalComments: "eof",
  logLevel: "info",
});

console.error(`wrote ${join(distDir, "extension.js")}`);

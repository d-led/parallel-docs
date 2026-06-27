import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bundle the MCP server stdio entry point into a self-contained CJS script
// with a shebang, so users can point MCP clients at dist/mcp-server.js.
// All dependencies (@commentray/core, @commentray/mcp-server,
// @modelcontextprotocol/sdk, zod) are bundled inline.

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(pkgRoot, "dist");
mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(pkgRoot, "src", "mcp-server-entry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node20"],
  external: [],
  outfile: join(distDir, "mcp-server.js"),
  banner: {
    js: "#!/usr/bin/env node",
  },
  minify: false,
  keepNames: true,
  legalComments: "none",
  logLevel: "error",
});

console.error(`wrote ${join(distDir, "mcp-server.js")}`);

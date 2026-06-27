/**
 * Bundled MCP server entry point for the Commentray VS Code extension.
 *
 * This is bundled by esbuild.mcp-server.mjs into dist/mcp-server.js and
 * shipped inside the extension. Users configure MCP clients to point at
 * this script (absolute path to the installed extension).
 *
 * For a repo-local, portable alternative, use `commentray mcp install`
 * or `commentray mcp serve` from the CLI.
 */

import { createMcpServer, repoRootFrom } from "@commentray/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main(): Promise<void> {
  const repoRoot = await repoRootFrom(process.cwd());
  const server = createMcpServer(repoRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("commentray-mcp: fatal error during startup:", err);
  process.exit(1);
});

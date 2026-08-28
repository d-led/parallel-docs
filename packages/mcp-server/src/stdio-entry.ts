#!/usr/bin/env node
/**
 * MCP server entry point — stdio transport.
 *
 * Connect an MCP client (Claude Desktop, VS Code Copilot, etc.) by configuring
 * it to run this script with the SideTrack project root as the working directory.
 *
 * Usage:
 *   node dist/stdio-entry.js          (from within a SideTrack project)
 *   sidetrack mcp serve              (CLI wrapper)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server.js";
import { repoRootFrom } from "./repo-root.js";

async function main(): Promise<void> {
  const repoRoot = await repoRootFrom(process.cwd());
  const server = createMcpServer(repoRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("sidetrack-mcp: fatal error during startup:", err);
  process.exit(1);
});

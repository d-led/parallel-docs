import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_TOOLS, type McpToolDef } from "./mcp-tools.js";
import serverPackage from "../package.json" with { type: "json" };

/**
 * Create a configured MCP server with all ParallelDocs tools registered.
 * @param repoRoot Absolute path to the ParallelDocs project root
 */
export function createMcpServer(repoRoot: string): McpServer {
  const server = new McpServer({
    name: "parallel-docs-mcp",
    version: serverPackage.version,
  });

  for (const tool of ALL_TOOLS) {
    registerTool(server, tool, repoRoot);
  }

  return server;
}

function registerTool(server: McpServer, tool: McpToolDef, repoRoot: string): void {
  // The MCP SDK infers args type from the schema; we pass through to our handler.
  server.tool(tool.name, tool.description, tool.schema, async (args) => {
    return tool.handler(repoRoot, args as Record<string, unknown>);
  });
}

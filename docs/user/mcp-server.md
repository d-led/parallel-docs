# ParallelDocs MCP Server

The ParallelDocs MCP (Model Context Protocol) server lets AI coding assistants (Claude, VS Code Copilot, Antigravity, OpenCode, etc.) work with your ParallelDocs project — validating, discovering, reading, and writing parallel-docs.

## Quick Start

### Option 1: `parallel-docs mcp install` (recommended)

Run this from your repo root. It writes portable, commit-safe MCP config files:

```bash
parallel-docs mcp install
```

This creates/updates:

| File                    | For                      |
| ----------------------- | ------------------------ |
| `.vscode/mcp.json`      | VS Code Copilot          |
| `.claude/mcp.json`      | Claude Code / Claude IDE |
| `.antigravity/mcp.json` | Antigravity              |
| `.opencode/mcp.json`    | OpenCode                 |

All configs use `parallel-docs mcp serve` as the command — no absolute paths, safe to commit.

Preview without writing:

```bash
parallel-docs mcp install --dry-run
```

### Option 2: VS Code Extension

Open the Command Palette (`Cmd+Shift+P`) and run **ParallelDocs: Configure MCP server for AI coding assistants…**. This shows the JSON config for the extension's bundled MCP server.

### Option 3: Manual config

Add this to your MCP client config (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "parallel-docs": {
      "command": "parallel-docs",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Available Tools (16)

### Read & Discover

| Tool                               | Description                                     |
| ---------------------------------- | ----------------------------------------------- |
| `parallel_docs_list_pairs`         | List all source→parallel-docs pairs             |
| `parallel_docs_read_parallel_docs` | Read parallel-docs Markdown for a source file   |
| `parallel_docs_read_source`        | Read source file content                        |
| `parallel_docs_list_orphans`       | List orphan companions (no matching source)     |
| `parallel_docs_find_uncommented`   | Find tracked source files without parallel-docs |
| `parallel_docs_get_index`          | Dump full index as JSON                         |

### Validate & Maintain

| Tool                     | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `parallel_docs_validate` | Validate project metadata and configuration            |
| `parallel_docs_doctor`   | Validate + environment checks, optional orphan cleanup |
| `parallel_docs_migrate`  | Migrate index.json to current schema                   |
| `parallel_docs_paths`    | Resolve companion path for a source file               |

### Write & Transform

| Tool                                   | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `parallel_docs_init`                   | Initialize ParallelDocs in the workspace    |
| `parallel_docs_angles_add`             | Register a new angle                        |
| `parallel_docs_migrate_angles`         | Convert flat companions to Angles layout    |
| `parallel_docs_sync_moved_paths`       | Sync index with Git-renamed files           |
| `parallel_docs_convert_source_markers` | Convert marker delimiters to language style |
| `parallel_docs_render`                 | Render side-by-side HTML page               |

## Example AI Workflow

1. **Discover**: "Use parallel_docs_list_pairs to see what files have parallel-docs"
2. **Find gaps**: "Use parallel_docs_find_uncommented to find files without docs"
3. **Read**: "Use parallel_docs_read_source to read `src/auth.ts`, then write parallel-docs for it"
4. **Read existing**: "Use parallel_docs_read_parallel_docs to read the architecture parallel-docs"
5. **Clean up**: "Use parallel_docs_list_orphans to find stale parallel-docs, then parallel_docs_doctor with allowDeletions=true"

## Troubleshooting

**"No index found"**: Run `parallel_docs_init` first (or `parallel-docs init` from CLI).

**"parallelDocs: command not found"**: Install the CLI: `npm install -g parallel-docs`. Or use the VS Code extension's bundled MCP server.

**Config not detected**: Open the MCP panel (`MCP: List Servers` in the palette) and restart the ParallelDocs server. No full window reload needed.

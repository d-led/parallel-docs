# Commentray MCP Server

The Commentray MCP (Model Context Protocol) server lets AI coding assistants (Claude, VS Code Copilot, Antigravity, OpenCode, etc.) work with your Commentray project — validating, discovering, reading, and writing commentary.

## Quick Start

### Option 1: `commentray mcp install` (recommended)

Run this from your repo root. It writes portable, commit-safe MCP config files:

```bash
commentray mcp install
```

This creates/updates:

| File                    | For                      |
| ----------------------- | ------------------------ |
| `.vscode/mcp.json`      | VS Code Copilot          |
| `.claude/mcp.json`      | Claude Code / Claude IDE |
| `.antigravity/mcp.json` | Antigravity              |
| `.opencode/mcp.json`    | OpenCode                 |

All configs use `commentray mcp serve` as the command — no absolute paths, safe to commit.

Preview without writing:

```bash
commentray mcp install --dry-run
```

### Option 2: VS Code Extension

Open the Command Palette (`Cmd+Shift+P`) and run **Commentray: Configure MCP server for AI coding assistants…**. This shows the JSON config for the extension's bundled MCP server.

### Option 3: Manual config

Add this to your MCP client config (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "commentray": {
      "command": "commentray",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Available Tools (16)

### Read & Discover

| Tool                          | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `commentray_list_pairs`       | List all source→commentary pairs             |
| `commentray_read_commentray`  | Read commentary Markdown for a source file   |
| `commentray_read_source`      | Read source file content                     |
| `commentray_list_orphans`     | List orphan companions (no matching source)  |
| `commentray_find_uncommented` | Find tracked source files without commentary |
| `commentray_get_index`        | Dump full index as JSON                      |

### Validate & Maintain

| Tool                  | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `commentray_validate` | Validate project metadata and configuration            |
| `commentray_doctor`   | Validate + environment checks, optional orphan cleanup |
| `commentray_migrate`  | Migrate index.json to current schema                   |
| `commentray_paths`    | Resolve companion path for a source file               |

### Write & Transform

| Tool                                | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `commentray_init`                   | Initialize Commentray in the workspace      |
| `commentray_angles_add`             | Register a new angle                        |
| `commentray_migrate_angles`         | Convert flat companions to Angles layout    |
| `commentray_sync_moved_paths`       | Sync index with Git-renamed files           |
| `commentray_convert_source_markers` | Convert marker delimiters to language style |
| `commentray_render`                 | Render side-by-side HTML page               |

## Example AI Workflow

1. **Discover**: "Use commentray_list_pairs to see what files have commentary"
2. **Find gaps**: "Use commentray_find_uncommented to find files without docs"
3. **Read**: "Use commentray_read_source to read `src/auth.ts`, then write commentary for it"
4. **Read existing**: "Use commentray_read_commentray to read the architecture commentary"
5. **Clean up**: "Use commentray_list_orphans to find stale commentary, then commentray_doctor with allowDeletions=true"

## Troubleshooting

**"No index found"**: Run `commentray_init` first (or `commentray init` from CLI).

**"commentray: command not found"**: Install the CLI: `npm install -g commentray`. Or use the VS Code extension's bundled MCP server.

**Config not detected**: After running `commentray mcp install`, reload your AI editor window.

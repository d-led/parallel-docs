# SideTrack MCP Server

The SideTrack MCP (Model Context Protocol) server lets AI coding assistants (Claude, VS Code Copilot, Antigravity, OpenCode, etc.) work with your SideTrack project — validating, discovering, reading, and writing sidetrack.

## Quick Start

### Option 1: `sidetrack mcp install` (recommended)

Run this from your repo root. It writes portable, commit-safe MCP config files:

```bash
sidetrack mcp install
```

This creates/updates:

| File                    | For                      |
| ----------------------- | ------------------------ |
| `.vscode/mcp.json`      | VS Code Copilot          |
| `.claude/mcp.json`      | Claude Code / Claude IDE |
| `.antigravity/mcp.json` | Antigravity              |
| `.opencode/mcp.json`    | OpenCode                 |

All configs use `sidetrack mcp serve` as the command — no absolute paths, safe to commit.

Preview without writing:

```bash
sidetrack mcp install --dry-run
```

### Option 2: VS Code Extension

Open the Command Palette (`Cmd+Shift+P`) and run **SideTrack: Configure MCP server for AI coding assistants…**. This shows the JSON config for the extension's bundled MCP server.

### Option 3: Manual config

Add this to your MCP client config (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "sidetrack": {
      "command": "sidetrack",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Available Tools (16)

### Read & Discover

| Tool                         | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `sidetrack_list_pairs`       | List all source→sidetrack pairs             |
| `sidetrack_read_sidetrack`   | Read sidetrack Markdown for a source file   |
| `sidetrack_read_source`      | Read source file content                    |
| `sidetrack_list_orphans`     | List orphan companions (no matching source) |
| `sidetrack_find_uncommented` | Find tracked source files without sidetrack |
| `sidetrack_get_index`        | Dump full index as JSON                     |

### Validate & Maintain

| Tool                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `sidetrack_validate` | Validate project metadata and configuration            |
| `sidetrack_doctor`   | Validate + environment checks, optional orphan cleanup |
| `sidetrack_migrate`  | Migrate index.json to current schema                   |
| `sidetrack_paths`    | Resolve companion path for a source file               |

### Write & Transform

| Tool                               | Description                                 |
| ---------------------------------- | ------------------------------------------- |
| `sidetrack_init`                   | Initialize SideTrack in the workspace       |
| `sidetrack_angles_add`             | Register a new angle                        |
| `sidetrack_migrate_angles`         | Convert flat companions to Angles layout    |
| `sidetrack_sync_moved_paths`       | Sync index with Git-renamed files           |
| `sidetrack_convert_source_markers` | Convert marker delimiters to language style |
| `sidetrack_render`                 | Render side-by-side HTML page               |

## Example AI Workflow

1. **Discover**: "Use sidetrack_list_pairs to see what files have sidetrack"
2. **Find gaps**: "Use sidetrack_find_uncommented to find files without docs"
3. **Read**: "Use sidetrack_read_source to read `src/auth.ts`, then write sidetrack for it"
4. **Read existing**: "Use sidetrack_read_sidetrack to read the architecture sidetrack"
5. **Clean up**: "Use sidetrack_list_orphans to find stale sidetrack, then sidetrack_doctor with allowDeletions=true"

## Troubleshooting

**"No index found"**: Run `sidetrack_init` first (or `sidetrack init` from CLI).

**"sidetrack: command not found"**: Install the CLI: `npm install -g sidetrack`. Or use the VS Code extension's bundled MCP server.

**Config not detected**: Open the MCP panel (`MCP: List Servers` in the palette) and restart the SideTrack server. No full window reload needed.

# Changelog

## [0.4.0] — 2026-06-27

### Added

- **MCP server** (`packages/mcp-server/`) — 16 tools for AI coding assistants:
  - `commentray_init`, `commentray_validate`, `commentray_paths`, `commentray_render`, `commentray_doctor`, `commentray_migrate`, `commentray_migrate_angles`, `commentray_angles_add`, `commentray_sync_moved_paths`, `commentray_convert_source_markers`
  - `commentray_list_pairs`, `commentray_read_commentray`, `commentray_read_source`, `commentray_list_orphans`, `commentray_find_uncommented`, `commentray_get_index`
- **CLI**: `commentray mcp serve` (start MCP server) and `commentray mcp install` (write repo-local configs for VS Code, Claude, Antigravity, OpenCode)
- **VS Code**: `commentray.configureMcpServer` command + bundled `dist/mcp-server.js`
- **Scripts**: `scripts/install-plugin-here.sh` — install extension into running IDE
- **Docs**: `docs/user/mcp-server.md` — MCP setup and tool reference

### Changed

- Build order: `mcp-server` built after `code-commentray-static`, before `cli` and `vscode`
- Publish workflow: `@commentray/mcp-server` added to `PUBLIC_WORKSPACES`
- Workspace sync: `@commentray/mcp-server` added to `WORKSPACE_NAMES`

## [0.3.6] — prior

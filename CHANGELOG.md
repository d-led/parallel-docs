# Changelog

## [1.0.0] — 2026-08-28

### Breaking

- **Rebrand**: the project is renamed from Commentray to **SideTrack**.
  - VS Code extension ID: `d-led.commentray-vscode` → `d-led.sidetrack-vscode` (new Marketplace listing)
  - npm packages: `@commentray/*` → `@sidetrack/*`, CLI binary `commentray` → `sidetrack`
  - Storage directory `.commentray/` → `.sidetrack/`, config file `.commentray.toml` → `.sidetrack.toml`
  - Command IDs, configuration namespace, MCP tool names, and Markdown markers now use `sidetrack`
- Legacy on-disk index fields (`commentrayPath`, `commentaryPath`) are still read and migrated so existing workspaces keep working.

### Added

- New SideTrack icon and favicon — two documents linked by a gutter connector.
- Automated third-party license notice generation (`npm run license:notices` → `packages/vscode/ThirdPartyNotices.txt`).

### Changed

- **Marketplace trust & security fixes**: the MCP HTTP server now binds to localhost only; the VS Code webview no longer loads external CDN assets; the bundled extension is unminified; third-party license comments are preserved in bundles.

## [0.4.0] — 2026-06-27

### Added

- **MCP server** (`packages/mcp-server/`) — 16 tools for AI coding assistants:
  - `sidetrack_init`, `sidetrack_validate`, `sidetrack_paths`, `sidetrack_render`, `sidetrack_doctor`, `sidetrack_migrate`, `sidetrack_migrate_angles`, `sidetrack_angles_add`, `sidetrack_sync_moved_paths`, `sidetrack_convert_source_markers`
  - `sidetrack_list_pairs`, `sidetrack_read_sidetrack`, `sidetrack_read_source`, `sidetrack_list_orphans`, `sidetrack_find_uncommented`, `sidetrack_get_index`
- **CLI**: `sidetrack mcp serve` (start MCP server) and `sidetrack mcp install` (write repo-local configs for VS Code, Claude, Antigravity, OpenCode)
- **VS Code**: `sidetrack.configureMcpServer` command + bundled `dist/mcp-server.js`
- **Scripts**: `scripts/install-plugin-here.sh` — install extension into running IDE
- **Docs**: `docs/user/mcp-server.md` — MCP setup and tool reference

### Changed

- Build order: `mcp-server` built after `code-sidetrack-static`, before `cli` and `vscode`
- Publish workflow: `@sidetrack/mcp-server` added to `PUBLIC_WORKSPACES`
- Workspace sync: `@sidetrack/mcp-server` added to `WORKSPACE_NAMES`

## [0.3.6] — prior

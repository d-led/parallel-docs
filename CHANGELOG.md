# Changelog

## [1.0.0] — 2026-08-28

### Breaking

- **Rebrand**: the project is renamed from Commentray to **ParallelDocs**.
  - VS Code extension ID: `d-led.commentray-vscode` → `d-led.parallel-docs` (new Marketplace listing)
  - npm packages: `@commentray/*` → `@parallel-docs/*`, CLI binary `commentray` → `parallel-docs`
  - Storage directory `.commentray/` → `.parallel-docs/`, config file `.commentray.toml` → `.parallel-docs.toml`
  - Command IDs, configuration namespace, MCP tool names, and Markdown markers now use `parallel-docs`
- Legacy on-disk index field (`commentrayPath`) is still read and migrated so existing workspaces keep working.

### Added

- New ParallelDocs icon and favicon — two documents linked by a gutter connector.
- Automated third-party license notice generation (`npm run license:notices` → `packages/vscode/ThirdPartyNotices.txt`).

### Changed

- **Marketplace trust & security fixes**: the MCP HTTP server now binds to localhost only; the VS Code webview no longer loads external CDN assets; the bundled extension is unminified; third-party license comments are preserved in bundles.

## [0.4.0] — 2026-06-27

### Added

- **MCP server** (`packages/mcp-server/`) — 16 tools for AI coding assistants:
  - `parallel_docs_init`, `parallel_docs_validate`, `parallel_docs_paths`, `parallel_docs_render`, `parallel_docs_doctor`, `parallel_docs_migrate`, `parallel_docs_migrate_angles`, `parallel_docs_angles_add`, `parallel_docs_sync_moved_paths`, `parallel_docs_convert_source_markers`
  - `parallel_docs_list_pairs`, `parallel_docs_read_parallel_docs`, `parallel_docs_read_source`, `parallel_docs_list_orphans`, `parallel_docs_find_uncommented`, `parallel_docs_get_index`
- **CLI**: `parallel-docs mcp serve` (start MCP server) and `parallel-docs mcp install` (write repo-local configs for VS Code, Claude, Antigravity, OpenCode)
- **VS Code**: `parallel-docs.configureMcpServer` command + bundled `dist/mcp-server.js`
- **Scripts**: `scripts/install-plugin-here.sh` — install extension into running IDE
- **Docs**: `docs/user/mcp-server.md` — MCP setup and tool reference

### Changed

- Build order: `mcp-server` built after `code-parallel-docs-static`, before `cli` and `vscode`
- Publish workflow: `@parallel-docs/mcp-server` added to `PUBLIC_WORKSPACES`
- Workspace sync: `@parallel-docs/mcp-server` added to `WORKSPACE_NAMES`

## [0.3.6] — prior

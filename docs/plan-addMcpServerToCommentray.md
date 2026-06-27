## Plan: Add MCP Server to Commentray

**TL;DR** — New `packages/mcp-server/` shared package with MCP tool definitions and server. CLI gets `commentray mcp serve` (start server) and `commentray mcp install` (write repo-local configs for VS Code, Claude, Antigravity, OpenCode, etc. — no absolute paths). VS Code extension gets `commentray.configureMcpServer`. Ships with v0.4.0.

## Architecture Overview

```
packages/mcp-server/           ← NEW shared MCP logic
  depends on: @commentray/core, @modelcontextprotocol/sdk, zod
  used by:  cli, vscode

packages/cli/                   ← new commands: mcp serve, mcp install
  depends on: +@commentray/mcp-server  (new dep, needs archunit update)

packages/vscode/                ← new command: configureMcpServer
  depends on: +@commentray/mcp-server  (new dep, needs archunit update)
```

## Steps

### Phase 1: New `packages/mcp-server/` Package

1. **Scaffold the package**: `package.json` (name `@commentray/mcp-server`, type module), `tsconfig.json` (extends base, project references to core), `tsconfig.build.json`. Dependencies: `@commentray/core`, `@modelcontextprotocol/sdk`, `zod`.

2. **Create `src/mcp-tools.ts`** — Pure tool definitions and handler factories. Each tool:
   - `name`: snake_case (`commentray_init`, `commentray_validate`, etc.)
   - `description`: what it does, when to use
   - `inputSchema`: JSON Schema matching CLI args/flags
   - Handler factory: `(repoRoot: string) => async (args) => { ... }` — all handlers receive the repo root, call `@commentray/core` APIs directly.

   Tools (10 total, exclude `serve`):

   | MCP Tool                            | CLI equivalent                                               |
   | ----------------------------------- | ------------------------------------------------------------ |
   | `commentray_init`                   | `init`                                                       |
   | `commentray_validate`               | `validate [--staged]`                                        |
   | `commentray_paths`                  | `paths <file>`                                               |
   | `commentray_render`                 | `render --source --markdown --out --mermaid`                 |
   | `commentray_doctor`                 | `doctor [--allow-deletions]`                                 |
   | `commentray_migrate`                | `migrate`                                                    |
   | `commentray_migrate_angles`         | `migrate-angles [--angle-id] [--dry-run]`                    |
   | `commentray_angles_add`             | `angles add <angleId> [--source] [--title] [--make-default]` |
   | `commentray_sync_moved_paths`       | `sync-moved-paths [--from] [--to] [--dry-run]`               |
   | `commentray_convert_source_markers` | `convert-source-markers --file --language [--dry-run]`       |

3. **Create `src/mcp-server.ts`** — Exports `createMcpServer(repoRoot: string)` that returns a configured `Server` instance with all tools registered. Uses `@modelcontextprotocol/sdk`'s `McpServer`. Reports server identity: name `commentray-mcp`, version from its own package.json.

4. **Create `src/stdio-entry.ts`** — The actual entry point (`#!/usr/bin/env node`). Calls `findProjectRoot(process.cwd())` (reused from CLI's `project-root.ts` — extract to `@commentray/core` if not already exported there), creates the server, connects `StdioServerTransport`, starts. Errors go to stderr, MCP protocol on stdout.

5. **Create `src/mcp-install.ts`** — Install logic for repo-local MCP configs:
   - Detects which AI harnesses are relevant (presence of `.vscode/`, `.claude/`, `.antigravity/`, `.opencode/` directories, or always writes a known set)
   - Writes/merges MCP server entries into project-level config files:
     - `.vscode/mcp.json` — VS Code Copilot
     - `.claude/mcp.json` — Claude Code / Claude IDE
     - `.antigravity/mcp.json` — Antigravity
     - `.opencode/mcp.json` — OpenCode
   - Each entry uses `commentray mcp serve` as the command (no absolute paths — portable across contributors)
   - `--dry-run` flag: print what would be written without touching files
   - `--force` flag: overwrite existing Commentray entries (default: merge/skip if already present)
   - Exports `installMcpConfigs(repoRoot, options)` for use by both CLI and tests

6. **Export public API from `src/index.ts`**: `createMcpServer`, `registerAllTools`, `installMcpConfigs`, tool metadata types, harness config types.

### Phase 2: CLI Integration — `commentray mcp serve` and `commentray mcp install`

7. **Add `@commentray/mcp-server` dependency** to `packages/cli/package.json`.

8. **Add `commentray mcp serve` subcommand** to `packages/cli/src/cli.ts`:

   ```
   commentray mcp serve
   ```

   Starts the MCP server via stdio from the current repo root. Thin wrapper that imports `stdio-entry` from `@commentray/mcp-server`. This is the command referenced in all generated MCP configs.

9. **Add `commentray mcp install` subcommand** to `packages/cli/src/cli.ts`:

   ```
   commentray mcp install [--dry-run] [--force]
   ```

   Calls `installMcpConfigs` from `@commentray/mcp-server`. Reports which files were written/updated, which harnesses were configured.

10. **Add `commentray mcp` parent command** with `--help` listing both subcommands.

### Phase 3: VS Code Extension Integration

11. **Add `@commentray/mcp-server` dependency** to `packages/vscode/package.json` (bundled by esbuild, same as core).

12. **Add `commentray.configureMcpServer` command** to VS Code extension:
    - Register in `package.json` contributes.commands + activationEvents
    - Implement in `extension.ts`: shows an information message with:
      - Option A: "Run `commentray mcp install` in your repo" (preferred — portable, no absolute paths)
      - Option B: Copy-paste JSON config for this extension's bundled MCP server (absolute path via `ExtensionContext.extensionUri` — for users without the CLI)
    - Also offers to run `commentray mcp install` directly if the CLI is available on PATH

13. **Bundle MCP server in extension dist** for standalone use:
    - Create `packages/vscode/esbuild.mcp-server.mjs` — bundles `@commentray/mcp-server`'s `stdio-entry` → `dist/mcp-server.js`
    - Format: CJS, platform node, target node20, `banner: { js: '#!/usr/bin/env node' }`
    - This provides a fallback for users who have the extension but not the CLI

### Phase 4: ArchUnit Rules Update

14. **Update `packages/architecture/architecture.test.ts`**:
    - Allow `packages/cli/**` to depend on `packages/mcp-server/**` (new allowed dependency)
    - Allow `packages/vscode/**` to depend on `packages/mcp-server/**` (new allowed dependency)
    - `mcp-server/**` must not depend on render, static, cli, or vscode (only core)
    - Keep the CLI↔VS Code mutual exclusion rule
    - Add mcp-server to the no-cycles check
    - Update the `assertCliAndVscodePackageJsonHaveNoCrossReferences` if needed (it checks CLI↔vscode; mcp-server is separate)

### Phase 5: Tests

15. **Create `packages/mcp-server/src/test/mcp-tools.test.ts`** — Vitest unit tests:
    - Test each tool handler with a temp Commentray project (init first, then exercise each tool)
    - Test input validation: invalid args produce clear errors
    - Test error handling: missing project root, invalid paths, dry-run modes
    - Test output shape: each handler returns correct MCP `CallToolResult`

16. **Create `packages/mcp-server/src/test/mcp-server.test.ts`** — Integration test:
    - Use `@modelcontextprotocol/sdk`'s `InMemoryTransport`
    - Test `tools/list` returns all 10 expected tools with correct schemas
    - Test `tools/call` for `commentray_init` and `commentray_validate` on a temp directory
    - Test initialization handshake

17. **Create `packages/mcp-server/src/test/mcp-install.test.ts`**:
    - Test `installMcpConfigs` writes correct JSON to `.vscode/mcp.json`, `.claude/mcp.json`, etc.
    - Test `--dry-run` does not write files
    - Test `--force` overwrites existing entries
    - Test merged config preserves unrelated entries
    - Test generated configs contain no absolute paths

18. **Create `packages/cli/src/test/mcp-cli.test.ts`** — CLI integration:
    - Test `commentray mcp serve --help` prints usage
    - Test `commentray mcp install --help` prints usage
    - Test `commentray mcp install --dry-run` output

19. **Create `packages/vscode/src/test/suite/mcp-extension.test.ts`** — Extension test:
    - Test `commentray.configureMcpServer` command shows notification with expected content
    - Test the bundled `dist/mcp-server.js` starts and responds to `tools/list`

### Phase 6: Build & Workspace Integration

20. **Update root `tsconfig.json`**: add project reference to `packages/mcp-server`.

21. **Update root `package.json` workspaces**: `packages/*` already covers the new package (no change needed).

22. **Update root build script** if needed: ensure `packages/mcp-server` builds before cli and vscode (natural order: core → mcp-server → cli/vscode).

23. **Wire `packages/mcp-server` into workspace tooling**:
    - Add `@commentray/mcp-server` to `WORKSPACE_NAMES` in `scripts/sync-workspace-deps.mjs`
    - `scripts/set-workspace-versions.mjs` iterates `packages/*` — already covers the new package

24. **Add `@commentray/mcp-server` to publish workflow** in `scripts/publish.sh`:
    - Add to `PUBLIC_WORKSPACES` array (in dependency order: after `@commentray/render`, before `@commentray/code-commentray-static`, since CLI depends on it)
    - Ensure `packages/mcp-server/package.json` has `"publishConfig": { "access": "public" }` and `"files": ["dist", "LICENSE"]`

25. **Create `scripts/install-plugin-here.sh`** — Install the Commentray VS Code extension into the currently running IDE (VS Code, Cursor, or Antigravity). Differs from `install-extension.sh` which installs into ALL detected editors — this one targets only the active IDE for faster dogfooding loops.
    - Detects the running IDE via `$VSCODE_IPC_HOOK_CLI` (VS Code/Cursor integrated terminal), `$ANTIGRAVITY_EDITOR_APP_ROOT` (Antigravity), or `$COMMENTRAY_EDITOR` override
    - Falls back to `scripts/lib/pick-editor-cli.sh` detection
    - Supports `--package-only` and `--uninstall` flags

### Phase 7: Documentation & Release Prep

26. **Create `docs/user/mcp-server.md`** — usage guide:

27. **Update `README.md`** — mention MCP server in the feature list.

28. **Update `CHANGELOG.md`** with the new feature.

29. **Bump version** to 0.4.0 across all packages via `scripts/bump-version.sh`.

## Relevant Files

| File                                                   | Action                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `packages/mcp-server/package.json`                     | **NEW** — `publishConfig.access=public`, `files`                                                            |
| `packages/mcp-server/tsconfig.json`                    | **NEW**                                                                                                     |
| `packages/mcp-server/tsconfig.build.json`              | **NEW**                                                                                                     |
| `packages/mcp-server/src/index.ts`                     | **NEW** — public API                                                                                        |
| `packages/mcp-server/src/mcp-tools.ts`                 | **NEW** — 10 tool definitions                                                                               |
| `packages/mcp-server/src/mcp-server.ts`                | **NEW** — `createMcpServer()`                                                                               |
| `packages/mcp-server/src/stdio-entry.ts`               | **NEW** — shebang entry point                                                                               |
| `packages/mcp-server/src/mcp-install.ts`               | **NEW** — `installMcpConfigs()`                                                                             |
| `packages/mcp-server/src/test/mcp-tools.test.ts`       | **NEW**                                                                                                     |
| `packages/mcp-server/src/test/mcp-server.test.ts`      | **NEW**                                                                                                     |
| `packages/mcp-server/src/test/mcp-install.test.ts`     | **NEW**                                                                                                     |
| `packages/cli/package.json`                            | add `@commentray/mcp-server` dep                                                                            |
| `packages/cli/src/cli.ts`                              | add `mcp serve`, `mcp install` commands                                                                     |
| `packages/cli/src/test/mcp-cli.test.ts`                | **NEW**                                                                                                     |
| `packages/vscode/package.json`                         | add `@commentray/mcp-server` dep, `configureMcpServer` command + activationEvent, `build:mcp-server` script |
| `packages/vscode/src/extension.ts`                     | add `configureMcpServer` handler                                                                            |
| `packages/vscode/esbuild.mcp-server.mjs`               | **NEW** — bundle stdio-entry                                                                                |
| `packages/vscode/src/test/suite/mcp-extension.test.ts` | **NEW**                                                                                                     |
| `packages/architecture/architecture.test.ts`           | allow cli→mcp-server, vscode→mcp-server                                                                     |
| `tsconfig.json` (root)                                 | add project reference                                                                                       |
| `scripts/publish.sh`                                   | add `@commentray/mcp-server` to `PUBLIC_WORKSPACES`                                                         |
| `scripts/sync-workspace-deps.mjs`                      | add `@commentray/mcp-server` to `WORKSPACE_NAMES`                                                           |
| `scripts/install-plugin-here.sh`                       | **NEW** — install extension into running IDE                                                                |
| `docs/user/mcp-server.md`                              | **NEW** — usage guide                                                                                       |
| `README.md`                                            | mention MCP server                                                                                          |
| `CHANGELOG.md`                                         | add v0.4.0 entry                                                                                            |

## Verification

1. `npm run build` — all packages build, mcp-server before cli/vscode
2. `node packages/mcp-server/dist/stdio-entry.js` — starts MCP server, waits on stdin
3. `commentray mcp serve` — starts MCP server from repo root
4. `commentray mcp install --dry-run` — prints planned configs, no files written
5. `commentray mcp install` — writes `.vscode/mcp.json`, `.claude/mcp.json`, etc. with `commentray mcp serve` command
6. Generated configs contain **no absolute paths** — safe to commit
7. `commentray.configureMcpServer` in VS Code — shows notification with config options
8. `vitest run` — all new tests pass (mcp-tools, mcp-server, mcp-install, mcp-cli, mcp-extension)
9. ArchUnit tests pass — mcp-server isolation, cli→mcp-server allowed, vscode→mcp-server allowed, CLI↔vscode still blocked
10. Full test suite green: `./scripts/test.sh`
11. Manual: configure Claude Desktop with `commentray mcp serve` in a Commentray repo → `commentray_validate` tool works
12. `bash scripts/install-plugin-here.sh` — installs extension into currently running IDE
13. `bash scripts/install-plugin-here.sh --uninstall` — removes it

## Decisions

| Decision                                                    | Rationale                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **New `packages/mcp-server/` package**                      | Shared by both CLI and VS Code. Avoids duplicating tool definitions. Follows layered architecture: core ← mcp-server ← cli/vscode. |
| **`commentray mcp serve` as the canonical command**         | Portable — no absolute paths. Every contributor runs the same CLI they already have. Configs are commit-safe.                      |
| **`commentray mcp install` writes repo-local configs only** | `.vscode/mcp.json`, `.claude/mcp.json`, etc. are project files — meant to be committed. No user-global config files touched.       |
| **stdio transport only**                                    | Standard for MCP clients. No VS Code MCP gateway integration in initial release.                                                   |
| **All CLI commands except `serve`** exposed as MCP tools    | `serve` is a long-running process, not suitable as an MCP tool.                                                                    |
| **Direct `@commentray/core` API calls**                     | Faster, no subprocess overhead, better error propagation.                                                                          |
| **`zod` for input validation**                              | Runtime validation at the MCP boundary before touching core APIs.                                                                  |
| **Workspace root from cwd**                                 | Same as CLI behavior. MCP clients start the server in the project directory.                                                       |
| **VS Code bundles a standalone MCP server too**             | Fallback for users who have the extension but not the CLI.                                                                         |

## Supported Harnesses for `mcp install`

| Harness                     | Config File                                         | Notes                      |
| --------------------------- | --------------------------------------------------- | -------------------------- |
| VS Code Copilot             | `.vscode/mcp.json`                                  | Workspace-level MCP config |
| Claude Code / Claude IDE    | `.claude/mcp.json`                                  | Project-level MCP config   |
| Antigravity                 | `.antigravity/mcp.json`                             | Project-level MCP config   |
| OpenCode                    | `.opencode/mcp.json`                                | Project-level MCP config   |
| Claude Desktop              | _(skipped — user-global, would need absolute path)_ | Print instructions instead |
| GitHub Copilot (standalone) | _(skipped — user-global)_                           | Print instructions instead |

All repo-local configs use:

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

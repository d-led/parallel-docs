<!-- #region sidetrack:readme-lede -->

# SideTrack — a side-by-side documentation ecosystem

[![npm: sidetrack](https://img.shields.io/npm/v/sidetrack?label=sidetrack)](https://www.npmjs.com/package/sidetrack)
[![npm: @sidetrack/core](https://img.shields.io/npm/v/@sidetrack/core?label=@sidetrack/core)](https://www.npmjs.com/package/@sidetrack/core)
[![npm: @sidetrack/render](https://img.shields.io/npm/v/@sidetrack/render?label=@sidetrack/render)](https://www.npmjs.com/package/@sidetrack/render)
[![npm: @sidetrack/mcp-server](https://img.shields.io/npm/v/@sidetrack/mcp-server?label=@sidetrack/mcp-server)](https://www.npmjs.com/package/@sidetrack/mcp-server)
[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/d-led.sidetrack-vscode.png?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=d-led.sidetrack-vscode)

Have you ever wished a “side track” for code the way DVD extras let filmmakers talk over a film without changing the picture? When looking at code, that might answer the whys, reveal the intent besides the code itself.

The ecosystem is a handful of published npm libraries, the sidetrack CLI, and a VS Code or Cursor extension. They share one configuration file and one companion tree next to your sources. Tooling ties sidetrack to the code: optional Git hooks, validation and doctor flows, migrations, rendering, static site output, a **local** `sidetrack serve` helper for preview (not the production host—you deploy `_site/` elsewhere), and standalone executables when you do not want a Node install. For how checks split across hook, CLI, editor, and what this repository’s own CI runs versus validate, see [What SideTrack detects](docs/user/detection.md).

<!-- #endregion sidetrack:readme-lede -->
<!-- #region sidetrack:readme-why -->

## Why

Inline comments are not always possible (generated files, tight formats, policy). SideTrack keeps the primary artifact clean while storing rationale, warnings, and diagrams in companion Markdown under a sidetrack folder beside the code it explains. In a meeting you might hear someone say they need to document architecture in sidetrack so newcomers can onboard from the source—same word names the tool and the habit; context disambiguates.

The same split helps when you want rich context for a person or a chatbot—runbooks, product rationale, incident notes, onboarding prose—that does not belong in the source file itself, yet stays tied to specific lines or regions through the metadata index and block anchors, so “this sidetrack goes with that code” stays obvious without pasting a wall of inline comments into the repo.

That is useful for developers and architects, for LLM-assisted workflows that need context beside the primary file, for onboarding next to the code, for optional pre-commit checks on companion metadata, and for publishing a code-plus-sidetrack static site (for example GitHub Pages) with scroll-linked panes.

<!-- #endregion sidetrack:readme-why -->

<!-- #region sidetrack:readme-user-guides -->

## Using SideTrack

Short guides live under docs/user—install, first setup, keeping blocks aligned, what each layer catches, CLI reference, configuration, and troubleshooting:

- [Install](docs/user/install.md)
- [Quickstart](docs/user/quickstart.md)
- [Keeping blocks in sync](docs/user/keeping-blocks-in-sync.md)
- [What SideTrack detects](docs/user/detection.md)
- [CLI reference](docs/user/cli.md)
- [Configuration](docs/user/config.md)
- [Troubleshooting](docs/user/troubleshooting.md)

<!-- #endregion sidetrack:readme-user-guides -->

## Get it

The [install guide](docs/user/install.md) walks through npm global, **`npx sidetrack`** (one-off; **`npx sidetrack --help`** → `Usage: sidetrack [options] [command]`), release binaries, and the Marketplace extension. Clone workflows, local binary builds, and macOS quarantine sit in [Development → CLI, binaries, and Pages](docs/development.md#cli-binaries-and-pages). If you want Node-free installs, use [GitHub Releases](https://github.com/d-led/sidetrack/releases); [Development](docs/development.md#cli-binaries-and-pages) explains which artifacts are meant to last.

## AI Coding Assistants (MCP)

SideTrack ships an [MCP server](docs/user/mcp-server.md) so AI assistants can validate, discover, read, and write sidetrack. Start with:

```bash
sidetrack mcp install    # writes .vscode/mcp.json, .claude/mcp.json, etc.
```

This gives your AI coding assistant 16 tools — from `sidetrack_list_pairs` and `sidetrack_find_uncommented` to `sidetrack_read_sidetrack` and `sidetrack_validate`. See the [MCP guide](docs/user/mcp-server.md) for setup and tool reference.

## Ecosystem & this repo

Layout, day-to-day commands, quality gate, Cypress, Pages, and releases for people working on SideTrack itself are in [Development](docs/development.md), including [dogfood: README on GitHub Pages](docs/development.md#dogfood-readme-on-github-pages). The contributor contract is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Packages in this monorepo are licensed under MPL-2.0 (see LICENSE and per-package copies).

## On the Name

Repository: [github.com/d-led/sidetrack](https://github.com/d-led/sidetrack). The name SideTrack sidesteps an existing “sidetrack” extension identity on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jaredhughes.sidetrack); the project nearly used “sidetrack” instead.

## Contributing

<!-- #region sidetrack:readme-mobile-flip-check -->

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Development](docs/development.md).

<!-- #endregion sidetrack:readme-mobile-flip-check -->

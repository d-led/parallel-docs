<!-- #region commentray:readme-lede -->

# Commentray — a side-by-side documentation ecosystem

Have you ever wished a “commentary track” for code the way DVD extras let filmmakers talk over a film without changing the picture? When looking at code, that might answer the whys, reveal the intent besides the code itself.

The ecosystem is a handful of published npm libraries, the commentray CLI, and a VS Code or Cursor extension. They share one configuration file and one companion tree next to your sources. Tooling ties commentary to the code: optional Git hooks, validation and doctor flows, migrations, rendering, static site output, a **local** `commentray serve` helper for preview (not the production host—you deploy `_site/` elsewhere), and standalone executables when you do not want a Node install. For how checks split across hook, CLI, editor, and what this repository’s own CI runs versus validate, see [What Commentray detects](docs/user/detection.md).

<!-- #endregion commentray:readme-lede -->
<!-- #region commentray:readme-why -->

## Why

Inline comments are not always possible (generated files, tight formats, policy). Commentray keeps the primary artifact clean while storing rationale, warnings, and diagrams in companion Markdown under a commentray folder beside the code it explains. In a meeting you might hear someone say they need to document architecture in commentray so newcomers can onboard from the source—same word names the tool and the habit; context disambiguates.

The same split helps when you want rich context for a person or a chatbot—runbooks, product rationale, incident notes, onboarding prose—that does not belong in the source file itself, yet stays tied to specific lines or regions through the metadata index and block anchors, so “this commentary goes with that code” stays obvious without pasting a wall of inline comments into the repo.

That is useful for developers and architects, for LLM-assisted workflows that need context beside the primary file, for onboarding next to the code, for optional pre-commit checks on companion metadata, and for publishing a code-plus-commentary static site (for example GitHub Pages) with scroll-linked panes.

<!-- #endregion commentray:readme-why -->

<!-- #region commentray:readme-user-guides -->

## Using Commentray

Short guides live under docs/user—install, first setup, keeping blocks aligned, what each layer catches, CLI reference, configuration, and troubleshooting:

- [Install](docs/user/install.md)
- [Quickstart](docs/user/quickstart.md)
- [Keeping blocks in sync](docs/user/keeping-blocks-in-sync.md)
- [What Commentray detects](docs/user/detection.md)
- [CLI reference](docs/user/cli.md)
- [Configuration](docs/user/config.md)
- [Troubleshooting](docs/user/troubleshooting.md)

<!-- #endregion commentray:readme-user-guides -->

## Get it

The [install guide](docs/user/install.md) walks through npm global, **`npx commentray`** (one-off; **`npx commentray --help`** → `Usage: commentray [options] [command]`), release binaries, and the Marketplace extension. Clone workflows, local binary builds, and macOS quarantine sit in [Development → CLI, binaries, and Pages](docs/development.md#cli-binaries-and-pages). If you want Node-free installs, use [GitHub Releases](https://github.com/d-led/commentray/releases); [Development](docs/development.md#cli-binaries-and-pages) explains which artifacts are meant to last.

## AI Coding Assistants (MCP)

Commentray ships an [MCP server](docs/user/mcp-server.md) so AI assistants can validate, discover, read, and write commentary. Start with:

```bash
commentray mcp install    # writes .vscode/mcp.json, .claude/mcp.json, etc.
```

This gives your AI coding assistant 16 tools — from `commentray_list_pairs` and `commentray_find_uncommented` to `commentray_read_commentray` and `commentray_validate`. See the [MCP guide](docs/user/mcp-server.md) for setup and tool reference.

## Ecosystem & this repo

Layout, day-to-day commands, quality gate, Cypress, Pages, and releases for people working on Commentray itself are in [Development](docs/development.md), including [dogfood: README on GitHub Pages](docs/development.md#dogfood-readme-on-github-pages). The contributor contract is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Packages in this monorepo are licensed under MPL-2.0 (see LICENSE and per-package copies).

## On the Name

Repository: [github.com/d-led/commentray](https://github.com/d-led/commentray). The name Commentray sidesteps an existing “commentary” extension identity on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jaredhughes.commentary); the project nearly used “commentary” instead.

## Contributing

<!-- #region commentray:readme-mobile-flip-check -->

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Development](docs/development.md).

<!-- #endregion commentray:readme-mobile-flip-check -->

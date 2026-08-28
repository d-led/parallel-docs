<!-- #region parallelDocs:readme-lede -->

# ParallelDocs — a side-by-side documentation ecosystem

[![npm: parallel-docs](https://img.shields.io/npm/v/parallel-docs?label=parallel-docs)](https://www.npmjs.com/package/parallel-docs)
[![npm: @parallel-docs/core](https://img.shields.io/npm/v/@parallel-docs/core?label=@parallel-docs/core)](https://www.npmjs.com/package/@parallel-docs/core)
[![npm: @parallel-docs/render](https://img.shields.io/npm/v/@parallel-docs/render?label=@parallel-docs/render)](https://www.npmjs.com/package/@parallel-docs/render)
[![npm: @parallel-docs/mcp-server](https://img.shields.io/npm/v/@parallel-docs/mcp-server?label=@parallel-docs/mcp-server)](https://www.npmjs.com/package/@parallel-docs/mcp-server)
[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/d-led.parallel-docs-vscode.png?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=d-led.parallel-docs-vscode)

Have you ever wished a “side track” for code the way DVD extras let filmmakers talk over a film without changing the picture? When looking at code, that might answer the whys, reveal the intent besides the code itself.

The ecosystem is a handful of published npm libraries, the parallel-docs CLI, and a VS Code or Cursor extension. They share one configuration file and one companion tree next to your sources. Tooling ties parallel-docs to the code: optional Git hooks, validation and doctor flows, migrations, rendering, static site output, a **local** `parallel-docs serve` helper for preview (not the production host—you deploy `_site/` elsewhere), and standalone executables when you do not want a Node install. For how checks split across hook, CLI, editor, and what this repository’s own CI runs versus validate, see [What ParallelDocs detects](docs/user/detection.md).

<!-- #endregion parallelDocs:readme-lede -->
<!-- #region parallelDocs:readme-why -->

## Why

Inline comments are not always possible (generated files, tight formats, policy). ParallelDocs keeps the primary artifact clean while storing rationale, warnings, and diagrams in companion Markdown under a parallel-docs folder beside the code it explains. In a meeting you might hear someone say they need to document architecture in parallel-docs so newcomers can onboard from the source—same word names the tool and the habit; context disambiguates.

The same split helps when you want rich context for a person or a chatbot—runbooks, product rationale, incident notes, onboarding prose—that does not belong in the source file itself, yet stays tied to specific lines or regions through the metadata index and block anchors, so “this parallel-docs goes with that code” stays obvious without pasting a wall of inline comments into the repo.

That is useful for developers and architects, for LLM-assisted workflows that need context beside the primary file, for onboarding next to the code, for optional pre-commit checks on companion metadata, and for publishing a code-plus-parallel-docs static site (for example GitHub Pages) with scroll-linked panes.

<!-- #endregion parallelDocs:readme-why -->

<!-- #region parallelDocs:readme-user-guides -->

## Using ParallelDocs

Short guides live under docs/user—install, first setup, keeping blocks aligned, what each layer catches, CLI reference, configuration, and troubleshooting:

- [Install](docs/user/install.md)
- [Quickstart](docs/user/quickstart.md)
- [Keeping blocks in sync](docs/user/keeping-blocks-in-sync.md)
- [What ParallelDocs detects](docs/user/detection.md)
- [CLI reference](docs/user/cli.md)
- [Configuration](docs/user/config.md)
- [Troubleshooting](docs/user/troubleshooting.md)

<!-- #endregion parallelDocs:readme-user-guides -->

## Get it

The [install guide](docs/user/install.md) walks through npm global, **`npx parallel-docs`** (one-off; **`npx parallel-docs --help`** → `Usage: parallel-docs [options] [command]`), release binaries, and the Marketplace extension. Clone workflows, local binary builds, and macOS quarantine sit in [Development → CLI, binaries, and Pages](docs/development.md#cli-binaries-and-pages). If you want Node-free installs, use [GitHub Releases](https://github.com/d-led/parallel-docs/releases); [Development](docs/development.md#cli-binaries-and-pages) explains which artifacts are meant to last.

## AI Coding Assistants (MCP)

ParallelDocs ships an [MCP server](docs/user/mcp-server.md) so AI assistants can validate, discover, read, and write parallel-docs. Start with:

```bash
parallel-docs mcp install    # writes .vscode/mcp.json, .claude/mcp.json, etc.
```

This gives your AI coding assistant 16 tools — from `parallel_docs_list_pairs` and `parallel_docs_find_uncommented` to `parallel_docs_read_parallel_docs` and `parallel_docs_validate`. See the [MCP guide](docs/user/mcp-server.md) for setup and tool reference.

## Ecosystem & this repo

Layout, day-to-day commands, quality gate, Cypress, Pages, and releases for people working on ParallelDocs itself are in [Development](docs/development.md), including [dogfood: README on GitHub Pages](docs/development.md#dogfood-readme-on-github-pages). The contributor contract is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Packages in this monorepo are licensed under MPL-2.0 (see LICENSE and per-package copies).

## On the Name

Repository: [github.com/d-led/parallel-docs](https://github.com/d-led/parallel-docs). The name ParallelDocs sidesteps an existing “parallel-docs” extension identity on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jaredhughes.parallel-docs); the project nearly used “parallel-docs” instead.

## Contributing

<!-- #region parallelDocs:readme-mobile-flip-check -->

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Development](docs/development.md).

<!-- #endregion parallelDocs:readme-mobile-flip-check -->

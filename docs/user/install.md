# Install ParallelDocs

Pick one path: **release binary** (no Node — assets on [GitHub Releases](https://github.com/d-led/parallel-docs/releases) under **`v*`** tags), **[Homebrew](#homebrew-d-led-tap-binary)** (macOS or Linux, same release binaries), **npm global** or **[`npx`](#npx-one-off-no-global-install)** (needs Node), or **clone the repo** for extension packaging / full development ([Development → Clone and workspace setup](../development.md#clone-and-workspace-setup)).

## Homebrew (`d-led` tap, binary)

If you use [Homebrew](https://brew.sh/), install from the maintainer tap [d-led/homebrew-d-led](https://github.com/d-led/homebrew-d-led) (formula `parallel-docs.rb` installs the same standalone SEA builds as Releases — **darwin-arm64**, **darwin-x64**, **linux-arm64**, **linux-x64** only):

```bash
brew tap d-led/d-led
brew install parallel-docs
parallel-docs --version
```

Upgrade after a new release: `brew update && brew upgrade parallel-docs`.

## Standalone CLI binaries (GitHub Releases)

Official builds ship from [`.github/workflows/binaries.yml`](../../.github/workflows/binaries.yml): one self-contained executable per OS/arch (Node SEA).

**[GitHub Releases](https://github.com/d-led/parallel-docs/releases)** publishes standalone CLI assets on **`v*`** tags. To install:

1. Open the [releases page](https://github.com/d-led/parallel-docs/releases) and download the binary for your platform (for example `parallel-docs-darwin-arm64` on Apple Silicon).
2. Put the file on your `PATH` and mark it executable (`chmod +x …` on Unix).
3. Run `parallel-docs --version`.

You can still use [npm global](#npm-global-parallel-docs-on-path) or work from a [clone](../development.md#clone-and-workspace-setup). A local **SEA** binary from source is a maintainer-style build—see [Building binaries locally](../development.md#building-binaries-locally).

**Workflow run artifacts** (not Releases) expire after about two weeks—prefer **Release** assets for anything you rely on long term.

If macOS blocks a downloaded binary (quarantine), see [Development → macOS quarantine](../development.md#macos-quarantine-standalone-cli).

## npm global (`parallel-docs` on PATH)

Requires a supported **Node.js** version (see repo CI matrices).

```bash
npm install -g parallel-docs
parallel-docs --version
```

Upgrade later with the same `npm install -g` command.

## npx (one-off, no global install)

With Node/npm available, you can run the published CLI without a global install:

```bash
npx parallel-docs --help
```

That prints `Usage: parallel-docs [options] [command]` and lists subcommands—the same surface as a global `parallel-docs`. Examples: `npx parallel-docs validate`, `npx parallel-docs init`.

## VS Code / Cursor extension

**Published:** install [`d-led.parallel-docs`](https://marketplace.visualstudio.com/items?itemName=d-led.parallel-docs) from the Marketplace (or your editor’s extensions UI). `parallel-docs init` merges this id into `.vscode/extensions.json` when that file is mergeable JSON.

**From a built `.vsix` in this repo:**

```bash
npm run extension:install    # build, package, install
# or: npm run extension:package   → packages/vscode/dist/*.vsix
```

Dogfood flow (fixture or repo): see **Editor extension workflows** in [`docs/development.md`](../development.md#editor-extension-workflows).

### Which editor binary?

If both `cursor` and `code` exist on `PATH`, scripts prefer **Cursor**. Override:

```bash
PARALLEL_DOCS_EDITOR=code npm run extension:dogfood
```

## Next steps

- [Quickstart](quickstart.md) — first parallel-docs file and validate.
- [Keeping blocks in sync](keeping-blocks-in-sync.md) — index, markers, anchors.

# ParallelDocs — quick-start

<!-- parallelDocs:block id=readme-lede -->

_You have the main [`README.md`](https://github.com/d-led/parallel-docs/blob/main/README.md) in the left column: packages, scripts, release flow. This file **is** parallel-docs for that README—the voice-over beside the facts, not a second brochure._

If this is your first pass, try a quick interaction: scroll either pane and watch the other follow, then tap the **Help** button in the top bar if you want the guided tour again.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-why -->

The README’s _Why_ section names the product (**ParallelDocs**) and the prose you write (**parallel-docs**). Same checkout, two panes: the left states what exists; this column states why it is shaped that way and where the edges are.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-user-guides -->

The README’s **Using ParallelDocs** section links short guides under `docs/user/`—install, quickstart, keeping blocks in sync, detection, CLI reference, configuration, troubleshooting—without walking the whole monorepo first.

<!-- parallelDocs:page-break -->

## Try scroll sync (why the editor extension exists)

On **[GitHub Pages](https://d-led.github.io/parallel-docs/)** the split is live: **Code** is this repo’s `README.md`; **ParallelDocs** is this file, rendered as HTML. Scroll either pane—the other follows in **lockstep** (**block stretch** when `index.json` uses **`marker:`** anchors backed by paired `<!-- #region parallelDocs:… -->` / `<!-- #endregion … -->` delimiters in `README.md`, plus matching `<!-- parallelDocs:block id=… -->` markers here; otherwise **proportional** sync). That is the DVD-style parallel-docs metaphor without installing anything.

The deploy is a **single** HTML file, so in-parallel-docs Markdown links rewritten to repo-relative paths can **404** on Pages; use full `https://github.com/…/blob/…` URLs when the link must work from the static site.

**Search:** **Escape** clears the query and hides hit results (same as **Clear**).

<!-- parallelDocs:page-break -->

## Images next to this file

Keep images **in the same directory as this `.md`** (or a normal subfolder like **`./assets/`**) and reference them with **`./…`** paths—the VS Code Markdown preview and path completions use the same CommonMark rules. Static HTML rules: [`docs/spec/storage.md` § Images](https://github.com/d-led/parallel-docs/blob/main/docs/spec/storage.md#images-and-other-local-assets-static-html) (local **`img`** must resolve under **`.parallel-docs/`**; use **`https://…`** for diagrams outside storage).

![Schematic: paired panes (primary left, parallel-docs right)](./assets/paired-editors.svg)

**Real screenshots:** run **`bash scripts/refresh-root-readme-screenshots.sh`** (or `npm run extension:parallel-docs-screenshots`), capture the UI, save files under **`./assets/`** here, then **`![](./assets/your.png)`** like any other Markdown project. For the VS Code extension README walk-through PNGs, see **`.parallel-docs/source/packages/vscode/README.md/main.md`** → Maintainer.

The **VS Code / Cursor** extension is for **authoring**: **ParallelDocs: Open parallel-docs beside source**, both editors visible, scroll source and let side track. After **ParallelDocs: Add block from selection**, sync can **snap to the block** that owns the visible source lines when `index.json` and `<!-- parallelDocs:block id=… -->` markers agree; otherwise you stay on proportional sync. Same storage model as the site; the extension is where editing stays pleasant.

<!-- parallelDocs:page-break -->

## Why this file exists

The README stays scannable. Here we keep motive, trade-offs, and sharp edges—without duplicating another full quickstart.

<!-- parallelDocs:page-break -->

## If you only do one thing

Clone and `npm run setup` (see README). Then pick editor install script or `cli:install`; both land on the same `.parallel-docs/` layout and validators. Same model, different entrypoints.

<!-- parallelDocs:page-break -->

## About this HTML

You may be reading a **generated** page: `@parallel-docs/code-parallel-docs-static`, [`build-static-pages.mjs`](https://github.com/d-led/parallel-docs/blob/main/scripts/build-static-pages.mjs), and [`pages.yml`](https://github.com/d-led/parallel-docs/blob/main/.github/workflows/pages.yml). Point `[static_site]` at another source file and you get the same layout—configuration is reuse, not a fork.

<!-- parallelDocs:page-break -->

## Cookbook (tone, not a second README)

- **Greenfield adopt** — `parallel-docs init` is idempotent; nothing in the primary tree has to move first.
- **One-off CLI** — `npx parallel-docs …` needs no global install; `npx parallel-docs --help` prints `Usage: parallel-docs [options] [command]` (same as [Install](https://github.com/d-led/parallel-docs/blob/main/docs/user/install.md) describes for npm).
- **Hook paranoia** — `init scm` runs `validate` before merge; opt-in because hooks are a team contract.
- **“Why is my tree red?”** — `doctor` stacks environment checks on `validate`.
- **Binaries** — standalone CLI assets ship on **[GitHub Releases](https://github.com/d-led/parallel-docs/releases)** with each **`v*`** tag; CI artifacts from [`.github/workflows/binaries.yml`](../../../.github/workflows/binaries.yml) expire after 14 days by design.
- **Your own Pages** — Copy [`.parallel-docs.toml`](https://github.com/d-led/parallel-docs/blob/main/.parallel-docs.toml), adjust `[static_site]`, run `npm run pages:build`.

<!-- parallelDocs:page-break -->

## Architecture (who talks to whom)

Do not duplicate the README’s package list here—that list is canonical. The diagram below is **roles**, not package names—see the **[Architecture](https://github.com/d-led/parallel-docs/blob/main/.parallel-docs/source/README.md/architecture.md)** angle for the exact `@parallel-docs/*` dependency graph.

```mermaid
flowchart TB
  nCore["Core library paths index config"]
  nHtml["HTML pipeline and code-browser shell"]
  nSsg["Static site one-page HTML"]
  nCli["CLI init validate pages serve"]
  nExt["Editor paired files scroll sync"]

  nCore -->|builds on| nHtml
  nCore -->|paths and index| nSsg
  nHtml -->|shell uses| nSsg
  nCore -->|uses| nCli
  nHtml -->|uses| nCli
  nSsg -->|bundled in| nCli
  nCore -->|uses| nExt
```

In one line: **core** holds paths and index truth; **render** holds safe HTML; **cli** and the extension are **surfaces**; the static-site package is the thinnest **consumer** of render for publishing. Change the HTML contract, then walk that chain backward before you tag.

<!-- parallelDocs:page-break -->

## Reference (jump off points)

- Storage layout: [`docs/spec/storage.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/storage.md)
- Anchor strategies: [`docs/spec/anchors.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/anchors.md)
- Block grammar: [`docs/spec/blocks.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/blocks.md)
- Maintainer guide (CI, Pages, extension tests, releases, quality gate): [`docs/development.md`](https://github.com/d-led/parallel-docs/blob/main/docs/development.md); backlog: **GitHub Issues**
- Trust model & parsing guarantees: [`SECURITY.md`](https://github.com/d-led/parallel-docs/blob/main/SECURITY.md)
- Contributing contract: [`CONTRIBUTING.md`](https://github.com/d-led/parallel-docs/blob/main/CONTRIBUTING.md)

<!-- parallelDocs:page-break -->

## What ParallelDocs is not (one beat each)

Not a substitute for inline comments where the medium allows. Not a hosted blog—**parallel-docs** lives in **git** with the code it explains. Not editor-exclusive—the CLI is the same story without a GUI.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-mobile-flip-check -->

### Narrow viewport check (README ↔ this angle)

On [GitHub Pages](https://d-led.github.io/parallel-docs/), use a **narrow** viewport (or a phone), **scroll this README to the bottom**, then use **flip source / parallel-docs**. Scroll should stay **block-linked** with this companion file, and a **second flip control** appears when the toolbar flip scrolls off-screen.

The **`readme-mobile-flip-check`** region pairs `README.md` delimiters with this `<!-- parallelDocs:block id=readme-mobile-flip-check -->` section: scroll the **Code** column to the tail, flip to **ParallelDocs** and back—the panes should stay aligned with that block, and the **duplicate flip** should appear once the toolbar control is off-screen.

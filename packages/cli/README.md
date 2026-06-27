# commentray

Command-line interface for [Commentray](https://github.com/d-led/commentray) — a side-by-side "commentary track" for code. Provides idempotent workspace setup, validation, staleness doctoring, metadata migration, and HTML rendering.

**Keeping `index.json`, Markdown block markers, and source regions aligned:** see the repo guide [docs/user/keeping-blocks-in-sync.md](../../docs/user/keeping-blocks-in-sync.md) (checklists, `validate` / pre-commit, path sync after Git moves).

## Install

<!-- #region commentray:cli-adoption -->

```bash
npm install -D commentray
# or globally:
npm install -g commentray
```

**Without installing:** `npx commentray` runs the published CLI on demand. `npx commentray --help` prints `Usage: commentray [options] [command]` and lists commands (same as a global `commentray` on `PATH`).

Standalone, self-contained binaries (no Node install needed) for Linux x64/arm64, macOS x64/arm64, and Windows x64 ship on **[GitHub Releases](https://github.com/d-led/commentray/releases)** with each **`v*`** tag. CI workflow artifacts expire after a short retention period—prefer **Release** assets for anything you rely on long term.

<!-- #endregion commentray:cli-adoption -->

## Use

```bash
commentray init            # dirs + index if missing; migrate/normalize; VS Code extension recommendation; validate
commentray init config     # ensure .commentray.toml exists (with --force to replace)
commentray init scm        # install/refresh a marked block in .git/hooks/pre-commit
commentray validate        # schema + anchor integrity + Git staleness evidence
commentray validate --staged   # same checks limited to index pairs touched by staged files (Git index)
commentray doctor          # validate plus environment checks
commentray doctor --allow-deletions   # same, but first removes orphan companion Markdown (no primary source file)
commentray migrate         # migrate metadata JSON to the current schema
commentray migrate-angles    # flat .commentray/source/*.md → Angles folders + [angles] + index keys (see --dry-run)
commentray angles add ID [--source PATH] [--title T] [--make-default]   # register angle + create companion under Angles layout
commentray sync-moved-paths # rewrite index paths after Git renames (uses git diff)
commentray convert-source-markers --file PATH --language LANG  # rewrite region comment style (optional --dry-run)
commentray serve [--port 4173]     # dev helper: watch inputs, rebuild _site, local HTTP + livereload (not how you host production—upload _site/ to Pages, S3, etc.)
commentray render [--source SRC] [--markdown MD] [--out OUT.html] [--mermaid]
                            # missing flags fall back to .commentray.toml [static_site]
                            # (--out defaults to _site/index.html)
commentray paths SRC       # print the commentray Markdown path for a source file
```

<!-- #region commentray:cli-exit-codes -->
Exit codes: `0` for success, `1` when validation finds errors (suitable for CI).
<!-- #endregion commentray:cli-exit-codes -->

## License

[MPL-2.0](./LICENSE)

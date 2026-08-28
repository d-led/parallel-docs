# sidetrack

Command-line interface for [SideTrack](https://github.com/d-led/sidetrack) — a side-by-side "side track" for code. Provides idempotent workspace setup, validation, staleness doctoring, metadata migration, and HTML rendering.

**Keeping `index.json`, Markdown block markers, and source regions aligned:** see the repo guide [docs/user/keeping-blocks-in-sync.md](../../docs/user/keeping-blocks-in-sync.md) (checklists, `validate` / pre-commit, path sync after Git moves).

## Install

<!-- #region sidetrack:cli-adoption -->

```bash
npm install -D sidetrack
# or globally:
npm install -g sidetrack
```

**Without installing:** `npx sidetrack` runs the published CLI on demand. `npx sidetrack --help` prints `Usage: sidetrack [options] [command]` and lists commands (same as a global `sidetrack` on `PATH`).

Standalone, self-contained binaries (no Node install needed) for Linux x64/arm64, macOS x64/arm64, and Windows x64 ship on **[GitHub Releases](https://github.com/d-led/sidetrack/releases)** with each **`v*`** tag. CI workflow artifacts expire after a short retention period—prefer **Release** assets for anything you rely on long term.

<!-- #endregion sidetrack:cli-adoption -->

## Use

```bash
sidetrack init            # dirs + index if missing; migrate/normalize; VS Code extension recommendation; validate
sidetrack init config     # ensure .sidetrack.toml exists (with --force to replace)
sidetrack init scm        # install/refresh a marked block in .git/hooks/pre-commit
sidetrack validate        # schema + anchor integrity + Git staleness evidence
sidetrack validate --staged   # same checks limited to index pairs touched by staged files (Git index)
sidetrack doctor          # validate plus environment checks
sidetrack doctor --allow-deletions   # same, but first removes orphan companion Markdown (no primary source file)
sidetrack migrate         # migrate metadata JSON to the current schema
sidetrack migrate-angles    # flat .sidetrack/source/*.md → Angles folders + [angles] + index keys (see --dry-run)
sidetrack angles add ID [--source PATH] [--title T] [--make-default]   # register angle + create companion under Angles layout
sidetrack sync-moved-paths # rewrite index paths after Git renames (uses git diff)
sidetrack convert-source-markers --file PATH --language LANG  # rewrite region comment style (optional --dry-run)
sidetrack serve [--port 4173]     # dev helper: watch inputs, rebuild _site, local HTTP + livereload (not how you host production—upload _site/ to Pages, S3, etc.)
sidetrack render [--source SRC] [--markdown MD] [--out OUT.html] [--mermaid]
                            # missing flags fall back to .sidetrack.toml [static_site]
                            # (--out defaults to _site/index.html)
sidetrack paths SRC       # print the sidetrack Markdown path for a source file
```

<!-- #region sidetrack:cli-exit-codes -->

Exit codes: `0` for success, `1` when validation finds errors (suitable for CI).
<!-- #endregion sidetrack:cli-exit-codes -->

## License

[MPL-2.0](./LICENSE)

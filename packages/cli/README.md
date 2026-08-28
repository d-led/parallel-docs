# parallel-docs

Command-line interface for [ParallelDocs](https://github.com/d-led/parallel-docs) — a side-by-side "side track" for code. Provides idempotent workspace setup, validation, staleness doctoring, metadata migration, and HTML rendering.

**Keeping `index.json`, Markdown block markers, and source regions aligned:** see the repo guide [docs/user/keeping-blocks-in-sync.md](../../docs/user/keeping-blocks-in-sync.md) (checklists, `validate` / pre-commit, path sync after Git moves).

## Install

<!-- #region parallelDocs:cli-adoption -->

```bash
npm install -D parallel-docs
# or globally:
npm install -g parallel-docs
```

**Without installing:** `npx parallel-docs` runs the published CLI on demand. `npx parallel-docs --help` prints `Usage: parallel-docs [options] [command]` and lists commands (same as a global `parallel-docs` on `PATH`).

Standalone, self-contained binaries (no Node install needed) for Linux x64/arm64, macOS x64/arm64, and Windows x64 ship on **[GitHub Releases](https://github.com/d-led/parallel-docs/releases)** with each **`v*`** tag. CI workflow artifacts expire after a short retention period—prefer **Release** assets for anything you rely on long term.

<!-- #endregion parallelDocs:cli-adoption -->

## Use

```bash
parallel-docs init            # dirs + index if missing; migrate/normalize; VS Code extension recommendation; validate
parallel-docs init config     # ensure .parallel-docs.toml exists (with --force to replace)
parallel-docs init scm        # install/refresh a marked block in .git/hooks/pre-commit
parallel-docs validate        # schema + anchor integrity + Git staleness evidence
parallel-docs validate --staged   # same checks limited to index pairs touched by staged files (Git index)
parallel-docs doctor          # validate plus environment checks
parallel-docs doctor --allow-deletions   # same, but first removes orphan companion Markdown (no primary source file)
parallel-docs migrate         # migrate metadata JSON to the current schema
parallel-docs migrate-angles    # flat .parallel-docs/source/*.md → Angles folders + [angles] + index keys (see --dry-run)
parallel-docs angles add ID [--source PATH] [--title T] [--make-default]   # register angle + create companion under Angles layout
parallel-docs sync-moved-paths # rewrite index paths after Git renames (uses git diff)
parallel-docs convert-source-markers --file PATH --language LANG  # rewrite region comment style (optional --dry-run)
parallel-docs serve [--port 4173]     # dev helper: watch inputs, rebuild _site, local HTTP + livereload (not how you host production—upload _site/ to Pages, S3, etc.)
parallel-docs render [--source SRC] [--markdown MD] [--out OUT.html] [--mermaid]
                            # missing flags fall back to .parallel-docs.toml [static_site]
                            # (--out defaults to _site/index.html)
parallel-docs paths SRC       # print the parallel-docs Markdown path for a source file
```

<!-- #region parallelDocs:cli-exit-codes -->

Exit codes: `0` for success, `1` when validation finds errors (suitable for CI).
<!-- #endregion parallelDocs:cli-exit-codes -->

## License

[MPL-2.0](./LICENSE)

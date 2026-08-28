# ParallelDocs storage layout

## Repository root

- **Config**: `.parallel-docs.toml` (TOML). Omitted keys use built-in defaults.
- **Storage root**: defaults to `.parallel-docs/` under the repository root.

## Directories

- **`.parallel-docs/source/`**: paired **parallel-docs** (Markdown) for each source file—what you author _in parallel_docs_ (see vocabulary below).
- **`.parallel-docs/metadata/`**: Machine-oriented JSON (indices, fingerprints, diagnostics).

## Vocabulary: ParallelDocs the tool vs parallel-docs the writing

<!-- #region parallelDocs:storage-vocabulary -->

- **ParallelDocs** (capital **C**): the project, CLI, editor extension, and render stack in this repository.
- **parallel-docs** (lowercase, uncountable): the **documentation language**—the practice of keeping narrative, diagrams, and rationale in paired Markdown under `.parallel-docs/source/` instead of bloating the primary file. You _write in parallel_docs_, _review in parallel_docs_, or _onboard through parallel_docs_ alongside the code.

Example: _“We have to document our architecture in parallel-docs so that newcomers can have an effective source code onboarding experience.”_

Implementation detail: each file is still Markdown on disk; the path layout is defined in the next section.

<!-- #endregion parallelDocs:storage-vocabulary -->

## ParallelDocs file naming

Given a **repo-relative** primary file path `P` (POSIX-style, no `..` segments), the parallel-docs Markdown path is:

```text
.parallel-docs/source/{P}.md
```

Examples:

- `src/server.ts` → `.parallel-docs/source/src/server.ts.md`
- `README.md` → `.parallel-docs/source/README.md.md`

The mapping is intentionally transparent: append `.md` to the original path under a stable prefix.

This is the **single-angle (implicit default)** layout: one parallel-docs Markdown file per primary file.

## Angles (named perspectives on the same source)

Sometimes one source file deserves **more than one** parallelDocs: an **Introduction**, an **Architecture** walkthrough, a **Meeting notes** angle, and so on. ParallelDocs calls these **Angles**.

### Configuration (`.parallel-docs.toml`)

The `[angles]` table is optional:

- **`default_angle`** — Angle id selected by default in tooling (e.g. VS Code) and as the initial tab on the static hub when several angles exist. When `[[angles.definitions]]` is non-empty, this id must match one of the listed definitions (validated at config merge).
- **`[[angles.definitions]]`** — Optional list of `{ id, title? }` rows. Titles are for UI labels (e.g. VS Code angle picker); if omitted, the id is shown.

You can set `default_angle` alone to prefer a disk angle before the definitions table is filled in.

The VS Code extension exposes **Add angle to project** (writes `[angles]` in `.parallel-docs.toml` and creates the sentinel) and **Open parallel-docs beside source (pick angle)** once Angles layout is enabled.

### On-disk layout: sentinel `{storage}/source/.default`

<!-- #region parallelDocs:storage-angles-sentinel -->

Angles use a **different directory shape** than the flat default. The switch is explicit and file-system driven:

- **No** path `{storage}/source/.default` → only the **flat** layout above (`.parallel-docs/source/{P}.md`).
- **Any** file or directory at `{storage}/source/.default` → the repo opts into **per-source folders** under `source/`. For each repo-relative primary path `P` and Angle id `A` (see `@parallel-docs/core` `assertValidAngleId`: `[a-zA-Z0-9_-]{1,64}`):

```text
{storage}/source/{P}/{A}.md
```

Examples (default `storage.dir = .parallel-docs`):

- `README.md` + angle `architecture` → `.parallel-docs/source/README.md/architecture.md`
- `src/app.ts` + angle `introduction` → `.parallel-docs/source/src/app.ts/introduction.md`

The sentinel `.default` does not by itself pick which Angle is “default” for a file; that remains **`angles.default_angle`** in TOML (and, when definitions are empty, convention in tooling may still treat a primary angle id as configured or as the only file present).

**Migration from flat layout:** run **`parallel-docs migrate-angles`** (optional `--angle-id`, default `main`, and `--dry-run`). It moves every flat companion `{storage}/source/{P}.md` → `{storage}/source/{P}/{angle}.md`, creates the **`.default`** sentinel, merges **`[angles]`** into `.parallel-docs.toml`, rewrites **`[static_site].parallel_docs_markdown`** when it pointed at a moved file, and updates **`index.json`** keys via `byParallelDocsPath`. The schema-only command remains **`parallel-docs migrate`** (`packages/core/src/migrate.ts`). You can still adopt Angles manually (VS Code **ParallelDocs: Add angle to project…** or hand edits) if you prefer not to bulk-move files.

<!-- #endregion parallelDocs:storage-angles-sentinel -->

## GitHub Pages static browser (single `index.html`)

<!-- #region parallelDocs:storage-static-browser -->

The Pages build emits **one** HTML file: one **code** pane (`static_site.default_source_file`; deprecated alias `static_site.source_file`) and one or more **parallel-docs** bodies. When **Angles** are enabled and **two or more** definitions on disk exist for that source, the hub renders an **Angle** `<select>` and swaps the parallel-docs pane client-side (stretch layout is skipped in that mode). Default hub pairing can be derived from `static_site.default_angle`; an explicit `static_site.parallel_docs_markdown` still overrides. When `.parallel-docs/metadata/index.json` lists **blocks** for the active pair and the Markdown has matching `<!-- parallelDocs:block id=… -->` markers, a single-angle build can still use a **single-scroll, blame-style table** (one row per block) instead of dual panes.

- **`[[static_site.related_github_files]]`** — optional rows with repo-relative `path` and optional `label` (defaults to the file’s basename). When `static_site.github_url` is a GitHub **repository home** URL (`https://github.com/owner/repo`), the toolbar gains **Also on GitHub** links to `…/blob/<branch>/path` so readers can jump to other Markdown or code on GitHub. Set **`static_site.github_blob_branch`** when your default branch is not `main`.
- **Search** — **Escape** clears the query and hides hit results (same as the **Clear** control). The Pages build uses **scoped search**: only **parallel-docs Markdown** (and path labels), not every line of the primary source file, plus a sidecar **`parallel-docs-nav-search.json`**. That JSON is built from **every pair in** `.parallel-docs/metadata/index.json` **`byParallelDocsPath`** (so multiple angles for the same `sourcePath` appear as separate rows **when indexed**). When the index is **empty**, the build falls back to **one** pair from `[static_site]` only—it does **not** scan `source/{P}/*.md` on disk, so unindexed angle files are **omitted** from hub search on Pages.
- **Generator / build stamp** — emitted HTML includes `<meta name="generator" content="ParallelDocs @parallel-docs/render@…; @parallel-docs/code-parallel-docs-static@…; builtAt=…">` (ISO instant) when the default generator is used, and a footer with that instant as `<time datetime>` plus a locale-formatted local date/time with timezone from the build machine. Omit the meta tag by passing an empty `generatorLabel` from the static builder API.

<!-- #endregion parallelDocs:storage-static-browser -->

## Images and other local assets (static HTML)

Local `a[href]` / `img[src]` in parallel-docs Markdown are rewritten for static HTML (`parallel-docs render`, Pages) to paths **relative to the output file**. **`https:`**, **`mailto:`**, … are unchanged.

- **`a[href]`:** target must stay **inside the repo** (leading **`/`** = repo root; otherwise **CommonMark paths from the `.md`’s directory**—same as the VS Code Markdown preview).
- **`img[src]`:** target must stay **inside `{storage}/`** (e.g. `.parallel-docs/`). Otherwise static HTML **drops** `src`.

Put files **next to the companion `.md`** (e.g. `./assets/diagram.svg`) so editor completions and static output match. Diagrams elsewhere: use **`https://…`**, not **`![](/docs/…)`** as a local image.

Dogfood: [`assets/paired-editors.svg`](../../.parallel-docs/source/README.md/assets/paired-editors.svg) beside [`main.md`](../../.parallel-docs/source/README.md/main.md). Maintainer captures: **`bash scripts/refresh-root-readme-screenshots.sh`** (or `npm run extension:parallel-docs-screenshots`), then save under **`./assets/`** next to that angle’s `.md`. VS Code extension README PNGs: **`bash scripts/refresh-vscode-readme-screenshots-desktop.sh`** and companion **`.parallel-docs/source/packages/vscode/README.md/main.md`** (Maintainer).

## Metadata

The default index file is:

```text
.parallel-docs/metadata/index.json
```

It is plain JSON with a `schemaVersion` field so migrations remain explicit and auditable.

# SideTrack storage layout

## Repository root

- **Config**: `.sidetrack.toml` (TOML). Omitted keys use built-in defaults.
- **Storage root**: defaults to `.sidetrack/` under the repository root.

## Directories

- **`.sidetrack/source/`**: paired **sidetrack** (Markdown) for each source file—what you author _in sidetrack_ (see vocabulary below).
- **`.sidetrack/metadata/`**: Machine-oriented JSON (indices, fingerprints, diagnostics).

## Vocabulary: SideTrack the tool vs sidetrack the writing

<!-- #region sidetrack:storage-vocabulary -->

- **SideTrack** (capital **C**): the project, CLI, editor extension, and render stack in this repository.
- **sidetrack** (lowercase, uncountable): the **documentation language**—the practice of keeping narrative, diagrams, and rationale in paired Markdown under `.sidetrack/source/` instead of bloating the primary file. You _write in sidetrack_, _review in sidetrack_, or _onboard through sidetrack_ alongside the code.

Example: _“We have to document our architecture in sidetrack so that newcomers can have an effective source code onboarding experience.”_

Implementation detail: each file is still Markdown on disk; the path layout is defined in the next section.

<!-- #endregion sidetrack:storage-vocabulary -->

## SideTrack file naming

Given a **repo-relative** primary file path `P` (POSIX-style, no `..` segments), the sidetrack Markdown path is:

```text
.sidetrack/source/{P}.md
```

Examples:

- `src/server.ts` → `.sidetrack/source/src/server.ts.md`
- `README.md` → `.sidetrack/source/README.md.md`

The mapping is intentionally transparent: append `.md` to the original path under a stable prefix.

This is the **single-angle (implicit default)** layout: one sidetrack Markdown file per primary file.

## Angles (named perspectives on the same source)

Sometimes one source file deserves **more than one** sidetrack: an **Introduction**, an **Architecture** walkthrough, a **Meeting notes** angle, and so on. SideTrack calls these **Angles**.

### Configuration (`.sidetrack.toml`)

The `[angles]` table is optional:

- **`default_angle`** — Angle id selected by default in tooling (e.g. VS Code) and as the initial tab on the static hub when several angles exist. When `[[angles.definitions]]` is non-empty, this id must match one of the listed definitions (validated at config merge).
- **`[[angles.definitions]]`** — Optional list of `{ id, title? }` rows. Titles are for UI labels (e.g. VS Code angle picker); if omitted, the id is shown.

You can set `default_angle` alone to prefer a disk angle before the definitions table is filled in.

The VS Code extension exposes **Add angle to project** (writes `[angles]` in `.sidetrack.toml` and creates the sentinel) and **Open sidetrack beside source (pick angle)** once Angles layout is enabled.

### On-disk layout: sentinel `{storage}/source/.default`

<!-- #region sidetrack:storage-angles-sentinel -->

Angles use a **different directory shape** than the flat default. The switch is explicit and file-system driven:

- **No** path `{storage}/source/.default` → only the **flat** layout above (`.sidetrack/source/{P}.md`).
- **Any** file or directory at `{storage}/source/.default` → the repo opts into **per-source folders** under `source/`. For each repo-relative primary path `P` and Angle id `A` (see `@sidetrack/core` `assertValidAngleId`: `[a-zA-Z0-9_-]{1,64}`):

```text
{storage}/source/{P}/{A}.md
```

Examples (default `storage.dir = .sidetrack`):

- `README.md` + angle `architecture` → `.sidetrack/source/README.md/architecture.md`
- `src/app.ts` + angle `introduction` → `.sidetrack/source/src/app.ts/introduction.md`

The sentinel `.default` does not by itself pick which Angle is “default” for a file; that remains **`angles.default_angle`** in TOML (and, when definitions are empty, convention in tooling may still treat a primary angle id as configured or as the only file present).

**Migration from flat layout:** run **`sidetrack migrate-angles`** (optional `--angle-id`, default `main`, and `--dry-run`). It moves every flat companion `{storage}/source/{P}.md` → `{storage}/source/{P}/{angle}.md`, creates the **`.default`** sentinel, merges **`[angles]`** into `.sidetrack.toml`, rewrites **`[static_site].sidetrack_markdown`** when it pointed at a moved file, and updates **`index.json`** keys via `bySideTrackPath`. The schema-only command remains **`sidetrack migrate`** (`packages/core/src/migrate.ts`). You can still adopt Angles manually (VS Code **SideTrack: Add angle to project…** or hand edits) if you prefer not to bulk-move files.

<!-- #endregion sidetrack:storage-angles-sentinel -->

## GitHub Pages static browser (single `index.html`)

<!-- #region sidetrack:storage-static-browser -->

The Pages build emits **one** HTML file: one **code** pane (`static_site.default_source_file`; deprecated alias `static_site.source_file`) and one or more **sidetrack** bodies. When **Angles** are enabled and **two or more** definitions on disk exist for that source, the hub renders an **Angle** `<select>` and swaps the sidetrack pane client-side (stretch layout is skipped in that mode). Default hub pairing can be derived from `static_site.default_angle`; an explicit `static_site.sidetrack_markdown` still overrides. When `.sidetrack/metadata/index.json` lists **blocks** for the active pair and the Markdown has matching `<!-- sidetrack:block id=… -->` markers, a single-angle build can still use a **single-scroll, blame-style table** (one row per block) instead of dual panes.

- **`[[static_site.related_github_files]]`** — optional rows with repo-relative `path` and optional `label` (defaults to the file’s basename). When `static_site.github_url` is a GitHub **repository home** URL (`https://github.com/owner/repo`), the toolbar gains **Also on GitHub** links to `…/blob/<branch>/path` so readers can jump to other Markdown or code on GitHub. Set **`static_site.github_blob_branch`** when your default branch is not `main`.
- **Search** — **Escape** clears the query and hides hit results (same as the **Clear** control). The Pages build uses **scoped search**: only **sidetrack Markdown** (and path labels), not every line of the primary source file, plus a sidecar **`sidetrack-nav-search.json`**. That JSON is built from **every pair in** `.sidetrack/metadata/index.json` **`bySideTrackPath`** (so multiple angles for the same `sourcePath` appear as separate rows **when indexed**). When the index is **empty**, the build falls back to **one** pair from `[static_site]` only—it does **not** scan `source/{P}/*.md` on disk, so unindexed angle files are **omitted** from hub search on Pages.
- **Generator / build stamp** — emitted HTML includes `<meta name="generator" content="SideTrack @sidetrack/render@…; @sidetrack/code-sidetrack-static@…; builtAt=…">` (ISO instant) when the default generator is used, and a footer with that instant as `<time datetime>` plus a locale-formatted local date/time with timezone from the build machine. Omit the meta tag by passing an empty `generatorLabel` from the static builder API.

<!-- #endregion sidetrack:storage-static-browser -->

## Images and other local assets (static HTML)

Local `a[href]` / `img[src]` in sidetrack Markdown are rewritten for static HTML (`sidetrack render`, Pages) to paths **relative to the output file**. **`https:`**, **`mailto:`**, … are unchanged.

- **`a[href]`:** target must stay **inside the repo** (leading **`/`** = repo root; otherwise **CommonMark paths from the `.md`’s directory**—same as the VS Code Markdown preview).
- **`img[src]`:** target must stay **inside `{storage}/`** (e.g. `.sidetrack/`). Otherwise static HTML **drops** `src`.

Put files **next to the companion `.md`** (e.g. `./assets/diagram.svg`) so editor completions and static output match. Diagrams elsewhere: use **`https://…`**, not **`![](/docs/…)`** as a local image.

Dogfood: [`assets/paired-editors.svg`](../../.sidetrack/source/README.md/assets/paired-editors.svg) beside [`main.md`](../../.sidetrack/source/README.md/main.md). Maintainer captures: **`bash scripts/refresh-root-readme-screenshots.sh`** (or `npm run extension:sidetrack-screenshots`), then save under **`./assets/`** next to that angle’s `.md`. VS Code extension README PNGs: **`bash scripts/refresh-vscode-readme-screenshots-desktop.sh`** and companion **`.sidetrack/source/packages/vscode/README.md/main.md`** (Maintainer).

## Metadata

The default index file is:

```text
.sidetrack/metadata/index.json
```

It is plain JSON with a `schemaVersion` field so migrations remain explicit and auditable.

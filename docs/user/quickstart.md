# Quickstart

Goal: a **clean primary file** stays in place; **sidetrack** (Markdown under `.sidetrack/source/`) holds the narrative, tied together by config and optional **blocks** in the metadata index.

## Prerequisites

- A **Git** checkout (recommended): hooks and many diagnostics assume `.git` exists.
- The **CLI** available one of the ways in [Install](install.md)—including **`npx sidetrack`** (no global install); **`npx sidetrack --help`** shows `Usage: sidetrack [options] [command]`.

Commands below assume your **shell’s current directory** is the **repository root** (or a subdirectory—SideTrack walks up for `.sidetrack.toml`, then `.git`, then falls back to cwd for first-time `init`).

## 1. Initialize the workspace

```bash
sidetrack init
```

This is **idempotent**: it ensures `.sidetrack/`, a starter **`.sidetrack/metadata/index.json`** if missing, **`.sidetrack.toml`** if missing, refreshes index migrations, merges the **SideTrack** VS Code extension into `.vscode/extensions.json` when safe, and runs **`sidetrack validate`**. Exit code **1** means validation reported **errors** (fix them before relying on hooks or any **`validate`** step you run in CI).

Optional: install the **pre-commit** fragment so commits run validate when `sidetrack` is on `PATH`:

```bash
sidetrack init scm
```

## 2. Open the paired sidetrack path for a source file

Convention: **flat** layout (no `{storage}/source/.default`): repo-relative primary path `P` → **`.sidetrack/source/{P}.md`** (append `.md` to `P`; POSIX slashes; no `..`). **Angles** layout (sentinel present): **`.sidetrack/source/{P}/{angle}.md`**. Examples (flat):

- `README.md` → `.sidetrack/source/README.md.md`
- `src/app.ts` → `.sidetrack/source/src/app.ts.md`

To move an existing flat tree to Angles folders and `[angles]` in one step: **`sidetrack migrate-angles`** (use `--dry-run` first; see [storage spec](../spec/storage.md)).

Print the path for any file:

```bash
sidetrack paths src/app.ts
```

Create the Markdown file (empty is fine to start). Write prose under optional **`<!-- sidetrack:block id=… -->`** markers when you use blocks; see [Keeping blocks in sync](keeping-blocks-in-sync.md). For **`marker:`** blocks, pair delimiters in the primary file match the editor language — see [Source region delimiters](source-region-delimiters.md).

## 3. Validate

```bash
sidetrack validate
```

**0** = no errors (warnings may still print). **1** = schema, anchors, markers, or other **errors**—see messages on stderr.

For environment hints (e.g. missing `.git`):

```bash
sidetrack doctor
```

## 4. Edit in the editor

Install **`d-led.sidetrack-vscode`** ([Install](install.md)). Use commands such as **Open sidetrack beside source** and **Add block from selection** where available; validation output appears in a **SideTrack** output channel.

## Where to go next

| Topic                              | Doc                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Blocks, index, anchors             | [Keeping blocks in sync](keeping-blocks-in-sync.md)                                                                |
| What runs where (hook, CI, editor) | [What SideTrack detects](detection.md)                                                                             |
| All CLI commands                   | [CLI reference](cli.md)                                                                                            |
| `.sidetrack.toml` keys             | [Configuration](config.md)                                                                                         |
| Normative detail                   | [`docs/spec/storage.md`](../spec/storage.md), [`anchors.md`](../spec/anchors.md), [`blocks.md`](../spec/blocks.md) |

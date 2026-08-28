# Quickstart

Goal: a **clean primary file** stays in place; **parallel-docs** (Markdown under `.parallel-docs/source/`) holds the narrative, tied together by config and optional **blocks** in the metadata index.

## Prerequisites

- A **Git** checkout (recommended): hooks and many diagnostics assume `.git` exists.
- The **CLI** available one of the ways in [Install](install.md)—including **`npx parallel-docs`** (no global install); **`npx parallel-docs --help`** shows `Usage: parallel-docs [options] [command]`.

Commands below assume your **shell’s current directory** is the **repository root** (or a subdirectory—ParallelDocs walks up for `.parallel-docs.toml`, then `.git`, then falls back to cwd for first-time `init`).

## 1. Initialize the workspace

```bash
parallel-docs init
```

This is **idempotent**: it ensures `.parallel-docs/`, a starter **`.parallel-docs/metadata/index.json`** if missing, **`.parallel-docs.toml`** if missing, refreshes index migrations, merges the **ParallelDocs** VS Code extension into `.vscode/extensions.json` when safe, and runs **`parallel-docs validate`**. Exit code **1** means validation reported **errors** (fix them before relying on hooks or any **`validate`** step you run in CI).

Optional: install the **pre-commit** fragment so commits run validate when `parallel-docs` is on `PATH`:

```bash
parallel-docs init scm
```

## 2. Open the paired parallel-docs path for a source file

Convention: **flat** layout (no `{storage}/source/.default`): repo-relative primary path `P` → **`.parallel-docs/source/{P}.md`** (append `.md` to `P`; POSIX slashes; no `..`). **Angles** layout (sentinel present): **`.parallel-docs/source/{P}/{angle}.md`**. Examples (flat):

- `README.md` → `.parallel-docs/source/README.md.md`
- `src/app.ts` → `.parallel-docs/source/src/app.ts.md`

To move an existing flat tree to Angles folders and `[angles]` in one step: **`parallel-docs migrate-angles`** (use `--dry-run` first; see [storage spec](../spec/storage.md)).

Print the path for any file:

```bash
parallel-docs paths src/app.ts
```

Create the Markdown file (empty is fine to start). Write prose under optional **`<!-- parallelDocs:block id=… -->`** markers when you use blocks; see [Keeping blocks in sync](keeping-blocks-in-sync.md). For **`marker:`** blocks, pair delimiters in the primary file match the editor language — see [Source region delimiters](source-region-delimiters.md).

## 3. Validate

```bash
parallel-docs validate
```

**0** = no errors (warnings may still print). **1** = schema, anchors, markers, or other **errors**—see messages on stderr.

For environment hints (e.g. missing `.git`):

```bash
parallel-docs doctor
```

## 4. Edit in the editor

Install **`d-led.parallel-docs`** ([Install](install.md)). Use commands such as **Open parallel-docs beside source** and **Add block from selection** where available; validation output appears in a **ParallelDocs** output channel.

## Where to go next

| Topic                              | Doc                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Blocks, index, anchors             | [Keeping blocks in sync](keeping-blocks-in-sync.md)                                                                |
| What runs where (hook, CI, editor) | [What ParallelDocs detects](detection.md)                                                                          |
| All CLI commands                   | [CLI reference](cli.md)                                                                                            |
| `.parallel-docs.toml` keys         | [Configuration](config.md)                                                                                         |
| Normative detail                   | [`docs/spec/storage.md`](../spec/storage.md), [`anchors.md`](../spec/anchors.md), [`blocks.md`](../spec/blocks.md) |

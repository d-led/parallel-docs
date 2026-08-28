# Troubleshooting

Short answers for the most common friction. For the **operational contract** on blocks and anchors, see [Keeping blocks in sync](keeping-blocks-in-sync.md).

## `parallel-docs validate` fails after I “only” edited prose

- **Markdown marker ↔ index:** Every **`<!-- parallelDocs:block id=… -->`** must match **`blocks[].id`** in **`.parallel-docs/metadata/index.json`** for that companion file.
- **`lines:` anchors:** Line insertions or deletions in the **source** file can invalidate stored ranges—update **`anchor`** (and optional **`snippet`**) or switch to **`marker:`** regions for moving targets.

## `parallel-docs init scm` says there is no `.git`

Initialize Git first (`git init`) or run the command from the **repository root** that contains **`.git`**.

## Pre-commit never runs ParallelDocs

- Confirm **`parallel-docs`** is on **`PATH`** in the same environment Git uses for hooks (GUI clients sometimes differ).
- Open **`.git/hooks/pre-commit`** and verify the **ParallelDocs** block is present and not short-circuited by an earlier **`exit`**.
- For ad hoc or CI runs without a global install, **`npx parallel-docs …`** works the same way; **`npx parallel-docs --help`** prints **`Usage: parallel-docs [options] [command]`** (hooks still need either **`PATH`** or an explicit **`npx`** / full path in the hook script).

## macOS blocks the downloaded CLI binary

See [Development → macOS quarantine (standalone CLI)](../development.md#macos-quarantine-standalone-cli).

## `PARALLEL_DOCS_SEA_NODE` / binary build complaints

Local **SEA** builds want a Node layout compatible with the bundling step. Point **`PARALLEL_DOCS_SEA_NODE`** at a **nodejs.org**-style binary matching CI’s major version. Details: [Development → Building binaries locally](../development.md#building-binaries-locally).

## Extension does not open the file I expect

- **Angles:** If **`.parallel-docs/source/.default`** exists, paths are **`source/{primaryPath}/{angle}.md`**—not the flat **`{primaryPath}.md`** layout. See [`docs/spec/storage.md`](../spec/storage.md).
- Run **`parallel-docs paths my/file.ts`** to print the conventional flat path; compare with your **`.parallel-docs.toml`** and on-disk layout.

## Still stuck

Run **`parallel-docs doctor`** from the repo root and read the combined **`validate`** + environment messages. For behavior definitions, see [What ParallelDocs detects](detection.md) and the specs linked from [Quickstart](quickstart.md).

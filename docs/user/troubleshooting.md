# Troubleshooting

Short answers for the most common friction. For the **operational contract** on blocks and anchors, see [Keeping blocks in sync](keeping-blocks-in-sync.md).

## `sidetrack validate` fails after I “only” edited prose

- **Markdown marker ↔ index:** Every **`<!-- sidetrack:block id=… -->`** must match **`blocks[].id`** in **`.sidetrack/metadata/index.json`** for that companion file.
- **`lines:` anchors:** Line insertions or deletions in the **source** file can invalidate stored ranges—update **`anchor`** (and optional **`snippet`**) or switch to **`marker:`** regions for moving targets.

## `sidetrack init scm` says there is no `.git`

Initialize Git first (`git init`) or run the command from the **repository root** that contains **`.git`**.

## Pre-commit never runs SideTrack

- Confirm **`sidetrack`** is on **`PATH`** in the same environment Git uses for hooks (GUI clients sometimes differ).
- Open **`.git/hooks/pre-commit`** and verify the **SideTrack** block is present and not short-circuited by an earlier **`exit`**.
- For ad hoc or CI runs without a global install, **`npx sidetrack …`** works the same way; **`npx sidetrack --help`** prints **`Usage: sidetrack [options] [command]`** (hooks still need either **`PATH`** or an explicit **`npx`** / full path in the hook script).

## macOS blocks the downloaded CLI binary

See [Development → macOS quarantine (standalone CLI)](../development.md#macos-quarantine-standalone-cli).

## `SIDETRACK_SEA_NODE` / binary build complaints

Local **SEA** builds want a Node layout compatible with the bundling step. Point **`SIDETRACK_SEA_NODE`** at a **nodejs.org**-style binary matching CI’s major version. Details: [Development → Building binaries locally](../development.md#building-binaries-locally).

## Extension does not open the file I expect

- **Angles:** If **`.sidetrack/source/.default`** exists, paths are **`source/{primaryPath}/{angle}.md`**—not the flat **`{primaryPath}.md`** layout. See [`docs/spec/storage.md`](../spec/storage.md).
- Run **`sidetrack paths my/file.ts`** to print the conventional flat path; compare with your **`.sidetrack.toml`** and on-disk layout.

## Still stuck

Run **`sidetrack doctor`** from the repo root and read the combined **`validate`** + environment messages. For behavior definitions, see [What SideTrack detects](detection.md) and the specs linked from [Quickstart](quickstart.md).

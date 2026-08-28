# CLI reference

All commands resolve the **repository root** from the current working directory: nearest **`.sidetrack.toml`**, else nearest **`.git`**, else **cwd** (so first-time **`sidetrack init`** can bootstrap a fresh folder).

**How to invoke:** global **`sidetrack`** (see [Install](install.md)), a project **`node_modules/.bin/sidetrack`**, or **`npx sidetrack`** for a one-off run against the published package. **`npx sidetrack --help`** (or **`sidetrack --help`** when on `PATH`) prints **`Usage: sidetrack [options] [command]`** and lists subcommands.

**`sidetrack <command> --help`** lists flags for that command.

## Commands

| Command                                | Purpose                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sidetrack init`**                   | Idempotent setup: storage dirs, `index.json` if missing, `.sidetrack.toml` if missing, VS Code extension recommendation merge when mergeable, index migrations, then **`validate`**. |
| **`sidetrack init config`**            | Write commented **`.sidetrack.toml`** defaults. **`--force`** replaces an existing file.                                                                                             |
| **`sidetrack init scm`**               | Install or refresh the **pre-commit** block that runs **`sidetrack validate`** (requires **`.git`**).                                                                                |
| **`sidetrack validate`**               | Schema, anchors, markers, index keys, SCM-backed checks.                                                                                                                             |
| **`sidetrack doctor`**                 | **`validate`** plus environment hints (e.g. missing **`.git`**).                                                                                                                     |
| **`sidetrack migrate`**                | Rewrite **`index.json`** to the current schema / normalization on disk.                                                                                                              |
| **`sidetrack sync-moved-paths`**       | Rewrite index paths using **Git rename detection** between **`--from`** and **`--to`** tree-ish (defaults `HEAD~1` → `HEAD`). **`--dry-run`** lists without writing.                 |
| **`sidetrack convert-source-markers`** | Rewrite **`marker:`** region delimiters in a **source** file to match a VS Code **language** id. **`--file`** (repo-relative), **`--language`**, optional **`--dry-run`**.           |
| **`sidetrack paths <file>`**           | Print conventional **sidetrack** Markdown path for a repo-relative **source** file.                                                                                                  |
| **`sidetrack render`**                 | Side-by-side HTML. **`--source`**, **`--markdown`**, **`--out`** default from **`[static_site]`** and conventions; **`--mermaid`** injects runtime.                                  |

## Exit codes

| Code  | When                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Success: no validation **errors** for validate-style commands; nothing to do; dry-run completed.                                                                                                           |
| **1** | Validation **errors**; missing **`index.json`** where required; **`init scm`** without **`.git`**; **`sync-moved-paths`** / **`convert-source-markers`** failures (Git errors, missing file, and similar). |

Warnings from **`validate`** / **`doctor`** do **not** force exit **1**.

## Environment variables

| Variable                 | Used for                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`SIDETRACK_EDITOR`**   | Repo scripts that launch an editor (`code` vs `cursor`, etc.). See root [`README.md`](../../README.md).                                                                                                         |
| **`SIDETRACK_SEA_NODE`** | Local **standalone binary** builds: point at a **nodejs.org**-style Node binary when Homebrew’s Node is unsuitable. See [Development → Building binaries locally](../development.md#building-binaries-locally). |

## See also

- [Configuration](config.md) — `.sidetrack.toml`.
- [What SideTrack detects](detection.md) — hook vs CLI vs editor.

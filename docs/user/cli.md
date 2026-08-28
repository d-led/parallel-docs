# CLI reference

All commands resolve the **repository root** from the current working directory: nearest **`.parallel-docs.toml`**, else nearest **`.git`**, else **cwd** (so first-time **`parallel-docs init`** can bootstrap a fresh folder).

**How to invoke:** global **`parallel-docs`** (see [Install](install.md)), a project **`node_modules/.bin/parallel-docs`**, or **`npx parallel-docs`** for a one-off run against the published package. **`npx parallel-docs --help`** (or **`parallel-docs --help`** when on `PATH`) prints **`Usage: parallel-docs [options] [command]`** and lists subcommands.

**`parallel-docs <command> --help`** lists flags for that command.

## Commands

| Command                                    | Purpose                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`parallel-docs init`**                   | Idempotent setup: storage dirs, `index.json` if missing, `.parallel-docs.toml` if missing, VS Code extension recommendation merge when mergeable, index migrations, then **`validate`**. |
| **`parallel-docs init config`**            | Write commented **`.parallel-docs.toml`** defaults. **`--force`** replaces an existing file.                                                                                             |
| **`parallel-docs init scm`**               | Install or refresh the **pre-commit** block that runs **`parallel-docs validate`** (requires **`.git`**).                                                                                |
| **`parallel-docs validate`**               | Schema, anchors, markers, index keys, SCM-backed checks.                                                                                                                                 |
| **`parallel-docs doctor`**                 | **`validate`** plus environment hints (e.g. missing **`.git`**).                                                                                                                         |
| **`parallel-docs migrate`**                | Rewrite **`index.json`** to the current schema / normalization on disk.                                                                                                                  |
| **`parallel-docs sync-moved-paths`**       | Rewrite index paths using **Git rename detection** between **`--from`** and **`--to`** tree-ish (defaults `HEAD~1` → `HEAD`). **`--dry-run`** lists without writing.                     |
| **`parallel-docs convert-source-markers`** | Rewrite **`marker:`** region delimiters in a **source** file to match a VS Code **language** id. **`--file`** (repo-relative), **`--language`**, optional **`--dry-run`**.               |
| **`parallel-docs paths <file>`**           | Print conventional **parallel-docs** Markdown path for a repo-relative **source** file.                                                                                                  |
| **`parallel-docs render`**                 | Side-by-side HTML. **`--source`**, **`--markdown`**, **`--out`** default from **`[static_site]`** and conventions; **`--mermaid`** injects runtime.                                      |

## Exit codes

| Code  | When                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Success: no validation **errors** for validate-style commands; nothing to do; dry-run completed.                                                                                                           |
| **1** | Validation **errors**; missing **`index.json`** where required; **`init scm`** without **`.git`**; **`sync-moved-paths`** / **`convert-source-markers`** failures (Git errors, missing file, and similar). |

Warnings from **`validate`** / **`doctor`** do **not** force exit **1**.

## Environment variables

| Variable                     | Used for                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`PARALLEL_DOCS_EDITOR`**   | Repo scripts that launch an editor (`code` vs `cursor`, etc.). See root [`README.md`](../../README.md).                                                                                                         |
| **`PARALLEL_DOCS_SEA_NODE`** | Local **standalone binary** builds: point at a **nodejs.org**-style Node binary when Homebrew’s Node is unsuitable. See [Development → Building binaries locally](../development.md#building-binaries-locally). |

## See also

- [Configuration](config.md) — `.parallel-docs.toml`.
- [What ParallelDocs detects](detection.md) — hook vs CLI vs editor.

# Keeping blocks, regions, and metadata consistent

ParallelDocs ties three surfaces together. If they drift apart, validation fails, scroll sync misaligns, or parallel-docs points at the wrong lines. This guide is the **operational contract**: what must match, how to check it, and what to do when it breaks.

## The three surfaces (and what each owns)

| Surface             | Location                                            | What you must keep aligned                                                                                                                    |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Index**        | `.parallel-docs/metadata/index.json`                | Per companion file: `sourcePath`, `parallelDocsPath`, and each block’s `id`, `anchor`, optional `snippet` / `markerId` / verification fields. |
| **B. Markdown**     | `.parallel-docs/source/…/*.md` (or per-angle paths) | For each block: a line `<!-- parallelDocs:block id=<id> -->` **with the same `id` as the index**, then prose below it.                        |
| **C. Primary file** | Repo source (e.g. `src/foo.ts`)                     | Depends on anchor type (see below): either **line numbers** implied by `lines:…` or **explicit region comments** for `marker:…`.              |

**Rule of thumb:** the index **`block.id`** and the Markdown **marker id** must always be identical strings. The **`anchor`** in the index describes how to find the span in **C**; it does not replace **B**.

## Anchor types: maintenance cost vs drift resistance

### `lines:<start>-<end>` (line range)

- **Pros:** No comments in source; good for generated or policy-locked files.
- **Cons:** Editing the file moves lines; **`anchor` and optional `snippet` in the index** can become wrong until you update them (or run tooling that refreshes them).
- **Consistency:** After refactors, re-check ranges. Use **`parallel-docs validate`**; fix `anchor` (and snippet if you use it) so they still describe the intended span.

### `marker:<id>` (named region in source)

- **Pros:** Tools resolve the span from **paired delimiters** in the source (`//#region parallelDocs:<id>` … `//#endregion`, or `parallelDocs:start id=<id>` / `parallelDocs:end` where regions are not idiomatic). Renumbering lines **inside** the region does not break the link.
- **Cons:** Markers live in the primary file; reviewers must accept them. **`markerId` in the index** (when present) must stay consistent with **`marker:`** resolution rules (see [anchors.md](../spec/anchors.md)).
- **Consistency:** Never rename a region id in source without updating **`marker:`** / **`markerId`** and the Markdown **`id=`** and index **`id`** to the same new token. Use **`parallel-docs convert-source-markers`** if you change language/comment style.

See **[Source region delimiters (by editor language)](source-region-delimiters.md)** for a table of delimiter shapes by VS Code `languageId`, and [blocks.md — Source markers](../spec/blocks.md#source-markers-language-dependent) for the normative narrative.

## Single checklist: “is this block still coherent?”

For each block, all of the following must hold:

1. **Index** `blocks[].id` equals the Markdown `<!-- parallelDocs:block id=… -->` id (same string).
2. **Index** `entry.sourcePath` and `entry.parallelDocsPath` match the files you think you paired; the JSON object key must equal `parallelDocsPath`.
3. **`anchor`** parses (see [anchors.md](../spec/anchors.md)).
4. If **`marker:`** anchor: source contains a well-formed pair for that id; **`parallel-docs validate`** must not report marker pairing errors for that file.
5. If **`lines:`** anchor: `start`–`end` are within the file and describe the intended lines; update after line insert/delete if the parallel-docs should move with different lines.
6. Optional **`snippet`**: records trimmed source lines for `lines:` anchors; update when you intentionally change the anchored span (see [blocks.md](../spec/blocks.md) — “Drift and snippets”).

## Commands and when to run them

Run these from the **repository root** (or ensure `parallel-docs` resolves paths the same way your workspace does).

| Command                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`parallel-docs init`**                                                 | Ensures dirs + `index.json`, creates `.parallel-docs.toml` if missing, runs migrations/normalization, merges **`d-led.parallel-docs-vscode`** into `.vscode/extensions.json` when that file is valid mergeable JSON, then **validate**. Safe to repeat.                                                                                                           |
| **`parallel-docs validate`**                                             | Schema, index keys, marker pairing, marker uniqueness across files, marker/source alignment. When a **primary file is missing**, also prints **relocation hints** (Git `HEAD~1`→`HEAD` renames, marker matches in other indexed files, and a **bounded** scan of other **Git-tracked** source files for the same heuristics). **Use in CI** (exit `1` on errors). |
| **`parallel-docs doctor`**                                               | `validate` plus environment hints (e.g. missing `.git`).                                                                                                                                                                                                                                                                                                          |
| **`parallel-docs migrate`**                                              | Rewrites `index.json` when schema or snippet normalization changes (also applied automatically on read in many tools).                                                                                                                                                                                                                                            |
| **`parallel-docs sync-moved-paths`**                                     | After **Git renames/moves**, rewrites `sourcePath` / `parallelDocsPath` in the index using `git diff` rename detection. Does not fix anchors inside files—you still need to adjust `lines:` or regions if logic moved.                                                                                                                                            |
| **`parallel-docs convert-source-markers --file <path> --language <id>`** | Rewrites **source** region delimiter style to match a VS Code language id (dry-run first if unsure).                                                                                                                                                                                                                                                              |

**Editor:** “ParallelDocs: Validate workspace metadata” runs the same validation as the CLI and prints issues to the output channel.

**Git hook:** `parallel-docs init scm` installs a **pre-commit** fragment that runs **`parallel-docs validate`** when the CLI is on `PATH`. That catches index/markdown/source mistakes before they land on `main`.

## Workflows after common edits

### You moved or renamed a source or parallel-docs file (Git)

1. **`parallel-docs sync-moved-paths`** (optionally `--dry-run` first) to fix index paths.
2. **`parallel-docs validate`** — fix any remaining path or anchor issues.

### The index still references a primary that no longer exists

**Validate** reports a missing primary and **relocation hints**: Git renames in the last commit, **marker:** / **snippet:** matches in other indexed files, and (when this is a Git checkout) a **bounded** scan of other tracked source files. Use those messages to pick the right `sourcePath`, then run **`sync-moved-paths`** if Git renamed the file, or edit **`index.json`** when the move was copy-based or outside Git’s rename detection.

### You edited line numbers only (`lines:` anchors)

1. Open the source; decide the new first/last line of the documented span.
2. Update **`anchor`** in `index.json` for that block (and **`snippet`** if you rely on drift tooling).
3. Optionally adjust the Markdown heading text for humans—it is not authoritative for the span.
4. **`parallel-docs validate`**.

### You renamed a `marker:` id or merged regions

1. Update **source** delimiters, **index** `anchor` / `markerId`, **Markdown** marker `id=`, and **index** `id` so they all use the **same** new id.
2. **`parallel-docs convert-source-markers`** if only the comment _syntax_ changed.
3. **`parallel-docs validate`**.

### You added a new block

1. Add **`<!-- parallelDocs:block id=newid -->`** in the Markdown (new id must satisfy [anchors.md](../spec/anchors.md) id rules).
2. Append a **`blocks[]`** entry with the same **`id`**, correct **`anchor`**, and matching **`sourcePath`** / file key under **`byParallelDocsPath`**.
3. **`parallel-docs validate`**.

Using the VS Code command **“Add block from selection”** creates the marker, index entry, and opens the pair—prefer that for fewer copy-paste mistakes.

### You deleted a block

1. Remove the Markdown section (including its `<!-- parallelDocs:block … -->` line).
2. Remove the **`blocks[]`** entry (and remove **source** region markers if `marker:` was used).
3. **`parallel-docs validate`**.

## Staleness metadata (`lastVerifiedCommit` / `lastVerifiedBlob`)

These fields are **optional signals** for “a human checked this block against Git.” They do not auto-fix anchors. When you complete a review:

- Set **`lastVerifiedCommit`** to the full SHA of `HEAD` (or the commit you verified against).
- Set **`lastVerifiedBlob`** when you want the tool to compare the current blob of `sourcePath` at `HEAD`.

If you do not use them, leave them unset; validation will not treat that as an error.

## When metadata feels “not tenable”

If maintaining **`lines:`** ranges after every edit is painful:

1. Prefer **`marker:`** anchors + regions in source for the hot spots, **or**
2. Keep **`lines:`** but run **`parallel-docs validate`** in **pre-commit** and CI so mistakes are caught immediately, **or**
3. Use the **VS Code** flow to add blocks and validate from the editor.

ParallelDocs does **not** silently rewrite your primary source to match stale `lines:` anchors—that is intentional. The **tenable** path is: pick an anchor strategy that matches your team’s tolerance for source markers vs line churn, then **automate validation** so inconsistency never accumulates.

## Canonical spec links

- [blocks.md](../spec/blocks.md) — block model, Markdown markers, markers, drift, staleness.
- [anchors.md](../spec/anchors.md) — `lines:`, `marker:`, `symbol:` grammar and validation rules.
- [storage.md](../spec/storage.md) — paths, Angles, where files live.

## See also (user guides)

- [Install](install.md), [Quickstart](quickstart.md), [What ParallelDocs detects](detection.md), [CLI reference](cli.md), [Configuration](config.md), [Troubleshooting](troubleshooting.md)

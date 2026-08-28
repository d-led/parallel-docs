# What SideTrack detects (and where)

SideTrack spreads checks across **local hooks**, **CLI**, and the **editor**. Each layer catches different failures at different moments. None of them replace the others: use **hooks** on commits, **`sidetrack validate`** in CI or scripts for a full-tree scan, and **`doctor`** for troubleshooting; use the **extension** for feedback while you type. In **this** repository, **`bash scripts/quality-gate.sh`** (and therefore the GitHub Actions **quick** job) runs **`sidetrack validate`** after typecheck—the same command as the pre-commit hook, but without **`--staged`**, so the whole index and companion tree must be consistent before CI passes. A later job builds the static site and runs Cypress end-to-end checks; it does not repeat `sidetrack validate` because the quick job already did.

## Pre-commit hook (`sidetrack init scm`)

- **When:** Every `git commit`, at **pre-commit** stage, if the hook block is present and **`sidetrack`** is on `PATH`.
- **What:** Runs **`sidetrack validate --staged`** so only **Git-staged** paths drive marker and index checks (faster on large trees). Use plain **`sidetrack validate`** in CI when you want a full scan.
- **Exit:** Non-zero on **errors** (schema, broken anchors, marker pairing, and similar)—the commit is blocked. Warnings do not fail the hook.
- **Coexistence:** The fragment is a **marked, idempotent block** inside `.git/hooks/pre-commit`; it is safe alongside other hook logic if you merge hooks carefully.

## CLI `sidetrack validate`

- **When:** You run it manually, in CI, or from the pre-commit hook.
- **What:** Schema validation for **`.sidetrack/metadata/index.json`**, anchor integrity (including symbol presence and line ranges where applicable), marker pairing and uniqueness rules, **non-overlapping** marker-backed inner ranges per primary source, **warnings** when a source region is missing a matching `<!-- sidetrack:block id=… -->` in companion Markdown for that primary, alignment between index keys and paths, and staleness evidence via the **Git** SCM adapter (blob SHA / last-known commit fields) for recorded sources.
- **Exit:** **0** if there are no **errors**; **1** if any error exists. Warnings print but do not change exit code.
- **Scope:** Full repo by default; pass **`--staged`** to limit checks to index entries whose primary or companion path matches staged files (unless `index.json` or `.sidetrack.toml` itself is staged, in which case the full index is validated).

## CLI `sidetrack doctor`

- **When:** Preflight before filing an issue or onboarding a machine.
- **What:** Everything **`validate`** does, plus light **environment** checks (for example: is **`.git`** present under cwd, can Git be used for SCM-backed checks).
- **Exit:** Same contract as **`validate`** for validation failures; extra environment messages are advisory.

## CLI `sidetrack migrate`

- **When:** After upgrades when the index **schema** or snippet normalization changes; also applied on many read paths automatically.
- **What:** **Offline** rewrite of **`.sidetrack/metadata/index.json`** only (for example legacy field renames). Does **not** touch Git state, source files, or **Angles** filesystem layout.

## CLI `sidetrack migrate-angles`

- **When:** You want to opt into **Angles** on disk from an existing **flat** `.sidetrack/source/{P}.md` tree.
- **What:** Moves companions to `{storage}/source/{P}/{angle}.md`, writes the **`.default`** sentinel, merges **`[angles]`** into `.sidetrack.toml`, rewrites **`[static_site].sidetrack_markdown`** when it pointed at a moved file, and updates **`index.json`** keys. Use **`--dry-run`** first. Normative detail: [`docs/spec/storage.md`](../spec/storage.md).

## Editor extension (`sidetrack-vscode`)

- **When:** While editing in VS Code or Cursor.
- **What:** Open paired sidetrack (from the active editor, or **Explorer** right-click on a file), **bidirectional scroll sync** when enabled in settings (block-aware when **index.json** and Markdown markers align), **add block from selection**, workspace validation in an **output channel**. Validate uses the workspace folder that contains the active file when possible (**multi-root** friendly).
- **Exit:** N/A—this is interactive. It does **not** replace hooks or pipeline checks you add in CI for blocking bad commits.

## Known gaps (policy, not silent bugs)

These are intentionally **out of scope for the current feature set** (or not implemented yet); track mitigations in your own process:

- **Cross-file refactors:** Symbol moved to another file without a Git rename SideTrack understands—anchors may need manual updates.
- **Orphan sidetrack:** Primary source removed but companion Markdown or index entries left behind—`validate` flags inconsistencies when paths and anchors no longer line up; there is no automatic deletion policy.
- **Non-default branches:** Staleness evidence is oriented around the **Git** checkout you have; comparing against arbitrary remote branches is not the default story.
- **Content beyond blob SHA:** Large narrative drift without line/symbol/marker changes may not surface until humans re-read or you adopt richer review metadata.

**Mitigations:** run **`sidetrack validate` in CI** on pull requests (this repo does so via **`scripts/quality-gate.sh`**); use **`sidetrack doctor`** locally; keep blocks aligned per [Keeping blocks in sync](keeping-blocks-in-sync.md); use the extension for fast feedback.

## Related

- [CLI reference](cli.md) — exit codes and flags.
- [Install](install.md) — hook and editor setup.

# `docs/spec/storage.md` — parallel-docs

<!-- parallelDocs:block id=storage-vocabulary -->

## Why two names for one thing

The **ParallelDocs** / **parallel-docs** split is not just branding — it solves a real ambiguity problem:

- **ParallelDocs** (capital C, proper noun) = the tool, CLI, extension, packages. You can say "install ParallelDocs" or "ParallelDocs 2.0" without ambiguity.
- **parallel-docs** (lowercase, uncountable noun) = the practice, the writing, the genre. You can say "write in parallel-docs" or "that file needs parallel-docs" without meaning the tool.

This is modeled on natural language distinctions like "Git" (the VCS) vs "git" (the command), but carried further because ParallelDocs's whole purpose is to name a practice, not just a tool. The example sentence in the spec — "document our architecture in parallel-docs" — is the litmus test: if it sounds natural, the lowercase form is working.

The split also matters for search and documentation: "ParallelDocs validate" is a command; "parallel-docs validation" is a concept. Without the case distinction, every occurrence would need disambiguation.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=storage-angles-sentinel -->

## Why a sentinel file, not a config flag

The Angles layout switch uses a **file-system sentinel** (`{storage}/source/.default`) rather than a TOML config key. This is a deliberate design choice:

**Config flags are fragile.** If `[angles].enabled = true` lives in `.parallel-docs.toml`, then:

- Removing the config doesn't remove the Angles directory structure — you get orphaned folders.
- Copying a repo (or checking out a branch) loses the flag if `.parallel-docs.toml` is `.gitignore`d.
- Tooling must check both the config flag AND the directory structure to know what's real.

**A sentinel file is self-describing.** If `.default` exists, the layout is Angles. If not, it's flat. The file system is the single source of truth. No config drift, no mismatch between what TOML says and what's on disk.

**Migration creates the sentinel.** `parallel-docs migrate-angles` moves files AND creates `.default` in one atomic-ish operation. If the migration fails partway, the sentinel's absence means tooling still uses flat layout — no half-migrated state.

The sentinel's content is irrelevant. It could be empty or contain metadata. What matters is its existence. This is the same pattern as `.git` (a directory means "this is a repo") or `node_modules/.package-lock.json` (existence means "npm manages this").

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=storage-static-browser -->

## Why a single HTML file

The static browser emits **one** `index.html`, not one per pair. This is a deliberate constraint:

**Zero server requirement.** A single HTML file can be served from GitHub Pages, S3, or any static host without server-side routing. Every `/browse/<slug>.html` path is its own file (generated alongside `index.html`), but the hub is always `index.html`.

**Client-side angle switching.** When multiple Angles exist, the hub swaps the parallel-docs pane with JavaScript — no page reload, no server round-trip. This keeps the code pane stable while readers explore different perspectives.

**Scoped search, not grep.** The search sidecar (`parallel-docs-nav-search.json`) is built from indexed pairs only. Unindexed angle files are omitted. This is a feature, not a bug: if you haven't run `parallel-docs init` (or the VS Code "Add block" command), your parallel-docs isn't discoverable. The index is the contract.

**Build stamp as accountability.** The `<meta name="generator">` tag and footer timestamp answer "when was this built?" without requiring a server. If someone shares a stale Pages link, the timestamp tells you how stale.

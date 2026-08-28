# `.parallel-docs.toml` — parallel-docs

<!-- parallelDocs:block id=toml-lede -->

This parallel-docs does not duplicate the keys already documented in [`docs/spec/storage.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/storage.md) or spelled out in comments in the real [`.parallel-docs.toml`](https://github.com/d-led/parallel-docs/blob/main/.parallel-docs.toml) on the left—only orientation. The TOML on disk uses **`# parallelDocs:start id=…` / `# parallelDocs:end id=…`** around each logical section (same pairing contract as the root **README**’s `<!-- #region parallelDocs:… -->` / `<!-- #endregion … -->`, but in TOML line comments so parsers stay happy).

This file on disk is the **contract** the tools read first: storage root, SCM backend, how Markdown is rendered, anchor defaults, optional Angles, and optional GitHub Pages input. Everything else in `.parallel-docs/` follows paths implied here.

`[storage]` — `dir` is repo-relative; must not sit under `.git/` (enforced so Git and tooling do not fight over the tree).

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-scm -->

`[scm]` — Only **`git`** is supported for **`provider`** today (see [Configuration → `[scm]`](https://github.com/d-led/parallel-docs/blob/main/docs/user/config.md#scm)); core exposes a small **`ScmProvider`** abstraction, and the Git adapter supplies blob SHA and commit metadata used in staleness checks.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-render -->

`[render]` — Mermaid on/off, Highlight.js theme, and optional rewriting of `https://github.com/…/blob/…` links to repo-relative URLs in static HTML when `[static_site].github_url` parses.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-anchors -->

`[anchors]` — Default resolution order (`symbol`, `lines`, …) for tooling that resolves spans.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-static-site -->

`[static_site]` — Feeds `npm run pages:build`: which source fills the code pane, which Markdown file (and optional intro) fills the parallel-docs pane, toolbar GitHub links, and related file shortcuts. Normative detail: [`docs/spec/storage.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/storage.md) and the plan’s Static code browser section.

**Custom publish URL / context path (important):**

- Keep `[static_site].github_url` as the **repository home** URL (for example, `https://github.com/acme/project`) so toolbar and blob-link derivation stay correct.
- Do **not** put your deployed docs URL into `[static_site].github_url`. A publish URL like `https://example.com/some_context_path/<parallel-docs-root>/` is an app hosting concern, not a repo identity.
- The generated site uses relative links and computes site-root navigation from the current page path (`/browse/...` aware), so it works under a context path without extra TOML keys.
- For rendered **source-markdown** links that point to files outside `_site/`, use `[static_site].source_link_prefix` (for example `https://github.com/acme/project/blob/main` or `/src`) so links resolve instead of 404ing.
- If `[render].relative_github_blob_links = true` and `[static_site].github_url` is parseable, Pages builds also derive a safe default source-link prefix to GitHub blob URLs.
- If you host under a custom prefix, validate by opening both:
  - `https://example.com/some_context_path/<parallel-docs-root>/`
  - `https://example.com/some_context_path/<parallel-docs-root>/browse/<pair>.html`
    and ensure home/pair links do not stack `browse/browse`.

**Rule of thumb:** repo identity in TOML (`[static_site].github_url`), deploy base in hosting config (Pages/reverse proxy/CDN).

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-angles -->

`[angles]` (commented in this repo) — After you add `{storage}/source/.default`, each primary file can own a folder of `angleId.md` files; TOML lists ids and titles and picks `default_angle`. VS Code can enable this layout and open a chosen angle; Pages still use a single `parallel_docs_markdown` path until the static viewer grows a switcher.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-pointers -->

**Pointers:** [`docs/user/source-region-delimiters.md`](https://github.com/d-led/parallel-docs/blob/main/docs/user/source-region-delimiters.md) (delimiter table by VS Code `languageId`) · [`packages/core/src/config.ts`](https://github.com/d-led/parallel-docs/blob/main/packages/core/src/config.ts) · [`packages/core/src/config.test.ts`](https://github.com/d-led/parallel-docs/blob/main/packages/core/src/config.test.ts)

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=toml-buffering-flow-sync -->

**BufferingFlowSynchronizer** — normative sketch (column tracing, constraints in pipeline order). On disk, [`.parallel-docs.toml`](https://github.com/d-led/parallel-docs/blob/main/.parallel-docs.toml) keeps only the `parallelDocs:start` / `parallelDocs:end` anchor for this id; readable text lives here. Implementation: [`packages/core/src/buffering-flow-synchronizer.ts`](../../../packages/core/src/buffering-flow-synchronizer.ts) — fuller narrative in [that file’s parallel-docs](../../../packages/core/src/buffering-flow-synchronizer.ts/main.md).

- Treat each column as an ordered list of **`HeightAdjustable`** segments (`height` + `bufferAbove` / `bufferBelow`).
- Only ids matching **`R{N}XX`** pair across columns; everything else stays local (compact).

1. **Region height** — For each shared `R` id, `max(height)`; set `bufferBelow` on the shorter region so both sides span the same region height.
2. **Region start rows** — Re-measure “start row before first content line” for each paired `R`; if starts differ, prefer shrinking `bufferAbove` on the side that starts _later_ (down to 0), then add `bufferAbove` on the earlier-start side only if still misaligned (minimal slack; avoids a full symmetric `BBBB` / `BBBB` zip row when the parse already over-padded one side).
3. **Column totals** — If one column is shorter, add tail slack only on non-`R` blocks (`bufferBelow` on the last item if it is not `R{N}XX`), else append paired `__NON_SYNC_TAIL_SLACK__` placeholders so left/right array lengths stay aligned for stretch-row zip.
4. **Do not move `bufferBelow` between paired `R` copies** — That would change each column’s scroll total and force stacked tail `BBBB` rows when (3) re-pads. Closing buffer stays on the side that owns the shorter region’s `bufferBelow` from step (1).

**Approval round-trip:** parse grids → synchronize → print ([`approval-flow-grid.ts`](../../../packages/core/src/approval-flow-grid.ts), [`buffering-flow-synchronizer-approval-printer.ts`](../../../packages/core/src/buffering-flow-synchronizer-approval-printer.ts)). Harness invariants (see [`buffering-flow-synchronizer.approval.test.ts`](../../../packages/core/src/buffering-flow-synchronizer.approval.test.ts)): equal column scroll totals after sync; never `BBBB` in both cells on one ASCII line (split to stagger); many consecutive `BBBB` rows in one column are OK when slack depth requires it; only `R{N}XX` pairs get region sync — plain `XXXX` blocks never use stagger-as-region-height (stagger geometry is only inside an `R…XX` block); one full-width blank row between consecutive `HeightAdjustable` items (visual only; never 0, never double-stacked blank lines).

**Synced-region continuations:** `XXXX` only where that column had a body line; stagger (empty cell, partner ink) reprints as spaces in that cell — not a spurious `XXXX` (see `syncRegionContinuationRows`).

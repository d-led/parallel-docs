# Manual Companion (Maintainer Notes)

`docs/manual.md` is intentionally concise and operator-first. This companion
captures rationale, edge cases, and why certain workflows are opinionated.

## Why a separate manual now

The project has crossed a complexity threshold:

- static hub + per-pair browse pages,
- humane aliases + canonical slugs,
- multi-angle semantics,
- editor/CLI dual surfaces.

A single quickstart is not enough for maintainers and frequent contributors.

## Cross-linking style guidance

Use predictable link rules in docs:

- Prefer **repo-relative docs links** with `./` and `../` inside `docs/`.
- Prefer `../spec/...` and `../user/...` between docs sections.
- Use GitHub `https://github.com/.../blob/...` links only when the target is
  expected to be consumed outside local docs rendering contexts.

This keeps links robust both in repository viewers and in generated static
contexts where path bases differ.

## Static-site defaults: two different “default angles”

Keep this distinction explicit in docs and code:

- **`[static_site].default_angle`** selects the default pair used by the hub.
- **`[angles].default_angle`** selects default angle behavior in tools (editor,
  command workflows, angle open defaults).

They can be the same in simple setups, but are intentionally separable.

## Why humane URLs remain aliases, not canonical IDs

Human-readable paths are better for comprehension and sharing, but opaque
**slug** URLs under `/browse/<slug>.html` remain the canonical pair identity in
the static export.

- A slug is **deterministic** and therefore **stable across rebuilds** for as
  long as the exact `(sourcePath, sidetrackPath)` strings the build uses stay
  the same (same pair → same slug on every machine).
- **Renaming or moving** the primary file or the companion Markdown **changes**
  those strings → **a new slug**; old `/browse/…` links are not automatically
  redirected.
- Truncated SHA-256 makes accidental collisions between different pairs
  vanishingly unlikely.

So the strategy is additive: keep slug pages as the canonical target, add
humane alias shims where hosts allow them, and treat **slug algorithm or path
string changes** as breaking bookmark events (see `docs/development.md`).

## Manual scope boundaries

`docs/manual.md` should answer:

- what to run,
- when to run it,
- where to look next.

It should not duplicate full specs. Deep normative details stay in:

- `docs/spec/*.md`
- `docs/user/*.md`
- `docs/development.md`

This keeps the manual readable while still linking to authoritative detail.

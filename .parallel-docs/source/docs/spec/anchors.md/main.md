# `docs/spec/anchors.md` — parallel-docs

<!-- parallelDocs:block id=anchors-grammar-design -->

## Why the grammar stays small

The anchor grammar has exactly three forms — `lines:`, `symbol:`, `marker:` — plus an opaque catch-all. This is deliberate:

**Every new anchor type is a new validation rule, a new migration path, and a new thing to explain.** If we added `regex:`, `function:`, `commit:`, etc., the grammar would grow without bound and every tool would need to support every form.

**Opaque anchors are the escape hatch.** Any string that doesn't parse as a known form is stored as-is. This means language-specific plugins (e.g., a Rust plugin that resolves `fn:<name>`) can add forms without changing the core grammar. The core treats unknown anchors as diagnostics, not errors — the plugin fills the gap.

**`marker:` is the workhorse.** It survives line renumbering (the region delimiters move with the code), supports paired validation (no duplicate opens, no orphans), and works across languages via different comment styles. When in doubt, use `marker:`.

**`lines:` is the simplest.** No source markers needed, just line numbers. But it breaks on renumbering — use it for stable files or when you're adding parallel-docs to generated code that can't have markers.

The grammar is intentionally not Turing-complete, not regex-based, and not extensible via configuration. If you need something the grammar can't express, the answer is either an opaque anchor (for future plugins) or a separate comment in the companion Markdown.

# `blocks.md` — sidetrack

The spec on the left is normative; this note is **why** the split between prose and metadata exists.

Humans own **sidetrack** copy—headings, tone, diagrams. The tool owns **`index.json`**: ids, **`lines:`** / **`symbol:`** / **`marker:`** anchors, optional verification fields. That wall is what makes `validate` in CI meaningful without a parser rewriting your Markdown.

**Staleness (v0)** — Diagnostics only; auto-healing on branch mismatch is out of scope until we decide otherwise.

**Editor** — Markers give a grep-stable hook for **block-aware scroll**. Remove markers or index rows and you fall back to **proportional** sync between panes.

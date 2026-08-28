# `code-browser.ts` - parallel-docs

Emits the static code browser shell: code pane, Markdown pane, splitter, optional Mermaid, Highlight.js theme wiring, per-logical-line `.code-line` grid for search hits, optional block-stretch table when index + markers align, and optional dual-pane mode with anchors for scroll sync.

Runtime stretch-row DOM synchronization is documented in `.parallel-docs/source/packages/render/src/block-stretch-buffer-sync.ts/main.md` (this file emits structure).

Security: Markdown passes through `rehype-sanitize` with an explicit allow-list.

Callers: `@parallel-docs/code-parallel-docs-static` and root `npm run pages:build` share the HTML contract.

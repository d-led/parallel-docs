# `extension.ts` — parallel-docs

Editor surface for ParallelDocs: open parallel-docs beside source, add a block from selection, run validation into an output channel, optional Markdown preview for stock rendering.

**Scroll sync** — While a pair is active, visible-range listeners on both editors drive mapping. The block list rebuilds on document change (debounced) and when **`index.json`** saves. Programmatic `revealRange` is guarded so the two panes do not feedback-loop.

**Add block** — Appends marker, heading, placeholder, then **`addBlockToIndex`**. Release scripts (`tag-version.sh`, publish) stay separate from day-to-day parallel-docs edits.

**Packaging** — `esbuild` inlines `@parallel-docs/core` into the extension bundle before `vsce` produces the `.vsix`.

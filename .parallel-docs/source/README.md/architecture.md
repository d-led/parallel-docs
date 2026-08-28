<!-- parallelDocs:block id=readme-lede -->

# ParallelDocs — architecture angle

This **angle** is a second voice on the same `README.md` source: high-level map of the monorepo, not a second README. For **roles** (libraries vs tooling vs static generator), see the **[Main](https://github.com/d-led/parallel-docs/blob/main/.parallel-docs/source/README.md/main.md)** angle.

**Package dependencies** (edges follow `package.json` `dependencies`; [`@parallel-docs/core`](https://www.npmjs.com/package/@parallel-docs/core) has no in-repo package deps):

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-why -->

```mermaid
flowchart TB
  core["parallel-docs/core"]
  pkgRender["parallel-docs/render"]
  ccStatic["parallel-docs/code-parallel-docs-static"]
  cli["parallel-docs"]
  vscode["parallel-docs"]

  core -->|npm dep| pkgRender
  core -->|npm dep| ccStatic
  pkgRender -->|npm dep| ccStatic
  core -->|npm dep| cli
  pkgRender -->|npm dep| cli
  ccStatic -->|npm dep| cli
  core -->|npm dep| vscode
```

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-user-guides -->

- **[@parallel-docs/core](https://www.npmjs.com/package/@parallel-docs/core)** — paths, index, config merge, Angles resolution, Git-backed evidence.
- **[@parallel-docs/render](https://www.npmjs.com/package/@parallel-docs/render)** — Markdown → safe HTML, static code browser shell (dual panes, optional multi-angle selector, block-aware scroll when the index agrees).
- **[parallel-docs](https://www.npmjs.com/package/parallel-docs)** — `init`, `validate`, **`migrate-angles`** (flat → per-source folders), `render`, `pages` inputs.
- **[@parallel-docs/code-parallel-docs-static](https://www.npmjs.com/package/@parallel-docs/code-parallel-docs-static)** — thin consumer that feeds `renderCodeBrowserHtml` for GitHub Pages.

Use **Angle** on the static site when this file exists alongside `main.md` and both are listed under `[angles].definitions` in `.parallel-docs.toml`.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=readme-mobile-flip-check -->

## Narrow viewport check

On a narrow viewport, the shell flips between **Source** and **ParallelDocs** instead of showing both columns at once. That mobile flip still needs to keep the currently active README block aligned when you switch panes.

Use this architecture angle to verify the same behavior as the main angle: scroll near the bottom, flip from source to parallel-docs and back, and confirm the visible block stays paired after each flip.

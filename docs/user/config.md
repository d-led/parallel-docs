# Configuration (`.parallel-docs.toml`)

Optional TOML at the **repository root**. Omitted keys use **built-in defaults** in `@parallel-docs/core` (see [`packages/core/src/config.ts`](../../packages/core/src/config.ts)). Invalid values fail fast at load time with a clear error.

Paths in config must be **repo-relative** with **no `..` segments**. **`storage.dir`** must not point **inside** **`.git/`**.

## `[storage]`

| Key       | Default          | Meaning                                               |
| --------- | ---------------- | ----------------------------------------------------- |
| **`dir`** | `.parallel-docs` | Root directory for **`source/`** and **`metadata/`**. |

## `[scm]`

| Key            | Default | Meaning                                                                                                      |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| **`provider`** | `git`   | SCM backend — only **Git** is implemented today (`ScmProvider` in core; other backends could plug in later). |

## `[render]`

| Key                              | Default       | Meaning                                                                                                                                                      |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`mermaid`**                    | `true`        | Allow Mermaid fences in rendered HTML pipelines that honor this flag.                                                                                        |
| **`syntaxTheme`**                | `github-dark` | Highlight.js theme name for HTML output.                                                                                                                     |
| **`relative_github_blob_links`** | `false`       | When `true`, rewrite GitHub `blob` / `tree` links in parallel-docs to paths relative to generated HTML; requires a parseable **`[static_site].github_url`**. |

## `[anchors]`

| Key                   | Default               | Meaning                                                                         |
| --------------------- | --------------------- | ------------------------------------------------------------------------------- |
| **`defaultStrategy`** | `["symbol", "lines"]` | Preferred anchor strategies for tooling (order matters where tools consult it). |

## `[angles]` (optional)

Named **Angles** — multiple parallel-docs files per primary source. See [`docs/spec/storage.md`](../spec/storage.md#angles-named-perspectives-on-the-same-source).

| Key                          | Meaning                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **`default_angle`**          | Angle id used by default in tooling when several exist; must match a **`definitions`** id when that list is non-empty. |
| **`[[angles.definitions]]`** | Rows **`id`** (required) and optional **`title`** for UI labels.                                                       |

On-disk **multi-angle layout** is enabled only when **`{storage.dir}/source/.default`** exists (sentinel file or directory).

## `[static_site]` (optional)

Single-page static **code + parallel-docs** settings (GitHub Pages, `parallel-docs render`, etc.).

| Key                                        | Default        | Meaning                                                                                                                                                         |
| ------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`title`**                                | `ParallelDocs` | HTML `<title>` / heading context.                                                                                                                               |
| **`intro`**                                | empty          | Markdown above the panes.                                                                                                                                       |
| **`github_url`**                           | empty          | Repo home URL for toolbar link and optional blob rewriting.                                                                                                     |
| **`source_link_prefix`**                   | empty          | Optional prefix for rendered **source-markdown** links when `_site/` does not host repo files (for example `https://github.com/acme/repo/blob/main` or `/src`). |
| **`default_source_file`**                  | `README.md`    | Repo-relative source opened by default on the static hub (`index.html`).                                                                                        |
| **`default_angle`**                        | empty          | Angle id used for the hub’s default companion file (`.parallel-docs/source/{default_source_file}/{default_angle}.md`).                                          |
| **`source_file`**                          | —              | **Deprecated**; use **`default_source_file`**.                                                                                                                  |
| **`parallel_docs_markdown`**               | empty          | Optional explicit companion Markdown path for the hub default pair (overrides `default_angle` derivation).                                                      |
| **`parallel_docs_markdown`**               | —              | **Deprecated**; use **`parallel_docs_markdown`**.                                                                                                               |
| **`github_blob_branch`**                   | `main`         | Branch segment for **`related_github_files`** blob URLs.                                                                                                        |
| **`[[static_site.related_github_files]]`** | none           | Optional **`path`** (repo-relative) and **`label`** for toolbar “also on GitHub” links.                                                                         |

## Canonical spec

[`docs/spec/storage.md`](../spec/storage.md) — paths, Angles, Pages search, images, migration notes.

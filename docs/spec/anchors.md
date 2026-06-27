# Anchor grammar

<!-- #region commentray:anchors-grammar-design -->

Anchors connect commentray **blocks** to spans inside a primary file. The grammar is intentionally small; language-specific plugins may interpret additional opaque anchors later.

**About “v0” elsewhere in the repo:** some older docs used **“v0”** to mean _the first documented revision of this anchor string grammar_ (a doc label), **not** a product generation, **not** the `[scm]` section of `.commentray.toml`, and **not** a promise that only Git exists forever. When in doubt, trust the tables in [Configuration](../user/config.md) and this page’s grammar sections.

## Supported forms

### Line ranges

```text
lines:<start>-<end>
```

Where `start` and `end` are **1-based** inclusive line numbers and `end >= start`.

Examples:

- `lines:10-40`

### Symbols (opaque name)

```text
symbol:<name>
```

`name` is a language-specific identifier string (function name, type name, etc.). Resolution is provided by language plugins; the core library treats unknown resolution as a **diagnostic**, not a hard failure.

Examples:

- `symbol:Handler`

### Marker ids (`marker:<id>`)

```text
marker:<id>
```

`<id>` is **1–64 characters**: ASCII letters, digits, hyphen (`-`), and underscore (`_`); it must start with a letter or digit. Examples: `intro`, `auth-handler`, `block_01`, `a3f9k2`.

The same token appears in source as `commentray:<id>` in `#region` / `#endregion` style delimiters, or as `commentray:start id=<id>` / `commentray:end id=<id>` in generic comments. The Markdown `<!-- commentray:block id=<id> -->` marker and `index.json` `block.id` must use **the same** `<id>` when the anchor is `marker:…`. **Which delimiter shape applies** depends on the primary file’s language — see [Source region delimiters (by editor language)](../user/source-region-delimiters.md).

Validation: **per source file**, paired starts/ends must be well-formed (no duplicate opens, no orphans), and **inner line ranges** of distinct regions must not intersect (**error** if they overlap, including nested regions). **`commentray validate`** also **warns** when a paired source region has no matching `<!-- commentray:block id=… -->` line in any indexed companion Markdown for that primary (orphan region relative to commentary files), **warns** when the same id is reused across **different** source files (repo-wide ambiguity for links), and **errors** if the same `(sourcePath, marker id)` is claimed by different block ids in the index.

### Opaque anchors

Any string that does not match the forms above is stored as an **opaque** anchor for forward compatibility.

<!-- #endregion commentray:anchors-grammar-design -->

## Cross references

Commentray treats **effortless cross-linking** as a first-class requirement: prose should connect primary artifacts, commentray files, and external resources without ceremony. The conventions below keep links **simple, portable, and reviewable**—no custom syntax required for the usual case.

Cross references are authored in Markdown using normal links and conventions:

- Repo-relative links where possible.
- Stable public URLs for external dependencies.

Higher-level “xref” syntax may be introduced later as an optional Markdown extension, backed by the same anchor model.

**Operational guide:** [Keeping blocks, regions, and metadata consistent](../user/keeping-blocks-in-sync.md) — how index entries, Markdown `<!-- commentray:block … -->` markers, and source `lines:` / `marker:` anchors stay aligned (CI, hooks, `sync-moved-paths`, etc.).

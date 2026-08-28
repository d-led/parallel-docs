# `config.ts` — parallel-docs

Every entrypoint funnels through here so **one** definition of “safe path” wins. New knobs mean extending `ParallelDocsToml`, `mergeParallelDocsConfig`, and **`assertSafeConfigPaths`** together—otherwise someone’s `init` or `validate` quietly disagrees.

The **storage-under-`.git/`** rule exists because Git owns that tree; putting ParallelDocs storage there creates avoidable deletion and merge pain.

**TOML** — Multiline **`"""`** strings and arrays parse the same as one-liners (`@iarna/toml`); that’s for humans writing long URLs in `.parallel-docs.toml`, not for cleverness in code.

**Pointers:** [`docs/spec/storage.md`](https://github.com/d-led/parallel-docs/blob/main/docs/spec/storage.md) · [`packages/core/src/config.test.ts`](https://github.com/d-led/parallel-docs/blob/main/packages/core/src/config.test.ts)

# `config.ts` — sidetrack

Every entrypoint funnels through here so **one** definition of “safe path” wins. New knobs mean extending `SideTrackToml`, `mergeSideTrackConfig`, and **`assertSafeConfigPaths`** together—otherwise someone’s `init` or `validate` quietly disagrees.

The **storage-under-`.git/`** rule exists because Git owns that tree; putting SideTrack storage there creates avoidable deletion and merge pain.

**TOML** — Multiline **`"""`** strings and arrays parse the same as one-liners (`@iarna/toml`); that’s for humans writing long URLs in `.sidetrack.toml`, not for cleverness in code.

**Pointers:** [`docs/spec/storage.md`](https://github.com/d-led/sidetrack/blob/main/docs/spec/storage.md) · [`packages/core/src/config.test.ts`](https://github.com/d-led/sidetrack/blob/main/packages/core/src/config.test.ts)

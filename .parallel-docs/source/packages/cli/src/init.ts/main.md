# `init.ts` — parallel-docs

**`runInitFull`** creates directories, ensures an empty index when needed, writes `.parallel-docs.toml` only if missing—idempotent reruns. **`runInitConfig --force`** overwrites the template TOML when you want defaults again. **`runInitScm`** delegates to **`git-hooks.ts`** for hook-block merge logic.

The default TOML is **comment-first** on purpose—new repos see the knobs without flipping half of them on by accident.

**Wiring:** [`cli.ts`](https://github.com/d-led/parallel-docs/blob/main/packages/cli/src/cli.ts) · [`git-hooks.ts`](https://github.com/d-led/parallel-docs/blob/main/packages/cli/src/git-hooks.ts)

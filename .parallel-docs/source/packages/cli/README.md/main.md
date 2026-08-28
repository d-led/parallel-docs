# `packages/cli/README.md` — parallel-docs

<!-- parallelDocs:block id=cli-adoption -->

## Why three install paths

The CLI supports three adoption paths because different teams have different constraints:

**`npx parallel-docs`** is the zero-friction path. No install, no PATH setup, no permissions. `npx parallel-docs --help` works even from a fresh checkout. This is the primary path for CI and one-off use — it removes "I don't want to install yet another tool" as a barrier.

**`npm install -g parallel-docs`** is for teams that use ParallelDocs daily. The global install gives you `parallel-docs` on PATH so tab-completion and muscle memory work.

**Standalone binaries** are for teams without Node toolchains (Go shops, Rust shops, legacy Java monorepos). A single self-contained binary removes the Node dependency entirely. The trade-off: binaries must be downloaded per-platform and per-version, and they lack npm's auto-update. CI artifacts expire after 14 days by design — use GitHub Releases for anything you rely on.

The key insight: **meet users where they are, not where we wish they were.** If someone says "I don't want Node just to document my code," the binary is the answer. If someone says "I want to try this in one command," `npx` is the answer.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=cli-exit-codes -->

## Exit code contract: 0 or 1, nothing else

The exit code contract is deliberately minimal:

- **`0`** = success (or nothing to report)
- **`1`** = validation found errors

There is no exit code 2 for warnings, no exit code 3 for configuration issues. This is intentional:

- **CI compatibility.** Most CI systems treat exit code 0 as pass and anything non-zero as fail. Warnings should not block CI — they're informational. If validation has only warnings, exit code is 0.
- **No partial-failure nuance.** Complex exit code schemes (2=warnings, 3=config-error, 4=network-error) sound helpful but break in practice: CI runners don't parse exit codes, and shell `&&` chains only care about zero vs non-zero.
- **`--staged` mode** follows the same contract: checks only index pairs touched by staged files, same exit codes.

The `validate` command itself distinguishes errors from warnings in its output, but the exit code stays binary. This keeps shell scripts (`parallel-docs validate && git push`) simple and predictable.

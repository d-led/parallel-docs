# `docs/development.md` — maintainer parallel-docs

<!-- parallelDocs:block id=dev-layout -->

## Why this package split

The five-package split follows a **dependency depth** rule, not just "one package per concern":

- **`core`** is the zero-dependency library. Everything else depends on it. If it breaks, the whole chain breaks. That's why it has the most tests and the strictest API stability.
- **`render`** depends on core but not on CLI or extension. It's the Markdown → HTML pipeline — the security-sensitive layer (`rehype-sanitize` lives here). Keeping it separate means the CLI and extension share one rendering path.
- **`code-parallel-docs-static`** is the thinnest package: it glues render output into a single-page HTML shell. It exists as a separate npm package so consumers can generate static pages without pulling in the CLI.
- **`cli`** bundles core + render + static. It's the user-facing entry point but also carries the Node SEA binary build. `npx parallel-docs` is the primary adoption path — no global install needed.
- **`vscode`** is the editor surface. It bundles core for validation/paths but uses the CLI for heavier operations. It's private on npm — shipped as `.vsix`, not a library.

The rule: **changes flow backward through the dependency chain.** If you change the HTML contract in render, update static and CLI before tagging. If you change paths in core, update everything.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=dev-quality-gate -->

## Quality gate philosophy

The quality gate (`npm run quality:gate`) is the **minimum bar** — not the complete test suite. This is intentional:

- **Fast feedback loop.** Format check + lint + typecheck + unit tests complete in seconds, not minutes. Contributors get a quick yes/no before pushing.
- **Layered defense.** Integration tests, expensive tests, Cypress, and VS Code extension tests are all **additional** layers that run in CI or on demand. They're important but not blockers for every commit.
- **`test:all`** exists for the "big push" moment — before a release or a complex merge — but it's not the everyday tool. Everyday PRs gate on `quality:gate`.

The `PARALLEL_DOCS_SKIP_VSCODE` and `PARALLEL_DOCS_SKIP_E2E` env vars let you skip the slowest parts during iteration. This is pragmatic: you shouldn't need a full Cypress run to fix a typo.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=dev-contributor-expectations -->

## Why these specific expectations

The contributor expectations section is designed to **prevent the most common failure modes** we've seen:

- **"Never silence failures with `.skip`"** — this is strong language because it's a real pattern: someone adds a `.skip` to get CI green, then forgets. The test suite degrades silently.
- **"Tests read like behavior"** — this is about test value, not style. Tests that assert implementation details (`spyOn(internalHelper)`) break on any refactor and don't prove the system works. Tests that assert behavior (`expect(page).toHaveText(...)`) survive refactors.
- **"Small, reversible PRs"** — behavioral and non-behavioral changes should be separate PRs. A refactor that changes no behavior should be trivial to review. A behavior change mixed with a refactor is hard to review and hard to revert.
- **Coverage as discovery, not score** — coverage reports show you what's untested, not what's well-tested. The goal is to discover blind spots, not to chase 100%.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=dev-static-hub-urls -->

## Stable slug URLs: the design constraint

The slug URL strategy is one of the most consequential architectural decisions:

**Slugs are deterministic** from `(sourcePath, parallelDocsPath)` strings. Same pair → same slug on every machine and rebuild. This means:

- **Bookmarks survive rebuilds** — as long as the file paths don't change.
- **But renames break slugs** — moving or renaming a source file or its companion changes the slug. This is by design: ParallelDocs doesn't try to track file identity across renames (that's what `sync-moved-paths` and `git diff --find-renames` are for).

**Why not use content-based slugs?** Content-hash slugs (like Git blob IDs) would survive renames but break on every edit. Path-based slugs strike a balance: stable across rebuilds, fragile on renames, but renames are rarer than edits.

**Humane aliases are additive, not replacement.** The `/browse/<slug>.html` URL is canonical. Humane aliases (`/browse/src/app.ts/main.html`) are convenience shims — they can break or redirect, but the slug page is the stable identity.

**Changing the slug algorithm is a breaking change** for all existing bookmarks. Treat it like a major version bump.

<!-- parallelDocs:page-break -->

<!-- parallelDocs:block id=dev-vscode-engine -->

## VS Code engine compatibility: the floor-is-low strategy

ParallelDocs intentionally supports VS Code versions **below** what Cursor and latest VS Code ship:

- The declared minimum (`^1.95.0`) is a **floor**, not a target. The extension works on newer versions because VS Code's API is backward-compatible.
- **Forks lag upstream.** Cursor, Windsurf, and others may ship VS Code APIs that are months behind. Raising the floor would lock them out.
- **`@types/vscode` must match the floor.** If you use an API from `@types/vscode@1.100` but the floor is `^1.95`, users on 1.95 get `TypeError: undefined is not a function`. The compiler won't catch this — only testing against the minimum version catches it.

**The bump checklist exists because it's easy to miss one piece.** If you raise `engines.vscode` but forget the CI matrix pin, CI still passes against `stable` but nobody tests the old minimum. The four-part checklist (`engines.vscode`, `@types/vscode`, CI matrix pin, manual test) is redundant by design — redundancy catches mistakes.

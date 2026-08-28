# Development

Hands-on notes for working on SideTrack itself: building, debugging, and
observing the editor extension while dogfooding. If you just want to
install SideTrack to use it, see the top-level `README.md`.

## Dogfood: README on GitHub Pages

This repository pairs the root **`README.md`** with longer sidetrack under **`.sidetrack/source/README.md/`** for the **`[static_site]`** build (see the root **`.sidetrack.toml`**). The README stays relatively factual; the sidetrack file is the voice-over (trade-offs, cookbook, diagrams). Open the **[published site](https://d-led.github.io/sidetrack/)** to try scroll-linked panes on the static output without installing anything.

## Layout

<!-- #region sidetrack:dev-layout -->

- `packages/core` — shared library (`.sidetrack.toml` parsing, path
  normalization, metadata schema, validation, git adapter).
- `packages/render` — Markdown → HTML renderer + client-side bundle for
  the static site.
- `packages/cli` — the `sidetrack` CLI (also packaged as a standalone
  Node SEA binary). Published consumers often run **`npx sidetrack`**; **`npx sidetrack --help`** shows `Usage: sidetrack [options] [command]`.
- `packages/code-sidetrack-static` (`@sidetrack/code-sidetrack-static` on npm) — static-site generator for the
  rendered sidetrack pages.
- `packages/vscode` — VS Code / Cursor extension.

<!-- #endregion sidetrack:dev-layout -->

## Clone and workspace setup

```bash
git clone https://github.com/d-led/sidetrack.git
cd sidetrack
npm ci
npm run setup          # install, build, init, doctor — idempotent
```

Symlink the workspace CLI so rebuilds pick up without reinstalling:

```bash
npm run cli:install    # bash scripts/install-cli.sh
# later: npm run cli:uninstall
```

## Quality gate

<!-- #region sidetrack:dev-quality-gate -->

One command gates every review:

```bash
npm run quality:gate   # format check, actionlint, ESLint x2, shellcheck, jscpd, tsc -b, unit tests
```

Slow lane (integration + expensive suites) on top of the gate:

```bash
npm run ci:full
```

### Full local test run (`test:all`)

Use this when you want one command before a big push or when mirroring most of
what CI exercises locally. It does **not** replace `npm run quality:gate` for
everyday PRs (that stays the minimum bar in `CONTRIBUTING.md`).

**What runs (in order):**

1. **`npm run ci:full`** — quality gate, then integration Vitest, then expensive Vitest (same as [`scripts/ci-full.sh`](../scripts/ci-full.sh)).
2. **VS Code extension tests** — [`scripts/test-vscode-extension.sh`](../scripts/test-vscode-extension.sh) (`npm run test:vscode` in `packages/vscode`), unless skipped below.
3. **Cypress E2E** — `npm run e2e:ci` (static Pages build runs via the `e2e` lifecycle), unless skipped below.

**Coverage** is unchanged: use `npm run test:coverage` or `npm run test:coverage:all` when you want Vitest HTML/lcov; this script does not merge Cypress or extension coverage.

**Commands:**

```bash
npm run test:all
# same:
bash scripts/test-all.sh
```

**Skip steps** (set to `1` to skip; you can combine both):

| Variable                  | Skips                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `SIDETRACK_SKIP_VSCODE=1` | VS Code / Electron extension host (no GUI or faster iteration) |
| `SIDETRACK_SKIP_E2E=1`    | Cypress / Chrome                                               |

```bash
SIDETRACK_SKIP_VSCODE=1 npm run test:all
SIDETRACK_SKIP_E2E=1 npm run test:all
SIDETRACK_SKIP_VSCODE=1 SIDETRACK_SKIP_E2E=1 npm run test:all   # only ci:full
```

If a check is failing, fix the root cause. Do not widen ignore lists or
raise thresholds to hide it. `CONTRIBUTING.md` states the social contract;
the bullets below are the day-to-day detail.

<!-- #endregion sidetrack:dev-quality-gate -->

## Contributor expectations

<!-- #region sidetrack:dev-contributor-expectations -->

- **Slow lane:** `npm run ci:full` — quality gate, integration tests, then expensive tests (no Cypress). **`npm run test:all`** adds VS Code extension tests and Cypress on top; see [Full local test run](#full-local-test-run-testall) above.
- **Tests:** run `npm run test:unit` before every PR; add `npm run test:integration` when you touch the Git SCM adapter, `.sidetrack/` layout, or fixture-backed behavior; use `npm run test:expensive` for fuzzed / large-repo suites when relevant. Never silence failures with `.skip`, swallowed errors, or widened thresholds — fix code or fix tests. When you change **`packages/vscode`**, run **`npm run test:vscode-extension`** and keep **`engines.vscode`**, **`@types/vscode`**, and the **minimum** row in [`.github/workflows/ci-vscode-extension.yml`](../.github/workflows/ci-vscode-extension.yml) aligned (see **VS Code engine compatibility** under Editor extension workflows below).
- **Lint / dupes:** `npm run lint` (ESLint + shellcheck on `scripts/` + refactor metrics); `npm run dupes` (`jscpd`); `npm run quality` runs lint + dupes. Treat findings as design feedback.
- **Dependencies:** preview with `npm run deps:upgrade -- --check`; apply with `npm run deps:upgrade` (`patch` / `minor` / `major` / `latest`). The script re-pins `@sidetrack/*` via `scripts/sync-workspace-deps.mjs` and refreshes the lockfile — then run `npm run quality:gate`. Triage `npm audit` seriously; avoid blanket `--force`.
- **Format:** `npm run format` (write) or `npm run format:check` (verify).
- **Coverage (discovery, not a score chase):** `npm run test:coverage` (unit) and `npm run test:coverage:all` (unit + integration) emit HTML + `lcov` under `./coverage/` (gitignored). Set `SIDETRACK_COVERAGE_OPEN=0` to skip opening a browser.
- **Tests read like behavior:** prefer given / when / then; avoid asserting private implementation details.
- **Small, reversible PRs** where practical; land behavior-neutral refactors separately when it keeps review honest.

<!-- #endregion sidetrack:dev-contributor-expectations -->

## Package managers

The repo is developed with **npm**. **Yarn** is an alternative path via `.yarnrc.yml` (`nodeLinker: node-modules`); if you use Yarn, keep `yarn.lock` policy explicit in PRs.

## CLI, binaries, and Pages

### Static hub browse URLs

<!-- #region sidetrack:dev-static-hub-urls -->

The static hub and `_site/browse/` pages are meant to provide **working URLs**
for sharing whose opaque browse slugs are **stable unless** you rename or move
the primary file or companion Markdown: same `sourcePath` and `sidetrackPath`
strings → same slug on every rebuild and machine. **Renames or moves** change
those strings and therefore **change the slug**—they are not “permalinks”
across file moves. Keep hub
(`index.html`), browse HTML, and location hashes working across typical
rebuilds of the same revision on GitHub Pages; prefer **same-origin**
browse/search over sending readers to raw hosts unless they opt out. Changing
slug schemes or the exact pair strings fed into them is a **breaking** bookmark
change—treat it as rare, document it, and consider redirects. When you change
URL shape or client navigation, update automated tests (including Cypress under
`cypress/e2e/`) and call out breaking changes in the PR.

- **Init:** `npm run sidetrack -- init` is idempotent (storage, seed `index.json` / `.sidetrack.toml` when missing). Use `npm run sidetrack -- init config` for TOML defaults, or `init config --force` to replace. `npm run sidetrack -- init scm` refreshes the marked `pre-commit` block that runs `sidetrack validate --staged` when the linked CLI exists at the repo root.
- **Standalone binaries / CI:** [`.github/workflows/binaries.yml`](../.github/workflows/binaries.yml); workflow artifacts expire; **`v*`** tags attach builds to [GitHub Releases](https://github.com/d-led/sidetrack/releases). Local builds, smoke tests, and macOS quarantine: see subsections below (README **Standalone CLI binaries**).
- **Homebrew tap (binary formula):** After a tagged release is published, job **`update-homebrew-tap`** (same workflow) runs [`scripts/push-homebrew-tap.sh`](../scripts/push-homebrew-tap.sh): it clones [d-led/homebrew-d-led](https://github.com/d-led/homebrew-d-led), writes `sidetrack.rb` via [`scripts/generate-homebrew-formula.mjs`](../scripts/generate-homebrew-formula.mjs), and pushes to **`main`** when there are changes. Set repository secret **`HOMEBREW_TAP_PUSH_TOKEN`** to a fine-grained PAT with **Contents: Read and write** on that tap only (classic PAT with `repo` scope also works). **In GitHub Actions the job fails if that secret is missing** so a tag release cannot silently omit the formula; locally, the same script exits 0 without cloning when the token is unset. The formula uses the same four release assets as the CI matrix (**darwin-arm64**, **darwin-x64**, **linux-arm64**, **linux-x64**); Windows is release-only, not Homebrew.
- **GitHub Pages:** set `[static_site]` in `.sidetrack.toml`; `npm run pages:build` writes `_site/`. [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) deploys via `workflow_run` after [`ci.yml`](../.github/workflows/ci.yml) succeeds on `main` (includes Cypress in `e2e-static`). Re-run a failed **pages** job from Actions if deploy flaked. Enable **Settings → Pages → Build: GitHub Actions**.
- **Local Pages preview (watch, dev-only):** The Node static server here is for **developers and the CLI**; **production** is still the built **`_site/`** tree on your real host (for example GitHub Pages above). **`npm run serve`** and **`npm run pages:serve`** both run [`scripts/serve.sh`](../scripts/serve.sh), which builds the CLI stack then runs [`scripts/serve-with-package-watch.mjs`](../scripts/serve-with-package-watch.mjs): that layer watches `packages/{core,render,code-sidetrack-static,cli}/src` (and render's `esbuild-code-browser-client.mjs`), rebuilds affected workspace packages on save, and **automatically restarts** **`sidetrack serve`** when needed so Node reloads `dist/`—you do **not** need to stop or restart the dev server by hand. Inside the CLI, **`sidetrack serve`** watches `.sidetrack.toml`, static-site inputs, companions under `.sidetrack/`, and `index.json`, rebuilds **`_site/`** on change, keeps the same HTTP listener, and injects a local **browser livereload** client into generated HTML after successful rebuilds. Default port **4173** (override with `npm run serve -- --port 8080`); livereload listens on the next port when available. Set **`SIDETRACK_SERVE_NO_PACKAGE_WATCH=1`** to skip the workspace watcher (one-shot package builds only). For native file watching on the workspace tree, set **`SIDETRACK_SERVE_PACKAGE_WATCH_POLL=0`** (defaults to polling to avoid **EMFILE** with small `ulimit -n`).

<!-- #endregion sidetrack:dev-static-hub-urls -->

### macOS quarantine (standalone CLI)

Apple’s security layer may block a downloaded `sidetrack-darwin-*` binary until you clear the quarantine extended attribute:

```bash
xattr -d com.apple.quarantine /path/to/sidetrack-darwin-arm64
```

Broader cleanup (all extended attributes on one file):

```bash
xattr -c /path/to/sidetrack-darwin-arm64
```

(`xattr -r` is not valid on macOS; use `find … -exec` only if you truly need a tree.)

### Building binaries locally

From the repo root: `npm ci`, then `npm run binary:build` and `npm run binary:smoke`. If your `node` is from **Homebrew**, the SEA build may need a **nodejs.org**-style Node of the same major as CI—set **`SIDETRACK_SEA_NODE`** to that binary’s path (the build script logs what it used).

## Expensive CI

[`.github/workflows/ci-expensive.yml`](../.github/workflows/ci-expensive.yml) runs on **`workflow_dispatch`** and on pull requests labeled **`run-expensive-ci`**. Maintainers may later gate it with a GitHub Environment.

## GitHub CI (Cypress static site)

On push/PR, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs job **`e2e-static`** after **`quick`**: `pages:build`, **`node scripts/validate-pages-github-links.mjs`** (GitHub blob URL shape, no doubled-browse-path stacking, optional live HEAD to the hub source URL when `SIDETRACK_VALIDATE_PAGES_LIVE=1`), Cypress in `cypress/included`, artifact **`e2e-ci-bundle`**. The static server listens on **14173** (not the dev **`sidetrack serve`** default **4173**). After a local **`npm run pages:build`**, run **`npm run pages:validate`** (set **`SIDETRACK_VALIDATE_PAGES_LIVE=1`** to also HEAD-check `toolbar-source-github` against `github.com`). [`.github/workflows/e2e-publish-checks.yml`](../.github/workflows/e2e-publish-checks.yml) (`workflow_run` on **`ci`**) downloads that bundle and publishes JUnit to **GitHub Checks** without checking out fork PR SHAs. Ad-hoc runs: [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) (**workflow_dispatch** only). Locally use `npm run e2e` or `npm run e2e:ci`.

## Editor extension workflows

### 1. Dogfood: install from this repo + open a folder

`npm run extension:dogfood` runs **`scripts/install-extension.sh`** (build, bundle,
package `.vsix`, uninstall old id, `--force` install), then opens a new editor window on
a folder (`-n` / `--new-window` when the CLI supports it).

```bash
npm run extension:dogfood           # fixture workspace
npm run extension:dogfood:repo      # this monorepo root
npm run extension:dogfood -- .      # same; `--` forwards `.` to the script
```

After changing extension sources, re-run dogfood or `npm run extension:install`, then reload
the window if that workspace was already open.

### 2. Install only (no automatic folder launch)

```bash
npm run extension:install      # build + bundle + package + install
npm run extension:package      # build + bundle + package only (no install)
npm run extension:uninstall    # remove it
```

The installer script bundles the extension with esbuild (inlining
`@sidetrack/core`) before `vsce` packages the `.vsix`.

### 3. Extension Development Host + debugger (F5)

To set breakpoints in `packages/vscode/src/**`, open the `packages/vscode` folder in the
editor and use the **Run and Debug** / **Extension** launch configuration (add
`launch.json` if your editor has not generated one). That path attaches a debugger;
`npm run extension:dogfood` installs the packaged extension into your normal editor instead.

### VS Code engine compatibility (SideTrack extension)

<!-- #region sidetrack:dev-vscode-engine -->

The extension is a normal VS Code extension: compatibility is a contract between
**declared minimum**, **TypeScript typings**, **runtime behavior**, and **where
users install it** (VS Code, VS Code forks, Cursor, etc.).

#### Declare the floor (`engines.vscode`)

In `packages/vscode/package.json`, **`engines.vscode`** is the supported way to
say “this extension only runs on VS Code at least X”. The host refuses
incompatible installs when possible, so users see a clear incompatibility instead
of a random `TypeError` from missing API.

Keep **`@types/vscode`** in that same `package.json` aligned with that minimum
(typically the same `1.x.y` as the lower bound you support) so the compiler
matches the API surface you actually guarantee.

#### Avoid opaque runtime errors

`engines.vscode` does not polyfill newer APIs. If you need a capability added in
a specific release, either **raise the engine** (preferred for this repo) or
**detect the capability** and show a clear message (output channel / notification)
instead of dereferencing `undefined`. New commands should reuse the **SideTrack**
output channel where appropriate (see below).

#### Integration tests and VS Code builds

Extension integration tests use **`@vscode/test-cli`** and
`packages/vscode/.vscode-test.mjs`. By default they download **`stable`**.

**Desktop README screenshots (automated):** `bash scripts/refresh-vscode-readme-screenshots-desktop.sh` (alias: `npm run extension:vscode-readme-screenshots:desktop`) launches that VS Code build with `--remote-debugging-port` and uses Playwright CDP (`scripts/capture-vscode-readme-screenshots-desktop.mjs`), writing several **`vscode-*.png`** files. Scenario sequence and how to extend it: **`.sidetrack/source/packages/vscode/README.md/main.md`** (Maintainer). Optional **`SIDETRACK_VSCODE_VIEWPORT_WIDTH`** / **`SIDETRACK_VSCODE_VIEWPORT_HEIGHT`** (defaults 1200×780) and **`SIDETRACK_VSCODE_ZOOM_LEVEL`** (default 2). The temp profile hides the secondary sidebar for cleaner frames. **`bash scripts/sidetrack-screenshots-in-fresh-worktree.sh`** runs the same in a clean worktree. Requires `npx playwright install chromium` once. Respects **`VSCODE_TEST_VERSION`** like extension tests. **Manual:** `bash scripts/refresh-vscode-readme-screenshots-manual.sh`, **`bash scripts/refresh-root-readme-screenshots.sh`** for hub README assets.

- **Local / one-off:** set **`VSCODE_TEST_VERSION`** to `stable`, `insiders`, or
  an exact version string (for example the same value as `engines.vscode`):

  ```bash
  VSCODE_TEST_VERSION=1.95.0 npm run test:vscode-extension
  ```

- **CI:** [`.github/workflows/ci-vscode-extension.yml`](../.github/workflows/ci-vscode-extension.yml)
  runs the suite against **`stable`** and against the **pinned minimum** that must
  stay in lockstep with **`engines.vscode`** in `packages/vscode/package.json`.

When you **bump the declared minimum**, update in one go: `engines.vscode`,
`@types/vscode`, the workflow matrix pin, and re-run `npm run test:vscode-extension`
with both `VSCODE_TEST_VERSION=stable` and the new minimum.

#### Reference hosts (refresh when verifying compatibility)

Cursor and plain VS Code do not ship the same underlying “VS Code version” string
in **Help → About**. The table below is a **maintainer snapshot** for smoke
testing and expectations — refresh the numbers when you verify on newer installs.

| Host                      | VS Code version (About) | Noted      |
| ------------------------- | ----------------------- | ---------- |
| Cursor                    | 1.105.1                 | 2026-04-23 |
| VS Code (macOS Universal) | 1.117.0                 | 2026-04-23 |

SideTrack’s declared minimum (`^1.95.0` at the time this section was added) is
intentionally **below** both reference rows: forks can lag upstream, and the
extension should keep working on the declared range until you intentionally adopt
newer-only APIs and raise `engines.vscode`.

<!-- #endregion sidetrack:dev-vscode-engine -->

## Scroll sync and paired panes

After **SideTrack: Open sidetrack beside source** (or **Add block from
selection**, which opens the pair for you), the extension wires a scroll
listener on **both** editors:

- **Source → sidetrack:** the top visible line of the source picks a target
  line in the Markdown. If `index.json` lists `lines:` anchors that match
  `<!-- sidetrack:block id=… -->` markers in the sidetrack file, the
  sidetrack scroll snaps to the block whose source range **contains** that
  top line (or the nearest sensible block when you are in a gap). Without
  blocks, a lightweight proportional scroll is used instead.
- **SideTrack → source:** the top visible line in the Markdown maps back to
  the start of the corresponding source range for the same block list.

Edits to either file or saving `index.json` refresh the block map on a short
debounce so markers and metadata edits stay in sync without reloading the
window.

## Observing the extension at runtime

### The `SideTrack` output channel

The extension creates an output channel named **SideTrack** for
user-facing reports. Today it is only written to by **SideTrack:
Validate workspace metadata**, which dumps each validation issue there
and reveals the panel. To view:

- Open the Output panel: **View → Output** (or `Cmd/Ctrl+Shift+U`).
- Pick **SideTrack** from the dropdown on the right of the panel.

If you are adding a new command and want visible, structured logging,
reuse that same channel rather than `console.log` — users see Output,
they do not see the Developer Tools console.

### Extension Host log

Activation errors and stack traces from the extension host appear under **Developer: Show Logs… → Extension Host**.

### The Developer Tools console

For extension code paths that touch the webview preview or for any
`console.log` calls in the extension itself:

- Command Palette → **Developer: Toggle Developer Tools**.
- Console tab shows `console.log` output from both the extension host
  and any webviews.

## Debugging

`npm run extension:dogfood` installs the packaged build into your normal editor without a debugger; use **Run and Debug** on the `packages/vscode` workspace to attach one.

If a `SideTrack:` command is missing after install, run `npm run extension:install` (or dogfood) and reload the window. After editing extension sources in the **Extension** dev host, run `npm run build -w sidetrack-vscode` before reloading.

### The `.sidetrack/` folder did not appear

`sidetrack init` only creates `.sidetrack/storage` and
`.sidetrack/metadata/index.json` — it does _not_ preseed per-file
Markdown. Those are created on demand when you:

- Open a source file and run **SideTrack: Open sidetrack beside
  source**, or
- Run `sidetrack render --source <file>` to render a file's track.

Also: `storage.dir` inside `.git/` is rejected by design (see
`SECURITY.md`). The CLI will refuse to initialize with a clear error.

### `sidetrack` not found on PATH after `npm run cli:install`

The global `npm` bin directory might not be on your PATH.
`scripts/install-cli.sh` prints the exact path to add after linking.

## Where changes tend to go

Rough mental map for new contributors:

- Config semantics → `packages/core/src/config.ts` +
  `packages/core/src/paths.ts` (both well-tested; add behavior tests,
  not snapshot tests).
- Git hook wording → `packages/cli/src/git-hooks.ts`.
- CLI command surface → `packages/cli/src/cli.ts`. Keep command
  handlers thin; push logic into the core or a sibling module and
  unit-test that module.
- Rendering pipeline → `packages/render/src`. The sanitize allow-list
  lives near the top of the pipeline — changes there affect security
  posture; read `SECURITY.md` first.
- Extension behavior → `packages/vscode/src/extension.ts`.

## Publishing to npm (maintainers)

Release is split so **bumping** and **tagging** stay separate from **publish**.

| Script                    | Role                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/bump-version.sh` | Bumps every workspace `package.json`, runs `scripts/sync-workspace-deps.mjs`, refreshes `package-lock.json`, updates `CHANGELOG.md` when `[Unreleased]` exists. Supports `patch`, `minor`, `major`, `rc`, `release`, `set <version>`, `--dry-run`. Does **not** touch git — safe on a dirty tree. |
| `scripts/tag-version.sh`  | Reads `packages/core/package.json`, requires a **clean** tree, creates annotated `v<version>` at `HEAD`. Run after the bump commit.                                                                                                                                                               |
| `scripts/publish.sh`      | Clean tree + `HEAD` tagged with the canonical version → reproducible `npm ci`, build all workspaces, unit tests, then `npm publish --access public` per public workspace in dependency order. Flags: `--dry-run`, `--otp=…`, `--tag=next` (RCs).                                                  |
| `scripts/release.sh`      | From a **clean** tree: bump → `git commit` → tag (same as `tag-version.sh`) → `git push` / `git push --tags` → `publish.sh`.                                                                                                                                                                      |

Root shortcuts: `npm run version:bump`, `version:tag`, `version:sync`, `publish:all`, `release`.

**All-in-one (clean tree):** `npm run release -- minor` — bump, commit, tag, push, publish.

**Stepwise** (e.g. wait for CI binaries before npm): `npm run version:bump -- minor` → commit → `npm run version:tag` → `git push && git push --tags` → `npm run publish:all`.

The **`sidetrack-vscode`** package is **private** on npm; ship it with `npm run extension:package` and upload the `.vsix`.

Publishing is **manual** from a maintainer machine with **2FA** / OTP — not from GitHub Actions today. Prefer **OIDC trusted publishing** and **npm provenance** when automation lands: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers), [GitHub OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect). Avoid long-lived npm tokens in repo secrets unless there is no alternative.

Do not hand-edit `@sidetrack/*` version pins; `scripts/sync-workspace-deps.mjs` keeps them aligned with `packages/core/package.json`.

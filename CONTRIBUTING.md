# Contributing

Thank you for helping build ParallelDocs.

**Terminology:** **ParallelDocs** is the tool and packages in this repo. **parallel-docs** (lowercase) is also the paired Markdown under `.parallel-docs/source/` beside a source file.

## Principles

We follow the spirit of the [C4-style chumak contributing guide](https://raw.githubusercontent.com/zeromq/chumak/refs/heads/master/CONTRIBUTING.md). We do not claim full C4 compliance; conventions grow with the project.

## Before you open a PR

- For very large changes, open an issue first unless the direction is already agreed in public discussion (e.g. an existing issue).
- Keep PRs focused; prefer several small PRs over one sweeping refactor.
- **Before review, run:** `npm run quality:gate` — same script path as the **`ci.yml`** **`quick`** job (format, ESLint, shellcheck, dupes, typecheck, unit tests). Cypress + static site runs as **`e2e-static`** after that; see **GitHub CI (Cypress static site)** in [`docs/development.md`](docs/development.md).
- **Hands-on detail** (tests, lint, deps, format, coverage, extension workflows, binaries, Pages): **[`docs/development.md`](docs/development.md)**. That file is the operational source of truth; this document is only the contract above.

## Repository norms

- **npm** and committed **`package-lock.json`** are canonical. Yarn is optional (`.yarnrc.yml`); if you use it, resolve lockfile policy in the PR description.
- **Automate sequences:** if a task needs more than two shell commands in order, add **`scripts/`** and an **`npm run …`** entry — do not rely on long copy-paste blocks in markdown.

## Security

Report vulnerabilities as described in **[`SECURITY.md`](SECURITY.md)** (private advisory, not a public issue).

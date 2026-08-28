# `cli.ts` — parallel-docs

Commander registers **`init`**, **`init config`**, **`init scm`**, **`validate`**, **`doctor`**, **`migrate`**, **`paths`**, **`render`**. The version string comes from **this** package’s `package.json` (JSON import) so SEA bundles and plain `node` agree on one number.

**Split** — `validate` is for machines (CI, hooks). `doctor` adds environment checks for humans. `paths` answers “where is the parallel-docs for this source path?” without reimplementing storage rules.

**Binaries** — each **`v*`** tag publishes builds to **[GitHub Releases](https://github.com/d-led/parallel-docs/releases)** ([`.github/workflows/binaries.yml`](../../../../../../.github/workflows/binaries.yml)); local smoke: **`npm run binary:smoke`**.

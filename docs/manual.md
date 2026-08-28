# ParallelDocs Manual

This manual is the operator-focused reference for running ParallelDocs day to day:
authoring, validating, rendering, sharing, and maintaining companion docs.

For conceptual background and trade-offs, open this file side-by-side with its
parallel-docs companion:
[`/.parallel-docs/source/docs/manual.md/main.md`](../.parallel-docs/source/docs/manual.md/main.md)

## 1) What ParallelDocs Is

ParallelDocs keeps narrative documentation in repository-tracked Markdown files
paired to source paths under `.parallel-docs/source/`, plus machine metadata in
`.parallel-docs/metadata/index.json`.

- **Primary source**: your code / README / docs file.
- **Companion parallel-docs**: the paired Markdown file.
- **Index metadata**: structured block anchors, snippets, and validation inputs.

Canonical storage semantics:
[`docs/spec/storage.md`](./spec/storage.md)

## 2) Install And Bootstrap

Install and setup paths:

- User install guide: [`docs/user/install.md`](./user/install.md) (includes **`npx parallel-docs`**; **`npx parallel-docs --help`** prints `Usage: parallel-docs [options] [command]`.)
- Clone + maintainer setup: [`docs/development.md`](./development.md)

Typical bootstrap from repo root:

```bash
npm ci
npm run setup
```

## 3) Core CLI Workflows

CLI command reference:
[`docs/user/cli.md`](./user/cli.md)

Common lifecycle:

1. `parallel-docs init` to create storage/config baseline.
2. Author companions in `.parallel-docs/source/`.
3. Run `parallel-docs validate` (or `validate --staged`) before commit.
4. Render static view (`parallel-docs render` or `npm run pages:build`).

## 4) Authoring In VS Code / Cursor

Extension guide:
[`packages/vscode/README.md`](../packages/vscode/README.md)

Key commands:

- Open paired markdown beside source
- Add side-track block from selection
- Open paired markdown (choose angle)
- Add angle to project
- Validate workspace

## 5) Blocks, Anchors, And Drift

Read these together:

- Blocks spec: [`docs/spec/blocks.md`](./spec/blocks.md)
- Anchors spec: [`docs/spec/anchors.md`](./spec/anchors.md)
- Operations guide: [`docs/user/keeping-blocks-in-sync.md`](./user/keeping-blocks-in-sync.md)

Principle: block IDs and source anchors are behavioral contracts. Keep them
stable, update metadata intentionally, and validate before merge.

## 6) Angles (Multiple Perspectives)

Angles let one source path have multiple companion files, e.g. `main`,
`architecture`, `review-notes`.

Operational semantics:

- Storage/paths: [`docs/spec/storage.md#angles-named-perspectives-on-the-same-source`](./spec/storage.md#angles-named-perspectives-on-the-same-source)
- Config keys: [`docs/user/config.md`](./user/config.md)
- Migration command: `parallel-docs migrate-angles`

## 7) Static Site, Permalinks, And Sharing

Build and preview:

- `npm run pages:build`
- `npm run pages:serve` (or `npm run serve`)

Static browser behavior:

- **Stable** pair browse URLs under `/browse/` **as long as** you do not rename
  or move the primary file or its companion Markdown: the opaque slug is fixed
  for that `(sourcePath, parallelDocsPath)` pair across rebuilds and machines.
  **Rename or move** either side → those strings change → **a new slug** (old
  links are not redirected automatically).
- Humane alias paths (source-shaped browse routes) where the host can serve them
- Share/copy permalink control in toolbar
- Main hub may adjust the address bar toward the canonical browse URL for the
  current pair

Related docs:

- Development notes: [`docs/development.md`](./development.md)
- Storage spec (Pages details): [`docs/spec/storage.md`](./spec/storage.md)

## 8) Configuration Reference

Primary config reference:
[`docs/user/config.md`](./user/config.md)

Important distinction:

- **`[static_site].default_angle`** chooses the default hub pair.
- **`[angles].default_angle`** chooses default angle for tooling/editor flows.

## 9) Validation And Quality Gate

Required maintainer discipline:

- Unit tests: `npm run test:unit`
- Extension tests when touching extension: `npm run test:vscode-extension`
- Full quality gate: `npm run quality:gate`

Guide:
[`docs/development.md#quality-gate`](./development.md#quality-gate)

## 10) Troubleshooting

Troubleshooting catalog:
[`docs/user/troubleshooting.md`](./user/troubleshooting.md)

High-frequency issues:

- path mapping confusion (flat vs angle layout)
- stale markers / index drift
- static-site link resolution expectations
- environment/toolchain mismatch for binaries

## 11) Security And Contribution Contract

- Security model: [`SECURITY.md`](../SECURITY.md)
- Contribution expectations: [`CONTRIBUTING.md`](../CONTRIBUTING.md)

Do not bypass validation by loosening checks; fix root causes in code/tests.

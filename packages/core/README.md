# @parallel-docs/core

Models, TOML config parsing, JSON metadata validation + migrations, Git SCM adapter, and staleness helpers for [ParallelDocs](https://github.com/d-led/parallel-docs) — a side-by-side "side track" for code.

This package is the library all other ParallelDocs packages build on. It has no UI and no process side-effects.

## Install

```bash
npm install @parallel-docs/core
```

## Use

```ts
import {
  parallelDocsMarkdownPath,
  loadParallelDocsConfig,
  validateProject,
} from "@parallel-docs/core";

const config = await loadParallelDocsConfig(process.cwd());
const report = await validateProject(process.cwd());
for (const issue of report.issues) {
  console.log(issue.level, issue.message);
}
```

Paths, schema, and anchor grammar are specified under [`docs/spec/`](https://github.com/d-led/parallel-docs/tree/main/docs/spec) in the monorepo.

## License

[MPL-2.0](./LICENSE)

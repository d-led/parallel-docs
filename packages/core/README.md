# @sidetrack/core

Models, TOML config parsing, JSON metadata validation + migrations, Git SCM adapter, and staleness helpers for [SideTrack](https://github.com/d-led/sidetrack) — a side-by-side "side track" for code.

This package is the library all other SideTrack packages build on. It has no UI and no process side-effects.

## Install

```bash
npm install @sidetrack/core
```

## Use

```ts
import { sidetrackMarkdownPath, loadSideTrackConfig, validateProject } from "@sidetrack/core";

const config = await loadSideTrackConfig(process.cwd());
const report = await validateProject(process.cwd());
for (const issue of report.issues) {
  console.log(issue.level, issue.message);
}
```

Paths, schema, and anchor grammar are specified under [`docs/spec/`](https://github.com/d-led/sidetrack/tree/main/docs/spec) in the monorepo.

## License

[MPL-2.0](./LICENSE)

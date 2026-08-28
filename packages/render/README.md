# @sidetrack/render

Markdown → HTML rendering stack for [SideTrack](https://github.com/d-led/sidetrack): `remark-parse` + `remark-gfm` (tables, task lists, strikethrough, autolink literals, footnotes), `rehype-slug` on headings, `rehype-sanitize`, `rehype-highlight` (lowlight), Mermaid containers, and ready-made HTML shells (side-by-side and a client-side interactive code browser with in-page token search).

## Install

```bash
npm install @sidetrack/render
```

## Use

```ts
import { renderSideBySideHtml } from "@sidetrack/render";

const html = await renderSideBySideHtml({
  title: "src/example.ts",
  code: sourceText,
  language: "ts",
  sidetrackMarkdown: markdownText,
});
```

The package ships a bundled browser client for the code-browser shell; no extra build step is required in your project.

## License

[MPL-2.0](./LICENSE)

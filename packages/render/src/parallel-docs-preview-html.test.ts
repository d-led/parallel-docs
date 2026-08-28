import { describe, expect, it } from "vitest";

import { renderParallelDocsPreviewHtml } from "./parallel-docs-preview-html.js";

describe("renderParallelDocsPreviewHtml", () => {
  it("should inject per-line anchors for scroll-sync with rendered companion Markdown", async () => {
    const html = await renderParallelDocsPreviewHtml({
      markdown: "# Hi\n\nLine two",
    });
    expect(html).toContain('id="parallel-docs-md-line-0"');
    expect(html).toContain('id="parallel-docs-md-line-2"');
  });

  it("should use the same GFM pipeline as static rendering (strikethrough)", async () => {
    const html = await renderParallelDocsPreviewHtml({
      markdown: "~~gone~~",
    });
    expect(html.toLowerCase()).toMatch(/<del|<s[>\s]/);
  });
});

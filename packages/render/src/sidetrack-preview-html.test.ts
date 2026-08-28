import { describe, expect, it } from "vitest";

import { renderSideTrackPreviewHtml } from "./sidetrack-preview-html.js";

describe("renderSideTrackPreviewHtml", () => {
  it("should inject per-line anchors for scroll-sync with rendered companion Markdown", async () => {
    const html = await renderSideTrackPreviewHtml({
      markdown: "# Hi\n\nLine two",
    });
    expect(html).toContain('id="sidetrack-md-line-0"');
    expect(html).toContain('id="sidetrack-md-line-2"');
  });

  it("should use the same GFM pipeline as static rendering (strikethrough)", async () => {
    const html = await renderSideTrackPreviewHtml({
      markdown: "~~gone~~",
    });
    expect(html.toLowerCase()).toMatch(/<del|<s[>\s]/);
  });
});

import { describe, expect, it } from "vitest";

import { renderSideBySideHtml } from "./side-by-side.js";

describe("renderSideBySideHtml", () => {
  it("includes folded layout CSS and both panes", async () => {
    const html = await renderSideBySideHtml({
      code: "const x = 1;",
      language: "ts",
      sidetrackMarkdown: "Hello **world**.",
    });
    expect(html).toContain(".layout");
    expect(html).toContain("grid-template-columns");
    expect(html).toContain(">SideTrack<");
    expect(html).toContain(">Code<");
  });
});

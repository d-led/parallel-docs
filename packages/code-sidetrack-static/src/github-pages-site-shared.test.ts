import { afterEach, describe, expect, it } from "vitest";

import { composeSideTrackMarkdown, emptySideTrackMarkdown } from "./github-pages-site-shared.js";

const EMPTY_STATE_MARKDOWN_ENV = "SIDETRACK_EMPTY_STATE_MARKDOWN";

afterEach(() => {
  process.env[EMPTY_STATE_MARKDOWN_ENV] = undefined;
});

describe("empty side-track markdown fallback", () => {
  it("returns the default message when no serve CTA is configured", () => {
    expect(emptySideTrackMarkdown()).toBe("_No sidetrack content configured._\n");
  });

  it("appends serve CTA markdown when SIDETRACK_EMPTY_STATE_MARKDOWN is set", () => {
    process.env[EMPTY_STATE_MARKDOWN_ENV] =
      "- [Initialize](http://127.0.0.1:4173/__sidetrack/serve/init)";
    expect(emptySideTrackMarkdown()).toContain("No sidetrack content configured");
    expect(emptySideTrackMarkdown()).toContain("/__sidetrack/serve/init");
  });

  it("composeSideTrackMarkdown uses the same fallback for empty intro + file markdown", () => {
    process.env[EMPTY_STATE_MARKDOWN_ENV] =
      "- [Generate](http://127.0.0.1:4173/__sidetrack/serve/generate-entry)";
    expect(composeSideTrackMarkdown("", "")).toContain("/__sidetrack/serve/generate-entry");
  });
});

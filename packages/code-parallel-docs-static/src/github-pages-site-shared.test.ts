import { afterEach, describe, expect, it } from "vitest";

import {
  composeParallelDocsMarkdown,
  emptyParallelDocsMarkdown,
} from "./github-pages-site-shared.js";

const EMPTY_STATE_MARKDOWN_ENV = "PARALLEL_DOCS_EMPTY_STATE_MARKDOWN";

afterEach(() => {
  process.env[EMPTY_STATE_MARKDOWN_ENV] = undefined;
});

describe("empty side-track markdown fallback", () => {
  it("returns the default message when no serve CTA is configured", () => {
    expect(emptyParallelDocsMarkdown()).toBe("_No parallel-docs content configured._\n");
  });

  it("appends serve CTA markdown when PARALLEL_DOCS_EMPTY_STATE_MARKDOWN is set", () => {
    process.env[EMPTY_STATE_MARKDOWN_ENV] =
      "- [Initialize](http://127.0.0.1:4173/__parallel_docs/serve/init)";
    expect(emptyParallelDocsMarkdown()).toContain("No parallel-docs content configured");
    expect(emptyParallelDocsMarkdown()).toContain("/__parallel_docs/serve/init");
  });

  it("composeParallelDocsMarkdown uses the same fallback for empty intro + file markdown", () => {
    process.env[EMPTY_STATE_MARKDOWN_ENV] =
      "- [Generate](http://127.0.0.1:4173/__parallel_docs/serve/generate-entry)";
    expect(composeParallelDocsMarkdown("", "")).toContain("/__parallel_docs/serve/generate-entry");
  });
});

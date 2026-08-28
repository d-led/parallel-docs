import { describe, expect, it } from "vitest";

import { browsePageSlugFromPair } from "./browse-page-slug.js";

describe("browsePageSlugFromPair", () => {
  it("returns the same slug for the same documented pair", () => {
    const pair = {
      sourcePath: "README.md",
      parallelDocsPath: ".parallel-docs/source/README.md/main.md",
    };
    expect(browsePageSlugFromPair(pair)).toBe(browsePageSlugFromPair(pair));
  });

  it("treats sourcePath and parallelDocsPath as ordered inputs", () => {
    const canonical = browsePageSlugFromPair({
      sourcePath: "README.md",
      parallelDocsPath: ".parallel-docs/source/README.md/main.md",
    });
    const swapped = browsePageSlugFromPair({
      sourcePath: ".parallel-docs/source/README.md/main.md",
      parallelDocsPath: "README.md",
    });
    expect(swapped).not.toBe(canonical);
  });

  it("matches a fixed digest for a reference pair (deterministic across rebuilds)", () => {
    expect(
      browsePageSlugFromPair({
        sourcePath: "README.md",
        parallelDocsPath: ".parallel-docs/source/README.md/main.md",
      }),
    ).toBe("3Cicce-ej7yxJQjPeOi7QR5i3J7C");
  });
});

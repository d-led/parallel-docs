import { describe, expect, it } from "vitest";

import { parallelDocsRenderVersion } from "./package-version.js";

describe("@parallel-docs/render package version string", () => {
  it("reads a semver-like version from this package.json", () => {
    const v = parallelDocsRenderVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

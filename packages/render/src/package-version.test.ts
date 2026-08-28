import { describe, expect, it } from "vitest";

import { sidetrackRenderVersion } from "./package-version.js";

describe("@sidetrack/render package version string", () => {
  it("reads a semver-like version from this package.json", () => {
    const v = sidetrackRenderVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

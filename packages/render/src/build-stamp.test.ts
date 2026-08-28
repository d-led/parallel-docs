import { afterEach, describe, expect, it } from "vitest";

import { formatSideTrackBuiltAtLocal } from "./build-stamp.js";

describe("formatSideTrackBuiltAtLocal", () => {
  const origTz = process.env.TZ;

  afterEach(() => {
    if (origTz === undefined) delete process.env.TZ;
    else process.env.TZ = origTz;
  });

  it("given TZ is UTC, includes calendar fields and a zone hint for a fixed instant", () => {
    process.env.TZ = "UTC";
    const s = formatSideTrackBuiltAtLocal(new Date("2026-06-15T14:30:45.000Z"));
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/Jun/);
    expect(s).toMatch(/15/);
    expect(s).toMatch(/14/);
    expect(s).toMatch(/30/);
    expect(s).toMatch(/45/);
    expect(s).toMatch(/GMT|UTC/i);
  });
});

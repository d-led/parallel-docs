import { describe, expect, it } from "vitest";

import {
  SIDETRACK_COLOR_THEME_STORAGE_KEY,
  sidetrackColorThemeHeadBoot,
  nextSideTrackColorThemeMode,
  parseSideTrackColorThemeMode,
} from "./code-browser-color-theme.js";

describe("parseSideTrackColorThemeMode", () => {
  it("given null or unknown, returns system", () => {
    expect(parseSideTrackColorThemeMode(null)).toBe("system");
    expect(parseSideTrackColorThemeMode(undefined)).toBe("system");
    expect(parseSideTrackColorThemeMode("")).toBe("system");
    expect(parseSideTrackColorThemeMode("nope")).toBe("system");
  });

  it("given light, dark, or system, returns that mode", () => {
    expect(parseSideTrackColorThemeMode("light")).toBe("light");
    expect(parseSideTrackColorThemeMode("dark")).toBe("dark");
    expect(parseSideTrackColorThemeMode("system")).toBe("system");
  });
});

describe("nextSideTrackColorThemeMode", () => {
  it("cycles system then light then dark then system", () => {
    expect(nextSideTrackColorThemeMode("system")).toBe("light");
    expect(nextSideTrackColorThemeMode("light")).toBe("dark");
    expect(nextSideTrackColorThemeMode("dark")).toBe("system");
  });
});

describe("sidetrackColorThemeHeadBoot", () => {
  it("should reference the storage key and hljs link ids", () => {
    const s = sidetrackColorThemeHeadBoot();
    expect(s).toContain(SIDETRACK_COLOR_THEME_STORAGE_KEY);
    expect(s).toContain("sidetrack-hljs-light");
    expect(s).toContain("sidetrack-hljs-dark");
    expect(s).toContain("localStorage.getItem");
  });
});

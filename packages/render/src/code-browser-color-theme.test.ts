import { describe, expect, it } from "vitest";

import {
  PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY,
  parallelDocsColorThemeHeadBoot,
  nextParallelDocsColorThemeMode,
  parseParallelDocsColorThemeMode,
} from "./code-browser-color-theme.js";

describe("parseParallelDocsColorThemeMode", () => {
  it("given null or unknown, returns system", () => {
    expect(parseParallelDocsColorThemeMode(null)).toBe("system");
    expect(parseParallelDocsColorThemeMode(undefined)).toBe("system");
    expect(parseParallelDocsColorThemeMode("")).toBe("system");
    expect(parseParallelDocsColorThemeMode("nope")).toBe("system");
  });

  it("given light, dark, or system, returns that mode", () => {
    expect(parseParallelDocsColorThemeMode("light")).toBe("light");
    expect(parseParallelDocsColorThemeMode("dark")).toBe("dark");
    expect(parseParallelDocsColorThemeMode("system")).toBe("system");
  });
});

describe("nextParallelDocsColorThemeMode", () => {
  it("cycles system then light then dark then system", () => {
    expect(nextParallelDocsColorThemeMode("system")).toBe("light");
    expect(nextParallelDocsColorThemeMode("light")).toBe("dark");
    expect(nextParallelDocsColorThemeMode("dark")).toBe("system");
  });
});

describe("parallelDocsColorThemeHeadBoot", () => {
  it("should reference the storage key and hljs link ids", () => {
    const s = parallelDocsColorThemeHeadBoot();
    expect(s).toContain(PARALLEL_DOCS_COLOR_THEME_STORAGE_KEY);
    expect(s).toContain("parallel-docs-hljs-light");
    expect(s).toContain("parallel-docs-hljs-dark");
    expect(s).toContain("localStorage.getItem");
  });
});

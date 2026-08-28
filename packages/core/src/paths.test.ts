import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  sidetrackAnglesLayoutEnabled,
  sidetrackAnglesSentinelPath,
  sidetrackMarkdownPath,
  sidetrackMarkdownPathForAngle,
  normalizeRepoRelativePath,
  resolvePathUnderRepoRoot,
} from "./paths.js";

describe("Repo-relative path normalization", () => {
  it("should map Windows separators to POSIX-style segments", () => {
    expect(normalizeRepoRelativePath("src\\a.ts")).toBe("src/a.ts");
  });

  it("should reject path traversal segments at any position", () => {
    expect(() => normalizeRepoRelativePath("../escape")).toThrow(/escapes/);
    expect(() => normalizeRepoRelativePath("src/../etc")).toThrow(/escapes/);
    expect(() => normalizeRepoRelativePath("..")).toThrow(/escapes/);
  });

  it("should reject absolute Windows drive paths", () => {
    expect(() => normalizeRepoRelativePath("C:\\Windows\\System32")).toThrow(/absolute/);
  });

  it("should strip a single leading root slash as a hardening measure", () => {
    expect(normalizeRepoRelativePath("/src/a.ts")).toBe("src/a.ts");
  });

  it("should allow file names that only resemble dot-segments", () => {
    expect(normalizeRepoRelativePath("src/..name.ts")).toBe("src/..name.ts");
    expect(normalizeRepoRelativePath("src/foo..bar.ts")).toBe("src/foo..bar.ts");
  });

  it("should collapse redundant ./ and current-dir segments", () => {
    expect(normalizeRepoRelativePath("./src/./a.ts")).toBe("src/a.ts");
  });
});

describe("Resolving paths strictly under the repository root", () => {
  const root = path.join(os.tmpdir(), `sidetrack-root-${process.pid}`);

  it("should resolve an allowed repo-relative path inside the given root", () => {
    const got = resolvePathUnderRepoRoot(root, "src/a.ts");
    expect(got).toBe(path.resolve(root, "src", "a.ts"));
  });

  it("should refuse traversal even when the string looks like a normal path", () => {
    expect(() => resolvePathUnderRepoRoot(root, "src/../../etc/passwd")).toThrow(/escapes/);
  });
});

describe("Default companion Markdown locations", () => {
  it("should place companions as .md files under .sidetrack/source", () => {
    expect(sidetrackMarkdownPath("src/a.ts")).toBe(".sidetrack/source/src/a.ts.md");
  });

  it("should respect a custom storage directory root", () => {
    expect(sidetrackMarkdownPath("src/a.ts", "var/sidetrack")).toBe(
      "var/sidetrack/source/src/a.ts.md",
    );
  });
});

describe("Angles layout paths", () => {
  it("should place the angles sentinel under storage/source/.default", () => {
    expect(sidetrackAnglesSentinelPath()).toBe(".sidetrack/source/.default");
    expect(sidetrackAnglesSentinelPath("var/sidetrack")).toBe("var/sidetrack/source/.default");
  });

  it("should map each source file and angle id to source/<path>/<angle>.md", () => {
    expect(sidetrackMarkdownPathForAngle("README.md", "architecture")).toBe(
      ".sidetrack/source/README.md/architecture.md",
    );
  });

  it("should reject angle ids outside the allowed slug rules", () => {
    expect(() => sidetrackMarkdownPathForAngle("README.md", "../evil")).toThrow(/Invalid angle id/);
  });

  it("should treat angles layout as enabled only when the sentinel file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sidetrack-ang-"));
    const storage = path.join(dir, ".sidetrack");
    fs.mkdirSync(path.join(storage, "source"), { recursive: true });
    expect(sidetrackAnglesLayoutEnabled(dir)).toBe(false);
    fs.writeFileSync(path.join(storage, "source", ".default"), "", "utf8");
    expect(sidetrackAnglesLayoutEnabled(dir)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

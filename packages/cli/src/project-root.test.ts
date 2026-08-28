import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findProjectRoot } from "./project-root.js";

let tmpRoot: string;

async function makeDir(p: string): Promise<string> {
  await fs.mkdir(p, { recursive: true });
  return p;
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-root-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("Discovering the SideTrack project root from the CWD", () => {
  it("prefers the nearest .sidetrack.toml over any .git ancestor", async () => {
    const project = await makeDir(path.join(tmpRoot, "outer", "inner"));
    await makeDir(path.join(tmpRoot, "outer", ".git"));
    await fs.writeFile(path.join(project, ".sidetrack.toml"), "", "utf8");
    const deep = await makeDir(path.join(project, "deep", "nested"));

    const root = await findProjectRoot(deep);

    expect(root.dir).toBe(project);
    expect(root.source).toBe("config");
  });

  it("falls back to the git repository root when no .sidetrack.toml exists", async () => {
    const repo = await makeDir(path.join(tmpRoot, "repo"));
    await makeDir(path.join(repo, ".git"));
    const deep = await makeDir(path.join(repo, "src", "pkg"));

    const root = await findProjectRoot(deep);

    expect(root.dir).toBe(repo);
    expect(root.source).toBe("git");
  });

  it("uses the starting directory when neither marker is present", async () => {
    const lonely = await makeDir(path.join(tmpRoot, "no-markers", "here"));

    const root = await findProjectRoot(lonely);

    expect(root.dir).toBe(lonely);
    expect(root.source).toBe("cwd");
  });

  it("does not mistake a sibling project's markers for our root", async () => {
    await makeDir(path.join(tmpRoot, "sibling", ".git"));
    const us = await makeDir(path.join(tmpRoot, "us"));

    const root = await findProjectRoot(us);

    expect(root.source).toBe("cwd");
    expect(root.dir).toBe(us);
  });
});

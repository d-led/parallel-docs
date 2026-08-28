import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createServeRepoWatchIgnored, repoRelativePosix } from "./serve-repo-watch-ignore.js";

describe("serve repo watch ignore", () => {
  it("repoRelativePosix maps absolute paths under the repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-rel-"));
    expect(repoRelativePosix(root, path.join(root, "a", "b.txt"))).toBe("a/b.txt");
    expect(repoRelativePosix(root, root)).toBe("");
  });

  it("repoRelativePosix returns null outside the repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-rel-out-"));
    expect(repoRelativePosix(root, path.resolve(tmpdir(), "other-out", "x"))).toBe(null);
  });

  it("createServeRepoWatchIgnored respects root .gitignore and .git", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-ig-"));
    await writeFile(
      path.join(root, ".gitignore"),
      ["node_modules/", "dist/", "!.gitkeep", ""].join("\n"),
      "utf8",
    );
    await mkdir(path.join(root, ".git", "info"), { recursive: true });
    await writeFile(path.join(root, ".git", "info", "exclude"), "local-only.txt\n", "utf8");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "app.ts"), "", "utf8");
    await mkdir(path.join(root, "node_modules", "x"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "x", "y.js"), "", "utf8");

    const ign = createServeRepoWatchIgnored(root);
    expect(ign(path.join(root, "src", "app.ts"))).toBe(false);
    expect(ign(path.join(root, "node_modules", "x", "y.js"))).toBe(true);
    expect(ign(path.join(root, ".git", "HEAD"))).toBe(true);
    const localOnly = path.join(root, "local-only.txt");
    await writeFile(localOnly, "", "utf8");
    expect(ign(localOnly)).toBe(true);
  });

  it("createServeRepoWatchIgnored never ignores paths under configured storage dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-storage-"));
    await writeFile(path.join(root, ".gitignore"), ["data/", ""].join("\n"), "utf8");
    await mkdir(path.join(root, "data", "cr", "source"), { recursive: true });
    await writeFile(path.join(root, "data", "cr", "source", "x.md"), "# x\n", "utf8");

    const ignDefault = createServeRepoWatchIgnored(root);
    expect(ignDefault(path.join(root, "data", "cr", "source", "x.md"))).toBe(true);

    const ign = createServeRepoWatchIgnored(root, { storageDirRepoRelative: "data/cr" });
    expect(ign(path.join(root, "data", "cr", "source", "x.md"))).toBe(false);
    expect(ign(path.join(root, "data", "other", "y.md"))).toBe(true);
  });

  it("createServeRepoWatchIgnored skips _site and node_modules even without .gitignore", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-builtin-"));
    await mkdir(path.join(root, "_site"), { recursive: true });
    await mkdir(path.join(root, ".parallel-docs", "source", "x"), { recursive: true });
    await writeFile(path.join(root, ".parallel-docs", "source", "x", "main.md"), "# hi\n", "utf8");

    const ign = createServeRepoWatchIgnored(root);
    expect(ign(path.join(root, "_site", "index.html"))).toBe(true);
    expect(ign(path.join(root, ".parallel-docs", "source", "x", "main.md"))).toBe(false);
  });

  it("createServeRepoWatchIgnored resolves repo-relative paths chokidar may pass", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-rel-raw-"));
    await writeFile(path.join(root, ".gitignore"), "out.txt\n", "utf8");
    await writeFile(path.join(root, "in.txt"), "", "utf8");

    const ign = createServeRepoWatchIgnored(root);
    expect(ign("in.txt")).toBe(false);
    expect(ign("out.txt")).toBe(true);
  });

  it("createServeRepoWatchIgnored applies nested .gitignore relative to that directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "parallel-docs-serve-nested-ig-"));
    await writeFile(path.join(root, ".gitignore"), "", "utf8");
    await mkdir(path.join(root, "pkg", "src"), { recursive: true });
    await writeFile(path.join(root, "pkg", ".gitignore"), "secret.txt\n", "utf8");
    await writeFile(path.join(root, "pkg", "src", "ok.ts"), "", "utf8");
    await writeFile(path.join(root, "pkg", "secret.txt"), "", "utf8");

    const ign = createServeRepoWatchIgnored(root);
    expect(ign(path.join(root, "pkg", "src", "ok.ts"))).toBe(false);
    expect(ign(path.join(root, "pkg", "secret.txt"))).toBe(true);
  });
});

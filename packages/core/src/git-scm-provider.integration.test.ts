import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GitScmProvider } from "./scm/git-scm-provider.js";

const execFileAsync = promisify(execFile);

async function git(repo: string, args: string[]) {
  await execFileAsync("git", ["-C", repo, ...args]);
}

describe("Git-backed SCM — blobs and rename detection", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("resolves blob ids at HEAD and ancestry", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "sidetrack-git-"));
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.email", "test@example.com"]);
    await git(repo, ["config", "user.name", "SideTrack Test"]);
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src", "a.ts"), "v1\n");
    await git(repo, ["add", "src/a.ts"]);
    await git(repo, ["commit", "-m", "init"]);
    const head1 = (await execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.trim();

    await writeFile(path.join(repo, "src", "a.ts"), "v2\n");
    await git(repo, ["add", "src/a.ts"]);
    await git(repo, ["commit", "-m", "second"]);
    const head2 = (await execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.trim();

    const scm = new GitScmProvider();
    const blob = await scm.getBlobIdAtHead(repo, "src/a.ts");
    expect(blob).toBeTruthy();

    await expect(scm.isAncestor(repo, head1, head2)).resolves.toBe(true);
    await expect(scm.isAncestor(repo, head2, head1)).resolves.toBe(false);
  });

  it("lists path renames between commits", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "sidetrack-git-rename-"));
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.email", "test@example.com"]);
    await git(repo, ["config", "user.name", "SideTrack Test"]);
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src", "old.ts"), "x\n");
    await git(repo, ["add", "src/old.ts"]);
    await git(repo, ["commit", "-m", "add"]);
    const c1 = (await execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.trim();
    await git(repo, ["mv", "src/old.ts", "src/new.ts"]);
    await git(repo, ["commit", "-m", "rename"]);
    const c2 = (await execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.trim();

    const scm = new GitScmProvider();
    const listRenames = scm.listPathRenamesBetweenTreeishes;
    expect(listRenames).toBeDefined();
    const renames = await listRenames(repo, c1, c2);
    expect(renames).toEqual([{ from: "src/old.ts", to: "src/new.ts" }]);
  });
});

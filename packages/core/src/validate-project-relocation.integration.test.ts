import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "./model.js";
import { validateProject } from "./validate-project.js";

const execFileAsync = promisify(execFile);

async function git(repo: string, args: string[]) {
  await execFileAsync("git", ["-C", repo, ...args]);
}

describe("Project validation — relocation hints from git-tracked files", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("given a marker only present in a tracked file that is not in the index, when validate runs, then the hint names that file", async () => {
    repo = await mkdtemp(path.join(tmpdir(), "sidetrack-val-rel-"));
    await mkdir(path.join(repo, ".sidetrack", "source"), { recursive: true });
    await mkdir(path.join(repo, ".sidetrack", "metadata"), { recursive: true });
    await mkdir(path.join(repo, "src", "lib"), { recursive: true });

    const region =
      "//#region sidetrack:relocateMe\n" + "// impl\n" + "//#endregion sidetrack:relocateMe\n";
    await writeFile(path.join(repo, "src", "lib", "handler.ts"), region, "utf8");

    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        ".sidetrack/source/src/deleted.ts.md": {
          sourcePath: "src/deleted.ts",
          sidetrackPath: ".sidetrack/source/src/deleted.ts.md",
          blocks: [{ id: "relocateMe", anchor: "marker:relocateMe" }],
        },
      },
    };
    await writeFile(
      path.join(repo, ".sidetrack", "metadata", "index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
      "utf8",
    );

    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.email", "test@example.com"]);
    await git(repo, ["config", "user.name", "SideTrack Test"]);
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "init"]);

    const { issues } = await validateProject(repo);
    const joined = issues.map((i) => i.message).join("\n");
    expect(joined).toContain("src/deleted.ts");
    expect(joined).toContain("src/lib/handler.ts");
    expect(joined).toMatch(/marker id "relocateme"/i);
  });
});

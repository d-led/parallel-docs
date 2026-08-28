import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION } from "./model.js";
import { validateProject } from "./validate-project.js";

describe("validateProject — staged scope", () => {
  it("narrows marker checks to index entries touched by staged paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-val-staged-"));
    await mkdir(path.join(dir, ".sidetrack", "metadata"), { recursive: true });
    await mkdir(path.join(dir, ".sidetrack", "source", "src"), { recursive: true });
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, ".sidetrack", "metadata", "index.json"),
      JSON.stringify(
        {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          bySideTrackPath: {
            ".sidetrack/source/src/a.ts.md": {
              sourcePath: "src/a.ts",
              sidetrackPath: ".sidetrack/source/src/a.ts.md",
              blocks: [],
            },
            ".sidetrack/source/src/b.ts.md": {
              sourcePath: "src/b.ts",
              sidetrackPath: ".sidetrack/source/src/b.ts.md",
              blocks: [],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(dir, ".sidetrack.toml"),
      [
        "[storage]",
        'dir = ".sidetrack"',
        "",
        "[static_site]",
        'title = "Fixture"',
        'source_file = "src/a.ts"',
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(dir, "src", "a.ts"),
      ["// sidetrack:start id=ok", "1", "// sidetrack:end id=ok", ""].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(dir, "src", "b.ts"),
      ["// sidetrack:start id=bad", "broken", ""].join("\n"),
      "utf8",
    );
    await writeFile(path.join(dir, ".sidetrack", "source", "src", "a.ts.md"), "# A\n", "utf8");
    await writeFile(path.join(dir, ".sidetrack", "source", "src", "b.ts.md"), "# B\n", "utf8");

    const full = await validateProject(dir);
    expect(full.issues.some((i) => i.message.includes("no matching end"))).toBe(true);

    const scoped = await validateProject(dir, { stagedRepoRelativePaths: ["src/a.ts"] });
    expect(scoped.issues.some((i) => i.message.includes("no matching end"))).toBe(false);
  });
});

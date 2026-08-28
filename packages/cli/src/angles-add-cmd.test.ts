import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runAnglesAddFromCwd } from "./angles-add-cmd.js";

describe("angles add command", () => {
  it("registers a new angle and writes the companion Markdown under Angles layout", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-ang-add-"));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      await mkdir(path.join(dir, "src"), { recursive: true });
      await writeFile(path.join(dir, "src", "x.ts"), "export const x = 1;\n", "utf8");
      await mkdir(path.join(dir, ".sidetrack", "source", "src", "x.ts"), { recursive: true });
      await writeFile(
        path.join(dir, ".sidetrack", "source", "src", "x.ts", "main.md"),
        "# Main\n",
        "utf8",
      );
      await writeFile(
        path.join(dir, ".sidetrack.toml"),
        [
          "[storage]",
          'dir = ".sidetrack"',
          "",
          "[static_site]",
          'title = "Demo"',
          'source_file = "src/x.ts"',
          'sidetrack_markdown = ".sidetrack/source/src/x.ts/main.md"',
          "",
          "[angles]",
          'default_angle = "main"',
          "",
          "[[angles.definitions]]",
          'id = "main"',
          'title = "Main"',
          "",
          "[render]",
          "mermaid = false",
          "",
        ].join("\n"),
        "utf8",
      );

      expect(await runAnglesAddFromCwd({ angleId: "notes", title: "Release notes" })).toBe(0);

      const companion = path.join(dir, ".sidetrack", "source", "src", "x.ts", "notes.md");
      const body = await readFile(companion, "utf8");
      expect(body).toContain("# Release notes");
      const toml = await readFile(path.join(dir, ".sidetrack.toml"), "utf8");
      expect(toml).toContain("notes");
    } finally {
      process.chdir(prevCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

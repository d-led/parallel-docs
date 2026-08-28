import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@sidetrack/core";

import { runMigrateAnglesFromCwd } from "./migrate-angles-cmd.js";

describe("Angles migration command from a working directory", () => {
  it("given a flat companion and index entry, moves files and rewrites index keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sidetrack-migrate-ang-"));
    try {
      await mkdir(path.join(dir, ".sidetrack", "source"), { recursive: true });
      await mkdir(path.join(dir, ".sidetrack", "metadata"), { recursive: true });
      await writeFile(path.join(dir, ".sidetrack", "source", "README.md.md"), "# c\n", "utf8");
      await writeFile(
        path.join(dir, ".sidetrack", "metadata", "index.json"),
        JSON.stringify(
          {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            bySideTrackPath: {
              ".sidetrack/source/README.md.md": {
                sourcePath: "README.md",
                sidetrackPath: ".sidetrack/source/README.md.md",
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
        `[storage]
dir = ".sidetrack"

[static_site]
source_file = "README.md"
sidetrack_markdown = ".sidetrack/source/README.md.md"
`,
        "utf8",
      );

      expect(
        await runMigrateAnglesFromCwd({ angleId: "main", dryRun: false, repoRootOverride: dir }),
      ).toBe(0);
      const moved = await readFile(
        path.join(dir, ".sidetrack", "source", "README.md", "main.md"),
        "utf8",
      );
      expect(moved).toContain("# c");
      const idx = JSON.parse(
        await readFile(path.join(dir, ".sidetrack", "metadata", "index.json"), "utf8"),
      ) as {
        bySideTrackPath: Record<string, { sidetrackPath: string }>;
      };
      const keys = Object.keys(idx.bySideTrackPath);
      expect(keys).toEqual([".sidetrack/source/README.md/main.md"]);
      expect(idx.bySideTrackPath[keys[0] ?? ""]?.sidetrackPath).toBe(keys[0]);
      const toml = await readFile(path.join(dir, ".sidetrack.toml"), "utf8");
      expect(toml).toContain("default_angle");
      expect(toml).toContain(".sidetrack/source/README.md/main.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("given dry run, does not write sentinel or move files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sidetrack-migrate-ang-dr-"));
    try {
      await mkdir(path.join(dir, ".sidetrack", "source"), { recursive: true });
      await writeFile(path.join(dir, ".sidetrack", "source", "a.ts.md"), "x\n", "utf8");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        expect(
          await runMigrateAnglesFromCwd({ angleId: "main", dryRun: true, repoRootOverride: dir }),
        ).toBe(0);
      } finally {
        logSpy.mockRestore();
      }
      const flatStill = await readFile(path.join(dir, ".sidetrack", "source", "a.ts.md"), "utf8");
      expect(flatStill).toBe("x\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

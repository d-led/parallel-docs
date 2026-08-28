import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeSideTrackConfig } from "./config.js";
import {
  applyPathRenamesToSideTrackIndex,
  inferAngleIdFromSideTrackPath,
} from "./sidetrack-index-renames.js";
import { CURRENT_SCHEMA_VERSION } from "./model.js";

describe("Inferring angle ids from companion paths", () => {
  it("extracts the angle file stem from an Angles-layout path", () => {
    expect(
      inferAngleIdFromSideTrackPath(
        ".sidetrack/source/pkg/foo.ts/intro.md",
        "pkg/foo.ts",
        ".sidetrack",
      ),
    ).toBe("intro");
  });
});

describe("Applying Git path renames to the SideTrack index", () => {
  it("updates flat-layout source and sidetrack paths", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "sidetrack-rename-flat-"));
    try {
      await mkdir(path.join(repo, ".sidetrack", "source"), { recursive: true });
      const cfg = mergeSideTrackConfig(null);
      const index = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        bySideTrackPath: {
          ".sidetrack/source/src/old.ts.md": {
            sourcePath: "src/old.ts",
            sidetrackPath: ".sidetrack/source/src/old.ts.md",
            blocks: [],
          },
        },
      };
      const { index: next, changed } = applyPathRenamesToSideTrackIndex(
        index,
        [{ from: "src/old.ts", to: "src/new.ts" }],
        repo,
        cfg,
      );
      expect(changed).toBe(true);
      const cp = ".sidetrack/source/src/new.ts.md";
      expect(next.bySideTrackPath[cp]).toEqual({
        sourcePath: "src/new.ts",
        sidetrackPath: cp,
        blocks: [],
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("updates Angles-layout paths when the source file moves", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "sidetrack-rename-ang-"));
    try {
      const sd = path.join(repo, ".sidetrack", "source");
      await mkdir(sd, { recursive: true });
      await writeFile(path.join(sd, ".default"), "sentinel\n", "utf8");
      const cfg = mergeSideTrackConfig(null);
      const oldCp = ".sidetrack/source/src/a.ts/intro.md";
      const index = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        bySideTrackPath: {
          [oldCp]: {
            sourcePath: "src/a.ts",
            sidetrackPath: oldCp,
            blocks: [],
          },
        },
      };
      const { index: next, changed } = applyPathRenamesToSideTrackIndex(
        index,
        [{ from: "src/a.ts", to: "src/b/a.ts" }],
        repo,
        cfg,
      );
      expect(changed).toBe(true);
      const newCp = ".sidetrack/source/src/b/a.ts/intro.md";
      expect(next.bySideTrackPath[newCp]?.sourcePath).toBe("src/b/a.ts");
      expect(next.bySideTrackPath[newCp]?.sidetrackPath).toBe(newCp);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

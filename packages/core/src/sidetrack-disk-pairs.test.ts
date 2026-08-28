import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverSideTrackPairsOnDisk,
  pairFromSideTrackSourceRel,
} from "./sidetrack-disk-pairs.js";

describe("Mapping companion paths to source pairs", () => {
  it("maps flat companions using the trailing .md slice rule", () => {
    expect(pairFromSideTrackSourceRel(".sidetrack", "README.md.md", false)).toEqual({
      sourcePath: "README.md",
      sidetrackPath: ".sidetrack/source/README.md.md",
    });
  });

  it("maps angles companions as parent dir + angle file", () => {
    expect(pairFromSideTrackSourceRel(".sidetrack", "README.md/main.md", true)).toEqual({
      sourcePath: "README.md",
      sidetrackPath: ".sidetrack/source/README.md/main.md",
    });
  });
});

describe("Discovering companion pairs on disk", () => {
  it("discovers every flat companion under source when the indexed source files exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-disk-flat-"));
    await mkdir(path.join(dir, ".sidetrack", "source", "src"), { recursive: true });
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "README.md"), "#\n", "utf8");
    await writeFile(path.join(dir, "src", "x.ts"), "//\n", "utf8");
    await writeFile(path.join(dir, ".sidetrack", "source", "README.md.md"), "a\n", "utf8");
    await writeFile(path.join(dir, ".sidetrack", "source", "src", "x.ts.md"), "b\n", "utf8");
    const pairs = await discoverSideTrackPairsOnDisk(dir, ".sidetrack");
    expect(pairs).toEqual(
      expect.arrayContaining([
        { sourcePath: "README.md", sidetrackPath: ".sidetrack/source/README.md.md" },
        { sourcePath: "src/x.ts", sidetrackPath: ".sidetrack/source/src/x.ts.md" },
      ]),
    );
    expect(pairs).toHaveLength(2);
  });

  it("skips angles-layout companions when the inferred primary source file is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cr-disk-angles-orphan-"));
    const storage = ".sidetrack";
    await mkdir(path.join(dir, ...`${storage}/source/docs/plan/plan.md`.split("/")), {
      recursive: true,
    });
    await writeFile(path.join(dir, storage, "source", ".default"), "", "utf8");
    await writeFile(
      path.join(dir, storage, "source", "docs", "plan", "plan.md", "main.md"),
      "# orphan angle\n",
      "utf8",
    );
    const pairs = await discoverSideTrackPairsOnDisk(dir, storage);
    expect(pairs).toHaveLength(0);
  });
});

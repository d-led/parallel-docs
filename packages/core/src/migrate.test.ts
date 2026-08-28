import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { migrateIndex } from "./migrate.js";
import { CURRENT_SCHEMA_VERSION } from "./model.js";
import { readIndex, refreshIndexMigrationsOnDisk } from "./validate-project.js";

describe("In-memory index schema migration", () => {
  it("fills schemaVersion for legacy objects", () => {
    const { index, changed } = migrateIndex({ bySourceFile: {}, schemaVersion: 0 });
    expect(changed).toBe(true);
    expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(index.bySideTrackPath).toEqual({});
  });

  it("is a no-op when already current", () => {
    const input = { schemaVersion: CURRENT_SCHEMA_VERSION, bySideTrackPath: {} };
    const { index, changed } = migrateIndex(input);
    expect(changed).toBe(false);
    expect(index).toEqual(input);
  });

  it("downgrades index versions newer than this library to the bundled schema", () => {
    const cp = ".sidetrack/source/x.ts.md";
    const { index, changed } = migrateIndex({
      schemaVersion: CURRENT_SCHEMA_VERSION + 10,
      bySideTrackPath: {
        [cp]: {
          sourcePath: "x.ts",
          sidetrackPath: cp,
          blocks: [{ id: "b1", anchor: "lines:1-2" }],
        },
      },
    });
    expect(changed).toBe(true);
    expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(index.bySideTrackPath[cp]?.blocks[0]?.id).toBe("b1");
  });
});

describe("Loading index.json with automatic on-disk migration", () => {
  it("rewrites a v2 index on disk to schema v3", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-idx-"));
    const meta = path.join(dir, ".sidetrack", "metadata");
    await fs.mkdir(meta, { recursive: true });
    const indexPath = path.join(meta, "index.json");
    const legacy = {
      schemaVersion: 2,
      bySourceFile: {
        "src/a.ts": {
          sourcePath: "src/a.ts",
          sidetrackPath: ".sidetrack/source/src/a.ts.md",
          blocks: [{ id: "b1", anchor: "lines:1-2" }],
        },
      },
    };
    await fs.writeFile(indexPath, JSON.stringify(legacy, null, 2), "utf8");
    const idx = await readIndex(dir);
    expect(idx?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const cp = ".sidetrack/source/src/a.ts.md";
    expect(idx?.bySideTrackPath[cp]?.blocks[0]?.id).toBe("b1");
    const round = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
      bySideTrackPath?: unknown;
    };
    expect(round.bySideTrackPath).toBeDefined();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("Refreshing persisted index migrations on disk", () => {
  it("writes a JSON backup before downgrading a newer on-disk schemaVersion", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-idx-newer-"));
    const meta = path.join(dir, ".sidetrack", "metadata");
    await fs.mkdir(meta, { recursive: true });
    const indexPath = path.join(meta, "index.json");
    const cp = ".sidetrack/source/z.ts.md";
    const futureVersion = CURRENT_SCHEMA_VERSION + 7;
    const onDisk = {
      schemaVersion: futureVersion,
      bySideTrackPath: {
        [cp]: {
          sourcePath: "z.ts",
          sidetrackPath: cp,
          blocks: [{ id: "z1", anchor: "lines:1-1" }],
        },
      },
    };
    const rawBefore = `${JSON.stringify(onDisk, null, 2)}\n`;
    await fs.writeFile(indexPath, rawBefore, "utf8");
    const { changed, index } = await refreshIndexMigrationsOnDisk(dir);
    expect(changed).toBe(true);
    expect(index.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const names = await fs.readdir(meta);
    const backup = names.find((n) => n.startsWith(`index.schema-${String(futureVersion)}-backup-`));
    expect(backup).toBeDefined();
    if (backup === undefined) {
      throw new Error("expected backup file in metadata directory");
    }
    const backupRaw = await fs.readFile(path.join(meta, backup), "utf8");
    expect(backupRaw).toContain(`"schemaVersion": ${String(futureVersion)}`);
    const round = JSON.parse(await fs.readFile(indexPath, "utf8")) as { schemaVersion: number };
    expect(round.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists snippet normalization for legacy fingerprint blocks", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-refresh-"));
    const meta = path.join(dir, ".sidetrack", "metadata");
    await fs.mkdir(meta, { recursive: true });
    const indexPath = path.join(meta, "index.json");
    const cp = ".sidetrack/source/x.ts.md";
    const onDisk = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      bySideTrackPath: {
        [cp]: {
          sourcePath: "x.ts",
          sidetrackPath: cp,
          blocks: [
            {
              id: "b1",
              anchor: "lines:1-2",
              fingerprint: { startLine: "a", endLine: "b", lineCount: 2 },
            },
          ],
        },
      },
    };
    await fs.writeFile(indexPath, JSON.stringify(onDisk, null, 2), "utf8");
    const { changed, index } = await refreshIndexMigrationsOnDisk(dir);
    expect(changed).toBe(true);
    const b0 = index.bySideTrackPath[cp]?.blocks[0] as { snippet?: string; fingerprint?: unknown };
    expect(b0.snippet).toBeDefined();
    expect(b0.fingerprint).toBeUndefined();
    const round = JSON.parse(await fs.readFile(indexPath, "utf8")) as typeof onDisk;
    expect(round.bySideTrackPath[cp]?.blocks[0]).toEqual(
      expect.objectContaining({ snippet: expect.any(String) }),
    );
    expect("fingerprint" in (round.bySideTrackPath[cp]?.blocks[0] as object)).toBe(false);
    const { changed: again } = await refreshIndexMigrationsOnDisk(dir);
    expect(again).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";

import { describe, expect, it } from "vitest";

import { type SideTrackToml, mergeSideTrackConfig } from "./config.js";
import { ensureAnglesSentinelFile, upsertAngleDefinitionInSideTrackToml } from "./angles-toml.js";
import { sidetrackAnglesSentinelPath } from "./paths.js";

describe("Angles sentinel file creation", () => {
  it("creates the sentinel once under the configured storage dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-sent-"));
    const storage = "var/cr";
    await ensureAnglesSentinelFile(dir, storage);
    const rel = sidetrackAnglesSentinelPath(storage);
    const abs = path.join(dir, ...rel.split("/"));
    const st = await fs.stat(abs);
    expect(st.isFile()).toBe(true);
    await ensureAnglesSentinelFile(dir, storage);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("Upserting angle definitions in .sidetrack.toml", () => {
  it("creates a new .sidetrack.toml with storage and the angle when missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-toml-"));
    await upsertAngleDefinitionInSideTrackToml(dir, { id: "architecture", title: "Architecture" });
    const raw = await fs.readFile(path.join(dir, ".sidetrack.toml"), "utf8");
    const cfg = mergeSideTrackConfig(parseToml(raw) as SideTrackToml);
    expect(cfg.angles.defaultAngleId).toBe("architecture");
    expect(cfg.angles.definitions).toEqual([{ id: "architecture", title: "Architecture" }]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("throws when the angle id is already listed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-toml-dup-"));
    await upsertAngleDefinitionInSideTrackToml(dir, { id: "main" });
    await expect(upsertAngleDefinitionInSideTrackToml(dir, { id: "main" })).rejects.toThrow(
      /already listed/,
    );
    await fs.rm(dir, { recursive: true, force: true });
  });
});

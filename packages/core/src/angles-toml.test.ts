import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";

import { describe, expect, it } from "vitest";

import { type ParallelDocsToml, mergeParallelDocsConfig } from "./config.js";
import {
  ensureAnglesSentinelFile,
  upsertAngleDefinitionInParallelDocsToml,
} from "./angles-toml.js";
import { parallelDocsAnglesSentinelPath } from "./paths.js";

describe("Angles sentinel file creation", () => {
  it("creates the sentinel once under the configured storage dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-sent-"));
    const storage = "var/cr";
    await ensureAnglesSentinelFile(dir, storage);
    const rel = parallelDocsAnglesSentinelPath(storage);
    const abs = path.join(dir, ...rel.split("/"));
    const st = await fs.stat(abs);
    expect(st.isFile()).toBe(true);
    await ensureAnglesSentinelFile(dir, storage);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("Upserting angle definitions in .parallel-docs.toml", () => {
  it("creates a new .parallel-docs.toml with storage and the angle when missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-toml-"));
    await upsertAngleDefinitionInParallelDocsToml(dir, {
      id: "architecture",
      title: "Architecture",
    });
    const raw = await fs.readFile(path.join(dir, ".parallel-docs.toml"), "utf8");
    const cfg = mergeParallelDocsConfig(parseToml(raw) as ParallelDocsToml);
    expect(cfg.angles.defaultAngleId).toBe("architecture");
    expect(cfg.angles.definitions).toEqual([{ id: "architecture", title: "Architecture" }]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("throws when the angle id is already listed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-toml-dup-"));
    await upsertAngleDefinitionInParallelDocsToml(dir, { id: "main" });
    await expect(upsertAngleDefinitionInParallelDocsToml(dir, { id: "main" })).rejects.toThrow(
      /already listed/,
    );
    await fs.rm(dir, { recursive: true, force: true });
  });
});

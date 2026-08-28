import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installMcpConfigs } from "../mcp-install.js";
import { setupTempSideTrackProject } from "./test-helpers.js";

describe("installMcpConfigs", () => {
  let repoRoot = "";
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    if (cleanup) await cleanup();
  });

  it("dry run reports would_create for each harness", async () => {
    const setup = await setupTempSideTrackProject();
    repoRoot = setup.repoRoot;
    cleanup = setup.cleanup;

    const results = await installMcpConfigs(repoRoot, { dryRun: true });
    expect(results.length).toBeGreaterThanOrEqual(1);

    for (const r of results) {
      expect(r.action).toMatch(/would_create|would_update|skipped/);
    }

    // Verify no files were actually written
    const vscodePath = path.join(repoRoot, ".vscode", "mcp.json");
    await expect(fs.access(vscodePath)).rejects.toThrow();
  });

  it("writes config files on real install", async () => {
    const setup = await setupTempSideTrackProject();
    repoRoot = setup.repoRoot;
    cleanup = setup.cleanup;

    const results = await installMcpConfigs(repoRoot);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const created = results.filter((r) => r.action === "created");
    expect(created.length).toBeGreaterThan(0);

    // Verify .vscode/mcp.json was written and contains sidetrack entry
    const vscodePath = path.join(repoRoot, ".vscode", "mcp.json");
    const content = await fs.readFile(vscodePath, "utf8");
    const parsed = JSON.parse(content);

    expect(parsed.servers).toBeDefined();
    expect(parsed.servers.sidetrack).toBeDefined();
    expect(parsed.servers.sidetrack.command).toBe("sidetrack");
    expect(parsed.servers.sidetrack.args).toEqual(["mcp", "serve"]);
    expect(parsed.servers.sidetrack.description).toContain("SideTrack");
    expect(parsed.servers.sidetrack.description).toContain("design decisions");
  });

  it("skips existing entries by default", async () => {
    const setup = await setupTempSideTrackProject();
    repoRoot = setup.repoRoot;
    cleanup = setup.cleanup;

    // First install
    let results = await installMcpConfigs(repoRoot);
    const created = results.filter((r) => r.action === "created");
    expect(created.length).toBeGreaterThan(0);

    // Second install — should skip
    results = await installMcpConfigs(repoRoot);
    const skipped = results.filter((r) => r.action === "skipped");
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("force overwrites existing entries", async () => {
    const setup = await setupTempSideTrackProject();
    repoRoot = setup.repoRoot;
    cleanup = setup.cleanup;

    // First install
    await installMcpConfigs(repoRoot);

    // Force install
    const results = await installMcpConfigs(repoRoot, { force: true });
    const updated = results.filter((r) => r.action === "updated");
    expect(updated.length).toBeGreaterThan(0);
  });

  it("does not contain absolute paths in generated config", async () => {
    const setup = await setupTempSideTrackProject();
    repoRoot = setup.repoRoot;
    cleanup = setup.cleanup;

    await installMcpConfigs(repoRoot);

    const vscodePath = path.join(repoRoot, ".vscode", "mcp.json");
    const content = await fs.readFile(vscodePath, "utf8");
    const parsed = JSON.parse(content);

    // The command should be "sidetrack", never an absolute path
    expect(parsed.servers.sidetrack.command).toBe("sidetrack");
    expect(parsed.servers.sidetrack.command).not.toContain("/");
  });
});

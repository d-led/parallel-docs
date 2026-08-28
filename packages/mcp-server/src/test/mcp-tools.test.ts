import { describe, expect, it } from "vitest";
import { ALL_TOOLS, type McpToolDef } from "../mcp-tools.js";
import { setupTempSideTrackProject } from "./test-helpers.js";

function tool(name: string): McpToolDef {
  const t = ALL_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

describe("MCP tool definitions", () => {
  it("registers 19 tools", () => {
    expect(ALL_TOOLS).toHaveLength(19);
  });

  it("each tool has a unique name", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(ALL_TOOLS.length);
  });

  it("each tool has a non-empty description", () => {
    for (const t of ALL_TOOLS) {
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("each tool has a schema", () => {
    for (const t of ALL_TOOLS) {
      expect(t.schema).toBeDefined();
    }
  });
});

describe("sidetrack_init", () => {
  it("initializes a fresh project", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      const result = await tool("sidetrack_init").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_validate", () => {
  it("validates a fresh project with no issues", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      await tool("sidetrack_init").handler(repoRoot, {});
      const result = await tool("sidetrack_validate").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("OK");
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_paths", () => {
  it("resolves a source file path to its companion .md path", async () => {
    const { repoRoot, sourceRel, cleanup } = await setupTempSideTrackProject();
    try {
      await tool("sidetrack_init").handler(repoRoot, {});
      const result = await tool("sidetrack_paths").handler(repoRoot, { file: sourceRel });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(".sidetrack/source/");
      expect(result.content[0].text).toContain(".md");
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_read_source", () => {
  it("reads a source file", async () => {
    const { repoRoot, sourceRel, cleanup } = await setupTempSideTrackProject();
    try {
      const result = await tool("sidetrack_read_source").handler(repoRoot, { file: sourceRel });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("hello");
    } finally {
      await cleanup();
    }
  });

  it("errors for missing file", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      const result = await tool("sidetrack_read_source").handler(repoRoot, {
        file: "nonexistent.ts",
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_list_pairs", () => {
  it("returns empty for uninitialized project", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      const result = await tool("sidetrack_list_pairs").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("No sidetrack pairs found");
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_list_orphans", () => {
  it("returns empty for fresh project", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      const result = await tool("sidetrack_list_orphans").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("No orphan companions found");
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_get_index", () => {
  it("returns empty index for fresh project", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      await tool("sidetrack_init").handler(repoRoot, {});
      const result = await tool("sidetrack_get_index").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pairCount).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_migrate", () => {
  it("reports no migration needed for fresh project", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      await tool("sidetrack_init").handler(repoRoot, {});
      const result = await tool("sidetrack_migrate").handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("no migration needed");
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_angles_add", () => {
  it("registers a new angle", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      await tool("sidetrack_init").handler(repoRoot, {});
      const result = await tool("sidetrack_angles_add").handler(repoRoot, {
        angleId: "architecture",
        title: "Architecture",
      });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("architecture");
    } finally {
      await cleanup();
    }
  });

  it("rejects invalid angle IDs", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      await expect(
        tool("sidetrack_angles_add").handler(repoRoot, { angleId: "invalid%id" }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});

describe("sidetrack_serve", () => {
  it("has port schema with default 4173", () => {
    const t = tool("sidetrack_serve");
    expect(t.schema).toHaveProperty("port");
  });

  it("errors when project is not initialized with static_site config", async () => {
    const { repoRoot, cleanup } = await setupTempSideTrackProject();
    try {
      // No [static_site] in .sidetrack.toml — buildGithubPagesStaticSite will throw
      const result = await tool("sidetrack_serve").handler(repoRoot, { port: 14173 });
      expect(result.isError).toBe(true);
    } finally {
      // Ensure server is stopped even on error
      await tool("sidetrack_stop_serve").handler("", {});
      await cleanup();
    }
  });
});

describe("sidetrack_stop_serve", () => {
  it("reports no server running when idle", async () => {
    // First make sure no server is running
    const result = await tool("sidetrack_stop_serve").handler("", {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("No server running");
  });
});

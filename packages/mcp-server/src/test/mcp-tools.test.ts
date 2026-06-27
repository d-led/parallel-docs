import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "../mcp-tools.js";
import { setupTempCommentrayProject } from "./test-helpers.js";

describe("MCP tool definitions", () => {
  it("registers 16 tools", () => {
    expect(ALL_TOOLS).toHaveLength(16);
  });

  it("each tool has a unique name", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(ALL_TOOLS.length);
  });

  it("each tool has a non-empty description", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("each tool has a schema", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.schema).toBeDefined();
    }
  });
});

describe("commentray_init", () => {
  it("initializes a fresh project", async () => {
    const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const result = await initTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      // The project already has .commentray.toml from setup, so init is idempotent
      const text = result.content[0].text;
      expect(text.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_validate", () => {
  it("validates a fresh project with no issues", async () => {
    const validateTool = ALL_TOOLS.find((t) => t.name === "commentray_validate")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      // Init first
      const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
      await initTool.handler(repoRoot, {});

      const result = await validateTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("OK");
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_paths", () => {
  it("resolves a source file path to its companion .md path", async () => {
    const pathsTool = ALL_TOOLS.find((t) => t.name === "commentray_paths")!;
    const { repoRoot, sourceRel, cleanup } = await setupTempCommentrayProject();
    try {
      const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
      await initTool.handler(repoRoot, {});

      const result = await pathsTool.handler(repoRoot, { file: sourceRel });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(".commentray/source/");
      expect(result.content[0].text).toContain(".md");
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_read_source", () => {
  it("reads a source file", async () => {
    const readTool = ALL_TOOLS.find((t) => t.name === "commentray_read_source")!;
    const { repoRoot, sourceRel, cleanup } = await setupTempCommentrayProject();
    try {
      const result = await readTool.handler(repoRoot, { file: sourceRel });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("hello");
    } finally {
      await cleanup();
    }
  });

  it("errors for missing file", async () => {
    const readTool = ALL_TOOLS.find((t) => t.name === "commentray_read_source")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const result = await readTool.handler(repoRoot, { file: "nonexistent.ts" });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_list_pairs", () => {
  it("returns empty for uninitialized project", async () => {
    const listTool = ALL_TOOLS.find((t) => t.name === "commentray_list_pairs")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const result = await listTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("No commentray pairs found");
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_list_orphans", () => {
  it("returns empty for fresh project", async () => {
    const orphansTool = ALL_TOOLS.find((t) => t.name === "commentray_list_orphans")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const result = await orphansTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("No orphan companions found");
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_get_index", () => {
  it("returns empty index for fresh project", async () => {
    const indexTool = ALL_TOOLS.find((t) => t.name === "commentray_get_index")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
      await initTool.handler(repoRoot, {});

      const result = await indexTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pairCount).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_migrate", () => {
  it("reports no migration needed for fresh project", async () => {
    const migrateTool = ALL_TOOLS.find((t) => t.name === "commentray_migrate")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
      await initTool.handler(repoRoot, {});

      const result = await migrateTool.handler(repoRoot, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("no migration needed");
    } finally {
      await cleanup();
    }
  });
});

describe("commentray_angles_add", () => {
  it("registers a new angle", async () => {
    const anglesTool = ALL_TOOLS.find((t) => t.name === "commentray_angles_add")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      const initTool = ALL_TOOLS.find((t) => t.name === "commentray_init")!;
      await initTool.handler(repoRoot, {});

      const result = await anglesTool.handler(repoRoot, {
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
    const anglesTool = ALL_TOOLS.find((t) => t.name === "commentray_angles_add")!;
    const { repoRoot, cleanup } = await setupTempCommentrayProject();
    try {
      // The zod schema rejects invalid IDs before handler is called
      const parseResult = anglesTool.schema.angleId?.safeParse?.("invalid id!");
      // But the handler itself would throw — test via direct call
      await expect(anglesTool.handler(repoRoot, { angleId: "invalid%id" })).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});

import fs from "node:fs/promises";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────

export interface HarnessConfig {
  /** Human-readable harness name */
  name: string;
  /** Path relative to repo root for the MCP config file */
  configFileRel: string;
  /** Whether this harness is always written (true) or only if its directory already exists */
  alwaysWrite: boolean;
}

export interface InstallMcpConfigsOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface InstallResult {
  harness: string;
  configFile: string;
  action: "created" | "updated" | "skipped" | "would_create" | "would_update";
}

// ── Harness definitions ───────────────────────────────────────────────────

const HARNESSES: HarnessConfig[] = [
  { name: "VS Code Copilot", configFileRel: ".vscode/mcp.json", alwaysWrite: true },
  { name: "Claude Code", configFileRel: ".claude/mcp.json", alwaysWrite: true },
  { name: "Antigravity", configFileRel: ".antigravity/mcp.json", alwaysWrite: true },
  { name: "OpenCode", configFileRel: ".opencode/mcp.json", alwaysWrite: true },
];

// ── MCP server entry (portable — no absolute paths) ───────────────────────

const PARALLEL_DOCS_DESCRIPTION =
  "ParallelDocs: out-of-file parallel-docs anchored to code. " +
  'Explains design decisions, trade-offs, and rationale — the "why" that doesn\'t belong in comments or docs. ' +
  "Strict separation: code comments (inline), documentation (standalone), ParallelDocs (anchored, cross-linked).";

function makeMcpEntry(): Record<string, unknown> {
  return {
    "parallel-docs": {
      type: "stdio",
      command: "parallel-docs",
      args: ["mcp", "serve"],
      cwd: "${workspaceFolder}",
      description: PARALLEL_DOCS_DESCRIPTION,
    },
  };
}

// ── JSON merge logic ──────────────────────────────────────────────────────

interface McpConfig {
  servers?: Record<string, unknown>;
}

async function readOrEmpty(absPath: string): Promise<McpConfig> {
  try {
    const raw = await fs.readFile(absPath, "utf8");
    return JSON.parse(raw) as McpConfig;
  } catch {
    return {};
  }
}

// ── Install function ──────────────────────────────────────────────────────

/**
 * Install (or update) repo-local MCP config files for all supported harnesses.
 *
 * Each config file references `parallel-docs mcp serve` as the command — fully
 * portable, no absolute paths. Safe to commit to a multi-contributor repo.
 *
 * @param repoRoot Absolute path to the repo root
 * @param options dryRun (preview only), force (overwrite existing parallel-docs entry)
 * @returns Array of results describing what happened for each harness
 */
export async function installMcpConfigs(
  repoRoot: string,
  options: InstallMcpConfigsOptions = {},
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const harness of HARNESSES) {
    const configAbs = path.join(repoRoot, harness.configFileRel);

    // Check if directory exists for non-always-write harnesses
    if (!harness.alwaysWrite) {
      try {
        await fs.access(path.dirname(configAbs));
      } catch {
        continue; // skip — harness not present
      }
    }

    const existing = await readOrEmpty(configAbs);
    const hasParallelDocs = existing.servers && "parallel-docs" in existing.servers;

    if (hasParallelDocs && !options.force) {
      results.push({
        harness: harness.name,
        configFile: harness.configFileRel,
        action: "skipped",
      });
      continue;
    }

    const action = hasParallelDocs ? "updated" : "created";
    const dryAction = hasParallelDocs ? "would_update" : "would_create";

    if (options.dryRun) {
      results.push({
        harness: harness.name,
        configFile: harness.configFileRel,
        action: dryAction,
      });
      continue;
    }

    // Merge the ParallelDocs entry into the existing config
    const merged: McpConfig = {
      ...existing,
      servers: {
        ...(existing.servers ?? {}),
        ...makeMcpEntry(),
      },
    };

    await fs.mkdir(path.dirname(configAbs), { recursive: true });
    await fs.writeFile(configAbs, JSON.stringify(merged, null, 2) + "\n", "utf8");

    results.push({
      harness: harness.name,
      configFile: harness.configFileRel,
      action,
    });
  }

  return results;
}

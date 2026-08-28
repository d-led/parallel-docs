import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Create a temporary directory with a minimal SideTrack project.
 * Writes .sidetrack.toml, initializes index.json, creates a sample source file.
 * Returns the repo root path and the source file relative path.
 */
export async function setupTempSideTrackProject(): Promise<{
  repoRoot: string;
  sourceRel: string;
  cleanup: () => Promise<void>;
}> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sidetrack-mcp-test-"));
  const sourceRel = "src/example.ts";

  // Create dirs
  await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".sidetrack", "metadata"), { recursive: true });

  // Write .sidetrack.toml
  await fs.writeFile(
    path.join(repoRoot, ".sidetrack.toml"),
    ["[storage]", 'dir = ".sidetrack"', "", "[scm]", 'provider = "git"', ""].join("\n"),
    "utf8",
  );

  // Write index.json (empty, current schema)
  await fs.writeFile(
    path.join(repoRoot, ".sidetrack", "metadata", "index.json"),
    JSON.stringify({ schemaVersion: 3, bySideTrackPath: {} }),
    "utf8",
  );

  // Write sample source file
  await fs.writeFile(
    path.join(repoRoot, sourceRel),
    "// example.ts\n\nexport function hello(): string {\n  return 'hello';\n}\n",
    "utf8",
  );

  const cleanup = async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  };

  return { repoRoot, sourceRel, cleanup };
}

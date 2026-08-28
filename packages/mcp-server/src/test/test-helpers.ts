import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Create a temporary directory with a minimal ParallelDocs project.
 * Writes .parallel-docs.toml, initializes index.json, creates a sample source file.
 * Returns the repo root path and the source file relative path.
 */
export async function setupTempParallelDocsProject(): Promise<{
  repoRoot: string;
  sourceRel: string;
  cleanup: () => Promise<void>;
}> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-docs-mcp-test-"));
  const sourceRel = "src/example.ts";

  // Create dirs
  await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".parallel-docs", "metadata"), { recursive: true });

  // Write .parallel-docs.toml
  await fs.writeFile(
    path.join(repoRoot, ".parallel-docs.toml"),
    ["[storage]", 'dir = ".parallel-docs"', "", "[scm]", 'provider = "git"', ""].join("\n"),
    "utf8",
  );

  // Write index.json (empty, current schema)
  await fs.writeFile(
    path.join(repoRoot, ".parallel-docs", "metadata", "index.json"),
    JSON.stringify({ schemaVersion: 3, byParallelDocsPath: {} }),
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

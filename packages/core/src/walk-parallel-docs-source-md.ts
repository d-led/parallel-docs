import fs from "node:fs/promises";
import path from "node:path";

/**
 * Lists every `*.md` path relative to `sourceAbs`, POSIX separators, skipping `.default`.
 */
export async function collectMdRelPathsUnderSourceAbs(sourceAbs: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(relDir: string): Promise<void> {
    const absDir = path.join(sourceAbs, relDir);
    let ents;
    try {
      ents = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === ".default") continue;
      const childRel = relDir ? `${relDir}/${e.name}` : e.name;
      const posixRel = childRel.replaceAll("\\", "/");
      if (e.isDirectory()) {
        await walk(posixRel);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(posixRel);
      }
    }
  }
  await walk("");
  return out;
}

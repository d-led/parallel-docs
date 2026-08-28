import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Creates a minimal temp repo used by link-resolution tests: `.parallel-docs`,
 * `docs/user/install.md`, and parent dirs for `_site/browse/pair.html`.
 */
export async function mkTempRepoWithBrowsePairHtmlLayout(tmpPrefix: string): Promise<{
  repoRoot: string;
  storageRoot: string;
  outHtml: string;
}> {
  const tmp = await mkdtemp(path.join(tmpdir(), tmpPrefix));
  const repoRoot = path.join(tmp, "repo");
  const storageRoot = path.join(repoRoot, ".parallel-docs");
  await mkdir(path.join(repoRoot, "docs", "user"), { recursive: true });
  await mkdir(storageRoot, { recursive: true });
  await writeFile(path.join(repoRoot, "docs", "user", "install.md"), "# Install\n", "utf8");
  const outHtml = path.join(repoRoot, "_site", "browse", "pair.html");
  await mkdir(path.dirname(outHtml), { recursive: true });
  return { repoRoot, storageRoot, outHtml };
}

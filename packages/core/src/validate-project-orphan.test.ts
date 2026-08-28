import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { sidetrackAnglesSentinelPath } from "./paths.js";
import { validateProject } from "./validate-project.js";

describe("validateProject — orphan companion Markdown", () => {
  it("reports an error when Angles companion storage exists without a primary source file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cr-val-orph-"));
    const storage = ".sidetrack";
    await mkdir(path.join(dir, storage, "metadata"), { recursive: true });
    await writeFile(
      path.join(dir, ".sidetrack.toml"),
      [
        "[storage]",
        `dir = "${storage}"`,
        "",
        "[static_site]",
        'title = "T"',
        'source_file = "README.md"',
        "",
      ].join("\n"),
      "utf8",
    );
    const sentinel = sidetrackAnglesSentinelPath(storage);
    await mkdir(path.join(dir, path.dirname(sentinel)), { recursive: true });
    await writeFile(path.join(dir, ...sentinel.split("/")), "", "utf8");
    await mkdir(path.join(dir, storage, "source", "docs", "ghost", "ghost.md"), {
      recursive: true,
    });
    await writeFile(
      path.join(dir, storage, "source", "docs", "ghost", "ghost.md", "main.md"),
      "# ghost\n",
      "utf8",
    );

    const result = await validateProject(dir);
    expect(
      result.issues.some((i) => i.level === "error" && i.message.includes("Orphan companion")),
    ).toBe(true);
    expect(result.issues.some((i) => i.message.includes("doctor --allow-deletions"))).toBe(true);
  });
});

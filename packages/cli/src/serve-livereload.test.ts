import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { injectLivereloadIntoSite, injectLivereloadScript } from "./serve-livereload.js";

describe("serve livereload HTML injection", () => {
  it("adds the browser reload client before the closing body", () => {
    const html = "<!doctype html><body><main>ParallelDocs</main></body>";

    const withReload = injectLivereloadScript(html, 4174);

    expect(withReload).toContain("<script data-parallel-docs-livereload>");
    expect(withReload).toContain('new EventSource("http://" + host + ":4174');
    expect(withReload).toContain("location.reload()");
    expect(withReload).toMatch(/<\/script>\n<\/body>$/);
  });

  it("keeps generated pages with an existing reload client unchanged", () => {
    const html = injectLivereloadScript("<body>ParallelDocs</body>", 4174);

    expect(injectLivereloadScript(html, 9999)).toBe(html);
  });

  it("updates every generated HTML page and ignores non-HTML assets", async () => {
    const site = await mkdtemp(path.join(tmpdir(), "parallel-docs-livereload-"));
    try {
      await mkdir(path.join(site, "browse"), { recursive: true });
      await writeFile(path.join(site, "index.html"), "<body>Hub</body>", "utf8");
      await writeFile(path.join(site, "browse", "readme.html"), "<body>Readme</body>", "utf8");
      await writeFile(path.join(site, "style.css"), "body { color: black; }\n", "utf8");

      await injectLivereloadIntoSite(site, 4174);

      expect(await readFile(path.join(site, "index.html"), "utf8")).toContain(
        "data-parallel-docs-livereload",
      );
      expect(await readFile(path.join(site, "browse", "readme.html"), "utf8")).toContain(
        "data-parallel-docs-livereload",
      );
      expect(await readFile(path.join(site, "style.css"), "utf8")).toBe("body { color: black; }\n");
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });
});

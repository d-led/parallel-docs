import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  injectServeDevBuildWatch,
  injectServeDevBuildWatchIntoSite,
} from "./serve-dev-build-watch.js";

describe("serve dev build watch HTML injection", () => {
  it("adds the poll client before the closing body", () => {
    const html = "<!doctype html><body><main>SideTrack</main></body>";

    const next = injectServeDevBuildWatch(html, "abc123");

    expect(next).toContain("<script data-sidetrack-serve-watch>");
    expect(next).toContain('const expect = "abc123"');
    expect(next).toContain("/__sidetrack/dev/build-id");
    expect(next).toContain("if (!r.ok) return");
    expect(next).toContain("location.reload()");
    expect(next).toContain('searchParams.delete("_sidetrack_bust")');
    expect(next).toMatch(/<\/script>\n<\/body>$/);
  });

  it("replaces an existing poll client when the build id changes", () => {
    const first = injectServeDevBuildWatch("<body>x</body>", "v1");
    const second = injectServeDevBuildWatch(first, "v2");

    expect(second).toContain('const expect = "v2"');
    expect(second).not.toContain('const expect = "v1"');
  });

  it("updates every generated HTML page and ignores non-HTML assets", async () => {
    const site = await mkdtemp(path.join(tmpdir(), "sidetrack-dev-watch-"));
    try {
      await mkdir(path.join(site, "browse"), { recursive: true });
      await writeFile(path.join(site, "index.html"), "<body>Hub</body>", "utf8");
      await writeFile(path.join(site, "browse", "readme.html"), "<body>Readme</body>", "utf8");
      await writeFile(path.join(site, "style.css"), "body { color: black; }\n", "utf8");

      await injectServeDevBuildWatchIntoSite(site, "deadbeef");

      expect(await readFile(path.join(site, "index.html"), "utf8")).toContain(
        "data-sidetrack-serve-watch",
      );
      expect(await readFile(path.join(site, "browse", "readme.html"), "utf8")).toContain(
        "deadbeef",
      );
      expect(await readFile(path.join(site, "style.css"), "utf8")).toBe("body { color: black; }\n");
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });

  it("does nothing when the build id is empty", () => {
    const html = "<body>x</body>";
    expect(injectServeDevBuildWatch(html, "")).toBe(html);
  });
});

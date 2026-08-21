import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const renderSrcDir = dirname(fileURLToPath(import.meta.url));

describe("Code browser static assets", () => {
  it("keeps a single intro splice marker in shell CSS", () => {
    const css = readFileSync(join(renderSrcDir, "code-browser-shell.css"), "utf8");
    const marker = "/* __COMMENTRAY_INTRO_CSS__ */";
    expect(css.split(marker).length - 1).toBe(1);
  });

  it("documents the nav rail hub fragment placeholders", () => {
    const html = readFileSync(join(renderSrcDir, "code-browser-nav-rail-doc-hub.html"), "utf8");
    expect(html).toContain('data-nav-json-url="__NAV_JSON_URL__"');
    expect(html).toContain("__TREE_ICON_SVG__");
    expect(html).toContain('id="documented-files-hub"');
  });
});

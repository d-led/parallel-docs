import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SIDETRACK_MERMAID_MODULE_READY_EVENT } from "./sidetrack-mermaid-events.js";
import { mermaidRuntimeScriptHtml } from "./mermaid-runtime-html.js";

describe("Mermaid runtime script injection", () => {
  it("returns empty when Mermaid is disabled", () => {
    expect(mermaidRuntimeScriptHtml(false)).toBe("");
    expect(mermaidRuntimeScriptHtml(undefined)).toBe("");
  });

  it("inlines a self-contained vendored Mermaid build with no CDN references", () => {
    const html = mermaidRuntimeScriptHtml(true);
    expect(html).toContain("<script>");
    expect(html).toContain("mermaid.initialize");
    expect(html).toContain("globalThis.sidetrackMermaid");
    expect(html).toContain(SIDETRACK_MERMAID_MODULE_READY_EVENT);
    expect(html).toContain("sidetrack-mermaid-done");
    expect(html).toContain("skipInitial");
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).not.toContain('<script type="module">');
  });

  it("inlines a user-provided local Mermaid build instead of the vendored one", () => {
    const dir = mkdtempSync(join(tmpdir(), "sidetrack-mermaid-"));
    const custom = join(dir, "custom-mermaid.js");
    writeFileSync(custom, "/* custom mermaid build */ globalThis.mermaid = {};", "utf8");

    const html = mermaidRuntimeScriptHtml(true, custom);
    expect(html).toContain("custom mermaid build");
    expect(html).toContain("mermaid.initialize");
  });

  it("throws when the configured local Mermaid path does not exist", () => {
    expect(() => mermaidRuntimeScriptHtml(true, "/definitely/missing/mermaid.js")).toThrow(
      /mermaid_runtime_path/,
    );
  });
});

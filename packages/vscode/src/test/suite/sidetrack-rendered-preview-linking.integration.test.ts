import * as assert from "node:assert";
import * as path from "node:path";

import {
  parseLineColumnFragment,
  resolveWorkspaceHrefToAbsolutePath,
  routePreviewHref,
} from "../../sidetrack-preview-linking.js";

describe("Rendered preview linking (unit)", () => {
  describe("routePreviewHref", () => {
    it("Given an empty or hash-only href, when routing, then it is ignored.", () => {
      assert.equal(routePreviewHref(""), "ignore");
      assert.equal(routePreviewHref("#section"), "ignore");
    });

    it("Given an absolute URL href, when routing, then it is external.", () => {
      assert.equal(routePreviewHref("https://example.com"), "external");
      assert.equal(routePreviewHref("mailto:a@example.com"), "external");
    });

    it("Given a relative repo href, when routing, then it is workspace.", () => {
      assert.equal(routePreviewHref("../src/file.ts#L10"), "workspace");
      assert.equal(routePreviewHref("/docs/spec.md"), "workspace");
    });
  });

  describe("parseLineColumnFragment", () => {
    it("Given a line-only fragment, when parsed, then it returns 0-based line and char 0.", () => {
      assert.deepEqual(parseLineColumnFragment("L10"), { line: 9, char: 0 });
    });

    it("Given a line+column fragment, when parsed, then it returns 0-based line and char.", () => {
      assert.deepEqual(parseLineColumnFragment("L10,5"), { line: 9, char: 4 });
    });

    it("Given a non-line fragment, when parsed, then it returns undefined.", () => {
      assert.equal(parseLineColumnFragment("section-1"), undefined);
      assert.equal(parseLineColumnFragment("Lx,2"), undefined);
    });
  });

  describe("resolveWorkspaceHrefToAbsolutePath", () => {
    const repoRoot = path.join(path.sep, "repo");
    const htmlDir = path.join(repoRoot, ".sidetrack", "_vscode-preview", "shell");

    it("Given a repo-absolute href, when resolved, then it points under the repo root.", () => {
      const out = resolveWorkspaceHrefToAbsolutePath("/src/app.ts", htmlDir, repoRoot);
      assert.equal(out, path.join(repoRoot, "src", "app.ts"));
    });

    it("Given a relative href, when resolved, then it is relative to the preview html dir.", () => {
      const out = resolveWorkspaceHrefToAbsolutePath("../../../README.md#L3", htmlDir, repoRoot);
      assert.equal(out, path.join(repoRoot, "README.md"));
    });

    it("Given a path traversal href, when resolved, then it returns null.", () => {
      const out = resolveWorkspaceHrefToAbsolutePath("../../../../etc/passwd", htmlDir, repoRoot);
      assert.equal(out, null);
    });
  });
});

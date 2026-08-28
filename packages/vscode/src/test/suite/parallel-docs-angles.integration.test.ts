/**
 * Angles-specific Extension Host scenarios (dogfood fixture).
 */
import * as assert from "node:assert";
import * as vscode from "vscode";

import {
  enableAnglesDogfoodFixture,
  openFixtureSourceFile,
  registerDogfoodWorkspaceLifecycle,
  resetGeneratedParallelDocsStorage,
  restoreDogfoodParallelDocsToml,
  waitForActiveEditor,
} from "./parallel-docs-dogfood-test-support.js";

function registerAnglesDogfoodSuite() {
  const dogfoodWorkspace = registerDogfoodWorkspaceLifecycle();
  beforeEach(async () => {
    await enableAnglesDogfoodFixture(dogfoodWorkspace.root());
    await vscode.commands.executeCommand("parallel-docs.init");
  });
  afterEach(async () => {
    await restoreDogfoodParallelDocsToml(dogfoodWorkspace.root());
    await resetGeneratedParallelDocsStorage(dogfoodWorkspace.root());
  });
  return dogfoodWorkspace;
}

describe("ParallelDocs Angles: open paired markdown (integration)", () => {
  const dogfoodWorkspace = registerAnglesDogfoodSuite();

  it('Given Angles layout with two definitions, when open angle is invoked with { angleId: "alt" }, then the alt companion file is created under the per-source folder.', async () => {
    await openFixtureSourceFile(dogfoodWorkspace.root());
    await vscode.commands.executeCommand("parallel-docs.openParallelDocsAngle", {
      angleId: "alt",
    });

    const altUri = vscode.Uri.joinPath(
      dogfoodWorkspace.root(),
      ".parallel-docs/source/src/sample.ts/alt.md",
    );
    const bytes = await vscode.workspace.fs.readFile(altUri);
    const text = new TextDecoder("utf-8").decode(bytes);
    assert.ok(text.includes("# ParallelDocs"), "Expected placeholder in alt angle Markdown.");
  });

  it('Given Angles layout, when open angle is invoked with { angleId: "main" }, then the default angle companion exists.', async () => {
    await openFixtureSourceFile(dogfoodWorkspace.root());
    await vscode.commands.executeCommand("parallel-docs.openParallelDocsAngle", {
      angleId: "main",
    });

    const mainUri = vscode.Uri.joinPath(
      dogfoodWorkspace.root(),
      ".parallel-docs/source/src/sample.ts/main.md",
    );
    const bytes = await vscode.workspace.fs.readFile(mainUri);
    const text = new TextDecoder("utf-8").decode(bytes);
    assert.ok(text.includes("# ParallelDocs"), "Expected placeholder in main angle Markdown.");
  });

  it('Given Angles layout, when rendered preview choose angle runs with { angleId: "alt" }, then the command completes without rejecting.', async () => {
    const editor = await openFixtureSourceFile(dogfoodWorkspace.root());
    await vscode.window.showTextDocument(editor.document, { preview: false });
    await vscode.commands.executeCommand("parallel-docs.openRenderedPreviewChooseAngle", {
      angleId: "alt",
    });
  });

  it('Given Angles layout and the main-angle companion is active, when the user runs "ParallelDocs: Open corresponding source file", then the primary source file is focused.', async () => {
    await openFixtureSourceFile(dogfoodWorkspace.root());
    await vscode.commands.executeCommand("parallel-docs.openParallelDocsAngle", {
      angleId: "main",
    });

    const mainUri = vscode.Uri.joinPath(
      dogfoodWorkspace.root(),
      ".parallel-docs/source/src/sample.ts/main.md",
    );
    const mainDoc = await vscode.workspace.openTextDocument(mainUri);
    await vscode.window.showTextDocument(mainDoc);

    await vscode.commands.executeCommand("parallel-docs.openCorrespondingSource");

    const sampleFs = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "sample.ts").fsPath;
    const active = await waitForActiveEditor(sampleFs);
    assert.ok(active, "Expected the primary source editor to become active.");
    assert.strictEqual(active.document.uri.fsPath, sampleFs);
    const hasSample = vscode.window.visibleTextEditors.some(
      (e) => e.document.uri.fsPath === sampleFs,
    );
    const hasMain = vscode.window.visibleTextEditors.some(
      (e) => e.document.uri.fsPath === mainUri.fsPath,
    );
    assert.ok(
      hasSample && hasMain,
      "Expected the primary source and main-angle companion visible together for scroll sync.",
    );
  });
});

describe("ParallelDocs Angles: add angle (integration)", () => {
  const dogfoodWorkspace = registerAnglesDogfoodSuite();

  it('Given Angles layout is enabled, when add angle is invoked with { id: "architecture", title: "Architecture", makeDefault: false }, then .parallel-docs.toml includes that definition.', async () => {
    await vscode.commands.executeCommand("parallel-docs.addAngleDefinition", {
      id: "architecture",
      title: "Architecture",
      makeDefault: false,
    });

    const tomlUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), ".parallel-docs.toml");
    const bytes = await vscode.workspace.fs.readFile(tomlUri);
    const text = new TextDecoder("utf-8").decode(bytes);
    assert.ok(
      text.includes('id = "architecture"'),
      "Expected new angle id in .parallel-docs.toml.",
    );
    assert.ok(
      text.includes('title = "Architecture"'),
      "Expected new angle title in .parallel-docs.toml.",
    );
  });
});

describe("ParallelDocs Angles: UI flags (integration)", () => {
  const dogfoodWorkspace = registerDogfoodWorkspaceLifecycle();

  it("Given Angles layout paths, when core computes UI flags for main.md, then the companion is under the tree and resolvable", async () => {
    const { parallelDocsActiveEditorUiFlags } =
      await import("../../../../core/dist/parallel-docs-active-editor-ui-context.js");
    const root = dogfoodWorkspace.root().fsPath;
    const flags = parallelDocsActiveEditorUiFlags({
      normalizedRepoRelativePath: ".parallel-docs/source/src/sample.ts/main.md",
      storageDir: ".parallel-docs",
      repoRoot: root,
    });
    assert.deepStrictEqual(flags, {
      underCompanionSourceTree: true,
      isResolvableCompanionMarkdown: true,
    });
  });
});

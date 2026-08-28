/**
 * ParallelDocs — VS Code extension (integration)
 *
 * These examples describe behavior in plain language. They double as a source
 * for user-facing documentation: each scenario should read like a short spec
 * (“given / when / then”) without naming internal implementation details.
 */
import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

import {
  type DogfoodWorkspaceAccessor,
  openFixtureSourceFile,
  pairedMarkdownPath,
  resetGeneratedParallelDocsStorage,
  registerDogfoodWorkspaceLifecycle,
} from "./parallel-docs-dogfood-test-support.js";

/** Opens dogfood `sample.ts`, runs paired-markdown beside, then focuses the paired Markdown buffer. */
async function openDogfoodPairedMarkdownActiveEditor(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<vscode.Uri> {
  await vscode.commands.executeCommand("parallel-docs.init");
  await openFixtureSourceFile(dogfoodWorkspace.root());
  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), ...pairedMarkdownPath.split("/"));
  const pairedDoc = await vscode.workspace.openTextDocument(pairedUri);
  await vscode.window.showTextDocument(pairedDoc);
  return pairedUri;
}

function assertEqualLinesTrimmed(actual: string, expected: string, message = ""): void {
  const normActual = actual
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const normExpected = expected
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  assert.strictEqual(normActual, normExpected, message ?? undefined);
}

/** Same implementation the extension calls; loaded via relative path because the EDH resolves `@parallel-docs/core` package exports poorly under `require()`. */
type ValidateProjectFn = (
  repoRoot: string,
) => Promise<{ issues: readonly { level: string; message: string }[] }>;

function registerExtensionSurfaceTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Extension command surface", () => {
    before(async () => {
      await vscode.commands.executeCommand("parallel-docs.init");
      const editor = await openFixtureSourceFile(dogfoodWorkspace.root());
      await vscode.commands.executeCommand("parallel-docs.openSideBySide");
      await vscode.window.showTextDocument(editor.document, { preview: false });
    });

    it("Given the extension is active, when querying VS Code commands, then Angles-related ParallelDocs commands are registered.", async () => {
      const cmds = await vscode.commands.getCommands(true);
      assert.ok(cmds.includes("parallel-docs.init"));
      assert.ok(cmds.includes("parallel-docs.openParallelDocsAngle"));
      assert.ok(cmds.includes("parallel-docs.addAngleDefinition"));
      assert.ok(cmds.includes("parallel-docs.openRenderedPreview"));
      assert.ok(cmds.includes("parallel-docs.openRenderedPreviewChooseAngle"));
      assert.ok(cmds.includes("parallel-docs.openCorrespondingSource"));
    });
  });
}

/** Opens the dogfood `sample.ts`, runs `openSideBySide`, then reads and returns the paired Markdown text. */
async function openSideBySideAndReadPairedText(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<string> {
  await openFixtureSourceFile(dogfoodWorkspace.root());
  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), ...pairedMarkdownPath.split("/"));
  const bytes = await vscode.workspace.fs.readFile(pairedUri);
  return new TextDecoder("utf-8").decode(bytes);
}

async function replaceDocumentText(uri: vscode.Uri, text: string): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    const parent = path.dirname(uri.fsPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parent));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(""));
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(uri, fullRange, text);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

function integrationMarkdownSourceUri(dogfoodWorkspace: DogfoodWorkspaceAccessor): vscode.Uri {
  return vscode.Uri.joinPath(dogfoodWorkspace.root(), "docs", "integration-markdown-source.md");
}

function integrationMarkdownPairedUri(dogfoodWorkspace: DogfoodWorkspaceAccessor): vscode.Uri {
  return vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "source",
    "docs",
    "integration-markdown-source.md",
    "main.md",
  );
}

function parallelDocsPairedUriForSource(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
  ...sourceSegments: string[]
): vscode.Uri {
  return vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "source",
    ...sourceSegments,
    "main.md",
  );
}

function sampleSourceWithGreetRegion(includeFarewell: boolean): string {
  return [
    "export function greet(name: string): string {",
    "  //#region parallelDocs:greet",
    "  const x = `Hello, ${name}!`;",
    "  //#endregion parallelDocs:greet",
    "  return x;",
    "}",
    "",
    ...(includeFarewell
      ? [
          "export function farewell(name: string): string {",
          "  return `Goodbye, ${name}.`;",
          "}",
          "",
        ]
      : []),
  ].join("\n");
}

function registerOpenPairedMarkdownTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Open paired markdown beside the source editor", () => {
    it('Given a clean workspace, when the user runs "ParallelDocs: Initialize workspace", then parallel-docs.openSideBySide can create the paired markdown.', async () => {
      await resetGeneratedParallelDocsStorage(dogfoodWorkspace.root());
      await vscode.commands.executeCommand("parallel-docs.init");

      const text = await openSideBySideAndReadPairedText(dogfoodWorkspace);
      assert.ok(text.includes("# ParallelDocs"));
    });

    it('Given a workspace with ParallelDocs configured, when the user runs "ParallelDocs: Open paired markdown beside editor" from a source file, then the paired Markdown file exists under `.parallel-docs/source/` and starts with a ParallelDocs heading.', async () => {
      await vscode.commands.executeCommand("parallel-docs.init");

      const text = await openSideBySideAndReadPairedText(dogfoodWorkspace);
      assert.ok(
        text.includes("# ParallelDocs"),
        "Expected default placeholder heading in new paired file.",
      );
    });

    it("Given a primary file URI (as from Explorer), when the user runs open paired with that URI, then the paired Markdown is created the same way.", async () => {
      await vscode.commands.executeCommand("parallel-docs.init");
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      const sampleUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "sample.ts");
      await vscode.commands.executeCommand("parallel-docs.openSideBySide", sampleUri);

      const pairedUri = vscode.Uri.joinPath(
        dogfoodWorkspace.root(),
        ...pairedMarkdownPath.split("/"),
      );
      const bytes = await vscode.workspace.fs.readFile(pairedUri);
      const text = new TextDecoder("utf-8").decode(bytes);
      assert.ok(text.includes("# ParallelDocs"), "Expected paired file from URI-driven open.");
    });
  });
}

function registerValidateWorkspaceTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Validate workspace", () => {
    let validateProject: ValidateProjectFn;

    before(async () => {
      const mod = await import("../../../../core/dist/validate-project.js");
      validateProject = mod.validateProject;
    });

    it("Given a clean dogfood tree (no generated `.parallel-docs/` yet), when `validateProject` runs on that folder, then it reports storage or index warnings — not a config load failure.", async () => {
      const root = dogfoodWorkspace.root().fsPath;
      const { issues } = await validateProject(root);
      assert.ok(
        issues.length >= 1,
        "Expected at least one validation issue for a repo without storage dirs.",
      );
      assert.ok(
        issues.every((i) => i.level === "warn" || i.level === "error"),
        "Issues must use warn or error level.",
      );
      const text = issues.map((i) => i.message).join("\n");
      assert.ok(
        text.includes("Missing directory:") || text.includes("No metadata index at"),
        `Expected missing storage or missing index warnings; got:\n${text}`,
      );
      assert.ok(
        !text.includes("Failed to load .parallel-docs.toml"),
        "Dogfood .parallel-docs.toml must remain valid for this fixture.",
      );
    });

    it('Given an open folder, when the user runs "ParallelDocs: Validate workspace", then the command completes and core `validateProject` still reports the same issues afterward.', async () => {
      const root = dogfoodWorkspace.root().fsPath;
      const before = await validateProject(root);
      await vscode.commands.executeCommand("parallel-docs.validateWorkspace");
      const after = await validateProject(root);
      assert.strictEqual(
        after.issues.length,
        before.issues.length,
        "Validate workspace must not mutate project state in a way that changes issue count for a static tree.",
      );
      assert.deepStrictEqual(
        after.issues.map((i) => `${i.level}:${i.message}`),
        before.issues.map((i) => `${i.level}:${i.message}`),
        "Validate workspace should surface the same validation result as `validateProject` for this folder.",
      );
    });

    it("Given paired Markdown was opened once, when `validateProject` runs, then the `.parallel-docs/source` tree exists so validation no longer warns about a missing source directory.", async () => {
      await vscode.commands.executeCommand("parallel-docs.init");
      await openFixtureSourceFile(dogfoodWorkspace.root());
      await vscode.commands.executeCommand("parallel-docs.openSideBySide");
      const root = dogfoodWorkspace.root().fsPath;
      const { issues } = await validateProject(root);
      const text = issues.map((i) => i.message).join("\n");
      assert.ok(
        !text.includes("Missing directory: .parallel-docs/source"),
        `Did not expect missing source dir after pair open; got:\n${text}`,
      );
    });
  });
}

async function assertTypescriptSelectionBlockFlow(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");
  const editor = await openFixtureSourceFile(dogfoodWorkspace.root());
  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), ...pairedMarkdownPath.split("/"));
  const beforeText = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(pairedUri));
  await vscode.window.showTextDocument(editor.document, { preview: false });
  const doc = editor.document;
  const start = new vscode.Position(5, 0);
  const end = doc.lineAt(7).range.end;
  editor.selection = new vscode.Selection(start, end);

  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const samplePath = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "sample.ts").fsPath;
  const sampleDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === samplePath);
  assert.ok(sampleDoc, "Expected sample.ts buffer after add-block.");
  const sampleText = sampleDoc.getText();
  assert.strictEqual(sampleDoc.isDirty, false, "Expected source file saved after add-block.");
  assert.ok(
    sampleText.includes("//#region parallelDocs:") &&
      sampleText.includes("//#endregion parallelDocs:"),
    "Expected TypeScript ParallelDocs region delimiters around the selection in the primary file.",
  );

  const mdBytes = await vscode.workspace.fs.readFile(pairedUri);
  const mdText = new TextDecoder("utf-8").decode(mdBytes);
  assert.ok(
    mdText.includes("<!-- parallelDocs:block id="),
    "Expected block marker in paired Markdown.",
  );
  assert.ok(
    mdText.includes(beforeText.trim()),
    "Expected pre-existing companion text preserved after first authored block.",
  );

  const indexUri = vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "metadata",
    "index.json",
  );
  const indexBytes = await vscode.workspace.fs.readFile(indexUri);
  const indexText = new TextDecoder("utf-8").decode(indexBytes);
  assert.ok(indexText.includes('"blocks"'), "Expected blocks array in index.json.");
}

async function assertMarkdownSelectionBlockFlow(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");

  const sourceUri = integrationMarkdownSourceUri(dogfoodWorkspace);
  const sourceContent = ["# Markdown source fixture", "", "alpha", "beta", "gamma", ""].join("\n");
  await replaceDocumentText(sourceUri, sourceContent);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  const sourceEditor = await vscode.window.showTextDocument(sourceDoc, { preview: false });

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = integrationMarkdownPairedUri(dogfoodWorkspace);
  const beforeText = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(pairedUri));
  await vscode.window.showTextDocument(sourceDoc, { preview: false });

  sourceEditor.selection = new vscode.Selection(
    new vscode.Position(2, 0),
    new vscode.Position(3, 4),
  );
  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const mutated = (await vscode.workspace.openTextDocument(sourceUri)).getText();
  assert.ok(
    mutated.includes("<!-- #region parallelDocs:"),
    "Expected Markdown start region marker in primary source.",
  );
  assert.ok(
    mutated.includes("<!-- #endregion parallelDocs:"),
    "Expected Markdown end region marker in primary source.",
  );

  const pairedText = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(pairedUri));
  const markerMatch = /<!--\s*parallelDocs:block\s+id=([a-z0-9][a-z0-9-]{0,63})\s*-->/i.exec(
    pairedText,
  );
  assert.ok(markerMatch?.[1], "Expected block marker id in paired Markdown.");
  assert.ok(
    pairedText.includes(beforeText.trim()),
    "Expected pre-existing companion text preserved after first authored block.",
  );
  const blockId = markerMatch?.[1] ?? "";

  const indexUri = vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "metadata",
    "index.json",
  );
  const indexText = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(indexUri));
  assert.ok(
    indexText.includes(`"anchor":"marker:${blockId}"`) ||
      indexText.includes(`"anchor": "marker:${blockId}"`),
    "Expected marker anchor in index for Markdown-source block.",
  );
}

async function assertManualCompanionContentIsPreservedOnAddBlock(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");

  const sourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "manual-preserve.ts");
  const sourceContent = [
    "export function top(): number {",
    "  return 1;",
    "}",
    "",
    "export function bottom(): number {",
    "  return 2;",
    "}",
    "",
  ].join("\n");
  await replaceDocumentText(sourceUri, sourceContent);
  const editor = await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(sourceUri),
    {
      preview: false,
    },
  );

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "source",
    "src",
    "manual-preserve.ts",
    "main.md",
  );
  const custom = [
    "# custom",
    "",
    "manual intro text",
    "",
    "<!-- parallelDocs:block id=existing -->",
    "## existing",
    "",
    "existing block body",
    "",
  ].join("\n");
  await replaceDocumentText(pairedUri, custom);

  await vscode.window.showTextDocument(editor.document, { preview: false });
  editor.selection = new vscode.Selection(new vscode.Position(4, 0), new vscode.Position(5, 12));
  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const next = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(pairedUri));
  assert.ok(next.includes("manual intro text"), "Expected manual prose preserved.");
  assert.ok(next.includes("existing block body"), "Expected existing block body preserved.");
  assert.ok(
    next.includes("<!-- parallelDocs:block id=existing -->"),
    "Expected existing block marker preserved.",
  );
}

async function assertSelectionInsideExistingRegionRevealsExistingBlock(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");
  const sourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "existing-region.ts");
  const withRegion = sampleSourceWithGreetRegion(true);
  await replaceDocumentText(sourceUri, withRegion);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  await vscode.window.showTextDocument(sourceDoc, { preview: false });

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");

  const pairedUri = parallelDocsPairedUriForSource(dogfoodWorkspace, "src", "existing-region.ts");
  const pairedBefore = [
    "<!-- parallelDocs:block id=greet -->",
    "## greet",
    "",
    "already documented",
    "",
  ].join("\n");
  await replaceDocumentText(pairedUri, pairedBefore);

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  const ed = await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(sourceUri),
    {
      preview: false,
    },
  );
  ed.selection = new vscode.Selection(new vscode.Position(2, 2), new vscode.Position(2, 20));

  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const sourceAfter = (await vscode.workspace.openTextDocument(sourceUri)).getText();
  assertEqualLinesTrimmed(
    sourceAfter,
    withRegion,
    "Expected source unchanged when selection is in region.",
  );
  const pairedAfter = new TextDecoder("utf-8").decode(
    await vscode.workspace.fs.readFile(pairedUri),
  );
  assert.strictEqual(
    pairedAfter,
    pairedBefore,
    "Expected companion unchanged when selection is in existing region.",
  );
  assert.strictEqual(
    vscode.window.activeTextEditor?.document.uri.fsPath,
    pairedUri.fsPath,
    "Expected add-block inside an existing region to focus the existing companion block.",
  );
}

async function assertSelectionTouchingBoundaryRecoversMissingBlock(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");
  const sourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "boundary-recovery.ts");
  const withRegion = sampleSourceWithGreetRegion(false);
  await replaceDocumentText(sourceUri, withRegion);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  await vscode.window.showTextDocument(sourceDoc, { preview: false });

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");

  const pairedUri = parallelDocsPairedUriForSource(dogfoodWorkspace, "src", "boundary-recovery.ts");
  const pairedBefore = ["# custom", ""].join("\n");
  await replaceDocumentText(pairedUri, pairedBefore);
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");

  const ed = await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(sourceUri),
    {
      preview: false,
    },
  );
  ed.selection = new vscode.Selection(new vscode.Position(1, 2), new vscode.Position(1, 20));

  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const sourceAfter = (await vscode.workspace.openTextDocument(sourceUri)).getText();
  assertEqualLinesTrimmed(
    sourceAfter,
    withRegion,
    "Expected source unchanged when reusing boundary block.",
  );

  const pairedAfter = vscode.window.activeTextEditor?.document.getText() ?? "";
  assert.ok(
    pairedAfter.includes("<!-- parallelDocs:block id=greet -->"),
    "Expected missing companion block to be recovered from existing source marker.",
  );
  assert.strictEqual(
    vscode.window.activeTextEditor?.document.uri.fsPath,
    pairedUri.fsPath,
    "Expected boundary selection to focus the recovered companion block.",
  );
}

async function assertMarkdownFenceSelectionDoesNotMutate(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");

  const sourceUri = integrationMarkdownSourceUri(dogfoodWorkspace);
  const sourceContent = ["# Markdown source fixture", "", "```ts", "const x = 1;", "```", ""].join(
    "\n",
  );
  await replaceDocumentText(sourceUri, sourceContent);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  await vscode.window.showTextDocument(sourceDoc, { preview: false });

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");
  const pairedUri = integrationMarkdownPairedUri(dogfoodWorkspace);
  const pairedBefore = new TextDecoder("utf-8").decode(
    await vscode.workspace.fs.readFile(pairedUri),
  );
  const activeSourceEditor = await vscode.window.showTextDocument(sourceDoc, { preview: false });

  activeSourceEditor.selection = new vscode.Selection(
    new vscode.Position(3, 0),
    new vscode.Position(3, 12),
  );
  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const sourceAfter = (await vscode.workspace.openTextDocument(sourceUri)).getText();
  assert.strictEqual(
    sourceAfter,
    sourceContent,
    "Expected fenced Markdown source to remain unchanged.",
  );
  const pairedAfter = new TextDecoder("utf-8").decode(
    await vscode.workspace.fs.readFile(pairedUri),
  );
  assert.strictEqual(
    pairedAfter,
    pairedBefore,
    "Expected companion unchanged for fenced Markdown selections.",
  );
}

async function assertStaleIndexMarkerIdCollisionIsHandled(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");
  const editor = await openFixtureSourceFile(dogfoodWorkspace.root());
  await vscode.commands.executeCommand("parallel-docs.openSideBySide");

  const indexUri = vscode.Uri.joinPath(
    dogfoodWorkspace.root(),
    ".parallel-docs",
    "metadata",
    "index.json",
  );
  const indexRaw = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(indexUri));
  const index = JSON.parse(indexRaw) as {
    schemaVersion: number;
    byParallelDocsPath: Record<
      string,
      { sourcePath: string; parallelDocsPath: string; blocks: Array<Record<string, unknown>> }
    >;
  };
  const entry = index.byParallelDocsPath[pairedMarkdownPath];
  index.byParallelDocsPath[pairedMarkdownPath] = {
    ...(entry ? { ...entry } : {}),
    sourcePath: "src/sample.ts",
    parallelDocsPath: pairedMarkdownPath,
    blocks: [{ id: "greet", anchor: "marker:greet", markerId: "greet" }],
  };
  await vscode.workspace.fs.writeFile(
    indexUri,
    new TextEncoder().encode(`${JSON.stringify(index)}\n`),
  );

  await vscode.window.showTextDocument(editor.document, { preview: false });

  editor.selection = new vscode.Selection(new vscode.Position(8, 0), new vscode.Position(10, 1));
  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const sourceAfter = editor.document.getText();
  const markerMatch = /parallelDocs:([a-z0-9][a-z0-9_-]{0,62}[a-z0-9])/i.exec(sourceAfter);
  assert.ok(markerMatch?.[1], "Expected an inserted marker id in source.");
  assert.notStrictEqual(
    markerMatch?.[1],
    "greet",
    "Expected stale-index id collision to be avoided.",
  );
}

async function assertUnsortedInsertionsReorderedBySourceFlow(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): Promise<void> {
  await vscode.commands.executeCommand("parallel-docs.init");

  const sourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "unsorted-order.ts");
  const sourceContent = [
    "export function greet(name: string): string {",
    "  return `Hello, ${name}!`;",
    "}",
    "",
    "export function farewell(name: string): string {",
    "  //#region parallelDocs:farewell",
    "  return `Goodbye, ${name}.`;",
    "  //#endregion parallelDocs:farewell",
    "}",
    "",
  ].join("\n");
  await replaceDocumentText(sourceUri, sourceContent);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  await vscode.window.showTextDocument(sourceDoc, {
    preview: false,
  });

  await vscode.commands.executeCommand("parallel-docs.openSideBySide");

  const pairedUri = parallelDocsPairedUriForSource(dogfoodWorkspace, "src", "unsorted-order.ts");
  const pairedSeed = [
    "# custom",
    "",
    "<!-- parallelDocs:block id=farewell -->",
    "## farewell",
    "",
    "bottom block",
    "",
  ].join("\n");
  await replaceDocumentText(pairedUri, pairedSeed);

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  const editor = await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(sourceUri),
    {
      preview: false,
    },
  );

  const markdownOrder = async (): Promise<string[]> => {
    const text = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(pairedUri));
    return import("../../../../core/dist/marker-validation.js").then((m) =>
      m.extractParallelDocsBlockIdsInMarkdownOrder(text),
    );
  };

  const idsBefore = await markdownOrder();
  assert.ok(idsBefore.includes("farewell"), "Expected pre-seeded bottom block marker.");

  // Add top block after a pre-existing bottom block.
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 28));
  await vscode.window.showTextDocument(editor.document, { preview: false });
  await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

  const idsAfter = await markdownOrder();
  const insertedTopId = idsAfter.find((id) => id !== "farewell") ?? "";
  assert.ok(insertedTopId.length > 0, "Expected newly inserted top block marker id.");
  const topIdx = idsAfter.indexOf(insertedTopId);
  const bottomIdx = idsAfter.indexOf("farewell");
  assert.ok(topIdx >= 0 && bottomIdx >= 0, "Expected top and bottom block markers in companion.");
  assert.ok(
    topIdx < bottomIdx,
    "Expected top block (inserted after a bottom block) to be ordered before the existing bottom block.",
  );
}

function registerAddBlockFromSelectionTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Add side-track block from selection", () => {
    it('Given a source file with a non-empty selection, when the user runs "ParallelDocs: Add side-track block from selection", then the paired Markdown gains a `parallelDocs:block` marker and the metadata index is updated.', async function () {
      this.timeout(90_000);
      await assertTypescriptSelectionBlockFlow(dogfoodWorkspace);
    });

    it("Given a Markdown primary source selection, when add-block runs, then paired HTML region markers are inserted and the index anchor uses marker:<id> for that source.", async function () {
      this.timeout(90_000);
      await assertMarkdownSelectionBlockFlow(dogfoodWorkspace);
    });

    it("Given manually-authored companion prose, when add-block runs, then existing companion content is preserved and a new block is inserted.", async function () {
      this.timeout(90_000);
      await assertManualCompanionContentIsPreservedOnAddBlock(dogfoodWorkspace);
    });

    it("Given selection is inside an existing region, when add-block runs, then source remains unchanged and the existing companion block is focused.", async function () {
      this.timeout(90_000);
      await assertSelectionInsideExistingRegionRevealsExistingBlock(dogfoodWorkspace);
    });

    it("Given selection touches an existing marker boundary and the companion block is missing, when add-block runs, then the block is recovered without mutating source.", async function () {
      this.timeout(90_000);
      await assertSelectionTouchingBoundaryRecoversMissingBlock(dogfoodWorkspace);
    });

    it("Given stale index already claims the preferred marker id, when add-block runs, then a unique marker id is chosen instead of failing.", async function () {
      this.timeout(90_000);
      await assertStaleIndexMarkerIdCollisionIsHandled(dogfoodWorkspace);
    });

    it("Given blocks are authored out-of-order (bottom then top), when add-block runs twice, then companion block order still follows source flow.", async function () {
      this.timeout(90_000);
      await assertUnsortedInsertionsReorderedBySourceFlow(dogfoodWorkspace);
    });

    it("Given a Markdown fenced code selection, when add-block runs, then source and companion remain unchanged.", async function () {
      this.timeout(90_000);
      await assertMarkdownFenceSelectionDoesNotMutate(dogfoodWorkspace);
    });
  });
}

function registerActiveEditorUiFlagsContractTests(
  dogfoodWorkspace: DogfoodWorkspaceAccessor,
): void {
  describe("Active editor UI flags (core contract for menus)", () => {
    it("Given dogfood paths, when core computes UI flags, then the companion markdown is under the tree and resolvable and the primary file is not", async () => {
      const { parallelDocsActiveEditorUiFlags } =
        await import("../../../../core/dist/parallel-docs-active-editor-ui-context.js");
      const root = dogfoodWorkspace.root().fsPath;
      const companion = parallelDocsActiveEditorUiFlags({
        normalizedRepoRelativePath: pairedMarkdownPath,
        storageDir: ".parallel-docs",
        repoRoot: root,
      });
      assert.deepStrictEqual(companion, {
        underCompanionSourceTree: true,
        isResolvableCompanionMarkdown: true,
      });
      const primary = parallelDocsActiveEditorUiFlags({
        normalizedRepoRelativePath: "src/sample.ts",
        storageDir: ".parallel-docs",
        repoRoot: root,
      });
      assert.deepStrictEqual(primary, {
        underCompanionSourceTree: false,
        isResolvableCompanionMarkdown: false,
      });
    });
  });
}

function registerOpenCorrespondingSourceTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Open corresponding source file from companion markdown", () => {
    it('Given the paired ParallelDocs markdown is active, when the user runs "ParallelDocs: Open corresponding source file", then the primary source editor becomes active for that pair.', async () => {
      const pairedUri = await openDogfoodPairedMarkdownActiveEditor(dogfoodWorkspace);

      await vscode.commands.executeCommand("parallel-docs.openCorrespondingSource");

      const active = vscode.window.activeTextEditor;
      assert.ok(active, "Expected an active editor after opening corresponding source.");
      const sampleFs = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "sample.ts").fsPath;
      assert.strictEqual(
        active.document.uri.fsPath,
        sampleFs,
        "Expected focus on the dogfood primary source file.",
      );
      const pairedFs = pairedUri.fsPath;
      const hasSample = vscode.window.visibleTextEditors.some(
        (e) => e.document.uri.fsPath === sampleFs,
      );
      const hasPaired = vscode.window.visibleTextEditors.some(
        (e) => e.document.uri.fsPath === pairedFs,
      );
      assert.ok(
        hasSample && hasPaired,
        "Expected the primary source and companion markdown to stay visible together for scroll sync.",
      );
    });
  });
}

function registerMarkdownPreviewTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Open Markdown preview for paired file", () => {
    it('Given the paired Markdown file is active, when the user runs "ParallelDocs: Open Markdown preview for paired file", then the command runs without rejecting.', async () => {
      await openDogfoodPairedMarkdownActiveEditor(dogfoodWorkspace);

      await vscode.commands.executeCommand("parallel-docs.openParallelDocsPreview");
    });

    it('Given a primary source file that is not Markdown is active, when the user runs "ParallelDocs: Open Markdown preview for paired file", then the command runs without rejecting.', async () => {
      await openFixtureSourceFile(dogfoodWorkspace.root());
      await vscode.commands.executeCommand("parallel-docs.openParallelDocsPreview");
    });
  });
}

function registerRenderedPreviewTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Open rendered ParallelDocs preview (library HTML + webview)", () => {
    it('Given a primary source file is active, when the user runs "ParallelDocs: Open rendered ParallelDocs preview (default angle)", then the command completes without rejecting.', async () => {
      const editor = await openFixtureSourceFile(dogfoodWorkspace.root());
      await vscode.window.showTextDocument(editor.document, { preview: false });
      await vscode.commands.executeCommand("parallel-docs.openRenderedPreview");
    });
  });
}

function registerSelfHealingTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("Self-healing region markers (repair command)", () => {
    it("Given a source file with missing parallel-docs region markers, when repair file command is executed, then the missing markers are restored.", async function () {
      this.timeout(90_000);
      await vscode.commands.executeCommand("parallel-docs.init");

      const sourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "self-healing-test.ts");
      const originalText = [
        "export function testFunc(): void {",
        "  const hello = 'world';",
        "}",
        "",
      ].join("\n");
      await replaceDocumentText(sourceUri, originalText);
      const editor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(sourceUri),
        { preview: false },
      );

      // Select line to create a block
      editor.selection = new vscode.Selection(
        new vscode.Position(1, 0),
        new vscode.Position(1, 24),
      );
      await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

      // Extract generated block ID
      const docText = editor.document.getText();
      const match = /parallelDocs:([a-z0-9][a-z0-9_-]{0,62}[a-z0-9])/i.exec(docText);
      assert.ok(match?.[1], "Expected region marker to be inserted");
      const blockId = match[1];

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // Delete region markers from source file
      const deletedMarkersText = [
        "export function testFunc(): void {",
        "  const hello = 'world';",
        "}",
        "",
      ].join("\n");
      await replaceDocumentText(sourceUri, deletedMarkersText);

      const activeEd = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(sourceUri),
        { preview: false },
      );

      await vscode.commands.executeCommand("parallel-docs.repairFile");

      const healedText = activeEd.document.getText();
      assert.ok(
        healedText.includes(`//#region parallelDocs:${blockId}`),
        `Expected start region marker for ${blockId} to be restored`,
      );
      assert.ok(
        healedText.includes(`//#endregion parallelDocs:${blockId}`),
        `Expected end region marker for ${blockId} to be restored`,
      );
    });
  });
}

function registerRenameWatcherTests(dogfoodWorkspace: DogfoodWorkspaceAccessor): void {
  describe("SCM rename watcher", () => {
    it("Given a primary source file is renamed, when the rename event is processed, then the companion Markdown is renamed on disk and the index.json is updated.", async function () {
      this.timeout(90_000);
      await vscode.commands.executeCommand("parallel-docs.init");

      const oldSourceUri = vscode.Uri.joinPath(dogfoodWorkspace.root(), "src", "rename-temp.ts");
      const newSourceUri = vscode.Uri.joinPath(
        dogfoodWorkspace.root(),
        "src",
        "rename-temp-new.ts",
      );

      const sourceContent = [
        "export function greet(): string {",
        "  return 'hello';",
        "}",
        "",
      ].join("\n");
      await replaceDocumentText(oldSourceUri, sourceContent);

      const editor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(oldSourceUri),
        { preview: false },
      );

      // Select line to create a block
      editor.selection = new vscode.Selection(
        new vscode.Position(1, 0),
        new vscode.Position(1, 18),
      );
      await vscode.commands.executeCommand("parallel-docs.startBlockFromSelection");

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      const oldCompanionUri = parallelDocsPairedUriForSource(
        dogfoodWorkspace,
        "src",
        "rename-temp.ts",
      );
      const newCompanionUri = parallelDocsPairedUriForSource(
        dogfoodWorkspace,
        "src",
        "rename-temp-new.ts",
      );

      // Verify old companion exists
      await vscode.workspace.fs.stat(oldCompanionUri);

      // Rename the source file using a WorkspaceEdit to trigger the VS Code workspace rename event
      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(oldSourceUri, newSourceUri);
      const success = await vscode.workspace.applyEdit(edit);
      assert.ok(success, "Rename workspace edit should succeed");

      // Give the rename watcher a moment to process the event
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify new companion exists and old companion does not
      await vscode.workspace.fs.stat(newCompanionUri);
      let oldCompanionExists = true;
      try {
        await vscode.workspace.fs.stat(oldCompanionUri);
      } catch {
        oldCompanionExists = false;
      }
      assert.strictEqual(oldCompanionExists, false, "Old companion should be removed/moved");

      // Verify index.json was updated with new path
      const indexUri = vscode.Uri.joinPath(
        dogfoodWorkspace.root(),
        ".parallel-docs",
        "metadata",
        "index.json",
      );
      const indexBytes = await vscode.workspace.fs.readFile(indexUri);
      const indexText = new TextDecoder("utf-8").decode(indexBytes);
      assert.ok(
        indexText.includes("src/rename-temp-new.ts"),
        "Index should contain renamed source path",
      );
      assert.ok(
        !indexText.includes("src/rename-temp.ts"),
        "Index should not contain old source path",
      );
    });
  });
}

describe("ParallelDocs in VS Code (integration)", () => {
  const dogfoodWorkspace = registerDogfoodWorkspaceLifecycle();
  registerExtensionSurfaceTests(dogfoodWorkspace);
  registerOpenPairedMarkdownTests(dogfoodWorkspace);
  registerActiveEditorUiFlagsContractTests(dogfoodWorkspace);
  registerOpenCorrespondingSourceTests(dogfoodWorkspace);
  registerValidateWorkspaceTests(dogfoodWorkspace);
  registerAddBlockFromSelectionTests(dogfoodWorkspace);
  registerMarkdownPreviewTests(dogfoodWorkspace);
  registerRenderedPreviewTests(dogfoodWorkspace);
  registerSelfHealingTests(dogfoodWorkspace);
  registerRenameWatcherTests(dogfoodWorkspace);
});

import * as assert from "node:assert";
import type { HookFunction } from "mocha";
import * as vscode from "vscode";

declare const before: HookFunction;
declare const beforeEach: HookFunction;
declare const afterEach: HookFunction;

export const pairedMarkdownPath = ".parallel-docs/source/src/sample.ts/main.md";

const DOGFOOD_INTEGRATION_MARKDOWN_SOURCE_BYTES = new TextEncoder().encode(
  ["# Markdown source fixture", "", "alpha", "beta", "gamma", ""].join("\n"),
);

/** Tracked `fixtures/dogfood/src/sample.ts` (restored each test so “add block” region wraps do not accumulate). */
const DOGFOOD_SAMPLE_TS_BYTES = new TextEncoder().encode(
  [
    "// Sample source file for exercising the ParallelDocs VS Code extension.",
    "//",
    "// Open this file and run **ParallelDocs: Open paired markdown beside editor** (or",
    "// the angle / rendered-preview commands) to work with the companion Markdown",
    "// under `.parallel-docs/source/src/sample.ts/`. README screenshots use longer",
    "// companion prose plus a page break so the rendered preview is readable in",
    "// small frames.",
    "",
    "export function greet(name: string): string {",
    "  return `Hello, ${name}!`;",
    "}",
    "",
    "export function farewell(name: string): string {",
    "  return `Goodbye, ${name}.`;",
    "}",
    "",
  ].join("\n"),
);

export type DogfoodWorkspaceAccessor = {
  /** Dogfood workspace folder URI; valid after the suite `before` hook runs. */
  root(): vscode.Uri;
};

async function restoreDogfoodMutableFixtures(workspaceRoot: vscode.Uri): Promise<void> {
  const sampleUri = vscode.Uri.joinPath(workspaceRoot, "src", "sample.ts");
  await vscode.workspace.fs.writeFile(sampleUri, DOGFOOD_SAMPLE_TS_BYTES);
  const integrationMarkdownSourceUri = vscode.Uri.joinPath(
    workspaceRoot,
    "docs",
    "integration-markdown-source.md",
  );
  await vscode.workspace.fs.writeFile(
    integrationMarkdownSourceUri,
    DOGFOOD_INTEGRATION_MARKDOWN_SOURCE_BYTES,
  );
  const generatedFixtureUris = [
    vscode.Uri.joinPath(workspaceRoot, "src", "boundary-recovery.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "existing-region.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "manual-preserve.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "unsorted-order.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "self-healing-test.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "rename-temp.ts"),
    vscode.Uri.joinPath(workspaceRoot, "src", "rename-temp-new.ts"),
  ];
  for (const uri of generatedFixtureUris) {
    try {
      await vscode.workspace.fs.delete(uri, { useTrash: false });
    } catch {
      // Missing file is fine.
    }
  }
}

/**
 * Registers suite-level `before` / `beforeEach` that resolve the dogfood folder and reset `.parallel-docs/`.
 */
export function registerDogfoodWorkspaceLifecycle(): DogfoodWorkspaceAccessor {
  let workspaceRoot!: vscode.Uri;
  before(() => {
    workspaceRoot = dogfoodWorkspaceRoot();
  });
  beforeEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await resetGeneratedParallelDocsStorage(workspaceRoot);
    await restoreDogfoodMutableFixtures(workspaceRoot);
  });
  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await restoreDogfoodMutableFixtures(workspaceRoot);
  });
  return {
    root: () => workspaceRoot,
  };
}

/** Bytes of `fixtures/dogfood/.parallel-docs.toml` (restored after Angles tests mutate it). */
const DOGFOOD_PARALLEL_DOCS_TOML_BYTES = new TextEncoder().encode(
  `# Fixture ParallelDocs config for the VS Code extension dogfood folder.
# Keeping defaults explicit so the project-root resolver locks onto this
# directory when the Extension Development Host opens it.

[storage]
# dir = ".parallel-docs"

[render]
# mermaid = true
`,
);

export function dogfoodWorkspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "Expected a workspace folder (tests must run with fixtures/dogfood open).");
  return folder.uri;
}

export async function restoreDogfoodParallelDocsToml(workspaceRoot: vscode.Uri): Promise<void> {
  const tomlUri = vscode.Uri.joinPath(workspaceRoot, ".parallel-docs.toml");
  await vscode.workspace.fs.writeFile(tomlUri, DOGFOOD_PARALLEL_DOCS_TOML_BYTES);
}

/** Enables Angles without importing `@parallel-docs/core` (extension host resolves CJS vs package exports poorly). */
export async function enableAnglesDogfoodFixture(workspaceRoot: vscode.Uri): Promise<void> {
  const enc = new TextEncoder();
  const sentinelUri = vscode.Uri.joinPath(workspaceRoot, ".parallel-docs", "source", ".default");
  await vscode.workspace.fs.writeFile(
    sentinelUri,
    enc.encode("# ParallelDocs Angles layout sentinel (fixture).\n"),
  );
  const anglesToml = `[storage]
dir = ".parallel-docs"

[angles]
default_angle = "main"

[[angles.definitions]]
id = "main"
title = "Main"

[[angles.definitions]]
id = "alt"
title = "Alt"
`;
  const tomlUri = vscode.Uri.joinPath(workspaceRoot, ".parallel-docs.toml");
  await vscode.workspace.fs.writeFile(tomlUri, enc.encode(`${anglesToml}\n`));
}

export async function resetGeneratedParallelDocsStorage(workspaceRoot: vscode.Uri): Promise<void> {
  const parallelDocsDir = vscode.Uri.joinPath(workspaceRoot, ".parallel-docs");
  try {
    await vscode.workspace.fs.delete(parallelDocsDir, { recursive: true, useTrash: false });
  } catch {
    // Missing folder is fine.
  }
}

export async function openFixtureSourceFile(workspaceRoot: vscode.Uri): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(workspaceRoot, "src", "sample.ts"),
  );
  return vscode.window.showTextDocument(doc);
}

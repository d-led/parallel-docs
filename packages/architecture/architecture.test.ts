import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectFiles } from "archunit";
import { afterAll, afterEach, describe, expect, it } from "vitest";

/** Set when any rule in this file fails, so we do not print a misleading "no findings" line. */
let archUnitRuleFailed = false;

afterEach((ctx) => {
  if (ctx.task.result?.state === "fail") {
    archUnitRuleFailed = true;
  }
});

afterAll(() => {
  if (!archUnitRuleFailed) {
    // Visible with e.g. `vitest run --reporter=verbose`; default reporter may omit stdout.
    console.info(
      "[ArchUnitTS] No findings: no disallowed cross-package imports vs architecture.md (Mermaid); " +
        "package.json CLI↔vscode edges absent; per-package src/ import cycles clean.",
    );
  }
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const archunitTsconfig = path.join(repoRoot, "tsconfig.archunit.json");

function firstPartyFiles() {
  return projectFiles(archunitTsconfig);
}

/** All npm dependency keys (including dev / peer / optional) for manifest hygiene checks. */
function dependencyKeysFromPackageJson(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
}

type PackageJsonForDeps = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

async function assertFirstPartyPackageDoesNotImportFolders(options: {
  sourceGlob: string;
  forbiddenFolders: readonly string[];
  failureMessage: (folder: string) => string;
}): Promise<void> {
  for (const folder of options.forbiddenFolders) {
    const rule = firstPartyFiles()
      .inFolder(options.sourceGlob)
      .shouldNot()
      .dependOnFiles()
      .inFolder(`${folder}/**`);
    await expect(rule, options.failureMessage(folder)).toPassAsync();
  }
}

async function assertNoImportCyclesInPackageSrc(packageDirName: string): Promise<void> {
  const rule = firstPartyFiles()
    .inFolder(`packages/${packageDirName}/src/**`)
    .should()
    .haveNoCycles();
  await expect(rule, `packages/${packageDirName}/src must not contain import cycles`).toPassAsync();
}

async function assertCliAndVscodePackageJsonHaveNoCrossReferences(): Promise<void> {
  const cli = JSON.parse(
    await readFile(path.join(repoRoot, "packages/cli/package.json"), "utf8"),
  ) as PackageJsonForDeps;
  const vscode = JSON.parse(
    await readFile(path.join(repoRoot, "packages/vscode/package.json"), "utf8"),
  ) as PackageJsonForDeps;

  const cliKeys = dependencyKeysFromPackageJson(cli);
  const vscodeKeys = dependencyKeysFromPackageJson(vscode);

  for (const name of ["parallel-docs"] as const) {
    expect(
      cliKeys.has(name),
      `Remove "${name}" from packages/cli/package.json (dependencies / devDependencies / peerDependencies / optionalDependencies). The CLI must not depend on the VS Code extension package.`,
    ).toBe(false);
  }

  expect(
    vscodeKeys.has("@parallel-docs/cli"),
    'Remove "@parallel-docs/cli" from packages/vscode/package.json (dependencies / devDependencies / peerDependencies / optionalDependencies). The extension must not depend on the CLI package.',
  ).toBe(false);
}

/**
 * **Defects** here mean wild first-party imports: a package reaching another when the
 * README / `.parallel-docs/source/README.md/architecture.md` Mermaid (npm `dependencies` edges)
 * does not allow that direction. ArchUnitTS fails those; the separate cycle checks are
 * structural hygiene, not drawn in the diagram.
 *
 * Dependency edges agreed for this monorepo (see README table and
 * `.parallel-docs/source/README.md/architecture.md`). These tests enforce import
 * directions between first-party packages under `packages/`.
 *
 * Uses {@link https://github.com/LukasNiessen/ArchUnitTS ArchUnitTS} with Vitest
 * `globals: true` (see root `vitest.config.ts`) so `toPassAsync()` is available.
 *
 * Root `tsconfig.json` is solution-style (`files: []`); ArchUnitTS needs a config
 * that lists sources, hence `tsconfig.archunit.json`.
 */
describe("monorepo package dependency rules", { timeout: 30_000 }, () => {
  it("keeps @parallel-docs/core free of other workspace packages", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/core/**",
      forbiddenFolders: [
        "packages/render",
        "packages/code-parallel-docs-static",
        "packages/cli",
        "packages/vscode",
      ],
      failureMessage: (folder) => `@parallel-docs/core must not depend on files under ${folder}`,
    });
  });

  it("keeps @parallel-docs/render from reaching static site, CLI, or the VS Code extension", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/render/**",
      forbiddenFolders: ["packages/code-parallel-docs-static", "packages/cli", "packages/vscode"],
      failureMessage: (folder) => `@parallel-docs/render must not depend on files under ${folder}`,
    });
  });

  it("keeps @parallel-docs/mcp-server from reaching static site, CLI, or the VS Code extension", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/mcp-server/**",
      forbiddenFolders: ["packages/code-parallel-docs-static", "packages/cli", "packages/vscode"],
      failureMessage: (folder) =>
        `@parallel-docs/mcp-server must not depend on files under ${folder}`,
    });
  });

  it("keeps @parallel-docs/code-parallel-docs-static from reaching the CLI or VS Code extension", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/code-parallel-docs-static/**",
      forbiddenFolders: ["packages/cli", "packages/vscode"],
      failureMessage: (folder) =>
        `@parallel-docs/code-parallel-docs-static must not depend on files under ${folder}`,
    });
  });

  it("keeps the parallel-docs CLI package from depending on the VS Code extension package", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/cli/**",
      forbiddenFolders: ["packages/vscode"],
      failureMessage: () =>
        "parallel-docs (CLI) must not import packages/vscode — CLI is Node tooling; the extension is a separate host",
    });
  });

  it("keeps package.json free of CLI↔VS Code package dependencies", async () => {
    await assertCliAndVscodePackageJsonHaveNoCrossReferences();
  });

  it("keeps the VS Code extension using only @parallel-docs/core among workspace code", async () => {
    await assertFirstPartyPackageDoesNotImportFolders({
      sourceGlob: "packages/vscode/**",
      forbiddenFolders: ["packages/render", "packages/code-parallel-docs-static", "packages/cli"],
      failureMessage: (folder) => `parallel-docs must not depend on files under ${folder}`,
    });
  });

  it("has no import cycles within each first-party package src tree", async () => {
    const packages = [
      "core",
      "render",
      "code-parallel-docs-static",
      "mcp-server",
      "cli",
      "vscode",
    ] as const;
    for (const pkg of packages) {
      await assertNoImportCyclesInPackageSrc(pkg);
    }
  });
});

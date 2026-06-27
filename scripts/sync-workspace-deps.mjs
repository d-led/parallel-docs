#!/usr/bin/env node
// Keep intra-monorepo dependency pins in lockstep with the current Commentray
// version (as recorded in packages/core/package.json).
//
// Rewrites every first-party workspace package entry (@commentray/* and the
// unscoped `commentray` CLI) found in
// `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`
// across all workspace packages (and the monorepo root) to that version.
//
// Idempotent. No-op when everything is already aligned.
//
// Usage:
//   bash scripts/sync-workspace-deps.sh
//   bash scripts/sync-workspace-deps.sh --check     # exit 1 if a rewrite would be needed
//   (or: node scripts/sync-workspace-deps.mjs [--check])

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

const WORKSPACE_NAMES = new Set([
  "@commentray/core",
  "@commentray/render",
  "commentray",
  "@commentray/code-commentray-static",
  "@commentray/mcp-server",
]);

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function rewritePackage(file, targetVersion) {
  const json = readJson(file);
  let changed = false;
  for (const field of DEP_FIELDS) {
    const deps = json[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (!WORKSPACE_NAMES.has(name)) continue;
      if (deps[name] !== targetVersion) {
        deps[name] = targetVersion;
        changed = true;
      }
    }
  }
  return { json, changed };
}

const check = process.argv.includes("--check");
const canonical = readJson(join(REPO_ROOT, "packages/core/package.json"));
const targetVersion = canonical.version;

const files = [
  "package.json",
  "packages/core/package.json",
  "packages/render/package.json",
  "packages/cli/package.json",
  "packages/code-commentray-static/package.json",
  "packages/vscode/package.json",
].map((p) => join(REPO_ROOT, p));

const drifted = [];
for (const file of files) {
  const { json, changed } = rewritePackage(file, targetVersion);
  if (!changed) continue;
  drifted.push(file);
  if (!check) writeJson(file, json);
}

if (check) {
  if (drifted.length === 0) {
    console.log(`All workspace deps already pin first-party packages at ${targetVersion}.`);
    process.exit(0);
  }
  console.error(`Workspace deps drifted from ${targetVersion}:`);
  for (const f of drifted) console.error(`  ${f}`);
  console.error("Run: bash scripts/sync-workspace-deps.sh");
  process.exit(1);
}

if (drifted.length === 0) {
  console.log(`All workspace deps already pin first-party packages at ${targetVersion}.`);
} else {
  console.log(`Synced first-party workspace pins to ${targetVersion} in:`);
  for (const f of drifted) console.log(`  ${f}`);
}

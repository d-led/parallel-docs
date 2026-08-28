#!/usr/bin/env node

/**
 * Generate ThirdPartyNotices.txt for the SideTrack VS Code extension.
 *
 * Walks the workspace dependency tree from packages/vscode/package.json,
 * collects the direct (non-workspace) dependencies of every bundled
 * @sidetrack/* package, groups them by license, and writes the notice file.
 *
 * Usage:
 *   node scripts/generate-third-party-notices.mjs
 *
 * The output is written to packages/vscode/ThirdPartyNotices.txt.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VSCODE_DIR = join(REPO_ROOT, "packages", "vscode");
const OUTPUT = join(VSCODE_DIR, "ThirdPartyNotices.txt");

// ── helpers ──────────────────────────────────────────────────────────────

function readJson(absPath) {
  return JSON.parse(readFileSync(absPath, "utf8"));
}

function resolvePkg(name) {
  try {
    const p = join(REPO_ROOT, "node_modules", name, "package.json");
    return readJson(p);
  } catch {
    return null;
  }
}

// ── discover bundled workspace packages ───────────────────────────────────

/**
 * Recursively collect all @sidetrack/* workspace packages that the vscode
 * extension transitively depends on. Returns unique package directory names
 * (e.g. "core", "render", "mcp-server").
 */
function collectBundledWorkspaceDeps() {
  const vscodePkg = readJson(join(VSCODE_DIR, "package.json"));
  const seen = new Set();
  const queue = Object.keys(vscodePkg.dependencies ?? {}).filter((d) =>
    d.startsWith("@sidetrack/"),
  );

  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);

    const pkg = resolvePkg(name);
    if (!pkg) continue;

    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (dep.startsWith("@sidetrack/") && !seen.has(dep)) {
        queue.push(dep);
      }
    }
  }

  // Map to short names: "@sidetrack/core" → "core"
  return [...seen].map((n) => n.replace(/^@sidetrack\//, ""));
}

// ── collect third-party deps ─────────────────────────────────────────────

/**
 * For each bundled workspace package, collect its direct non-workspace
 * dependencies. Returns a Map of name → { version, license, workspacePkg }.
 */
function collectThirdPartyDeps(workspaceDirs) {
  /** @type {Map<string, {version: string, license: string, workspacePkg: string}>} */
  const map = new Map();

  for (const ws of workspaceDirs.sort()) {
    const pkgPath = join(REPO_ROOT, "packages", ws, "package.json");
    const pkg = readJson(pkgPath);
    const wsName = `@sidetrack/${ws}`;

    for (const [name, _range] of Object.entries(pkg.dependencies ?? {})) {
      if (name.startsWith("@sidetrack/")) continue;

      const resolved = resolvePkg(name);
      if (!resolved) continue;

      const license = resolved.license ?? "UNLICENSED";
      const version = resolved.version ?? "unknown";

      map.set(name, { version, license, workspacePkg: wsName });
    }
  }

  return map;
}

// ── license notice templates ─────────────────────────────────────────────

const LICENSE_TEXTS = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  ISC: `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  "BSD-3-Clause": `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from this
   software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`,

  "BSD-2-Clause": `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`,

  "Apache-2.0": `Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,
};

// ── vendored components ────────────────────────────────────────────────────

/**
 * Third-party assets copied into a shipped package (not installed as npm
 * dependencies), which therefore need explicit attribution in the notices.
 */
const VENDORED_COMPONENTS = [
  {
    name: "mermaid",
    version: "11.17.0",
    license: "MIT",
    copyright: "Copyright (c) 2014 - 2022 Knut Sveidqvist",
    note: "Vendored as mermaid.min.js in @sidetrack/render (Mermaid diagram runtime).",
  },
  {
    name: "highlight.js",
    version: "11.11.1",
    license: "BSD-3-Clause",
    copyright: "Copyright (c) 2006, Ivan Sagalaev. All rights reserved.",
    note: "Vendored theme CSS (github, github-dark) in @sidetrack/render.",
  },
];

// ── generate ─────────────────────────────────────────────────────────────

function generate() {
  const workspaceDirs = collectBundledWorkspaceDeps();
  const deps = collectThirdPartyDeps(workspaceDirs);

  if (deps.size === 0) {
    console.error("No third-party dependencies found. Nothing to generate.");
    process.exit(1);
  }

  // group by license
  /** @type {Map<string, {name: string, version: string, workspacePkg: string}[]>} */
  const byLicense = new Map();
  for (const [name, info] of deps) {
    const key = info.license;
    if (!byLicense.has(key)) byLicense.set(key, []);
    byLicense.get(key).push({ name, version: info.version, workspacePkg: info.workspacePkg });
  }

  // sort licenses: MIT first (most common), then alphabetically
  const licenseOrder = [...byLicense.keys()].sort((a, b) => {
    if (a === "MIT") return -1;
    if (b === "MIT") return 1;
    return a.localeCompare(b);
  });

  const lines = [];
  lines.push("THIRD-PARTY SOFTWARE NOTICES");
  lines.push("");
  lines.push('This VS Code extension ("SideTrack") distributes the following third-party');
  lines.push("open-source software components as direct dependencies of the bundled");
  lines.push("@sidetrack/* workspace packages. Each component is governed by its");
  lines.push("own license. Transitive dependencies of these components carry compatible");
  lines.push("licenses; refer to each package's documentation for details.");
  lines.push("");
  lines.push(
    `Generated by scripts/generate-third-party-notices.mjs on ${new Date().toISOString().slice(0, 10)}.`,
  );
  lines.push("");

  for (const license of licenseOrder) {
    const items = byLicense.get(license);
    const text = LICENSE_TEXTS[license];

    lines.push("=".repeat(78));
    lines.push(`${license} License`);
    lines.push("=".repeat(78));
    lines.push("");

    lines.push("The following components are available under the " + license + " License:");
    lines.push("");

    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  ${item.name}@${item.version}  (via ${item.workspacePkg})`);
    }

    lines.push("");

    if (text) {
      lines.push("  " + text.replace(/\n/g, "\n  "));
    } else {
      lines.push(`  (Full license text: see ${license})`);
    }

    lines.push("");
  }

  // Vendored assets copied into shipped packages (not npm dependencies).
  lines.push("=".repeat(78));
  lines.push("Vendored third-party components");
  lines.push("=".repeat(78));
  lines.push("");
  lines.push("The following components are copied into the distributed package rather than");
  lines.push("installed as npm dependencies, and are shipped with the extension:");
  lines.push("");

  for (const component of VENDORED_COMPONENTS) {
    lines.push(`  ${component.name}@${component.version} (${component.license})`);
    lines.push(`    ${component.copyright}`);
    lines.push(`    ${component.note}`);
    lines.push("");
    const text = LICENSE_TEXTS[component.license];
    if (text) {
      lines.push("  " + text.replace(/\n/g, "\n  "));
    }
    lines.push("");
  }

  writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");
  console.error(`Wrote ${OUTPUT} (${deps.size} packages, ${licenseOrder.length} license types)`);
}

generate();

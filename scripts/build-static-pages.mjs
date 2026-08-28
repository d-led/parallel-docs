#!/usr/bin/env node
/**
 * Build `_site/index.html` for GitHub Pages from `.parallel-docs.toml` `[static_site]`.
 * Implementation: {@link import("@parallel-docs/code-parallel-docs-static/github-pages-site")}.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildGithubPagesStaticSite } from "@parallel-docs/code-parallel-docs-static/github-pages-site";
import { writeE2eDualScrollFixture } from "./lib/write-e2e-dual-scroll-fixture.mjs";
import { writeE2eMobileFlipEndFixture } from "./lib/write-e2e-mobile-flip-end-fixture.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** CI (e.g. GitHub Actions) sets this so the static footer includes the commit; omitted locally. */
const pagesBuildCommitSha = process.env.PARALLEL_DOCS_PAGES_BUILD_SHA?.trim();

try {
  const { outHtml, navSearchPath } = await buildGithubPagesStaticSite({
    repoRoot,
    ...(pagesBuildCommitSha ? { pagesBuildCommitSha } : {}),
  });
  console.log(`Wrote ${outHtml}`);
  console.log(`Wrote ${navSearchPath}`);
  await writeE2eDualScrollFixture(repoRoot);
  await writeE2eMobileFlipEndFixture(repoRoot);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

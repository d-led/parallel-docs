#!/usr/bin/env bash
set -euo pipefail
# Builds workspace packages needed by `parallel-docs serve`, then runs it.
# This HTTP path is a developer/CLI convenience only; shipped sites use `_site/` on real hosts (e.g. GitHub Pages).
# By default `node scripts/serve-with-package-watch.mjs` also watches
# `packages/{core,render,code-parallel-docs-static,cli}/src` (plus render's
# esbuild script), rebuilds on change, and restarts `parallel-docs serve` so
# Node picks up new `dist/` output. You should not need to restart `serve`
# by hand: `parallel-docs serve` also rebuilds `_site/` on static-site changes
# while keeping the same HTTP listener. After a package-triggered restart,
# open tabs auto-reload via a small build-id poll (SSE livereload cannot span
# the process boundary). Set PARALLEL_DOCS_SERVE_NO_PACKAGE_WATCH=1
# to skip the package watcher (one-shot package builds only).
# Used by `npm run serve` and `npm run pages:serve` at the repo root.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ "${PARALLEL_DOCS_SERVE_NO_PACKAGE_WATCH:-}" = "1" ]; then
  npm run build -w @parallel-docs/core
  npm run build -w @parallel-docs/render
  npm run build -w @parallel-docs/code-parallel-docs-static
  npm run build -w parallel-docs
  exec node packages/cli/dist/cli.js serve "$@"
fi

exec node "$REPO_ROOT/scripts/serve-with-package-watch.mjs" "$@"

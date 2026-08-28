#!/usr/bin/env bash
set -euo pipefail

# One local run: slow CI lane (quality gate + integration + expensive Vitest),
# then VS Code extension tests, then Cypress E2E. Coverage stays separate:
# use `npm run test:coverage` / `test:coverage:all` when you need HTML/lcov.
#
# Usage:
#   bash scripts/test-all.sh
#   npm run test:all
#
# Environment:
#   PARALLEL_DOCS_SKIP_VSCODE=1   skip VS Code extension tests (no GUI / Electron)
#   PARALLEL_DOCS_SKIP_E2E=1      skip Cypress (no Chrome or faster iteration)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${FORCE_COLOR:=1}"
export FORCE_COLOR

echo "==> ci:full (quality gate + integration + expensive)" >&2
npm run ci:full

if [[ "${PARALLEL_DOCS_SKIP_VSCODE:-}" == "1" ]]; then
  echo "==> skip VS Code extension tests (PARALLEL_DOCS_SKIP_VSCODE=1)" >&2
else
  echo "==> VS Code extension tests" >&2
  bash scripts/test-vscode-extension.sh
fi

if [[ "${PARALLEL_DOCS_SKIP_E2E:-}" == "1" ]]; then
  echo "==> skip Cypress E2E (PARALLEL_DOCS_SKIP_E2E=1)" >&2
else
  echo "==> Cypress E2E (e2e:ci)" >&2
  npm run e2e:ci
fi

echo "==> test:all complete" >&2

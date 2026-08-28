#!/usr/bin/env bash
set -euo pipefail

# Run SideTrack VS Code extension integration tests (Microsoft-recommended
# @vscode/test-cli + Extension Development Host). Does not run Cypress or
# other repo test suites.
#
# Usage: bash scripts/test-vscode-extension.sh
#
# Optional: VSCODE_TEST_VERSION selects the VS Code build under test (passed
# through to packages/vscode/.vscode-test.mjs). Examples:
#   VSCODE_TEST_VERSION=stable bash scripts/test-vscode-extension.sh
#   VSCODE_TEST_VERSION=1.95.0 bash scripts/test-vscode-extension.sh
#
# Linux CI: install a virtual display (e.g. `xvfb`) so Electron can start; when
# `CI=true` and `xvfb-run` is available, this script uses it automatically.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

npm run build -w @sidetrack/core
npm run build -w @sidetrack/render
npm run build -w @sidetrack/code-sidetrack-static
npm run build -w @sidetrack/mcp-server
cd packages/vscode
npm run build

if [[ "${CI:-}" == "true" ]] && [[ "$(uname -s)" == "Linux" ]] && command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a npm run test:vscode
fi

exec npm run test:vscode

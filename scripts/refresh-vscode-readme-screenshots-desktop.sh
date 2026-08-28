#!/usr/bin/env bash
set -euo pipefail

# Regenerate **desktop VS Code** PNGs for the extension README companion
# (`.parallel-docs/source/packages/vscode/README.md/assets/vscode-*.png`).
#
# Implementation: `scripts/capture-vscode-readme-screenshots-desktop.mjs` (keyboard scenarios).
# Opens a **disposable copy** of `packages/vscode/fixtures/dogfood` with Angles enabled for stable
# “choose angle” frames (the git-tracked fixture stays flat for tests).
# How to change scenarios: see `.parallel-docs/source/packages/vscode/README.md/main.md` § Maintainer.
#
# Usage (repository root):
#   bash scripts/refresh-vscode-readme-screenshots-desktop.sh
#   npm run extension:vscode-readme-screenshots:desktop

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

exec env -u ELECTRON_RUN_AS_NODE node scripts/capture-vscode-readme-screenshots-desktop.mjs

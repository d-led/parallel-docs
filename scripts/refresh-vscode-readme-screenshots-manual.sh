#!/usr/bin/env bash
set -euo pipefail

# Manual capture only. For **automatic** desktop VS Code PNGs, use:
#   bash scripts/refresh-vscode-readme-screenshots-desktop.sh
#
# Opens Extension Development Host on the **monorepo root** so maintainers can
# capture PNGs for the extension README companion:
#   .parallel-docs/source/packages/vscode/README.md/assets/
# Walk-through + maintainer notes: .parallel-docs/source/packages/vscode/README.md/main.md
#
# Usage (repository root):
#   bash scripts/refresh-vscode-readme-screenshots-manual.sh
#   npm run extension:vscode-readme-screenshots

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"

EXT_DEV_PATH="$REPO_ROOT/packages/vscode"
ASSETS_DIR="$REPO_ROOT/.parallel-docs/source/packages/vscode/README.md/assets"

mkdir -p "$ASSETS_DIR"

echo "VS Code extension README — manual screenshot helper"
echo "---------------------------------------------------"
echo "1. A new window opens on this repo (extension loaded from source):"
echo "   $REPO_ROOT"
echo "2. Open packages/vscode/README.md, then Command Palette (>) → ParallelDocs →"
echo "   the flow you want to illustrate."
echo "3. Save PNGs under (names should match the walk-through in main.md):"
echo "   $ASSETS_DIR"
echo "   e.g. vscode-palette-parallel-docs.png, vscode-open-paired-beside.png, …"
echo "4. Ensure companion ./assets/ image lines in main.md match your filenames."
echo ""

editor_cli="$(parallel_docs_pick_editor_cli)"

set +e
"$editor_cli" --extensionDevelopmentPath="$EXT_DEV_PATH" "$REPO_ROOT"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "" >&2
  echo "If --extensionDevelopmentPath failed, try: npm run extension:dogfood:repo" >&2
  exit "$status"
fi

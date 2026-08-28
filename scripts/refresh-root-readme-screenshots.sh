#!/usr/bin/env bash
set -euo pipefail

# Open VS Code / Cursor with the ParallelDocs extension loaded from source
# (Extension Development Host) on the **dogfood** fixture so maintainers can
# capture real UI for the **top-level README** companion.
#
# There is no automated screenshot step: save PNG/SVG/WebP under:
#   .parallel-docs/source/README.md/assets/
# Reference from main.md as:  ./assets/your-file.png  (see docs/spec/storage.md).
#
# Usage (repository root):
#   bash scripts/refresh-root-readme-screenshots.sh
#   npm run extension:parallel-docs-screenshots
#
# For the VS Code **extension** README (monorepo root in EDH), use:
#   bash scripts/refresh-vscode-readme-screenshots-manual.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"

EXT_DEV_PATH="$REPO_ROOT/packages/vscode"
FIXTURE="$EXT_DEV_PATH/fixtures/dogfood"
ASSETS_DIR="$REPO_ROOT/.parallel-docs/source/README.md/assets"

mkdir -p "$ASSETS_DIR"

echo "ParallelDocs screenshot prep (root README companion)"
echo "---------------------------------------------------"
echo "1. This window will launch your editor in Extension Development Host on:"
echo "   $FIXTURE"
echo "2. Run ParallelDocs commands (e.g. open paired markdown), arrange the layout."
echo "3. Capture with your OS or editor screenshot tool."
echo "4. Save files into (already created if missing):"
echo "   $ASSETS_DIR"
echo "5. In main.md use:  ![…](./assets/<filename>)"
echo "   See docs/spec/storage.md § Images and other local assets."
echo ""

editor_cli="$(parallel_docs_pick_editor_cli)"

set +e
"$editor_cli" --extensionDevelopmentPath="$EXT_DEV_PATH" "$FIXTURE"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "" >&2
  echo "If --extensionDevelopmentPath failed, your editor build may not support it." >&2
  echo "Fallback: npm run extension:dogfood  then open paired panes manually." >&2
  exit "$status"
fi

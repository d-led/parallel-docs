#!/usr/bin/env bash
# Opens extension README screenshot PNGs in VS Code / Cursor (newest files first in tab order).
#
#   bash scripts/show-vscode-readme-screenshots.sh
#   npm run extension:vscode-readme-screenshots:show
#
# Assets live under `.parallel-docs/source/packages/vscode/README.md/assets/` (see
# `scripts/refresh-vscode-readme-screenshots-desktop.sh`). Honors PARALLEL_DOCS_EDITOR, else `cursor`,
# else `code` (same as scripts/lib/pick-editor-cli.sh).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"

ASSETS="$REPO_ROOT/.parallel-docs/source/packages/vscode/README.md/assets"

if [[ ! -d "$ASSETS" ]]; then
  echo "No assets directory at:" >&2
  echo "  $ASSETS" >&2
  echo "Generate screenshots first, e.g.:" >&2
  echo "  bash scripts/refresh-vscode-readme-screenshots-desktop.sh" >&2
  exit 1
fi

shopt -s nullglob
paths=("$ASSETS"/vscode-*.png)
shopt -u nullglob

if [[ ${#paths[@]} -eq 0 ]]; then
  echo "No vscode-*.png files under:" >&2
  echo "  $ASSETS" >&2
  echo "Generate screenshots first, e.g.:" >&2
  echo "  bash scripts/refresh-vscode-readme-screenshots-desktop.sh" >&2
  exit 1
fi

# Newest modification time first (so the first opened tab is the most recently written shot).
sorted=()
while IFS= read -r line; do
  [[ -n "$line" ]] && sorted+=("$line")
done < <(ls -t "${paths[@]}" 2>/dev/null)

if [[ ${#sorted[@]} -eq 0 ]]; then
  echo "Could not list screenshot files under: $ASSETS" >&2
  exit 1
fi

CLI="$(parallel_docs_pick_editor_cli)" || exit 1

echo "Opening ${#sorted[@]} screenshot(s) with: $CLI"
for f in "${sorted[@]}"; do
  echo "  $f"
done

exec "$CLI" "${sorted[@]}"

#!/usr/bin/env bash
set -euo pipefail

# “Dogfood” = install the extension from **this repo** (same path as
# `scripts/install-extension.sh`: build → .vsix → uninstall old id → install),
# then open a **new** editor window on the chosen folder.
#
# Usage:
#   bash scripts/editor-extension.sh dogfood              # fixture + install + open fixture
#   bash scripts/editor-extension.sh dogfood <path>       # install + open that folder
#
# From npm, pass the folder **after** `--` so npm forwards it to this script:
#   npm run extension:dogfood -- .
#   npm run extension:dogfood -- /path/to/project
#
# Convenience (opens this repo without `--`):
#   npm run extension:dogfood:repo
#
# Editor CLI: $PARALLEL_DOCS_EDITOR, else `cursor`, else `code`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"

DEFAULT_DOGFOOD_FOLDER="$REPO_ROOT/packages/vscode/fixtures/dogfood"

warn_if_folder_collides_with_main() {
  local target_abs="$1"
  if [[ "$target_abs" == "$REPO_ROOT" ]]; then
    echo "Opening repo root: reload the window if this workspace was already open." >&2
  fi
}

# Open folder in a fresh window when the CLI supports it; otherwise open normally.
parallel_docs_editor_open_folder_new_window() {
  local editor_cli="$1" target="$2"
  shift 2
  if "$editor_cli" -n "$target" "$@" 2>/dev/null; then
    return 0
  fi
  if "$editor_cli" --new-window "$target" "$@" 2>/dev/null; then
    return 0
  fi
  "$editor_cli" "$target" "$@" || true
}

cmd_dogfood() {
  local target
  if [[ "$#" -eq 0 ]]; then
    target="$DEFAULT_DOGFOOD_FOLDER"
  else
    target="$(cd "$1" && pwd)"
    shift
  fi

  warn_if_folder_collides_with_main "$target"

  echo "Dogfood: building, packaging, and installing ParallelDocs from this repo (same as install-extension.sh)..." >&2
  bash "$REPO_ROOT/scripts/install-extension.sh"

  local editor_cli
  editor_cli="$(parallel_docs_pick_editor_cli)"
  echo "Opening new editor window on: ${target}" >&2
  parallel_docs_editor_open_folder_new_window "$editor_cli" "$target" "$@"
  echo "Reload the window if this workspace was already open." >&2
}

case "${1:-}" in
  dogfood)
    shift
    cmd_dogfood "$@"
    ;;
  *)
    echo "Usage: $0 dogfood [folder]" >&2
    exit 2
    ;;
esac

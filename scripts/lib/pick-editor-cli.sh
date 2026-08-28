# shellcheck shell=bash
# Picks the editor CLI to use and echoes it on stdout.
#
#   $PARALLEL_DOCS_EDITOR is honored first (path or command name).
#   Otherwise prefer `cursor`, then fall back to `code`.
#
# Exits the sourcing script with a clear message if neither is available.
parallel_docs_pick_editor_cli() {
  if [[ -n "${PARALLEL_DOCS_EDITOR:-}" ]]; then
    echo "$PARALLEL_DOCS_EDITOR"
    return 0
  fi
  if command -v antigravity-ide >/dev/null 2>&1; then
    echo antigravity-ide
    return 0
  fi
  if [[ -n "${ANTIGRAVITY_EDITOR_APP_ROOT:-}" ]] && [[ -f "$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide" ]]; then
    echo "$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide"
    return 0
  fi
  if [[ -f "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" ]]; then
    echo "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"
    return 0
  fi
  if command -v cursor >/dev/null 2>&1; then
    echo cursor
    return 0
  fi
  if command -v code >/dev/null 2>&1; then
    echo code
    return 0
  fi
  echo "Could not find 'antigravity-ide', 'cursor' or 'code' on PATH. Install the editor's shell command, or set PARALLEL_DOCS_EDITOR." >&2
  return 1
}

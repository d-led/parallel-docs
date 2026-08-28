#!/usr/bin/env bash
set -euo pipefail

# Run SideTrack VS Code extension integration tests inside your current
# Antigravity IDE (or Cursor/VS Code if specified via SIDETRACK_EDITOR).
#
# Usage:
#   bash scripts/test-in-this-ide.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Resolve the path to the Antigravity IDE/editor application CLI
IDE_BIN=""
if [[ -n "${SIDETRACK_EDITOR:-}" ]]; then
  IDE_BIN="$SIDETRACK_EDITOR"
elif command -v antigravity-ide >/dev/null 2>&1; then
  IDE_BIN="$(which antigravity-ide)"
elif [[ -n "${ANTIGRAVITY_EDITOR_APP_ROOT:-}" ]] && [[ -f "$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide" ]]; then
  IDE_BIN="$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide"
elif [[ -f "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" ]]; then
  IDE_BIN="/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"
elif command -v cursor >/dev/null 2>&1; then
  IDE_BIN="$(which cursor)"
elif command -v code >/dev/null 2>&1; then
  IDE_BIN="$(which code)"
fi

if [[ -z "$IDE_BIN" ]]; then
  echo "Error: Could not find 'antigravity-ide', 'cursor', or 'code' on PATH." >&2
  exit 1
fi

# Resolve symlinks to find the absolute path of the binary
resolve_source() {
  local source="$1"
  while [[ -h "$source" ]]; do
    local dir
    dir="$(dirname "$source")"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  echo "$source"
}

REAL_BIN_PATH="$(resolve_source "$IDE_BIN")"

# On macOS, extract the path to the Electron executable inside the .app bundle.
# On other platforms, use the binary path directly.
if [[ "$REAL_BIN_PATH" == *".app/"* ]]; then
  APP_PATH="${REAL_BIN_PATH%%.app/*}.app"
  export VSCODE_TEST_PATH="$APP_PATH/Contents/MacOS/Electron"
else
  export VSCODE_TEST_PATH="$REAL_BIN_PATH"
fi

echo "==> Running VS Code integration tests using: $VSCODE_TEST_PATH"

# Build all dependencies to be sure we are running on fresh bundles
npm run build -w @sidetrack/core
npm run build -w @sidetrack/render
cd packages/vscode
npm run build

# Run the extension tests
exec npm run test:vscode

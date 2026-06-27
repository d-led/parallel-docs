#!/usr/bin/env bash
set -euo pipefail

# Build, package, and install the Commentray VS Code extension into the
# IDE that is currently running (the one whose integrated terminal we're in).
#
# Detects the running IDE through the environment it sets. Unlike
# scripts/install-extension.sh which targets all detected editors, this
# script targets only the active one — faster for dogfooding loops.
#
# Detection order for the running IDE:
#   1. $VSCODE_IPC_HOOK_CLI  — set by VS Code / Cursor integrated terminal
#   2. $ANTIGRAVITY_EDITOR_APP_ROOT — set by Antigravity
#   3. $COMMENTRAY_EDITOR     — user override (path or command name)
#   4. scripts/lib/pick-editor-cli.sh fallback
#
# Usage:
#   bash scripts/install-plugin-here.sh                  # build + install into running IDE
#   bash scripts/install-plugin-here.sh --package-only   # just produce the .vsix
#   bash scripts/install-plugin-here.sh --uninstall      # remove from running IDE
#
# Honors $COMMENTRAY_EDITOR (path or command) to override.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"
# shellcheck source=lib/commentray-vscode-ext.sh
source "$REPO_ROOT/scripts/lib/commentray-vscode-ext.sh"

EXT_DIR="$REPO_ROOT/packages/vscode"
EXT_ID="$COMMENTRAY_VSCODE_EXTENSION_ID"

# ---- detect running IDE ------------------------------------------------

detect_running_editor_cli() {
  # VS Code / Cursor integrated terminal sets VSCODE_IPC_HOOK_CLI.
  # It's a socket path like /run/user/1000/vscode-<hash>/1.95.0-main.sock
  # or /tmp/vscode-ipc-<hash>.sock. We extract the CLI binary from it:
  # the CLI lives alongside the socket or is named 'code'/'cursor' on PATH.
  if [[ -n "${VSCODE_IPC_HOOK_CLI:-}" ]]; then
    local sock_dir
    sock_dir="$(dirname "$VSCODE_IPC_HOOK_CLI")"

    # Cursor: the socket path usually contains "cursor" somewhere.
    if [[ "$VSCODE_IPC_HOOK_CLI" == *cursor* ]]; then
      if command -v cursor >/dev/null 2>&1; then
        echo "cursor"
        return 0
      fi
      # Fallback: try the bin directory next to the socket
      local cursor_bin="${sock_dir}/../../../bin/cursor"
      if [[ -x "$cursor_bin" ]]; then
        echo "$cursor_bin"
        return 0
      fi
    fi

    # VS Code: look for 'code' in the bin dir, or fall back to PATH.
    local code_bin="${sock_dir}/../../../bin/code"
    if [[ -x "$code_bin" ]]; then
      echo "$code_bin"
      return 0
    fi
    if command -v code >/dev/null 2>&1; then
      echo "code"
      return 0
    fi
  fi

  # Antigravity sets this env var.
  if [[ -n "${ANTIGRAVITY_EDITOR_APP_ROOT:-}" ]]; then
    local ag_bin="$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide"
    if [[ -x "$ag_bin" ]]; then
      echo "$ag_bin"
      return 0
    fi
  fi

  # Also check the standard Antigravity app path.
  if [[ -f "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" ]]; then
    echo "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"
    return 0
  fi

  # Fall back to the library detection (respects $COMMENTRAY_EDITOR).
  commentray_pick_editor_cli
}

# ---- main ---------------------------------------------------------------

mode="install"
case "${1:-}" in
  --package-only) mode="package" ;;
  --uninstall)    mode="uninstall" ;;
  "" )            mode="install" ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

editor_cli="$(detect_running_editor_cli)"
echo "Target editor: $editor_cli" >&2

if [[ "$mode" == "uninstall" ]]; then
  echo "Uninstalling $EXT_ID from $editor_cli..." >&2
  "$editor_cli" --uninstall-extension "$EXT_ID" >/dev/null 2>&1 || true
  echo "Done (no error if already absent)." >&2
  exit 0
fi

echo "Rendering Marketplace icon from canonical SVG..." >&2
bash "$REPO_ROOT/scripts/build-vscode-icon.sh"

echo "Cleaning extension dependency workspaces (fresh dist + TS incremental state)..." >&2
npm run clean -w @commentray/core -w @commentray/render -w commentray-vscode 2>/dev/null || true
rm -f \
  "$REPO_ROOT/packages/core"/tsconfig*.tsbuildinfo \
  "$REPO_ROOT/packages/render"/tsconfig*.tsbuildinfo \
  "$REPO_ROOT/packages/vscode"/tsconfig*.tsbuildinfo

echo "Building workspace packages the extension depends on, then bundling..." >&2
npm run build -w @commentray/core -w @commentray/render -w commentray-vscode

echo "Packaging extension..." >&2
pushd "$EXT_DIR" >/dev/null
npx vsce package --no-dependencies --out dist/commentray.vsix
popd >/dev/null

vsix="$EXT_DIR/dist/commentray.vsix"

if [[ "$mode" == "package" ]]; then
  echo "VSIX packaged: $vsix" >&2
  exit 0
fi

# Uninstall any previously installed copy first (avoids Marketplace vs local conflicts).
commentray_uninstall_packaged_commentray_if_present "$editor_cli"

echo "Installing $vsix into $editor_cli..." >&2
"$editor_cli" --install-extension "$vsix" --force

echo "Done. Commentray $(node -e "process.stdout.write(require('$EXT_DIR/package.json').version)") installed into $editor_cli." >&2

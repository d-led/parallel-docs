#!/usr/bin/env bash
set -euo pipefail

# Build, package, and install the SideTrack extension into your regular
# Cursor / VS Code (not the Extension Development Host). Workspace packages
# the extension depends on (@sidetrack/core, @sidetrack/render) are cleaned
# then rebuilt so local runs never reuse stale dist or .tsbuildinfo output.
# Before install, any existing `d-led.sidetrack-vscode` copy is uninstalled
# so Marketplace / old .vsix builds cannot linger beside the new package.
#
# Usage:
#   bash scripts/install-extension.sh                  # build + install into all detected editors
#   bash scripts/install-extension.sh --package-only   # just produce the .vsix
#   bash scripts/install-extension.sh --publish       # build, package, vsce publish (Marketplace)
#   bash scripts/install-extension.sh --uninstall      # remove from all detected editors
#
# Honors $SIDETRACK_EDITOR (path or command) to target one editor only.
# Otherwise installs/uninstalls in all detected CLIs among: `cursor`, `code`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/pick-editor-cli.sh
source "$REPO_ROOT/scripts/lib/pick-editor-cli.sh"
# shellcheck source=lib/sidetrack-vscode-ext.sh
source "$REPO_ROOT/scripts/lib/sidetrack-vscode-ext.sh"

EXT_DIR="$REPO_ROOT/packages/vscode"
EXT_ID="$SIDETRACK_VSCODE_EXTENSION_ID"

collect_editor_clis() {
  if [[ -n "${SIDETRACK_EDITOR:-}" ]]; then
    printf '%s\n' "$SIDETRACK_EDITOR"
    return 0
  fi

  local found=0
  if command -v antigravity-ide >/dev/null 2>&1; then
    echo antigravity-ide
    found=1
  elif [[ -n "${ANTIGRAVITY_EDITOR_APP_ROOT:-}" ]] && [[ -f "$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide" ]]; then
    echo "$ANTIGRAVITY_EDITOR_APP_ROOT/bin/antigravity-ide"
    found=1
  elif [[ -f "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" ]]; then
    echo "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"
    found=1
  fi

  if command -v cursor >/dev/null 2>&1; then
    echo cursor
    found=1
  fi
  if command -v code >/dev/null 2>&1; then
    echo code
    found=1
  fi
  if [[ "$found" -eq 0 ]]; then
    echo "Could not find 'antigravity-ide', 'cursor' or 'code' on PATH. Install the editor shell command, or set SIDETRACK_EDITOR." >&2
    return 1
  fi
}

ext_version() {
  node -e "process.stdout.write(require('$EXT_DIR/package.json').version)"
}

mode="install"
case "${1:-}" in
  --package-only) mode="package" ;;
  --publish) mode="publish" ;;
  --uninstall) mode="uninstall" ;;
  "" ) mode="install" ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

if [[ "$mode" == "uninstall" ]]; then
  editor_clis=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && editor_clis+=("$line")
  done < <(collect_editor_clis)
  for editor_cli in "${editor_clis[@]}"; do
    echo "Uninstalling $EXT_ID from $editor_cli..."
    "$editor_cli" --uninstall-extension "$EXT_ID" >/dev/null 2>&1 || true
  done
  echo "Done for: ${editor_clis[*]} (no error if already absent)." >&2
  exit 0
fi

echo "Rendering Marketplace icon from canonical SVG..."
bash "$REPO_ROOT/scripts/build-vscode-icon.sh"

echo "Cleaning extension dependency workspaces (fresh dist + TS incremental state)..."
npm run clean -w @sidetrack/core -w @sidetrack/render -w sidetrack-vscode
rm -f \
  "$REPO_ROOT/packages/core"/tsconfig*.tsbuildinfo \
  "$REPO_ROOT/packages/render"/tsconfig*.tsbuildinfo \
  "$REPO_ROOT/packages/vscode"/tsconfig*.tsbuildinfo

echo "Building workspace packages the extension depends on, then bundling..."
npm run build -w @sidetrack/core
npm run build -w @sidetrack/render
npm run build -w sidetrack-vscode

# `--no-dependencies` skips vsce's node_modules traversal: the bundle has
# no runtime deps, so the symlinked workspace package shouldn't be inspected.
version="$(ext_version)"
vsix_path="$EXT_DIR/dist/sidetrack-vscode-${version}.vsix"
echo "Packaging .vsix at $vsix_path..."
(cd "$EXT_DIR" && npx --yes @vscode/vsce@^3 package --no-dependencies --out "dist/sidetrack-vscode-${version}.vsix")

if [[ "$mode" == "package" ]]; then
  echo "Built $vsix_path (not installed)."
  exit 0
fi

if [[ "$mode" == "publish" ]]; then
  echo "Publishing to Visual Studio Marketplace: $vsix_path"
  npx --yes @vscode/vsce@^3 publish -i "$vsix_path"
  exit 0
fi

editor_clis=()
while IFS= read -r line; do
  [[ -n "$line" ]] && editor_clis+=("$line")
done < <(collect_editor_clis)
for editor_cli in "${editor_clis[@]}"; do
  sidetrack_uninstall_packaged_sidetrack_if_present "$editor_cli"
  echo "Installing into $editor_cli..."
  "$editor_cli" --install-extension "$vsix_path" --force
done
echo "Installed into: ${editor_clis[*]}"
echo "Reload each editor window (Cmd/Ctrl+Shift+P → 'Developer: Reload Window')."
echo "Uninstall later with: bash scripts/install-extension.sh --uninstall"

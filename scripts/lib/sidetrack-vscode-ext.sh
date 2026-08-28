# shellcheck shell=bash
# Shared id + uninstall helper for scripts that drive the Cursor / VS Code CLI.
#
# Must be sourced after `scripts/lib/pick-editor-cli.sh` when using
# `sidetrack_uninstall_packaged_sidetrack_if_present`.

SIDETRACK_VSCODE_EXTENSION_ID="d-led.sidetrack-vscode"

# Removes the **installed** (Marketplace or prior .vsix) SideTrack so it cannot
# shadow or duplicate the workspace under development / a new install.
# Ignores failure when the extension is not installed.
sidetrack_uninstall_packaged_sidetrack_if_present() {
  local editor_cli="${1:?sidetrack_uninstall_packaged_sidetrack_if_present: editor_cli required}"
  echo "Removing installed SideTrack ($SIDETRACK_VSCODE_EXTENSION_ID) if present (avoids Marketplace copy vs dogfood / reinstall)..." >&2
  "$editor_cli" --uninstall-extension "$SIDETRACK_VSCODE_EXTENSION_ID" >/dev/null 2>&1 || true
}

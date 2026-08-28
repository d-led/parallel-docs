# shellcheck shell=bash
# Shared id + uninstall helper for scripts that drive the Cursor / VS Code CLI.
#
# Must be sourced after `scripts/lib/pick-editor-cli.sh` when using
# `parallel_docs_uninstall_packaged_parallel_docs_if_present`.

PARALLEL_DOCS_VSCODE_EXTENSION_ID="d-led.parallel-docs-vscode"

# Removes the **installed** (Marketplace or prior .vsix) ParallelDocs so it cannot
# shadow or duplicate the workspace under development / a new install.
# Ignores failure when the extension is not installed.
parallel_docs_uninstall_packaged_parallel_docs_if_present() {
  local editor_cli="${1:?parallel_docs_uninstall_packaged_parallel_docs_if_present: editor_cli required}"
  echo "Removing installed ParallelDocs ($PARALLEL_DOCS_VSCODE_EXTENSION_ID) if present (avoids Marketplace copy vs dogfood / reinstall)..." >&2
  "$editor_cli" --uninstall-extension "$PARALLEL_DOCS_VSCODE_EXTENSION_ID" >/dev/null 2>&1 || true
}

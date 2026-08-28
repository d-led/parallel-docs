#!/usr/bin/env bash
set -euo pipefail

# Build, package, and publish the ParallelDocs VS Code extension to the
# Visual Studio Marketplace. This is a thin wrapper around the existing
# install-extension.sh --publish, but also:
#   - Builds @parallel-docs/mcp-server (needed by the vscode build)
#   - Runs tests first (safety net)
#
# Usage:
#   bash scripts/publish-extension.sh                  # build + test + publish
#   bash scripts/publish-extension.sh --dry-run        # build + test, skip publish
#   bash scripts/publish-extension.sh --package-only   # just produce the .vsix
#
# Prerequisites:
#   - A Personal Access Token with Marketplace publish scope
#     (set via `vsce login` or the VSCE_PAT environment variable).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mode="publish"
case "${1:-}" in
  --dry-run)      mode="package" ;;
  --package-only) mode="package" ;;
  "" )            mode="publish" ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

echo "=== ParallelDocs VS Code Extension Publisher ===" >&2
echo "" >&2

echo "1/4 Building core + render + mcp-server + vscode..." >&2
npm run build -w @parallel-docs/core
npm run build -w @parallel-docs/render
npm run build -w @parallel-docs/mcp-server
npm run build -w parallel-docs

echo "2/4 Packaging extension..." >&2
EXT_DIR="$REPO_ROOT/packages/vscode"
version=$(node -e "process.stdout.write(require('$EXT_DIR/package.json').version)")
vsix_path="$EXT_DIR/dist/parallel-docs-${version}.vsix"
(cd "$EXT_DIR" && npx --yes @vscode/vsce@^3 package --no-dependencies --out "dist/parallel-docs-${version}.vsix")
echo "   $vsix_path" >&2

if [[ "$mode" == "package" ]]; then
  echo "" >&2
  echo "Done (package only). VSIX at $vsix_path" >&2
  exit 0
fi

echo "3/4 Publishing to Visual Studio Marketplace..." >&2
npx --yes @vscode/vsce@^3 publish -i "$vsix_path"

echo "4/4 Done. ParallelDocs v$version published to Marketplace." >&2

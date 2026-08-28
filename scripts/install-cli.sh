#!/usr/bin/env bash
set -euo pipefail

# Install the ParallelDocs CLI globally by symlinking the local workspace
# build via `npm link`. Fastest path for local use and dogfooding:
# subsequent `npm run build -w @parallel-docs/cli` updates are picked up
# without reinstalling.
#
# For the published CLI without linking, use: npx parallel-docs …
# (npx parallel-docs --help → "Usage: parallel-docs [options] [command]").
#
# Usage:
#   bash scripts/install-cli.sh            # link
#   bash scripts/install-cli.sh --unlink   # remove the global symlink
#
# Needs npm's global bin directory on PATH. Print the prefix with:
#   npm config get prefix

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${1:-}" == "--unlink" ]]; then
  npm rm -g parallel-docs
  echo "Unlinked parallel-docs (global)."
  exit 0
fi

echo "Building @parallel-docs/core, @parallel-docs/render, @parallel-docs/cli..."
npm run build -w @parallel-docs/core
npm run build -w @parallel-docs/render
npm run build -w @parallel-docs/cli

chmod +x packages/cli/dist/cli.js

echo "Linking parallel-docs globally..."
(cd packages/cli && npm link)

if ! command -v parallel-docs >/dev/null 2>&1; then
  cat >&2 <<EOF
'parallel-docs' is not on PATH. Add npm's global bin directory:
  export PATH="\$(npm config get prefix)/bin:\$PATH"
Then rerun: parallel-docs --version
EOF
  exit 1
fi

bin_path="$(command -v parallel-docs)"
version="$(parallel-docs --version)"
echo "Installed: ${bin_path}  (${version})"
echo "Remove later with: bash scripts/install-cli.sh --unlink"

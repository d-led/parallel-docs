#!/usr/bin/env bash
set -euo pipefail

# Install the SideTrack CLI globally by symlinking the local workspace
# build via `npm link`. Fastest path for local use and dogfooding:
# subsequent `npm run build -w sidetrack` updates are picked up
# without reinstalling.
#
# For the published CLI without linking, use: npx sidetrack …
# (npx sidetrack --help → "Usage: sidetrack [options] [command]").
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
  npm rm -g sidetrack
  echo "Unlinked sidetrack (global)."
  exit 0
fi

echo "Building @sidetrack/core, @sidetrack/render, sidetrack..."
npm run build -w @sidetrack/core
npm run build -w @sidetrack/render
npm run build -w sidetrack

chmod +x packages/cli/dist/cli.js

echo "Linking sidetrack globally..."
(cd packages/cli && npm link)

if ! command -v sidetrack >/dev/null 2>&1; then
  cat >&2 <<EOF
'sidetrack' is not on PATH. Add npm's global bin directory:
  export PATH="\$(npm config get prefix)/bin:\$PATH"
Then rerun: sidetrack --version
EOF
  exit 1
fi

bin_path="$(command -v sidetrack)"
version="$(sidetrack --version)"
echo "Installed: ${bin_path}  (${version})"
echo "Remove later with: bash scripts/install-cli.sh --unlink"

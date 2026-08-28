#!/usr/bin/env bash
set -euo pipefail

# Isolated **desktop VS Code** screenshot run (same as
# `bash scripts/refresh-vscode-readme-screenshots-desktop.sh`), then copy `vscode-*.png`
# back into this repo:
# - Default: detached git worktree at HEAD (fast, no remote).
# - Optional SIDETRACK_SCREENSHOT_CLONE_URL: shallow clone from that URL.
#
# Usage (repo root):
#   bash scripts/sidetrack-screenshots-in-fresh-worktree.sh
#   npm run extension:vscode-readme-screenshots:desktop:fresh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DST="$REPO_ROOT/.sidetrack/source/packages/vscode/README.md/assets"
CLONE_URL="${SIDETRACK_SCREENSHOT_CLONE_URL:-}"

copy_pngs_back() {
  local src="$1"
  mkdir -p "$ASSETS_DST"
  local f
  for f in "$src"/vscode-*.png; do
    if [[ -e "$f" ]]; then
      cp -f "$f" "$ASSETS_DST/"
    fi
  done
  echo "Copied vscode-*.png into: $ASSETS_DST"
}

if [[ -n "$CLONE_URL" ]]; then
  WT_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/cr-screenshots-clone.XXXXXX")"
  WT="$WT_PARENT/sidetrack"
  trap 'rm -rf "$WT_PARENT"' EXIT
  git clone --depth 1 "$CLONE_URL" "$WT"
  cd "$WT"
  npm ci
  npx playwright install chromium
  bash scripts/refresh-vscode-readme-screenshots-desktop.sh
  copy_pngs_back "$WT/.sidetrack/source/packages/vscode/README.md/assets"
  exit 0
fi

WT_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/cr-screenshots-wt.XXXXXX")"
WT="$WT_PARENT/wt"
cleanup_wt() {
  git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || true
  rm -rf "$WT_PARENT"
}
trap cleanup_wt EXIT
git -C "$REPO_ROOT" worktree add --detach "$WT" HEAD
cd "$WT"
npm ci
npx playwright install chromium
bash scripts/refresh-vscode-readme-screenshots-desktop.sh
copy_pngs_back "$WT/.sidetrack/source/packages/vscode/README.md/assets"
trap - EXIT
cleanup_wt

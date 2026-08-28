#!/usr/bin/env bash
set -euo pipefail

# Publish every public ParallelDocs package to npm, in dependency order.
#
# Preconditions (checked):
#   - clean working tree
#   - HEAD is tagged v<version> where <version> matches packages/core/package.json
#   - workspace dep pins are in lockstep (bash scripts/sync-workspace-deps.sh --check)
#
# Does:
#   - npm ci           (reproducible install)
#   - npm run build    (all workspaces)
#   - unit tests       (scripts/test.sh)
#   - npm publish      for each public workspace
#
# Skips the private 'parallel-docs-vscode' package.
#
# After a successful publish, consumers can run the CLI with npx, e.g. npx parallel-docs
# --help (prints "Usage: parallel-docs [options] [command]") without a global npm install.
#
# Usage:
#   bash scripts/publish.sh                    # real publish to npm
#   bash scripts/publish.sh --dry-run          # npm publish --dry-run
#   bash scripts/publish.sh --otp=123456       # forward a 2FA one-time password
#   bash scripts/publish.sh --tag=next         # publish under a dist-tag (for RCs)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'
log_info()  { printf "%s[INFO]%s %s\n"  "$YELLOW" "$NC" "$1"; }
log_ok()    { printf "%s[OK]%s %s\n"    "$GREEN"  "$NC" "$1"; }
log_error() { printf "%s[ERROR]%s %s\n" "$RED"    "$NC" "$1" >&2; }

dry_run=false
otp_flag=""
tag_flag=""
for a in "$@"; do
  case "$a" in
    --dry-run) dry_run=true ;;
    --otp=*)   otp_flag="$a" ;;
    --tag=*)   tag_flag="$a" ;;
    *) log_error "Unknown flag: $a"; exit 2 ;;
  esac
done

# Public workspaces, in dependency order (core -> render -> static site -> cli;
# the CLI depends on @parallel-docs/code-parallel-docs-static).
PUBLIC_WORKSPACES=(
  "@parallel-docs/core"
  "@parallel-docs/render"
  "@parallel-docs/code-parallel-docs-static"
  "@parallel-docs/mcp-server"
  "@parallel-docs/cli"
)

version=$(node -e "process.stdout.write(require('./packages/core/package.json').version)")
expected_tag="v$version"
echo "Publishing ParallelDocs $version"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  log_error "Not inside a git repository."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  log_error "Uncommitted changes present. Commit or stash first."
  exit 1
fi

if ! git describe --exact-match --tags HEAD 2>/dev/null | grep -qx "$expected_tag"; then
  log_error "HEAD is not tagged $expected_tag. After committing the version bump, run: bash scripts/tag-version.sh"
  exit 1
fi

log_info "Checking intra-workspace dep pins..."
bash scripts/sync-workspace-deps.sh --check

log_info "Reproducible install (npm ci)..."
npm ci --no-audit --no-fund

log_info "Building all workspaces..."
npm run build

log_info "Running unit tests..."
bash scripts/test.sh

common_flags=(--access public)
[[ -n "$otp_flag" ]] && common_flags+=("$otp_flag")
[[ -n "$tag_flag" ]] && common_flags+=("$tag_flag")
[[ "$dry_run" == true ]] && common_flags+=(--dry-run)

for name in "${PUBLIC_WORKSPACES[@]}"; do
  log_info "npm publish $name ${common_flags[*]}"
  npm publish -w "$name" "${common_flags[@]}"
  log_ok "Published $name@$version${tag_flag:+ (${tag_flag#--tag=})}"
done

echo ""
if [[ "$dry_run" == true ]]; then
  log_ok "Dry run complete. No packages were actually published."
else
  log_ok "All public packages published at $version."
  echo ""
  echo "Release the VS Code extension separately:"
  echo "  npm run extension:package   # build the .vsix"
  echo "  # then upload to the Marketplace or GitHub Release as desired"
fi

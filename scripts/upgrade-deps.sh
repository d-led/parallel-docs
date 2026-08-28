#!/usr/bin/env bash
set -euo pipefail

# Upgrade third-party dependencies across every workspace + the monorepo
# root, then regenerate the lockfile and re-sync intra-monorepo pins.
#
# Delegates version resolution to `taze` (recursive mode). Intra-monorepo
# `@parallel-docs/*` deps are kept at their canonical version via
# `bash scripts/sync-workspace-deps.sh` — taze cannot know about those pins.
#
# Usage:
#   bash scripts/upgrade-deps.sh                    # mode: major (default)
#   bash scripts/upgrade-deps.sh minor
#   bash scripts/upgrade-deps.sh patch
#   bash scripts/upgrade-deps.sh latest             # taze's semver-latest rule
#   bash scripts/upgrade-deps.sh major --check      # preview only (no writes)
#   bash scripts/upgrade-deps.sh major --no-install # skip npm install afterwards
#
# After a real run, run the quality gate:
#   npm run quality:gate

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'
log_step() { printf "\n%s== %s ==%s\n" "$YELLOW" "$1" "$NC"; }
log_ok()   { printf "%s[OK]%s %s\n"    "$GREEN"  "$NC" "$1"; }

mode="major"
check=false
do_install=true

for a in "$@"; do
  case "$a" in
    major|minor|patch|latest|newest|next|default) mode="$a" ;;
    --check)       check=true ;;
    --no-install)  do_install=false ;;
    -h|--help) sed -n '3,20p' "$0"; exit 0 ;;
    *) echo "upgrade-deps.sh: unknown argument: $a" >&2; exit 2 ;;
  esac
done

log_step "Running taze (${mode}, recursive) across all workspaces"
# Exclude intra-monorepo packages: taze would try to fetch them from the
# public npm registry and emit spurious 404s. sync-workspace-deps.sh
# owns those pins.
#
# Also block typescript >= 6.1: typescript-eslint declares a peer range of
# `>=4.8.4 <6.1.0`, and taze in `major` mode would otherwise bump typescript
# to the `latest` dist-tag (7.x, the native compiler) and break resolution.
#
# Also pin @types/vscode: taze's VS Code addon syncs packages/vscode's
# `engines.vscode` up to the @types/vscode version, which silently raises the
# extension's minimum VS Code floor. The floor (^1.95.0) is intentional — see
# docs/development.md — and only moves via the documented bump checklist,
# never via deps:upgrade.
taze_exclude="@parallel-docs/*,parallel-docs,typescript@>=6.1,@types/vscode"
taze_args=("$mode" --recursive --include-locked --force --exclude "$taze_exclude")
if [[ "$check" == true ]]; then
  echo "(check mode — no files will be modified)"
else
  taze_args+=(--write)
fi
npx --yes taze@latest "${taze_args[@]}"

if [[ "$check" == true ]]; then
  log_ok "Check complete. Nothing was modified."
  exit 0
fi

log_step "Re-pinning intra-monorepo @parallel-docs/* deps"
bash scripts/sync-workspace-deps.sh

if [[ "$do_install" == true ]]; then
  log_step "Reinstalling (regenerates package-lock.json)"
  npm install --no-audit --no-fund
else
  log_step "npm install skipped (--no-install)"
  echo "Run 'npm install' manually to regenerate the lockfile."
fi

echo ""
log_ok "Dependencies upgraded."
echo ""
echo "Next steps:"
echo "  1. Review diff:   git diff --stat"
echo "  2. Run gate:      npm run quality:gate"
echo "  3. Commit:        git add -A && git commit -m \"Upgrade dependencies (${mode})\""

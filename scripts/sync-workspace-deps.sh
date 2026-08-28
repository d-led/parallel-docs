#!/usr/bin/env bash
set -euo pipefail

# Bash entrypoint for intra-monorepo @sidetrack/* pin sync. Delegates to
# scripts/sync-workspace-deps.mjs (same flags, e.g. --check).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

exec node scripts/sync-workspace-deps.mjs "$@"

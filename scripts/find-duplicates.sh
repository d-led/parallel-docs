#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Duplicate detection for first-party TS/JS (jscpd). Line/token based—tune
# -l / -k together. Fails when duplication exceeds 1% of total lines
# (--threshold 1) so CI stays at zero findings.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# jscpd keeps one -i value: single comma-separated ignore list.
JSCPD_IGNORE="**/node_modules/**,**/dist/**,**/coverage/**,**/.cache/**,**/.git/**,**/.vscode-test/**,packages/code-parallel-docs-static/site/**,*.vsix,.yarn/**"

exec ./node_modules/.bin/jscpd . \
  --pattern "**/*.{ts,tsx,mjs,cjs,js}" \
  --ignore "${JSCPD_IGNORE}" \
  --min-lines 10 \
  --min-tokens 70 \
  --mode strict \
  --threshold 1 \
  --no-tips

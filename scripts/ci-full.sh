#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
bash scripts/quality-gate.sh
SIDETRACK_TEST_MODE=integration npm run test
SIDETRACK_TEST_MODE=expensive npm run test

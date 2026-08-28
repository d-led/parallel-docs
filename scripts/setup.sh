#!/usr/bin/env bash
set -euo pipefail

# One-shot setup for a fresh checkout of ParallelDocs:
#   1. install npm dependencies
#   2. build all workspaces
#   3. initialize .parallel-docs/ storage + default .parallel-docs.toml
#   4. run `parallel-docs doctor` as a health check
#
# Idempotent — safe to rerun.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== Installing dependencies =="
npm install

echo "== Building all workspaces =="
npm run build

echo "== Initializing ParallelDocs workspace =="
npm run parallel-docs -- init

echo "== Running parallel-docs doctor =="
npm run parallel-docs -- doctor

#!/usr/bin/env bash
set -euo pipefail

# One-shot setup for a fresh checkout of SideTrack:
#   1. install npm dependencies
#   2. build all workspaces
#   3. initialize .sidetrack/ storage + default .sidetrack.toml
#   4. run `sidetrack doctor` as a health check
#
# Idempotent — safe to rerun.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== Installing dependencies =="
npm install

echo "== Building all workspaces =="
npm run build

echo "== Initializing SideTrack workspace =="
npm run sidetrack -- init

echo "== Running sidetrack doctor =="
npm run sidetrack -- doctor

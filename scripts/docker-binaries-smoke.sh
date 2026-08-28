#!/usr/bin/env bash
set -euo pipefail

# Reproduce the GitHub Actions "binaries" workflow locally using Docker (handy on Apple Silicon).
# Mimics Ubuntu: Node 22, npm ci, SEA binary build, smoke test, and VSIX packaging prerequisites.
#
# Usage (from repo root):
#   bash scripts/docker-binaries-smoke.sh
#
# Optional: force platform (default matches host arch when available):
#   PARALLEL_DOCS_DOCKER_PLATFORM=linux/amd64 bash scripts/docker-binaries-smoke.sh
#
# This bind-mounts the repo; `npm ci` inside the container overwrites host `node_modules/`
# with Linux packages (e.g. esbuild native binary). After a run, restore the host tree:
#   npm ci

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM="${PARALLEL_DOCS_DOCKER_PLATFORM:-}"

if [[ -z "${PLATFORM}" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) PLATFORM="linux/arm64" ;;
    *) PLATFORM="linux/amd64" ;;
  esac
fi

echo "Using Docker platform: ${PLATFORM}" >&2

docker run --rm \
  --platform "${PLATFORM}" \
  -v "${REPO_ROOT}:/w" \
  -w /w \
  node:22-bookworm \
  bash -lc '
    set -euo pipefail
    apt-get update -qq
    apt-get install -y -qq librsvg2-bin >/dev/null
    npm ci
    npm run build:bundle -w parallel-docs
    node scripts/build-binary.mjs
    node scripts/smoke-binary.mjs
    npm run extension:package
    echo "docker-binaries-smoke: OK"
  '

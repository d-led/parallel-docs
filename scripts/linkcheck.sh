#!/usr/bin/env bash
set -euo pipefail

# Check all internal links on a served Commentray static site using lychee.
# Installs lychee if not already present (brew or cargo).
# For CI, prefer the lycheeverse/lychee-action GitHub Action directly.
#
# Usage:
#   bash scripts/linkcheck.sh                          # check http://127.0.0.1:14173
#   bash scripts/linkcheck.sh http://127.0.0.1:4173    # custom base URL

BASE_URL="${1:-http://127.0.0.1:14173}"

# ── Ensure lychee is available ──────────────────────────────────────────

ensure_lychee() {
  if command -v lychee &>/dev/null; then
    return 0
  fi

  echo "[linkcheck] lychee not found — installing…" >&2

  if command -v brew &>/dev/null; then
    brew install lychee
  elif command -v cargo &>/dev/null; then
    cargo install lychee
  else
    echo "[linkcheck] ERROR: install lychee first: brew install lychee (macOS) or cargo install lychee (with Rust)." >&2
    exit 1
  fi
}

ensure_lychee

# ── Run lychee ───────────────────────────────────────────────────────────

echo "[linkcheck] Checking internal links on ${BASE_URL}…" >&2

# Point lychee at the root page; it crawls internal links from there.
# The --include filter keeps it on the same origin.
lychee \
  --base-url "$BASE_URL" \
  --format detailed \
  --no-progress \
  --max-concurrency 16 \
  --require-https=false \
  --accept 200,301,302 \
  --include "$BASE_URL" \
  --include-mail=false \
  "$BASE_URL/"

echo "[linkcheck] OK — all internal links resolve." >&2

#!/usr/bin/env bash
set -euo pipefail

# Check all internal links on a served Commentray static site using lychee.
# Installs lychee if not already present (brew, cargo, or direct binary).
#
# Usage:
#   bash scripts/linkcheck.sh                          # check http://127.0.0.1:14173
#   bash scripts/linkcheck.sh http://127.0.0.1:4173    # custom base URL
#
# CI integration: runs after Cypress e2e tests against the same static server
# to catch broken internal links before merge.

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
  elif command -v rustup &>/dev/null; then
    rustup run stable cargo install lychee
  else
    # Direct binary download (Linux x86_64 / macOS aarch64)
    local arch
    arch="$(uname -m)"
    local os
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    if [[ "$os" == "darwin" ]] && [[ "$arch" == "arm64" ]]; then
      arch="aarch64"
      os="apple-darwin"
    elif [[ "$os" == "linux" ]] && [[ "$arch" == "x86_64" ]]; then
      arch="x86_64"
      os="unknown-linux-gnu"
    else
      echo "[linkcheck] ERROR: unsupported platform ($os/$arch). Install lychee manually." >&2
      exit 1
    fi

    local version="0.24.2"
    local tarball="lychee-v${version}-${arch}-${os}.tar.gz"
    local url="https://github.com/lycheeverse/lychee/releases/download/v${version}/${tarball}"

    echo "[linkcheck] downloading lychee from ${url}…" >&2
    if command -v curl &>/dev/null; then
      curl -fsSL "$url" -o "/tmp/${tarball}"
    elif command -v wget &>/dev/null; then
      wget -q "$url" -O "/tmp/${tarball}"
    else
      echo "[linkcheck] ERROR: neither curl nor wget found. Install lychee manually." >&2
      exit 1
    fi
    tar -xzf "/tmp/${tarball}" -C /tmp
    chmod +x /tmp/lychee
    local install_dir="${HOME}/.local/bin"
    mkdir -p "$install_dir"
    mv /tmp/lychee "$install_dir/lychee"
    rm -f "/tmp/${tarball}"
    export PATH="${install_dir}:${PATH}"
    echo "[linkcheck] installed lychee to ${install_dir}/lychee" >&2
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

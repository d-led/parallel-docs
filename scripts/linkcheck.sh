#!/usr/bin/env bash
set -euo pipefail

# Check all internal links in the built ParallelDocs static site using lychee.
# Checks ALL HTML files under _site/ with --root-dir for relative link resolution.
# Installs lychee if not already present (brew on macOS, cargo with Rust, or binary download).
#
# Usage:
#   bash scripts/linkcheck.sh                          # check _site/ against local files
#   bash scripts/linkcheck.sh --serve http://127.0.0.1:4173  # check via HTTP server

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$REPO_ROOT/_site"

# ── Ensure lychee is available ──────────────────────────────────────────

ensure_lychee() {
  if command -v lychee &>/dev/null; then
    return 0
  fi

  echo "[linkcheck] lychee not found — installing…" >&2

  if command -v brew &>/dev/null; then
    brew install lychee
    return 0
  fi

  if command -v cargo &>/dev/null; then
    cargo install lychee
    return 0
  fi

  # Direct binary download — matches lychee-action v2 naming convention
  local version="0.24.2"
  local arch os target_arch
  arch="$(uname -m)"
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"

  case "$os-$arch" in
    linux-x86_64)  target_arch="x86_64-unknown-linux-gnu" ;;
    linux-aarch64) target_arch="aarch64-unknown-linux-gnu" ;;
    darwin-x86_64) target_arch="x86_64-apple-darwin" ;;
    darwin-arm64)  target_arch="aarch64-apple-darwin" ;;
    *)
      echo "[linkcheck] ERROR: unsupported platform ($os/$arch). Install lychee via brew or cargo." >&2
      exit 1
      ;;
  esac

  local tarball="lychee-${target_arch}.tar.gz"
  local url="https://github.com/lycheeverse/lychee/releases/download/lychee-v${version}/${tarball}"

  echo "[linkcheck] downloading lychee from ${url}…" >&2
  curl -fsSL "$url" -o "/tmp/${tarball}"
  tar -xzf "/tmp/${tarball}" -C /tmp
  chmod +x /tmp/lychee
  local install_dir="${HOME}/.local/bin"
  mkdir -p "$install_dir"
  mv /tmp/lychee "$install_dir/lychee"
  rm -f "/tmp/${tarball}"
  export PATH="${install_dir}:${PATH}"
  echo "[linkcheck] installed lychee to ${install_dir}/lychee" >&2
}

ensure_lychee

# ── Run lychee ───────────────────────────────────────────────────────────

echo "[linkcheck] Checking internal links across all _site/ HTML files…" >&2

# Check ALL HTML files under _site/ with --root-dir so relative links
# (./browse/…, ../…) resolve correctly against the local file tree.
# Exclude external domains (github.com, npmjs.com) — those are validated
# separately by scripts/validate-pages-github-links.mjs.
lychee \
  --root-dir "$SITE_DIR" \
  --format detailed \
  --no-progress \
  --max-concurrency 16 \
  --require-https=false \
  --accept 200,301,302 \
  --include-mail=false \
  --exclude '^https?://' \
  --exclude '^mailto:' \
  "$SITE_DIR"/**/*.html

echo "[linkcheck] OK — all internal links resolve." >&2

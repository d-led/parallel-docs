#!/usr/bin/env bash
set -euo pipefail

# Rebuild logo artifacts from the hand-authored SVG master:
#   docs/logos/2.svg  →  docs/logos/2.png          (flat raster PNG)
#   docs/logos/2.png  →  docs/logos/2.jpg          (raster JPEG reference)
#   docs/logos/2.svg  →  packages/vscode/icon.png  (VSIX / marketplace icon)
#
# Requires: rsvg-convert (librsvg), ImageMagick (`magick`).
#
# Usage (from repo root):
#   bash scripts/refresh-logo-assets.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SVG="$REPO_ROOT/docs/logos/2.svg"
PNG="$REPO_ROOT/docs/logos/2.png"
JPG="$REPO_ROOT/docs/logos/2.jpg"

if [[ ! -f "$SVG" ]]; then
  echo "Missing master SVG: $SVG" >&2
  exit 1
fi

echo "==> Raster PNG: $SVG -> $PNG"
rsvg-convert --width 1024 --height 1024 --keep-aspect-ratio \
  --output "$PNG" \
  "$SVG"

echo "==> Raster JPEG: $PNG -> $JPG"
magick "$PNG" -background "#13203b" -flatten "$JPG"

echo "==> VS Code icon: $SVG -> packages/vscode/icon.png"
bash "$REPO_ROOT/scripts/build-vscode-icon.sh"

echo "Done. Updated: $PNG , $JPG , packages/vscode/icon.png"

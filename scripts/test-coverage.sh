#!/usr/bin/env bash
set -euo pipefail

# Run Vitest with V8 coverage and open the HTML report for developers.
#
# Environment:
#   SIDETRACK_COVERAGE_MODE=unit|all   (default: unit — fast; "all" includes integration tests)
#   SIDETRACK_COVERAGE_OPEN=0        skip opening a browser after the run
#   SIDETRACK_COVERAGE_OPEN=1        open coverage/index.html (default)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mode="${SIDETRACK_COVERAGE_MODE:-unit}"
open_report="${SIDETRACK_COVERAGE_OPEN:-1}"

case "$mode" in
  unit)
    npx vitest run --coverage -c vitest.config.ts
    ;;
  all)
    npx vitest run --coverage -c vitest.coverage.config.ts
    ;;
  *)
    echo "Unknown SIDETRACK_COVERAGE_MODE=$mode (use unit|all)" >&2
    exit 1
    ;;
esac

html_path="$REPO_ROOT/coverage/index.html"
if [[ "$open_report" == "1" && -f "$html_path" ]]; then
  echo "Coverage HTML: file://$html_path" >&2
  case "$(uname -s)" in
    Darwin)
      open "$html_path"
      ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$html_path" >/dev/null 2>&1 || true
      else
        echo "Install xdg-open or open the file:// URL above." >&2
      fi
      ;;
    CYGWIN* | MINGW* | MSYS*)
      if command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe /c start "" "$html_path" >/dev/null 2>&1 || true
      else
        echo "Open the file:// URL above in a browser." >&2
      fi
      ;;
    *)
      echo "Open the file:// URL above in a browser." >&2
      ;;
  esac
fi

#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."

BASE_URL="${1:-https://d-led.github.io/sidetrack/}"
SPEC_GLOB="${2:-cypress/e2e/{accessibility.cy.ts,static-pages.cy.ts,static-site-mobile.cy.ts}}"
shift || true

printf "%s\n" "Running Cypress against GitHub Pages at: $BASE_URL"
printf "%s\n" "Specs: $SPEC_GLOB"

npx cypress run --e2e --browser chrome --config "baseUrl=$BASE_URL" --spec "$SPEC_GLOB" "$@"

import { defineConfig } from "cypress";

/** Keep in sync with `scripts/e2e-static-serve.mjs` (override with `PARALLEL_DOCS_E2E_PORT`). */
const parallelDocsE2ePort = (process.env.PARALLEL_DOCS_E2E_PORT ?? "14173").trim();

export default defineConfig({
  reporter: "mocha-junit-reporter",
  reporterOptions: {
    mochaFile: "test-results/junit-[hash].xml",
  },
  video: true,
  videoCompression: true,
  env: {
    CI: `${process.env.CYPRESS_CI}` === "true",
  },
  e2e: {
    /** Matches wide dual-pane specs: keeps `matchMedia('(max-width: 767px)')` false and toolbar chrome visible. */
    viewportWidth: 1280,
    viewportHeight: 900,
    baseUrl: `http://127.0.0.1:${parallelDocsE2ePort}`,
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    excludeSpecPattern: "**/screenshot*.cy.ts",
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      on("before:browser:launch", (browser, launchOptions) => {
        // Chrome on Linux (GitHub Actions / typical CI): typical CI flags. Omit on macOS/Windows
        // where they can break Cypress’s own launch / smoke-test flow.
        if (
          process.platform === "linux" &&
          browser.family === "chromium" &&
          browser.name !== "electron"
        ) {
          launchOptions.args.push("--no-sandbox");
          launchOptions.args.push("--disable-dev-shm-usage");
        }
        return launchOptions;
      });
      return config;
    },
  },
});

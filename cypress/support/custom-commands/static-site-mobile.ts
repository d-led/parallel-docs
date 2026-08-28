import { shellA11y } from "../shell-a11y";

/** Matches `code-browser.ts` / client `DUAL_MOBILE_SINGLE_PANE_MQ` (dual panes from 768px up). */
const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 844;
const WIDE_MODE_INTRO_STORAGE_KEY = "sidetrack.codeSideTrackStatic.wideModeIntro.v1";

function assertStretchCellVisibility(selector: string, shouldBeHidden: boolean): void {
  cy.get(selector)
    .first()
    .should(($td) => {
      const style = getComputedStyle($td[0]);
      const hidden = style.display === "none" || style.visibility === "hidden";
      expect(hidden).to.eq(shouldBeHidden);
    });
}

function assertStretchMobileSinglePane(codeHidden: boolean, docHidden: boolean): void {
  assertStretchCellVisibility("#code-pane tbody tr.stretch-row--block td.stretch-code", codeHidden);
  assertStretchCellVisibility("#code-pane tbody tr.stretch-row--block td.stretch-doc", docHidden);
}

Cypress.Commands.add("PrepareStaticSiteHomeAtMobileViewport", () => {
  cy.clearLocalStorage();
  cy.viewport(MOBILE_VIEWPORT_WIDTH, MOBILE_VIEWPORT_HEIGHT);
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
    },
  });
});

Cypress.Commands.add("PrepareStaticSiteHomeAtMobileViewportWithSourcePaneActive", () => {
  cy.clearLocalStorage();
  cy.viewport(MOBILE_VIEWPORT_WIDTH, MOBILE_VIEWPORT_HEIGHT);
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
      win.localStorage.setItem("sidetrack.codeSideTrackStatic.dualMobilePane", "code");
    },
  });
});

Cypress.Commands.add("MobileStaticSiteCodeBrowserChromeShouldBeReady", () => {
  cy.get(shellA11y.shell).should("exist").and("have.attr", "data-layout");
  cy.get(shellA11y.shell).then(($shell) => {
    const layout = $shell.attr("data-layout");
    expect(layout === "dual" || layout === "stretch").to.eq(true);
    cy.wrap($shell).should("have.attr", "data-dual-mobile-pane");
    cy.get(shellA11y.mobilePaneFlip).should("be.visible");
    if (layout === "dual") {
      cy.get(shellA11y.resizeSplitter).should("not.be.visible");
    } else {
      cy.get("#stretch-gutter").should("not.be.visible");
    }
    cy.get(shellA11y.search.region).within(() => {
      cy.get('input[type="search"]').should("be.visible");
    });
    cy.get(shellA11y.banner).should("be.visible");
    cy.get(shellA11y.contentinfo).should("be.visible");
  });
});

Cypress.Commands.add("MobileSinglePaneLayoutShouldShowSideTrackColumnOnly", () => {
  cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "doc");
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      assertStretchMobileSinglePane(true, false);
      return;
    }
    cy.get(shellA11y.panes.source).should("not.be.visible");
    cy.get(shellA11y.panes.sidetrack).should("be.visible");
  });
});

Cypress.Commands.add("MobileSinglePaneLayoutShouldShowSourceColumnOnly", () => {
  cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      assertStretchMobileSinglePane(false, true);
      return;
    }
    cy.get(shellA11y.panes.source).should("be.visible");
    cy.get(shellA11y.panes.sidetrack).should("not.be.visible");
  });
});

Cypress.Commands.add("TapMobilePaneFlipControl", () => {
  cy.get("body").then(($body) => {
    const alt = $body.find(shellA11y.mobilePaneFlipScroll)[0];
    if (alt instanceof HTMLButtonElement && alt.classList.contains("is-visible")) {
      cy.wrap(alt).click();
      return;
    }
    cy.get(shellA11y.mobilePaneFlip).click();
  });
});

Cypress.Commands.add("MobileViewportShouldHaveScrollableDocument", (minPixels = 80) => {
  cy.window().then((win) => {
    const root = win.document.scrollingElement ?? win.document.documentElement;
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    expect(maxScroll, "mobile document should be taller than viewport").to.be.gt(minPixels);
  });
});

Cypress.Commands.add("ScrollMobileDocumentToFraction", (fraction: number) => {
  cy.window().then((win) => {
    const root = win.document.scrollingElement ?? win.document.documentElement;
    const clamped = Math.min(1, Math.max(0, fraction));
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = Math.floor(maxScroll * clamped);
    win.dispatchEvent(new Event("scroll"));
    root.dispatchEvent(new Event("scroll"));
  });
  cy.AwaitDualPaneScrollSyncFlush();
});

Cypress.Commands.add("MobileDocumentScrollYShouldExceed", (pixels: number) => {
  cy.window().its("scrollY").should("be.gt", pixels);
});

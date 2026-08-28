import { shellA11y } from "../shell-a11y";

/** Matches `code-browser.ts` / client narrow single-pane breakpoint. */
const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 844;
const WIDE_MODE_INTRO_STORAGE_KEY = "sidetrack.codeSideTrackStatic.wideModeIntro.v1";
const MOBILE_TAIL_MARKER = "E2E_MOBILE_FLIP_TAIL_LBL";

/** Visit `/` at the narrow mobile breakpoint with wide-mode intro dismissed; shell must be dual + mobile flip chrome. */
Cypress.Commands.add("PrepareStaticSiteHomeForMobileFlipTailCheck", () => {
  cy.clearLocalStorage();
  cy.viewport(MOBILE_VIEWPORT_WIDTH, MOBILE_VIEWPORT_HEIGHT);
  cy.visit("/__e2e__/mobile-flip-end/index.html", {
    onBeforeLoad(win) {
      win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
    },
  });
  cy.get(shellA11y.shell).should("exist").and("have.attr", "data-layout", "dual");
  cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane");
  cy.get(shellA11y.mobilePaneFlip).should("be.visible");
  cy.get(shellA11y.mobilePaneFlipScroll).should("exist").and("not.have.class", "is-visible");
});

/** Narrow mobile uses document scrolling; drive `scrollTop` and emit `scroll` so flip-scroll `tick()` runs. */
Cypress.Commands.add("ScrollMobileDocumentToBottomAndFlush", () => {
  cy.scrollTo("bottom", { ensureScrollable: false });
  cy.window().then((win) => {
    const root = win.document.scrollingElement ?? win.document.documentElement;
    root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    win.dispatchEvent(new Event("scroll"));
    root.dispatchEvent(new Event("scroll"));
    win.dispatchEvent(new Event("resize"));
  });
  cy.AwaitDualPaneScrollSyncFlush();
});

Cypress.Commands.add("SecondaryMobileFlipShouldBeVisibleAndPrimaryShouldBeOffscreen", () => {
  cy.get(shellA11y.mobilePaneFlipScroll, { timeout: 12000 })
    .should("be.visible")
    .and("have.class", "is-visible");
  cy.get(shellA11y.mobilePaneFlip).should(($btn) => {
    expect(
      $btn[0].getBoundingClientRect().bottom,
      "toolbar flip should sit above the viewport",
    ).to.be.lt(12);
  });
});

Cypress.Commands.add("MobilePaneShouldShowTailFixtureSourceText", () => {
  cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
  cy.get(shellA11y.panes.source).should("contain.text", "const v100 = 100");
});

Cypress.Commands.add("MobilePaneShouldShowTailFlipMarkerText", () => {
  cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "doc");
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.contains(shellA11y.panes.sidetrack, MOBILE_TAIL_MARKER).should("be.visible");
      return;
    }
    cy.contains(shellA11y.docPaneBody, MOBILE_TAIL_MARKER).should("be.visible");
  });
});

import { shellA11y } from "../support/shell-a11y";

const WIDE_MODE_INTRO_STORAGE_KEY = "parallel-docs.codeParallelDocsStatic.wideModeIntro.v1";

function visitNarrowHomeWithWideIntroDismissed(): void {
  cy.viewport(390, 844);
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
    },
  });
}

/** Page-break + mobile flip tests apply only to the dual-pane shell. */
function whenNarrowHomeDualLayout(dualOnly: () => void): void {
  visitNarrowHomeWithWideIntroDismissed();
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") !== "dual") {
      return;
    }
    dualOnly();
  });
}

function readCodeViewOffset(): Cypress.Chainable<number> {
  return cy.window().then((win) => {
    const rootTop = Number(win.scrollY);
    return cy
      .get("#code-pane")
      .invoke("scrollTop")
      .then((paneTop) => Math.max(rootTop, Number(paneTop)));
  });
}

describe("Narrow rendered-markdown sync with page breaks", () => {
  it("keeps narrow pane flips stable after deep doc scrolling across page-break gaps", () => {
    whenNarrowHomeDualLayout(() => {
      cy.get(shellA11y.shell)
        .should("have.attr", "data-source-pane-mode", "rendered-markdown")
        .and("have.attr", "data-dual-mobile-pane", "doc");
      cy.get(`${shellA11y.docPaneBody} .parallel-docs-page-break`).should(
        "have.length.at.least",
        1,
      );

      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "doc");
      cy.get(shellA11y.docPaneBody).then(($body) => {
        const body = $body[0];
        body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
        const bodyTop = body.scrollTop;
        cy.window().then((win) => {
          win.scrollTo(0, Number.MAX_SAFE_INTEGER);
          const windowTop = win.scrollY;
          expect(bodyTop > 40 || windowTop > 40).to.eq(true);
        });
      });
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell)
        .should("have.attr", "data-dual-mobile-pane", "code")
        .and("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get(shellA11y.panes.source).should("be.visible");
      readCodeViewOffset().then((offset) => {
        expect(offset).to.be.at.least(0);
      });
    });
  });

  it("keeps source pane in rendered markdown mode after narrow pane flips", () => {
    whenNarrowHomeDualLayout(() => {
      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell)
        .should("have.attr", "data-dual-mobile-pane", "code")
        .and("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell)
        .should("have.attr", "data-dual-mobile-pane", "doc")
        .and("have.attr", "data-source-pane-mode", "rendered-markdown");
    });
  });
});

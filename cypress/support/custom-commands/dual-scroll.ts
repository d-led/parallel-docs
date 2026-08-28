import { shellA11y } from "../shell-a11y";

/** Layout must expose real vertical overflow before scroll-sync assertions (fonts, Mermaid affect heights). */
const PANE_MIN_OVERFLOW_PX = 80;

/** Dual-pane sync coalesces driver `scroll` to the next animation frame(s); wait before asserting partner `scrollTop`. */
Cypress.Commands.add("AwaitDualPaneScrollSyncFlush", () => {
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
});

function scrollElementToMaximumTwice(el: HTMLElement) {
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  el.dispatchEvent(new Event("scroll", { bubbles: true }));
  return new Cypress.Promise((resolve: () => void) => {
    requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
      resolve();
    });
  });
}

/** Short viewport so the shipped README home exposes scrollable dual panes for scroll-sync tests. */
Cypress.Commands.add("ApplyDualPaneScrollTestViewport", () => {
  cy.viewport(1280, 480);
});

Cypress.Commands.add("CurrentPageShouldDisplayDualPaneCodeBrowserChrome", () => {
  cy.get(shellA11y.panes.source).should("be.visible");
  cy.get(shellA11y.panes.sidetrack).should("be.visible");
  cy.get(shellA11y.resizeSplitter).should("be.visible");
});

Cypress.Commands.add("DocumentationPairStripShouldMentionReadmeSourceFile", () => {
  cy.get(shellA11y.documentationPairLandmark)
    .invoke("text")
    .then((text) => {
      const t = text.trim();
      expect(t.length, "pair strip text should be non-empty").to.be.greaterThan(0);
      expect(t, "pair strip should include a source filename").to.match(/\.[a-z0-9]+/i);
    });
});

Cypress.Commands.add("ResizeSplitterGutterShouldExposeConnectorPaths", () => {
  cy.get(`${shellA11y.resizeSplitter} .gutter__rays`, { timeout: 15000 }).should("be.visible");
  cy.get(`${shellA11y.resizeSplitter} svg path`).should("have.length.at.least", 4);
});

function stretchShellScrollEl(options?: {
  timeout?: number;
}): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.get(`${shellA11y.shell}.shell--stretch-rows`, options);
}

Cypress.Commands.add("ScrollCodePaneToMaximum", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      stretchShellScrollEl().should(($pane) => {
        const el = $pane[0];
        const overflow = el.scrollHeight - el.clientHeight;
        expect(overflow, "stretch shell vertical overflow").to.be.greaterThan(PANE_MIN_OVERFLOW_PX);
      });
      stretchShellScrollEl().then(($pane) => {
        const el = $pane[0];
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      });
    } else {
      cy.get("#code-pane").should(($pane) => {
        const el = $pane[0];
        const overflow = el.scrollHeight - el.clientHeight;
        expect(overflow, "code pane vertical overflow").to.be.greaterThan(PANE_MIN_OVERFLOW_PX);
      });
      cy.get("#code-pane").then(($pane) => {
        return scrollElementToMaximumTwice($pane[0]);
      });
    }
  });
  cy.AwaitDualPaneScrollSyncFlush();
});

Cypress.Commands.add("ScrollDocPaneBodyToMaximum", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      stretchShellScrollEl().should(($body) => {
        const el = $body[0];
        const overflow = el.scrollHeight - el.clientHeight;
        expect(overflow, "stretch shell vertical overflow").to.be.greaterThan(PANE_MIN_OVERFLOW_PX);
      });
      stretchShellScrollEl().then(($body) => {
        const el = $body[0];
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      });
    } else {
      cy.get(shellA11y.docPaneBody).should(($body) => {
        const el = $body[0];
        const overflow = el.scrollHeight - el.clientHeight;
        expect(overflow, "doc pane body vertical overflow").to.be.greaterThan(PANE_MIN_OVERFLOW_PX);
      });
      cy.get(shellA11y.docPaneBody).then(($body) => {
        return scrollElementToMaximumTwice($body[0]);
      });
    }
  });
  cy.AwaitDualPaneScrollSyncFlush();
});

Cypress.Commands.add("DocPaneBodyScrollTopShouldExceed", (pixels) => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      stretchShellScrollEl({ timeout: 15000 }).invoke("scrollTop").should("be.gt", pixels);
    } else {
      cy.get(shellA11y.docPaneBody, { timeout: 15000 }).invoke("scrollTop").should("be.gt", pixels);
    }
  });
});

Cypress.Commands.add("CodePaneScrollTopShouldExceed", (pixels) => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      stretchShellScrollEl({ timeout: 15000 }).invoke("scrollTop").should("be.gt", pixels);
    } else {
      cy.get("#code-pane", { timeout: 15000 }).invoke("scrollTop").should("be.gt", pixels);
    }
  });
});

Cypress.Commands.add("CodeAndDocPanesScrollTopShouldBeZero", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      stretchShellScrollEl().invoke("scrollTop").should("eq", 0);
      cy.get("#code-pane").invoke("scrollTop").should("eq", 0);
    } else {
      cy.get(shellA11y.docPaneBody).invoke("scrollTop").should("eq", 0);
      cy.get("#code-pane").invoke("scrollTop").should("eq", 0);
    }
  });
});

Cypress.Commands.add("CurrentPageShouldDisplayMainLandmarkAndSkipLink", () => {
  cy.get(shellA11y.main).should("exist");
  cy.get(shellA11y.skipToMainLink).should("exist");
});

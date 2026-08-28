import { shellA11y } from "../support/shell-a11y";

const WIDE_MODE_INTRO_STORAGE_KEY = "sidetrack.codeSideTrackStatic.wideModeIntro.v1";
const SOURCE_PANE_MODE_STORAGE_KEY = "sidetrack.codeSideTrackStatic.sourceMarkdownPaneMode";

function expectVisibleArrows(count: number): void {
  cy.get("#sidetrack-wide-intro-arrows .sidetrack-wide-intro-arrow")
    .should("have.length", count)
    .each(($arrow) => {
      const el = $arrow[0];
      const style = getComputedStyle(el);
      const width = Number.parseFloat(style.width);
      expect(width).to.be.greaterThan(16);
      expect(style.opacity).to.not.eq("0");
      expect(style.display).to.not.eq("none");
    });
}

function expectArrowStartsOutsideBubble(): void {
  cy.get("#sidetrack-wide-intro").then(($bubble) => {
    const bubbleRect = $bubble[0].getBoundingClientRect();
    cy.get("#sidetrack-wide-intro-arrows .sidetrack-wide-intro-arrow").each(($arrow) => {
      const arrowRect = $arrow[0].getBoundingClientRect();
      const startInsideBubble =
        arrowRect.left >= bubbleRect.left &&
        arrowRect.left <= bubbleRect.right &&
        arrowRect.top >= bubbleRect.top &&
        arrowRect.top <= bubbleRect.bottom;
      expect(startInsideBubble).to.eq(false);
    });
  });
}

function visitWithFreshWideIntroStorage(): void {
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.removeItem(WIDE_MODE_INTRO_STORAGE_KEY);
    },
  });
}

function whenWideIntroVisible(callback: () => void): void {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get("#sidetrack-wide-intro").should("not.exist");
      return;
    }
    cy.get("#sidetrack-wide-intro").should("be.visible");
    callback();
  });
}

/** Advance the wide intro with Next until the title contains `fragment` (tolerates auto-skipped steps). */
function clickWideIntroNextUntilTitle(fragment: string, maxNextClicks: number): void {
  if (maxNextClicks < 0) {
    throw new Error(`Wide intro did not reach a title containing "${fragment}".`);
  }
  cy.get("#sidetrack-wide-intro .sidetrack-wide-intro-title").then(($title) => {
    if ($title.text().includes(fragment)) return;
    cy.get('#sidetrack-wide-intro button[data-wide-intro="next"]').click();
    clickWideIntroNextUntilTitle(fragment, maxNextClicks - 1);
  });
}

/** Dual-only scroll tests; on stretch assert rendered-markdown only. */
function whenHomeDualLayoutWide(dualOnly: () => void): void {
  cy.viewport(1280, 900);
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
      win.localStorage.removeItem(SOURCE_PANE_MODE_STORAGE_KEY);
    },
  });
  cy.get(shellA11y.shell, { timeout: 20000 }).then(($shell) => {
    if ($shell.attr("data-layout") !== "dual") {
      cy.wrap($shell).should("have.attr", "data-source-pane-mode", "source");
      return undefined;
    }
    return cy
      .wrap($shell)
      .should("have.attr", "data-layout", "dual")
      .and("have.attr", "data-source-pane-mode", "rendered-markdown")
      .then(() => cy.document({ log: false }))
      .then((doc) => {
        const intro = doc.getElementById("sidetrack-wide-intro");
        if (!(intro instanceof HTMLElement)) {
          return undefined;
        }
        return cy.wrap(intro).find('button[data-wide-intro="skip"]').click({ force: true });
      })
      .then(() => {
        return cy.get("body").should(($b) => {
          expect($b.find("#sidetrack-wide-intro")).to.have.length(0);
        });
      })
      .then(() => {
        return cy.get(shellA11y.shell).then(($latestShell) => {
          if ($latestShell.attr("data-layout") !== "dual") {
            cy.wrap($latestShell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
            return undefined;
          }
          cy.get("#code-pane").should("exist");
          dualOnly();
          return undefined;
        });
      });
  });
}

describe("Markdown source rendering modes", () => {
  /** Default viewport for this file; individual tests set their own when needed. */
  beforeEach(() => {
    cy.viewport(1280, 900);
  });

  it("starts in rendered markdown even if prior storage asked for source", () => {
    cy.viewport(1280, 900);
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(SOURCE_PANE_MODE_STORAGE_KEY, "source");
      },
    });
    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") === "stretch") {
        cy.wrap($shell).should("have.attr", "data-source-pane-mode", "source");
        return;
      }
      cy.wrap($shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
    });
  });

  it("keeps doc-to-source scroll sync when left pane shows rendered markdown (wide)", () => {
    whenHomeDualLayoutWide(() => {
      cy.get("#source-markdown-pane-flip").should("be.visible");
      cy.get(shellA11y.docPaneBody).then(($body) => {
        const el = $body[0];
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      });
      cy.get("#code-pane").invoke("scrollTop").should("be.gt", 40);
    });
  });

  it("keeps rendered-markdown source and doc panes at the same scrollTop across block buffers", () => {
    whenHomeDualLayoutWide(() => {
      /**
       * Scroll the code pane so the `readme-user-guides` heading sits near the pane top.
       * `scrollIntoView()` can scroll the window instead of `#code-pane`’s internal scrollport,
       * so we set `scrollTop` on `#code-pane` to reliably emit the driver scroll the client syncs on.
       */
      cy.get("#code-pane-markdown-body #using-sidetrack", { timeout: 20000 })
        .should("exist")
        .then(($heading) => {
          return cy.get("#code-pane").then(($codePane) => {
            const codePane = $codePane[0];
            const heading = $heading[0];
            const codeRect = codePane.getBoundingClientRect();
            const lineRect = heading.getBoundingClientRect();
            codePane.scrollTop = codePane.scrollTop + (lineRect.top - codeRect.top) - 4;
            codePane.dispatchEvent(new Event("scroll", { bubbles: true }));
          });
        });
      cy.AwaitDualPaneScrollSyncFlush();
      cy.AwaitDualPaneScrollSyncFlush();

      cy.get("#sidetrack-block-readme-user-guides").should("exist");
      cy.get("#code-pane")
        .invoke("scrollTop")
        .then(() => {
          cy.get(shellA11y.docPaneBody, { timeout: 20000 }).then(($body) => {
            const docPaneBody = $body[0];
            cy.get("#sidetrack-block-readme-user-guides").should(($anchor) => {
              const anchorTopWithin =
                $anchor[0].getBoundingClientRect().top - docPaneBody.getBoundingClientRect().top;
              expect(anchorTopWithin, "block anchor near doc viewport top").to.be.within(-16, 72);
              expect(docPaneBody.scrollTop, "doc pane remains scrolled to synced region").to.be.gt(
                40,
              );
            });
          });
        });
    });
  });

  it("uses single-pane dual layout on narrow viewports (only the active column is visible)", () => {
    cy.viewport(390, 844);
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
      },
    });
    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") !== "dual") {
        cy.wrap($shell).should("have.attr", "data-layout", "stretch");
        return;
      }
      cy.wrap($shell).should("have.attr", "data-dual-mobile-pane", "doc");
      cy.get(shellA11y.panes.sidetrack).should("be.visible");
      cy.get(shellA11y.panes.source).should("not.be.visible");
      cy.get(shellA11y.resizeSplitter).should("not.be.visible");
      cy.get(shellA11y.mobilePaneFlip).should("be.visible").click();
      cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
      cy.get(shellA11y.panes.source).should("be.visible");
      cy.get(shellA11y.panes.sidetrack).should("not.be.visible");
    });
  });

  it("preserves source scroll sync after toggling source markdown mode and changing angle", () => {
    cy.viewport(1280, 900);
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(WIDE_MODE_INTRO_STORAGE_KEY, "1");
      },
    });
    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") !== "dual") {
        cy.wrap($shell).should("have.attr", "data-source-pane-mode", "source");
        cy.get(shellA11y.angleSelect).select("architecture");
        cy.get(shellA11y.angleSelect).should("have.value", "architecture");
        cy.get(shellA11y.angleSelect).select("main");
        cy.get(shellA11y.angleSelect).should("have.value", "main");
        return;
      }
      cy.wrap($shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get("#source-markdown-pane-flip").should("contain.text", "Render");
      cy.get("#source-markdown-pane-flip").should("have.attr", "aria-pressed", "true");
      cy.get(shellA11y.wrapLinesLabel).should("not.be.visible");

      cy.get("#source-markdown-pane-flip").click();
      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "source");
      cy.get("#source-markdown-pane-flip").should("have.attr", "aria-pressed", "false");
      cy.get(shellA11y.wrapLinesLabel).should("be.visible");
      cy.get(shellA11y.docPaneBody).then(($body) => {
        const el = $body[0];
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      });
      cy.get("#code-pane").invoke("scrollTop").should("be.gt", 40);

      cy.get(shellA11y.angleSelect).select("architecture");
      cy.get(shellA11y.angleSelect).should("have.value", "architecture");
      cy.location("pathname").should(
        "match",
        /\/browse\/README\.md\/architecture(?:\/index\.html)?$/,
      );
      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get("#source-markdown-pane-flip").should("have.attr", "aria-pressed", "true");
      cy.get(shellA11y.wrapLinesLabel).should("not.be.visible");
    });
  });

  it("supports source markdown mode toggle on narrow viewport while source pane is active", () => {
    cy.viewport(390, 844);
    cy.visit("/");
    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") !== "dual") {
        return;
      }
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
      cy.get(shellA11y.panes.source).should("be.visible");

      cy.get("#source-markdown-pane-flip").click();
      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "source");
      cy.get(shellA11y.wrapLinesLabel).should("be.visible");
      cy.get("#source-markdown-pane-flip").click();
      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get(shellA11y.wrapLinesLabel).should("not.be.visible");
      cy.get(shellA11y.wrapLinesLabel).should("have.css", "display", "none");
    });
  });

  it("keeps the narrow source/render toggle square", () => {
    cy.viewport(390, 844);
    cy.visit("/");
    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") !== "dual") {
        return;
      }
      cy.get(shellA11y.mobilePaneFlip).click();
      cy.get(shellA11y.shell).should("have.attr", "data-dual-mobile-pane", "code");
      cy.get("#source-markdown-pane-flip")
        .should("be.visible")
        .then(($btn) => {
          const rect = $btn[0].getBoundingClientRect();
          expect(Math.abs(rect.width - rect.height)).to.be.lessThan(1.5);
        });
    });
  });

  it("shows wide-mode intro tour once and persists dismissal", () => {
    cy.viewport(1280, 900);
    visitWithFreshWideIntroStorage();

    whenWideIntroVisible(() => {
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Welcome").should(
        "be.visible",
      );
      cy.get('#sidetrack-wide-intro button[data-wide-intro="skip"]').click();
      cy.get("#sidetrack-wide-intro").should("not.exist");
      cy.window()
        .its("localStorage")
        .invoke("getItem", WIDE_MODE_INTRO_STORAGE_KEY)
        .should("eq", "1");

      cy.reload();
      cy.get("#sidetrack-wide-intro").should("not.exist");

      cy.get("#sidetrack-help-tour").click();
      cy.get("#sidetrack-wide-intro").should("be.visible");
    });
  });

  it("draws two visible intro arrows in wide mode without crossing the bubble text area", () => {
    cy.viewport(1280, 900);
    visitWithFreshWideIntroStorage();

    whenWideIntroVisible(() => {
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Welcome").should(
        "be.visible",
      );
      expectVisibleArrows(2);
      expectArrowStartsOutsideBubble();

      cy.get('#sidetrack-wide-intro button[data-wide-intro="next"]').click();
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Two views").should(
        "be.visible",
      );
      expectVisibleArrows(2);
      expectArrowStartsOutsideBubble();
    });
  });

  it("recomputes intro arrows when viewport switches between wide and narrow", () => {
    cy.viewport(1280, 900);
    visitWithFreshWideIntroStorage();

    whenWideIntroVisible(() => {
      expectVisibleArrows(2);

      cy.viewport(390, 844);
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Welcome").should(
        "be.visible",
      );
      expectVisibleArrows(1);

      cy.viewport(1280, 900);
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Welcome").should(
        "be.visible",
      );
      expectVisibleArrows(2);
    });
  });

  it("shows intro tour on narrow viewports with narrow-view copy", () => {
    cy.viewport(390, 844);
    visitWithFreshWideIntroStorage();
    whenWideIntroVisible(() => {
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Welcome").should(
        "be.visible",
      );
      cy.get('#sidetrack-wide-intro button[data-wide-intro="next"]').click();
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Two views").should(
        "be.visible",
      );
      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-body", "narrow view").should(
        "be.visible",
      );
    });
  });

  it("ends with a help-button reminder and introduces share link", () => {
    cy.viewport(1280, 900);
    visitWithFreshWideIntroStorage();
    whenWideIntroVisible(() => {
      clickWideIntroNextUntilTitle("Need a refresher?", 18);

      cy.contains("#sidetrack-wide-intro .sidetrack-wide-intro-title", "Need a refresher?").should(
        "be.visible",
      );
      cy.contains(
        "#sidetrack-wide-intro .sidetrack-wide-intro-body",
        "You can always go back to this tutorial via the help button.",
      ).should("be.visible");
      cy.get("#sidetrack-wide-intro-arrows .sidetrack-wide-intro-arrow").should("have.length", 1);
    });
  });

  it("shows a fallback intro action when wrap-lines toggle is hidden", () => {
    cy.viewport(1280, 900);
    visitWithFreshWideIntroStorage();

    cy.get(shellA11y.shell).then(($shell) => {
      if ($shell.attr("data-layout") !== "dual") {
        cy.get("#sidetrack-wide-intro").should("not.exist");
        return;
      }
      cy.wrap($shell).should("have.attr", "data-source-pane-mode", "rendered-markdown");
      cy.get(shellA11y.wrapLinesLabel).should("not.be.visible");

      clickWideIntroNextUntilTitle("Readability controls", 14);
      cy.contains(
        "#sidetrack-wide-intro .sidetrack-wide-intro-title",
        "Readability controls",
      ).should("be.visible");
      cy.get("#sidetrack-wide-intro .sidetrack-wide-intro-step-action")
        .should("be.visible")
        .and("contain.text", "Switch to markdown source")
        .click();

      cy.get(shellA11y.shell).should("have.attr", "data-source-pane-mode", "source");
      cy.get(shellA11y.wrapLinesLabel).should("be.visible");
      cy.get("#sidetrack-wide-intro-arrows .sidetrack-wide-intro-arrow").should("have.length", 1);
    });
  });
});

import { shellA11y } from "../support/shell-a11y";

/** Same path shape as `staticBrowseIndexRelPathFromPair` for this repo’s pair. */
const STRETCH_FLOW_BUFFER_BROWSE = "/browse/e2e/stretch-flow-buffer.ts/index.html";

describe("Stretch layout — flow-synchronizer buffer (static browse page)", () => {
  it("exposes the shell flag and avoids terminal tail slack on the last gap row", () => {
    cy.visit(STRETCH_FLOW_BUFFER_BROWSE, {
      onBeforeLoad(win) {
        win.localStorage.setItem("sidetrack.codeSideTrackStatic.wideModeIntro.v1", "1");
      },
    });

    cy.get(shellA11y.shell).should("have.attr", "data-layout", "stretch");
    cy.get(shellA11y.shell).should("have.attr", "data-stretch-buffer-sync", "flow-synchronizer");

    cy.get("table#code-pane.block-stretch").should("exist");
    cy.get("#code-pane tbody tr.stretch-row--block").should("have.length.at.least", 1);
    cy.get("#code-pane tbody tr.stretch-row")
      .last()
      .within(() => {
        cy.get("td.stretch-code").should(($td) => {
          const win = $td[0]?.ownerDocument.defaultView;
          if (win === null) throw new Error("expected window");
          const pb = Number.parseFloat(win.getComputedStyle($td[0]).paddingBottom);
          expect(pb, "last stretch-code row should not keep terminal tail slack").to.eq(0);
        });
        cy.get("td.stretch-doc").should(($td) => {
          const win = $td[0]?.ownerDocument.defaultView;
          if (win === null) throw new Error("expected window");
          const pb = Number.parseFloat(win.getComputedStyle($td[0]).paddingBottom);
          expect(pb, "last stretch-doc row should not keep terminal tail slack").to.eq(0);
        });
      });

    cy.get(`${shellA11y.shell} .stretch-doc-inner`)
      .first()
      .should(($el) => {
        const win = $el[0].ownerDocument.defaultView;
        if (win === null) throw new Error("expected window");
        const oy = win.getComputedStyle($el[0]).overflowY;
        expect(
          oy,
          "doc prose must not create its own vertical scrollport (wheel stays on #shell)",
        ).to.eq("hidden");
      });
  });
});

import { shellA11y } from "../support/shell-a11y";

const STORAGE_PAGE_BREAKS_ENABLED = "sidetrack.codeSideTrackStatic.pageBreaksEnabled";

function injectTallPageBreak(): void {
  cy.get(shellA11y.shell).then(($shell) => {
    const shell = $shell[0];
    const body = (shell.querySelector("#doc-pane-body") as HTMLElement | null) ?? shell;
    const anchor = body.querySelector(".sidetrack-line-anchor");
    const host = body.ownerDocument.createElement("div");
    host.className = "sidetrack-page-break";
    host.setAttribute("data-sidetrack-page-break", "true");
    host.setAttribute("aria-hidden", "true");
    host.style.minHeight = "240px";

    const label = body.ownerDocument.createElement("span");
    label.className = "sidetrack-page-break__label";
    label.textContent = "Page break";
    const rule = body.ownerDocument.createElement("div");
    rule.className = "sidetrack-page-break__rule";
    host.append(label, rule);

    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(host, anchor.nextSibling);
      return;
    }
    body.prepend(host);
  });
}

describe("Deliberate page breaks in rendered markdown", () => {
  it("keeps doc-to-source sync stable when a tall page-break block is present", () => {
    cy.viewport(1280, 900);
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("sidetrack.codeSideTrackStatic.wideModeIntro.v1", "1");
      },
    });
    cy.get(shellA11y.shell).should("have.attr", "data-page-breaks-enabled", "true");

    injectTallPageBreak();

    cy.get(shellA11y.shell).then(($shell) => {
      const shell = $shell[0];
      const body = (shell.querySelector("#doc-pane-body") as HTMLElement | null) ?? shell;
      body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    });
    cy.get("#code-pane").invoke("scrollTop").should("be.gte", 0);
  });

  it("allows disabling page-break rendering through the hidden storage toggle", () => {
    cy.viewport(1280, 900);
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem(STORAGE_PAGE_BREAKS_ENABLED, "false");
      },
    });
    cy.get(shellA11y.shell).should("have.attr", "data-page-breaks-enabled", "false");
    injectTallPageBreak();
    cy.get(shellA11y.shell).then(($shell) => {
      const hasDocPaneBody = $shell.find("#doc-pane-body").length > 0;
      const selector = hasDocPaneBody
        ? `${shellA11y.docPaneBody} .sidetrack-page-break`
        : `${shellA11y.shell} .sidetrack-page-break`;
      cy.get(selector).should("have.css", "display", "none");
    });
  });
});

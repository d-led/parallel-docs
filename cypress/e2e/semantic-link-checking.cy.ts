describe("Semantic link checking and permalink verification", () => {
  function currentPageSupportsScrollAnchors(): Cypress.Chainable<boolean> {
    return cy.document().then((doc) => {
      return (
        doc.querySelectorAll(".parallel-docs-block-anchor, [id^='parallel-docs-md-line-']").length >
        0
      );
    });
  }

  function gatherScrollAnchorCandidateHrefs(): Cypress.Chainable<string[]> {
    return cy.document().then((doc) => {
      const hrefs = new Set<string>();
      const shell = doc.querySelector(".shell");
      const pairBrowseHref =
        shell?.getAttribute("data-parallel-docs-pair-browse-href")?.trim() ?? "";
      if (pairBrowseHref.length > 0 && pairBrowseHref.startsWith("/")) {
        hrefs.add(pairBrowseHref);
      }

      for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = link.getAttribute("href")?.trim() ?? "";
        if (!href) continue;
        if (
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("data:") ||
          href.startsWith("javascript:")
        ) {
          continue;
        }
        if (href.startsWith("/") && !href.startsWith("//")) {
          hrefs.add(href);
        }
      }

      const candidates = Array.from(hrefs).filter(
        (href) =>
          href.includes("/browse/") || href.includes("/__e2e__/") || href.includes("/README.md/"),
      );
      if (candidates.length > 0) {
        return candidates;
      }
      return ["/__e2e__/dual-scroll-sync/index.html"];
    });
  }

  function visitFirstAnchorCapablePage(candidates: string[], index = 0): Cypress.Chainable<void> {
    if (index >= candidates.length) {
      throw new Error(
        "Could not find an anchor-capable page to verify permalink scroll preservation",
      );
    }

    const candidate = candidates[index];
    return cy
      .visit(candidate, {
        onBeforeLoad(win) {
          win.localStorage.setItem("parallel-docs.codeParallelDocsStatic.wideModeIntro.v1", "1");
        },
      })
      .then(() => currentPageSupportsScrollAnchors())
      .then((hasAnchors) => {
        if (hasAnchors) {
          return;
        }
        return visitFirstAnchorCapablePage(candidates, index + 1);
      });
  }

  beforeEach(() => {
    cy.GoToStaticSiteHome();
  });

  it("checks if in-page same-origin/relative links point to valid locations", () => {
    const localLinks = new Set<string>();

    cy.get("a, img, link, script")
      .each(($el) => {
        const href = $el.attr("href");
        const src = $el.attr("src");

        for (const attr of [href, src]) {
          if (attr) {
            const trimmed = attr.trim();
            if (
              trimmed !== "" &&
              !trimmed.startsWith("#") &&
              !trimmed.startsWith("mailto:") &&
              !trimmed.startsWith("tel:") &&
              !trimmed.startsWith("data:") &&
              !trimmed.startsWith("javascript:")
            ) {
              if (/^https?:\/\//i.test(trimmed)) {
                const baseUrl = Cypress.config("baseUrl");
                if (baseUrl && trimmed.startsWith(baseUrl)) {
                  localLinks.add(trimmed);
                }
              } else {
                localLinks.add(trimmed);
              }
            }
          }
        }
      })
      .then(() => {
        localLinks.forEach((link) => {
          cy.request({
            url: link,
            failOnStatusCode: true,
          })
            .its("status")
            .should("eq", 200);
        });
      });
  });

  it("verifies the shareable permalink copying functionality and destination correctness", () => {
    cy.window().then((win) => {
      if (!win.navigator.clipboard) {
        Object.defineProperty(win.navigator, "clipboard", {
          value: {
            writeText: () => Promise.resolve(),
          },
          writable: true,
          configurable: true,
        });
      }
      cy.stub(win.navigator.clipboard, "writeText").as("clipboardWrite");
    });

    cy.get("#parallel-docs-share-link").click();

    cy.get<Cypress.SinonStub>("@clipboardWrite").should("have.been.calledOnce");
    cy.get<Cypress.SinonStub>("@clipboardWrite").then((stub) => {
      const copiedUrl = stub.firstCall.args[0];
      expect(copiedUrl).to.be.a("string");
      expect(copiedUrl).to.not.equal("");
      cy.visit(copiedUrl);
      cy.CurrentPageShouldDisplayCodeBrowserShell();
    });
  });

  it("verifies that the copied permalink changes according to selected angle", () => {
    cy.ChooseValueOfAngleSelect("architecture");
    cy.DisplayedValueOfAngleSelectShouldBe("architecture");

    cy.window().then((win) => {
      if (!win.navigator.clipboard) {
        Object.defineProperty(win.navigator, "clipboard", {
          value: {
            writeText: () => Promise.resolve(),
          },
          writable: true,
          configurable: true,
        });
      }
      cy.stub(win.navigator.clipboard, "writeText").as("clipboardWriteArch");
    });

    cy.get("#parallel-docs-share-link").click();

    cy.get<Cypress.SinonStub>("@clipboardWriteArch").should("have.been.calledOnce");
    cy.get<Cypress.SinonStub>("@clipboardWriteArch").then((stub) => {
      const copiedUrl = stub.firstCall.args[0];
      expect(copiedUrl).to.contain("/architecture/");

      cy.request(copiedUrl).its("status").should("eq", 200);

      cy.visit(copiedUrl);
      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.DisplayedValueOfAngleSelectShouldBe("architecture");
      cy.ParallelDocsPaneShouldContainText("architecture angle");
    });
  });

  it("verifies that the copied permalink preserves vertical scroll position hash", () => {
    cy.ApplyDualPaneScrollTestViewport();
    cy.CurrentPageShouldDisplayCodeBrowserShell();

    currentPageSupportsScrollAnchors().then((hasAnchors) => {
      if (!hasAnchors) {
        return gatherScrollAnchorCandidateHrefs().then((candidates) =>
          visitFirstAnchorCapablePage(candidates),
        );
      }
    });

    cy.CurrentPageShouldDisplayCodeBrowserShell();
    cy.ScrollDocPaneBodyToMaximum();

    cy.window().then((win) => {
      if (!win.navigator.clipboard) {
        Object.defineProperty(win.navigator, "clipboard", {
          value: {
            writeText: () => Promise.resolve(),
          },
          writable: true,
          configurable: true,
        });
      }
      cy.stub(win.navigator.clipboard, "writeText").as("clipboardWriteScroll");
    });

    cy.get("#parallel-docs-share-link").click();

    cy.get<Cypress.SinonStub>("@clipboardWriteScroll").should("have.been.calledOnce");
    cy.get<Cypress.SinonStub>("@clipboardWriteScroll").then((stub) => {
      const copiedUrl = stub.firstCall.args[0];
      expect(copiedUrl).to.match(/#.*parallel-docs-md-line-\d+/);

      cy.visit(copiedUrl, {
        onBeforeLoad(win) {
          win.localStorage.setItem("parallel-docs.codeParallelDocsStatic.wideModeIntro.v1", "1");
        },
      });
      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.AwaitDualPaneScrollSyncFlush();

      cy.DocPaneBodyScrollTopShouldExceed(20);
    });
  });
});

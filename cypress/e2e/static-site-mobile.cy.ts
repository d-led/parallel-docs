describe("The ParallelDocs GitHub Pages static build on a narrow viewport", () => {
  beforeEach(() => {
    cy.PrepareStaticSiteHomeAtMobileViewport();
  });

  it("opens on parallel-docs, hides the gutter, and keeps search chrome within reach", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
  });

  it("flips between source-only and parallel-docs-only without losing in-page search", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TypeTextInSearchField("readme");
    cy.SearchResultsPanelShouldBeVisible();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.SearchResultsPanelShouldBeVisible();
  });

  it("still drives multi-angle copy and the documented-files tree from the compact toolbar", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.OptionsOfAngleSelectShouldIncludeMainAndArchitecture();
    cy.ChooseValueOfAngleSelect("architecture");
    cy.DisplayedValueOfAngleSelectShouldBe("architecture");
    cy.ParallelDocsPaneShouldContainText("architecture angle");

    cy.OpenParallelDocsedFilesDisclosure();
    cy.ParallelDocsedFilesTreeShouldExposeAtLeastOneFileLink();
  });

  it("renders Mermaid in the parallel-docs pane on a narrow viewport", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();
  });

  it("renders Mermaid after opening parallel-docs when the reader left off on source-only", () => {
    cy.PrepareStaticSiteHomeAtMobileViewportWithSourcePaneActive();
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();
  });

  it("nudges the source pane scroll to match parallel-docs depth when flipping after scrolling down", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.MobileViewportShouldHaveScrollableDocument(80);
    cy.ScrollMobileDocumentToFraction(0.45);
    cy.MobileDocumentScrollYShouldExceed(40);
    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.MobileDocumentScrollYShouldExceed(5);
  });

  it("keeps rendered Mermaid SVG after flipping to source and back to parallel-docs", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.DocPaneMermaidSvgShouldExist();
  });

  it("writes pane hash on mobile flip and restores pane from hash on load", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.location("hash").should("contain", "mobile-pane-code");

    cy.viewport(390, 844);
    cy.visit("/#mobile-pane-code", {
      onBeforeLoad(win) {
        win.localStorage.setItem("parallel-docs.codeParallelDocsStatic.wideModeIntro.v1", "1");
        win.localStorage.setItem("parallel-docs.codeParallelDocsStatic.dualMobilePane", "doc");
      },
    });
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowParallelDocsColumnOnly();
    cy.location("hash").should("contain", "mobile-pane-doc");
  });
});

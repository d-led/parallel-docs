describe("The SideTrack GitHub Pages static build on a narrow viewport", () => {
  beforeEach(() => {
    cy.PrepareStaticSiteHomeAtMobileViewport();
  });

  it("opens on sidetrack, hides the gutter, and keeps search chrome within reach", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
  });

  it("flips between source-only and sidetrack-only without losing in-page search", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TypeTextInSearchField("readme");
    cy.SearchResultsPanelShouldBeVisible();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.SearchResultsPanelShouldBeVisible();
  });

  it("still drives multi-angle copy and the documented-files tree from the compact toolbar", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.OptionsOfAngleSelectShouldIncludeMainAndArchitecture();
    cy.ChooseValueOfAngleSelect("architecture");
    cy.DisplayedValueOfAngleSelectShouldBe("architecture");
    cy.SideTrackPaneShouldContainText("architecture angle");

    cy.OpenSideTrackedFilesDisclosure();
    cy.SideTrackedFilesTreeShouldExposeAtLeastOneFileLink();
  });

  it("renders Mermaid in the sidetrack pane on a narrow viewport", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();
  });

  it("renders Mermaid after opening sidetrack when the reader left off on source-only", () => {
    cy.PrepareStaticSiteHomeAtMobileViewportWithSourcePaneActive();
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();
  });

  it("nudges the source pane scroll to match sidetrack depth when flipping after scrolling down", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.MobileViewportShouldHaveScrollableDocument(80);
    cy.ScrollMobileDocumentToFraction(0.45);
    cy.MobileDocumentScrollYShouldExceed(40);
    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.MobileDocumentScrollYShouldExceed(5);
  });

  it("keeps rendered Mermaid SVG after flipping to source and back to sidetrack", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.DocPaneMermaidShouldShowDiagramOrMarkup();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.DocPaneMermaidSvgShouldExist();
  });

  it("writes pane hash on mobile flip and restores pane from hash on load", () => {
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();
    cy.location("hash").should("contain", "mobile-pane-code");

    cy.viewport(390, 844);
    cy.visit("/#mobile-pane-code", {
      onBeforeLoad(win) {
        win.localStorage.setItem("sidetrack.codeSideTrackStatic.wideModeIntro.v1", "1");
        win.localStorage.setItem("sidetrack.codeSideTrackStatic.dualMobilePane", "doc");
      },
    });
    cy.MobileStaticSiteCodeBrowserChromeShouldBeReady();
    cy.MobileSinglePaneLayoutShouldShowSourceColumnOnly();

    cy.TapMobilePaneFlipControl();
    cy.MobileSinglePaneLayoutShouldShowSideTrackColumnOnly();
    cy.location("hash").should("contain", "mobile-pane-doc");
  });
});

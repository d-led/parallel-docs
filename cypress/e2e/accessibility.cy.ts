describe("The shipped SideTrack home page", () => {
  beforeEach(() => {
    cy.GoToStaticSiteHome();
  });

  it("exposes document language and primary landmarks for assistive tech", () => {
    cy.DocumentShouldExposeHtmlLanguage();
    cy.DocumentTitleShouldMatchStaticSitePattern();
    cy.MetaDescriptionShouldMatchStaticSitePattern();
    cy.BannerLandmarkShouldBeVisible();
    cy.PageHeadingShouldMatchStaticSitePattern();
    cy.MainLandmarkShouldExist();
    cy.ContentinfoLandmarkShouldExist();
  });

  it("surfaces labeled controls, skip navigation, and polite search announcements", () => {
    cy.DualPanesSplitterSearchRegionShouldBeVisible();
    cy.SkipNavigationLinkShouldTargetMainContent();
    cy.SearchFieldShouldExposeVisibleLabelText();
    cy.SearchClearButtonShouldBeVisibleWithClearText();
    cy.WrapLinesCheckboxShouldHaveLabeledWrapLinesText();
    cy.AngleSelectControlShouldExist();
    cy.SearchResultsShouldBePoliteLiveRegion();
  });

  it("shows a visible focus ring on the search field after focus", () => {
    cy.FocusOnSearchField();
    cy.SearchFieldShouldBeFocused();
    cy.SearchFieldOutlineStyleShouldNotBeNone();
  });

  it("lets users pick a theme from a popover and dismiss it without leaving the menu open", () => {
    cy.ColorThemeTriggerShouldAdvertisePopoverMenu();
    cy.ColorThemeMenuShouldStartHidden();
    cy.ClickColorThemeTrigger();
    cy.ColorThemeMenuShouldBeVisible();
    cy.ClickLightPresetInColorThemeMenu();
    cy.ColorThemeTriggerShouldReportLightMode();
    cy.ClickTopLeftOfMainLandmarkBody();
    cy.ColorThemeMenuShouldBeHidden();
  });

  it("marks external tabs as noopener and hides decorative toolbar SVGs", () => {
    cy.BlankTargetLinksShouldIncludeNoopenerInRel();
    cy.DocPairGithubToolbarLinksShouldMarkSvgsDecorative();
  });
});

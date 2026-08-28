export {};

declare global {
  namespace Cypress {
    interface Chainable {
      GoToStaticSiteHome(): Chainable<void>;
      GoToStaticSiteHomeForDualPaneScrollTests(): Chainable<void>;

      CurrentPageShouldDisplayCodeBrowserShell(): Chainable<void>;
      NavSearchArtifactGetRequestShouldReturnSchemaVersion(): Chainable<void>;
      DocPairGithubToolbarLinksShouldMarkSvgsDecorative(): Chainable<void>;

      DocumentShouldExposeHtmlLanguage(expected?: string): Chainable<void>;
      DocumentTitleShouldMatch(pattern: RegExp): Chainable<void>;
      MetaDescriptionContentShouldMatch(pattern: RegExp): Chainable<void>;
      DocumentTitleShouldMatchStaticSitePattern(): Chainable<void>;
      MetaDescriptionShouldMatchStaticSitePattern(): Chainable<void>;

      BannerLandmarkShouldBeVisible(): Chainable<void>;
      PageHeadingShouldMatch(pattern: RegExp): Chainable<void>;
      PageHeadingShouldMatchStaticSitePattern(): Chainable<void>;
      MainLandmarkShouldExist(): Chainable<void>;
      ContentinfoLandmarkShouldExist(): Chainable<void>;
      DualPanesSplitterSearchRegionShouldBeVisible(): Chainable<void>;

      SkipNavigationLinkShouldTargetMainContent(): Chainable<void>;
      FocusOnSearchField(): Chainable<void>;
      SearchFieldShouldBeFocused(): Chainable<void>;
      SearchFieldOutlineStyleShouldNotBeNone(): Chainable<void>;

      SearchFieldShouldExposeVisibleLabelText(): Chainable<void>;
      SearchClearButtonShouldBeVisibleWithClearText(): Chainable<void>;
      WrapLinesCheckboxShouldHaveLabeledWrapLinesText(): Chainable<void>;

      ColorThemeTriggerShouldAdvertisePopoverMenu(): Chainable<void>;
      ColorThemeMenuShouldStartHidden(): Chainable<void>;
      ClickColorThemeTrigger(): Chainable<void>;
      ColorThemeMenuShouldBeVisible(): Chainable<void>;
      ClickLightPresetInColorThemeMenu(): Chainable<void>;
      ColorThemeTriggerShouldReportLightMode(): Chainable<void>;
      ClickTopLeftOfMainLandmarkBody(): Chainable<void>;
      ColorThemeMenuShouldBeHidden(): Chainable<void>;

      AngleSelectControlShouldExist(): Chainable<void>;
      SearchResultsShouldBePoliteLiveRegion(): Chainable<void>;
      BlankTargetLinksShouldIncludeNoopenerInRel(): Chainable<void>;

      ApplyDualPaneScrollTestViewport(): Chainable<void>;
      CurrentPageShouldDisplayDualPaneCodeBrowserChrome(): Chainable<void>;
      DocumentationPairStripShouldMentionReadmeSourceFile(): Chainable<void>;
      ResizeSplitterGutterShouldExposeConnectorPaths(): Chainable<void>;
      AwaitDualPaneScrollSyncFlush(): Chainable<void>;
      ScrollCodePaneToMaximum(): Chainable<void>;
      ScrollDocPaneBodyToMaximum(): Chainable<void>;
      DocPaneBodyScrollTopShouldExceed(pixels: number): Chainable<void>;
      CodePaneScrollTopShouldExceed(pixels: number): Chainable<void>;
      CodeAndDocPanesScrollTopShouldBeZero(): Chainable<void>;

      CurrentPageShouldDisplayMainLandmarkAndSkipLink(): Chainable<void>;

      SideTrackPaneReadmeLinksShouldUseGithubBlobUrls(): Chainable<void>;
      SideTrackPaneEmphasisShouldRenderAfterBlocks(): Chainable<void>;
      DocumentationHomeLinkShouldPointToRelativeIndex(): Chainable<void>;
      ShellPairBrowseLinkShouldAdvertiseOnSiteBrowsePage(): Chainable<void>;
      OpenSideTrackedFilesDisclosure(): Chainable<void>;
      CloseSideTrackedFilesHubWithEscape(): Chainable<void>;
      SideTrackedFilesTreeShouldExposeAtLeastOneFileLink(): Chainable<void>;
      FollowFirstBrowseFileLinkInTree(): Chainable<void>;
      ShellPairBrowseLinkShouldAvoidStackedBrowseSegments(): Chainable<void>;

      InterceptNavSearchIndexAsUnavailable(): Chainable<void>;
      SideTrackedFilesTreeShouldContainReadmeLink(): Chainable<void>;

      TypeTextInSearchField(text: string): Chainable<void>;
      SearchResultsPanelShouldBeVisible(): Chainable<void>;
      PressEscapeInSearchField(): Chainable<void>;
      SearchFieldValueShouldBeEmpty(): Chainable<void>;
      SearchResultsPanelShouldBeHidden(): Chainable<void>;
      SearchResultsHitMarksShouldExist(): Chainable<void>;
      PressArrowDownInSearchField(): Chainable<void>;
      SearchResultsShouldMentionIndexedSourceFiles(): Chainable<void>;
      SearchResultsHitButtonsShouldExist(): Chainable<void>;
      SearchResultsHitButtonCountShouldBeAtLeast(min: number): Chainable<void>;
      FirstSearchHitButtonShouldBeFocused(): Chainable<void>;
      SearchHitButtonAtIndexShouldBeFocused(zeroBasedIndex: number): Chainable<void>;
      MoveSearchKeyboardFocusFromFieldToFirstHit(): Chainable<void>;
      PressArrowUpInFocusedElement(): Chainable<void>;
      PressArrowDownInFocusedElement(): Chainable<void>;
      PressEnterInFocusedSearchField(): Chainable<void>;

      FocusSideTrackedFilesFilter(): Chainable<void>;
      SideTrackedFilesFilterShouldBeFocused(): Chainable<void>;
      MoveKeyboardFocusFromSideTrackedFilterToFirstTreeLink(): Chainable<void>;
      FirstSideTrackedTreeFileLinkShouldBeFocused(): Chainable<void>;
      SideTrackedTreeFileLinkAtIndexShouldBeFocused(zeroBasedIndex: number): Chainable<void>;
      SideTrackedFilesTreeFileLinksShouldBeAtLeast(min: number): Chainable<void>;
      OpenSideTrackedFilesHubWithTreeVisible(): Chainable<void>;
      ConstrainSearchResultsPanelHeightForScrollCoverage(): Chainable<void>;
      SearchKeyboardNavigateFromFirstHitToLastHit(): Chainable<void>;
      SearchResultsPanelScrollTopShouldBeGreaterThan(pixels: number): Chainable<void>;
      ConstrainSideTrackedFilesTreeHeightForScrollCoverage(): Chainable<void>;
      TreeKeyboardNavigateFromFirstLinkToLastLink(): Chainable<void>;
      SideTrackedFilesTreeScrollTopShouldBeGreaterThan(pixels: number): Chainable<void>;
      ClickPageFooterToDismissSideTrackedFilesHub(): Chainable<void>;
      SideTrackedFilesHubOpenPropShouldBe(open: boolean): Chainable<void>;

      OptionsOfAngleSelectShouldIncludeMainAndArchitecture(): Chainable<void>;
      DisplayedValueOfAngleSelectShouldBe(value: string): Chainable<void>;
      ChooseValueOfAngleSelect(value: string): Chainable<void>;
      SideTrackPaneShouldContainText(text: string): Chainable<void>;
      ShellPairBrowseLinkShouldMatchRelativeBrowseHtml(): Chainable<void>;
      ShellPairBrowseLinkShouldNotPointAtGithubHost(): Chainable<void>;

      DocPaneMermaidShouldShowDiagramOrMarkup(): Chainable<void>;
      DocPaneMermaidSvgShouldExist(): Chainable<void>;

      PrepareStaticSiteHomeAtMobileViewport(): Chainable<void>;
      PrepareStaticSiteHomeAtMobileViewportWithSourcePaneActive(): Chainable<void>;
      MobileStaticSiteCodeBrowserChromeShouldBeReady(): Chainable<void>;
      MobileSinglePaneLayoutShouldShowSideTrackColumnOnly(): Chainable<void>;
      MobileSinglePaneLayoutShouldShowSourceColumnOnly(): Chainable<void>;
      MobileViewportShouldHaveScrollableDocument(minPixels?: number): Chainable<void>;
      ScrollMobileDocumentToFraction(fraction: number): Chainable<void>;
      MobileDocumentScrollYShouldExceed(pixels: number): Chainable<void>;
      TapMobilePaneFlipControl(): Chainable<void>;

      PrepareStaticSiteHomeForMobileFlipTailCheck(): Chainable<void>;
      ScrollMobileDocumentToBottomAndFlush(): Chainable<void>;
      SecondaryMobileFlipShouldBeVisibleAndPrimaryShouldBeOffscreen(): Chainable<void>;
      MobilePaneShouldShowTailFixtureSourceText(): Chainable<void>;
      MobilePaneShouldShowTailFlipMarkerText(): Chainable<void>;
    }
  }
}

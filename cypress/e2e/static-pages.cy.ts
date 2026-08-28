describe("The SideTrack GitHub Pages static build", () => {
  describe("The nav search JSON artifact", () => {
    it("responds with 200 and a schemaVersion field", () => {
      cy.NavSearchArtifactGetRequestShouldReturnSchemaVersion();
    });
  });

  describe("The built site index at /", () => {
    beforeEach(() => {
      cy.GoToStaticSiteHome();
    });

    it("serves the documentation hub at the site root without client-side address-bar rewriting", () => {
      cy.location("pathname").should("eq", "/");
    });

    it("presents a coherent browsable documentation workspace", () => {
      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.SideTrackPaneReadmeLinksShouldUseGithubBlobUrls();
      cy.SideTrackPaneEmphasisShouldRenderAfterBlocks();
      cy.DocumentationHomeLinkShouldPointToRelativeIndex();
      cy.ShellPairBrowseLinkShouldAdvertiseOnSiteBrowsePage();
      cy.OpenSideTrackedFilesDisclosure();
      cy.SideTrackedFilesTreeShouldExposeAtLeastOneFileLink();
    });

    it("closes the Side-tracked files hub when Escape is pressed", () => {
      cy.OpenSideTrackedFilesDisclosure();
      cy.SideTrackedFilesTreeShouldExposeAtLeastOneFileLink();
      cy.CloseSideTrackedFilesHubWithEscape();
    });

    it("keeps pair-browse routes from stacking under repeated /browse/ segments", () => {
      cy.OpenSideTrackedFilesDisclosure();
      cy.FollowFirstBrowseFileLinkInTree();
      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.ShellPairBrowseLinkShouldAvoidStackedBrowseSegments();
    });

    it("keeps relative pair-browse links stable when landing on a direct browse permalink", () => {
      cy.get(".shell")
        .invoke("attr", "data-sidetrack-pair-browse-href")
        .then((browseHref) => {
          expect(browseHref)
            .to.be.a("string")
            .and.match(
              /^(?:\.\/browse\/(?:[^/]+\.html|.+\/index\.html)|https?:\/\/[^/]+\/browse\/(?:[^/]+\.html|.+\/index\.html))(?:\?.*)?$/,
            );
          if (typeof browseHref !== "string") {
            throw new Error("Expected shell browse permalink href");
          }
          cy.visit(browseHref);
        });

      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.location("pathname").should("match", /\/browse\/.+(?:\/index\.html|\.html)?$/);
      cy.location("pathname").should("not.match", /\/browse\/browse\//);
      cy.get('a[aria-label="Documentation home"]')
        .should("have.attr", "href")
        .and("match", /^(?:\/|\/.+\/|(?:\.\.\/)+index\.html)$/)
        .and("not.match", /\/browse\/?$/);
      cy.ShellPairBrowseLinkShouldAvoidStackedBrowseSegments();
    });

    it("serves humane source browse paths as real pages on static hosts", () => {
      cy.ApplyDualPaneScrollTestViewport();
      cy.location("href").then((href) => {
        cy.get(".shell")
          .invoke("attr", "data-sidetrack-pair-browse-href")
          .then((browseHref) => {
            expect(browseHref)
              .to.be.a("string")
              .and.match(/^(?:\.\/browse\/.+|\/browse\/.+|https?:\/\/[^/]+\/browse\/.+)(?:\?.*)?$/);
            if (typeof browseHref !== "string") {
              throw new Error("Expected shell browse permalink href");
            }
            const browsePath = new URL(browseHref, href).pathname;
            cy.wrap(browsePath).as("humaneBrowsePath");
            cy.visit(browsePath, {
              onBeforeLoad(win) {
                win.localStorage.setItem("sidetrack.codeSideTrackStatic.wideModeIntro.v1", "1");
              },
            });
          });
      });
      cy.CurrentPageShouldDisplayCodeBrowserShell();
      cy.location("pathname").should("match", /\/browse\/README\.md\/main(?:\/index\.html)?$/);
      cy.ShellPairBrowseLinkShouldAvoidStackedBrowseSegments();
      // Scroll sync is URL-agnostic; assert it on a real filename-readable permalink so
      // browse URL refactors cannot regress coupling without failing CI.
      cy.CodeAndDocPanesScrollTopShouldBeZero();
      cy.ScrollCodePaneToMaximum();
      cy.DocPaneBodyScrollTopShouldExceed(80);
      cy.get("@humaneBrowsePath").then((browsePath) => {
        cy.visit(String(browsePath), {
          onBeforeLoad(win) {
            win.localStorage.setItem("sidetrack.codeSideTrackStatic.wideModeIntro.v1", "1");
          },
        });
      });
      cy.CodeAndDocPanesScrollTopShouldBeZero();
      cy.ScrollDocPaneBodyToMaximum();
      cy.CodePaneScrollTopShouldExceed(80);
    });

    it("returns 404 for humane browse paths without a documented pair", () => {
      cy.request({
        method: "GET",
        url: "/browse/this-path-has-no-sidetrack.md",
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 404);
    });

    it("clears in-page search and hides hits when Escape is pressed", () => {
      cy.TypeTextInSearchField("sidetrack");
      cy.SearchResultsPanelShouldBeVisible();
      cy.PressEscapeInSearchField();
      cy.SearchFieldValueShouldBeEmpty();
      cy.SearchResultsPanelShouldBeHidden();
    });

    it("highlights matched query tokens inside search hit snippets", () => {
      cy.TypeTextInSearchField("sidetrack");
      cy.SearchResultsPanelShouldBeVisible();
      cy.SearchResultsHitMarksShouldExist();
    });

    it("switches documentation angle while keeping on-site pair-browse targets", () => {
      cy.OptionsOfAngleSelectShouldIncludeMainAndArchitecture();
      cy.DisplayedValueOfAngleSelectShouldBe("main");
      cy.SideTrackPaneShouldContainText("quick-start");
      cy.ShellPairBrowseLinkShouldMatchRelativeBrowseHtml();
      cy.ShellPairBrowseLinkShouldNotPointAtGithubHost();

      cy.ChooseValueOfAngleSelect("architecture");
      cy.DisplayedValueOfAngleSelectShouldBe("architecture");
      cy.SideTrackPaneShouldContainText("architecture angle");
      cy.ShellPairBrowseLinkShouldMatchRelativeBrowseHtml();
      cy.ShellPairBrowseLinkShouldNotPointAtGithubHost();

      cy.ChooseValueOfAngleSelect("main");
      cy.DisplayedValueOfAngleSelectShouldBe("main");
      cy.SideTrackPaneShouldContainText("quick-start");
      cy.ShellPairBrowseLinkShouldMatchRelativeBrowseHtml();
      cy.ShellPairBrowseLinkShouldNotPointAtGithubHost();
    });

    it("resets in-flight search when the angle changes", () => {
      cy.TypeTextInSearchField("quickstart");
      cy.SearchResultsPanelShouldBeVisible();
      cy.ChooseValueOfAngleSelect("architecture");
      cy.SearchFieldValueShouldBeEmpty();
      cy.SearchResultsPanelShouldBeHidden();
    });

    it("keeps Mermaid output valid when the angle changes", () => {
      cy.DocPaneMermaidShouldShowDiagramOrMarkup();
      cy.ChooseValueOfAngleSelect("architecture");
      cy.DisplayedValueOfAngleSelectShouldBe("architecture");
      cy.DocPaneMermaidShouldShowDiagramOrMarkup();
    });
  });

  context("when nav search JSON cannot be fetched", () => {
    beforeEach(() => {
      cy.InterceptNavSearchIndexAsUnavailable();
      cy.GoToStaticSiteHome();
    });

    it("still exposes README through the side-tracked files tree", () => {
      cy.OpenSideTrackedFilesDisclosure();
      cy.SideTrackedFilesTreeShouldContainReadmeLink();
    });
  });
});

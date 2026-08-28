/**
 * Behavior-driven coverage of keyboard navigation for the static code browser:
 * chrome search hit lists (browse preview + token query) and the Side-tracked files tree.
 *
 * Selectors and shared steps live in `cypress/support/shell-a11y.ts` and
 * `cypress/support/custom-commands/code-browser-keyboard.ts` so specs stay readable.
 *
 * Ordering note: indexed browse rows are sorted by `sourcePath` (`uniqueSourceFilePreviewRows` in
 * `@parallel-docs/render`). On the default README@main home, the first row is therefore not README,
 * so Enter from the search field is expected to change `location.pathname` (navigate to another pair).
 */
describe("Code browser keyboard usability on the static site", () => {
  describe("given the reader opens the static GitHub Pages home", () => {
    beforeEach(() => {
      cy.GoToStaticSiteHome();
    });

    describe("the chrome search region", () => {
      describe("when they request the empty-query indexed-source browse preview", () => {
        beforeEach(() => {
          cy.FocusOnSearchField();
          cy.PressArrowDownInSearchField();
          cy.SearchResultsPanelShouldBeVisible();
          cy.SearchResultsShouldMentionIndexedSourceFiles();
          cy.SearchResultsHitButtonsShouldExist();
        });

        it("then the results panel lists multiple indexed sources as hit buttons", () => {
          cy.SearchResultsHitButtonCountShouldBeAtLeast(2);
        });

        it("then pressing ArrowDown again moves keyboard focus from the search field onto the first hit", () => {
          cy.MoveSearchKeyboardFocusFromFieldToFirstHit();
        });

        it("then pressing ArrowUp while the first hit is focused returns focus to the search field", () => {
          cy.MoveSearchKeyboardFocusFromFieldToFirstHit();
          cy.PressArrowUpInFocusedElement();
          cy.SearchFieldShouldBeFocused();
        });

        it("then pressing Enter while the search field is focused follows the first row like a click", () => {
          cy.location("pathname").then((pathBeforeEnter) => {
            cy.SearchFieldShouldBeFocused();
            cy.PressEnterInFocusedSearchField();
            cy.location("pathname").should("not.eq", pathBeforeEnter);
          });
        });

        describe("and keyboard focus is already on the first hit", () => {
          beforeEach(() => {
            cy.SearchResultsHitButtonCountShouldBeAtLeast(2);
            cy.MoveSearchKeyboardFocusFromFieldToFirstHit();
          });

          it("then ArrowDown moves focus to the second hit", () => {
            cy.PressArrowDownInFocusedElement();
            cy.SearchHitButtonAtIndexShouldBeFocused(1);
          });

          it("then ArrowUp from the second hit refocuses the first hit", () => {
            cy.PressArrowDownInFocusedElement();
            cy.SearchHitButtonAtIndexShouldBeFocused(1);
            cy.PressArrowUpInFocusedElement();
            cy.SearchHitButtonAtIndexShouldBeFocused(0);
          });

          it("then ArrowDown through the list scrolls the results panel so the focused hit stays visible", () => {
            cy.ConstrainSearchResultsPanelHeightForScrollCoverage();
            cy.SearchKeyboardNavigateFromFirstHitToLastHit();
            cy.SearchResultsPanelScrollTopShouldBeGreaterThan(0);
          });
        });
      });

      describe("when they type a token query and wait for merged hits", () => {
        beforeEach(() => {
          cy.FocusOnSearchField();
          cy.TypeTextInSearchField("parallel-docs");
          cy.SearchResultsPanelShouldBeVisible();
          cy.SearchResultsHitButtonsShouldExist();
        });

        it("then ArrowDown moves keyboard focus from the search field into the first hit", () => {
          cy.MoveSearchKeyboardFocusFromFieldToFirstHit();
        });

        it("then ArrowUp from that hit returns focus to the search field", () => {
          cy.MoveSearchKeyboardFocusFromFieldToFirstHit();
          cy.PressArrowUpInFocusedElement();
          cy.SearchFieldShouldBeFocused();
        });
      });
    });

    describe("the Side-tracked files hub", () => {
      describe("when they open it and the tree has finished loading", () => {
        beforeEach(() => {
          cy.OpenParallelDocsedFilesHubWithTreeVisible();
        });

        it("then ArrowDown from the filter moves focus onto the first file link", () => {
          cy.MoveKeyboardFocusFromParallelDocsedFilterToFirstTreeLink();
          cy.FirstParallelDocsedTreeFileLinkShouldBeFocused();
        });

        it("then ArrowUp from the first file link returns focus to the filter", () => {
          cy.MoveKeyboardFocusFromParallelDocsedFilterToFirstTreeLink();
          cy.FirstParallelDocsedTreeFileLinkShouldBeFocused();
          cy.PressArrowUpInFocusedElement();
          cy.ParallelDocsedFilesFilterShouldBeFocused();
        });

        describe("and the tree exposes at least two file links", () => {
          beforeEach(() => {
            cy.ParallelDocsedFilesTreeFileLinksShouldBeAtLeast(2);
            cy.MoveKeyboardFocusFromParallelDocsedFilterToFirstTreeLink();
            cy.FirstParallelDocsedTreeFileLinkShouldBeFocused();
          });

          it("then ArrowDown moves focus to the second file link", () => {
            cy.PressArrowDownInFocusedElement();
            cy.ParallelDocsedTreeFileLinkAtIndexShouldBeFocused(1);
          });

          it("then ArrowUp from the second link focuses the first link again", () => {
            cy.PressArrowDownInFocusedElement();
            cy.ParallelDocsedTreeFileLinkAtIndexShouldBeFocused(1);
            cy.PressArrowUpInFocusedElement();
            cy.ParallelDocsedTreeFileLinkAtIndexShouldBeFocused(0);
          });

          it("then ArrowDown through the list scrolls the tree so the focused link stays visible", () => {
            cy.ConstrainParallelDocsedFilesTreeHeightForScrollCoverage();
            cy.TreeKeyboardNavigateFromFirstLinkToLastLink();
            cy.ParallelDocsedFilesTreeScrollTopShouldBeGreaterThan(0);
          });
        });

        it("then clicking outside the hub on the page footer closes the tree", () => {
          cy.ParallelDocsedFilesHubOpenPropShouldBe(true);
          cy.ClickPageFooterToDismissParallelDocsedFilesHub();
          cy.ParallelDocsedFilesHubOpenPropShouldBe(false);
        });
      });
    });
  });

  describe("given nav search JSON cannot be fetched", () => {
    beforeEach(() => {
      cy.InterceptNavSearchIndexAsUnavailable();
      cy.GoToStaticSiteHome();
    });

    describe("the Side-tracked files hub", () => {
      it("then the reader can still move between the filter and the first tree link with the arrow keys", () => {
        cy.OpenParallelDocsedFilesHubWithTreeVisible();
        cy.ParallelDocsedFilesTreeShouldContainReadmeLink();
        cy.MoveKeyboardFocusFromParallelDocsedFilterToFirstTreeLink();
        cy.FirstParallelDocsedTreeFileLinkShouldBeFocused();
        cy.PressArrowUpInFocusedElement();
        cy.ParallelDocsedFilesFilterShouldBeFocused();
      });
    });
  });
});

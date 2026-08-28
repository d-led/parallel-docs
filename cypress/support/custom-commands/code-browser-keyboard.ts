import { shellA11y } from "../shell-a11y";

/**
 * Keyboard UX for the static code browser (search hits + documented-files tree).
 * Specs should compose these so scenarios read as BDD-style sentences.
 */

Cypress.Commands.add("SearchResultsHitButtonCountShouldBeAtLeast", (min: number) => {
  cy.get(shellA11y.search.hitButton).should("have.length.at.least", min);
});

Cypress.Commands.add("FirstSearchHitButtonShouldBeFocused", () => {
  cy.get(shellA11y.search.hitButton).first().should("be.focused");
});

Cypress.Commands.add("SearchHitButtonAtIndexShouldBeFocused", (zeroBasedIndex: number) => {
  cy.get(shellA11y.search.hitButton).eq(zeroBasedIndex).should("be.focused");
});

/** Assumes the search field is focused and a hit list is already visible (browse preview or query hits). */
Cypress.Commands.add("MoveSearchKeyboardFocusFromFieldToFirstHit", () => {
  cy.get(shellA11y.search.input).should("be.focused");
  cy.PressArrowDownInSearchField();
  cy.FirstSearchHitButtonShouldBeFocused();
});

Cypress.Commands.add("PressArrowUpInFocusedElement", () => {
  cy.focused().type("{uparrow}");
});

Cypress.Commands.add("PressArrowDownInFocusedElement", () => {
  cy.focused().type("{downarrow}");
});

Cypress.Commands.add("PressEnterInFocusedSearchField", () => {
  cy.get(shellA11y.search.input).should("be.focused");
  cy.get(shellA11y.search.input).type("{enter}");
});

Cypress.Commands.add("FocusSideTrackedFilesFilter", () => {
  cy.get(shellA11y.documentedFiles.filter).focus();
});

Cypress.Commands.add("SideTrackedFilesFilterShouldBeFocused", () => {
  cy.get(shellA11y.documentedFiles.filter).should("be.focused");
});

Cypress.Commands.add("MoveKeyboardFocusFromSideTrackedFilterToFirstTreeLink", () => {
  cy.FocusSideTrackedFilesFilter();
  cy.PressArrowDownInFocusedElement();
});

Cypress.Commands.add("FirstSideTrackedTreeFileLinkShouldBeFocused", () => {
  cy.get(shellA11y.documentedFiles.fileLink).first().should("be.focused");
});

Cypress.Commands.add("SideTrackedTreeFileLinkAtIndexShouldBeFocused", (zeroBasedIndex: number) => {
  cy.get(shellA11y.documentedFiles.fileLink).eq(zeroBasedIndex).should("be.focused");
});

Cypress.Commands.add("SideTrackedFilesTreeFileLinksShouldBeAtLeast", (min: number) => {
  cy.get(shellA11y.documentedFiles.fileLink).should("have.length.at.least", min);
});

Cypress.Commands.add("OpenSideTrackedFilesHubWithTreeVisible", () => {
  cy.OpenSideTrackedFilesDisclosure();
  cy.SideTrackedFilesTreeShouldExposeAtLeastOneFileLink();
});

/** Forces vertical overflow so ArrowDown through hits must scroll `#search-results`. */
Cypress.Commands.add("ConstrainSearchResultsPanelHeightForScrollCoverage", () => {
  cy.get(shellA11y.search.results).should("be.visible");
  cy.get(shellA11y.search.results)
    .invoke("css", "max-height", "36px")
    .invoke("css", "overflow-y", "auto");
  cy.get(shellA11y.search.results).should(($el) => {
    const el = $el[0] as HTMLElement;
    expect(el.scrollHeight, "search results list should overflow").to.be.greaterThan(
      el.clientHeight + 2,
    );
  });
});

/** Assumes keyboard focus is already on the first hit; walks to the last with ArrowDown. */
Cypress.Commands.add("SearchKeyboardNavigateFromFirstHitToLastHit", () => {
  cy.get(shellA11y.search.hitButton).then(($hits) => {
    const n = $hits.length;
    expect(n, "search hit count").to.be.at.least(2);
    for (let i = 0; i < n - 1; i += 1) {
      cy.PressArrowDownInFocusedElement();
    }
    cy.get(shellA11y.search.hitButton).last().should("be.focused");
  });
});

Cypress.Commands.add("SearchResultsPanelScrollTopShouldBeGreaterThan", (pixels: number) => {
  cy.get(shellA11y.search.results).invoke("scrollTop").should("be.gt", pixels);
});

Cypress.Commands.add("ConstrainSideTrackedFilesTreeHeightForScrollCoverage", () => {
  cy.get(shellA11y.documentedFiles.tree).should("be.visible");
  cy.get(shellA11y.documentedFiles.tree)
    .invoke("css", "max-height", "22px")
    .invoke("css", "overflow-y", "auto");
  cy.get(shellA11y.documentedFiles.tree).should(($el) => {
    const el = $el[0] as HTMLElement;
    expect(el.scrollHeight, "documented-files tree should overflow").to.be.greaterThan(
      el.clientHeight + 2,
    );
  });
});

/** Assumes keyboard focus is already on the first tree file link. */
Cypress.Commands.add("TreeKeyboardNavigateFromFirstLinkToLastLink", () => {
  cy.get(shellA11y.documentedFiles.fileLink).then(($links) => {
    const n = $links.length;
    expect(n, "tree file link count").to.be.at.least(2);
    for (let i = 0; i < n - 1; i += 1) {
      cy.PressArrowDownInFocusedElement();
    }
    cy.get(shellA11y.documentedFiles.fileLink).last().should("be.focused");
  });
});

Cypress.Commands.add("SideTrackedFilesTreeScrollTopShouldBeGreaterThan", (pixels: number) => {
  cy.get(shellA11y.documentedFiles.tree).invoke("scrollTop").should("be.gt", pixels);
});

/**
 * Clicks outside the hub. Uses the page footer so the hit target is never under the doc-hub
 * flyout (which can stack above the top of `main` and swallow top-left clicks in CI).
 */
Cypress.Commands.add("ClickPageFooterToDismissSideTrackedFilesHub", () => {
  cy.get(shellA11y.contentinfo).should("be.visible").click("center");
});

Cypress.Commands.add("SideTrackedFilesHubOpenPropShouldBe", (open: boolean) => {
  cy.get(shellA11y.documentedFiles.hub).should("have.prop", "open", open);
});

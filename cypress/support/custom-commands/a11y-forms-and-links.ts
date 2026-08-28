import { shellA11y } from "../shell-a11y";

Cypress.Commands.add("SkipNavigationLinkShouldTargetMainContent", () => {
  cy.get(shellA11y.skipToMainLink)
    .should("have.attr", "href", "#main-content")
    .and(($a) => {
      expect($a.text().toLowerCase()).to.contain("skip");
    });
});

Cypress.Commands.add("FocusOnSearchField", () => {
  cy.get(shellA11y.search.input).focus();
});

Cypress.Commands.add("SearchFieldShouldBeFocused", () => {
  cy.get(shellA11y.search.input).should("be.focused");
});

Cypress.Commands.add("SearchFieldOutlineStyleShouldNotBeNone", () => {
  cy.get(shellA11y.search.input).should("have.css", "outline-style").and("not.eq", "none");
});

Cypress.Commands.add("SearchFieldShouldExposeVisibleLabelText", () => {
  cy.get(shellA11y.search.label).should("have.attr", "aria-label", "Search");
  cy.get(shellA11y.search.label)
    .find(".chrome__search-label__caption")
    .should("be.visible")
    .and("contain.text", "Search");
});

Cypress.Commands.add("SearchClearButtonShouldBeVisibleWithClearText", () => {
  cy.get(shellA11y.search.clearButton)
    .should("be.visible")
    .and("have.attr", "aria-label", "Clear search")
    .and("contain.text", "Clear");
});

Cypress.Commands.add("WrapLinesCheckboxShouldHaveLabeledWrapLinesText", () => {
  cy.get(shellA11y.wrapLinesLabel).should("contain", "Wrap lines");
});

Cypress.Commands.add("ColorThemeTriggerShouldAdvertisePopoverMenu", () => {
  cy.get(shellA11y.colorThemeTrigger)
    .should("be.visible")
    .and("have.attr", "aria-haspopup", "menu")
    .and("have.attr", "aria-expanded", "false");
});

Cypress.Commands.add("ColorThemeMenuShouldStartHidden", () => {
  cy.get(shellA11y.colorThemeMenu).should("have.attr", "hidden");
});

Cypress.Commands.add("ClickColorThemeTrigger", () => {
  cy.get(shellA11y.colorThemeTrigger).click();
});

Cypress.Commands.add("ColorThemeMenuShouldBeVisible", () => {
  cy.get(shellA11y.colorThemeMenu).should("be.visible");
});

Cypress.Commands.add("ClickLightPresetInColorThemeMenu", () => {
  cy.get(shellA11y.colorThemeMenu).find('[data-parallel-docs-theme-value="light"]').click();
});

Cypress.Commands.add("ColorThemeTriggerShouldReportLightMode", () => {
  cy.get(shellA11y.colorThemeTrigger).should(
    "have.attr",
    "data-parallel-docs-trigger-mode",
    "light",
  );
});

Cypress.Commands.add("ClickTopLeftOfMainLandmarkBody", () => {
  cy.get(shellA11y.main).click("topLeft", { force: true });
});

Cypress.Commands.add("ColorThemeMenuShouldBeHidden", () => {
  cy.get(shellA11y.colorThemeMenu).should("have.attr", "hidden");
});

Cypress.Commands.add("AngleSelectControlShouldExist", () => {
  cy.get(shellA11y.angleSelect).should("exist");
});

Cypress.Commands.add("SearchResultsShouldBePoliteLiveRegion", () => {
  cy.get(shellA11y.search.results).should("have.attr", "aria-live", "polite");
});

Cypress.Commands.add("BlankTargetLinksShouldIncludeNoopenerInRel", () => {
  cy.get('a[target="_blank"]').each(($a) => {
    cy.wrap($a)
      .invoke("attr", "rel")
      .should("match", /noopener/);
  });
});

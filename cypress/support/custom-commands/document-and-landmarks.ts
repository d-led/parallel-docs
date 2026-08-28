import { DOCUMENT_LANG, STATIC_SITE_TITLE_PATTERN, shellA11y } from "../shell-a11y";

Cypress.Commands.add("DocumentShouldExposeHtmlLanguage", (expected = DOCUMENT_LANG) => {
  cy.get("html").should("have.attr", "lang", expected);
});

Cypress.Commands.add("DocumentTitleShouldMatch", (pattern) => {
  cy.title().should("match", pattern);
});

Cypress.Commands.add("MetaDescriptionContentShouldMatch", (pattern) => {
  cy.get('meta[name="description"]').should("have.attr", "content").and("match", pattern);
});

Cypress.Commands.add("DocumentTitleShouldMatchStaticSitePattern", () => {
  cy.DocumentTitleShouldMatch(STATIC_SITE_TITLE_PATTERN);
});

Cypress.Commands.add("MetaDescriptionShouldMatchStaticSitePattern", () => {
  cy.MetaDescriptionContentShouldMatch(STATIC_SITE_TITLE_PATTERN);
});

Cypress.Commands.add("BannerLandmarkShouldBeVisible", () => {
  cy.get(shellA11y.banner).should("be.visible");
});

Cypress.Commands.add("PageHeadingShouldMatch", (pattern) => {
  cy.get(shellA11y.documentTitleHeading).invoke("text").should("match", pattern);
});

Cypress.Commands.add("PageHeadingShouldMatchStaticSitePattern", () => {
  cy.PageHeadingShouldMatch(STATIC_SITE_TITLE_PATTERN);
});

Cypress.Commands.add("MainLandmarkShouldExist", () => {
  cy.get(shellA11y.main).should("exist");
});

Cypress.Commands.add("ContentinfoLandmarkShouldExist", () => {
  cy.get(shellA11y.contentinfo).should("exist");
});

Cypress.Commands.add("DualPanesSplitterSearchRegionShouldBeVisible", () => {
  cy.get(shellA11y.search.region).within(() => {
    cy.get('input[type="search"]').should("be.visible");
  });
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(`${shellA11y.shell} #code-pane`).should("be.visible");
      cy.get(`${shellA11y.shell} .stretch-doc-inner`).first().should("be.visible");
      cy.get(shellA11y.resizeSplitter).should("not.exist");
    } else {
      cy.get(shellA11y.panes.source).should("be.visible");
      cy.get(shellA11y.panes.sidetrack).should("be.visible");
      cy.get(shellA11y.resizeSplitter).should("be.visible");
    }
  });
});

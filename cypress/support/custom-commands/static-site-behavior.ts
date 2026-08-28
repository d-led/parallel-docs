import { MERMAID_SYNTAX_ERROR_SNIPPET, shellA11y } from "../shell-a11y";

const MERMAID_E2E_TIMEOUT_MS = 20000;
const BROWSE_LINK_REL_OR_ABS_RE =
  /^(?:\.\/browse\/(?:[^/]+\.html|.+\/index\.html)|https?:\/\/[^/]+\/browse\/(?:[^/]+\.html|.+\/index\.html))(?:\?.*)?$/;

Cypress.Commands.add("SideTrackPaneReadmeLinksShouldUseGithubBlobUrls", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(shellA11y.shell)
        .invoke("html")
        .should("match", /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/README\.md/)
        .and("not.match", /href="\.\.\/README\.md"/);
    } else {
      cy.get(shellA11y.panes.sidetrack)
        .invoke("html")
        .should("match", /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/README\.md/)
        .and("not.match", /href="\.\.\/README\.md"/);
    }
  });
});

Cypress.Commands.add("SideTrackPaneEmphasisShouldRenderAfterBlocks", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(`${shellA11y.shell} .stretch-doc-inner, ${shellA11y.shell} .stretch-preamble`)
        .find("em")
        .should("have.length.at.least", 1);
      cy.get(`${shellA11y.shell} .stretch-doc-inner em, ${shellA11y.shell} .stretch-preamble em`)
        .first()
        .should("contain.text", "You have the main");
    } else {
      cy.get(shellA11y.panes.sidetrack).find("em").should("have.length.at.least", 1);
      cy.get(`${shellA11y.panes.sidetrack} em`).first().should("contain.text", "You have the main");
    }
  });
});

Cypress.Commands.add("DocumentationHomeLinkShouldPointToRelativeIndex", () => {
  cy.get('a[aria-label="Documentation home"]')
    .should("have.attr", "href")
    .and("match", /^(?:\.\/|\/|\/.+\/)$/)
    .and("not.match", /\/browse\/?$/);
});

Cypress.Commands.add("ShellPairBrowseLinkShouldAdvertiseOnSiteBrowsePage", () => {
  cy.get(shellA11y.shell)
    .should("have.attr", "data-sidetrack-pair-browse-href")
    .and("match", BROWSE_LINK_REL_OR_ABS_RE)
    .and("not.include", "github.com");
});

Cypress.Commands.add("OpenSideTrackedFilesDisclosure", () => {
  cy.contains("summary", "Side-tracked files").click();
});

/** Closes the Side-tracked files `<details>` hub via Escape (filter field is focused when open). */
Cypress.Commands.add("CloseSideTrackedFilesHubWithEscape", () => {
  cy.get("#documented-files-hub").should("have.prop", "open", true);
  cy.get("#documented-files-filter").focus().type("{esc}");
  cy.get("#documented-files-hub").should("have.prop", "open", false);
});

Cypress.Commands.add("SideTrackedFilesTreeShouldExposeAtLeastOneFileLink", () => {
  cy.get('[role="tree"]', { timeout: 15000 })
    .find("a")
    .should("have.length.at.least", 1)
    .first()
    .should("be.visible");
});

Cypress.Commands.add("FollowFirstBrowseFileLinkInTree", () => {
  cy.get('[role="tree"]', { timeout: 15000 })
    .find('a.tree-file-link[href*="/browse/"]')
    .first()
    .then(($a) => {
      const href = $a.attr("href");
      expect(href)
        .to.be.a("string")
        .and.match(/\/browse\/(?:[^/]+\.html|.+\/index\.html)(\?.*)?$/);
      if (typeof href !== "string") {
        throw new Error("Expected browse tree link href");
      }
      cy.visit(href);
    });
});

Cypress.Commands.add("ShellPairBrowseLinkShouldAvoidStackedBrowseSegments", () => {
  cy.get(shellA11y.shell)
    .should("have.attr", "data-sidetrack-pair-browse-href")
    .and("match", BROWSE_LINK_REL_OR_ABS_RE)
    .and("not.contain", "/browse/browse/");
});

Cypress.Commands.add("InterceptNavSearchIndexAsUnavailable", () => {
  cy.intercept("GET", "**/sidetrack-nav-search.json", { statusCode: 503, body: "{}" }).as(
    "navJsonFail",
  );
});

Cypress.Commands.add("SideTrackedFilesTreeShouldContainReadmeLink", () => {
  cy.get('[role="tree"]', { timeout: 15000 }).contains("a", "README.md");
});

Cypress.Commands.add("TypeTextInSearchField", (text) => {
  cy.get(shellA11y.search.region).within(() => {
    cy.get('input[type="search"]').type(text);
  });
});

Cypress.Commands.add("SearchResultsPanelShouldBeVisible", () => {
  cy.get("#search-results").should("be.visible");
});

Cypress.Commands.add("PressEscapeInSearchField", () => {
  cy.get(shellA11y.search.region).within(() => {
    cy.get('input[type="search"]').type("{esc}");
  });
});

Cypress.Commands.add("SearchFieldValueShouldBeEmpty", () => {
  cy.get(shellA11y.search.region).within(() => {
    cy.get('input[type="search"]').should("have.value", "");
  });
});

Cypress.Commands.add("SearchResultsPanelShouldBeHidden", () => {
  cy.get("#search-results").should("not.be.visible");
});

Cypress.Commands.add("SearchResultsHitMarksShouldExist", () => {
  cy.get("#search-results mark").should("have.length.at.least", 1);
});

Cypress.Commands.add("PressArrowDownInSearchField", () => {
  cy.get(shellA11y.search.input).type("{downarrow}");
});

Cypress.Commands.add("SearchResultsShouldMentionIndexedSourceFiles", () => {
  cy.get("#search-results .hint").first().should("contain", "Indexed source files");
});

Cypress.Commands.add("SearchResultsHitButtonsShouldExist", () => {
  cy.get(shellA11y.search.hitButton).should("have.length.at.least", 1);
});

Cypress.Commands.add("OptionsOfAngleSelectShouldIncludeMainAndArchitecture", () => {
  cy.get(shellA11y.angleSelect).should("exist");
  cy.get(`${shellA11y.angleSelect} option`).should("have.length.at.least", 2);
  cy.get(`${shellA11y.angleSelect} option[value="main"]`).should("exist");
  cy.get(`${shellA11y.angleSelect} option[value="architecture"]`).should("exist");
});

Cypress.Commands.add("DisplayedValueOfAngleSelectShouldBe", (value) => {
  cy.get(shellA11y.angleSelect).should("have.value", value);
});

Cypress.Commands.add("ChooseValueOfAngleSelect", (value) => {
  cy.get(shellA11y.angleSelect).select(value);
});

Cypress.Commands.add("SideTrackPaneShouldContainText", (text) => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(shellA11y.shell).should("contain", text);
    } else {
      cy.get(shellA11y.panes.sidetrack).should("contain", text);
    }
  });
});

Cypress.Commands.add("ShellPairBrowseLinkShouldMatchRelativeBrowseHtml", () => {
  cy.get(shellA11y.shell)
    .should("have.attr", "data-sidetrack-pair-browse-href")
    .and("match", BROWSE_LINK_REL_OR_ABS_RE);
});

Cypress.Commands.add("ShellPairBrowseLinkShouldNotPointAtGithubHost", () => {
  cy.get(shellA11y.shell)
    .should("have.attr", "data-sidetrack-pair-browse-href")
    .and("not.include", "github.com");
});

Cypress.Commands.add("DocPaneMermaidShouldShowDiagramOrMarkup", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(shellA11y.shell, { timeout: MERMAID_E2E_TIMEOUT_MS }).should(($scope) => {
        const mermaidBlocks = $scope.find(
          `.stretch-doc-inner ${shellA11y.sidetrackMermaid}, .stretch-preamble ${shellA11y.sidetrackMermaid}`,
        );
        expect(mermaidBlocks.length, "stretch mermaid block count").to.be.at.least(1);
        const svgCount = mermaidBlocks.find("svg").length;
        expect(svgCount, "stretch rendered mermaid svg count").to.be.at.least(1);
        mermaidBlocks.toArray().forEach((node, index) => {
          const text = Cypress.$(node).text();
          expect(
            text,
            `stretch mermaid syntax error output (block ${String(index + 1)})`,
          ).not.to.contain(MERMAID_SYNTAX_ERROR_SNIPPET);
        });
      });
    } else {
      cy.get(shellA11y.docPaneBody, { timeout: MERMAID_E2E_TIMEOUT_MS }).should(($scope) => {
        const mermaidBlocks = $scope.find(shellA11y.sidetrackMermaid);
        expect(mermaidBlocks.length, "dual mermaid block count").to.be.at.least(1);
        const svgCount = mermaidBlocks.find("svg").length;
        expect(svgCount, "dual rendered mermaid svg count").to.be.at.least(1);
        mermaidBlocks.toArray().forEach((node, index) => {
          const text = Cypress.$(node).text();
          expect(
            text,
            `dual mermaid syntax error output (block ${String(index + 1)})`,
          ).not.to.contain(MERMAID_SYNTAX_ERROR_SNIPPET);
        });
      });
    }
  });
});

/** Asserts diagram SVG is present — use after dual-mobile pane toggles when the stricter `DocPaneMermaidShouldShowDiagramOrMarkup` copy checks are not required. */
Cypress.Commands.add("DocPaneMermaidSvgShouldExist", () => {
  cy.get(shellA11y.shell).then(($shell) => {
    if ($shell.attr("data-layout") === "stretch") {
      cy.get(
        `${shellA11y.shell} .stretch-doc-inner ${shellA11y.sidetrackMermaid}, ${shellA11y.shell} .stretch-preamble ${shellA11y.sidetrackMermaid}`,
        {
          timeout: MERMAID_E2E_TIMEOUT_MS,
        },
      )
        .find("svg")
        .should("have.length.at.least", 1);
    } else {
      cy.get(`${shellA11y.docPaneBody} ${shellA11y.sidetrackMermaid}`, {
        timeout: MERMAID_E2E_TIMEOUT_MS,
      })
        .find("svg")
        .should("have.length.at.least", 1);
    }
  });
});

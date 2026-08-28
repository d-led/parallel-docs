import { describe, expect, it } from "vitest";

import {
  browsePairStaticBrowseRelUrl,
  canonicalHumaneBrowseRedirectHref,
} from "./browse-pair-static-url.js";

function resolvedBrowsePathname(aliasRelPath: string, href: string): string {
  const origin = "http://127.0.0.1:4173";
  /** Matches static hosts that serve `index.html` for a directory while keeping a no-trailing-slash URL in the bar. */
  const base = `${origin}/browse/${aliasRelPath}`;
  return new URL(href, base).pathname;
}

describe("canonicalHumaneBrowseRedirectHref", () => {
  const target = "docs/canonical@main.html";

  it("Given a nested humane alias, when the document URL has no trailing slash, then the redirect still lands under /browse/", () => {
    const alias = "docs/manual.md";
    const href = canonicalHumaneBrowseRedirectHref(alias, target);
    expect(href).toBe(`canonical@main.html`);
    expect(resolvedBrowsePathname(alias, href)).toBe(`/browse/docs/canonical@main.html`);
  });

  it("Given a deeper nested alias, when the URL has no trailing slash, then the redirect still lands under /browse/", () => {
    const alias = "docs/spec/blocks.md";
    const href = canonicalHumaneBrowseRedirectHref(alias, target);
    expect(href).toBe(`../canonical@main.html`);
    expect(resolvedBrowsePathname(alias, href)).toBe(`/browse/docs/canonical@main.html`);
  });

  it("Given a single-segment alias, then the href is sibling-style under /browse/", () => {
    const alias = "README.md";
    const t = "README.md@main.html";
    const href = canonicalHumaneBrowseRedirectHref(alias, t);
    expect(href).toBe("README.md@main.html");
    expect(resolvedBrowsePathname(alias, href)).toBe(`/browse/README.md@main.html`);
  });

  it("Given src/x.ts style alias, then one ../ segment is enough for no-slash resolution", () => {
    const alias = "src/x.ts";
    const t = "pkg/deep@arch.html";
    const href = canonicalHumaneBrowseRedirectHref(alias, t);
    expect(href).toBe(`../pkg/deep@arch.html`);
    expect(resolvedBrowsePathname(alias, href)).toBe(`/browse/pkg/deep@arch.html`);
  });

  it("Rejects the broken relative that escapes /browse/ from a no-slash manual.md URL", () => {
    const alias = "docs/manual.md";
    const broken = "../../../canonical@main.html";
    expect(resolvedBrowsePathname(alias, broken)).toBe(`/canonical@main.html`);
    expect(resolvedBrowsePathname(alias, broken)).not.toMatch(/^\/browse\//);
  });
});

describe("browsePairStaticBrowseRelUrl", () => {
  const storage = ".sidetrack";

  it("prefixes ./browse/ with mirrored index path for a flat companion", () => {
    expect(
      browsePairStaticBrowseRelUrl(
        {
          sourcePath: "src/x.ts",
          sidetrackPath: ".sidetrack/source/src/x.ts.md",
        },
        storage,
      ),
    ).toBe("./browse/src/x.ts/index.html");
  });

  it("mirrors angles under the source directory (not @angle flat files)", () => {
    expect(
      browsePairStaticBrowseRelUrl(
        {
          sourcePath: "README.md",
          sidetrackPath: ".sidetrack/source/README.md/main.md",
        },
        storage,
      ),
    ).toBe("./browse/README.md/main/index.html");
  });

  it("mirrors dotfile angles under browse/ (no %2E encoding for storage mirror)", () => {
    expect(
      browsePairStaticBrowseRelUrl(
        {
          sourcePath: ".sidetrack.toml",
          sidetrackPath: ".sidetrack/source/.sidetrack.toml/main.md",
        },
        storage,
      ),
    ).toBe("./browse/.sidetrack.toml/main/index.html");
  });

  it("uses ./browse/ (never host-root /browse/) for deep package paths so nav JSON and static shells stay portable", () => {
    const url = browsePairStaticBrowseRelUrl(
      {
        sourcePath: "packages/cli/src/cli.ts",
        sidetrackPath: ".sidetrack/source/packages/cli/src/cli.ts/main.md",
      },
      storage,
    );
    expect(url).toBe("./browse/packages/cli/src/cli.ts/main/index.html");
    expect(url.startsWith("./browse/")).toBe(true);
    expect(url.startsWith("/browse/")).toBe(false);
  });
});

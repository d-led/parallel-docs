import { describe, expect, it } from "vitest";

import {
  appendHtmlToOpaqueBrowsePathname,
  appendHtmlToOpaqueBrowseRequestUrl,
  findDocumentedPair,
  isHubRelativeStaticBrowseHref,
  isSameDocumentedPair,
  normPosixPath,
  resolveStaticBrowseHref,
  siteRootPathnameFromPathname,
  staticBrowseHrefForShellDataAttribute,
} from "./code-browser-pair-nav.js";

describe("appendHtmlToOpaqueBrowsePathname", () => {
  it("appends .html for extensionless opaque slug URLs", () => {
    expect(appendHtmlToOpaqueBrowsePathname("/browse/q-j-IF9uLQ-C70PFH-96neaB0WJD")).toBe(
      "/browse/q-j-IF9uLQ-C70PFH-96neaB0WJD.html",
    );
    expect(appendHtmlToOpaqueBrowsePathname("/sidetrack/browse/q-j-IF9uLQ-C70PFH-96neaB0WJD")).toBe(
      "/sidetrack/browse/q-j-IF9uLQ-C70PFH-96neaB0WJD.html",
    );
  });

  it("leaves indexed and already-suffixed paths unchanged", () => {
    expect(appendHtmlToOpaqueBrowsePathname("/browse/docs/manual.md/index.html")).toBe(
      "/browse/docs/manual.md/index.html",
    );
    expect(appendHtmlToOpaqueBrowsePathname("/browse/x.html")).toBe("/browse/x.html");
  });
});

describe("appendHtmlToOpaqueBrowseRequestUrl", () => {
  it("preserves query string", () => {
    expect(appendHtmlToOpaqueBrowseRequestUrl("/browse/AbCd?q=1")).toBe("/browse/AbCd.html?q=1");
  });
});

describe("normPosixPath", () => {
  it("should trim and normalize slashes", () => {
    expect(normPosixPath(" ./foo/bar ")).toBe("foo/bar");
  });
});

describe("siteRootPathnameFromPathname", () => {
  it("should strip /browse/... so browse links resolve from the hub root", () => {
    expect(siteRootPathnameFromPathname("/repo/browse/abc.html")).toBe("/repo");
    expect(siteRootPathnameFromPathname("/browse/abc.html")).toBe("/");
  });

  it("should strip the filename for the hub index", () => {
    expect(siteRootPathnameFromPathname("/repo/index.html")).toBe("/repo");
    expect(siteRootPathnameFromPathname("/index.html")).toBe("/");
  });
});

describe("isHubRelativeStaticBrowseHref", () => {
  it("should accept hub-root browse URLs from nav JSON", () => {
    expect(isHubRelativeStaticBrowseHref("./browse/x.html")).toBe(true);
    expect(isHubRelativeStaticBrowseHref("browse/y.html")).toBe(true);
    expect(isHubRelativeStaticBrowseHref("./browse/pkg%2Fsrc%2Ffoo.ts/index.html")).toBe(true);
    expect(isHubRelativeStaticBrowseHref("./browse/docs/readme@main.html")).toBe(true);
    expect(isHubRelativeStaticBrowseHref("/browse/README.md/main/index.html")).toBe(true);
  });

  it("should reject non-browse relative links", () => {
    expect(isHubRelativeStaticBrowseHref("./docs/a.md")).toBe(false);
    expect(isHubRelativeStaticBrowseHref("../index.html")).toBe(false);
    expect(isHubRelativeStaticBrowseHref("https://ex/browse/z.html")).toBe(false);
  });
});

describe("resolveStaticBrowseHref", () => {
  it("should pass through path-absolute browse URLs unchanged apart from origin", () => {
    const origin = "http://127.0.0.1:14173";
    expect(resolveStaticBrowseHref("/browse/a/index.html", "/browse/b/c/index.html", origin)).toBe(
      `${origin}/browse/a/index.html`,
    );
  });

  it("should prefix ./browse/ from the site root, not double /browse/ when already under browse", () => {
    const origin = "https://pages.github.io";
    expect(resolveStaticBrowseHref("./browse/slug.html", "/repo/browse/current.html", origin)).toBe(
      "https://pages.github.io/repo/browse/slug.html",
    );
    expect(resolveStaticBrowseHref("./browse/slug.html", "/repo/index.html", origin)).toBe(
      "https://pages.github.io/repo/browse/slug.html",
    );
  });

  it("should resolve human ./browse/…/index.html paths under a Pages-style repo root", () => {
    const origin = "https://pages.github.io";
    expect(
      resolveStaticBrowseHref("./browse/README.md/index.html", "/repo/browse/current.html", origin),
    ).toBe("https://pages.github.io/repo/browse/README.md/index.html");
  });

  it("should resolve multi-segment flat shims (duplicate angles) without nesting under the current browse path", () => {
    const origin = "https://pages.github.io";
    expect(
      resolveStaticBrowseHref(
        "./browse/docs/readme@main.html",
        "/repo/browse/docs/other/index.html",
        origin,
      ),
    ).toBe("https://pages.github.io/repo/browse/docs/readme@main.html");
    expect(
      resolveStaticBrowseHref("./browse/AbCdEf.html", "/repo/browse/docs/other/index.html", origin),
    ).toBe("https://pages.github.io/repo/browse/AbCdEf.html");
  });
});

describe("staticBrowseHrefForShellDataAttribute", () => {
  it("should keep hub-relative browse URLs as ./browse/… for the shell data attribute", () => {
    const origin = "http://127.0.0.1:14173";
    expect(staticBrowseHrefForShellDataAttribute("./browse/Ab.html", "/", origin)).toBe(
      "./browse/Ab.html",
    );
    expect(staticBrowseHrefForShellDataAttribute("browse/Xy.html", "/any/path", origin)).toBe(
      "./browse/Xy.html",
    );
    expect(
      staticBrowseHrefForShellDataAttribute("./browse/src%2Fx.ts/index.html", "/", origin),
    ).toBe("./browse/src%2Fx.ts/index.html");
    expect(staticBrowseHrefForShellDataAttribute("/browse/pkg/x/index.html", "/", origin)).toBe(
      "./browse/pkg/x/index.html",
    );
  });

  it("should still resolve absolute click targets when the URL is not static browse", () => {
    const origin = "https://ex.com";
    expect(staticBrowseHrefForShellDataAttribute("./other.md", "/hub/", origin)).toBe(
      "https://ex.com/hub/other.md",
    );
  });
});

describe("findDocumentedPair", () => {
  const pairs = [
    {
      sourcePath: "README.md",
      sidetrackPath: ".sidetrack/source/README.md/main.md",
      sidetrackOnGithub: "https://github.com/x/blob/y/main.md",
    },
    {
      sourcePath: "docs/a.md",
      sidetrackPath: ".sidetrack/source/docs/a.md/main.md",
      sidetrackOnGithub: "https://github.com/x/blob/y/a.md",
    },
  ];

  it("should match by sidetrack path first", () => {
    const p = findDocumentedPair(pairs, ".sidetrack/source/docs/a.md/main.md", "");
    expect(p?.sourcePath).toBe("docs/a.md");
  });

  it("should match by source path when sidetrack is empty", () => {
    const p = findDocumentedPair(pairs, "", "docs/a.md");
    expect(p?.sidetrackPath).toBe(".sidetrack/source/docs/a.md/main.md");
  });
});

describe("isSameDocumentedPair", () => {
  it("should compare normalized paths", () => {
    const p = {
      sourcePath: "README.md",
      sidetrackPath: ".sidetrack/source/README.md/main.md",
      sidetrackOnGithub: "x",
    };
    expect(isSameDocumentedPair(p, "README.md", ".sidetrack/source/README.md/main.md")).toBe(true);
    expect(isSameDocumentedPair(p, "other.md", ".sidetrack/source/README.md/main.md")).toBe(false);
  });
});

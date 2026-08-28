import { describe, expect, it } from "vitest";

import { githubRepoBlobFileUrl, parseGithubRepoWebUrl } from "./github-url.js";

describe("Parsing GitHub repository web URLs", () => {
  it("parses canonical https URLs", () => {
    expect(parseGithubRepoWebUrl("https://github.com/d-led/parallel-docs")).toEqual({
      owner: "d-led",
      repo: "parallel-docs",
    });
  });

  it("accepts trailing slash, .git suffix, and http", () => {
    expect(parseGithubRepoWebUrl("http://github.com/foo/bar.git/")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });

  it("returns null for blob paths, other hosts, or malformed input", () => {
    expect(
      parseGithubRepoWebUrl("https://github.com/d-led/parallel-docs/blob/main/README.md"),
    ).toBe(null);
    expect(parseGithubRepoWebUrl("https://example.com/acme/demo")).toBe(null);
    expect(parseGithubRepoWebUrl("not a url")).toBe(null);
  });
});

describe("Building GitHub blob URLs for repository files", () => {
  it("joins encoded path segments with slashes for the blob URL", () => {
    expect(githubRepoBlobFileUrl("acme", "demo", "main", "docs/spec/storage.md")).toBe(
      "https://github.com/acme/demo/blob/main/docs/spec/storage.md",
    );
    expect(githubRepoBlobFileUrl("acme", "demo", "main", "weird name.md")).toBe(
      "https://github.com/acme/demo/blob/main/weird%20name.md",
    );
  });
});

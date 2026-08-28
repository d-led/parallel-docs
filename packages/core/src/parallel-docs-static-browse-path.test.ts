import { describe, expect, it } from "vitest";

import { defaultParallelDocsStaticBrowsePathResolver } from "./browse-path-default.js";
import { staticBrowseIndexRelPathFromPair } from "./parallel-docs-static-browse-path.js";

const STORAGE = ".parallel-docs";

describe("staticBrowseIndexRelPathFromPair — default resolver", () => {
  it("defaultParallelDocsStaticBrowsePathResolver delegates to the same implementation", () => {
    const pair = {
      sourcePath: "README.md",
      parallelDocsPath: ".parallel-docs/source/README.md/main.md",
    };
    expect(
      defaultParallelDocsStaticBrowsePathResolver.browseIndexRelPathFromPair(pair, STORAGE),
    ).toBe(staticBrowseIndexRelPathFromPair(pair, STORAGE));
  });
});

describe("staticBrowseIndexRelPathFromPair — core mirrors", () => {
  it("mirrors Angles storage: .parallel-docs/source/.parallel-docs.toml/main.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: ".parallel-docs.toml",
          parallelDocsPath: ".parallel-docs/source/.parallel-docs.toml/main.md",
        },
        STORAGE,
      ),
    ).toBe(".parallel-docs.toml/main/index.html");
  });

  it("mirrors flat companion: .parallel-docs/source/src/x.ts.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "src/x.ts", parallelDocsPath: ".parallel-docs/source/src/x.ts.md" },
        STORAGE,
      ),
    ).toBe("src/x.ts/index.html");
  });

  it("mirrors README multi-angle: README.md/main.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "README.md", parallelDocsPath: ".parallel-docs/source/README.md/main.md" },
        STORAGE,
      ),
    ).toBe("README.md/main/index.html");
  });

  it("mirrors a second angle path under the same source filename", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: "README.md",
          parallelDocsPath: ".parallel-docs/source/README.md/architecture.md",
        },
        STORAGE,
      ),
    ).toBe("README.md/architecture/index.html");
  });

  it("falls back to encoded repo source path when parallel-docs is outside storage/source", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "pkg/x.ts", parallelDocsPath: "weird/elsewhere.md" },
        STORAGE,
      ),
    ).toBe("pkg/x.ts/index.html");
  });

  it("uses custom storageDir prefix when mirroring", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a.ts", parallelDocsPath: "docs-cr/source/a.ts/main.md" },
        "docs-cr",
      ),
    ).toBe("a.ts/main/index.html");
  });

  it("normalizes Windows separators on parallelDocsPath and storageDir", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "src\\x.ts", parallelDocsPath: ".parallel-docs\\source\\src\\x.ts.md" },
        ".parallel-docs",
      ),
    ).toBe("src/x.ts/index.html");
  });
});

describe("staticBrowseIndexRelPathFromPair — dotfiles and path shape", () => {
  it("mirrors dotfile companion at repo root: .gitignore.md flat layout", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: ".gitignore",
          parallelDocsPath: ".parallel-docs/source/.gitignore.md",
        },
        STORAGE,
      ),
    ).toBe(".gitignore/index.html");
  });

  it("mirrors dot-directory segment in the middle: packages/.internal/readme.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: "packages/.internal/readme.ts",
          parallelDocsPath: ".parallel-docs/source/packages/.internal/readme.ts.md",
        },
        STORAGE,
      ),
    ).toBe("packages/.internal/readme.ts/index.html");
  });

  it("mirrors angles under nested dot dir: pkg/.rc/custom/main.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: "pkg/.rc/custom.ts",
          parallelDocsPath: ".parallel-docs/source/pkg/.rc/custom.ts/main.md",
        },
        STORAGE,
      ),
    ).toBe("pkg/.rc/custom.ts/main/index.html");
  });

  it("treats .md case-insensitively for mirror branch", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "X.ts", parallelDocsPath: ".parallel-docs/source/X.ts.MD" },
        STORAGE,
      ),
    ).toBe("X.ts/index.html");
  });

  it("strips redundant ./ segments after normalization", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a/b.ts", parallelDocsPath: ".parallel-docs/source/./a/b.ts.md" },
        STORAGE,
      ),
    ).toBe("a/b.ts/index.html");
  });
});

describe("staticBrowseIndexRelPathFromPair — fallback and validation", () => {
  it("falls back when companion under storage/source is not markdown", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "notes.txt", parallelDocsPath: ".parallel-docs/source/notes.txt" },
        STORAGE,
      ),
    ).toBe("notes.txt/index.html");
  });

  it("falls back with encoded dot-leading source segments", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: ".env.local", parallelDocsPath: "orphan.md" },
        STORAGE,
      ),
    ).toBe("%2Eenv.local/index.html");
  });

  it("falls back to pair/index.html when sourcePath is empty and parallel-docs is outside prefix", () => {
    expect(
      staticBrowseIndexRelPathFromPair({ sourcePath: "", parallelDocsPath: "x.md" }, STORAGE),
    ).toBe("pair/index.html");
  });

  it("rejects sourcePath that escapes the repo", () => {
    expect(() =>
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "../evil.ts", parallelDocsPath: "x.md" },
        STORAGE,
      ),
    ).toThrow(/escapes repository root/);
  });

  it("rejects parallelDocsPath that escapes the repo", () => {
    expect(() =>
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a.ts", parallelDocsPath: ".parallel-docs/source/../secret.md" },
        STORAGE,
      ),
    ).toThrow(/escapes repository root/);
  });
});

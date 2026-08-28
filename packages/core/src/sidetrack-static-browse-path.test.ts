import { describe, expect, it } from "vitest";

import { defaultSideTrackStaticBrowsePathResolver } from "./browse-path-default.js";
import { staticBrowseIndexRelPathFromPair } from "./sidetrack-static-browse-path.js";

const STORAGE = ".sidetrack";

describe("staticBrowseIndexRelPathFromPair — default resolver", () => {
  it("defaultSideTrackStaticBrowsePathResolver delegates to the same implementation", () => {
    const pair = {
      sourcePath: "README.md",
      sidetrackPath: ".sidetrack/source/README.md/main.md",
    };
    expect(defaultSideTrackStaticBrowsePathResolver.browseIndexRelPathFromPair(pair, STORAGE)).toBe(
      staticBrowseIndexRelPathFromPair(pair, STORAGE),
    );
  });
});

describe("staticBrowseIndexRelPathFromPair — core mirrors", () => {
  it("mirrors Angles storage: .sidetrack/source/.sidetrack.toml/main.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: ".sidetrack.toml",
          sidetrackPath: ".sidetrack/source/.sidetrack.toml/main.md",
        },
        STORAGE,
      ),
    ).toBe(".sidetrack.toml/main/index.html");
  });

  it("mirrors flat companion: .sidetrack/source/src/x.ts.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "src/x.ts", sidetrackPath: ".sidetrack/source/src/x.ts.md" },
        STORAGE,
      ),
    ).toBe("src/x.ts/index.html");
  });

  it("mirrors README multi-angle: README.md/main.md", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "README.md", sidetrackPath: ".sidetrack/source/README.md/main.md" },
        STORAGE,
      ),
    ).toBe("README.md/main/index.html");
  });

  it("mirrors a second angle path under the same source filename", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        {
          sourcePath: "README.md",
          sidetrackPath: ".sidetrack/source/README.md/architecture.md",
        },
        STORAGE,
      ),
    ).toBe("README.md/architecture/index.html");
  });

  it("falls back to encoded repo source path when sidetrack is outside storage/source", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "pkg/x.ts", sidetrackPath: "weird/elsewhere.md" },
        STORAGE,
      ),
    ).toBe("pkg/x.ts/index.html");
  });

  it("uses custom storageDir prefix when mirroring", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a.ts", sidetrackPath: "docs-cr/source/a.ts/main.md" },
        "docs-cr",
      ),
    ).toBe("a.ts/main/index.html");
  });

  it("normalizes Windows separators on sidetrackPath and storageDir", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "src\\x.ts", sidetrackPath: ".sidetrack\\source\\src\\x.ts.md" },
        ".sidetrack",
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
          sidetrackPath: ".sidetrack/source/.gitignore.md",
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
          sidetrackPath: ".sidetrack/source/packages/.internal/readme.ts.md",
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
          sidetrackPath: ".sidetrack/source/pkg/.rc/custom.ts/main.md",
        },
        STORAGE,
      ),
    ).toBe("pkg/.rc/custom.ts/main/index.html");
  });

  it("treats .md case-insensitively for mirror branch", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "X.ts", sidetrackPath: ".sidetrack/source/X.ts.MD" },
        STORAGE,
      ),
    ).toBe("X.ts/index.html");
  });

  it("strips redundant ./ segments after normalization", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a/b.ts", sidetrackPath: ".sidetrack/source/./a/b.ts.md" },
        STORAGE,
      ),
    ).toBe("a/b.ts/index.html");
  });
});

describe("staticBrowseIndexRelPathFromPair — fallback and validation", () => {
  it("falls back when companion under storage/source is not markdown", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "notes.txt", sidetrackPath: ".sidetrack/source/notes.txt" },
        STORAGE,
      ),
    ).toBe("notes.txt/index.html");
  });

  it("falls back with encoded dot-leading source segments", () => {
    expect(
      staticBrowseIndexRelPathFromPair(
        { sourcePath: ".env.local", sidetrackPath: "orphan.md" },
        STORAGE,
      ),
    ).toBe("%2Eenv.local/index.html");
  });

  it("falls back to pair/index.html when sourcePath is empty and sidetrack is outside prefix", () => {
    expect(
      staticBrowseIndexRelPathFromPair({ sourcePath: "", sidetrackPath: "x.md" }, STORAGE),
    ).toBe("pair/index.html");
  });

  it("rejects sourcePath that escapes the repo", () => {
    expect(() =>
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "../evil.ts", sidetrackPath: "x.md" },
        STORAGE,
      ),
    ).toThrow(/escapes repository root/);
  });

  it("rejects sidetrackPath that escapes the repo", () => {
    expect(() =>
      staticBrowseIndexRelPathFromPair(
        { sourcePath: "a.ts", sidetrackPath: ".sidetrack/source/../secret.md" },
        STORAGE,
      ),
    ).toThrow(/escapes repository root/);
  });
});

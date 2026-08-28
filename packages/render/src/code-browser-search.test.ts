import { describe, expect, it } from "vitest";
import {
  escapeHtmlHighlightingSearchTokens,
  filterPairsByDocumentedTreeQuery,
  findOrderedTokenSpans,
  lineAtIndex,
  offsetToLineIndex,
  pathRowsFromDocumentedPairs,
  uniqueSourceFilePreviewRows,
} from "./code-browser-search.js";

describe("Ordered in-line search token matching", () => {
  it("should locate every query token in order on a single line", () => {
    const spans = findOrderedTokenSpans("const x = 1;", ["const", "x"]);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBeGreaterThan(spans[0].start);
    expect("const x = 1;".slice(spans[0].start, spans[0].end).toLowerCase()).toMatch(/const.*x/);
  });

  it("should follow token order across line breaks", () => {
    const text = "const a = 1;\nconst b = 2;\nreturn a + b;";
    const spans = findOrderedTokenSpans(text, ["const", "return"]);
    expect(spans.length).toBeGreaterThan(0);
    const first = spans[0];
    expect(first.start).toBe(0);
    expect(first.end).toBeGreaterThanOrEqual(text.indexOf("return") + "return".length);
  });

  it("should yield no spans when a later token never appears", () => {
    expect(findOrderedTokenSpans("hello", ["hello", "missing"])).toEqual([]);
  });

  it("should ignore blank tokens in the query list", () => {
    expect(findOrderedTokenSpans("ab", ["  ", "a", ""])).toEqual([{ start: 0, end: 1 }]);
  });

  it("should match ASCII tokens without regard to letter case", () => {
    const spans = findOrderedTokenSpans("# ParallelDocs quick-start\n", ["paralleldocs"]);
    expect(spans.length).toBeGreaterThan(0);
  });
});

describe("Documented-files tree path filter", () => {
  const pairs = [
    { sourcePath: "packages/foo/src/a.ts", parallelDocsPath: "c1" },
    { sourcePath: "packages/bar/b.ts", parallelDocsPath: "c2" },
  ];

  it("should return all pairs when the filter is empty or whitespace", () => {
    expect(filterPairsByDocumentedTreeQuery(pairs, "").length).toBe(2);
    expect(filterPairsByDocumentedTreeQuery(pairs, "   ").length).toBe(2);
  });

  it("should keep paths where every token appears in order as case-insensitive substrings", () => {
    expect(
      filterPairsByDocumentedTreeQuery(pairs, "packages foo").map((p) => p.sourcePath),
    ).toEqual(["packages/foo/src/a.ts"]);
    expect(filterPairsByDocumentedTreeQuery(pairs, "bar b").map((p) => p.sourcePath)).toEqual([
      "packages/bar/b.ts",
    ]);
  });

  it("should normalize backslashes before matching", () => {
    const mixed = [{ sourcePath: "pkg\\x\\y.ts", parallelDocsPath: "c" }];
    expect(filterPairsByDocumentedTreeQuery(mixed, "pkg x").length).toBe(1);
  });
});

describe("Mapping character offsets to line indices", () => {
  it("should map each offset to the correct zero-based line", () => {
    const t = "a\nb\nc";
    expect(offsetToLineIndex(t, 0)).toBe(0);
    expect(offsetToLineIndex(t, 2)).toBe(1);
    expect(offsetToLineIndex(t, 4)).toBe(2);
  });
});

describe("Fetching a single line by index", () => {
  it("should return the full line text for a valid index", () => {
    expect(lineAtIndex("x\nyz", 1)).toBe("yz");
  });
});

describe("Search snippet HTML with safe highlighting", () => {
  it("should escape markup and wrap hits in mark.search-hit", () => {
    const html = escapeHtmlHighlightingSearchTokens('Say <script> & "hi"', ["hi"]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<mark class="search-hit">hi</mark>');
  });

  it("should highlight ASCII hits case-insensitively", () => {
    const html = escapeHtmlHighlightingSearchTokens("ParallelDocs on GitHub", ["paralleldocs"]);
    expect(html).toMatch(/<mark class="search-hit">ParallelDocs<\/mark>/i);
  });

  it("should escape the snippet and emit no marks when there are no real tokens", () => {
    expect(escapeHtmlHighlightingSearchTokens("<x>", [])).toBe("&lt;x&gt;");
    expect(escapeHtmlHighlightingSearchTokens("<x>", ["  ", ""])).toBe("&lt;x&gt;");
  });
});

describe("Hub path rows from documented pairs", () => {
  it("should emit one source-path row per pair when the same source file has multiple angles", () => {
    const pairs = [
      {
        sourcePath: "README.md",
        parallelDocsPath: ".parallel-docs/source/README.md/architecture.md",
      },
      {
        sourcePath: "README.md",
        parallelDocsPath: ".parallel-docs/source/README.md/main.md",
      },
    ];
    const rows = pathRowsFromDocumentedPairs(pairs);
    const readmeRows = rows.filter((r) => r.text === "README.md");
    expect(readmeRows).toHaveLength(2);
    expect(readmeRows.map((r) => r.crPath)).toEqual([
      ".parallel-docs/source/README.md/architecture.md",
      ".parallel-docs/source/README.md/main.md",
    ]);
  });
});

describe("Empty-search browse preview rows (distinct source files)", () => {
  it("should collapse multi-angle pairs to one row per source with the smallest parallel-docs path", () => {
    const { rows, totalUnique } = uniqueSourceFilePreviewRows(
      [
        { sourcePath: "README.md", parallelDocsPath: "b.md" },
        { sourcePath: "README.md", parallelDocsPath: "a.md" },
      ],
      80,
    );
    expect(totalUnique).toBe(1);
    expect(rows).toEqual([{ sourcePath: "README.md", parallelDocsPath: "a.md" }]);
  });

  it("should sort by source path and cap the list", () => {
    const many = Array.from({ length: 85 }, (_, i) => ({
      sourcePath: `f/${String(i).padStart(3, "0")}.ts`,
      parallelDocsPath: `c/${String(i)}.md`,
    }));
    const { rows, totalUnique } = uniqueSourceFilePreviewRows(many, 80);
    expect(totalUnique).toBe(85);
    expect(rows).toHaveLength(80);
    expect(rows[0]?.sourcePath).toBe("f/000.ts");
    expect(rows[79]?.sourcePath).toBe("f/079.ts");
  });
});

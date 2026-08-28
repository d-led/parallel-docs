import { CURRENT_SCHEMA_VERSION } from "@parallel-docs/core";
import { describe, expect, it } from "vitest";

import { tryBuildBlockStretchTableHtml } from "./block-stretch-layout.js";

const crPath = ".parallel-docs/source/pkg/x.txt.md";

function tinyIndex() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byParallelDocsPath: {
      [crPath]: {
        sourcePath: "pkg/x.txt",
        parallelDocsPath: crPath,
        blocks: [{ id: "b1", anchor: "lines:2-3" }],
      },
    },
  };
}

describe("Block-aligned stretch table HTML", () => {
  it("table strategy omits flow-synchronizer wrappers (legacy)", async () => {
    const md = "<!-- parallelDocs:block id=b1 -->\n\n## Hi\n\nBody.\n";
    const out = await tryBuildBlockStretchTableHtml({
      code: "gap\na\nb",
      language: "txt",
      parallelDocsMarkdown: md,
      index: tinyIndex(),
      sourceRelative: "pkg/x.txt",
      parallelDocsPathRel: crPath,
      stretchBufferSync: "table",
    });
    expect(out).not.toBeNull();
    if (out === null) throw new Error("expected table");
    expect(out.tableInnerHtml).not.toContain("stretch-cell-measure");
    expect(out.tableInnerHtml).not.toContain("data-parallel-docs-stretch-sync-id");
  });

  it("default flow-synchronizer: one blame-style row per block (no rowspan), sync ids + measure wrappers", async () => {
    const md = "<!-- parallelDocs:block id=b1 -->\n\n## Hi\n\nBody.\n";
    const out = await tryBuildBlockStretchTableHtml({
      code: "gap\na\nb",
      language: "txt",
      parallelDocsMarkdown: md,
      index: tinyIndex(),
      sourceRelative: "pkg/x.txt",
      parallelDocsPathRel: crPath,
    });
    expect(out).not.toBeNull();
    if (out === null) throw new Error("expected table");
    expect(out.tableInnerHtml).not.toContain("rowspan");
    expect(out.tableInnerHtml).toContain('class="stretch-code-stack"');
    expect(out.tableInnerHtml).toContain('id="code-line-1"');
    expect(out.tableInnerHtml).toContain('id="code-line-2"');
    expect((out.tableInnerHtml.match(/<tr /g) ?? []).length).toBe(2);
    expect((out.tableInnerHtml.match(/stretch-row--gap/g) ?? []).length).toBe(1);
    expect((out.tableInnerHtml.match(/stretch-row--block/g) ?? []).length).toBe(1);
    expect(out.tableInnerHtml).toContain('data-parallel-docs-stretch-sync-id="b1"');
    expect(out.tableInnerHtml).toContain('data-parallel-docs-stretch-sync-id="__gap__0"');
    expect((out.tableInnerHtml.match(/stretch-cell-measure/g) ?? []).length).toBe(4);
  });

  it("emits gap rows for marker viewport lines before the inner source range", async () => {
    const markerCr = ".parallel-docs/source/marker/readme.md.md";
    const src = ["pad", "# parallelDocs:start id=aa", "[inner]", "# parallelDocs:end id=aa"].join(
      "\n",
    );
    const md = "<!-- parallelDocs:block id=aa -->\n\n## Doc\n";
    const index = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath: {
        [markerCr]: {
          sourcePath: "marker/readme.md",
          parallelDocsPath: markerCr,
          blocks: [{ id: "aa", anchor: "marker:aa" }],
        },
      },
    };
    const out = await tryBuildBlockStretchTableHtml({
      code: src,
      language: "txt",
      parallelDocsMarkdown: md,
      index,
      sourceRelative: "marker/readme.md",
      parallelDocsPathRel: markerCr,
    });
    expect(out).not.toBeNull();
    if (out === null) throw new Error("expected table");
    /* pad + start marker are prefix gaps; inner is the block; end delimiter is an unmapped tail gap. */
    expect((out.tableInnerHtml.match(/stretch-row--gap/g) ?? []).length).toBe(3);
    expect((out.tableInnerHtml.match(/stretch-row--block/g) ?? []).length).toBe(1);
  });
});

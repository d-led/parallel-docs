import { describe, expect, it } from "vitest";
import type { SideTrackBlock } from "./model.js";
import type { ScmProvider } from "./scm/scm-provider.js";
import { diagnoseBlock } from "./staleness.js";

const scm: ScmProvider = {
  async getBlobIdAtHead() {
    return "blob";
  },
  async isAncestor() {
    return true;
  },
};

describe("Diagnosing stale or misaligned documentation blocks", () => {
  it("flags broken anchors", async () => {
    const block: SideTrackBlock = { id: "b", anchor: "lines:2-1" };
    const d = await diagnoseBlock({
      repoRoot: "/tmp",
      sourceRepoRelativePath: "src/a.ts",
      headCommit: "HEAD",
      blobAtHead: "blob",
      block,
      scm,
    });
    expect(d?.kind).toBe("broken_anchor");
  });

  it("flags blob drift when recorded", async () => {
    const block: SideTrackBlock = {
      id: "b",
      anchor: "lines:1-2",
      lastVerifiedCommit: "abc",
      lastVerifiedBlob: "old",
    };
    const d = await diagnoseBlock({
      repoRoot: "/tmp",
      sourceRepoRelativePath: "src/a.ts",
      headCommit: "HEAD",
      blobAtHead: "new",
      block,
      scm,
    });
    expect(d?.kind).toBe("review_needed");
  });
});

import type { SideTrackBlock } from "./model.js";
import type { ScmProvider } from "./scm/scm-provider.js";
import { parseAnchor } from "./anchors.js";

export type BlockDiagnostic = {
  blockId: string;
  anchor: string;
  kind: "broken_anchor" | "review_needed";
  detail: string;
};

export async function diagnoseBlock(args: {
  repoRoot: string;
  sourceRepoRelativePath: string;
  headCommit: string;
  blobAtHead: string | null;
  block: SideTrackBlock;
  scm: ScmProvider;
}): Promise<BlockDiagnostic | null> {
  const { block, scm, repoRoot, headCommit, blobAtHead } = args;
  try {
    parseAnchor(block.anchor);
  } catch (err) {
    return {
      blockId: block.id,
      anchor: block.anchor,
      kind: "broken_anchor",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!block.lastVerifiedCommit) return null;

  const isReachable = await scm.isAncestor(repoRoot, block.lastVerifiedCommit, headCommit);
  if (!isReachable) {
    return {
      blockId: block.id,
      anchor: block.anchor,
      kind: "review_needed",
      detail: "lastVerifiedCommit is not an ancestor of HEAD",
    };
  }

  if (block.lastVerifiedBlob && blobAtHead && block.lastVerifiedBlob !== blobAtHead) {
    return {
      blockId: block.id,
      anchor: block.anchor,
      kind: "review_needed",
      detail: "Primary file content at HEAD differs from lastVerifiedBlob",
    };
  }

  if (!blobAtHead) {
    return {
      blockId: block.id,
      anchor: block.anchor,
      kind: "review_needed",
      detail: "Source file is not tracked at HEAD; cannot fingerprint blob",
    };
  }

  return null;
}

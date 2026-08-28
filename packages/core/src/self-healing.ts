import {
  findParallelDocsBlockMarkerHits,
  recoverSourceMarkersFromSnippet,
  snippetFromRange,
} from "./blocks.js";
import { parseParallelDocsRegionBoundary } from "./source-markers.js";
import type { ParallelDocsIndex } from "./model.js";

export function healSourceFile(args: {
  sourceText: string;
  languageId: string;
  companionMarkdown: string;
  index: ParallelDocsIndex;
  parallelDocsPath: string;
}): {
  sourceText: string;
  index: ParallelDocsIndex;
  healedCount: number;
} {
  const markdownHits = findParallelDocsBlockMarkerHits(args.companionMarkdown);
  const entry = args.index.byParallelDocsPath[args.parallelDocsPath];
  if (!entry) {
    return { sourceText: args.sourceText, index: args.index, healedCount: 0 };
  }

  let currentSourceText = args.sourceText;
  let healedCount = 0;
  const updatedBlocks = [...entry.blocks];

  for (const hit of markdownHits) {
    const blockIndex = updatedBlocks.findIndex((b) => b.id === hit.id);
    if (blockIndex === -1) continue;
    const block = updatedBlocks[blockIndex];
    if (!block) continue;

    if (!hasRegionInSource(currentSourceText, block.id)) {
      const recovery = recoverSourceMarkersFromSnippet({
        sourceText: currentSourceText,
        languageId: args.languageId,
        block,
      });

      if (recovery.healed && recovery.range) {
        currentSourceText = recovery.sourceText;
        healedCount++;

        // Update block snippet in index based on healed source location
        const newSnippet = snippetFromRange(currentSourceText, recovery.range);
        updatedBlocks[blockIndex] = {
          ...block,
          snippet: newSnippet,
        };
      }
    }
  }

  if (healedCount === 0) {
    return { sourceText: args.sourceText, index: args.index, healedCount: 0 };
  }

  const nextByParallelDocsPath = {
    ...args.index.byParallelDocsPath,
    [args.parallelDocsPath]: {
      ...entry,
      blocks: updatedBlocks,
    },
  };

  return {
    sourceText: currentSourceText,
    index: {
      ...args.index,
      byParallelDocsPath: nextByParallelDocsPath,
    },
    healedCount,
  };
}

function hasRegionInSource(sourceText: string, markerId: string): boolean {
  const normalized = markerId.toLowerCase();
  const lines = sourceText.split("\n");
  for (const line of lines) {
    const hit = parseParallelDocsRegionBoundary(line);
    if (hit && hit.id.toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

/**
 * Self-contained, diff-inspired capture of the source lines a block refers to.
 * Stored as a single string in index.json (not a nested JSON object).
 *
 * Format (v1): header line `sidetrack-snippet/v1`, then one line per source
 * line using unified-diff **context** style: each line begins with a single
 * space followed by the trimmed source line (empty lines are a lone leading space).
 */
export const SIDETRACK_SNIPPET_HEADER_V1 = "sidetrack-snippet/v1" as const;

export function buildSideTrackSnippetV1(trimmedLines: string[]): string {
  const body = trimmedLines.map((line) => ` ${line}`).join("\n");
  return body.length === 0
    ? SIDETRACK_SNIPPET_HEADER_V1
    : `${SIDETRACK_SNIPPET_HEADER_V1}\n${body}`;
}

/** Returns trimmed lines, or null if the string is not a valid v1 snippet. */
export function parseSideTrackSnippetV1(snippet: string): string[] | null {
  const lines = snippet.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0 || lines[0] !== SIDETRACK_SNIPPET_HEADER_V1) return null;
  const out: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(" ")) return null;
    out.push(line.slice(1));
  }
  return out;
}

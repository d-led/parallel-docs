import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const EMPTY_PARALLEL_DOCS_MARKDOWN = "_No parallel-docs content configured._\n";

function emptyStateCtaMarkdownFromEnv(): string {
  const raw = process.env.PARALLEL_DOCS_EMPTY_STATE_MARKDOWN;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

export function emptyParallelDocsMarkdown(): string {
  const cta = emptyStateCtaMarkdownFromEnv();
  if (cta.length === 0) return EMPTY_PARALLEL_DOCS_MARKDOWN;
  return `${EMPTY_PARALLEL_DOCS_MARKDOWN}\n${cta}`;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function composeParallelDocsMarkdown(intro: string, fileMarkdown: string): string {
  const parts: string[] = [];
  if (intro.trim()) parts.push(intro.trim());
  if (fileMarkdown.trim()) parts.push(fileMarkdown.trim());
  if (parts.length === 0) return emptyParallelDocsMarkdown();
  return `${parts.join("\n\n")}\n`;
}

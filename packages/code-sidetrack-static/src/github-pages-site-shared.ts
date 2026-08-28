import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const EMPTY_SIDETRACK_MARKDOWN = "_No sidetrack content configured._\n";

function emptyStateCtaMarkdownFromEnv(): string {
  const raw = process.env.SIDETRACK_EMPTY_STATE_MARKDOWN;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

export function emptySideTrackMarkdown(): string {
  const cta = emptyStateCtaMarkdownFromEnv();
  if (cta.length === 0) return EMPTY_SIDETRACK_MARKDOWN;
  return `${EMPTY_SIDETRACK_MARKDOWN}\n${cta}`;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function composeSideTrackMarkdown(intro: string, fileMarkdown: string): string {
  const parts: string[] = [];
  if (intro.trim()) parts.push(intro.trim());
  if (fileMarkdown.trim()) parts.push(fileMarkdown.trim());
  if (parts.length === 0) return emptySideTrackMarkdown();
  return `${parts.join("\n\n")}\n`;
}

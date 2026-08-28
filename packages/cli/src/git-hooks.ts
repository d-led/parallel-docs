/**
 * Idempotent injection of a ParallelDocs-managed block into `.git/hooks/pre-commit`.
 * Re-running replaces only the marked region. Legacy `commentary-cli-hook` blocks
 * from older installs are removed when inserting the current block.
 */

export const PARALLEL_DOCS_HOOK_BEGIN = "# <<<< parallel-docs-cli-hook v1 BEGIN >>>>";
export const PARALLEL_DOCS_HOOK_END = "# <<<< parallel-docs-cli-hook v1 END >>>>";

const LEGACY_HOOK_BEGIN = "# <<<< commentary-cli-hook v1 BEGIN >>>>";
const LEGACY_HOOK_END = "# <<<< commentary-cli-hook v1 END >>>>";

/**
 * Shell fragment: run `validate` from the Git repo root.
 * In the ParallelDocs monorepo, prefer a built workspace CLI (`packages/cli/dist/cli.js`)
 * so pre-commit exercises local sources instead of only the `node_modules/.bin` shim.
 */
export const PARALLEL_DOCS_PRE_COMMIT_BODY = `root=$(git rev-parse --show-toplevel)
if [ -f "$root/.parallel-docs.toml" ]; then
  dev_cli="$root/packages/cli/dist/cli.js"
  if [ -f "$dev_cli" ]; then
    node "$dev_cli" validate --staged || exit $?
  elif [ -x "$root/node_modules/.bin/parallel-docs" ]; then
    "$root/node_modules/.bin/parallel-docs" validate --staged || exit $?
  fi
fi`;

export function parallelDocsManagedHookBlock(): string {
  return `${PARALLEL_DOCS_HOOK_BEGIN}\n${PARALLEL_DOCS_PRE_COMMIT_BODY}\n${PARALLEL_DOCS_HOOK_END}\n`;
}

/** Normalize newlines for stable merging. */
export function normalizeHookNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function stripLegacyCommentaryHook(trimmed: string): string {
  if (!trimmed.includes(LEGACY_HOOK_BEGIN)) return trimmed;
  const start = trimmed.indexOf(LEGACY_HOOK_BEGIN);
  const end = trimmed.indexOf(LEGACY_HOOK_END);
  if (end === -1) return trimmed;
  const tail = trimmed.slice(end + LEGACY_HOOK_END.length).replace(/^\n+/, "\n");
  return `${trimmed.slice(0, start).trimEnd()}\n${tail}`.replace(/\n{3,}/g, "\n\n");
}

/**
 * Merge or append the ParallelDocs hook block into existing `pre-commit` contents.
 * @param existingContent full file body (may be empty)
 */
export function mergeParallelDocsPreCommitHook(existingContent: string): string {
  const block = parallelDocsManagedHookBlock();
  const trimmed = stripLegacyCommentaryHook(normalizeHookNewlines(existingContent));
  if (!trimmed.trim()) {
    return `#!/bin/sh\n${block}`;
  }
  if (trimmed.includes(PARALLEL_DOCS_HOOK_BEGIN)) {
    const start = trimmed.indexOf(PARALLEL_DOCS_HOOK_BEGIN);
    const end = trimmed.indexOf(PARALLEL_DOCS_HOOK_END);
    if (end === -1) {
      return `${trimmed.trimEnd()}\n\n${block}`;
    }
    const tail = trimmed.slice(end + PARALLEL_DOCS_HOOK_END.length).replace(/^\n+/, "\n");
    return `${trimmed.slice(0, start)}${block}${tail}`;
  }
  return `${trimmed.trimEnd()}\n\n${block}`;
}

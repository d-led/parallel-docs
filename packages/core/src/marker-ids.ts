/**
 * Marker / block ids used in `marker:<id>` anchors, `markerId` in the index, and
 * `parallelDocs:<id>` / `parallelDocs:start id=<id>` in source. Designed so authors
 * can type **short slugs** (`intro`, `auth-flow`, `todo_1`) while tooling stays strict.
 */

/** Body: 1–64 chars, ASCII letters, digits, hyphen, underscore; must not be empty after trim. */
export const MARKER_ID_BODY = "[a-z0-9][a-z0-9_-]{0,63}";

const MARKER_ID_RE = new RegExp(`^${MARKER_ID_BODY}$`, "i");

function replaceWhitespaceRunsWithHyphens(s: string): string {
  let r = "";
  let inRun = false;
  for (const c of s) {
    if (/\s/.test(c)) {
      inRun = true;
    } else {
      if (inRun) r += "-";
      inRun = false;
      r += c;
    }
  }
  if (inRun) r += "-";
  return r;
}

function collapseAdjacentChar(s: string, ch: string): string {
  let r = "";
  for (const c of s) {
    if (c === ch) {
      if (!r.endsWith(ch)) r += ch;
    } else {
      r += c;
    }
  }
  return r;
}

function trimEdgeChar(s: string, ch: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === ch) start++;
  while (end > start && s[end - 1] === ch) end--;
  return s.slice(start, end);
}

/**
 * Validates and returns the normalised (lower-case) marker id, or throws with a
 * message suitable for CLI / editor output.
 */
export function assertValidMarkerId(raw: string): string {
  const id = raw.trim().toLowerCase();
  if (!MARKER_ID_RE.test(id)) {
    throw new Error(
      `Invalid marker id "${raw}". Use 1–64 characters: a–z, 0–9, hyphen (-), underscore (_); ` +
        `must start with a letter or digit. Examples: intro, auth-flow, block_01, a3f9k2`,
    );
  }
  return id;
}

/**
 * Turns free-form author input into a valid marker id when possible: lower-case,
 * spaces → hyphens, strips other punctuation. Throws if the result is empty or
 * still invalid — callers may fall back to {@link generateBlockId} from `blocks.js`.
 */
export function normaliseMarkerSlugOrThrow(raw: string): string {
  const withoutInvalid = replaceWhitespaceRunsWithHyphens(raw.trim().toLowerCase()).replaceAll(
    /[^a-z0-9_-]+/g,
    "",
  );
  const slug = trimEdgeChar(
    trimEdgeChar(collapseAdjacentChar(collapseAdjacentChar(withoutInvalid, "-"), "_"), "-"),
    "_",
  );
  return assertValidMarkerId(slug);
}

import { assertValidMarkerId, MARKER_ID_BODY } from "./marker-ids.js";

/**
 * Source delimiters for block anchors (region `sidetrack:<id>` vs generic
 * `sidetrack:start` / `end`). Full taxonomy and viewport geometry: companion
 * `.sidetrack/source/.../source-markers.ts/main.md`.
 */

const SIDETRACK_TAG = (id: string) => `sidetrack:${id.trim().toLowerCase()}`;

/** `//#region sidetrack:<id>` — JS/TS ecosystem & CSS preprocessors that use `//`. */
const SLASH_REGION_LANGUAGES = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "js",
  "jsx",
  "tsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "astro",
  "scss",
  "less",
  "stylus",
]);

/** `#region sidetrack:<id>` — same shape as Region Marker for these ids. */
const HASH_REGION_LANGUAGES = new Set([
  "ruby",
  "csharp",
  "coffeescript",
  "powershell",
  "perl",
  "raku",
  "crystal",
]);

const PRAGMA_REGION = new Set(["c", "cpp", "cuda-cpp", "objective-c", "objective-cpp"]);

const VB_REGION = new Set(["vb"]);

const LUA_REGION = new Set(["lua"]);

/** Includes Markdown so `sidetrackRegionInsertions("markdown", …)` matches README `<!-- #region sidetrack:… -->`. */
const HTML_FAMILY = new Set(["html", "xml", "handlebars", "vue-html", "markdown", "md"]);

const PYTHONIC = new Set(["python", "jupyter"]);

/** `# …` line comments for generic markers (no `#region` folding convention). */
const GENERIC_HASH_LANGUAGES = new Set([
  "dockerfile",
  "makefile",
  "cmake",
  "yaml",
  "yml",
  "toml",
  "ini",
  "properties",
  "git-commit",
  "sql",
  "r",
  "shellscript",
  "bash",
  "sh",
  "zsh",
  "fish",
]);

type RegionConvention =
  | "slash-region"
  | "hash-region"
  | "pragma"
  | "vb"
  | "html"
  | "python"
  | "lua"
  | "generic-line"
  | "generic-hash"
  | "generic-block-css";

function regionConvention(languageId: string): RegionConvention {
  const id = languageId.toLowerCase();
  if (id === "css") return "generic-block-css";
  if (PYTHONIC.has(id)) return "python";
  if (PRAGMA_REGION.has(id)) return "pragma";
  if (VB_REGION.has(id)) return "vb";
  if (HTML_FAMILY.has(id)) return "html";
  if (LUA_REGION.has(id)) return "lua";
  if (HASH_REGION_LANGUAGES.has(id)) return "hash-region";
  if (SLASH_REGION_LANGUAGES.has(id)) return "slash-region";
  if (GENERIC_HASH_LANGUAGES.has(id)) return "generic-hash";
  return "generic-line";
}

/**
 * Line comment leader for **generic** `sidetrack:start` / `end` markers
 * (`// …`, `# …`, etc.). Not used for `#region` family languages.
 */
export function lineCommentLeaderForLanguage(languageId: string): string {
  const id = languageId.toLowerCase();
  if (GENERIC_HASH_LANGUAGES.has(id)) return "# ";
  if (id === "lua") return "-- ";
  if (id === "vb") return "' ";
  return "// ";
}

/**
 * Insertion fragments for wrapping the selection (apply **end** first, then
 * **start**, so stable offsets). Pass the same indentation string Region Marker
 * uses (leading whitespace of the first selected line).
 */
export function sidetrackRegionInsertions(
  languageId: string,
  markerId: string,
  indent = "",
): { start: string; end: string } {
  const id = assertValidMarkerId(markerId);
  const tag = SIDETRACK_TAG(id);
  const ind = indent;
  const conv = regionConvention(languageId);
  switch (conv) {
    case "slash-region":
      return {
        start: `${ind}//#region ${tag}\n`,
        end: `\n${ind}//#endregion ${tag}`,
      };
    case "hash-region":
      return {
        start: `${ind}#region ${tag}\n`,
        end: `\n${ind}#endregion ${tag}`,
      };
    case "pragma":
      return {
        start: `${ind}#pragma region ${tag}\n`,
        end: `\n${ind}#pragma endregion ${tag}`,
      };
    case "vb":
      return {
        start: `${ind}#Region ${tag}\n`,
        end: `\n${ind}#End Region ${tag}`,
      };
    case "html":
      return {
        start: `${ind}<!-- #region ${tag} -->\n`,
        end: `\n${ind}<!-- #endregion ${tag} -->`,
      };
    case "python":
      return {
        start: `${ind}# region ${tag}\n`,
        end: `\n${ind}# endregion ${tag}`,
      };
    case "lua":
      return {
        start: `${ind}--#region ${tag}\n`,
        end: `\n${ind}--#endregion ${tag}`,
      };
    case "generic-block-css":
      return {
        start: `${ind}/* sidetrack:start id=${id} */\n`,
        end: `\n${ind}/* sidetrack:end id=${id} */`,
      };
    case "generic-hash":
    case "generic-line": {
      const leader = lineCommentLeaderForLanguage(languageId);
      return {
        start: `${ind}${leader}sidetrack:start id=${id}\n`,
        end: `\n${ind}${leader}sidetrack:end id=${id}`,
      };
    }
  }
}

export type RegionBoundaryKind = "start" | "end";

/** Detect a SideTrack region, generic marker, or legacy marker line; id is lower-case. */
export function parseSideTrackRegionBoundary(
  line: string,
): { kind: RegionBoundaryKind; id: string } | null {
  const probe = line.trim();
  const mid = MARKER_ID_BODY;
  const startPatterns: RegExp[] = [
    new RegExp(`^//#region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#pragma\\s+region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#Region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#\\s*region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^<!--\\s*#region\\s+sidetrack:(${mid})\\s*-->\\s*$`, "i"),
    new RegExp(`^--#region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^/\\*\\s*sidetrack:start\\s+id=(${mid})\\s*\\*/\\s*$`, "i"),
    new RegExp(`sidetrack:start\\s+id=(${mid})\\b`, "i"),
  ];
  const endPatterns: RegExp[] = [
    new RegExp(`^//#endregion\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#endregion\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#pragma\\s+endregion\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#End\\s+Region\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^#\\s*endregion\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^<!--\\s*#endregion\\s+sidetrack:(${mid})\\s*-->\\s*$`, "i"),
    new RegExp(`^--#endregion\\s+sidetrack:(${mid})\\s*$`, "i"),
    new RegExp(`^/\\*\\s*sidetrack:end\\s+id=(${mid})\\s*\\*/\\s*$`, "i"),
    new RegExp(`sidetrack:end\\s+id=(${mid})\\b`, "i"),
  ];
  for (const re of startPatterns) {
    const m = re.exec(probe);
    if (m) {
      try {
        return { kind: "start", id: assertValidMarkerId(m[1]) };
      } catch {
        continue;
      }
    }
  }
  for (const re of endPatterns) {
    const m = re.exec(probe);
    if (m) {
      try {
        return { kind: "end", id: assertValidMarkerId(m[1]) };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function findFirstMarkerPairBoundaryIndices(
  sourceText: string,
  markerId: string,
): { startIdx: number; endIdx: number } | null {
  const id = assertValidMarkerId(markerId);
  const lines = sourceText.split("\n");
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const hit = parseSideTrackRegionBoundary(lines[i]);
    if (hit?.id !== id) continue;
    if (hit.kind === "start" && startIdx < 0) startIdx = i;
    else if (hit.kind === "end" && startIdx >= 0 && endIdx < 0) endIdx = i;
  }
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx + 2) return null;
  return { startIdx, endIdx };
}

/**
 * 1-based inclusive source lines **between** paired region / generic / legacy marker lines.
 */
export function sourceLineRangeForMarkerId(
  sourceText: string,
  markerId: string,
): {
  start: number;
  end: number;
} | null {
  const pair = findFirstMarkerPairBoundaryIndices(sourceText, markerId);
  if (pair === null) return null;
  const { startIdx, endIdx } = pair;
  const start = startIdx + 2;
  const end = endIdx;
  if (end < start) return null;
  return { start, end };
}

/** Half-open viewport span for scroll sync; see source-markers sidetrack. */
export function markerViewportHalfOpen1Based(
  sourceText: string,
  markerId: string,
): { lo: number; hiExclusive: number } | null {
  const pair = findFirstMarkerPairBoundaryIndices(sourceText, markerId);
  if (pair === null) return null;
  const { startIdx, endIdx } = pair;
  const startMarker1Based = startIdx + 1;
  const endMarker1Based = endIdx + 1;
  const lo = Math.max(1, startMarker1Based - 1);
  const hiExclusive = endMarker1Based;
  if (hiExclusive <= lo) return null;
  return { lo, hiExclusive };
}

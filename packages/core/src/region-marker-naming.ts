import { generateBlockId } from "./blocks.js";
import { assertValidMarkerId, normaliseMarkerSlugOrThrow } from "./marker-ids.js";

/** Inclusive 1-based source line range (same convention as block ranges). */
export type RegionMarkerNamingRange = {
  startLine: number;
  endLine: number;
};

/** Suggest marker id inputs; full pipeline: `region-marker-naming.ts` sidetrack. */
export type RegionMarkerNamingInput = {
  languageId: string;
  sourceText: string;
  range: RegionMarkerNamingRange;
  /** When set (e.g. enclosing class or method from document symbols), wins over text heuristics. */
  enclosingSymbolName?: string;
  /** Injected for deterministic tests; defaults to `Math.random` in the composite fallback. */
  rng?: () => number;
};

/** Pure policy for `marker:<id>` / `sidetrack:<id>`; see sidetrack. */
export interface RegionMarkerNamingStrategy {
  suggestMarkerId(input: RegionMarkerNamingInput): string;
}

/** Return a valid id or `null` to defer; see sidetrack. */
export interface RegionMarkerNamingHintStrategy {
  trySuggestMarkerId(input: RegionMarkerNamingInput): string | null;
}

/** Ordered hints then `generateBlockId`; see sidetrack. */
export class CompositeRegionMarkerNamingStrategy implements RegionMarkerNamingStrategy {
  constructor(
    private readonly hints: readonly RegionMarkerNamingHintStrategy[],
    private readonly fallbackRng: () => number = Math.random,
  ) {}

  suggestMarkerId(input: RegionMarkerNamingInput): string {
    const rng = input.rng ?? this.fallbackRng;
    const merged: RegionMarkerNamingInput = { ...input, rng };
    for (const hint of this.hints) {
      const candidate = hint.trySuggestMarkerId(merged);
      if (candidate === null) continue;
      try {
        return assertValidMarkerId(candidate);
      } catch {
        continue;
      }
    }
    return generateBlockId(rng);
  }
}

/** Host-supplied id function; see sidetrack. */
export class CallbackRegionMarkerNamingStrategy implements RegionMarkerNamingStrategy {
  constructor(private readonly suggest: (input: RegionMarkerNamingInput) => string) {}

  suggestMarkerId(input: RegionMarkerNamingInput): string {
    return assertValidMarkerId(this.suggest(input));
  }
}

// --- Hint strategy implementations ---

export class EnclosingSymbolHintStrategy implements RegionMarkerNamingHintStrategy {
  trySuggestMarkerId(input: RegionMarkerNamingInput): string | null {
    const raw = input.enclosingSymbolName?.trim();
    if (!raw) return null;
    return tryNormaliseContextLabelToMarkerId(raw);
  }
}

export class TomlTableHeaderHintStrategy implements RegionMarkerNamingHintStrategy {
  trySuggestMarkerId(input: RegionMarkerNamingInput): string | null {
    if (!isTomlLanguage(input.languageId)) return null;
    const path = tryTomlTablePathAboveSelection(input.sourceText, input.range.startLine);
    if (path === null) return null;
    const dotted = tomlTablePathToSlugCandidate(path);
    return tryNormaliseContextLabelToMarkerId(dotted);
  }
}

export class MarkdownHeadingHintStrategy implements RegionMarkerNamingHintStrategy {
  trySuggestMarkerId(input: RegionMarkerNamingInput): string | null {
    if (!isMarkdownLanguage(input.languageId)) return null;
    const title = tryMarkdownHeadingTitleAbove(input.sourceText, input.range.startLine);
    if (title === null) return null;
    return tryNormaliseContextLabelToMarkerId(title);
  }
}

export class CodeStructureHintStrategy implements RegionMarkerNamingHintStrategy {
  trySuggestMarkerId(input: RegionMarkerNamingInput): string | null {
    if (!isCodeStructureLanguage(input.languageId)) return null;
    const hint = tryCodeStructureNameHint(input.languageId, input.sourceText, input.range);
    if (hint === null) return null;
    return tryNormaliseContextLabelToMarkerId(hint);
  }
}

// --- Pure extractors (tested directly; safe to reuse from custom strategies) ---

const TOML_LINE_ARRAY_TABLE = /^\s*\[\[([^\]]+)\]\]\s*(?:#.*)?$/;
const TOML_LINE_TABLE = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/;

/** Innermost TOML `[header]` / `[[array]]` path above `startLine1`; see sidetrack. */
export function tryTomlTablePathAboveSelection(
  sourceText: string,
  startLine1: number,
): string | null {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const start0 = Math.max(0, Math.floor(startLine1) - 1);
  for (let i = start0; i >= 0; i--) {
    const line = lines[i] ?? "";
    const arrayM = TOML_LINE_ARRAY_TABLE.exec(line);
    const arrayPath = arrayM?.[1];
    if (arrayPath) return arrayPath.trim();
    const tableM = TOML_LINE_TABLE.exec(line);
    const tablePath = tableM?.[1];
    if (tablePath && !line.trimStart().startsWith("[[")) return tablePath.trim();
  }
  return null;
}

const MD_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/;

/** Nearest ATX heading at or above line; see sidetrack. */
export function tryMarkdownHeadingTitleAbove(
  sourceText: string,
  startLine1: number,
): string | null {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const start0 = Math.max(0, Math.floor(startLine1) - 1);
  for (let i = start0; i >= 0; i--) {
    const m = MD_HEADING.exec(lines[i] ?? "");
    if (m?.[2]) return stripMarkdownInlineNoise(m[2]);
  }
  return null;
}

type CodePattern = { re: RegExp; nameGroup: number };

const TS_JS_LIKE = new Set([
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
]);

const PYTHON_LIKE = new Set(["python", "jupyter"]);

const RUST_LIKE = new Set(["rust"]);

const GO_LIKE = new Set(["go"]);

const RUBY_LIKE = new Set(["ruby"]);

const CSHARP_LIKE = new Set(["csharp"]);

const JAVA_KOTLIN_LIKE = new Set(["java", "kotlin"]);

const PHP_LIKE = new Set(["php"]);

const CPP_LIKE = new Set(["cpp", "cuda-cpp", "objective-cpp", "objective-c", "c"]);

const SWIFT_LIKE = new Set(["swift"]);

const TS_JS_PATTERNS: CodePattern[] = [
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?interface\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?enum\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?type\s+(\w+)\s*=/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/, nameGroup: 1 },
  { re: /^\s*(?:export\s+)?(?:async\s+)?(\w+)\s*=\s*(?:async\s*)?\(/, nameGroup: 1 },
];

const PYTHON_PATTERNS: CodePattern[] = [
  { re: /^\s*class\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:async\s+)?def\s+(\w+)\s*\(/, nameGroup: 1 },
];

const RUST_PATTERNS: CodePattern[] = [
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/, nameGroup: 1 },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?impl\s+(?:<[^>]+>\s+)?(?:\w+\s+for\s+)?(\w+)/, nameGroup: 1 },
];

const GO_PATTERNS: CodePattern[] = [
  { re: /^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/, nameGroup: 1 },
  { re: /^\s*type\s+(\w+)\s+(?:struct|interface)\b/, nameGroup: 1 },
];

const RUBY_PATTERNS: CodePattern[] = [
  { re: /^\s*class\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*module\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*def\s+(\w+)/, nameGroup: 1 },
];

const CSHARP_PATTERNS: CodePattern[] = [
  {
    re: /^\s*(?:public|private|protected|internal|file)\s+(?:(?:static|async|abstract|sealed|partial)\s+)*class\s+(\w+)/,
    nameGroup: 1,
  },
  { re: /^\s*namespace\s+([\w.]+)/, nameGroup: 1 },
];

const JAVA_PATTERNS: CodePattern[] = [
  {
    re: /^\s*(?:public|private|protected)?\s*(?:abstract\s+)?(?:static\s+)?class\s+(\w+)/,
    nameGroup: 1,
  },
  { re: /^\s*(?:public|private|protected)?\s*(?:abstract\s+)?interface\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:public|private|protected)?\s*(?:abstract\s+)?object\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:public|private|protected)?\s*fun\s+(\w+)\s*\(/, nameGroup: 1 },
];

const PHP_PATTERNS: CodePattern[] = [
  { re: /^\s*(?:abstract\s+)?class\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*function\s+(\w+)\s*\(/, nameGroup: 1 },
];

const CPP_PATTERNS: CodePattern[] = [{ re: /^\s*(?:class|struct)\s+(\w+)/, nameGroup: 1 }];

const SWIFT_PATTERNS: CodePattern[] = [
  { re: /^\s*(?:public|private|internal|fileprivate|open)?\s*class\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:public|private|internal|fileprivate|open)?\s*func\s+(\w+)\s*\(/, nameGroup: 1 },
  { re: /^\s*(?:public|private|internal|fileprivate|open)?\s*struct\s+(\w+)/, nameGroup: 1 },
  { re: /^\s*(?:public|private|internal|fileprivate|open)?\s*enum\s+(\w+)/, nameGroup: 1 },
];

const LOOKBACK_LINES = 80;

function patternsForLanguage(languageId: string): CodePattern[] | null {
  const id = languageId.toLowerCase();
  if (TS_JS_LIKE.has(id)) return TS_JS_PATTERNS;
  if (PYTHON_LIKE.has(id)) return PYTHON_PATTERNS;
  if (RUST_LIKE.has(id)) return RUST_PATTERNS;
  if (GO_LIKE.has(id)) return GO_PATTERNS;
  if (RUBY_LIKE.has(id)) return RUBY_PATTERNS;
  if (CSHARP_LIKE.has(id)) return CSHARP_PATTERNS;
  if (JAVA_KOTLIN_LIKE.has(id)) return JAVA_PATTERNS;
  if (PHP_LIKE.has(id)) return PHP_PATTERNS;
  if (CPP_LIKE.has(id)) return CPP_PATTERNS;
  if (SWIFT_LIKE.has(id)) return SWIFT_PATTERNS;
  return null;
}

const PYTHON_CLASS_LINE = /^\s*class\s+(\w+)/;

/** Declaration / class name near selection; see sidetrack. */
export function tryCodeStructureNameHint(
  languageId: string,
  sourceText: string,
  range: RegionMarkerNamingRange,
): string | null {
  const patterns = patternsForLanguage(languageId);
  if (!patterns) return null;
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const lineCount = lines.length;
  const start0 = clampLine0(range.startLine, lineCount);
  const end0 = clampLine0(range.endLine, lineCount);
  const from = Math.max(0, start0 - LOOKBACK_LINES);

  if (PYTHON_LIKE.has(languageId.toLowerCase())) {
    for (let i = start0 - 1; i >= from; i--) {
      const cm = PYTHON_CLASS_LINE.exec(lines[i] ?? "");
      const pyName = cm?.[1];
      if (pyName) return pyName;
    }
  }

  const tryLine = (i: number): string | null => {
    const line = lines[i] ?? "";
    for (const { re, nameGroup } of patterns) {
      const m = re.exec(line);
      const name = m?.[nameGroup];
      if (name) return name;
    }
    return null;
  };

  for (let i = end0; i >= start0; i--) {
    const hit = tryLine(i);
    if (hit) return hit;
  }
  for (let i = start0 - 1; i >= from; i--) {
    const hit = tryLine(i);
    if (hit) return hit;
  }
  return null;
}

export function tryNormaliseContextLabelToMarkerId(raw: string): string | null {
  const base = raw.trim();
  if (!base) return null;
  const maxProbe = Math.min(base.length, 256);
  for (let n = maxProbe; n >= 1; n--) {
    try {
      return normaliseMarkerSlugOrThrow(base.slice(0, n));
    } catch {
      continue;
    }
  }
  return null;
}

function stripMarkdownInlineNoise(title: string): string {
  return title
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();
}

function tomlTablePathToSlugCandidate(path: string): string {
  return path.trim().replaceAll(".", "-");
}

function clampLine0(oneBasedLine: number, lineCount: number): number {
  if (lineCount <= 0) return 0;
  const x = Math.floor(oneBasedLine) - 1;
  return Math.max(0, Math.min(lineCount - 1, x));
}

function isTomlLanguage(languageId: string): boolean {
  return languageId.trim().toLowerCase() === "toml";
}

function isMarkdownLanguage(languageId: string): boolean {
  const id = languageId.trim().toLowerCase();
  return id === "markdown" || id === "md";
}

function isCodeStructureLanguage(languageId: string): boolean {
  return patternsForLanguage(languageId) !== null;
}

/** Fixed pipeline: enclosing symbol → TOML table → Markdown heading → code shape → random. */
export const defaultRegionMarkerNamingStrategy: RegionMarkerNamingStrategy =
  new CompositeRegionMarkerNamingStrategy([
    new EnclosingSymbolHintStrategy(),
    new TomlTableHeaderHintStrategy(),
    new MarkdownHeadingHintStrategy(),
    new CodeStructureHintStrategy(),
  ]);

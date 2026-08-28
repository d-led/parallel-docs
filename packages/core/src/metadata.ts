import { parseAnchor, type ParsedAnchor } from "./anchors.js";
import { describeIndexSchemaRemediation } from "./index-schema-messages.js";
import { assertValidMarkerId } from "./marker-ids.js";
import {
  type ParallelDocsIndex,
  coerceIndexSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from "./model.js";

export function emptyIndex(): ParallelDocsIndex {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, byParallelDocsPath: {} };
}

export function assertValidIndex(value: unknown): ParallelDocsIndex {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("index.json must be a JSON object");
  }
  const obj = value as Record<string, unknown>;
  const schemaVersion = coerceIndexSchemaVersion(obj.schemaVersion);
  if (schemaVersion === null) {
    throw new TypeError(
      `index.json schemaVersion must be an integer (got ${String(obj.schemaVersion)})`,
    );
  }
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `index.json schemaVersion mismatch. ${describeIndexSchemaRemediation(obj.schemaVersion)}`,
    );
  }
  const byParallelDocsPath = obj.byParallelDocsPath;
  if (typeof byParallelDocsPath !== "object" || byParallelDocsPath === null) {
    throw new TypeError("index.json.byParallelDocsPath must be an object");
  }
  for (const [key, entry] of Object.entries(byParallelDocsPath)) {
    validateParallelDocsEntry(key, entry);
  }
  return { ...obj, schemaVersion: CURRENT_SCHEMA_VERSION } as ParallelDocsIndex;
}

function validateParallelDocsEntry(parallelDocsPathKey: string, entry: unknown): void {
  if (typeof entry !== "object" || entry === null) {
    throw new TypeError(`Invalid index entry for ${parallelDocsPathKey}`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.sourcePath !== "string") {
    throw new TypeError(`Missing sourcePath for ${parallelDocsPathKey}`);
  }
  if (typeof e.parallelDocsPath !== "string") {
    throw new TypeError(`Missing parallelDocsPath for ${parallelDocsPathKey}`);
  }
  if (e.parallelDocsPath !== parallelDocsPathKey) {
    throw new TypeError(
      `index key must equal entry.parallelDocsPath (key=${parallelDocsPathKey}, entry=${e.parallelDocsPath})`,
    );
  }
  if (!Array.isArray(e.blocks)) {
    throw new TypeError(`blocks must be an array for ${parallelDocsPathKey}`);
  }
  for (const block of e.blocks) validateBlock(parallelDocsPathKey, block);
}

function parseValidatedMarkerId(parallelDocsPathKey: string, raw: string): string {
  try {
    return assertValidMarkerId(raw);
  } catch (e) {
    throw new TypeError(
      `block.id invalid under ${parallelDocsPathKey}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function parseValidatedAnchor(parallelDocsPathKey: string, raw: string): ParsedAnchor {
  try {
    return parseAnchor(raw);
  } catch (e) {
    throw new TypeError(
      `Invalid block.anchor under ${parallelDocsPathKey}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function assertBlockMarkerAnchorConsistency(
  parallelDocsPathKey: string,
  b: Record<string, unknown>,
  bid: string,
  parsedAnchor: ParsedAnchor,
): void {
  if (parsedAnchor.kind === "marker" && parsedAnchor.id !== bid) {
    throw new TypeError(
      `block.id must match marker anchor id (got id=${b.id}, anchor=${b.anchor}) under ${parallelDocsPathKey}`,
    );
  }
  if (
    parsedAnchor.kind === "marker" &&
    b.markerId !== undefined &&
    typeof b.markerId === "string" &&
    b.markerId.trim() !== "" &&
    assertValidMarkerId(b.markerId) !== parsedAnchor.id
  ) {
    throw new TypeError(
      `block.markerId must match marker anchor id under ${parallelDocsPathKey} (block ${b.id})`,
    );
  }
}

function validateBlockOptionalFields(
  parallelDocsPathKey: string,
  b: Record<string, unknown>,
): void {
  if (b.lastVerifiedCommit !== undefined && typeof b.lastVerifiedCommit !== "string") {
    throw new TypeError(
      `block.lastVerifiedCommit must be a string when present under ${parallelDocsPathKey}`,
    );
  }
  if (b.lastVerifiedBlob !== undefined && typeof b.lastVerifiedBlob !== "string") {
    throw new TypeError(
      `block.lastVerifiedBlob must be a string when present under ${parallelDocsPathKey}`,
    );
  }
  if (b.markerId !== undefined && typeof b.markerId !== "string") {
    throw new TypeError(
      `block.markerId must be a string when present under ${parallelDocsPathKey}`,
    );
  }
  if (b.snippet !== undefined && typeof b.snippet !== "string") {
    throw new TypeError(`block.snippet must be a string when present under ${parallelDocsPathKey}`);
  }
  if (b.fingerprint !== undefined) {
    throw new TypeError(
      `block.fingerprint is no longer supported under ${parallelDocsPathKey}; re-open the repo to migrate index.json`,
    );
  }
}

function validateBlock(parallelDocsPathKey: string, block: unknown): void {
  if (typeof block !== "object" || block === null) {
    throw new TypeError(`Invalid block under ${parallelDocsPathKey}`);
  }
  const b = block as Record<string, unknown>;
  if (typeof b.id !== "string") {
    throw new TypeError(`block.id must be a string under ${parallelDocsPathKey}`);
  }
  const bid = parseValidatedMarkerId(parallelDocsPathKey, b.id);
  if (typeof b.anchor !== "string") {
    throw new TypeError(`block.anchor must be a string under ${parallelDocsPathKey}`);
  }
  const parsedAnchor = parseValidatedAnchor(parallelDocsPathKey, b.anchor);
  assertBlockMarkerAnchorConsistency(parallelDocsPathKey, b, bid, parsedAnchor);
  validateBlockOptionalFields(parallelDocsPathKey, b);
}

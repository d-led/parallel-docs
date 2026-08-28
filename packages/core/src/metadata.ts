import { parseAnchor, type ParsedAnchor } from "./anchors.js";
import { describeIndexSchemaRemediation } from "./index-schema-messages.js";
import { assertValidMarkerId } from "./marker-ids.js";
import { type SideTrackIndex, coerceIndexSchemaVersion, CURRENT_SCHEMA_VERSION } from "./model.js";

export function emptyIndex(): SideTrackIndex {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, bySideTrackPath: {} };
}

export function assertValidIndex(value: unknown): SideTrackIndex {
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
  const bySideTrackPath = obj.bySideTrackPath;
  if (typeof bySideTrackPath !== "object" || bySideTrackPath === null) {
    throw new TypeError("index.json.bySideTrackPath must be an object");
  }
  for (const [key, entry] of Object.entries(bySideTrackPath)) {
    validateSideTrackEntry(key, entry);
  }
  return { ...obj, schemaVersion: CURRENT_SCHEMA_VERSION } as SideTrackIndex;
}

function validateSideTrackEntry(sidetrackPathKey: string, entry: unknown): void {
  if (typeof entry !== "object" || entry === null) {
    throw new TypeError(`Invalid index entry for ${sidetrackPathKey}`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.sourcePath !== "string") {
    throw new TypeError(`Missing sourcePath for ${sidetrackPathKey}`);
  }
  if (typeof e.sidetrackPath !== "string") {
    throw new TypeError(`Missing sidetrackPath for ${sidetrackPathKey}`);
  }
  if (e.sidetrackPath !== sidetrackPathKey) {
    throw new TypeError(
      `index key must equal entry.sidetrackPath (key=${sidetrackPathKey}, entry=${e.sidetrackPath})`,
    );
  }
  if (!Array.isArray(e.blocks)) {
    throw new TypeError(`blocks must be an array for ${sidetrackPathKey}`);
  }
  for (const block of e.blocks) validateBlock(sidetrackPathKey, block);
}

function parseValidatedMarkerId(sidetrackPathKey: string, raw: string): string {
  try {
    return assertValidMarkerId(raw);
  } catch (e) {
    throw new TypeError(
      `block.id invalid under ${sidetrackPathKey}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function parseValidatedAnchor(sidetrackPathKey: string, raw: string): ParsedAnchor {
  try {
    return parseAnchor(raw);
  } catch (e) {
    throw new TypeError(
      `Invalid block.anchor under ${sidetrackPathKey}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function assertBlockMarkerAnchorConsistency(
  sidetrackPathKey: string,
  b: Record<string, unknown>,
  bid: string,
  parsedAnchor: ParsedAnchor,
): void {
  if (parsedAnchor.kind === "marker" && parsedAnchor.id !== bid) {
    throw new TypeError(
      `block.id must match marker anchor id (got id=${b.id}, anchor=${b.anchor}) under ${sidetrackPathKey}`,
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
      `block.markerId must match marker anchor id under ${sidetrackPathKey} (block ${b.id})`,
    );
  }
}

function validateBlockOptionalFields(sidetrackPathKey: string, b: Record<string, unknown>): void {
  if (b.lastVerifiedCommit !== undefined && typeof b.lastVerifiedCommit !== "string") {
    throw new TypeError(
      `block.lastVerifiedCommit must be a string when present under ${sidetrackPathKey}`,
    );
  }
  if (b.lastVerifiedBlob !== undefined && typeof b.lastVerifiedBlob !== "string") {
    throw new TypeError(
      `block.lastVerifiedBlob must be a string when present under ${sidetrackPathKey}`,
    );
  }
  if (b.markerId !== undefined && typeof b.markerId !== "string") {
    throw new TypeError(`block.markerId must be a string when present under ${sidetrackPathKey}`);
  }
  if (b.snippet !== undefined && typeof b.snippet !== "string") {
    throw new TypeError(`block.snippet must be a string when present under ${sidetrackPathKey}`);
  }
  if (b.fingerprint !== undefined) {
    throw new TypeError(
      `block.fingerprint is no longer supported under ${sidetrackPathKey}; re-open the repo to migrate index.json`,
    );
  }
}

function validateBlock(sidetrackPathKey: string, block: unknown): void {
  if (typeof block !== "object" || block === null) {
    throw new TypeError(`Invalid block under ${sidetrackPathKey}`);
  }
  const b = block as Record<string, unknown>;
  if (typeof b.id !== "string") {
    throw new TypeError(`block.id must be a string under ${sidetrackPathKey}`);
  }
  const bid = parseValidatedMarkerId(sidetrackPathKey, b.id);
  if (typeof b.anchor !== "string") {
    throw new TypeError(`block.anchor must be a string under ${sidetrackPathKey}`);
  }
  const parsedAnchor = parseValidatedAnchor(sidetrackPathKey, b.anchor);
  assertBlockMarkerAnchorConsistency(sidetrackPathKey, b, bid, parsedAnchor);
  validateBlockOptionalFields(sidetrackPathKey, b);
}

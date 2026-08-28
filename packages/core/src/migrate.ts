import { describeIndexSchemaRemediation } from "./index-schema-messages.js";
import {
  type ParallelDocsIndex,
  type SourceFileIndexEntry,
  coerceIndexSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from "./model.js";

const LEGACY_SCHEMA_VERSION = 2 as const;

/** Returns migrated index and whether the file should be rewritten. */
export function migrateIndex(raw: unknown): { index: ParallelDocsIndex; changed: boolean } {
  if (typeof raw !== "object" || raw === null) {
    return {
      index: { schemaVersion: CURRENT_SCHEMA_VERSION, byParallelDocsPath: {} },
      changed: true,
    };
  }
  const obj = raw as Record<string, unknown>;
  const version = coerceIndexSchemaVersion(obj.schemaVersion);
  if (version === null && obj.schemaVersion !== undefined) {
    throw new TypeError(`Invalid index schemaVersion: ${String(obj.schemaVersion)}`);
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    const index = obj as ParallelDocsIndex;
    return { index, changed: false };
  }

  if (
    version === LEGACY_SCHEMA_VERSION ||
    version === undefined ||
    version === 0 ||
    version === 1
  ) {
    const byParallelDocsPath = toByParallelDocsPath(obj);
    const next: ParallelDocsIndex = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byParallelDocsPath,
    };
    const before = JSON.stringify({
      schemaVersion: version === undefined ? 0 : version,
      bySourceFile: obj.bySourceFile ?? {},
      byParallelDocsPath: obj.byParallelDocsPath ?? {},
    });
    const after = JSON.stringify(next);
    const changed = before !== after;
    return { index: next, changed };
  }

  if (typeof version === "number" && version > CURRENT_SCHEMA_VERSION) {
    /**
     * Future CLI may bump `schemaVersion` before every consumer updates. Prefer opening
     * the repo over hard failure: keep `byParallelDocsPath` as parsed, stamp this build’s
     * schema, and let `assertValidIndex` reject only truly incompatible shapes.
     */
    const byParallelDocsPath = toByParallelDocsPath(obj);
    return {
      index: { schemaVersion: CURRENT_SCHEMA_VERSION, byParallelDocsPath },
      changed: true,
    };
  }

  throw new Error(
    `Cannot migrate index.json from schemaVersion ${String(obj.schemaVersion)}. ${describeIndexSchemaRemediation(obj.schemaVersion)}`,
  );
}

function toByParallelDocsPath(obj: Record<string, unknown>): Record<string, SourceFileIndexEntry> {
  if (
    obj.byParallelDocsPath &&
    typeof obj.byParallelDocsPath === "object" &&
    obj.byParallelDocsPath !== null
  ) {
    const out: Record<string, SourceFileIndexEntry> = {};
    for (const [k, entry] of Object.entries(obj.byParallelDocsPath as Record<string, unknown>)) {
      out[k] = normalizeEntry(entry);
    }
    return out;
  }
  const bySourceFile = obj.bySourceFile;
  const out: Record<string, SourceFileIndexEntry> = {};
  if (typeof bySourceFile !== "object" || bySourceFile === null) {
    return out;
  }
  for (const [, entry] of Object.entries(bySourceFile as Record<string, unknown>)) {
    const norm = normalizeEntry(entry);
    const cp = norm.parallelDocsPath;
    if (out[cp]) {
      throw new Error(`Duplicate parallelDocsPath in legacy index: ${cp}`);
    }
    out[cp] = norm;
  }
  return out;
}

function normalizeEntry(entry: unknown): SourceFileIndexEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("Invalid index entry");
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.parallelDocsPath === "string") {
    return e as SourceFileIndexEntry;
  }
  /** Legacy on-disk field name from older releases (v2 `commentrayPath`). */
  if (typeof e.commentrayPath === "string") {
    const { commentrayPath, ...rest } = e;
    return { ...rest, parallelDocsPath: commentrayPath } as SourceFileIndexEntry;
  }
  return e as SourceFileIndexEntry;
}

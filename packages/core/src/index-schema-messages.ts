import { CURRENT_SCHEMA_VERSION } from "./model.js";

function formatObservedSchema(raw: unknown): string {
  if (raw === undefined) return "missing";
  if (typeof raw === "number" || typeof raw === "string") return String(raw);
  return JSON.stringify(raw);
}

/**
 * Recovery steps when `index.json` `schemaVersion` does not match this build’s
 * {@link CURRENT_SCHEMA_VERSION} (shown explicitly so you know which number to target).
 */
export function describeIndexSchemaRemediation(observedSchema: unknown): string {
  const obs = formatObservedSchema(observedSchema);
  return (
    `This install expects "schemaVersion": ${String(CURRENT_SCHEMA_VERSION)} in index.json (bundled @parallel-docs/core). ` +
    `This file has ${obs}. ` +
    `What to do: ` +
    `(1) Upgrade ParallelDocs from the same git revision as the index author — from the repo run \`bash scripts/install-extension.sh\` ` +
    `or \`npm run extension:dogfood\`, then **Developer: Reload Window**. ` +
    `(2) If the index was written by a *newer* CLI, install that newer ParallelDocs, or open the repo with *this* build: ` +
    `readIndex downgrades a newer numeric schema after writing a backup under \`.parallel-docs/metadata/\` ` +
    `named \`index.schema-<old>-backup-<timestamp>.json\`. ` +
    `(3) Last resort after copying \`.parallel-docs/metadata/\` elsewhere: set \`"schemaVersion": ${String(CURRENT_SCHEMA_VERSION)}\` ` +
    `only if the rest of the JSON still matches this version’s validator.`
  );
}

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml, stringify } from "@iarna/toml";

import { assertValidAngleId } from "./angles.js";
import { type SideTrackToml, mergeSideTrackConfig } from "./config.js";
import { sidetrackAnglesSentinelPath } from "./paths.js";

export type UpsertAngleDefinitionInput = {
  id: string;
  title?: string;
  /** When true, set `angles.default_angle` to this id after the merge. */
  makeDefault?: boolean;
};

const MINIMAL_NEW_TOML = `[storage]
dir = ".sidetrack"
`;

/**
 * Ensures `{storage.dir}/source/.default` exists so the repository uses **Angles** on-disk layout
 * (see `docs/spec/storage.md`).
 */
export async function ensureAnglesSentinelFile(
  repoRoot: string,
  storageDir: string,
): Promise<void> {
  const rel = sidetrackAnglesSentinelPath(storageDir);
  const absolute = path.join(repoRoot, ...rel.split("/"));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  try {
    await fs.access(absolute);
  } catch {
    await fs.writeFile(
      absolute,
      "# SideTrack Angles layout sentinel (see docs/spec/storage.md).\n",
      "utf8",
    );
  }
}

/**
 * Reads `.sidetrack.toml`, appends a new `[[angles.definitions]]` row (or throws if the id
 * already exists), validates via {@link mergeSideTrackConfig}, and writes the file back using
 * TOML stringify (comments and key order are not preserved).
 */
export async function upsertAngleDefinitionInSideTrackToml(
  repoRoot: string,
  input: UpsertAngleDefinitionInput,
): Promise<void> {
  const id = assertValidAngleId(input.id);
  const configPath = path.join(repoRoot, ".sidetrack.toml");
  let raw = "";
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  const parsed: SideTrackToml = raw.trim() ? parseToml(raw) : {};
  const angles = parsed.angles ?? {};
  const definitions = [...(angles.definitions ?? [])];
  if (
    definitions.some(
      (d) => d && typeof d === "object" && "id" in d && String((d as { id: string }).id) === id,
    )
  ) {
    throw new Error(`Angle "${id}" is already listed in [angles].definitions`);
  }
  definitions.push({
    id,
    title: input.title?.trim() || undefined,
  });
  angles.definitions = definitions;
  if (input.makeDefault === true || definitions.length === 1) {
    angles.default_angle = id;
  }
  parsed.angles = angles;
  mergeSideTrackConfig(parsed);

  const serialized = stringify(parsed as never);
  const body = raw.trim() ? serialized : `${MINIMAL_NEW_TOML.trim()}\n\n${serialized}`;
  await fs.writeFile(configPath, `${body}\n`, "utf8");
}

export type ApplyAnglesFlatMigrationTomlInput = {
  angleId: string;
  /** Optional label for the single migrated angle (defaults to title-cased id). */
  angleTitle?: string;
  /** When both set, replace `[static_site].sidetrack_markdown` if it equals `from`. */
  staticSideTrackMarkdownFrom?: string;
  staticSideTrackMarkdownTo?: string;
};

function defaultTitleForAngleId(angleId: string): string {
  return angleId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
}

function maybeRewriteStaticSideTrackMarkdown(
  ss: NonNullable<SideTrackToml["static_site"]>,
  from: string | undefined,
  to: string | undefined,
): void {
  if (!from || !to) return;
  const cur = (ss.sidetrack_markdown ?? "").trim();
  if (cur !== from) return;
  ss.sidetrack_markdown = to;
}

/**
 * After flat → Angles filesystem moves, stamp `[angles]` and optionally rewrite
 * `[static_site].sidetrack_markdown` to the new companion path. Refuses when
 * `[angles].definitions` is already non-empty (avoid clobbering a configured project).
 */
export async function applyAnglesFlatMigrationToSideTrackToml(
  repoRoot: string,
  input: ApplyAnglesFlatMigrationTomlInput,
): Promise<void> {
  const id = assertValidAngleId(input.angleId);
  const configPath = path.join(repoRoot, ".sidetrack.toml");
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error("Missing .sidetrack.toml (run: sidetrack init config)", { cause: err });
    }
    throw err;
  }
  const parsed: SideTrackToml = raw.trim() ? parseToml(raw) : {};
  const existingDefs = parsed.angles?.definitions ?? [];
  if (existingDefs.length > 0) {
    throw new Error(
      "Refusing to migrate: [angles].definitions is already set. Remove or merge angles manually, then retry.",
    );
  }
  const title = input.angleTitle?.trim() || defaultTitleForAngleId(id) || id;
  parsed.angles = {
    default_angle: id,
    definitions: [{ id, title }],
  };
  const ss = parsed.static_site ?? {};
  maybeRewriteStaticSideTrackMarkdown(
    ss,
    input.staticSideTrackMarkdownFrom?.trim(),
    input.staticSideTrackMarkdownTo?.trim(),
  );
  parsed.static_site = ss;
  mergeSideTrackConfig(parsed);
  await fs.writeFile(configPath, `${stringify(parsed as never)}\n`, "utf8");
}

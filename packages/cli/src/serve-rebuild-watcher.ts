import path from "node:path";

import { loadSideTrackConfig, normalizeRepoRelativePath } from "@sidetrack/core";
import chokidar from "chokidar";

import { createServeRepoWatchIgnored } from "./serve-repo-watch-ignore.js";

function posixPath(p: string): string {
  return p.replaceAll("\\", "/");
}

function formatWatcherRebuildFailure(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "non-Error rejection";
}

export type ServeRebuildWatcherHandle = {
  close: () => Promise<void>;
};

/**
 * Watches the repository (gitignore-aware) and runs `rebuild(true)` after a short debounce, with
 * single-flight coalescing so overlapping file activity during a rebuild schedules at most one follow-up.
 */
export async function startServeRebuildWatcher(
  repoRootAbs: string,
  rebuild: (notifyBrowser: boolean) => Promise<void>,
): Promise<ServeRebuildWatcherHandle> {
  const repoRoot = path.resolve(repoRootAbs);
  const cfg = await loadSideTrackConfig(repoRoot);
  const storageDirRepoRelative = normalizeRepoRelativePath(cfg.storageDir.replaceAll("\\", "/"));
  const ignored = createServeRepoWatchIgnored(repoRoot, { storageDirRepoRelative });

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let rebuildInFlight = false;
  let pendingWhileRebuild = false;

  const scheduleDebouncedRebuild = (): void => {
    if (debounce !== undefined) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      void runRebuildOnce();
    }, 300);
  };

  async function runRebuildOnce(): Promise<void> {
    if (rebuildInFlight) {
      pendingWhileRebuild = true;
      return;
    }
    rebuildInFlight = true;
    try {
      await rebuild(true);
    } catch (e: unknown) {
      process.stderr.write(`[sidetrack serve] rebuild failed: ${formatWatcherRebuildFailure(e)}\n`);
    } finally {
      rebuildInFlight = false;
      if (pendingWhileRebuild) {
        pendingWhileRebuild = false;
        scheduleDebouncedRebuild();
      }
    }
  }

  const queueRebuild = (): void => {
    if (rebuildInFlight) {
      pendingWhileRebuild = true;
      return;
    }
    scheduleDebouncedRebuild();
  };

  const watcher = chokidar.watch(posixPath(repoRoot), {
    ignoreInitial: true,
    ignored,
    atomic: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 100 },
  });
  watcher.on("all", () => {
    queueRebuild();
  });

  return {
    close: async () => {
      if (debounce !== undefined) clearTimeout(debounce);
      await watcher.close();
    },
  };
}

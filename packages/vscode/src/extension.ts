import {
  type BlockRange,
  type BlockScrollLink,
  type SideTrackIndex,
  addBlockToIndex,
  alignAndCleanRegions,
  applyPathRenamesToSideTrackIndex,
  assertValidAngleId,
  assertValidMarkerId,
  buildBlockScrollLinks,
  sidetrackActiveEditorUiFlags,
  sidetrackAnglesLayoutEnabled,
  sidetrackAnglesSentinelPath,
  sidetrackMarkdownPath,
  sidetrackMarkdownPathForAngle,
  sidetrackStorageSourcePrefix,
  createBlockForRange,
  defaultMetadataIndexPath,
  defaultRegionMarkerNamingStrategy,
  emptyIndex,
  ensureAnglesSentinelFile,
  extractSideTrackBlockIdsFromMarkdown,
  findSideTrackMarkerPairs,
  healSourceFile,
  inferAngleIdFromSideTrackPath,
  initializeSideTrackProject,
  insertBlockBySourceMarkerOrder,
  isSideTrackProjectInitialized,
  loadSideTrackConfig,
  normalizeRepoRelativePath,
  parseSideTrackRegionBoundary,
  pickSideTrackLineForSourceDualPane,
  pickSourceLine0ForSideTrackScroll,
  pairFromSideTrackSourceRel,
  readIndex,
  removeBlockFromSideTrack,
  removeBlockFromIndex,
  removeSourceMarkersFromText,
  resolveSideTrackMarkdownPath,
  sourceLineRangeForMarkerId,
  upsertAngleDefinitionInSideTrackToml,
  validateProject,
  wrapSourceLineRangeWithSideTrackMarkers,
  writeIndex,
  type SourceFileIndexEntry,
} from "@sidetrack/core";
import * as path from "node:path";
import * as vscode from "vscode";

import { SideTrackRenderedPreviewPanel } from "./sidetrack-rendered-preview.js";

type ScrollPair = {
  code: vscode.TextEditor;
  sidetrack: vscode.TextEditor;
  /** Block anchors sorted ascending by `sourceStart`; empty when no blocks exist yet. */
  blocks: BlockScrollLink[];
  repoRoot: string;
  sourceRelative: string;
  /** Repo-relative path to the open sidetrack `.md` (flat or per-angle). */
  sidetrackPathRel: string;
};

type PairedPaths = {
  repoRoot: string;
  sourceRelative: string;
  sidetrackUri: vscode.Uri;
  sidetrackPathRel: string;
  angleId: string | null;
};

let activePair: ScrollPair | undefined;
/** Last pair we bound scroll sync for; kept when listeners are disposed so toggling sync back on can reattach. */
let lastBoundScrollPair: ScrollPair | undefined;
let scrollSyncDisposable: vscode.Disposable | undefined;
let ignoreScrollPairEvents = false;
let blockRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let sidetrackOutput: vscode.OutputChannel | undefined;

function logSideTrack(line: string): void {
  sidetrackOutput?.appendLine(line);
}

function scrollPairEditorsReachable(pair: ScrollPair): boolean {
  return (
    vscode.window.visibleTextEditors.some((e) => e.document === pair.code.document) &&
    vscode.window.visibleTextEditors.some((e) => e.document === pair.sidetrack.document)
  );
}

function applyScrollSyncSettingFromConfig(): void {
  if (scrollSyncEnabled()) {
    if (!activePair && lastBoundScrollPair && scrollPairEditorsReachable(lastBoundScrollPair)) {
      bindScrollSync(lastBoundScrollPair);
    }
  } else {
    disposeScrollSync();
  }
}

const CTX_ACTIVE_EDITOR_UNDER_COMPANION_SOURCE_TREE =
  "sidetrack.activeEditorUnderCompanionSourceTree";
const CTX_ACTIVE_EDITOR_IS_RESOLVABLE_COMPANION_MD =
  "sidetrack.activeEditorIsResolvableCompanionMarkdown";
const CTX_WORKSPACE_INITIALIZED = "sidetrack.workspaceInitialized";

/**
 * Drives `when` / `enablement` clauses so editor-only commands match companion vs primary files.
 */
async function applySideTrackActiveEditorUiContexts(uri: vscode.Uri | undefined): Promise<void> {
  const folderFromUri = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
  const fallbackFolder = vscode.workspace.workspaceFolders?.[0];
  const contextFolder = folderFromUri ?? fallbackFolder;

  let workspaceInitialized = false;
  if (contextFolder) {
    try {
      workspaceInitialized = await isSideTrackProjectInitialized(contextFolder.uri.fsPath);
    } catch {
      workspaceInitialized = false;
    }
  }

  const setContexts = async (
    underCompanionTree: boolean,
    resolvableCompanionMd: boolean,
  ): Promise<void> => {
    await vscode.commands.executeCommand(
      "setContext",
      CTX_ACTIVE_EDITOR_UNDER_COMPANION_SOURCE_TREE,
      underCompanionTree,
    );
    await vscode.commands.executeCommand(
      "setContext",
      CTX_ACTIVE_EDITOR_IS_RESOLVABLE_COMPANION_MD,
      resolvableCompanionMd,
    );
    await vscode.commands.executeCommand(
      "setContext",
      CTX_WORKSPACE_INITIALIZED,
      workspaceInitialized,
    );
  };

  if (!uri || uri.scheme !== "file") {
    await setContexts(false, false);
    return;
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    await setContexts(false, false);
    return;
  }

  try {
    const relative = vscode.workspace.asRelativePath(uri, false);
    if (path.isAbsolute(relative)) {
      await setContexts(false, false);
      return;
    }
    const normalized = normalizeRepoRelativePath(relative.replaceAll("\\", "/"));
    const cfg = await loadSideTrackConfig(folder.uri.fsPath);
    const flags = sidetrackActiveEditorUiFlags({
      normalizedRepoRelativePath: normalized,
      storageDir: cfg.storageDir,
      repoRoot: folder.uri.fsPath,
      staticSiteSideTrackMarkdownFile: cfg.staticSite.sidetrackMarkdownFile,
    });
    await setContexts(flags.underCompanionSourceTree, flags.isResolvableCompanionMarkdown);
  } catch {
    await setContexts(false, false);
  }
}

function disposeScrollSync() {
  if (blockRefreshTimer !== undefined) {
    clearTimeout(blockRefreshTimer);
    blockRefreshTimer = undefined;
  }
  scrollSyncDisposable?.dispose();
  scrollSyncDisposable = undefined;
  activePair = undefined;
}

function withIgnoredScrollPairEvents(fn: () => void): void {
  ignoreScrollPairEvents = true;
  try {
    fn();
  } finally {
    setTimeout(() => {
      ignoreScrollPairEvents = false;
    }, 16);
  }
}

async function refreshActivePairBlocks(): Promise<void> {
  if (!activePair) return;
  let index: SideTrackIndex | null = null;
  try {
    index = await readIndex(activePair.repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] readIndex (refresh blocks): ${msg}`);
  }
  activePair.blocks = buildBlockScrollLinks(
    index,
    activePair.sourceRelative,
    activePair.sidetrackPathRel,
    activePair.sidetrack.document.getText(),
    activePair.code.document.getText(),
  );
}

function scheduleRefreshActivePairBlocks(): void {
  if (!activePair) return;
  if (blockRefreshTimer !== undefined) clearTimeout(blockRefreshTimer);
  blockRefreshTimer = setTimeout(() => {
    blockRefreshTimer = undefined;
    void refreshActivePairBlocks();
  }, 120);
}

function syncSideTrackForVisibleSourceRange(pair: ScrollPair, range: vscode.Range): void {
  const topSourceLine = range.start.line + 1;
  const targetLine = pickSideTrackLineForSourceDualPane(
    pair.blocks,
    topSourceLine,
    pair.sidetrack.document.lineCount,
    () => ratioSideTrackLineFromSourceScroll(pair, range),
  );
  const reveal = new vscode.Range(targetLine, 0, targetLine, 0);
  withIgnoredScrollPairEvents(() =>
    pair.sidetrack.revealRange(reveal, vscode.TextEditorRevealType.InCenterIfOutsideViewport),
  );
}

function syncCodeForVisibleSideTrackRange(pair: ScrollPair, range: vscode.Range): void {
  const topSideTrackLine = range.start.line;
  const sourceLine0 = pickSourceLine0ForSideTrackScroll(pair.blocks, topSideTrackLine);
  const targetLine = sourceLine0 ?? ratioSourceLine0FromSideTrackScroll(pair, range);
  const reveal = new vscode.Range(targetLine, 0, targetLine, 0);
  withIgnoredScrollPairEvents(() =>
    pair.code.revealRange(reveal, vscode.TextEditorRevealType.InCenterIfOutsideViewport),
  );
}

function ratioSideTrackLineFromSourceScroll(pair: ScrollPair, range: vscode.Range): number {
  const codeLines = Math.max(1, pair.code.document.lineCount);
  const sidetrackLines = Math.max(1, pair.sidetrack.document.lineCount);
  const center = (range.start.line + range.end.line) / 2;
  const fraction = center / Math.max(1, codeLines - 1);
  return Math.min(sidetrackLines - 1, Math.max(0, Math.round(fraction * (sidetrackLines - 1))));
}

function ratioSourceLine0FromSideTrackScroll(pair: ScrollPair, range: vscode.Range): number {
  const sidetrackLines = Math.max(1, pair.sidetrack.document.lineCount);
  const codeLines = Math.max(1, pair.code.document.lineCount);
  const center = (range.start.line + range.end.line) / 2;
  const fraction = center / Math.max(1, sidetrackLines - 1);
  return Math.min(codeLines - 1, Math.max(0, Math.round(fraction * (codeLines - 1))));
}

function metadataIndexAbsolutePath(repoRoot: string): string {
  return path.join(repoRoot, ...defaultMetadataIndexPath().split("/"));
}

function bindScrollSync(pair: ScrollPair): void {
  disposeScrollSync();
  activePair = pair;
  lastBoundScrollPair = pair;

  const onVisibleRanges = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
    if (!activePair || ignoreScrollPairEvents) return;
    const range = event.visibleRanges.at(0);
    if (!range) return;
    if (event.textEditor === activePair.code) {
      syncSideTrackForVisibleSourceRange(activePair, range);
    } else if (event.textEditor === activePair.sidetrack) {
      syncCodeForVisibleSideTrackRange(activePair, range);
    }
  };

  const onDocChange = (e: vscode.TextDocumentChangeEvent) => {
    if (!activePair) return;
    if (e.document !== activePair.code.document && e.document !== activePair.sidetrack.document) {
      return;
    }
    scheduleRefreshActivePairBlocks();
  };

  const onIndexSave = (doc: vscode.TextDocument) => {
    if (!activePair) return;
    if (doc.uri.fsPath !== metadataIndexAbsolutePath(activePair.repoRoot)) return;
    void refreshActivePairBlocks();
  };

  scrollSyncDisposable = vscode.Disposable.from(
    vscode.window.onDidChangeTextEditorVisibleRanges(onVisibleRanges),
    vscode.workspace.onDidChangeTextDocument(onDocChange),
    vscode.workspace.onDidSaveTextDocument(onIndexSave),
  );

  const initial = pair.code.visibleRanges.at(0);
  if (initial) syncSideTrackForVisibleSourceRange(pair, initial);
}

async function ensureSideTrackFile(uri: vscode.Uri): Promise<vscode.Uri> {
  try {
    await vscode.workspace.fs.stat(uri);
    return uri;
  } catch {
    const enc = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, enc.encode("# SideTrack\n\n"));
    return uri;
  }
}

async function resolvePairedPaths(
  editor: vscode.TextEditor,
  folder: vscode.WorkspaceFolder,
  angleId?: string | null,
): Promise<PairedPaths | null> {
  const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
  let normalized: string;
  try {
    normalized = normalizeRepoRelativePath(relative.replaceAll("\\", "/"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      `Could not resolve a repo-relative path for the active editor: ${message}`,
    );
    return null;
  }
  const repoRoot = folder.uri.fsPath;
  const cfg = await loadSideTrackConfig(repoRoot);
  const sourcePrefix = sidetrackStorageSourcePrefix(cfg.storageDir);
  if (normalized.startsWith(sourcePrefix)) {
    await vscode.window.showWarningMessage(
      "Run this command from the primary source file — not from a file under .sidetrack/source/…",
    );
    return null;
  }
  const resolution = resolveSideTrackMarkdownPath(repoRoot, normalized, cfg, angleId ?? undefined);
  const sidetrackUri = vscode.Uri.file(path.join(repoRoot, ...resolution.sidetrackPath.split("/")));
  return {
    repoRoot,
    sourceRelative: normalized,
    sidetrackUri,
    sidetrackPathRel: resolution.sidetrackPath,
    angleId: resolution.angleId,
  };
}

/** 1-based inclusive line range covering every line that touches the selection (for region wrap). */
function fullLineBlockRange(editor: vscode.TextEditor): BlockRange {
  const sel = editor.selection;
  const lo = Math.min(sel.start.line, sel.end.line);
  const hi = Math.max(sel.start.line, sel.end.line);
  return { startLine: lo + 1, endLine: hi + 1 };
}

function selectedRangeTouchesMarkerBoundary(sourceText: string, range: BlockRange): string | null {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const start0 = Math.max(0, range.startLine - 1);
  const end0 = Math.min(lines.length - 1, range.endLine - 1);
  for (let i = start0; i <= end0; i++) {
    const hit = parseSideTrackRegionBoundary(lines[i] ?? "");
    if (hit) return hit.id;
  }
  return null;
}

function selectedRangeInsideMarkerRegion(sourceText: string, range: BlockRange): string | null {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const start0 = Math.max(0, range.startLine - 1);
  const end0 = Math.min(lines.length - 1, range.endLine - 1);

  for (const pair of findSideTrackMarkerPairs(sourceText)) {
    const innerStart = pair.startLine0 + 2;
    const innerEnd = pair.endLine0;
    if (innerEnd < innerStart) continue;
    if (range.startLine >= innerStart && range.endLine <= innerEnd) return pair.id;
  }

  // Fallback for partially edited/unbalanced files: if selected content lines are currently
  // inside any open marker region, treat them as enclosed and refuse insertion.
  const openIds = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const hit = parseSideTrackRegionBoundary(lines[i] ?? "");
    if (hit?.kind === "start") {
      openIds.add(hit.id);
      continue;
    }
    if (hit?.kind === "end") {
      openIds.delete(hit.id);
      continue;
    }
    if (i >= start0 && i <= end0 && openIds.size > 0) {
      return [...openIds][0] ?? null;
    }
  }

  return null;
}

function selectionIntersectsMarkdownFence(sourceText: string, range: BlockRange): boolean {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const start0 = Math.max(0, range.startLine - 1);
  const end0 = Math.min(lines.length - 1, range.endLine - 1);
  let inFence = false;
  let activeFence: "```" | "~~~" | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trimStart();
    const fenceToken = trimmed.startsWith("```") ? "```" : trimmed.startsWith("~~~") ? "~~~" : null;
    if (fenceToken !== null) {
      if (i >= start0 && i <= end0) return true;
      if (!inFence) {
        inFence = true;
        activeFence = fenceToken;
      } else if (activeFence === fenceToken) {
        inFence = false;
        activeFence = null;
      }
      continue;
    }
    if (i >= start0 && i <= end0 && inFence) return true;
  }

  return false;
}

function markerIdFromAnchor(anchor: string): string | null {
  const m = /^marker:([a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?)$/i.exec(anchor.trim());
  if (!m?.[1]) return null;
  try {
    return assertValidMarkerId(m[1]);
  } catch {
    return null;
  }
}

function collectUsedMarkerIds(input: {
  sourceText: string;
  existingSideTrack: string;
  index: SideTrackIndex | null;
  sidetrackPathRel: string;
}): Set<string> {
  const used = new Set<string>();
  for (const pair of findSideTrackMarkerPairs(input.sourceText)) {
    used.add(pair.id);
  }
  const lines = input.sourceText.replaceAll("\r\n", "\n").split("\n");
  for (const line of lines) {
    const hit = parseSideTrackRegionBoundary(line);
    if (hit) used.add(hit.id);
  }
  for (const id of extractSideTrackBlockIdsFromMarkdown(input.existingSideTrack)) {
    used.add(id);
  }
  const indexed = input.index?.bySideTrackPath[input.sidetrackPathRel];
  for (const b of indexed?.blocks ?? []) {
    if (typeof b.markerId === "string" && b.markerId.trim().length > 0) {
      used.add(b.markerId.trim().toLowerCase());
      continue;
    }
    if (typeof b.anchor === "string") {
      const mid = markerIdFromAnchor(b.anchor);
      if (mid) used.add(mid);
    }
  }
  return used;
}

function chooseUniqueMarkerId(preferred: string, used: Set<string>): string {
  const base = preferred.trim().toLowerCase();
  if (base.length > 0 && !used.has(base)) return base;

  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${String(i)}`;
    try {
      const valid = assertValidMarkerId(candidate);
      if (!used.has(valid)) return valid;
    } catch {
      continue;
    }
  }

  for (let i = 0; i < 999; i++) {
    const rand = Math.random().toString(36).slice(2, 8);
    const candidate = `block-${rand}`;
    try {
      const valid = assertValidMarkerId(candidate);
      if (!used.has(valid)) return valid;
    } catch {
      continue;
    }
  }
  throw new Error("Could not generate a unique SideTrack marker id for this selection.");
}

function scrollSyncEnabled(): boolean {
  const v = vscode.workspace.getConfiguration("sidetrack").get("scrollSync.enabled");
  return v !== false;
}

function pairedPathsFromDiskPair(
  repoRoot: string,
  diskPair: { sourcePath: string; sidetrackPath: string },
): PairedPaths {
  const sidetrackUri = vscode.Uri.file(path.join(repoRoot, ...diskPair.sidetrackPath.split("/")));
  return {
    repoRoot,
    sourceRelative: diskPair.sourcePath,
    sidetrackUri,
    sidetrackPathRel: diskPair.sidetrackPath,
    angleId: null,
  };
}

async function bindPairScrollSync(
  codeEditor: vscode.TextEditor,
  sidetrackEditor: vscode.TextEditor,
  paths: PairedPaths,
): Promise<void> {
  let index: SideTrackIndex | null = null;
  try {
    index = await readIndex(paths.repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] readIndex (open pair): ${msg}`);
    void vscode.window.showWarningMessage(
      `SideTrack could not read metadata index.json; block-aware scroll sync is limited until the file is valid. (${msg})`,
    );
  }
  const blocks = buildBlockScrollLinks(
    index,
    paths.sourceRelative,
    paths.sidetrackPathRel,
    sidetrackEditor.document.getText(),
    codeEditor.document.getText(),
  );
  const pair: ScrollPair = {
    code: codeEditor,
    sidetrack: sidetrackEditor,
    blocks,
    repoRoot: paths.repoRoot,
    sourceRelative: paths.sourceRelative,
    sidetrackPathRel: paths.sidetrackPathRel,
  };
  if (scrollSyncEnabled()) {
    bindScrollSync(pair);
  }
}

/**
 * Prefer [source | companion]: if the companion is already past the first column, open the source in
 * column one; otherwise open the source first and place the companion in the group to the right.
 */
async function revealSourceLeftOfCompanionAndReturnEditors(
  companionEditor: vscode.TextEditor,
  sourceDoc: vscode.TextDocument,
): Promise<{ code: vscode.TextEditor; sidetrack: vscode.TextEditor }> {
  const companionUri = companionEditor.document.uri;
  const findCompanion = (): vscode.TextEditor =>
    vscode.window.visibleTextEditors.find(
      (te) => te.document.uri.toString() === companionUri.toString(),
    ) ?? companionEditor;

  const findSource = (doc: vscode.TextDocument): vscode.TextEditor | undefined =>
    vscode.window.visibleTextEditors.find((te) => te.document === doc);

  const cCol = companionEditor.viewColumn;
  if (cCol !== undefined && cCol > vscode.ViewColumn.One) {
    const codeEditor = await vscode.window.showTextDocument(sourceDoc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });
    return { code: codeEditor, sidetrack: findCompanion() };
  }

  const codeEditor = await vscode.window.showTextDocument(sourceDoc, { preview: false });
  const companionDoc = await vscode.workspace.openTextDocument(companionUri);
  await vscode.window.showTextDocument(companionDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false,
    preserveFocus: true,
  });
  const code = findSource(sourceDoc) ?? codeEditor;
  return { code, sidetrack: findCompanion() };
}

async function openBesideAndSync(
  sourceEditor: vscode.TextEditor,
  paths: PairedPaths,
): Promise<vscode.TextEditor> {
  const ensured = await ensureSideTrackFile(paths.sidetrackUri);
  const sidetrackDoc = await vscode.workspace.openTextDocument(ensured);
  const sidetrackEditor = await vscode.window.showTextDocument(sidetrackDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false,
  });
  const codeEditor =
    vscode.window.visibleTextEditors.find((te) => te.document === sourceEditor.document) ??
    sourceEditor;
  await bindPairScrollSync(codeEditor, sidetrackEditor, paths);
  return sidetrackEditor;
}

function workspaceFolderContaining(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

async function requireEditorInWorkspaceFolder(editor: vscode.TextEditor): Promise<{
  editor: vscode.TextEditor;
  folder: vscode.WorkspaceFolder;
} | null> {
  const folder = workspaceFolderContaining(editor.document.uri);
  if (!folder) {
    await vscode.window.showWarningMessage(
      "This file is not inside an open workspace folder. Open the repository root (or a parent folder that contains the project).",
    );
    return null;
  }
  return { editor, folder };
}

async function requireActiveEditorInWorkspace(): Promise<{
  editor: vscode.TextEditor;
  folder: vscode.WorkspaceFolder;
} | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showWarningMessage("Open a source file first.");
    return null;
  }
  if (!vscode.workspace.workspaceFolders?.length) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return null;
  }
  return requireEditorInWorkspaceFolder(editor);
}

async function replaceDocumentContents(
  doc: vscode.TextDocument,
  newContent: string,
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, fullRange, newContent);
  await vscode.workspace.applyEdit(edit);
}

function findPlaceholderSelection(
  doc: vscode.TextDocument,
  blockId: string,
): vscode.Selection | null {
  const PLACEHOLDER_TEXT = "_(write sidetrack here)_";
  const marker = `<!-- sidetrack:block id=${blockId} -->`;
  const text = doc.getText();
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const placeholderIndex = text.indexOf(PLACEHOLDER_TEXT, markerIndex);
  if (placeholderIndex < 0) return null;
  const start = doc.positionAt(placeholderIndex);
  const end = doc.positionAt(placeholderIndex + PLACEHOLDER_TEXT.length);
  return new vscode.Selection(start, end);
}

function findBlockMarkerSelection(
  doc: vscode.TextDocument,
  blockId: string,
): vscode.Selection | null {
  const marker = `<!-- sidetrack:block id=${blockId} -->`;
  const text = doc.getText();
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const headingStart = text.indexOf("\n## ", markerIndex);
  const start = doc.positionAt(markerIndex);
  if (headingStart < 0) {
    return new vscode.Selection(start, start);
  }
  const headingLineStart = headingStart + 1;
  const headingLineEnd = text.indexOf("\n", headingLineStart);
  const endOffset = headingLineEnd < 0 ? text.length : headingLineEnd;
  return new vscode.Selection(start, doc.positionAt(endOffset));
}

async function ensureMarkerBlockPresent(args: {
  markerId: string;
  sourceText: string;
  repoRoot: string;
  sourceRelative: string;
  sidetrackPathRel: string;
  sidetrackDoc: vscode.TextDocument;
}): Promise<void> {
  const sourceRange = sourceLineRangeForMarkerId(args.sourceText, args.markerId);
  if (sourceRange === null) {
    throw new Error(
      `Existing marker region "${args.markerId}" could not be resolved to source lines.`,
    );
  }

  const existingSideTrack = args.sidetrackDoc.getText();
  const markdownHasBlock = extractSideTrackBlockIdsFromMarkdown(existingSideTrack).has(
    args.markerId,
  );
  const created = createBlockForRange({
    sourcePath: args.sourceRelative,
    sourceText: args.sourceText,
    range: { startLine: sourceRange.start, endLine: sourceRange.end },
    id: args.markerId,
  });

  if (!markdownHasBlock) {
    const nextContent = insertBlockBySourceMarkerOrder({
      existingSideTrack,
      blockMarkdown: created.markdown,
      sourceText: args.sourceText,
      markerId: created.block.id,
    });
    const existingMarkers = [...extractSideTrackBlockIdsFromMarkdown(existingSideTrack)];
    const nextMarkers = extractSideTrackBlockIdsFromMarkdown(nextContent);
    const lostMarker = existingMarkers.find((id) => !nextMarkers.has(id));
    if (lostMarker) {
      throw new Error(
        `Refusing to recover block "${args.markerId}" because existing block marker "${lostMarker}" would be removed unexpectedly.`,
      );
    }
    await replaceDocumentContents(args.sidetrackDoc, nextContent);
    await args.sidetrackDoc.save();
  }

  const index = await readIndex(args.repoRoot);
  const indexed = index?.bySideTrackPath[args.sidetrackPathRel];
  const indexHasBlock =
    indexed?.blocks.some(
      (block) =>
        block.id === args.markerId ||
        block.markerId === args.markerId ||
        block.anchor === `marker:${args.markerId}`,
    ) ?? false;
  if (!indexHasBlock) {
    await upsertBlockMetadata(
      args.repoRoot,
      args.sourceRelative,
      args.sidetrackPathRel,
      created.block,
    );
  }
}

async function revealExistingMarkerBlock(args: {
  markerId: string;
  activeEditor: vscode.TextEditor;
  paths: PairedPaths;
  sourceText: string;
}): Promise<void> {
  const ensured = await ensureSideTrackFile(args.paths.sidetrackUri);
  const sidetrackDoc = await vscode.workspace.openTextDocument(ensured);
  await ensureMarkerBlockPresent({
    markerId: args.markerId,
    sourceText: args.sourceText,
    repoRoot: args.paths.repoRoot,
    sourceRelative: args.paths.sourceRelative,
    sidetrackPathRel: args.paths.sidetrackPathRel,
    sidetrackDoc,
  });

  const sidetrackEditor = await openBesideAndSync(args.activeEditor, args.paths);
  const selection =
    findPlaceholderSelection(sidetrackEditor.document, args.markerId) ??
    findBlockMarkerSelection(sidetrackEditor.document, args.markerId);
  if (selection) {
    sidetrackEditor.selection = selection;
    sidetrackEditor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

async function createNewBlockFromSelection(args: {
  activeEditor: vscode.TextEditor;
  paths: PairedPaths;
  lineRange: BlockRange;
  sourceTextBeforeWrap: string;
}): Promise<void> {
  const ensured = await ensureSideTrackFile(args.paths.sidetrackUri);
  const sidetrackDoc = await vscode.workspace.openTextDocument(ensured);
  const existingSideTrack = sidetrackDoc.getText();
  const index = await readIndex(args.paths.repoRoot);
  const suggestedId = defaultRegionMarkerNamingStrategy.suggestMarkerId({
    languageId: args.activeEditor.document.languageId,
    sourceText: args.sourceTextBeforeWrap,
    range: args.lineRange,
  });
  const usedIds = collectUsedMarkerIds({
    sourceText: args.sourceTextBeforeWrap,
    existingSideTrack,
    index,
    sidetrackPathRel: args.paths.sidetrackPathRel,
  });
  const blockId = chooseUniqueMarkerId(suggestedId, usedIds);

  const wrapped = wrapSourceLineRangeWithSideTrackMarkers({
    sourceText: args.sourceTextBeforeWrap,
    range: args.lineRange,
    languageId: args.activeEditor.document.languageId,
    markerId: blockId,
  });
  await replaceDocumentContents(args.activeEditor.document, wrapped.sourceText);
  await args.activeEditor.document.save();
  const sourceText = args.activeEditor.document.getText();
  const created = createBlockForRange({
    sourcePath: args.paths.sourceRelative,
    sourceText,
    range: wrapped.innerRange,
    id: blockId,
  });

  const nextContent = insertBlockBySourceMarkerOrder({
    existingSideTrack,
    blockMarkdown: created.markdown,
    sourceText,
    markerId: created.block.id,
  });

  const existingMarkers = [...extractSideTrackBlockIdsFromMarkdown(existingSideTrack)];
  const nextMarkers = extractSideTrackBlockIdsFromMarkdown(nextContent);
  const lostMarker = existingMarkers.find((id) => !nextMarkers.has(id));
  if (lostMarker) {
    throw new Error(
      `Refusing to overwrite companion content because existing block marker "${lostMarker}" would be removed unexpectedly.`,
    );
  }

  await replaceDocumentContents(sidetrackDoc, nextContent);
  await sidetrackDoc.save();

  await upsertBlockMetadata(
    args.paths.repoRoot,
    args.paths.sourceRelative,
    args.paths.sidetrackPathRel,
    created.block,
  );

  const sidetrackEditor = await openBesideAndSync(args.activeEditor, args.paths);
  const selection = findPlaceholderSelection(sidetrackEditor.document, created.block.id);
  if (selection) {
    sidetrackEditor.selection = selection;
    sidetrackEditor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

async function upsertBlockMetadata(
  repoRoot: string,
  sourceRelative: string,
  sidetrackPathRel: string,
  block: Parameters<typeof addBlockToIndex>[1]["block"],
): Promise<void> {
  let current: SideTrackIndex;
  try {
    current = (await readIndex(repoRoot)) ?? emptyIndex();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] readIndex (block metadata): ${msg}`);
    current = emptyIndex();
  }
  const next = addBlockToIndex(current, {
    sourcePath: sourceRelative,
    sidetrackPath: sidetrackPathRel,
    block,
  });
  await writeIndex(repoRoot, next);
}

function uriFromOpenSideBySideArgs(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  if (Array.isArray(arg) && arg[0] instanceof vscode.Uri) return arg[0];
  return undefined;
}

/** `executeCommand("sidetrack.openSideTrackAngle", { angleId: "…" })` skips the picker (tests, keybindings). */
type OpenAngleCommandArg = "absent" | "invalid" | { angleId: string };

function presetAngleFromOpenAngleCommandArg(arg: unknown): OpenAngleCommandArg {
  if (arg === undefined || arg === null) return "absent";
  if (typeof arg !== "object") return "invalid";
  if (!("angleId" in arg)) return "absent";
  const raw = Reflect.get(arg, "angleId");
  if (typeof raw !== "string") return "invalid";
  const t = raw.trim();
  if (t.length === 0) return "invalid";
  try {
    return { angleId: assertValidAngleId(t) };
  } catch {
    return "invalid";
  }
}

function validateAngleIdInput(value: string): string | undefined {
  try {
    assertValidAngleId(value);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Angles layout must be on. Returns an angle id, or `null` when the user cancels, angles are off,
 * or the programmatic `arg` is invalid (after showing a warning).
 */
async function pickSideTrackAngleIdInteractively(
  folder: vscode.WorkspaceFolder,
  arg: unknown | undefined,
  quickPickTitle: string,
  placeHolder: string,
): Promise<string | null> {
  const cfg = await loadSideTrackConfig(folder.uri.fsPath);
  if (!sidetrackAnglesLayoutEnabled(folder.uri.fsPath, cfg.storageDir)) {
    const sentinel = sidetrackAnglesSentinelPath(cfg.storageDir);
    await vscode.window.showInformationMessage(
      `Angles layout is off (missing ${sentinel}). Use “SideTrack: Add angle to project…” to enable it and register angles in .sidetrack.toml.`,
    );
    return null;
  }

  const preset = presetAngleFromOpenAngleCommandArg(arg);
  if (preset === "invalid") {
    await vscode.window.showWarningMessage(
      'Invalid angle id: use { "angleId": "your-angle" } when invoking this command programmatically.',
    );
    return null;
  }

  if (preset !== "absent") return preset.angleId;

  const items: vscode.QuickPickItem[] = cfg.angles.definitions.map((d) => ({
    label: d.title,
    description: d.id,
  }));
  items.push({ label: "Custom angle id…", alwaysShow: true });
  const chosen = await vscode.window.showQuickPick(items, {
    title: quickPickTitle,
    placeHolder,
  });
  if (!chosen) return null;
  if (chosen.label === "Custom angle id…") {
    const raw = await vscode.window.showInputBox({
      title: "Angle id",
      prompt: "Use letters, digits, underscores, or hyphens (1–64 chars).",
      validateInput: validateAngleIdInput,
    });
    if (!raw) return null;
    return assertValidAngleId(raw);
  }
  if (!chosen.description) return null;
  return assertValidAngleId(chosen.description);
}

/** `executeCommand("sidetrack.addAngleDefinition", { id: "architecture", title: "Architecture", makeDefault: true })` skips prompts (tests, automation). */
type AddAngleDefinitionCommandArg =
  "absent" | "invalid" | { id: string; title?: string; makeDefault?: boolean };

function parseOptionalString(value: unknown): string | "invalid" | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | "invalid" | undefined {
  if (value === undefined) return undefined;
  return typeof value === "boolean" ? value : "invalid";
}

function presetFromAddAngleDefinitionCommandArg(arg: unknown): AddAngleDefinitionCommandArg {
  if (arg === undefined || arg === null) return "absent";
  if (typeof arg !== "object") return "invalid";
  if (!("id" in arg)) return "absent";
  const rawId = Reflect.get(arg, "id");
  if (typeof rawId !== "string") return "invalid";
  const trimmedId = rawId.trim();
  if (trimmedId.length === 0) return "invalid";
  let id: string;
  try {
    id = assertValidAngleId(trimmedId);
  } catch {
    return "invalid";
  }
  const title = parseOptionalString(Reflect.get(arg, "title"));
  if (title === "invalid") return "invalid";
  const makeDefault = parseOptionalBoolean(Reflect.get(arg, "makeDefault"));
  if (makeDefault === "invalid") return "invalid";
  return { id, title, makeDefault };
}

async function openSideBySideCommand(arg?: unknown): Promise<void> {
  let editor = vscode.window.activeTextEditor;
  const fromExplorer = uriFromOpenSideBySideArgs(arg);
  if (fromExplorer) {
    const doc = await vscode.workspace.openTextDocument(fromExplorer);
    editor = await vscode.window.showTextDocument(doc, { preview: false });
  }
  if (!editor) {
    await vscode.window.showWarningMessage("Open a source file first.");
    return;
  }
  if (!vscode.workspace.workspaceFolders?.length) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return;
  }
  const active = await requireEditorInWorkspaceFolder(editor);
  if (!active) return;
  const paths = await resolvePairedPaths(active.editor, active.folder);
  if (!paths) return;
  await openBesideAndSync(active.editor, paths);
}

async function openSideTrackAngleCommand(arg?: unknown): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;
  const angleId = await pickSideTrackAngleIdInteractively(
    active.folder,
    arg,
    "Open SideTrack angle",
    "Pick an angle for the current source file",
  );
  if (!angleId) return;

  const paths = await resolvePairedPaths(active.editor, active.folder, angleId);
  if (!paths) return;
  await openBesideAndSync(active.editor, paths);
}

function pickWorkspaceFolderForRepoWideCommand(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fromDoc = workspaceFolderContaining(editor.document.uri);
    if (fromDoc) return fromDoc;
  }
  return folders[0];
}

async function addAngleDefinitionCommand(arg?: unknown): Promise<void> {
  const folder = pickWorkspaceFolderForRepoWideCommand();
  if (!folder) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return;
  }
  const repoRoot = folder.uri.fsPath;
  const cfg = await loadSideTrackConfig(repoRoot);
  const preset = presetFromAddAngleDefinitionCommandArg(arg);
  if (preset === "invalid") {
    await vscode.window.showWarningMessage(
      'Invalid angle definition: use { "id": "your-angle", "title"?: "Display title", "makeDefault"?: true|false } when invoking this command programmatically.',
    );
    return;
  }

  let id: string;
  let title: string | undefined;
  let makeDefault: boolean;
  if (preset === "absent") {
    const idRaw = await vscode.window.showInputBox({
      title: "New SideTrack angle",
      prompt: "Short id (used in paths and .sidetrack.toml), e.g. architecture",
      validateInput: validateAngleIdInput,
    });
    if (!idRaw) return;
    id = assertValidAngleId(idRaw);
    const titleRaw = await vscode.window.showInputBox({
      title: "Display title",
      prompt: "Optional — shown in the angle picker",
      value: id,
    });
    title = titleRaw?.trim() && titleRaw.trim() !== id ? titleRaw.trim() : undefined;
    makeDefault = cfg.angles.definitions.length === 0;
    if (!makeDefault) {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "Yes", description: "Set as default_angle in .sidetrack.toml" },
          { label: "No", description: "Keep the current default" },
        ],
        { placeHolder: `Set “${id}” as the default angle?` },
      );
      makeDefault = pick?.label === "Yes";
    }
  } else {
    id = preset.id;
    title = preset.title;
    makeDefault = preset.makeDefault ?? cfg.angles.definitions.length === 0;
  }

  try {
    await ensureAnglesSentinelFile(repoRoot, cfg.storageDir);
    await upsertAngleDefinitionInSideTrackToml(repoRoot, {
      id,
      title,
      makeDefault,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await vscode.window.showErrorMessage(`Could not update .sidetrack.toml: ${msg}`);
    return;
  }
  void vscode.window.showInformationMessage(
    `Angle “${id}” was added to .sidetrack.toml and Angles layout is enabled (${sidetrackAnglesSentinelPath(cfg.storageDir)}).`,
  );
}

async function startBlockFromSelectionCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;
  const paths = await resolvePairedPaths(active.editor, active.folder);
  if (!paths) return;
  try {
    const lineRange = fullLineBlockRange(active.editor);
    const sourceTextBeforeWrap = active.editor.document.getText();

    if (
      (active.editor.document.languageId === "markdown" ||
        active.editor.document.languageId === "md") &&
      selectionIntersectsMarkdownFence(sourceTextBeforeWrap, lineRange)
    ) {
      void vscode.window.showWarningMessage(
        "Selection intersects a fenced Markdown code block. Add-block stays strict here because inserting SideTrack markers would change rendered code content.",
      );
      return;
    }

    const touchedBoundaryId = selectedRangeTouchesMarkerBoundary(sourceTextBeforeWrap, lineRange);
    if (touchedBoundaryId) {
      await revealExistingMarkerBlock({
        markerId: touchedBoundaryId,
        activeEditor: active.editor,
        paths,
        sourceText: sourceTextBeforeWrap,
      });
      return;
    }
    const enclosingId = selectedRangeInsideMarkerRegion(sourceTextBeforeWrap, lineRange);
    if (enclosingId) {
      await revealExistingMarkerBlock({
        markerId: enclosingId,
        activeEditor: active.editor,
        paths,
        sourceText: sourceTextBeforeWrap,
      });
      return;
    }

    await createNewBlockFromSelection({
      activeEditor: active.editor,
      paths,
      lineRange,
      sourceTextBeforeWrap,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] startBlockFromSelection failed: ${msg}`);
    await vscode.window.showErrorMessage(`Could not add SideTrack block: ${msg}`);
  }
}

async function resolvePathsForActiveEditor(active: {
  editor: vscode.TextEditor;
  folder: vscode.WorkspaceFolder;
}): Promise<PairedPaths | null> {
  const relative = vscode.workspace.asRelativePath(active.editor.document.uri, false);
  let normalized: string;
  try {
    normalized = normalizeRepoRelativePath(relative.replaceAll("\\", "/"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      `Could not resolve a repo-relative path for the active editor: ${message}`,
    );
    return null;
  }
  const repoRoot = active.folder.uri.fsPath;
  const cfg = await loadSideTrackConfig(repoRoot);

  const diskPair = resolveCompanionPathToSourcePair(normalized, repoRoot, cfg);
  if (diskPair) {
    const sidetrackUri = vscode.Uri.file(path.join(repoRoot, ...diskPair.sidetrackPath.split("/")));
    return {
      repoRoot,
      sourceRelative: diskPair.sourcePath,
      sidetrackUri,
      sidetrackPathRel: diskPair.sidetrackPath,
      angleId: null,
    };
  }

  return resolvePairedPaths(active.editor, active.folder);
}

async function detectOrPromptBlockId(active: {
  editor: vscode.TextEditor;
  folder: vscode.WorkspaceFolder;
}): Promise<string | undefined> {
  let blockId: string | undefined;

  const sourceText = active.editor.document.getText();
  const lineRange = fullLineBlockRange(active.editor);

  const isMarkdown =
    active.editor.document.languageId === "markdown" || active.editor.document.languageId === "md";
  if (isMarkdown) {
    const offset = active.editor.document.offsetAt(active.editor.selection.active);
    const hits: { id: string; start: number }[] = [];
    const markerRe = /<!--\s*sidetrack:block\s+id=([a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?)\s*-->/gi;
    for (const m of sourceText.matchAll(markerRe)) {
      const idRaw = m[1];
      if (idRaw === undefined) continue;
      const start = m.index ?? -1;
      if (start < 0) continue;
      try {
        hits.push({ id: assertValidMarkerId(idRaw), start });
      } catch {
        // ignore
      }
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i];
      if (hit && hit.start <= offset) {
        blockId = hit.id;
        break;
      }
    }
  } else {
    const touchedBoundaryId = selectedRangeTouchesMarkerBoundary(sourceText, lineRange);
    if (touchedBoundaryId) {
      blockId = touchedBoundaryId;
    } else {
      const enclosingId = selectedRangeInsideMarkerRegion(sourceText, lineRange);
      if (enclosingId) {
        blockId = enclosingId;
      }
    }
  }

  if (!blockId) {
    blockId = await vscode.window.showInputBox({
      prompt: "Enter block / region ID to remove",
      placeHolder: "e.g. abc123",
      validateInput: (val) => {
        try {
          assertValidMarkerId(val);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
    });
  }

  return blockId;
}

async function removeMarkersFromSource(paths: PairedPaths, blockId: string): Promise<void> {
  const sourceUri = vscode.Uri.file(path.join(paths.repoRoot, ...paths.sourceRelative.split("/")));
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  const sourceContent = sourceDoc.getText();
  const updatedSource = removeSourceMarkersFromText(sourceContent, blockId);
  if (updatedSource !== sourceContent) {
    const sourceEditor = vscode.window.visibleTextEditors.find(
      (te) => te.document.uri.toString() === sourceDoc.uri.toString(),
    );
    if (sourceEditor) {
      await replaceDocumentContents(sourceEditor.document, updatedSource);
      await sourceEditor.document.save();
    } else {
      await replaceDocumentContents(sourceDoc, updatedSource);
      await sourceDoc.save();
    }
  }
}

async function removeBlockFromCompanion(paths: PairedPaths, blockId: string): Promise<void> {
  let sidetrackDoc: vscode.TextDocument | null = null;
  try {
    sidetrackDoc = await vscode.workspace.openTextDocument(paths.sidetrackUri);
  } catch {
    // Ignore
  }

  if (sidetrackDoc) {
    const sidetrackContent = sidetrackDoc.getText();
    const updatedSideTrack = removeBlockFromSideTrack(sidetrackContent, blockId);
    if (updatedSideTrack !== sidetrackContent) {
      const sidetrackEditor = vscode.window.visibleTextEditors.find(
        (te) => te.document.uri.toString() === sidetrackDoc.uri.toString(),
      );
      if (sidetrackEditor) {
        await replaceDocumentContents(sidetrackEditor.document, updatedSideTrack);
        await sidetrackEditor.document.save();
      } else {
        await replaceDocumentContents(sidetrackDoc, updatedSideTrack);
        await sidetrackDoc.save();
      }
    }
  }
}

async function removeBlockFromIdx(paths: PairedPaths, blockId: string): Promise<void> {
  let currentIdx: SideTrackIndex;
  try {
    currentIdx = (await readIndex(paths.repoRoot)) ?? emptyIndex();
  } catch {
    currentIdx = emptyIndex();
  }
  const updatedIdx = removeBlockFromIndex(currentIdx, paths.sidetrackPathRel, blockId);
  await writeIndex(paths.repoRoot, updatedIdx);
}

async function removeBlockCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;

  const paths = await resolvePathsForActiveEditor(active);
  if (!paths) return;

  const blockId = await detectOrPromptBlockId(active);
  if (!blockId) return;

  try {
    await removeMarkersFromSource(paths, blockId);
    await removeBlockFromCompanion(paths, blockId);
    await removeBlockFromIdx(paths, blockId);

    void vscode.window.showInformationMessage(`SideTrack block "${blockId}" removed successfully.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] removeBlock failed: ${msg}`);
    await vscode.window.showErrorMessage(`Could not remove block: ${msg}`);
  }
}

async function cleanRegionsCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;

  const paths = await resolvePathsForActiveEditor(active);
  if (!paths) return;

  try {
    const sourceUri = vscode.Uri.file(
      path.join(paths.repoRoot, ...paths.sourceRelative.split("/")),
    );
    const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
    const sourceText = sourceDoc.getText();

    let sidetrackDoc: vscode.TextDocument;
    try {
      sidetrackDoc = await vscode.workspace.openTextDocument(paths.sidetrackUri);
    } catch {
      await vscode.window.showWarningMessage("Paired companion markdown file does not exist.");
      return;
    }
    const sidetrackMarkdown = sidetrackDoc.getText();

    let index: SideTrackIndex;
    try {
      index = (await readIndex(paths.repoRoot)) ?? emptyIndex();
    } catch {
      index = emptyIndex();
    }

    const result = alignAndCleanRegions({
      sourceText,
      sidetrackMarkdown,
      index,
      sidetrackPath: paths.sidetrackPathRel,
      sourcePath: paths.sourceRelative,
    });

    await writeIndex(paths.repoRoot, result.index);

    if (result.sidetrackMarkdown !== sidetrackMarkdown) {
      const sidetrackEditor = vscode.window.visibleTextEditors.find(
        (te) => te.document.uri.toString() === sidetrackDoc.uri.toString(),
      );
      if (sidetrackEditor) {
        await replaceDocumentContents(sidetrackEditor.document, result.sidetrackMarkdown);
        await sidetrackEditor.document.save();
      } else {
        await replaceDocumentContents(sidetrackDoc, result.sidetrackMarkdown);
        await sidetrackDoc.save();
      }
    }

    void vscode.window.showInformationMessage("SideTrack regions aligned and cleaned up.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] cleanRegions failed: ${msg}`);
    await vscode.window.showErrorMessage(`Could not clean regions: ${msg}`);
  }
}

async function repairFileCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;

  const paths = await resolvePathsForActiveEditor(active);
  if (!paths) return;

  try {
    const sourceUri = vscode.Uri.file(
      path.join(paths.repoRoot, ...paths.sourceRelative.split("/")),
    );
    const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
    const sourceText = sourceDoc.getText();

    let sidetrackDoc: vscode.TextDocument;
    try {
      sidetrackDoc = await vscode.workspace.openTextDocument(paths.sidetrackUri);
    } catch {
      await vscode.window.showWarningMessage("Paired companion markdown file does not exist.");
      return;
    }
    const companionMarkdown = sidetrackDoc.getText();

    let index: SideTrackIndex;
    try {
      index = (await readIndex(paths.repoRoot)) ?? emptyIndex();
    } catch {
      index = emptyIndex();
    }

    const result = healSourceFile({
      sourceText,
      languageId: active.editor.document.languageId,
      companionMarkdown,
      index,
      sidetrackPath: paths.sidetrackPathRel,
    });

    if (result.healedCount === 0) {
      void vscode.window.showInformationMessage(
        "No missing sidetrack region markers detected or healed.",
      );
      return;
    }

    // Write index and source back
    await writeIndex(paths.repoRoot, result.index);

    const sourceEditor = vscode.window.visibleTextEditors.find(
      (te) => te.document.uri.toString() === sourceDoc.uri.toString(),
    );
    if (sourceEditor) {
      await replaceDocumentContents(sourceEditor.document, result.sourceText);
      await sourceEditor.document.save();
    } else {
      await replaceDocumentContents(sourceDoc, result.sourceText);
      await sourceDoc.save();
    }

    void vscode.window.showInformationMessage(
      `Successfully repaired and restored ${result.healedCount} region marker(s).`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] repairFile failed: ${msg}`);
    await vscode.window.showErrorMessage(`Could not repair file: ${msg}`);
  }
}

async function renameCompanionFile(
  oldCp: string,
  entry: SourceFileIndexEntry,
  newNorm: string,
  repoRoot: string,
  cfg: Awaited<ReturnType<typeof loadSideTrackConfig>>,
  anglesLayout: boolean,
): Promise<void> {
  let newCp = oldCp;
  if (anglesLayout) {
    const angleId = inferAngleIdFromSideTrackPath(
      entry.sidetrackPath,
      entry.sourcePath,
      cfg.storageDir,
    );
    if (angleId) {
      try {
        newCp = sidetrackMarkdownPathForAngle(newNorm, assertValidAngleId(angleId), cfg.storageDir);
      } catch (err) {
        logSideTrack(`[sidetrack] rename watcher failed to resolve angle path: ${err}`);
      }
    }
  } else {
    newCp = sidetrackMarkdownPath(newNorm, cfg.storageDir);
  }

  if (newCp !== oldCp) {
    const oldUri = vscode.Uri.file(path.join(repoRoot, ...oldCp.split("/")));
    const newUri = vscode.Uri.file(path.join(repoRoot, ...newCp.split("/")));
    try {
      const parent = path.dirname(newUri.fsPath);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(parent));
      await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: true });
      logSideTrack(
        `[sidetrack] Automatically renamed companion Markdown file on disk: ${oldCp} -> ${newCp}`,
      );
    } catch (renameErr) {
      logSideTrack(`[sidetrack] Failed to rename companion file on disk: ${renameErr}`);
    }
  }
}

async function handleFileRename(file: { oldUri: vscode.Uri; newUri: vscode.Uri }): Promise<void> {
  try {
    const relativeOld = vscode.workspace.asRelativePath(file.oldUri, false);
    const relativeNew = vscode.workspace.asRelativePath(file.newUri, false);
    const oldNorm = normalizeRepoRelativePath(relativeOld.replaceAll("\\", "/"));
    const newNorm = normalizeRepoRelativePath(relativeNew.replaceAll("\\", "/"));

    const folder = vscode.workspace.getWorkspaceFolder(file.newUri);
    if (!folder) return;
    const repoRoot = folder.uri.fsPath;

    const cfg = await loadSideTrackConfig(repoRoot);
    const index = await readIndex(repoRoot);
    if (!index) return;

    const anglesLayout = sidetrackAnglesLayoutEnabled(repoRoot, cfg.storageDir);
    const renames = [{ from: oldNorm, to: newNorm }];

    for (const [oldCp, entry] of Object.entries(index.bySideTrackPath)) {
      if (normalizeRepoRelativePath(entry.sourcePath) === oldNorm) {
        await renameCompanionFile(oldCp, entry, newNorm, repoRoot, cfg, anglesLayout);
      }
    }

    const result = applyPathRenamesToSideTrackIndex(index, renames, repoRoot, cfg);
    if (result.changed) {
      await writeIndex(repoRoot, result.index);
      logSideTrack(
        `[sidetrack] Automatically updated index for renamed file: ${oldNorm} -> ${newNorm}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSideTrack(`[sidetrack] rename watcher failed: ${msg}`);
  }
}

function registerRenameWatcher(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidRenameFiles(async (e) => {
    for (const file of e.files) {
      await handleFileRename(file);
    }
  });
  context.subscriptions.push(disposable);
}

async function initWorkspaceCommand(output: vscode.OutputChannel): Promise<void> {
  const folder = pickWorkspaceFolderForRepoWideCommand();
  if (!folder) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return;
  }

  const repoRoot = folder.uri.fsPath;
  let init;
  try {
    init = await initializeSideTrackProject(repoRoot, {
      ensureSiteGitignore: true,
      runValidation: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await vscode.window.showErrorMessage(`SideTrack init failed: ${msg}`);
    return;
  }

  output.clear();
  output.appendLine("SideTrack init summary:");
  output.appendLine(`- created index: ${init.createdIndex ? "yes" : "no"}`);
  output.appendLine(`- migrated index: ${init.migratedIndex ? "yes" : "no"}`);
  output.appendLine(`- created .sidetrack.toml: ${init.createdToml ? "yes" : "no"}`);
  output.appendLine(`- added _site to .gitignore: ${init.addedSiteGitignore ? "yes" : "no"}`);
  for (const issue of init.validationIssues) {
    output.appendLine(`[${issue.level}] ${issue.message}`);
  }

  const hasErrors = init.validationIssues.some((i) => i.level === "error");
  if (hasErrors) {
    output.show(true);
    void vscode.window.showErrorMessage(
      "SideTrack initialized, but validation reported errors. See the SideTrack output panel.",
    );
  } else {
    void vscode.window.showInformationMessage("SideTrack initialized for this workspace.");
  }

  void applySideTrackActiveEditorUiContexts(vscode.window.activeTextEditor?.document.uri);
}

async function validateWorkspaceCommand(output: vscode.OutputChannel): Promise<void> {
  const folder = pickWorkspaceFolderForRepoWideCommand();
  if (!folder) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return;
  }
  const result = await validateProject(folder.uri.fsPath);
  output.clear();
  for (const issue of result.issues) {
    output.appendLine(`[${issue.level}] ${issue.message}`);
  }
  if (result.issues.length === 0) {
    output.appendLine("No issues found.");
  }
  output.show(true);
}

async function openSideTrackPreviewCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;

  // Companion track is already focused — built-in preview applies to this `.md`.
  try {
    const relative = vscode.workspace.asRelativePath(active.editor.document.uri, false);
    const normalized = normalizeRepoRelativePath(relative.replaceAll("\\", "/"));
    const cfg = await loadSideTrackConfig(active.folder.uri.fsPath);
    const sourcePrefix = sidetrackStorageSourcePrefix(cfg.storageDir);
    if (normalized.startsWith(sourcePrefix) && active.editor.document.fileName.endsWith(".md")) {
      await vscode.commands.executeCommand("markdown.showPreview", active.editor.document.uri);
      return;
    }
  } catch {
    /* fall through: resolve paired paths from primary */
  }

  const paths = await resolvePairedPaths(active.editor, active.folder);
  if (!paths) return;
  const ensured = await ensureSideTrackFile(paths.sidetrackUri);
  await vscode.commands.executeCommand("markdown.showPreview", ensured);
}

async function openCorrespondingSourceCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showWarningMessage("Open a SideTrack companion markdown file first.");
    return;
  }
  if (!vscode.workspace.workspaceFolders?.length) {
    await vscode.window.showWarningMessage("Open a workspace folder first.");
    return;
  }
  const active = await requireEditorInWorkspaceFolder(editor);
  if (!active) return;

  let normalized: string;
  try {
    const relative = vscode.workspace.asRelativePath(active.editor.document.uri, false);
    normalized = normalizeRepoRelativePath(relative.replaceAll("\\", "/"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      `Could not resolve a repo-relative path for the active editor: ${message}`,
    );
    return;
  }

  const repoRoot = active.folder.uri.fsPath;
  const cfg = await loadSideTrackConfig(repoRoot);
  const diskPair = resolveCompanionPathToSourcePair(normalized, repoRoot, cfg);

  if (!diskPair) {
    await vscode.window.showInformationMessage(
      "Open a SideTrack companion `.md` (under storage/source or the configured static_site.sidetrack_markdown path) to jump to its primary source file.",
    );
    return;
  }

  const sourceAbs = path.join(repoRoot, ...diskPair.sourcePath.split("/"));
  const sourceUri = vscode.Uri.file(sourceAbs);
  try {
    await vscode.workspace.fs.stat(sourceUri);
  } catch {
    await vscode.window.showErrorMessage(
      `Primary source file is missing on disk: ${diskPair.sourcePath}`,
    );
    return;
  }

  const paths = pairedPathsFromDiskPair(repoRoot, diskPair);
  const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
  const { code, sidetrack } = await revealSourceLeftOfCompanionAndReturnEditors(editor, sourceDoc);
  await bindPairScrollSync(code, sidetrack, paths);
  await vscode.window.showTextDocument(code.document, {
    viewColumn: code.viewColumn,
    preview: false,
    preserveFocus: false,
  });
}

function resolveCompanionPathToSourcePair(
  normalizedRepoPath: string,
  repoRoot: string,
  cfg: Awaited<ReturnType<typeof loadSideTrackConfig>>,
): { sourcePath: string; sidetrackPath: string } | null {
  const sourcePrefix = sidetrackStorageSourcePrefix(cfg.storageDir);
  if (normalizedRepoPath.startsWith(sourcePrefix) && normalizedRepoPath.endsWith(".md")) {
    const relFromSourceDir = normalizedRepoPath.slice(sourcePrefix.length);
    const storageNorm = normalizeRepoRelativePath(cfg.storageDir.replaceAll("\\", "/"));
    const anglesOn = sidetrackAnglesLayoutEnabled(repoRoot, cfg.storageDir);
    return pairFromSideTrackSourceRel(storageNorm, relFromSourceDir, anglesOn);
  }

  const configured = cfg.staticSite.sidetrackMarkdownFile
    ? normalizeRepoRelativePath(cfg.staticSite.sidetrackMarkdownFile.replaceAll("\\", "/"))
    : "";
  if (
    configured.length > 0 &&
    normalizedRepoPath === configured &&
    cfg.staticSite.sourceFile.trim().length > 0
  ) {
    return {
      sourcePath: normalizeRepoRelativePath(cfg.staticSite.sourceFile.replaceAll("\\", "/")),
      sidetrackPath: configured,
    };
  }

  return null;
}

async function openRenderedPreviewCore(
  editor: vscode.TextEditor,
  folder: vscode.WorkspaceFolder,
  angleId?: string | null,
): Promise<void> {
  const paths = await resolvePairedPaths(editor, folder, angleId);
  if (!paths) return;
  const ensured = await ensureSideTrackFile(paths.sidetrackUri);
  const cfg = await loadSideTrackConfig(folder.uri.fsPath);
  const editorNow =
    vscode.window.visibleTextEditors.find((e) => e.document === editor.document) ?? editor;
  await SideTrackRenderedPreviewPanel.openOrReveal({
    repoRoot: paths.repoRoot,
    storageDir: cfg.storageDir,
    sourceRelative: paths.sourceRelative,
    sidetrackPathRel: paths.sidetrackPathRel,
    sidetrackUri: ensured,
    sourceEditor: editorNow,
    pauseEditorScrollSync: () => disposeScrollSync(),
    restoreEditorScrollSync: () => applyScrollSyncSettingFromConfig(),
  });
}

async function openRenderedPreviewFromSourceCommand(): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;
  await openRenderedPreviewCore(active.editor, active.folder);
}

async function openRenderedPreviewChooseAngleCommand(arg?: unknown): Promise<void> {
  const active = await requireActiveEditorInWorkspace();
  if (!active) return;
  const angleId = await pickSideTrackAngleIdInteractively(
    active.folder,
    arg,
    "Rendered SideTrack preview — angle",
    "Pick an angle for the current source file",
  );
  if (!angleId) return;

  await openRenderedPreviewCore(active.editor, active.folder, angleId);
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("SideTrack");
  sidetrackOutput = output;
  const refreshUiContexts = () =>
    void applySideTrackActiveEditorUiContexts(vscode.window.activeTextEditor?.document.uri);

  // Register commands before any listener that might throw — otherwise the host can show
  // "command … not found" when activation aborts mid-way.
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("sidetrack.init", () => initWorkspaceCommand(output)),
    vscode.commands.registerCommand("sidetrack.openSideBySide", openSideBySideCommand),
    vscode.commands.registerCommand("sidetrack.openSideTrackAngle", openSideTrackAngleCommand),
    vscode.commands.registerCommand("sidetrack.addAngleDefinition", addAngleDefinitionCommand),
    vscode.commands.registerCommand(
      "sidetrack.startBlockFromSelection",
      startBlockFromSelectionCommand,
    ),
    vscode.commands.registerCommand("sidetrack.openSideTrackPreview", openSideTrackPreviewCommand),
    vscode.commands.registerCommand(
      "sidetrack.openCorrespondingSource",
      openCorrespondingSourceCommand,
    ),
    vscode.commands.registerCommand(
      "sidetrack.openRenderedPreview",
      openRenderedPreviewFromSourceCommand,
    ),
    vscode.commands.registerCommand(
      "sidetrack.openRenderedPreviewChooseAngle",
      openRenderedPreviewChooseAngleCommand,
    ),
    vscode.commands.registerCommand("sidetrack.validateWorkspace", () =>
      validateWorkspaceCommand(output),
    ),
    vscode.commands.registerCommand("sidetrack.removeBlock", removeBlockCommand),
    vscode.commands.registerCommand("sidetrack.cleanRegions", cleanRegionsCommand),
    vscode.commands.registerCommand("sidetrack.repairFile", repairFileCommand),
    vscode.workspace.onDidChangeConfiguration((e) => {
      try {
        if (!e.affectsConfiguration("sidetrack.scrollSync")) return;
        applyScrollSyncSettingFromConfig();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logSideTrack(`[sidetrack] scroll sync setting handler: ${msg}`);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      void applySideTrackActiveEditorUiContexts(ed?.document.uri);
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      refreshUiContexts();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshUiContexts();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (path.basename(doc.uri.fsPath) !== ".sidetrack.toml") return;
      refreshUiContexts();
    }),
    // Watch for external init (e.g. `sidetrack serve` creating files without a save event).
    (() => {
      const watcher = vscode.workspace.createFileSystemWatcher("**/.sidetrack.toml");
      const refresh = () => refreshUiContexts();
      watcher.onDidCreate(refresh);
      watcher.onDidChange(refresh);
      watcher.onDidDelete(refresh);
      return watcher;
    })(),
    (() => {
      const watcher = vscode.workspace.createFileSystemWatcher("**/.sidetrack/metadata/index.json");
      const refresh = () => refreshUiContexts();
      watcher.onDidCreate(refresh);
      watcher.onDidChange(refresh);
      watcher.onDidDelete(refresh);
      return watcher;
    })(),
    (() => {
      const watcher = vscode.workspace.createFileSystemWatcher("**/.sidetrack/source/**");
      const refresh = () => refreshUiContexts();
      watcher.onDidCreate(refresh);
      watcher.onDidDelete(refresh);
      return watcher;
    })(),
    { dispose: () => disposeScrollSync() },
  );

  registerRenameWatcher(context);
  refreshUiContexts();
}

export function deactivate() {
  SideTrackRenderedPreviewPanel.disposeIfOpen();
  disposeScrollSync();
  lastBoundScrollPair = undefined;
  sidetrackOutput = undefined;
  void applySideTrackActiveEditorUiContexts(undefined);
}

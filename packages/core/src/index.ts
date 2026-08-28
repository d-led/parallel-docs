export type { SideTrackBlock, SideTrackIndex, SourceFileIndexEntry } from "./model.js";
export { coerceIndexSchemaVersion, CURRENT_SCHEMA_VERSION } from "./model.js";
export type {
  AddBlockToIndexInput,
  AlignAndCleanRegionsInput,
  BlockRange,
  CreateBlockForRangeInput,
  CreatedBlock,
  WrapSourceLineRangeWithSideTrackMarkersInput,
  WrapSourceLineRangeWithSideTrackMarkersResult,
} from "./blocks.js";
export {
  addBlockToIndex,
  alignAndCleanRegions,
  appendBlockToSideTrack,
  createBlockForRange,
  generateBlockId,
  insertBlockBySourceMarkerOrder,
  removeBlockFromSideTrack,
  removeBlockFromIndex,
  removeSourceMarkersFromText,
  wrapSourceLineRangeWithSideTrackMarkers,
} from "./blocks.js";
export { healSourceFile } from "./self-healing.js";
export { assertValidAngleId } from "./angles.js";
export {
  applyAnglesFlatMigrationToSideTrackToml,
  ensureAnglesSentinelFile,
  upsertAngleDefinitionInSideTrackToml,
} from "./angles-toml.js";
export type {
  ApplyAnglesFlatMigrationTomlInput,
  UpsertAngleDefinitionInput,
} from "./angles-toml.js";
export {
  defaultAngleIdForOpen,
  FALLBACK_DEFAULT_ANGLE_ID,
  resolveSideTrackMarkdownPath,
} from "./sidetrack-path-resolution.js";
export type { ResolvedSideTrackMarkdownPath } from "./sidetrack-path-resolution.js";
export {
  sidetrackAnglesLayoutEnabled,
  sidetrackAnglesSentinelPath,
  sidetrackMarkdownPath,
  sidetrackMarkdownPathForAngle,
  defaultMetadataIndexPath,
  normalizeRepoRelativePath,
  resolvePathUnderRepoRoot,
} from "./paths.js";
export { findMonorepoPackagesDir, monorepoLayoutStartDir } from "./monorepo-layout.js";
export type {
  SideTrackStaticBrowsePairPaths,
  SideTrackStaticBrowsePathResolver,
} from "./browse-contract.js";
export { defaultSideTrackStaticBrowsePathResolver } from "./browse-path-default.js";
export { staticBrowseIndexRelPathFromPair } from "./sidetrack-static-browse-path.js";
export {
  sidetrackActiveEditorUiFlags,
  sidetrackStorageSourcePrefix,
} from "./sidetrack-active-editor-ui-context.js";
export type { SideTrackActiveEditorUiFlags } from "./sidetrack-active-editor-ui-context.js";
export {
  sidetrackPairSourceFileExistsOnDisk,
  discoverSideTrackPairsOnDisk,
  pairFromSideTrackSourceRel,
} from "./sidetrack-disk-pairs.js";
export type { DiskSideTrackPair } from "./sidetrack-disk-pairs.js";
export {
  collectOrphanCompanionMarkdownTargets,
  orphanCompanionCleanupAbsPath,
  pruneOrphanCompanionMarkdown,
} from "./orphan-companion-markdown.js";
export type {
  OrphanCompanionMarkdownTarget,
  PruneOrphanCompanionMarkdownResult,
} from "./orphan-companion-markdown.js";
export type {
  SideTrackToml,
  ResolvedAngleDefinition,
  ResolvedAngles,
  ResolvedSideTrackConfig,
  ResolvedGithubNavLink,
  ResolvedStaticSite,
  StaticSiteStretchBufferSync,
} from "./config.js";
export {
  DEFAULT_STRETCH_BUFFER_SYNC,
  loadSideTrackConfig,
  mergeSideTrackConfig,
  resolveMermaidRuntimePath,
} from "./config.js";
export { githubRepoBlobFileUrl, parseGithubRepoWebUrl } from "./github-url.js";
export { assertValidIndex, emptyIndex } from "./metadata.js";
export { describeIndexSchemaRemediation } from "./index-schema-messages.js";
export { migrateIndex } from "./migrate.js";
export {
  discoverFlatCompanionMarkdownFiles,
  flatRelToSourcePath,
  planAnglesMigrationFromCompanions,
  rewriteIndexKeysForAnglesMigration,
} from "./migrate-angles-layout.js";
export type {
  AnglesMigrationMove,
  AnglesMigrationPlan,
  FlatCompanionEntry,
} from "./migrate-angles-layout.js";
export type { ParsedAnchor } from "./anchors.js";
export { formatLineRange, parseAnchor } from "./anchors.js";
export type { ScmPathRename, ScmProvider } from "./scm/scm-provider.js";
export { GitScmProvider, parseGitRenameLines } from "./scm/git-scm-provider.js";
export {
  applyPathRenamesToSideTrackIndex,
  inferAngleIdFromSideTrackPath,
} from "./sidetrack-index-renames.js";
export type { PathRename } from "./sidetrack-index-renames.js";
export type { BlockDiagnostic } from "./staleness.js";
export { diagnoseBlock } from "./staleness.js";
export type {
  ValidationIssue,
  ValidationResult,
  ValidateProjectOptions,
} from "./validate-project.js";
export {
  readIndex,
  refreshIndexMigrationsOnDisk,
  validateProject,
  writeIndex,
} from "./validate-project.js";
export {
  DEFAULT_SIDETRACK_TOML,
  initializeSideTrackProject,
  isSideTrackProjectInitialized,
  pathExists,
} from "./init-project.js";
export type {
  InitializeSideTrackProjectOptions,
  InitializeSideTrackProjectResult,
} from "./init-project.js";
export { ensureCompanionForSource } from "./companion-bootstrap.js";
export type {
  EnsureCompanionForSourceOptions,
  EnsureCompanionForSourceResult,
} from "./companion-bootstrap.js";
export { companionPlaceholderMarkdown } from "./companion-bootstrap.js";
export { plannedSymbolResolutionStrategy } from "./language-intelligence.js";
export type { SymbolResolutionStrategy } from "./language-intelligence.js";
export type {
  HeightAdjustable,
  Identifiable,
  SyncRegionContinuationKind,
  WithHeight,
} from "./height-adjustable.js";
export {
  BufferingFlowSynchronizer,
  NON_SYNC_TAIL_SLACK_ITEM_ID,
} from "./buffering-flow-synchronizer.js";
export {
  APPROVAL_GRID_STANDARD,
  APPROVAL_HUMAN_BREAK_ROW,
  approvalHumanBreakFullRow,
  inferApprovalGridFormatFromAscii,
  printApprovalFlowSection,
  printApprovalSynchronizedFlow,
} from "./buffering-flow-synchronizer-approval-printer.js";
export type {
  ApprovalFlowSection,
  ApprovalGridFormat,
} from "./buffering-flow-synchronizer-approval-printer.js";
export {
  parseApprovalFlowSections,
  parseApprovalFlowSectionsWithFormat,
  parseApprovalRows,
  splitApprovalLineToCells,
} from "./approval-flow-grid.js";
export { relocationHintMessages } from "./relocation-hints.js";
export type { RelocationHintsInput } from "./relocation-hints.js";
export { runCommanderMain } from "./cli-bootstrap.js";
export type {
  BlockScrollLink,
  BlockScrollStickyState,
  MarkdownHtmlSideTrackRegion,
} from "./scroll-sync.js";
export {
  blockStrictlyContainingSourceViewportLine,
  buildBlockScrollLinks,
  sidetrackProbeInStrictInterMarkerGap,
  DEFAULT_SIDETRACK_VIEWPORT_HYSTERESIS_LINES,
  DEFAULT_SOURCE_VIEWPORT_HYSTERESIS_LINES,
  pickBlockScrollLinkForSideTrackScroll,
  pickBlockScrollLinkForSideTrackViewportWithHysteresis,
  pickBlockScrollLinkForSourceViewportTop,
  pickBlockScrollLinkForSourceViewportWithHysteresis,
  pickSideTrackLineForSourceDualPane,
  pickSideTrackLineForSourceScroll,
  pickSourceLine0ForSideTrackScroll,
  parseMarkdownHtmlSideTrackRegions,
  sourceTopLineStrictlyBeforeFirstIndexLine,
} from "./scroll-sync.js";
export {
  sidetrackRegionInsertions,
  lineCommentLeaderForLanguage,
  markerViewportHalfOpen1Based,
  parseSideTrackRegionBoundary,
  sourceLineRangeForMarkerId,
} from "./source-markers.js";
export type {
  RegionMarkerNamingHintStrategy,
  RegionMarkerNamingInput,
  RegionMarkerNamingRange,
  RegionMarkerNamingStrategy,
} from "./region-marker-naming.js";
export {
  CallbackRegionMarkerNamingStrategy,
  CodeStructureHintStrategy,
  CompositeRegionMarkerNamingStrategy,
  defaultRegionMarkerNamingStrategy,
  EnclosingSymbolHintStrategy,
  MarkdownHeadingHintStrategy,
  TomlTableHeaderHintStrategy,
  tryCodeStructureNameHint,
  tryMarkdownHeadingTitleAbove,
  tryNormaliseContextLabelToMarkerId,
  tryTomlTablePathAboveSelection,
} from "./region-marker-naming.js";
export type { SideTrackMarkerPair } from "./region-marker-convert.js";
export {
  convertSideTrackSourceMarkersToLanguage,
  findSideTrackMarkerPairs,
  leadingIndentOfLine,
} from "./region-marker-convert.js";
export { MARKER_ID_BODY, assertValidMarkerId, normaliseMarkerSlugOrThrow } from "./marker-ids.js";
export type { MarkerValidationIssue } from "./marker-validation.js";
export {
  extractSideTrackBlockIdsInMarkdownOrder,
  extractSideTrackBlockIdsFromMarkdown,
  validateIndexMarkerSemantics,
  validateMarkerBoundariesInSource,
  validateMarkerRegionsAgainstIndexedSources,
  validateOverlappingMarkerInnerRangesInSource,
} from "./marker-validation.js";

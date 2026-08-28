export type { ParallelDocsBlock, ParallelDocsIndex, SourceFileIndexEntry } from "./model.js";
export { coerceIndexSchemaVersion, CURRENT_SCHEMA_VERSION } from "./model.js";
export type {
  AddBlockToIndexInput,
  AlignAndCleanRegionsInput,
  BlockRange,
  CreateBlockForRangeInput,
  CreatedBlock,
  WrapSourceLineRangeWithParallelDocsMarkersInput,
  WrapSourceLineRangeWithParallelDocsMarkersResult,
} from "./blocks.js";
export {
  addBlockToIndex,
  alignAndCleanRegions,
  appendBlockToParallelDocs,
  createBlockForRange,
  generateBlockId,
  insertBlockBySourceMarkerOrder,
  removeBlockFromParallelDocs,
  removeBlockFromIndex,
  removeSourceMarkersFromText,
  wrapSourceLineRangeWithParallelDocsMarkers,
} from "./blocks.js";
export { healSourceFile } from "./self-healing.js";
export { assertValidAngleId } from "./angles.js";
export {
  applyAnglesFlatMigrationToParallelDocsToml,
  ensureAnglesSentinelFile,
  upsertAngleDefinitionInParallelDocsToml,
} from "./angles-toml.js";
export type {
  ApplyAnglesFlatMigrationTomlInput,
  UpsertAngleDefinitionInput,
} from "./angles-toml.js";
export {
  defaultAngleIdForOpen,
  FALLBACK_DEFAULT_ANGLE_ID,
  resolveParallelDocsMarkdownPath,
} from "./parallel-docs-path-resolution.js";
export type { ResolvedParallelDocsMarkdownPath } from "./parallel-docs-path-resolution.js";
export {
  parallelDocsAnglesLayoutEnabled,
  parallelDocsAnglesSentinelPath,
  parallelDocsMarkdownPath,
  parallelDocsMarkdownPathForAngle,
  defaultMetadataIndexPath,
  normalizeRepoRelativePath,
  resolvePathUnderRepoRoot,
} from "./paths.js";
export { findMonorepoPackagesDir, monorepoLayoutStartDir } from "./monorepo-layout.js";
export type {
  ParallelDocsStaticBrowsePairPaths,
  ParallelDocsStaticBrowsePathResolver,
} from "./browse-contract.js";
export { defaultParallelDocsStaticBrowsePathResolver } from "./browse-path-default.js";
export { staticBrowseIndexRelPathFromPair } from "./parallel-docs-static-browse-path.js";
export {
  parallelDocsActiveEditorUiFlags,
  parallelDocsStorageSourcePrefix,
} from "./parallel-docs-active-editor-ui-context.js";
export type { ParallelDocsActiveEditorUiFlags } from "./parallel-docs-active-editor-ui-context.js";
export {
  parallelDocsPairSourceFileExistsOnDisk,
  discoverParallelDocsPairsOnDisk,
  pairFromParallelDocsSourceRel,
} from "./parallel-docs-disk-pairs.js";
export type { DiskParallelDocsPair } from "./parallel-docs-disk-pairs.js";
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
  ParallelDocsToml,
  ResolvedAngleDefinition,
  ResolvedAngles,
  ResolvedParallelDocsConfig,
  ResolvedGithubNavLink,
  ResolvedStaticSite,
  StaticSiteStretchBufferSync,
} from "./config.js";
export {
  DEFAULT_STRETCH_BUFFER_SYNC,
  loadParallelDocsConfig,
  mergeParallelDocsConfig,
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
  applyPathRenamesToParallelDocsIndex,
  inferAngleIdFromParallelDocsPath,
} from "./parallel-docs-index-renames.js";
export type { PathRename } from "./parallel-docs-index-renames.js";
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
  DEFAULT_PARALLEL_DOCS_TOML,
  initializeParallelDocsProject,
  isParallelDocsProjectInitialized,
  pathExists,
} from "./init-project.js";
export type {
  InitializeParallelDocsProjectOptions,
  InitializeParallelDocsProjectResult,
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
  MarkdownHtmlParallelDocsRegion,
} from "./scroll-sync.js";
export {
  blockStrictlyContainingSourceViewportLine,
  buildBlockScrollLinks,
  parallelDocsProbeInStrictInterMarkerGap,
  DEFAULT_PARALLEL_DOCS_VIEWPORT_HYSTERESIS_LINES,
  DEFAULT_SOURCE_VIEWPORT_HYSTERESIS_LINES,
  pickBlockScrollLinkForParallelDocsScroll,
  pickBlockScrollLinkForParallelDocsViewportWithHysteresis,
  pickBlockScrollLinkForSourceViewportTop,
  pickBlockScrollLinkForSourceViewportWithHysteresis,
  pickParallelDocsLineForSourceDualPane,
  pickParallelDocsLineForSourceScroll,
  pickSourceLine0ForParallelDocsScroll,
  parseMarkdownHtmlParallelDocsRegions,
  sourceTopLineStrictlyBeforeFirstIndexLine,
} from "./scroll-sync.js";
export {
  parallelDocsRegionInsertions,
  lineCommentLeaderForLanguage,
  markerViewportHalfOpen1Based,
  parseParallelDocsRegionBoundary,
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
export type { ParallelDocsMarkerPair } from "./region-marker-convert.js";
export {
  convertParallelDocsSourceMarkersToLanguage,
  findParallelDocsMarkerPairs,
  leadingIndentOfLine,
} from "./region-marker-convert.js";
export { MARKER_ID_BODY, assertValidMarkerId, normaliseMarkerSlugOrThrow } from "./marker-ids.js";
export type { MarkerValidationIssue } from "./marker-validation.js";
export {
  extractParallelDocsBlockIdsInMarkdownOrder,
  extractParallelDocsBlockIdsFromMarkdown,
  validateIndexMarkerSemantics,
  validateMarkerBoundariesInSource,
  validateMarkerRegionsAgainstIndexedSources,
  validateOverlappingMarkerInnerRangesInSource,
} from "./marker-validation.js";

import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  AFFECTED_TEST_EDGE_KINDS,
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  ARTIFACT_LANGUAGES,
  attributeGitHunkSide,
  classifyTestFile,
  diffGenerationSnapshots,
  DEFAULT_EXACT_IMPACT_EDGE_KINDS,
  DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS,
  DEFAULT_SOURCE_SEARCH_LIMIT,
  ENTRYPOINT_OPERATIONS,
  ENTRYPOINT_TRANSPORTS,
  findEvidencePath,
  findAffectedTestPaths,
  findSymbols,
  generatedClassificationFor,
  getCallees,
  getChildren,
  getCallers,
  getEntrypoints,
  getBoundedExactImpactPaths,
  getBoundedExactTopologyRelevance,
  getImpactPaths,
  getParents,
  getRoutes,
  MAX_SOURCE_SEARCH_LIMIT,
  matchSymbol,
  normalizeSourceSearchLexicalText,
  ROUTE_METHODS,
  SOURCE_SEARCH_INDEX_VERSION,
  sourceSearchTerms,
  summarizeImpactPaths,
  type GraphSnapshot,
  type ArtifactLanguage,
  type EntryPointOperation,
  type EntryPointTransport,
  type GitLineRange,
  type GitUnifiedHunk,
  GenerationSnapshotComparisonError,
  type ImpactPath,
  type IndexedFile,
  type IndexedSourceDocument,
  type IndexedSourceSearchHit,
  type IndexWork,
  type PersistedArtifactFacts,
  type ProjectIndexInputs,
  type RouteMethod,
  type SourceSearchRequest,
  type SourceRange,
  type SymbolMatch,
  type SymbolKind,
  type SymbolNode,
  type TestFileClassifier
} from "../domain/index.js";
import {
  createFrameworkFactPluginExtractor,
  extractFileFacts,
  type ExtractFileFactsInput,
  type ExtractedFileFacts,
  type FrameworkFactPluginRegistry
} from "../extraction/index.js";
import {
  GitChangeSetError,
  type GitChangeRecord,
  type GitChangeSet,
  type GitChangeSetProvider,
  type GitRevisionHunkFile,
  type GitRevisionHunkProvider,
  type GitRevisionHunkSet,
  type GitRevisionSource
} from "../ports/git-change-set.js";
import type {
  ActiveGraphBundle,
  ActiveSourceDocumentsBundle,
  GenerationComparisonBundle,
  GenerationHistoryBundle,
  GenerationHistoryEntry,
  GraphStore,
  ProjectScan,
  ProjectScanOptions,
  SourceCatalog,
  SourceDocument
} from "../ports/index.js";
import { ProjectConfigurationError } from "../domain/configuration.js";
import { SymbolLatticeError } from "./errors.js";
import {
  canonicalSourceDeliverySlice,
  sourceDeliveryIdentity
} from "./source-delivery.js";
import {
  buildFileLanguageGroups,
  buildFileTree,
  createProjectFileGlobMatcher,
  decodeFilePageCursor,
  encodeFilePageCursor,
  fileSelectionFingerprint,
  InvalidFilePageCursorError,
  matchesProjectPathPrefix
} from "./file-inventory.js";
import { rankGeneratedValues, type GeneratedRankingItem } from "./generated-ranking.js";
import {
  EXPLORE_QUERY_LIMITS,
  planExploreQuery,
  type ExploreQueryPlan
} from "./explore-query.js";
import {
  planExplorePathSpines,
  type ExplorePathSpinePlan
} from "./explore-path-spines.js";
import {
  allocateExploreSourceWindowCharacters,
  planExploreSourceWindows
} from "./explore-source-windows.js";
import {
  allocateInvestigationSource,
  DEFAULT_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
  INVESTIGATION_SOURCE_ALLOCATION_POLICY,
  MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
  MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET
} from "./context-allocation.js";
import {
  allocateContextSource,
  CONTEXT_SOURCE_ALLOCATION_POLICY,
  CONTEXT_SOURCE_MINIMUM_PER_REFERENCE,
  DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET,
  MAX_CONTEXT_SOURCE_CHARACTER_BUDGET,
  MIN_CONTEXT_SOURCE_CHARACTER_BUDGET
} from "./context-source-allocation.js";
import {
  INVESTIGATE_SOURCE_RENDER_MODES,
  INVESTIGATION_SOURCE_RENDER_POLICY,
  renderInvestigationDeclaration,
  type InvestigateSourceRenderMode
} from "./context-rendering.js";
import {
  frameworkProjectPluginProjectVersion,
  type FrameworkProjectPluginRegistry
} from "./framework-project-plugins.js";
import {
  referenceResolverPluginProjectVersion,
  type ReferenceResolverPluginRegistry
} from "./reference-resolver-plugins.js";
import { resolveProjectFacts } from "./resolution.js";
import {
  AFFECTED_MAX_VISITED_FILES_PER_INPUT,
  CONTEXT_MATCH_CANDIDATE_LIMIT,
  CONTEXT_MAX_VISITED_SYMBOLS,
  DEFAULT_AFFECTED_LIMIT,
  DEFAULT_GIT_HUNK_LIMIT,
  DEFAULT_AFFECTED_MAX_DEPTH,
  DEFAULT_CONTEXT_IMPACT_DEPTH,
  DEFAULT_CONTEXT_IMPACT_LIMIT,
  DEFAULT_CONTEXT_MAX_HOPS,
  DEFAULT_CONTEXT_RELATION_LIMIT,
  INVESTIGATE_IMPACT_RANKING_MAX_DEPTH,
  INVESTIGATE_IMPACT_RANKING_PATH_LIMIT,
  INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT,
  INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS,
  INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS,
  INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY,
  INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT,
  DEFAULT_INVESTIGATE_RANKING_STRATEGY,
  DEFAULT_INVESTIGATE_SEARCH_LIMIT,
  DEFAULT_INVESTIGATE_SYMBOL_LIMIT,
  DEFAULT_ENTRYPOINT_LIMIT,
  DEFAULT_FILE_LIMIT,
  DEFAULT_FILE_VIEW_LINE_LIMIT,
  FILE_FORMATS,
  DEFAULT_GENERATION_DIFF_LIMIT,
  DEFAULT_GENERATION_HISTORY_LIMIT,
  DEFAULT_HIERARCHY_LIMIT,
  DEFAULT_ROUTE_LIMIT,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_REFERENCES,
  INVESTIGATE_RANKING_STRATEGIES,
  MAX_CONTEXT_RELATION_LIMIT,
  MAX_INVESTIGATE_SYMBOL_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  MAX_FILE_LIMIT,
  MAX_FILE_VIEW_LINE_LIMIT,
  MAX_FILE_CURSOR_LENGTH,
  MAX_FILE_PATTERN_LENGTH,
  MAX_FILE_TREE_DEPTH,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  MAX_HIERARCHY_LIMIT,
  MAX_GIT_HUNK_DECLARATION_ANCHORS,
  MAX_GIT_HUNK_LIMIT,
  MAX_GIT_HUNK_SOURCE_FILES,
  MAX_AFFECTED_CHANGED_FILES,
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_IMPACT_LIMIT,
  MAX_ROUTE_LIMIT,
  NODE_MATCH_CANDIDATE_LIMIT,
  NODE_RELATION_LIMIT,
  NODE_SOURCE_CHARACTER_LIMIT,
  NODE_SOURCE_LINE_LIMIT
} from "./types.js";
import type {
  AffectedTestEvidence,
  AffectedTestsBounds,
  AffectedTestsLimitation,
  AffectedTestsOptions,
  AffectedTestsResult,
  GitAffectedTestsOptions,
  GitAffectedTestsResult,
  GitHunkResultItem,
  GitHunkSideResult,
  GitHunksOptions,
  GitHunksResult,
  ExplainEdgeResult,
  ContextBounds,
  ContextEvidencePath,
  ContextOptions,
  ContextResult,
  ContextSourceAllocationResult,
  DeliveredSourceExcerpt,
  EntrypointsOptions,
  EntrypointsResult,
  ExploreResult,
  ExploreConnection,
  ExploreFocus,
  ExploreSourceWindow,
  ExploreSourceWindowAllocationResult,
  FilesOptions,
  FilesResult,
  FileViewOptions,
  FileViewResult,
  FindResult,
  GenerationDiffOptions,
  GenerationDiffResult,
  GenerationHistoryOptions,
  GenerationHistoryResult,
  GenerationHistorySummary,
  GraphContext,
  HierarchyOptions,
  HierarchyResult,
  ImpactOptions,
  ImpactResult,
  IndexedFileSummary,
  InvestigationDeclaration,
  InvestigationDeclarationAllocation,
  InvestigationImpactSignals,
  InvestigateOptions,
  InvestigateRankingStrategy,
  InvestigateResult,
  InvestigationSelection,
  InvestigationSelectionResult,
  InvestigationSourceAllocationResult,
  InvestigationStructuralSignals,
  InvestigationTopologySignals,
  NodeBounds,
  NodeResult,
  NodeSource,
  RelationResult,
  RoutesOptions,
  RoutesResult,
  SearchOptions,
  SearchResult,
  SourceAvailability,
  SourceSearchHitResult,
  SourceExcerpt,
  SymbolContext
} from "./types.js";

export interface IndexOptions {
  readonly projectPath: string;
  readonly force?: boolean;
  /** Replaces the stored project scope for this explicit index operation. */
  readonly scopeRoots?: readonly string[];
}

export interface FindOptions {
  readonly kind?: SymbolKind;
  readonly limit?: number;
}

/** Injectable seam used to prove that sync does not reparse unchanged artifacts. */
export interface ArtifactFactsExtractor {
  (input: ExtractFileFactsInput): ExtractedFileFacts;
  /**
   * Optional identity for custom extraction semantics. When supplied, it is
   * persisted and makes stale fact reuse impossible after the extractor changes.
   */
  readonly version?: string;
}

/** Optional project-scoped extension seams applied by the indexing service. */
export interface SymbolLatticeServiceExtensions {
  readonly artifactFactsExtractor?: ArtifactFactsExtractor;
  readonly frameworkFactPlugins?: FrameworkFactPluginRegistry;
  readonly frameworkProjectPlugins?: FrameworkProjectPluginRegistry;
  readonly referenceResolverPlugins?: ReferenceResolverPluginRegistry;
}

function artifactFactsExtractorVersion(extractor: ArtifactFactsExtractor): string {
  const version = extractor.version;
  if (version === undefined) {
    return ARTIFACT_FACTS_EXTRACTOR_VERSION;
  }
  if (
    typeof version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,239}$/u.test(version)
  ) {
    throw new Error("Custom artifact facts extractor version must be stable, non-empty ASCII text.");
  }
  return version;
}

interface SourceChangeSet {
  readonly addedFiles: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly removedFiles: readonly string[];
}

interface NormalizedImpactOptions {
  readonly maxDepth: number;
  readonly limit: number | undefined;
}

interface ContextRequest {
  readonly references: readonly string[];
  readonly bounds: ContextBounds;
}

interface InvestigateRequest {
  readonly search: NormalizedSourceSearchRequest;
  readonly symbolLimit: number;
  readonly ranking: InvestigateRankingStrategy;
  readonly sourceCharacterBudget: number;
  readonly sourceRenderMode: InvestigateSourceRenderMode;
  readonly contextBounds: ContextBounds;
}

interface InvestigationCandidate {
  readonly sourceRank: number;
  readonly candidateRank: number;
  readonly symbol: SymbolNode;
  readonly generatedRanking: GeneratedRankingItem;
  readonly structuralSignals: InvestigationStructuralSignals;
  readonly topologySignals: InvestigationTopologySignals | null;
  readonly impactSignals: InvestigationImpactSignals | null;
  readonly lexicalFocus: InvestigationSelection["lexicalFocus"];
}

interface NormalizedSourceSearchRequest extends SourceSearchRequest {
  readonly requestedLimit: number;
  readonly candidateLimit: number;
}

const SOURCE_SEARCH_GENERATED_CANDIDATE_MULTIPLIER = 4;

interface NormalizedAffectedTestsRequest {
  readonly filePaths: readonly string[];
  readonly bounds: AffectedTestsBounds;
  readonly testSelection: AffectedTestsResult["testSelection"];
  readonly testClassifier: TestFileClassifier;
}

interface NormalizedAffectedTestSelection {
  readonly testSelection: AffectedTestsResult["testSelection"];
  readonly testClassifier: TestFileClassifier;
}

interface ResolvedFileViewSelection {
  readonly file: IndexedFile;
  readonly resolution: "exact-path" | "case-insensitive-path" | "unique-suffix";
}

interface NormalizedGitHunksRequest {
  readonly baseRef: string;
  readonly pathPrefix: string | undefined;
  readonly limit: number;
}

interface NormalizedGenerationDiffRequest {
  readonly fromGenerationId: string;
  readonly toGenerationId: string | undefined;
  readonly limit: number;
}

interface NormalizedRoutesRequest {
  readonly method?: RouteMethod;
  readonly pathPrefix?: string;
  readonly domain?: string;
  readonly limit: number;
}

interface NormalizedFilesRequest {
  readonly pathPrefix?: string;
  readonly language?: ArtifactLanguage;
  readonly pattern?: string;
  readonly format: NonNullable<FilesOptions["format"]>;
  readonly maxDepth?: number;
  readonly limit: number;
  readonly cursor?: string;
}

interface NormalizedEntrypointsRequest {
  readonly transport?: EntryPointTransport;
  readonly operation?: EntryPointOperation;
  readonly namePrefix?: string;
  readonly limit: number;
}

interface NormalizedHierarchyRequest {
  readonly limit: number;
}

/** One graph/source snapshot used consistently for every item in a context pack. */
interface ContextRead {
  readonly bundle: ActiveGraphBundle;
  readonly matches: readonly SymbolMatch[];
  readonly documentsByFilePath: ReadonlyMap<string, IndexedSourceDocument>;
}

interface ContextSourceDraft {
  readonly referenceIndex: number;
  readonly reference: string;
  readonly filePath: string;
  readonly sourceText: string;
  readonly startLine: number;
  readonly requestedEndLine: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

interface SymbolContextPack {
  readonly contexts: readonly SymbolContext[];
  readonly allocation: ContextSourceAllocationResult;
}

interface InvestigationDeclarationDraft {
  readonly selection: InvestigationSelection;
  readonly source: NodeSource | null;
}

const NODE_BOUNDS: NodeBounds = {
  sourceLineLimit: NODE_SOURCE_LINE_LIMIT,
  sourceCharacterLimit: NODE_SOURCE_CHARACTER_LIMIT,
  relationLimit: NODE_RELATION_LIMIT,
  matchCandidateLimit: NODE_MATCH_CANDIDATE_LIMIT
};

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function resolveFileViewSelection(
  files: readonly IndexedFile[],
  requestedPath: string
): ResolvedFileViewSelection {
  const exact = files.find((file) => file.path === requestedPath);
  if (exact !== undefined) {
    return { file: exact, resolution: "exact-path" };
  }

  const requestedLower = requestedPath.toLocaleLowerCase("en-US");
  const caseInsensitiveExact = files.filter(
    (file) => file.path.toLocaleLowerCase("en-US") === requestedLower
  );
  if (caseInsensitiveExact.length === 1) {
    return { file: caseInsensitiveExact[0]!, resolution: "case-insensitive-path" };
  }

  const suffix = `/${requestedLower}`;
  const suffixMatches = files.filter((file) =>
    file.path.toLocaleLowerCase("en-US").endsWith(suffix)
  );
  if (suffixMatches.length === 1) {
    return { file: suffixMatches[0]!, resolution: "unique-suffix" };
  }

  const ambiguous = caseInsensitiveExact.length > 1 ? caseInsensitiveExact : suffixMatches;
  if (ambiguous.length > 1) {
    const candidates = ambiguous.map((file) => file.path).sort(compareText);
    const shown = candidates.slice(0, 25);
    const remaining = candidates.length - shown.length;
    throw new SymbolLatticeError(
      "FILE_VIEW_AMBIGUOUS",
      `File view path "${requestedPath}" matches ${candidates.length} indexed files: ${shown.join(", ")}${remaining > 0 ? `, and ${remaining} more` : ""}. Pass a longer project-relative path.`
    );
  }

  throw new SymbolLatticeError(
    "FILE_NOT_INDEXED",
    `No active-generation file is indexed at or uniquely ends with ${requestedPath}.`
  );
}

function compareGenerationHistorySummaries(
  left: GenerationHistorySummary,
  right: GenerationHistorySummary
): number {
  return (
    compareText(right.indexedAt, left.indexedAt) ||
    compareText(right.generationId, left.generationId)
  );
}

function compareAffectedTestEvidence(
  left: AffectedTestEvidence,
  right: AffectedTestEvidence
): number {
  return (
    compareText(left.triggerFilePath, right.triggerFilePath) ||
    compareText(left.filePath, right.filePath) ||
    compareText(
      left.path.symbols.map((symbol) => symbol.id).join("\u0000"),
      right.path.symbols.map((symbol) => symbol.id).join("\u0000")
    ) ||
    compareText(
      left.path.edges.map((edge) => edge.id).join("\u0000"),
      right.path.edges.map((edge) => edge.id).join("\u0000")
    )
  );
}

function compareNumber(left: number, right: number): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === null) {
    return right === null ? 0 : -1;
  }
  if (right === null) {
    return 1;
  }
  return compareText(left, right);
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null) {
    return right === null ? 0 : -1;
  }
  if (right === null) {
    return 1;
  }
  return compareNumber(left, right);
}

function compareGitChangeRecord(left: GitChangeRecord, right: GitChangeRecord): number {
  return (
    compareNullableText(left.previousPath, right.previousPath) ||
    compareNullableText(left.currentPath, right.currentPath) ||
    compareText(left.kind, right.kind) ||
    compareNullableNumber(left.score, right.score)
  );
}

function compareGitLineRange(left: GitLineRange, right: GitLineRange): number {
  return compareNumber(left.start, right.start) || compareNumber(left.count, right.count);
}

function compareGitUnifiedHunk(left: GitUnifiedHunk, right: GitUnifiedHunk): number {
  return compareGitLineRange(left.oldRange, right.oldRange) || compareGitLineRange(left.newRange, right.newRange);
}

function compareGitRevisionHunkFile(
  left: GitRevisionHunkFile,
  right: GitRevisionHunkFile
): number {
  return (
    compareGitChangeRecord(left.change, right.change) ||
    compareText(left.previous.revision, right.previous.revision) ||
    compareText(left.current.revision, right.current.revision) ||
    compareNullableText(left.previous.filePath, right.previous.filePath) ||
    compareNullableText(left.current.filePath, right.current.filePath)
  );
}

function compareGitHunkSideResult(left: GitHunkSideResult, right: GitHunkSideResult): number {
  return (
    compareText(left.revision, right.revision) ||
    compareNullableText(left.path, right.path) ||
    compareText(left.sourceAvailability, right.sourceAvailability) ||
    compareGitLineRange(left.lineRange, right.lineRange) ||
    compareText(left.attribution, right.attribution) ||
    compareText(
      left.declarationAnchors.items.map((symbol) => symbol.id).join("\u0000"),
      right.declarationAnchors.items.map((symbol) => symbol.id).join("\u0000")
    )
  );
}

function compareGitHunkResultItem(left: GitHunkResultItem, right: GitHunkResultItem): number {
  return (
    compareGitChangeRecord(left.change, right.change) ||
    compareGitUnifiedHunk(left.hunk, right.hunk) ||
    compareGitHunkSideResult(left.old, right.old) ||
    compareGitHunkSideResult(left.new, right.new)
  );
}

function comparePosition(
  left: SourceRange["start"],
  right: SourceRange["start"]
): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.column - right.column;
}

function rangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return (
    comparePosition(left.start, right.end) < 0 &&
    comparePosition(right.start, left.end) < 0
  );
}

function compareSymbolCandidates(left: SymbolNode, right: SymbolNode): number {
  const startDifference = comparePosition(left.range.start, right.range.start);
  if (startDifference !== 0) {
    return startDifference;
  }
  const endDifference = comparePosition(left.range.end, right.range.end);
  if (endDifference !== 0) {
    return endDifference;
  }
  const kindDifference = compareText(left.kind, right.kind);
  if (kindDifference !== 0) {
    return kindDifference;
  }
  const nameDifference = compareText(left.name, right.name);
  return nameDifference === 0 ? compareText(left.id, right.id) : nameDifference;
}

function normalizedLexicalText(value: string): string {
  return normalizeSourceSearchLexicalText(value);
}

interface NormalizedLexicalTextWithSourceOffsets {
  readonly text: string;
  /** Raw UTF-16 start offsets for each normalized UTF-16 code unit. */
  readonly startOffsets: readonly number[];
  /** Raw UTF-16 exclusive end offsets for each normalized UTF-16 code unit. */
  readonly endOffsets: readonly number[];
}

function sharedTextPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left.charCodeAt(length) === right.charCodeAt(length)) {
    length += 1;
  }
  return length;
}

/**
 * Maps a normalized string back to raw UTF-16 offsets without turning a
 * compatibility expansion such as U+FB03 into extra columns. Most text can be
 * handled by normalizing a base character with its combining marks. The prefix
 * fallback retains correct offsets for the few normalization sequences that
 * cross that boundary (for example, Hangul composition).
 */
function normalizedLexicalTextWithSourceOffsets(
  value: string
): NormalizedLexicalTextWithSourceOffsets {
  const expected = normalizedLexicalText(value);
  const startOffsets: number[] = [];
  const endOffsets: number[] = [];
  let reconstructed = "";

  for (const match of value.matchAll(/(?:\P{M}\p{M}*|\p{M}+)/gu)) {
    const sourceStart = match.index;
    const sourceEnd = sourceStart + match[0].length;
    const normalizedPart = normalizedLexicalText(match[0]);
    reconstructed += normalizedPart;
    for (let index = 0; index < normalizedPart.length; index += 1) {
      startOffsets.push(sourceStart);
      endOffsets.push(sourceEnd);
    }
  }

  if (reconstructed === expected) {
    return { text: expected, startOffsets, endOffsets };
  }

  let previous = "";
  let mappedStarts: number[] = [];
  let mappedEnds: number[] = [];
  let sourceOffset = 0;
  for (const character of value) {
    const sourceEnd = sourceOffset + character.length;
    const next = normalizedLexicalText(value.slice(0, sourceEnd));
    const shared = sharedTextPrefixLength(previous, next);
    const replacedStart = Math.min(
      sourceOffset,
      ...mappedStarts.slice(shared)
    );
    mappedStarts = mappedStarts.slice(0, shared);
    mappedEnds = mappedEnds.slice(0, shared);
    for (let index = shared; index < next.length; index += 1) {
      mappedStarts.push(replacedStart);
      mappedEnds.push(sourceEnd);
    }
    previous = next;
    sourceOffset = sourceEnd;
  }

  return { text: expected, startOffsets: mappedStarts, endOffsets: mappedEnds };
}

function excerptFromSourceText(
  filePath: string,
  sourceText: string,
  centerLine: number,
  contextLines = 2
): SourceExcerpt {
  const lines = sourceText.split(/\r\n|\r|\n/);
  const startLine = Math.max(1, centerLine - contextLines);
  const endLine = Math.min(lines.length, centerLine + contextLines);
  const excerptLines = lines.slice(startLine - 1, endLine).map((text, index) => ({
    line: startLine + index,
    text
  }));

  return { filePath, startLine, endLine, lines: excerptLines };
}

/** Raw UTF-16 offsets for every physical line start, including a trailing empty line. */
function sourceLineStarts(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    const codeUnit = sourceText.charCodeAt(index);
    if (codeUnit === 13 && sourceText.charCodeAt(index + 1) === 10) {
      index += 1;
      starts.push(index + 1);
      continue;
    }
    if (codeUnit === 13 || codeUnit === 10 || codeUnit === 0x2028 || codeUnit === 0x2029) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function sourcePositionOffset(
  sourceText: string,
  lineStarts: readonly number[],
  position: SourceRange["start"]
): number | null {
  if (
    !Number.isSafeInteger(position.line) ||
    !Number.isSafeInteger(position.column) ||
    position.line < 1 ||
    position.column < 1
  ) {
    return null;
  }

  const lineStart = lineStarts[position.line - 1];
  if (lineStart === undefined) {
    return null;
  }
  let lineContentEnd = lineStarts[position.line] ?? sourceText.length;
  while (lineContentEnd > lineStart) {
    const codeUnit = sourceText.charCodeAt(lineContentEnd - 1);
    if (codeUnit !== 13 && codeUnit !== 10 && codeUnit !== 0x2028 && codeUnit !== 0x2029) {
      break;
    }
    lineContentEnd -= 1;
  }
  const offset = lineStart + position.column - 1;
  return offset <= lineContentEnd ? offset : null;
}

function sourceOffsetPosition(
  sourceText: string,
  lineStarts: readonly number[],
  offset: number
): SourceRange["start"] | null {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > sourceText.length) return null;
  if (offset > 0 && offset < sourceText.length && sourceText[offset - 1] === "\r" && sourceText[offset] === "\n") {
    return null;
  }
  let lineIndex = 0;
  for (let index = 1; index < lineStarts.length && lineStarts[index]! <= offset; index += 1) {
    lineIndex = index;
  }
  return { line: lineIndex + 1, column: offset - lineStarts[lineIndex]! + 1 };
}

function contextSourceDraftFromPersistedText(input: {
  readonly referenceIndex: number;
  readonly reference: string;
  readonly filePath: string;
  readonly sourceText: string;
  readonly centerLine: number;
}): ContextSourceDraft | null {
  return sourceWindowDraftFromPersistedText({
    referenceIndex: input.referenceIndex,
    reference: input.reference,
    filePath: input.filePath,
    sourceText: input.sourceText,
    startLine: Math.max(1, input.centerLine - 2),
    endLine: input.centerLine + 2
  });
}

function sourceWindowDraftFromPersistedText(input: {
  readonly referenceIndex: number;
  readonly reference: string;
  readonly filePath: string;
  readonly sourceText: string;
  readonly startLine: number;
  readonly endLine: number;
}): ContextSourceDraft | null {
  const lineStarts = sourceLineStarts(input.sourceText);
  const startLine = Math.max(1, input.startLine);
  const requestedEndLine = Math.min(lineStarts.length, input.endLine);
  const startOffset = lineStarts[startLine - 1];
  const endOffset = lineStarts[requestedEndLine] ?? input.sourceText.length;
  if (startOffset === undefined || endOffset <= startOffset) return null;
  return {
    referenceIndex: input.referenceIndex,
    reference: input.reference,
    filePath: input.filePath,
    sourceText: input.sourceText,
    startLine,
    requestedEndLine,
    startOffset,
    endOffset
  };
}

function renderContextSource(
  draft: ContextSourceDraft,
  allocatedCharacters: number
): DeliveredSourceExcerpt | null {
  let boundedEnd = Math.min(draft.endOffset, draft.startOffset + allocatedCharacters);
  if (
    boundedEnd > draft.startOffset &&
    boundedEnd < draft.endOffset &&
    draft.sourceText[boundedEnd - 1] === "\r" &&
    draft.sourceText[boundedEnd] === "\n"
  ) {
    boundedEnd -= 1;
  }
  if (boundedEnd <= draft.startOffset) return null;
  const delivery = canonicalSourceDeliverySlice({
    filePath: draft.filePath,
    sourceText: draft.sourceText,
    fullFileCharacterOffsets: { start: draft.startOffset, end: boundedEnd }
  });
  const lineStarts = sourceLineStarts(draft.sourceText);
  const start = sourceOffsetPosition(draft.sourceText, lineStarts, draft.startOffset);
  const end = sourceOffsetPosition(draft.sourceText, lineStarts, boundedEnd);
  if (start === null || end === null) return null;
  const texts = delivery.text.split("\n");
  if (delivery.text.endsWith("\n")) texts.pop();
  const lines = texts.map((text, index) => ({ line: start.line + index, text }));
  const requestedCharacters = draft.endOffset - draft.startOffset;
  const truncated = boundedEnd < draft.endOffset;
  return {
    filePath: draft.filePath,
    startLine: start.line,
    endLine: lines.at(-1)?.line ?? start.line,
    lines,
    range: { start, end },
    text: delivery.text,
    sourceIdentity: delivery.sourceIdentity,
    requestedCharacters,
    emittedCharacters: delivery.text.length,
    truncated,
    truncationReason: truncated ? "character-budget" : null
  };
}

function countPhysicalSourceLines(
  lineStarts: readonly number[],
  startOffset: number,
  endOffset: number
): number {
  let containingStartLine = 0;
  let lastIncludedLine = -1;
  for (const [index, lineStart] of lineStarts.entries()) {
    if (lineStart <= startOffset) {
      containingStartLine = index;
    }
    if (lineStart < endOffset) {
      lastIncludedLine = index;
    }
  }
  return Math.max(1, lastIncludedLine - containingStartLine + 1);
}

/**
 * Extracts one declaration directly from persisted source using the same
 * UTF-16, end-exclusive range convention produced by the extractor. Both
 * limits preserve a prefix of that declaration and are disclosed in every
 * `NodeResult` rather than reading the working tree for a larger payload.
 */
function nodeSourceFromPersistedText(
  filePath: string,
  sourceText: string,
  range: SourceRange
): NodeSource | null {
  const lineStarts = sourceLineStarts(sourceText);
  const startOffset = sourcePositionOffset(sourceText, lineStarts, range.start);
  const endOffset = sourcePositionOffset(sourceText, lineStarts, range.end);
  if (startOffset === null || endOffset === null || endOffset < startOffset) {
    return null;
  }

  const firstExcludedLineStart = lineStarts[range.start.line - 1 + NODE_SOURCE_LINE_LIMIT];
  const lineLimitedEnd = Math.min(endOffset, firstExcludedLineStart ?? sourceText.length);
  const boundedEnd = Math.min(lineLimitedEnd, startOffset + NODE_SOURCE_CHARACTER_LIMIT);

  return {
    filePath,
    range,
    text: sourceText.slice(startOffset, boundedEnd),
    sourceIdentity: sourceDeliveryIdentity({
      filePath,
      sourceText,
      fullFileCharacterOffsets: { start: startOffset, end: boundedEnd }
    }),
    totalLines: countPhysicalSourceLines(lineStarts, startOffset, endOffset),
    totalCharacters: endOffset - startOffset,
    truncated: boundedEnd < endOffset
  };
}

function allocateDeclarationCharacterShares(
  drafts: readonly InvestigationDeclarationDraft[],
  characterBudget: number,
  selectionCount: number
): ReadonlyMap<string, number> {
  const shares = new Map<string, number>();
  const candidates = drafts.flatMap((draft) => {
    if (draft.source === null) {
      return [];
    }
    const reference = draft.selection.symbol.qualifiedName;
    if (shares.has(reference)) {
      throw new Error(`Duplicate investigation declaration allocation identity: ${reference}.`);
    }
    shares.set(reference, 0);
    return [{
      reference,
      requestedCharacters: draft.source.text.length,
      weight: selectionCount - draft.selection.selectionRank + 1
    }];
  });
  let remaining = characterBudget;
  while (remaining > 0) {
    const active = candidates.filter(
      (candidate) => (shares.get(candidate.reference) ?? 0) < candidate.requestedCharacters
    );
    if (active.length === 0) {
      break;
    }
    const totalWeight = active.reduce((total, candidate) => total + candidate.weight, 0);
    const availableAtRoundStart = remaining;
    let distributed = 0;
    for (const candidate of active) {
      if (remaining === 0) {
        break;
      }
      const current = shares.get(candidate.reference) ?? 0;
      const unmet = candidate.requestedCharacters - current;
      const proposal = Math.max(
        1,
        Math.floor(availableAtRoundStart * candidate.weight / totalWeight)
      );
      const addition = Math.min(unmet, proposal, remaining);
      shares.set(candidate.reference, current + addition);
      remaining -= addition;
      distributed += addition;
    }
    if (distributed === 0) {
      break;
    }
  }
  return shares;
}

interface PersistedLexicalMatch {
  readonly matchingTerms: readonly string[];
  readonly range: SourceRange;
  readonly excerpt: SourceExcerpt;
}

/**
 * The store owns matching and ordering. This only chooses a reproducible span
 * and context from the source text saved in the same generation as that hit.
 */
function persistedLexicalMatch(
  filePath: string,
  sourceText: string,
  terms: readonly string[]
): PersistedLexicalMatch {
  const lines = sourceText.split(/\r\n|\r|\n/);
  const normalizedTerms = terms.map((term) => normalizedLexicalText(term));
  const normalizedSource = normalizedLexicalText(sourceText);
  const matchingTerms = terms.filter((term, index) => {
    const normalizedTerm = normalizedTerms[index];
    return normalizedTerm !== undefined && normalizedSource.includes(normalizedTerm);
  });

  let selectedLine = 1;
  let selectedTerm: string | null = null;
  let selectedTermStartOffset = 0;
  let selectedTermEndOffset = 0;
  let selectedLineMatchCount = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const normalizedLine = normalizedLexicalTextWithSourceOffsets(line);
    const lineMatches = normalizedTerms
      .map((term, termIndex) => ({ term, termIndex, offset: normalizedLine.text.indexOf(term) }))
      .filter((match) => match.offset >= 0);
    if (lineMatches.length <= selectedLineMatchCount) {
      continue;
    }

    const firstMatch = lineMatches.sort(
      (left, right) => left.offset - right.offset || left.termIndex - right.termIndex
    )[0];
    if (firstMatch === undefined) {
      continue;
    }

    selectedLine = lineIndex + 1;
    selectedTerm = terms[firstMatch.termIndex] ?? null;
    selectedTermStartOffset = normalizedLine.startOffsets[firstMatch.offset] ?? 0;
    selectedTermEndOffset =
      normalizedLine.endOffsets[firstMatch.offset + firstMatch.term.length - 1] ??
      selectedTermStartOffset;
    selectedLineMatchCount = lineMatches.length;
  }

  const startColumn = selectedTerm === null ? 1 : selectedTermStartOffset + 1;
  const endColumn = selectedTerm === null ? startColumn : selectedTermEndOffset + 1;

  return {
    matchingTerms,
    range: {
      start: { line: selectedLine, column: startColumn },
      end: { line: selectedLine, column: endColumn }
    },
    excerpt: excerptFromSourceText(filePath, sourceText, selectedLine)
  };
}

function lexicalReason(terms: readonly string[], matchingTerms: readonly string[]): string {
  if (matchingTerms.length === terms.length) {
    return `Matched persisted lexical terms: ${matchingTerms.join(", ")}.`;
  }
  if (matchingTerms.length > 0) {
    return `Matched persisted lexical terms: ${matchingTerms.join(", ")}; additional terms matched the indexed identifier corpus.`;
  }
  return `Matched the indexed identifier corpus for lexical terms: ${terms.join(", ")}.`;
}

function filesMatch(
  currentFiles: readonly { readonly relativePath: string; readonly contentHash: string }[],
  indexedFiles: readonly { readonly path: string; readonly contentHash: string }[]
): boolean {
  if (currentFiles.length !== indexedFiles.length) {
    return false;
  }

  const indexedHashes = new Map(indexedFiles.map((file) => [file.path, file.contentHash]));
  return currentFiles.every(
    (file) => indexedHashes.get(file.relativePath) === file.contentHash
  );
}

function sourceChangeSet(
  sourceDocuments: readonly SourceDocument[],
  snapshot: GraphSnapshot
): SourceChangeSet {
  const currentByPath = new Map(sourceDocuments.map((document) => [document.relativePath, document]));
  const previousByPath = new Map(snapshot.files.map((file) => [file.path, file]));
  const addedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const [filePath, document] of currentByPath) {
    const previous = previousByPath.get(filePath);
    if (previous === undefined) {
      addedFiles.push(filePath);
      continue;
    }
    if (previous.contentHash !== document.contentHash || previous.language !== document.language) {
      modifiedFiles.push(filePath);
    }
  }
  for (const filePath of previousByPath.keys()) {
    if (!currentByPath.has(filePath)) {
      removedFiles.push(filePath);
    }
  }

  return {
    addedFiles: addedFiles.sort(compareText),
    modifiedFiles: modifiedFiles.sort(compareText),
    removedFiles: removedFiles.sort(compareText)
  };
}

function reusedArtifactFacts(
  document: SourceDocument,
  persisted: PersistedArtifactFacts | undefined,
  extractorVersion: string
): boolean {
  return (
    persisted !== undefined &&
    persisted.contentHash === document.contentHash &&
    persisted.language === document.language &&
    persisted.extractorVersion === extractorVersion
  );
}

function astroProjectEnabled(indexInputs: ProjectIndexInputs | null): boolean {
  return (
    indexInputs?.configurationInputs.filter(
      (input) => input.kind === "astro-config" && input.state === "present"
    ).length === 1
  );
}

function isAstroEndpointSourceDocument(document: SourceDocument): boolean {
  return (
    (document.language === "typescript" || document.language === "javascript") &&
    /^src\/pages\/.+\.(?:ts|js|mjs)$/iu.test(document.relativePath.replaceAll("\\", "/"))
  );
}

function reverseDependencyInvalidation(
  snapshot: GraphSnapshot,
  changedFiles: ReadonlySet<string>,
  currentFiles: ReadonlySet<string>
): readonly string[] {
  const symbolsById = new Map(snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const importersByTarget = new Map<string, Set<string>>();
  for (const edge of snapshot.edges) {
    if (
      (edge.kind !== "imports" && edge.kind !== "exports") ||
      edge.resolution !== "exact" ||
      edge.targetId === null
    ) {
      continue;
    }
    const target = symbolsById.get(edge.targetId);
    if (target === undefined || target.kind !== "file") {
      continue;
    }
    const importers = importersByTarget.get(target.filePath) ?? new Set<string>();
    importers.add(edge.filePath);
    importersByTarget.set(target.filePath, importers);
  }

  const queue = [...changedFiles].sort(compareText);
  const visited = new Set(queue);
  const invalidated = new Set<string>();
  while (queue.length > 0) {
    const targetPath = queue.shift();
    if (targetPath === undefined) {
      continue;
    }
    for (const importer of importersByTarget.get(targetPath) ?? []) {
      if (visited.has(importer)) {
        continue;
      }
      visited.add(importer);
      queue.push(importer);
      if (currentFiles.has(importer) && !changedFiles.has(importer)) {
        invalidated.add(importer);
      }
    }
  }

  return [...invalidated].sort(compareText);
}

function fullIndexWork(sourceDocuments: readonly SourceDocument[]): IndexWork {
  return {
    mode: "full",
    resolutionScope: "project",
    addedFiles: [],
    modifiedFiles: [],
    removedFiles: [],
    reExtractedFiles: sourceDocuments.map((document) => document.relativePath).sort(compareText),
    reusedArtifactFiles: [],
    dependencyInvalidatedFiles: [],
    reuseInvalidationReasons: []
  };
}

export class SymbolLatticeService {
  private readonly graphStore: GraphStore;
  private readonly sourceCatalog: SourceCatalog;
  private readonly artifactFactsExtractor: ArtifactFactsExtractor;
  private readonly gitChangeSetProvider: GitChangeSetProvider | undefined;
  private readonly gitRevisionHunkProvider: GitRevisionHunkProvider | undefined;
  private readonly referenceResolverPlugins: ReferenceResolverPluginRegistry | undefined;
  private readonly frameworkProjectPlugins: FrameworkProjectPluginRegistry | undefined;
  private readonly activeArtifactFactsExtractorVersion: string;
  private readonly activeProjectResolverVersion: string;

  public constructor(
    graphStore: GraphStore,
    sourceCatalog: SourceCatalog,
    artifactFactsExtractorOrExtensions: ArtifactFactsExtractor | SymbolLatticeServiceExtensions =
      extractFileFacts,
    gitChangeSetProvider?: GitChangeSetProvider,
    gitRevisionHunkProvider?: GitRevisionHunkProvider
  ) {
    const extensions =
      typeof artifactFactsExtractorOrExtensions === "function"
        ? undefined
        : artifactFactsExtractorOrExtensions;
    this.graphStore = graphStore;
    this.sourceCatalog = sourceCatalog;
    const baseArtifactFactsExtractor =
      typeof artifactFactsExtractorOrExtensions === "function"
        ? artifactFactsExtractorOrExtensions
        : extensions?.artifactFactsExtractor ?? extractFileFacts;
    this.artifactFactsExtractor =
      extensions?.frameworkFactPlugins === undefined
        ? baseArtifactFactsExtractor
        : createFrameworkFactPluginExtractor(
            baseArtifactFactsExtractor,
            extensions.frameworkFactPlugins
          );
    this.gitChangeSetProvider = gitChangeSetProvider;
    this.gitRevisionHunkProvider = gitRevisionHunkProvider;
    this.referenceResolverPlugins = extensions?.referenceResolverPlugins;
    this.frameworkProjectPlugins = extensions?.frameworkProjectPlugins;
    this.activeArtifactFactsExtractorVersion = artifactFactsExtractorVersion(
      this.artifactFactsExtractor
    );
    this.activeProjectResolverVersion = frameworkProjectPluginProjectVersion(
      referenceResolverPluginProjectVersion(this.referenceResolverPlugins),
      this.frameworkProjectPlugins
    );
  }

  /** True when this service can select changed source paths through its Git port. */
  public gitAffectedTestsAvailable(): boolean {
    return this.gitChangeSetProvider !== undefined;
  }

  /** True when immutable base-to-HEAD hunk attribution is backed by a Git port. */
  public gitHunksAvailable(): boolean {
    return this.gitRevisionHunkProvider !== undefined;
  }

  public async init(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    return this.index(options);
  }

  public async index(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    const projectPath = resolve(options.projectPath);
    const bundle = this.graphStore.isInitialized(projectPath)
      ? this.getActiveGraphBundle(projectPath)
      : null;
    const scan = await this.scanForIndex(projectPath, options, bundle?.indexInputs ?? null);
    const artifactFacts = scan.sourceDocuments.map((document) =>
      this.extractPersistedFacts(document, scan.frameworkEvidence)
    );
    this.replaceGeneration(projectPath, scan, artifactFacts, fullIndexWork(scan.sourceDocuments));
    return this.getStatus(projectPath);
  }

  public async sync(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    const projectPath = resolve(options.projectPath);
    if (!this.graphStore.isInitialized(projectPath)) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${projectPath}. Run "symbol-lattice init ${projectPath}" first.`
      );
    }

    // `sync` is the explicit repair/upgrade operation. Let a store complete
    // additive migrations even when the source scan later proves this is a
    // graph no-op (including the short-lived v0.4 prerelease metadata marker).
    this.graphStore.initialize(projectPath);
    const bundle = this.graphStore.getActiveGenerationBundle(projectPath);
    const scan = await this.scanForIndex(projectPath, options, bundle.indexInputs);
    const changes = sourceChangeSet(scan.sourceDocuments, bundle.snapshot);
    const configurationChanged =
      bundle.indexInputs === null || bundle.indexInputs.fingerprint !== scan.indexInputs.fingerprint;
    const resolverChanged = bundle.resolverVersion !== this.activeProjectResolverVersion;
    const astroFrameworkEvidenceChanged =
      (scan.frameworkEvidence?.astro ?? false) !== astroProjectEnabled(bundle.indexInputs);
    const persistedFactsByPath = new Map(
      bundle.artifactFacts.map((facts) => [facts.filePath, facts])
    );
    const artifactFacts: PersistedArtifactFacts[] = [];
    const reExtractedFiles: string[] = [];
    const reusedArtifactFiles: string[] = [];
    const reuseInvalidationReasons = new Set<IndexWork["reuseInvalidationReasons"][number]>();

    for (const document of scan.sourceDocuments) {
      const persisted = persistedFactsByPath.get(document.relativePath);
      const requiresAstroEndpointReextraction =
        astroFrameworkEvidenceChanged && isAstroEndpointSourceDocument(document);
      if (
        !requiresAstroEndpointReextraction &&
        persisted !== undefined &&
        reusedArtifactFacts(document, persisted, this.activeArtifactFactsExtractorVersion)
      ) {
        artifactFacts.push(persisted);
        reusedArtifactFiles.push(document.relativePath);
        continue;
      }
      if (persisted === undefined) {
        reuseInvalidationReasons.add("missing-persisted-facts");
      } else {
        if (persisted.extractorVersion !== this.activeArtifactFactsExtractorVersion) {
          reuseInvalidationReasons.add("extractor-version-changed");
        }
        if (requiresAstroEndpointReextraction) {
          reuseInvalidationReasons.add("framework-evidence-changed");
        }
      }
      artifactFacts.push(this.extractPersistedFacts(document, scan.frameworkEvidence));
      reExtractedFiles.push(document.relativePath);
    }

    const noSourceChange =
      changes.addedFiles.length === 0 &&
      changes.modifiedFiles.length === 0 &&
      changes.removedFiles.length === 0;
    const sourceSearchChanged = this.sourceSearchProjectionChanged(bundle.sourceSearchVersion);
    if (
      noSourceChange &&
      !configurationChanged &&
      !resolverChanged &&
      reExtractedFiles.length === 0 &&
      !sourceSearchChanged
    ) {
      return this.getStatus(projectPath);
    }

    const changedFiles = new Set([
      ...changes.addedFiles,
      ...changes.modifiedFiles,
      ...changes.removedFiles,
      ...reExtractedFiles
    ]);
    const currentFiles = new Set(scan.sourceDocuments.map((document) => document.relativePath));
    const dependencyInvalidatedFiles =
      configurationChanged || resolverChanged
        ? [...currentFiles].sort(compareText)
        : reverseDependencyInvalidation(bundle.snapshot, changedFiles, currentFiles);
    const work: IndexWork = {
      mode: "incremental",
      resolutionScope: "project",
      addedFiles: changes.addedFiles,
      modifiedFiles: changes.modifiedFiles,
      removedFiles: changes.removedFiles,
      reExtractedFiles: reExtractedFiles.sort(compareText),
      reusedArtifactFiles: reusedArtifactFiles.sort(compareText),
      dependencyInvalidatedFiles,
      reuseInvalidationReasons: [...reuseInvalidationReasons].sort(compareText)
    };
    this.replaceGeneration(projectPath, scan, artifactFacts, work);
    return this.getStatus(projectPath);
  }

  public async getStatus(projectPath: string): Promise<GraphContext["status"]> {
    const normalizedProjectPath = resolve(projectPath);
    const bundle = this.getActiveGraphBundle(normalizedProjectPath);
    return this.getStatusForBundle(normalizedProjectPath, bundle);
  }

  /**
   * Lists immutable retained graph generations without indexing, synchronizing,
   * or rewriting the active projection. Live freshness is deliberately named
   * `activeStatus`: it applies only to the current active generation.
   */
  public async history(
    projectPath: string,
    options: GenerationHistoryOptions = {}
  ): Promise<GenerationHistoryResult> {
    const requestLimit = this.generationHistoryLimit(options);
    const normalizedProjectPath = resolve(projectPath);
    const history = this.readGenerationHistoryBundle(normalizedProjectPath);
    this.requireInitializedHistoryProject(normalizedProjectPath, history.activeGraph);
    const generations = history.generations
      .map((generation) => this.toGenerationHistorySummary(generation))
      .sort(compareGenerationHistorySummaries);
    const returnedGenerations = generations.slice(0, requestLimit);

    return {
      activeStatus: await this.getStatusForBundle(normalizedProjectPath, history.activeGraph),
      bounds: {
        limit: requestLimit,
        maximumLimit: MAX_GENERATION_HISTORY_LIMIT
      },
      retention: {
        capacity: history.retentionLimit,
        retained: generations.length,
        returned: returnedGenerations.length,
        truncated: generations.length > requestLimit
      },
      generations: returnedGenerations
    };
  }

  /**
   * Compares two immutable retained projections. Omit `toGenerationId` for the
   * current active generation; no live file contents, Git hunks, moves, or
   * synchronization are inferred by this read-only operation.
   */
  public async diff(
    projectPath: string,
    fromGenerationId: string,
    options: GenerationDiffOptions = {}
  ): Promise<GenerationDiffResult> {
    const request = this.generationDiffRequest(fromGenerationId, options);
    const normalizedProjectPath = resolve(projectPath);
    const comparison = this.readGenerationComparisonBundle(
      normalizedProjectPath,
      request.fromGenerationId,
      request.toGenerationId
    );
    this.requireInitializedHistoryProject(normalizedProjectPath, comparison.history.activeGraph);
    const from = this.requireComparisonSnapshot(
      normalizedProjectPath,
      "from",
      request.fromGenerationId,
      comparison.from
    );
    const to = this.requireComparisonSnapshot(
      normalizedProjectPath,
      "to",
      request.toGenerationId,
      comparison.to
    );

    if (request.toGenerationId === undefined) {
      const activeGenerationId = comparison.history.activeGraph.status.generationId;
      if (activeGenerationId === null) {
        throw new SymbolLatticeError(
          "MISSING_INDEX",
          `No active SymbolLattice generation exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
        );
      }
      if (to.generation.generationId !== activeGenerationId) {
        throw new SymbolLatticeError(
          "INVALID_GENERATION_COMPARISON",
          `The atomic retained-generation comparison selected generation "${to.generation.generationId}" instead of active generation "${activeGenerationId}".`
        );
      }
    }

    if (from.generation.generationId === to.generation.generationId) {
      throw new SymbolLatticeError(
        "INVALID_GENERATION_COMPARISON",
        "A retained-generation comparison requires distinct from and to generation IDs."
      );
    }

    let changes;
    try {
      changes = diffGenerationSnapshots(from.snapshot, to.snapshot, { limit: request.limit });
    } catch (error) {
      if (error instanceof GenerationSnapshotComparisonError) {
        throw new SymbolLatticeError(
          "INVALID_GENERATION_COMPARISON",
          `Retained-generation comparison is invalid: ${error.message}`
        );
      }
      throw error;
    }

    return {
      activeStatus: await this.getStatusForBundle(
        normalizedProjectPath,
        comparison.history.activeGraph
      ),
      bounds: {
        limit: request.limit,
        maximumLimit: MAX_GENERATION_DIFF_LIMIT
      },
      from: this.toGenerationHistorySummary(from.generation),
      to: this.toGenerationHistorySummary(to.generation),
      ...changes
    };
  }

  /**
   * Searches the immutable source projection installed with the active graph
   * generation. Freshness may inspect the live project, but result evidence is
   * never rebuilt from it.
   */
  public async search(
    projectPath: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const request = this.sourceSearchRequest(query, options);
    const normalizedProjectPath = resolve(projectPath);
    const graphBundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!graphBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }
    const getActiveSourceSearchBundle = this.graphStore.getActiveSourceSearchBundle;
    if (typeof getActiveSourceSearchBundle !== "function") {
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The configured SymbolLattice graph store for ${normalizedProjectPath} does not expose persisted source search. Upgrade the adapter and run "symbol-lattice sync ${normalizedProjectPath}".`
      );
    }
    const bundle = getActiveSourceSearchBundle.call(this.graphStore, normalizedProjectPath, request);
    if (bundle.sourceSearchVersion !== SOURCE_SEARCH_INDEX_VERSION) {
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The active SymbolLattice index for ${normalizedProjectPath} has no compatible persisted source-search projection. Run "symbol-lattice sync ${normalizedProjectPath}" to backfill it.`
      );
    }

    const ranked = rankGeneratedValues({
      values: bundle.hits,
      files: bundle.snapshot.files,
      filePath: (hit) => hit.filePath,
      itemId: (hit) => hit.filePath,
      limit: request.requestedLimit
    });
    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      results: ranked.values.map((item) =>
        this.toSourceSearchHitResult(
          item.value,
          item.ranking.baseRank,
          item.ranking.finalRank,
          item.generated,
          item.ranking,
          request.terms,
          bundle.snapshot
        )
      ),
      ranking: {
        ...ranked.diagnostics,
        requestedLimit: request.requestedLimit,
        candidateLimit: request.candidateLimit,
        candidatePoolAtLimit: bundle.hits.length === request.candidateLimit
      }
    };
  }

  /**
   * Starts from persisted lexical evidence, then expands its exact declaration
   * candidates into bounded graph context from that same active generation.
   * This is deliberately read-only: it never creates or refreshes an index.
   */
  public async investigate(
    projectPath: string,
    query: string,
    options: InvestigateOptions = {}
  ): Promise<InvestigateResult> {
    const request = this.investigateRequest(query, options);
    const normalizedProjectPath = resolve(projectPath);
    const initialBundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!initialBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    const getActiveSourceSearchBundle = this.graphStore.getActiveSourceSearchBundle;
    if (typeof getActiveSourceSearchBundle !== "function") {
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The configured SymbolLattice graph store for ${normalizedProjectPath} does not expose persisted source search. Upgrade the adapter and run "symbol-lattice sync ${normalizedProjectPath}".`
      );
    }
    const bundle = getActiveSourceSearchBundle.call(
      this.graphStore,
      normalizedProjectPath,
      request.search
    );
    if (bundle.sourceSearchVersion !== SOURCE_SEARCH_INDEX_VERSION) {
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The active SymbolLattice index for ${normalizedProjectPath} has no compatible persisted source-search projection. Run "symbol-lattice sync ${normalizedProjectPath}" to backfill it.`
      );
    }

    const rankedSearch = rankGeneratedValues({
      values: bundle.hits,
      files: bundle.snapshot.files,
      filePath: (hit) => hit.filePath,
      itemId: (hit) => hit.filePath,
      limit: request.search.requestedLimit
    });
    const searchResults = rankedSearch.values.map((item) =>
      this.toSourceSearchHitResult(
        item.value,
        item.ranking.baseRank,
        item.ranking.finalRank,
        item.generated,
        item.ranking,
        request.search.terms,
        bundle.snapshot
      )
    );
    const selection = this.investigationSelection(
      searchResults,
      bundle.snapshot,
      request.symbolLimit,
      request.ranking
    );
    const matches: readonly SymbolMatch[] = selection.items.map(({ symbol }) => ({
      status: "exact",
      reference: symbol.qualifiedName,
      symbol,
      candidates: [symbol]
    }));
    const read: ContextRead = {
      bundle,
      matches,
      documentsByFilePath: new Map(
        bundle.hits.map(
          (hit): readonly [string, IndexedSourceDocument] => [
            hit.filePath,
            {
              filePath: hit.filePath,
              language: hit.language,
              sourceText: hit.sourceText
            }
          ]
        )
      )
    };
    const contextPack = this.symbolContextPack(read, request.contextBounds);
    const declarationPack = this.investigationDeclarations(
      selection,
      read.documentsByFilePath,
      request.sourceCharacterBudget,
      request.sourceRenderMode
    );

    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      query: request.search.query,
      bounds: {
        searchLimit: request.search.requestedLimit,
        maximumSearchLimit: MAX_SOURCE_SEARCH_LIMIT,
        symbolLimit: request.symbolLimit,
        maximumSymbolLimit: MAX_INVESTIGATE_SYMBOL_LIMIT,
        ranking: request.ranking,
        declarationSource: {
          sourceLineLimit: NODE_SOURCE_LINE_LIMIT,
          sourceCharacterLimit: NODE_SOURCE_CHARACTER_LIMIT,
          totalCharacterBudget: request.sourceCharacterBudget,
          minimumTotalCharacterBudget: MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
          maximumTotalCharacterBudget: MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
          allocationPolicy: INVESTIGATION_SOURCE_ALLOCATION_POLICY,
          renderPolicy: INVESTIGATION_SOURCE_RENDER_POLICY,
          requestedRenderMode: request.sourceRenderMode
        },
        context: request.contextBounds
      },
      search: { results: searchResults },
      selection,
      declarations: declarationPack.declarations,
      sourceAllocation: declarationPack.allocation,
      contexts: contextPack.contexts,
      evidencePaths: this.contextEvidencePaths(read.matches, bundle, request.contextBounds)
    };
  }

  /**
   * Lists deterministic file records from the active persisted graph generation.
   * This is deliberately a query-only surface: it uses `requireGraph` and never
   * initializes, indexes, or synchronizes a project.
   */
  public async files(
    projectPath: string,
    options: FilesOptions = {}
  ): Promise<FilesResult> {
    const request = this.filesRequest(options);
    const context = await this.requireGraph(projectPath);
    const declarationCounts = new Map<string, number>();
    const edgeCounts = new Map<string, number>();
    const pendingReferenceCounts = new Map<string, number>();

    for (const symbol of context.snapshot.symbols) {
      if (symbol.kind === "file") {
        continue;
      }
      declarationCounts.set(
        symbol.filePath,
        (declarationCounts.get(symbol.filePath) ?? 0) + 1
      );
    }
    for (const edge of context.snapshot.edges) {
      edgeCounts.set(edge.filePath, (edgeCounts.get(edge.filePath) ?? 0) + 1);
    }
    for (const reference of context.snapshot.pendingReferences) {
      pendingReferenceCounts.set(
        reference.filePath,
        (pendingReferenceCounts.get(reference.filePath) ?? 0) + 1
      );
    }

    const matchesPattern = request.pattern === undefined
      ? undefined
      : createProjectFileGlobMatcher(request.pattern);
    const matchingFiles: readonly IndexedFileSummary[] = context.snapshot.files
      .filter(
        (file) =>
          (request.pathPrefix === undefined || matchesProjectPathPrefix(file.path, request.pathPrefix)) &&
          (request.language === undefined || file.language === request.language) &&
          (matchesPattern === undefined || matchesPattern(file.path))
      )
      .map((file) => ({
        filePath: file.path,
        language: file.language,
        indexedAt: file.indexedAt,
        generated: generatedClassificationFor(file),
        declarationCount: declarationCounts.get(file.path) ?? 0,
        edgeCount: edgeCounts.get(file.path) ?? 0,
        pendingReferenceCount: pendingReferenceCounts.get(file.path) ?? 0
      }))
      .sort((left, right) => compareText(left.filePath, right.filePath));

    const selectionFingerprint = fileSelectionFingerprint(request);
    let startIndex = 0;
    if (request.cursor !== undefined) {
      let cursor;
      try {
        cursor = decodeFilePageCursor(request.cursor);
      } catch (error) {
        if (error instanceof InvalidFilePageCursorError) {
          throw new SymbolLatticeError("INVALID_FILE_CURSOR", error.message);
        }
        throw error;
      }
      if (cursor.generationId !== context.status.generationId) {
        throw new SymbolLatticeError(
          "FILE_CURSOR_GENERATION_MISMATCH",
          "File cursor belongs to a different active generation."
        );
      }
      if (cursor.selectionFingerprint !== selectionFingerprint) {
        throw new SymbolLatticeError(
          "FILE_CURSOR_FILTER_MISMATCH",
          "File cursor does not match the current file-selection filters."
        );
      }
      const cursorIndex = matchingFiles.findIndex((file) => file.filePath === cursor.afterFilePath);
      if (cursorIndex < 0) {
        throw new SymbolLatticeError(
          "INVALID_FILE_CURSOR",
          "File cursor does not identify a record in the selected generation."
        );
      }
      startIndex = cursorIndex + 1;
    }

    const returnedFiles = matchingFiles.slice(startIndex, startIndex + request.limit);
    const remainingFileCount = Math.max(0, matchingFiles.length - startIndex - returnedFiles.length);
    const generationId = context.status.generationId;
    if (generationId === null) {
      throw new SymbolLatticeError("MISSING_INDEX", "The active file generation is unavailable.");
    }
    const nextCursor = remainingFileCount > 0 && returnedFiles.length > 0
      ? encodeFilePageCursor({
          generationId,
          selectionFingerprint,
          afterFilePath: returnedFiles.at(-1)!.filePath
        })
      : null;
    return {
      status: context.status,
      bounds: {
        limit: request.limit,
        maximumLimit: MAX_FILE_LIMIT
      },
      format: request.format,
      matchedFileCount: matchingFiles.length,
      pagination: {
        returnedFileCount: returnedFiles.length,
        remainingFileCount,
        nextCursor
      },
      files: returnedFiles,
      ...(request.format === "tree"
        ? { tree: buildFileTree(returnedFiles, request.maxDepth) }
        : {}),
      ...(request.format === "grouped"
        ? { groups: buildFileLanguageGroups(returnedFiles) }
        : {}),
      truncated: remainingFileCount > 0
    };
  }

  /**
   * Lists deterministic route facts from the active persisted graph generation.
   * This is deliberately a query-only surface: it uses `requireGraph` and never
   * initializes, indexes, or synchronizes a project.
   */
  public async routes(
    projectPath: string,
    options: RoutesOptions = {}
  ): Promise<RoutesResult> {
    const request = this.routesRequest(options);
    const context = await this.requireGraph(projectPath);
    const matchingRoutes = getRoutes(context.snapshot).filter(
      (route) =>
        (request.method === undefined || route.method === request.method) &&
        (request.pathPrefix === undefined || route.path.startsWith(request.pathPrefix)) &&
        (request.domain === undefined || route.domain === request.domain)
    );

    return {
      status: context.status,
      bounds: {
        limit: request.limit,
        maximumLimit: MAX_ROUTE_LIMIT
      },
      routes: matchingRoutes.slice(0, request.limit),
      truncated: matchingRoutes.length > request.limit
    };
  }

  /**
   * Lists persisted non-HTTP entrypoints without initializing, indexing, or
   * synchronizing a project. HTTP route retrieval remains a separate method.
   */
  public async entrypoints(
    projectPath: string,
    options: EntrypointsOptions = {}
  ): Promise<EntrypointsResult> {
    const request = this.entrypointsRequest(options);
    const context = await this.requireGraph(projectPath);
    const matchingEntrypoints = getEntrypoints(context.snapshot).filter(
      (entrypoint) =>
        (request.transport === undefined || entrypoint.transport === request.transport) &&
        (request.operation === undefined || entrypoint.operation === request.operation) &&
        (request.namePrefix === undefined || entrypoint.name.startsWith(request.namePrefix))
    );

    return {
      status: context.status,
      bounds: {
        limit: request.limit,
        maximumLimit: MAX_ENTRYPOINT_LIMIT
      },
      entrypoints: matchingEntrypoints.slice(0, request.limit),
      truncated: matchingEntrypoints.length > request.limit
    };
  }

  /**
   * Lists direct TypeScript declaration parents and children from the active
   * persisted graph generation. This is deliberately query-only and never
   * initializes, indexes, or synchronizes a project.
   */
  public async hierarchy(
    projectPath: string,
    reference: string,
    options: HierarchyOptions = {}
  ): Promise<HierarchyResult> {
    const request = this.hierarchyRequest(options);
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    const parents = getParents(context.snapshot, symbol.id);
    const children = getChildren(context.snapshot, symbol.id);

    return {
      status: context.status,
      symbol,
      bounds: {
        limit: request.limit,
        maximumLimit: MAX_HIERARCHY_LIMIT
      },
      parents: parents.slice(0, request.limit),
      children: children.slice(0, request.limit),
      parentsTruncated: parents.length > request.limit,
      childrenTruncated: children.length > request.limit
    };
  }

  public async find(
    projectPath: string,
    query: string,
    options: FindOptions = {}
  ): Promise<FindResult> {
    const context = await this.requireGraph(projectPath);
    const limit = options.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("limit must be a positive integer.");
    }
    const candidates = findSymbols(context.snapshot, query, {
      ...(options.kind === undefined ? {} : { kind: options.kind }),
      limit: Number.MAX_SAFE_INTEGER
    });
    const ranked = rankGeneratedValues({
      values: candidates,
      files: context.snapshot.files,
      filePath: (symbol) => symbol.filePath,
      itemId: (symbol) => symbol.id,
      limit
    });
    return {
      status: context.status,
      symbols: ranked.values.map((item) => item.value),
      ranking: ranked.diagnostics
    };
  }

  public async callers(projectPath: string, reference: string): Promise<RelationResult> {
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    const ranked = rankGeneratedValues({
      values: getCallers(context.snapshot, symbol.id),
      files: context.snapshot.files,
      filePath: (relation) => relation.symbol.filePath,
      itemId: (relation) => relation.edge.id
    });
    return {
      status: context.status,
      symbol,
      relations: ranked.values.map((item) => item.value),
      ranking: ranked.diagnostics
    };
  }

  public async callees(projectPath: string, reference: string): Promise<RelationResult> {
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    const ranked = rankGeneratedValues({
      values: getCallees(context.snapshot, symbol.id),
      files: context.snapshot.files,
      filePath: (relation) => relation.symbol.filePath,
      itemId: (relation) => relation.edge.id
    });
    return {
      status: context.status,
      symbol,
      relations: ranked.values.map((item) => item.value),
      ranking: ranked.diagnostics
    };
  }

  public impact(projectPath: string, reference: string, maxDepth?: number): Promise<ImpactResult>;
  public impact(projectPath: string, reference: string, options?: ImpactOptions): Promise<ImpactResult>;
  public async impact(
    projectPath: string,
    reference: string,
    maxDepthOrOptions: number | ImpactOptions = 1
  ): Promise<ImpactResult> {
    const options = this.normalizedImpactOptions(maxDepthOrOptions);
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    const paths = getImpactPaths(context.snapshot, symbol.id, options.maxDepth);
    const returnedPaths = options.limit === undefined ? paths : paths.slice(0, options.limit);

    return {
      status: context.status,
      symbol,
      paths: returnedPaths,
      summary: summarizeImpactPaths(context.snapshot, returnedPaths),
      ...(options.limit === undefined ? {} : { truncated: paths.length > options.limit })
    };
  }

  /**
   * Reads one exact or uniquely suffixed indexed file from the immutable
   * active-generation source projection. Freshness may inspect the worktree,
   * but source, symbols, and dependents come from the same persisted generation.
   */
  public async fileView(
    projectPath: string,
    filePath: string,
    options: FileViewOptions = {}
  ): Promise<FileViewResult> {
    const offset = options.offset ?? 1;
    if (!Number.isSafeInteger(offset) || offset < 1) {
      throw new SymbolLatticeError(
        "INVALID_FILE_VIEW_OFFSET",
        "File-view offset must be a positive whole number."
      );
    }
    const limit = options.limit ?? DEFAULT_FILE_VIEW_LINE_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_FILE_VIEW_LINE_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_FILE_VIEW_LIMIT",
        `File-view limit must be a whole number from 1 to ${MAX_FILE_VIEW_LINE_LIMIT}.`
      );
    }
    const normalizedFilePath = this.normalizedProjectRelativePathPrefix(
      filePath,
      "INVALID_FILE_VIEW_PATH",
      "File view"
    );
    if (normalizedFilePath === undefined) {
      throw new SymbolLatticeError(
        "INVALID_FILE_VIEW_PATH",
        "File view requires one project-relative indexed file path or path suffix."
      );
    }

    const normalizedProjectPath = resolve(projectPath);
    const getActiveSourceDocumentsBundle = this.graphStore.getActiveSourceDocumentsBundle;
    if (typeof getActiveSourceDocumentsBundle !== "function") {
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The configured SymbolLattice graph store for ${normalizedProjectPath} does not expose persisted source documents.`
      );
    }
    let requestedDocumentPath = normalizedFilePath;
    let read:
      | {
          readonly bundle: ActiveSourceDocumentsBundle;
          readonly indexedFile: IndexedFile;
          readonly document: IndexedSourceDocument;
          readonly resolution: ResolvedFileViewSelection["resolution"];
        }
      | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentBundle = getActiveSourceDocumentsBundle.call(this.graphStore, normalizedProjectPath, [
        requestedDocumentPath
      ]);
      if (!currentBundle.status.initialized) {
        throw new SymbolLatticeError(
          "MISSING_INDEX",
          `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
        );
      }
      const selection = resolveFileViewSelection(currentBundle.snapshot.files, normalizedFilePath);
      const currentDocument = currentBundle.documents.find(
        (item) => item.filePath === selection.file.path
      );
      if (
        currentBundle.sourceSearchVersion === SOURCE_SEARCH_INDEX_VERSION &&
        currentDocument !== undefined
      ) {
        read = {
          bundle: currentBundle,
          indexedFile: selection.file,
          document: currentDocument,
          resolution: selection.resolution
        };
        break;
      }
      if (attempt === 0 && selection.file.path !== requestedDocumentPath) {
        requestedDocumentPath = selection.file.path;
        continue;
      }
      throw new SymbolLatticeError(
        "SOURCE_SEARCH_UNAVAILABLE",
        `The active generation has no compatible persisted source for ${selection.file.path}. Run "symbol-lattice sync ${normalizedProjectPath}" to backfill it.`
      );
    }
    if (read === undefined) {
      throw new Error("File-view source-document retry loop must return an active-generation read.");
    }
    const { bundle, indexedFile, document, resolution } = read;
    const resolvedFilePath = indexedFile.path;

    const symbols = bundle.snapshot.symbols
      .filter((symbol) => symbol.kind !== "file" && symbol.filePath === resolvedFilePath)
      .sort(compareSymbolCandidates)
      .map((symbol) => ({
        id: symbol.id,
        name: symbol.name,
        qualifiedName: symbol.qualifiedName,
        kind: symbol.kind,
        range: symbol.range,
        isExported: symbol.isExported
      }));
    const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
    const targetFileSymbol = bundle.snapshot.symbols.find(
      (symbol) => symbol.kind === "file" && symbol.filePath === resolvedFilePath
    );
    const dependentEvidence = new Map<
      string,
      { edgeKinds: Set<"imports" | "exports">; edgeCount: number }
    >();
    if (targetFileSymbol !== undefined) {
      for (const edge of bundle.snapshot.edges) {
        if (
          edge.resolution !== "exact" ||
          edge.targetId !== targetFileSymbol.id ||
          (edge.kind !== "imports" && edge.kind !== "exports")
        ) {
          continue;
        }
        const source = symbolsById.get(edge.sourceId);
        if (source?.kind !== "file") {
          continue;
        }
        const evidence = dependentEvidence.get(source.filePath) ?? {
          edgeKinds: new Set<"imports" | "exports">(),
          edgeCount: 0
        };
        evidence.edgeKinds.add(edge.kind);
        evidence.edgeCount += 1;
        dependentEvidence.set(source.filePath, evidence);
      }
    }
    const dependents = [...dependentEvidence.entries()]
      .map(([dependentPath, evidence]) => ({
        filePath: dependentPath,
        edgeKinds: [...evidence.edgeKinds].sort(compareText),
        edgeCount: evidence.edgeCount
      }))
      .sort((left, right) => compareText(left.filePath, right.filePath));

    const sourceLines = document.sourceText.split(/\r\n|\r|\n|\u2028|\u2029/u);
    const contentAvailability = options.symbolsOnly === true
      ? "symbols-only" as const
      : document.language === "yaml" || document.language === "properties"
        ? "withheld-sensitive-format" as const
        : "active-generation" as const;
    if (contentAvailability === "active-generation" && offset > sourceLines.length) {
      throw new SymbolLatticeError(
        "FILE_VIEW_OFFSET_PAST_END",
        `File view offset ${offset} is past the end of ${resolvedFilePath} (${sourceLines.length} lines).`
      );
    }
    const startIndex = Math.min(offset - 1, sourceLines.length);
    const returnedSourceLines = sourceLines.slice(startIndex, startIndex + limit);
    const lines = contentAvailability === "active-generation"
      ? returnedSourceLines.map((text, index) => ({ line: startIndex + index + 1, text }))
      : [];
    const lineStarts = sourceLineStarts(document.sourceText);
    const sourceIdentity = lines.length === 0
      ? null
      : (() => {
          const lastLine = lines[lines.length - 1]!;
          const startOffset = sourcePositionOffset(document.sourceText, lineStarts, {
            line: lines[0]!.line,
            column: 1
          });
          const endOffset = sourcePositionOffset(document.sourceText, lineStarts, {
            line: lastLine.line,
            column: lastLine.text.length + 1
          });
          if (startOffset === null || endOffset === null) {
            throw new Error(`Persisted file-view line offsets are invalid for ${resolvedFilePath}.`);
          }
          const delivery = canonicalSourceDeliverySlice({
            filePath: resolvedFilePath,
            sourceText: document.sourceText,
            fullFileCharacterOffsets: { start: startOffset, end: endOffset }
          });
          if (delivery.text !== lines.map((line) => line.text).join("\n")) {
            throw new Error(`Persisted file-view delivery text is inconsistent for ${resolvedFilePath}.`);
          }
          return delivery.sourceIdentity;
        })();

    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      selection: {
        requestedPath: filePath,
        filePath: resolvedFilePath,
        source: "active-generation",
        resolution
      },
      file: { language: indexedFile.language, indexedAt: indexedFile.indexedAt },
      bounds: {
        offset,
        limit,
        maximumLimit: MAX_FILE_VIEW_LINE_LIMIT,
        totalLines: sourceLines.length,
        returnedLines: lines.length,
        truncatedBefore: offset > 1,
        truncatedAfter: startIndex + returnedSourceLines.length < sourceLines.length
      },
      contentAvailability,
      sourceIdentity,
      lines,
      symbols,
      dependents
    };
  }

  /**
   * Selects Git-changed supported source paths through the injected port, then
   * delegates proof calculation to `affectedTests`. This query never runs Git
   * itself and never initializes, indexes, or synchronizes a project.
   */
  public async affectedTestsFromGit(
    projectPath: string,
    options: GitAffectedTestsOptions = {}
  ): Promise<GitAffectedTestsResult> {
    const normalizedProjectPath = resolve(projectPath);
    const affectedTestSelection = this.affectedTestSelection(options.testPattern);
    const pathPrefix =
      options.pathPrefix === undefined
        ? undefined
        : this.normalizedProjectRelativePathPrefix(
            options.pathPrefix,
            "INVALID_GIT_AFFECTED_PATH_PREFIX",
            "Git affected"
          );
    const request = this.gitChangeSetRequest(options);
    const changeSet = await this.readGitChangeSet(normalizedProjectPath, request);
    const sourcePathSet = new Set(changeSet.sourcePaths);
    const selectedChanges = changeSet.changes.filter(
      (change) =>
        pathPrefix === undefined ||
        [change.previousPath, change.currentPath].some(
          (filePath) => filePath !== null && matchesProjectPathPrefix(filePath, pathPrefix)
        )
    );
    const selectedSourceChanges = selectedChanges.filter((change) =>
      [change.previousPath, change.currentPath].some(
        (filePath) => filePath !== null && sourcePathSet.has(filePath)
      )
    );
    const selectedSourcePaths = [
      ...new Set(
        selectedSourceChanges.flatMap((change) =>
          [change.previousPath, change.currentPath].filter(
            (filePath): filePath is string => filePath !== null && sourcePathSet.has(filePath)
          )
        )
      )
    ].sort(compareText);
    const selection = {
      pathPrefix: pathPrefix ?? null,
      totalChanges: changeSet.changes.length,
      matchedSourceChanges: selectedSourceChanges.length,
      sourcePaths: selectedSourcePaths
    };

    if (selectedSourcePaths.length === 0) {
      return {
        status: await this.getStatus(normalizedProjectPath),
        changeSet,
        selection,
        testSelection: affectedTestSelection.testSelection,
        affected: null
      };
    }

    if (selectedSourcePaths.length > MAX_AFFECTED_CHANGED_FILES) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_FILES",
        `Git source selection is capped at ${MAX_AFFECTED_CHANGED_FILES} paths. Refine the path prefix, base ref, or working-tree changes.`
      );
    }

    const affected = await this.affectedTests(normalizedProjectPath, selectedSourcePaths, options);
    return {
      status: affected.status,
      changeSet,
      selection,
      testSelection: affectedTestSelection.testSelection,
      affected
    };
  }

  /**
   * Attributes immutable base-to-HEAD Git hunk sides to declarations extracted
   * from those exact revision blobs. This intentionally does not read an
   * active graph, inspect live files, or infer old/new declaration identity.
   */
  public async gitHunks(
    projectPath: string,
    baseRef: string,
    options: GitHunksOptions = {}
  ): Promise<GitHunksResult> {
    const request = this.gitHunksRequest(baseRef, options);
    const hunkSet = await this.readGitRevisionHunks(resolve(projectPath), {
      baseRef: request.baseRef,
      maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES,
      ...(request.pathPrefix === undefined ? {} : { pathPrefix: request.pathPrefix })
    });
    this.requireGitHunkSetWithinBounds(hunkSet);

    const items: GitHunkResultItem[] = [];
    const files = [...hunkSet.files].sort(compareGitRevisionHunkFile);
    for (const file of files) {
      const oldFacts = this.extractGitRevisionSourceFacts(file.previous);
      const newFacts = this.extractGitRevisionSourceFacts(file.current);
      for (const hunk of [...file.hunks].sort(compareGitUnifiedHunk)) {
        items.push(this.toGitHunkResultItem(file, hunk, oldFacts, newFacts));
      }
    }

    const orderedItems = items.sort(compareGitHunkResultItem);
    return {
      changeSet: hunkSet.changeSet,
      selection: {
        pathPrefix: request.pathPrefix ?? null,
        totalChanges: hunkSet.changeSet.changes.length,
        matchedSourceChanges: files.length
      },
      bounds: {
        maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES,
        maxDeclarationAnchorsPerSide: MAX_GIT_HUNK_DECLARATION_ANCHORS,
        limit: request.limit,
        maximumLimit: MAX_GIT_HUNK_LIMIT
      },
      hunks: {
        items: orderedItems.slice(0, request.limit),
        total: orderedItems.length,
        truncated: orderedItems.length > request.limit
      }
    };
  }

  /**
   * Selects conventionally named affected tests from exact import/export
   * evidence in the current persisted generation. This never syncs or invokes
   * Git; the returned freshness status makes any live-project drift explicit.
   */
  public async affectedTests(
    projectPath: string,
    filePaths: readonly string[],
    options: AffectedTestsOptions = {}
  ): Promise<AffectedTestsResult> {
    const normalizedProjectPath = resolve(projectPath);
    const request = this.affectedTestsRequest(normalizedProjectPath, filePaths, options);
    const bundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!bundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    const status = await this.getStatusForBundle(normalizedProjectPath, bundle);
    const fileSymbolsByPath = new Map(
      bundle.snapshot.symbols
        .filter((symbol) => symbol.kind === "file")
        .map((symbol) => [symbol.filePath, symbol])
    );
    const indexed = request.filePaths.filter((filePath) => fileSymbolsByPath.has(filePath));
    const notIndexed = request.filePaths.filter((filePath) => !fileSymbolsByPath.has(filePath));
    const candidates: AffectedTestEvidence[] = [];
    let resultLimitTruncated = false;
    let traversalTruncated = false;
    let depthLimitReached = false;

    for (const filePath of indexed) {
      const symbol = fileSymbolsByPath.get(filePath);
      if (symbol === undefined) {
        continue;
      }

      const traversal = findAffectedTestPaths(bundle.snapshot, symbol.id, {
        maxDepth: request.bounds.maxDepth,
        maxResults: request.bounds.limit + 1,
        maxVisitedFiles: request.bounds.maxVisitedFilesPerInput,
        testClassifier: request.testClassifier
      });
      resultLimitTruncated ||= traversal.resultLimitReached;
      traversalTruncated ||= traversal.traversalTruncated;
      depthLimitReached ||= traversal.depthLimitReached;

      for (const path of traversal.paths) {
        const terminal = path.symbols.at(-1);
        const classification = terminal === undefined ? null : request.testClassifier(terminal.filePath);
        if (terminal === undefined || classification === null) {
          throw new Error("Affected-test traversal must terminate at a classified test file.");
        }
        candidates.push({
          triggerFilePath: filePath,
          filePath: terminal.filePath,
          reason: path.edges.length === 0 ? "changed-test" : "exact-dependent",
          classification,
          path
        });
      }
    }

    const orderedCandidates = candidates.sort(compareAffectedTestEvidence);
    resultLimitTruncated ||= orderedCandidates.length > request.bounds.limit;
    const limitations: AffectedTestsLimitation[] = [
      ...(status.stale ? (["index-stale"] as const) : []),
      ...(notIndexed.length > 0 ? (["input-not-indexed"] as const) : []),
      ...(depthLimitReached ? (["depth-limit-reached"] as const) : []),
      ...(traversalTruncated ? (["visit-limit-reached"] as const) : []),
      ...(resultLimitTruncated ? (["result-limit-reached"] as const) : [])
    ];

    return {
      status,
      bounds: request.bounds,
      indexScope: bundle.indexInputs?.scopeRoots ?? null,
      testSelection: request.testSelection,
      indexedTestFiles: bundle.snapshot.files.filter((file) => request.testClassifier(file.path) !== null)
        .length,
      inputs: {
        requested: request.filePaths,
        indexed,
        notIndexed
      },
      tests: {
        items: orderedCandidates.slice(0, request.bounds.limit),
        resultLimitTruncated,
        traversalTruncated,
        depthLimitReached
      },
      completeness: {
        completeForActiveGeneration: limitations.length === 0,
        limitations
      }
    };
  }

  /**
   * Builds a bounded, auditable multi-symbol pack without changing the
   * single-symbol `explore` contract. Every source excerpt is read from the
   * same persisted generation as the graph relationships below it.
   */
  public async context(
    projectPath: string,
    references: readonly string[],
    options: ContextOptions = {}
  ): Promise<ContextResult> {
    const request = this.contextRequest(references, options);
    const normalizedProjectPath = resolve(projectPath);
    const initialBundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!initialBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    const read = this.getContextRead(normalizedProjectPath, initialBundle, request.references);
    const status = await this.getStatusForBundle(normalizedProjectPath, read.bundle);
    const contextPack = this.symbolContextPack(read, request.bounds);

    return {
      status,
      bounds: request.bounds,
      contexts: contextPack.contexts,
      sourceAllocation: contextPack.allocation,
      evidencePaths: this.contextEvidencePaths(read.matches, read.bundle, request.bounds)
    };
  }

  public async explore(projectPath: string, reference: string): Promise<ExploreResult> {
    const normalizedProjectPath = resolve(projectPath);
    const graphBundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!graphBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    let match = matchSymbol(graphBundle.snapshot, reference);
    if (match.status !== "exact") {
      return this.exploreQuery(normalizedProjectPath, reference, graphBundle);
    }

    const getActiveSourceDocumentsBundle = this.graphStore.getActiveSourceDocumentsBundle;
    if (typeof getActiveSourceDocumentsBundle !== "function") {
      return this.exploreResultForBundle(
        normalizedProjectPath,
        reference,
        graphBundle,
        null,
        "unavailable"
      );
    }

    // The graph read above selects the requested document path. Each bounded
    // source read is an authoritative graph-and-document snapshot: it is safe
    // to return immediately when it contains the exact symbol's document,
    // even if a concurrent sync advanced the active generation after the
    // initial graph read.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceBundle = getActiveSourceDocumentsBundle.call(this.graphStore, normalizedProjectPath, [
        match.symbol.filePath
      ]);
      const sourceMatch = matchSymbol(sourceBundle.snapshot, reference);
      if (sourceMatch.status !== "exact") {
        return this.exploreResultForBundle(
          normalizedProjectPath,
          reference,
          sourceBundle,
          null,
          "not-applicable"
        );
      }

      const sourceDocument =
        sourceBundle.sourceSearchVersion === null || sourceBundle.sourceSearchVersion === undefined
          ? undefined
          : sourceBundle.documents.find((document) => document.filePath === sourceMatch.symbol.filePath);
      if (sourceDocument !== undefined) {
        const sourceDraft = contextSourceDraftFromPersistedText({
          referenceIndex: 0,
          reference: sourceMatch.symbol.qualifiedName,
          filePath: sourceDocument.filePath,
          sourceText: sourceDocument.sourceText,
          centerLine: sourceMatch.symbol.range.start.line
        });
        const source = sourceDraft === null
          ? null
          : renderContextSource(
              sourceDraft,
              Math.min(
                sourceDraft.endOffset - sourceDraft.startOffset,
                DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET
              )
            );
        return this.exploreResultForBundle(
          normalizedProjectPath,
          reference,
          sourceBundle,
          source,
          source === null ? "unavailable" : "active-generation"
        );
      }

      // A sync may have moved the exact symbol after the initial graph read.
      // The first bundle proves the current path, but only includes the
      // originally requested document, so retry once with that current path.
      if (
        attempt === 0 &&
        sourceBundle.sourceSearchVersion !== null &&
        sourceBundle.sourceSearchVersion !== undefined &&
        sourceMatch.symbol.filePath !== match.symbol.filePath
      ) {
        match = sourceMatch;
        continue;
      }

      return this.exploreResultForBundle(
        normalizedProjectPath,
        reference,
        sourceBundle,
        null,
        "unavailable"
      );
    }

    return this.exploreResultForBundle(
      normalizedProjectPath,
      reference,
      graphBundle,
      null,
      "unavailable"
    );
  }

  private async exploreQuery(
    normalizedProjectPath: string,
    query: string,
    initialBundle: ActiveGraphBundle
  ): Promise<ExploreResult> {
    let plan = planExploreQuery(initialBundle.snapshot, query);
    let pathSpinePlan = planExplorePathSpines(initialBundle.snapshot, plan.selection);
    const getActiveSourceDocumentsBundle = this.graphStore.getActiveSourceDocumentsBundle;
    if (typeof getActiveSourceDocumentsBundle !== "function" || plan.selection.length === 0) {
      return this.exploreQueryResultForBundle(
        normalizedProjectPath,
        query,
        initialBundle,
        plan,
        pathSpinePlan,
        new Map()
      );
    }

    let requestedFilePaths = this.exploreQueryFilePaths(plan, pathSpinePlan);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceBundle = getActiveSourceDocumentsBundle.call(
        this.graphStore,
        normalizedProjectPath,
        requestedFilePaths
      );
      plan = planExploreQuery(sourceBundle.snapshot, query);
      pathSpinePlan = planExplorePathSpines(sourceBundle.snapshot, plan.selection);
      const currentFilePaths = this.exploreQueryFilePaths(plan, pathSpinePlan);
      const documentsByFilePath = new Map(
        sourceBundle.documents.map(
          (document): readonly [string, IndexedSourceDocument] => [document.filePath, document]
        )
      );
      if (
        attempt === 0 &&
        !this.sameFilePaths(currentFilePaths, requestedFilePaths)
      ) {
        requestedFilePaths = currentFilePaths;
        continue;
      }
      return this.exploreQueryResultForBundle(
        normalizedProjectPath,
        query,
        sourceBundle,
        plan,
        pathSpinePlan,
        documentsByFilePath
      );
    }

    const fallbackPlan = planExploreQuery(initialBundle.snapshot, query);
    const fallbackPathSpinePlan = planExplorePathSpines(
      initialBundle.snapshot,
      fallbackPlan.selection
    );
    return this.exploreQueryResultForBundle(
      normalizedProjectPath,
      query,
      initialBundle,
      fallbackPlan,
      fallbackPathSpinePlan,
      new Map()
    );
  }

  /**
   * Returns one exact symbol's persisted declaration together with bounded
   * direct call relationships. Source, graph, and freshness remain tied to a
   * single active generation; this never falls back to the live filesystem.
   */
  public async node(projectPath: string, reference: string): Promise<NodeResult> {
    const normalizedProjectPath = resolve(projectPath);
    const graphBundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!graphBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    let match = matchSymbol(graphBundle.snapshot, reference);
    if (match.status !== "exact") {
      return this.nodeResultForBundle(
        normalizedProjectPath,
        reference,
        graphBundle,
        null,
        "not-applicable"
      );
    }

    const getActiveSourceDocumentsBundle = this.graphStore.getActiveSourceDocumentsBundle;
    if (typeof getActiveSourceDocumentsBundle !== "function") {
      return this.nodeResultForBundle(
        normalizedProjectPath,
        reference,
        graphBundle,
        null,
        "unavailable"
      );
    }

    // This mirrors explore's authoritative bundle retry: the initial graph
    // chooses a bounded path, while a concurrent sync can move the symbol and
    // requires one retry against the current generation's path.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceBundle = getActiveSourceDocumentsBundle.call(this.graphStore, normalizedProjectPath, [
        match.symbol.filePath
      ]);
      const sourceMatch = matchSymbol(sourceBundle.snapshot, reference);
      if (sourceMatch.status !== "exact") {
        return this.nodeResultForBundle(
          normalizedProjectPath,
          reference,
          sourceBundle,
          null,
          "not-applicable"
        );
      }

      const sourceDocument =
        sourceBundle.sourceSearchVersion === null || sourceBundle.sourceSearchVersion === undefined
          ? undefined
          : sourceBundle.documents.find((document) => document.filePath === sourceMatch.symbol.filePath);
      if (sourceDocument !== undefined) {
        const source = nodeSourceFromPersistedText(
          sourceDocument.filePath,
          sourceDocument.sourceText,
          sourceMatch.symbol.range
        );
        return this.nodeResultForBundle(
          normalizedProjectPath,
          reference,
          sourceBundle,
          source,
          source === null ? "unavailable" : "active-generation"
        );
      }

      if (
        attempt === 0 &&
        sourceBundle.sourceSearchVersion !== null &&
        sourceBundle.sourceSearchVersion !== undefined &&
        sourceMatch.symbol.filePath !== match.symbol.filePath
      ) {
        match = sourceMatch;
        continue;
      }

      return this.nodeResultForBundle(
        normalizedProjectPath,
        reference,
        sourceBundle,
        null,
        "unavailable"
      );
    }

    return this.nodeResultForBundle(
      normalizedProjectPath,
      reference,
      graphBundle,
      null,
      "unavailable"
    );
  }

  public async explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult> {
    const context = await this.requireGraph(projectPath);
    const edge = context.snapshot.edges.find((candidate) => candidate.id === edgeId);
    if (edge === undefined) {
      throw new SymbolLatticeError("EDGE_NOT_FOUND", `No graph edge matches "${edgeId}".`);
    }

    const source = context.snapshot.symbols.find((symbol) => symbol.id === edge.sourceId);
    if (source === undefined) {
      throw new SymbolLatticeError(
        "EDGE_NOT_FOUND",
        `Graph edge "${edgeId}" has no persisted source symbol.`
      );
    }

    return {
      status: context.status,
      edge,
      source,
      target:
        edge.targetId === null
          ? null
          : (context.snapshot.symbols.find((symbol) => symbol.id === edge.targetId) ?? null)
    };
  }

  private gitChangeSetRequest(
    options: GitAffectedTestsOptions
  ): Parameters<GitChangeSetProvider["getChangeSet"]>[1] {
    const baseRef = options.baseRef;
    if (baseRef === undefined) {
      return { mode: "working-tree" };
    }

    return { mode: "base", baseRef: this.requireGitBaseRef(baseRef) };
  }

  private gitHunksRequest(baseRef: string, options: GitHunksOptions): NormalizedGitHunksRequest {
    const limit = options.limit ?? DEFAULT_GIT_HUNK_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GIT_HUNK_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_GIT_HUNK_LIMIT",
        `Git hunk limit must be a whole number from 1 to ${MAX_GIT_HUNK_LIMIT}.`
      );
    }

    return {
      baseRef: this.requireGitBaseRef(baseRef),
      pathPrefix:
        options.pathPrefix === undefined
          ? undefined
          : this.normalizedProjectRelativePathPrefix(
              options.pathPrefix,
              "INVALID_GIT_HUNK_PATH_PREFIX",
              "Git hunk"
            ),
      limit
    };
  }

  private requireGitBaseRef(baseRef: unknown): string {
    if (
      typeof baseRef !== "string" ||
      baseRef.length === 0 ||
      baseRef !== baseRef.trim() ||
      baseRef.startsWith("-") ||
      /[\u0000-\u001F\u007F\s]/u.test(baseRef)
    ) {
      throw new SymbolLatticeError(
        "INVALID_GIT_BASE_REF",
        'Git base ref must be non-empty, contain no whitespace or control characters, and not begin with "-".'
      );
    }

    return baseRef;
  }

  private async readGitChangeSet(
    projectPath: string,
    request: Parameters<GitChangeSetProvider["getChangeSet"]>[1]
  ): Promise<GitChangeSet> {
    const provider = this.gitChangeSetProvider;
    if (provider === undefined) {
      throw new SymbolLatticeError(
        "GIT_CHANGE_SET_UNAVAILABLE",
        "Git change-set selection is unavailable because no GitChangeSetProvider is configured."
      );
    }

    try {
      return await provider.getChangeSet(projectPath, request);
    } catch (error) {
      if (!(error instanceof GitChangeSetError)) {
        throw error;
      }

      switch (error.code) {
        case "GIT_UNAVAILABLE":
          throw new SymbolLatticeError(
            "GIT_CHANGE_SET_UNAVAILABLE",
            `Git change-set selection is unavailable: ${error.message}`
          );
        case "INVALID_GIT_BASE":
          throw new SymbolLatticeError(
            "INVALID_GIT_BASE_REF",
            `Git base ref is invalid: ${error.message}`
          );
        case "MALFORMED_GIT_OUTPUT":
          throw new SymbolLatticeError(
            "GIT_CHANGE_SET_MALFORMED",
            `Git change-set output is malformed: ${error.message}`
          );
        case "GIT_CHANGE_SET_TOO_LARGE":
          throw new SymbolLatticeError(
            "INVALID_AFFECTED_FILES",
            `Git source selection exceeds the affected-test cap: ${error.message}`
          );
      }
    }
  }

  private async readGitRevisionHunks(
    projectPath: string,
    request: Parameters<GitRevisionHunkProvider["getRevisionHunks"]>[1]
  ): Promise<GitRevisionHunkSet> {
    const provider = this.gitRevisionHunkProvider;
    if (provider === undefined) {
      throw new SymbolLatticeError(
        "GIT_HUNKS_UNAVAILABLE",
        "Git hunk attribution is unavailable because no GitRevisionHunkProvider is configured."
      );
    }

    try {
      return await provider.getRevisionHunks(projectPath, request);
    } catch (error) {
      if (!(error instanceof GitChangeSetError)) {
        throw error;
      }

      switch (error.code) {
        case "GIT_UNAVAILABLE":
          throw new SymbolLatticeError(
            "GIT_HUNKS_UNAVAILABLE",
            `Git hunk attribution is unavailable: ${error.message}`
          );
        case "INVALID_GIT_BASE":
          throw new SymbolLatticeError(
            "INVALID_GIT_BASE_REF",
            `Git base ref is invalid: ${error.message}`
          );
        case "MALFORMED_GIT_OUTPUT":
          throw new SymbolLatticeError(
            "GIT_HUNKS_MALFORMED",
            `Git hunk output is malformed: ${error.message}`
          );
        case "GIT_CHANGE_SET_TOO_LARGE":
          throw new SymbolLatticeError(
            "INVALID_GIT_HUNK_FILES",
            `Git hunk source selection exceeds the ${MAX_GIT_HUNK_SOURCE_FILES}-path cap: ${error.message}`
          );
      }
    }
  }

  private requireGitHunkSetWithinBounds(hunkSet: GitRevisionHunkSet): void {
    if (
      hunkSet.changeSet.sourcePaths.length > MAX_GIT_HUNK_SOURCE_FILES ||
      hunkSet.files.length > MAX_GIT_HUNK_SOURCE_FILES
    ) {
      throw new SymbolLatticeError(
        "INVALID_GIT_HUNK_FILES",
        `Git hunk attribution is capped at ${MAX_GIT_HUNK_SOURCE_FILES} source paths.`
      );
    }
  }

  private extractGitRevisionSourceFacts(source: GitRevisionSource): ExtractedFileFacts | null {
    if (source.availability !== "available") {
      return null;
    }

    return this.artifactFactsExtractor({
      filePath: source.filePath,
      sourceText: source.sourceText,
      language: source.language
    });
  }

  private toGitHunkResultItem(
    file: GitRevisionHunkFile,
    hunk: GitUnifiedHunk,
    oldFacts: ExtractedFileFacts | null,
    newFacts: ExtractedFileFacts | null
  ): GitHunkResultItem {
    return {
      change: file.change,
      hunk,
      old: this.toGitHunkSideResult(file.previous, hunk.oldRange, oldFacts),
      new: this.toGitHunkSideResult(file.current, hunk.newRange, newFacts)
    };
  }

  private toGitHunkSideResult(
    source: GitRevisionSource,
    lineRange: GitLineRange,
    facts: ExtractedFileFacts | null
  ): GitHunkSideResult {
    if (source.availability !== "available") {
      return {
        revision: source.revision,
        path: source.filePath,
        sourceAvailability: source.availability,
        lineRange,
        attribution: "not-applicable",
        declarationAnchors: {
          identityScope: "revision-local",
          items: [],
          total: 0,
          truncated: false
        }
      };
    }

    if (facts === null) {
      throw new SymbolLatticeError(
        "GIT_HUNKS_MALFORMED",
        `Git hunk source ${source.filePath} was marked available without extracted immutable facts.`
      );
    }

    let attribution;
    try {
      attribution = attributeGitHunkSide({
        filePath: source.filePath,
        range: lineRange,
        symbols: facts.symbols,
        limit: MAX_GIT_HUNK_DECLARATION_ANCHORS
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new SymbolLatticeError(
          "GIT_HUNKS_MALFORMED",
          `Git hunk range for ${source.filePath} is malformed: ${error.message}`
        );
      }
      throw error;
    }

    return {
      revision: source.revision,
      path: source.filePath,
      sourceAvailability: source.availability,
      lineRange,
      attribution: attribution.state,
      declarationAnchors: {
        identityScope: "revision-local",
        items: attribution.items,
        total: attribution.total,
        truncated: attribution.truncated
      }
    };
  }

  private affectedTestsRequest(
    projectPath: string,
    filePaths: readonly string[],
    options: AffectedTestsOptions
  ): NormalizedAffectedTestsRequest {
    if (!Array.isArray(filePaths) || filePaths.length < 1 || filePaths.length > MAX_AFFECTED_CHANGED_FILES) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_FILES",
        `Affected-test analysis requires from 1 to ${MAX_AFFECTED_CHANGED_FILES} changed file paths.`
      );
    }

    const normalizedPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const filePath of filePaths) {
      if (typeof filePath !== "string" || filePath.length === 0) {
        throw new SymbolLatticeError(
          "INVALID_AFFECTED_FILES",
          "Every affected-test input must be a non-empty file path."
        );
      }

      const normalizedPath = this.normalizeAffectedFilePath(projectPath, filePath);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        normalizedPaths.push(normalizedPath);
      }
    }

    const maxDepth = options.maxDepth ?? DEFAULT_AFFECTED_MAX_DEPTH;
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_AFFECTED_MAX_DEPTH) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_DEPTH",
        `Affected-test depth must be a whole number from 1 to ${MAX_AFFECTED_MAX_DEPTH}.`
      );
    }

    const limit = options.limit ?? DEFAULT_AFFECTED_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_AFFECTED_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_LIMIT",
        `Affected-test limit must be a whole number from 1 to ${MAX_AFFECTED_LIMIT}.`
      );
    }

    const testSelection = this.affectedTestSelection(options.testPattern);

    return {
      filePaths: normalizedPaths,
      ...testSelection,
      bounds: {
        maxChangedFiles: MAX_AFFECTED_CHANGED_FILES,
        maxDepth,
        limit,
        maxVisitedFilesPerInput: AFFECTED_MAX_VISITED_FILES_PER_INPUT,
        edgeKinds: AFFECTED_TEST_EDGE_KINDS,
        resolution: "exact"
      }
    };
  }

  private affectedTestSelection(testPattern: string | undefined): NormalizedAffectedTestSelection {
    const normalizedPattern = testPattern === undefined
      ? undefined
      : this.normalizedProjectFilePattern(
          testPattern,
          "INVALID_AFFECTED_TEST_PATTERN",
          "Affected-test"
        );
    if (normalizedPattern === undefined) {
      return {
        testSelection: { mode: "conventional", pattern: null },
        testClassifier: classifyTestFile
      };
    }

    const matchesPattern = createProjectFileGlobMatcher(normalizedPattern);
    return {
      testSelection: { mode: "glob", pattern: normalizedPattern },
      testClassifier: (filePath) => matchesPattern(filePath) ? "custom-pattern" : null
    };
  }

  private normalizeAffectedFilePath(projectPath: string, filePath: string): string {
    // Paths from Git's NUL-delimited output are exact filenames. Do not trim
    // whitespace or rewrite literal POSIX backslashes before resolving them.
    const absolutePath = isAbsolute(filePath) ? resolve(filePath) : resolve(projectPath, filePath);
    const relativePath = relative(projectPath, absolutePath).split(sep).join("/");
    if (
      relativePath.length === 0 ||
      relativePath === ".." ||
      relativePath.startsWith("../") ||
      isAbsolute(relativePath)
    ) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_FILES",
        `Affected-test path "${filePath}" must stay inside ${projectPath}.`
      );
    }

    return relativePath;
  }

  private normalizedImpactOptions(
    maxDepthOrOptions: number | ImpactOptions
  ): NormalizedImpactOptions {
    const options =
      typeof maxDepthOrOptions === "number"
        ? { maxDepth: maxDepthOrOptions }
        : maxDepthOrOptions;
    const maxDepth = options?.maxDepth ?? 1;
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
      throw new SymbolLatticeError(
        "INVALID_IMPACT_DEPTH",
        "Impact depth must be a positive whole number."
      );
    }

    const limit = options?.limit;
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_IMPACT_LIMIT)) {
      throw new SymbolLatticeError(
        "INVALID_IMPACT_LIMIT",
        `Impact limit must be a whole number from 1 to ${MAX_IMPACT_LIMIT}.`
      );
    }

    return { maxDepth, limit };
  }

  private contextRequest(references: readonly string[], options: ContextOptions): ContextRequest {
    if (!Array.isArray(references) || references.length < 1 || references.length > MAX_CONTEXT_REFERENCES) {
      throw new SymbolLatticeError(
        "INVALID_CONTEXT_REFERENCES",
        `Context requires from 1 to ${MAX_CONTEXT_REFERENCES} symbol references.`
      );
    }

    const normalizedReferences = references.map((reference) => {
      if (typeof reference !== "string" || reference.trim().length === 0) {
        throw new SymbolLatticeError(
          "INVALID_CONTEXT_REFERENCES",
          "Every context reference must be non-empty text."
        );
      }
      return reference.trim();
    });

    return {
      references: normalizedReferences,
      bounds: this.contextBounds(options)
    };
  }

  private investigateRequest(query: string, options: InvestigateOptions): InvestigateRequest {
    const search = this.sourceSearchRequest(query, {
      limit: options.searchLimit ?? DEFAULT_INVESTIGATE_SEARCH_LIMIT,
      ...(options.pathPrefix === undefined ? {} : { pathPrefix: options.pathPrefix }),
      ...(options.language === undefined ? {} : { language: options.language })
    });
    const symbolLimit = options.symbolLimit ?? DEFAULT_INVESTIGATE_SYMBOL_LIMIT;
    if (
      !Number.isSafeInteger(symbolLimit) ||
      symbolLimit < 1 ||
      symbolLimit > MAX_INVESTIGATE_SYMBOL_LIMIT
    ) {
      throw new SymbolLatticeError(
        "INVALID_INVESTIGATE_SYMBOL_LIMIT",
        `Investigate symbol limit must be a whole number from 1 to ${MAX_INVESTIGATE_SYMBOL_LIMIT}.`
      );
    }

    const ranking = options.ranking ?? DEFAULT_INVESTIGATE_RANKING_STRATEGY;
    if (
      typeof ranking !== "string" ||
      !INVESTIGATE_RANKING_STRATEGIES.includes(ranking as InvestigateRankingStrategy)
    ) {
      throw new SymbolLatticeError(
        "INVALID_INVESTIGATE_RANKING",
        `Investigate ranking must be one of: ${INVESTIGATE_RANKING_STRATEGIES.join(", ")}.`
      );
    }

    const sourceCharacterBudget =
      options.sourceCharacterBudget ?? DEFAULT_INVESTIGATION_SOURCE_CHARACTER_BUDGET;
    if (
      !Number.isSafeInteger(sourceCharacterBudget) ||
      sourceCharacterBudget < MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET ||
      sourceCharacterBudget > MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET
    ) {
      throw new SymbolLatticeError(
        "INVALID_INVESTIGATE_SOURCE_CHARACTER_BUDGET",
        `Investigate source character budget must be a whole number from ${MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET} to ${MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET}.`
      );
    }

    const sourceRenderMode = options.sourceRenderMode ?? "adaptive";
    if (
      typeof sourceRenderMode !== "string" ||
      !INVESTIGATE_SOURCE_RENDER_MODES.includes(sourceRenderMode as InvestigateSourceRenderMode)
    ) {
      throw new SymbolLatticeError(
        "INVALID_INVESTIGATE_SOURCE_RENDER_MODE",
        `Investigate source render mode must be one of: ${INVESTIGATE_SOURCE_RENDER_MODES.join(", ")}.`
      );
    }

    return {
      search,
      symbolLimit,
      ranking,
      sourceCharacterBudget,
      sourceRenderMode: sourceRenderMode as InvestigateSourceRenderMode,
      contextBounds: this.contextBounds(options)
    };
  }

  private contextBounds(options: ContextOptions): ContextBounds {
    return {
      maxReferences: MAX_CONTEXT_REFERENCES,
      matchCandidateLimit: CONTEXT_MATCH_CANDIDATE_LIMIT,
      relationLimit: this.boundedContextOption(
        options.relationLimit,
        DEFAULT_CONTEXT_RELATION_LIMIT,
        MAX_CONTEXT_RELATION_LIMIT,
        "INVALID_CONTEXT_RELATION_LIMIT",
        "Context relation limit"
      ),
      maxHops: this.boundedContextOption(
        options.maxHops,
        DEFAULT_CONTEXT_MAX_HOPS,
        MAX_CONTEXT_MAX_HOPS,
        "INVALID_CONTEXT_MAX_HOPS",
        "Context maximum hops"
      ),
      maxVisitedSymbolsPerPath: CONTEXT_MAX_VISITED_SYMBOLS,
      impactDepth: this.boundedContextOption(
        options.impactDepth,
        DEFAULT_CONTEXT_IMPACT_DEPTH,
        MAX_CONTEXT_IMPACT_DEPTH,
        "INVALID_CONTEXT_IMPACT_DEPTH",
        "Context impact depth"
      ),
      impactLimit: this.boundedContextOption(
        options.impactLimit,
        DEFAULT_CONTEXT_IMPACT_LIMIT,
        MAX_CONTEXT_IMPACT_LIMIT,
        "INVALID_CONTEXT_IMPACT_LIMIT",
        "Context impact limit"
      ),
      source: {
        totalCharacterBudget: this.contextSourceCharacterBudget(options.sourceCharacterBudget),
        minimumTotalCharacterBudget: MIN_CONTEXT_SOURCE_CHARACTER_BUDGET,
        maximumTotalCharacterBudget: MAX_CONTEXT_SOURCE_CHARACTER_BUDGET,
        minimumPerReference: CONTEXT_SOURCE_MINIMUM_PER_REFERENCE,
        allocationPolicy: CONTEXT_SOURCE_ALLOCATION_POLICY
      }
    };
  }

  private contextSourceCharacterBudget(value: number | undefined): number {
    const normalized = value ?? DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET;
    if (
      !Number.isSafeInteger(normalized) ||
      normalized < MIN_CONTEXT_SOURCE_CHARACTER_BUDGET ||
      normalized > MAX_CONTEXT_SOURCE_CHARACTER_BUDGET
    ) {
      throw new SymbolLatticeError(
        "INVALID_CONTEXT_SOURCE_CHARACTER_BUDGET",
        `Context source character budget must be a whole number from ${MIN_CONTEXT_SOURCE_CHARACTER_BUDGET} to ${MAX_CONTEXT_SOURCE_CHARACTER_BUDGET}.`
      );
    }
    return normalized;
  }

  private boundedContextOption(
    value: number | undefined,
    fallback: number,
    maximum: number,
    code:
      | "INVALID_CONTEXT_RELATION_LIMIT"
      | "INVALID_CONTEXT_MAX_HOPS"
      | "INVALID_CONTEXT_IMPACT_DEPTH"
      | "INVALID_CONTEXT_IMPACT_LIMIT",
    label: string
  ): number {
    const normalized = value ?? fallback;
    if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
      throw new SymbolLatticeError(
        code,
        `${label} must be a whole number from 1 to ${maximum}.`
      );
    }
    return normalized;
  }

  private getContextRead(
    projectPath: string,
    initialBundle: ActiveGraphBundle,
    references: readonly string[]
  ): ContextRead {
    const initialMatches = references.map((reference) => matchSymbol(initialBundle.snapshot, reference));
    const getActiveSourceDocumentsBundle = this.graphStore.getActiveSourceDocumentsBundle;
    let requestedFilePaths = this.contextSourceFilePaths(initialMatches);
    if (typeof getActiveSourceDocumentsBundle !== "function" || requestedFilePaths.length === 0) {
      return {
        bundle: initialBundle,
        matches: initialMatches,
        documentsByFilePath: new Map()
      };
    }

    // A source-document bundle is an authoritative graph-and-source snapshot.
    // If an intervening sync moves any exact symbol, retry once for those newly
    // resolved paths rather than combining paths from two generations.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceBundle = getActiveSourceDocumentsBundle.call(
        this.graphStore,
        projectPath,
        requestedFilePaths
      );
      const read = this.contextReadForSourceBundle(sourceBundle, references);
      const currentFilePaths = this.contextSourceFilePaths(read.matches);
      const hasAllCurrentDocuments = currentFilePaths.every((filePath) =>
        read.documentsByFilePath.has(filePath)
      );
      const sourceProjectionAvailable =
        sourceBundle.sourceSearchVersion !== null && sourceBundle.sourceSearchVersion !== undefined;

      if (
        !sourceProjectionAvailable ||
        hasAllCurrentDocuments ||
        attempt === 1 ||
        this.sameFilePaths(requestedFilePaths, currentFilePaths)
      ) {
        return read;
      }

      requestedFilePaths = currentFilePaths;
    }

    throw new Error("Context source-document retry loop must return a snapshot.");
  }

  private contextReadForSourceBundle(
    bundle: ActiveSourceDocumentsBundle,
    references: readonly string[]
  ): ContextRead {
    return {
      bundle,
      matches: references.map((reference) => matchSymbol(bundle.snapshot, reference)),
      documentsByFilePath: new Map(bundle.documents.map((document) => [document.filePath, document]))
    };
  }

  private contextSourceFilePaths(matches: readonly SymbolMatch[]): readonly string[] {
    const filePaths: string[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      if (match.status !== "exact" || seen.has(match.symbol.filePath)) {
        continue;
      }
      seen.add(match.symbol.filePath);
      filePaths.push(match.symbol.filePath);
    }
    return filePaths;
  }

  private sameFilePaths(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((filePath, index) => filePath === right[index]);
  }

  private symbolContextPack(read: ContextRead, bounds: ContextBounds): SymbolContextPack {
    const drafts = new Map<number, ContextSourceDraft>();
    const sourceProjectionAvailable =
      read.bundle.sourceSearchVersion !== null && read.bundle.sourceSearchVersion !== undefined;
    if (sourceProjectionAvailable) {
      for (const [referenceIndex, match] of read.matches.entries()) {
        if (match.status !== "exact") continue;
        const document = read.documentsByFilePath.get(match.symbol.filePath);
        if (document === undefined) continue;
        const draft = contextSourceDraftFromPersistedText({
          referenceIndex,
          reference: match.reference,
          filePath: document.filePath,
          sourceText: document.sourceText,
          centerLine: match.symbol.range.start.line
        });
        if (draft !== null) drafts.set(referenceIndex, draft);
      }
    }

    const reservation = allocateContextSource({
      characterBudget: bounds.source.totalCharacterBudget,
      referenceCount: read.matches.length,
      candidates: [...drafts.values()].map((draft) => ({
        referenceIndex: draft.referenceIndex,
        reference: draft.reference,
        filePath: draft.filePath,
        requestedCharacters: draft.endOffset - draft.startOffset
      }))
    });
    const sources = new Map<number, DeliveredSourceExcerpt>();
    for (const allocation of reservation.contexts) {
      const draft = drafts.get(allocation.referenceIndex);
      if (draft === undefined) continue;
      const source = renderContextSource(draft, allocation.allocatedCharacters);
      if (source !== null) sources.set(allocation.referenceIndex, source);
    }
    const allocationContexts = reservation.contexts.map((allocation) => {
      const emittedCharacters = sources.get(allocation.referenceIndex)?.emittedCharacters ?? 0;
      return {
        ...allocation,
        emittedCharacters,
        reservedButNotEmittedCharacters: allocation.allocatedCharacters - emittedCharacters
      };
    });
    const emittedCharacters = allocationContexts.reduce(
      (total, allocation) => total + allocation.emittedCharacters,
      0
    );
    const allocation: ContextSourceAllocationResult = {
      ...reservation,
      summary: {
        ...reservation.summary,
        emittedCharacters,
        reservedButNotEmittedCharacters:
          reservation.summary.allocatedCharacters - emittedCharacters
      },
      contexts: allocationContexts
    };
    return {
      contexts: read.matches.map((match, referenceIndex) =>
        this.toSymbolContext(
          match.reference,
          match,
          read,
          bounds,
          sources.get(referenceIndex) ?? null
        )
      ),
      allocation
    };
  }

  private toSymbolContext(
    reference: string,
    match: SymbolMatch,
    read: ContextRead,
    bounds: ContextBounds,
    source: DeliveredSourceExcerpt | null
  ): SymbolContext {
    const boundedMatch = this.boundedContextMatch(match, bounds.matchCandidateLimit);
    if (match.status !== "exact") {
      return {
        reference,
        match: boundedMatch.match,
        matchCandidatesTruncated: boundedMatch.truncated,
        sourceAvailability: "not-applicable",
        source: null,
        callers: { items: [], truncated: false },
        callees: { items: [], truncated: false },
        impact: { paths: [], truncated: false }
      };
    }

    const callers = getCallers(read.bundle.snapshot, match.symbol.id);
    const callees = getCallees(read.bundle.snapshot, match.symbol.id);
    const impact = getImpactPaths(read.bundle.snapshot, match.symbol.id, bounds.impactDepth);

    return {
      reference,
      match: boundedMatch.match,
      matchCandidatesTruncated: boundedMatch.truncated,
      sourceAvailability: source === null ? "unavailable" : "active-generation",
      source,
      callers: this.boundedItems(callers, bounds.relationLimit),
      callees: this.boundedItems(callees, bounds.relationLimit),
      impact: this.boundedImpact(impact, bounds.impactLimit)
    };
  }

  private boundedContextMatch(
    match: SymbolMatch,
    limit: number
  ): { readonly match: SymbolMatch; readonly truncated: boolean } {
    if (match.candidates.length <= limit || match.status !== "ambiguous") {
      return { match, truncated: false };
    }

    return {
      match: { ...match, candidates: match.candidates.slice(0, limit) },
      truncated: true
    };
  }

  private boundedItems<T>(items: readonly T[], limit: number): { readonly items: readonly T[]; readonly truncated: boolean } {
    return {
      items: items.slice(0, limit),
      truncated: items.length > limit
    };
  }

  private boundedImpact(
    paths: readonly ImpactPath[],
    limit: number
  ): { readonly paths: readonly ImpactPath[]; readonly truncated: boolean } {
    const bounded = this.boundedItems(paths, limit);
    return { paths: bounded.items, truncated: bounded.truncated };
  }

  private contextEvidencePaths(
    matches: readonly SymbolMatch[],
    bundle: ActiveGraphBundle,
    bounds: ContextBounds
  ): readonly ContextEvidencePath[] {
    const paths: ContextEvidencePath[] = [];
    for (let index = 1; index < matches.length; index += 1) {
      const from = matches[index - 1];
      const to = matches[index];
      if (from === undefined || to === undefined) {
        continue;
      }

      if (from.status !== "exact" || to.status !== "exact") {
        paths.push({
          fromReference: from.reference,
          toReference: to.reference,
          status: "not-applicable",
          path: null
        });
        continue;
      }

      const evidence = findEvidencePath(
        bundle.snapshot,
        from.symbol.id,
        to.symbol.id,
        bounds.maxHops,
        bounds.maxVisitedSymbolsPerPath
      );
      paths.push({
        fromReference: from.reference,
        toReference: to.reference,
        status:
          evidence.path === null
            ? evidence.truncated
              ? "truncated"
              : "no-path"
            : from.symbol.id === to.symbol.id
              ? "same-symbol"
              : "path",
        path: evidence.path
      });
    }
    return paths;
  }

  private sourceSearchRequest(query: string, options: SearchOptions): NormalizedSourceSearchRequest {
    if (typeof query !== "string") {
      throw new SymbolLatticeError(
        "INVALID_SEARCH_QUERY",
        "Search query must be text containing at least one lexical term."
      );
    }
    const terms = sourceSearchTerms(query);
    if (terms.length === 0) {
      throw new SymbolLatticeError(
        "INVALID_SEARCH_QUERY",
        "Search query must contain at least one letter, number, or underscore term."
      );
    }

    const limit = options.limit ?? DEFAULT_SOURCE_SEARCH_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SOURCE_SEARCH_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_SEARCH_LIMIT",
        `Search limit must be a whole number from 1 to ${MAX_SOURCE_SEARCH_LIMIT}.`
      );
    }

    const language = options.language;
    if (language !== undefined && !ARTIFACT_LANGUAGES.includes(language)) {
      throw new SymbolLatticeError(
        "INVALID_SEARCH_LANGUAGE",
        `Search language must be one of: ${ARTIFACT_LANGUAGES.join(", ")}.`
      );
    }

    const pathPrefix =
      options.pathPrefix === undefined
        ? undefined
        : this.normalizedSearchPathPrefix(options.pathPrefix);
    const candidateLimit = Math.min(
      MAX_SOURCE_SEARCH_LIMIT,
      limit * SOURCE_SEARCH_GENERATED_CANDIDATE_MULTIPLIER
    );
    return {
      query,
      terms,
      limit: candidateLimit,
      requestedLimit: limit,
      candidateLimit,
      ...(pathPrefix === undefined ? {} : { pathPrefix }),
      ...(language === undefined ? {} : { language })
    };
  }

  private filesRequest(options: FilesOptions): NormalizedFilesRequest {
    const limit = options.limit ?? DEFAULT_FILE_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_FILE_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_FILE_LIMIT",
        `File limit must be a whole number from 1 to ${MAX_FILE_LIMIT}.`
      );
    }

    const language = options.language;
    if (language !== undefined && !ARTIFACT_LANGUAGES.includes(language)) {
      throw new SymbolLatticeError(
        "INVALID_FILE_LANGUAGE",
        `File language must be one of: ${ARTIFACT_LANGUAGES.join(", ")}.`
      );
    }

    const pathPrefix =
      options.pathPrefix === undefined
        ? undefined
        : this.normalizedProjectRelativePathPrefix(
            options.pathPrefix,
            "INVALID_FILE_PATH_PREFIX",
            "File"
          );
    const format = options.format ?? "flat";
    if (!FILE_FORMATS.includes(format)) {
      throw new SymbolLatticeError(
        "INVALID_FILE_FORMAT",
        `File format must be one of: ${FILE_FORMATS.join(", ")}.`
      );
    }

    const pattern = options.pattern === undefined
      ? undefined
      : this.normalizedProjectFilePattern(options.pattern, "INVALID_FILE_PATTERN", "File");
    const maxDepth = options.maxDepth;
    if (
      maxDepth !== undefined &&
      (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_FILE_TREE_DEPTH)
    ) {
      throw new SymbolLatticeError(
        "INVALID_FILE_MAX_DEPTH",
        `File tree max depth must be a whole number from 1 to ${MAX_FILE_TREE_DEPTH}.`
      );
    }
    if (maxDepth !== undefined && format !== "tree") {
      throw new SymbolLatticeError(
        "INVALID_FILE_MAX_DEPTH",
        "File max depth is accepted only when format is tree."
      );
    }
    const cursor = options.cursor;
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length === 0 || cursor.length > MAX_FILE_CURSOR_LENGTH || cursor !== cursor.trim())
    ) {
      throw new SymbolLatticeError(
        "INVALID_FILE_CURSOR",
        `File cursor must be a non-empty opaque token of at most ${MAX_FILE_CURSOR_LENGTH} characters.`
      );
    }
    return {
      limit,
      format,
      ...(pathPrefix === undefined ? {} : { pathPrefix }),
      ...(language === undefined ? {} : { language }),
      ...(pattern === undefined ? {} : { pattern }),
      ...(maxDepth === undefined ? {} : { maxDepth }),
      ...(cursor === undefined ? {} : { cursor })
    };
  }

  private normalizedProjectFilePattern(
    pattern: string,
    code: "INVALID_FILE_PATTERN" | "INVALID_AFFECTED_TEST_PATTERN",
    label: "File" | "Affected-test"
  ): string {
    if (typeof pattern !== "string") {
      throw new SymbolLatticeError(code, `${label} pattern must be a project-relative glob.`);
    }
    const normalized = pattern.trim().replaceAll("\\", "/");
    const projectPattern = normalized.replace(/^(?:\.\/)+/, "");
    if (
      projectPattern.length === 0 ||
      projectPattern.length > MAX_FILE_PATTERN_LENGTH ||
      projectPattern.includes("\0") ||
      isAbsolute(pattern) ||
      projectPattern.startsWith("/") ||
      /^[A-Za-z]:/.test(projectPattern) ||
      projectPattern.split("/").includes("..")
    ) {
      throw new SymbolLatticeError(
        code,
        `${label} pattern must be a bounded project-relative glob: ${pattern}`
      );
    }
    return projectPattern;
  }

  private routesRequest(options: RoutesOptions): NormalizedRoutesRequest {
    const limit = options.limit ?? DEFAULT_ROUTE_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ROUTE_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_ROUTE_LIMIT",
        `Route limit must be a whole number from 1 to ${MAX_ROUTE_LIMIT}.`
      );
    }

    const method = options.method;
    if (
      method !== undefined &&
      (typeof method !== "string" || !ROUTE_METHODS.includes(method as RouteMethod))
    ) {
      throw new SymbolLatticeError(
        "INVALID_ROUTE_METHOD",
        `Route method must be one of: ${ROUTE_METHODS.join(", ")}.`
      );
    }

    const pathPrefix = options.pathPrefix;
    if (
      pathPrefix !== undefined &&
      (typeof pathPrefix !== "string" || pathPrefix.length === 0 || !pathPrefix.startsWith("/"))
    ) {
      throw new SymbolLatticeError(
        "INVALID_ROUTE_PATH_PREFIX",
        "Route path prefix must be non-empty text beginning with '/'."
      );
    }

    const domain = options.domain;
    if (
      domain !== undefined &&
      (typeof domain !== "string" || domain.length === 0 || domain !== domain.trim())
    ) {
      throw new SymbolLatticeError(
        "INVALID_ROUTE_DOMAIN",
        "Route domain must be non-empty text without surrounding whitespace."
      );
    }

    return {
      limit,
      ...(method === undefined ? {} : { method }),
      ...(pathPrefix === undefined ? {} : { pathPrefix }),
      ...(domain === undefined ? {} : { domain })
    };
  }

  private entrypointsRequest(options: EntrypointsOptions): NormalizedEntrypointsRequest {
    const limit = options.limit ?? DEFAULT_ENTRYPOINT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ENTRYPOINT_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_ENTRYPOINT_LIMIT",
        `Entrypoint limit must be a whole number from 1 to ${MAX_ENTRYPOINT_LIMIT}.`
      );
    }

    const transport = options.transport;
    if (
      transport !== undefined &&
      (typeof transport !== "string" || !ENTRYPOINT_TRANSPORTS.includes(transport as EntryPointTransport))
    ) {
      throw new SymbolLatticeError(
        "INVALID_ENTRYPOINT_TRANSPORT",
        `Entrypoint transport must be one of: ${ENTRYPOINT_TRANSPORTS.join(", ")}.`
      );
    }

    const operation = options.operation;
    if (
      operation !== undefined &&
      (typeof operation !== "string" || !ENTRYPOINT_OPERATIONS.includes(operation as EntryPointOperation))
    ) {
      throw new SymbolLatticeError(
        "INVALID_ENTRYPOINT_OPERATION",
        `Entrypoint operation must be one of: ${ENTRYPOINT_OPERATIONS.join(", ")}.`
      );
    }

    const namePrefix = options.namePrefix;
    if (
      namePrefix !== undefined &&
      (typeof namePrefix !== "string" || namePrefix.length === 0)
    ) {
      throw new SymbolLatticeError(
        "INVALID_ENTRYPOINT_NAME_PREFIX",
        "Entrypoint name prefix must be non-empty text."
      );
    }

    return {
      limit,
      ...(transport === undefined ? {} : { transport }),
      ...(operation === undefined ? {} : { operation }),
      ...(namePrefix === undefined ? {} : { namePrefix })
    };
  }

  private hierarchyRequest(options: HierarchyOptions): NormalizedHierarchyRequest {
    const limit = options.limit ?? DEFAULT_HIERARCHY_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HIERARCHY_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_HIERARCHY_LIMIT",
        `Hierarchy limit must be a whole number from 1 to ${MAX_HIERARCHY_LIMIT}.`
      );
    }

    return { limit };
  }

  private normalizedSearchPathPrefix(pathPrefix: string): string | undefined {
    return this.normalizedProjectRelativePathPrefix(
      pathPrefix,
      "INVALID_SEARCH_PATH_PREFIX",
      "Search"
    );
  }

  private normalizedProjectRelativePathPrefix(
    pathPrefix: string,
    code:
      | "INVALID_SEARCH_PATH_PREFIX"
      | "INVALID_FILE_PATH_PREFIX"
      | "INVALID_FILE_VIEW_PATH"
      | "INVALID_GIT_AFFECTED_PATH_PREFIX"
      | "INVALID_GIT_HUNK_PATH_PREFIX",
    label: "Search" | "File" | "File view" | "Git affected" | "Git hunk"
  ): string | undefined {
    if (typeof pathPrefix !== "string") {
      throw new SymbolLatticeError(
        code,
        `${label} path prefix must be a project-relative path.`
      );
    }

    const normalized = pathPrefix.trim().replaceAll("\\", "/");
    if (normalized === ".") {
      return undefined;
    }
    if (
      normalized.length === 0 ||
      normalized.includes("\0") ||
      isAbsolute(pathPrefix) ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:/.test(normalized)
    ) {
      throw new SymbolLatticeError(
        code,
        `${label} path prefix must stay project-relative: ${pathPrefix}`
      );
    }

    const parts: string[] = [];
    for (const part of normalized.split("/")) {
      if (part === "" || part === ".") {
        continue;
      }
      if (part === "..") {
        throw new SymbolLatticeError(
          code,
          `${label} path prefix must not traverse outside the project: ${pathPrefix}`
        );
      }
      parts.push(part);
    }
    if (parts.length === 0) {
      return undefined;
    }
    return parts.join("/");
  }

  private toSourceSearchHitResult(
    hit: IndexedSourceSearchHit,
    retrievalRank: number,
    finalRank: number,
    generated: SourceSearchHitResult["generated"],
    ranking: import("./generated-ranking.js").GeneratedRankSignal,
    terms: readonly string[],
    snapshot: GraphSnapshot
  ): SourceSearchHitResult {
    const lexicalMatch = persistedLexicalMatch(hit.filePath, hit.sourceText, terms);
    const symbolCandidates = snapshot.symbols
      .filter(
        (symbol) =>
          symbol.kind !== "file" &&
          symbol.filePath === hit.filePath &&
          rangesOverlap(symbol.range, lexicalMatch.range)
      )
      .sort(compareSymbolCandidates);

    return {
      rank: finalRank,
      filePath: hit.filePath,
      language: hit.language,
      range: lexicalMatch.range,
      excerpt: lexicalMatch.excerpt,
      matchingTerms: lexicalMatch.matchingTerms,
      lexicalReason: lexicalReason(terms, lexicalMatch.matchingTerms),
      symbolCandidates,
      generated,
      ranking: {
        retrievalRank,
        finalRank,
        generatedPenalty: ranking.generatedPenalty,
        reason: ranking.reason
      }
    };
  }

  private investigationSelection(
    searchResults: readonly SourceSearchHitResult[],
    snapshot: GraphSnapshot,
    symbolLimit: number,
    ranking: InvestigateRankingStrategy
  ): InvestigationSelectionResult {
    const candidates: Array<
      Omit<InvestigationCandidate, "structuralSignals" | "topologySignals" | "impactSignals">
    > = [];
    const selectedSymbolIds = new Set<string>();

    for (const sourceResult of searchResults) {
      for (const [candidateIndex, symbol] of sourceResult.symbolCandidates.entries()) {
        if (selectedSymbolIds.has(symbol.id)) {
          continue;
        }
        selectedSymbolIds.add(symbol.id);
        const baseRank = candidates.length + 1;
        candidates.push({
          sourceRank: sourceResult.rank,
          candidateRank: candidateIndex + 1,
          lexicalFocus: {
            language: sourceResult.language,
            range: sourceResult.range,
            matchingTerms: [...sourceResult.matchingTerms]
          },
          symbol,
          generatedRanking: {
            itemId: symbol.id,
            filePath: symbol.filePath,
            generated: sourceResult.generated,
            baseRank,
            finalRank: baseRank,
            generatedPenalty: sourceResult.ranking.generatedPenalty,
            reason: sourceResult.ranking.reason
          }
        });
      }
    }

    const structuralSignalsBySymbolId = this.investigationStructuralSignals(snapshot, selectedSymbolIds);
    const impactSignalsBySymbolId =
      ranking === "impact"
        ? this.investigationImpactSignals(snapshot, selectedSymbolIds)
        : null;
    const topologySignalsBySymbolId =
      ranking === "topology"
        ? this.investigationTopologySignals(snapshot, candidates)
        : null;
    const ranked = candidates
      .map((candidate): InvestigationCandidate => ({
        ...candidate,
        structuralSignals: structuralSignalsBySymbolId.get(candidate.symbol.id) ?? {
          directExactCallerCount: 0,
          directExactCalleeCount: 0,
          isExported: candidate.symbol.isExported,
          score: candidate.symbol.isExported ? 1 : 0
        },
        topologySignals: topologySignalsBySymbolId?.get(candidate.symbol.id) ?? null,
        impactSignals: impactSignalsBySymbolId?.get(candidate.symbol.id) ?? null
      }))
      .sort((left, right) => this.compareInvestigationCandidates(left, right, ranking));
    const items = ranked.slice(0, symbolLimit).map((candidate, index): InvestigationSelection => ({
      selectionRank: index + 1,
      sourceRank: candidate.sourceRank,
      candidateRank: candidate.candidateRank,
      structuralSignals: candidate.structuralSignals,
      topologySignals: candidate.topologySignals,
      impactSignals: candidate.impactSignals,
      lexicalFocus: candidate.lexicalFocus,
      generatedRanking: { ...candidate.generatedRanking, finalRank: index + 1 },
      symbol: candidate.symbol
    }));

    return { items, total: candidates.length, truncated: candidates.length > symbolLimit };
  }

  /**
   * Counts only direct, exactly resolved call/reference/route/handler edges in
   * one active snapshot. The result is a disclosed signal, not semantic or
   * dynamic-dispatch inference.
   */
  private investigationStructuralSignals(
    snapshot: GraphSnapshot,
    candidateIds: ReadonlySet<string>
  ): ReadonlyMap<string, InvestigationStructuralSignals> {
    const counts = new Map<string, { callerCount: number; calleeCount: number }>();
    for (const candidateId of candidateIds) {
      counts.set(candidateId, { callerCount: 0, calleeCount: 0 });
    }

    for (const edge of snapshot.edges) {
      const isDirectStructuralEdge =
        edge.kind === "calls" ||
        edge.kind === "references" ||
        edge.kind === "routes" ||
        edge.kind === "handles";
      if (!isDirectStructuralEdge || edge.resolution !== "exact") {
        continue;
      }

      if (edge.targetId !== null) {
        const target = counts.get(edge.targetId);
        if (target !== undefined) {
          target.callerCount += 1;
        }
      }
      const source = counts.get(edge.sourceId);
      if (source !== undefined) {
        source.calleeCount += 1;
      }
    }

    const symbolsById = new Map(snapshot.symbols.map((symbol) => [symbol.id, symbol]));
    return new Map(
      [...counts].map(([symbolId, count]) => {
        const isExported = symbolsById.get(symbolId)?.isExported ?? false;
        return [
          symbolId,
          {
            directExactCallerCount: count.callerCount,
            directExactCalleeCount: count.calleeCount,
            isExported,
            score: count.callerCount + count.calleeCount + (isExported ? 1 : 0)
          }
        ];
      })
    );
  }

  /**
   * Scores only shortest paths through exactly resolved static dependents.
   * The bounded score intentionally never incorporates lexical rank, runtime
   * guesses, semantic similarity, or heuristic edges.
   */
  private investigationImpactSignals(
    snapshot: GraphSnapshot,
    candidateIds: ReadonlySet<string>
  ): ReadonlyMap<string, InvestigationImpactSignals> {
    const maxDepth = INVESTIGATE_IMPACT_RANKING_MAX_DEPTH;
    const pathLimit = INVESTIGATE_IMPACT_RANKING_PATH_LIMIT;

    return new Map(
      [...candidateIds]
        .sort(compareText)
        .map((symbolId): readonly [string, InvestigationImpactSignals] => {
          const traversal = getBoundedExactImpactPaths(snapshot, symbolId, {
            maxDepth,
            maxResults: pathLimit
          });
          const pathCountsByDepth: Array<{ depth: number; count: number }> = Array.from(
            { length: maxDepth },
            (_, index) => ({ depth: index + 1, count: 0 })
          );
          const finalEdgeCounts = new Map(
            DEFAULT_EXACT_IMPACT_EDGE_KINDS.map((kind) => [kind, 0])
          );

          for (const path of traversal.paths) {
            const depthCount = pathCountsByDepth[path.edges.length - 1];
            if (depthCount !== undefined) {
              depthCount.count += 1;
            }
            const finalEdge = path.edges.at(-1);
            if (finalEdge !== undefined) {
              const exactImpactKind = DEFAULT_EXACT_IMPACT_EDGE_KINDS.find(
                (kind) => kind === finalEdge.kind
              );
              if (exactImpactKind === undefined) {
                continue;
              }
              finalEdgeCounts.set(
                exactImpactKind,
                (finalEdgeCounts.get(exactImpactKind) ?? 0) + 1
              );
            }
          }

          const directExactDependentCount = pathCountsByDepth[0]?.count ?? 0;
          const exactDependentCount = traversal.paths.length;
          return [
            symbolId,
            {
              maxDepth,
              pathLimit,
              exactDependentCount,
              directExactDependentCount,
              multiHopExactDependentCount: exactDependentCount - directExactDependentCount,
              pathCountsByDepth,
              finalEdgeKindCounts: DEFAULT_EXACT_IMPACT_EDGE_KINDS.map((kind) => ({
                kind,
                count: finalEdgeCounts.get(kind) ?? 0
              })),
              score: pathCountsByDepth.reduce(
                (total, item) => total + item.count * (maxDepth - item.depth + 1),
                0
              ),
              truncated: traversal.resultLimitReached
            }
          ];
        })
    );
  }

  /**
   * Scores lexical candidates through a bounded local topology constructed
   * from exact static edges in both directions. The graph helper removes each
   * seed's direct restart mass from the score, so this is a connectivity signal
   * rather than a reward merely for matching the persisted source text.
   */
  private investigationTopologySignals(
    snapshot: GraphSnapshot,
    candidates: readonly { readonly symbol: SymbolNode }[]
  ): ReadonlyMap<string, InvestigationTopologySignals> {
    const seedSymbolIds = candidates
      .slice(0, INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT)
      .map(({ symbol }) => symbol.id);
    const topology = getBoundedExactTopologyRelevance(snapshot, {
      seedSymbolIds,
      maxHops: INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS,
      maxVisitedSymbols: INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS,
      iterations: INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT,
      restartProbability: INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY,
      edgeKinds: DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS
    });
    const seedSymbolIdSet = new Set(topology.seedSymbolIds);
    const seedTruncated = candidates.length > topology.seedSymbolIds.length;

    return new Map(
      candidates.map(({ symbol }): readonly [string, InvestigationTopologySignals] => {
        const scopedExactIncidentEdgeKindCounts =
          topology.scopedExactIncidentEdgeKindCountsBySymbolId.get(symbol.id);
        return [
          symbol.id,
          {
          maxHops: INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS,
          maxVisitedSymbols: INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS,
          seedLimit: INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT,
          seedCount: topology.seedSymbolIds.length,
          seedTruncated,
          seeded: seedSymbolIdSet.has(symbol.id),
          scopeSymbolCount: topology.scopedSymbolIds.length,
          scopedExactNeighborCount:
            topology.scopedExactNeighborCountsBySymbolId.get(symbol.id) ?? 0,
          scopedExactIncidentEdgeKindCounts: DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS.map((kind) => ({
            kind,
            count: scopedExactIncidentEdgeKindCounts?.get(kind) ?? 0
          })),
          iterationCount: INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT,
          restartProbability: INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY,
          edgeKinds: DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS,
          score: topology.scoresBySymbolId.get(symbol.id) ?? 0,
          traversalTruncated: topology.traversalTruncated,
          depthLimitReached: topology.depthLimitReached
          }
        ];
      })
    );
  }

  private compareInvestigationCandidates(
    left: InvestigationCandidate,
    right: InvestigationCandidate,
    ranking: InvestigateRankingStrategy
  ): number {
    const generatedDifference =
      left.generatedRanking.generatedPenalty - right.generatedRanking.generatedPenalty;
    if (generatedDifference !== 0) {
      return generatedDifference;
    }
    if (ranking === "structure") {
      const structuralDifference = right.structuralSignals.score - left.structuralSignals.score;
      if (structuralDifference !== 0) {
        return structuralDifference;
      }
    }
    if (ranking === "impact") {
      const impactDifference =
        (right.impactSignals?.score ?? 0) - (left.impactSignals?.score ?? 0);
      if (impactDifference !== 0) {
        return impactDifference;
      }
    }
    if (ranking === "topology") {
      const topologyDifference =
        (right.topologySignals?.score ?? 0) - (left.topologySignals?.score ?? 0);
      if (topologyDifference !== 0) {
        return topologyDifference;
      }
    }

    return (
      left.sourceRank - right.sourceRank ||
      left.candidateRank - right.candidateRank ||
      compareText(left.symbol.qualifiedName, right.symbol.qualifiedName) ||
      compareText(left.symbol.id, right.symbol.id)
    );
  }

  /**
   * Builds complete-but-bounded declaration evidence from the persisted source
   * documents that produced this investigation's lexical hits. It deliberately
   * does not issue another graph-store read, so selection, source, and context
   * stay tied to the same active generation.
   */
  private investigationDeclarations(
    selection: InvestigationSelectionResult,
    documentsByFilePath: ReadonlyMap<string, IndexedSourceDocument>,
    sourceCharacterBudget: number,
    sourceRenderMode: InvestigateSourceRenderMode
  ): {
    readonly declarations: readonly InvestigationDeclaration[];
    readonly allocation: InvestigationSourceAllocationResult;
  } {
    const drafts: readonly InvestigationDeclarationDraft[] = selection.items.map((item) => {
      const { symbol } = item;
      const sourceDocument = documentsByFilePath.get(symbol.filePath);
      const source =
        sourceDocument === undefined
          ? null
          : nodeSourceFromPersistedText(sourceDocument.filePath, sourceDocument.sourceText, symbol.range);
      return { selection: item, source };
    });
    const grouped = new Map<string, {
      readonly filePath: string;
      readonly selectionRanks: number[];
      readonly declarationReferences: string[];
      requestedCharacters: number;
      generatedPenalty: 0 | 1;
      readonly drafts: InvestigationDeclarationDraft[];
    }>();
    for (const draft of drafts) {
      if (draft.source === null) {
        continue;
      }
      const filePath = draft.selection.symbol.filePath;
      const group = grouped.get(filePath) ?? {
        filePath,
        selectionRanks: [],
        declarationReferences: [],
        requestedCharacters: 0,
        generatedPenalty: draft.selection.generatedRanking.generatedPenalty,
        drafts: []
      };
      group.selectionRanks.push(draft.selection.selectionRank);
      group.declarationReferences.push(draft.selection.symbol.qualifiedName);
      group.requestedCharacters += draft.source.text.length;
      group.generatedPenalty = Math.max(
        group.generatedPenalty,
        draft.selection.generatedRanking.generatedPenalty
      ) as 0 | 1;
      group.drafts.push(draft);
      grouped.set(filePath, group);
    }

    const reservation = allocateInvestigationSource({
      candidates: [...grouped.values()].map((group) => ({
        filePath: group.filePath,
        requestedCharacters: group.requestedCharacters,
        selectionRanks: group.selectionRanks,
        generatedPenalty: group.generatedPenalty
      })),
      characterBudget: sourceCharacterBudget,
      selectionCount: selection.items.length
    });
    const declarationAllocations = new Map<string, InvestigationDeclarationAllocation>();
    const renderedSources = new Map<string, {
      readonly source: NonNullable<InvestigationDeclaration["source"]>;
      readonly render: NonNullable<InvestigationDeclaration["render"]>;
    }>();
    for (const file of reservation.files) {
      const group = grouped.get(file.filePath);
      if (group === undefined) {
        throw new Error(`Missing investigation source allocation group for ${file.filePath}.`);
      }
      const shares = allocateDeclarationCharacterShares(
        group.drafts,
        file.allocatedCharacters,
        selection.items.length
      );
      for (const draft of group.drafts) {
        const reference = draft.selection.symbol.qualifiedName;
        const source = draft.source;
        if (source === null) {
          continue;
        }
        const allocatedCharacters = shares.get(reference) ?? 0;
        const rendered = renderInvestigationDeclaration({
          sourceText: source.text,
          allocatedCharacters,
          declarationRange: source.range,
          lexicalFocusRange: draft.selection.lexicalFocus.range,
          language: draft.selection.lexicalFocus.language,
          requestedMode: sourceRenderMode,
          filePath: draft.selection.symbol.filePath,
          declarationReference: reference
        });
        const document = documentsByFilePath.get(source.filePath);
        if (document === undefined) {
          throw new Error(`Missing persisted investigation source document for ${source.filePath}.`);
        }
        const declarationStart = source.sourceIdentity.fullFileCharacterOffsets.start;
        const renderedSegments = rendered.segments.map((segment) => ({
          ...segment,
          sourceIdentity: sourceDeliveryIdentity({
            filePath: source.filePath,
            sourceText: document.sourceText,
            fullFileCharacterOffsets: {
              start: declarationStart + segment.sourceCharacterOffsets.start,
              end: declarationStart + segment.sourceCharacterOffsets.end
            }
          })
        }));
        const primarySourceIdentity = renderedSegments[rendered.primarySegmentIndex]?.sourceIdentity;
        if (primarySourceIdentity === undefined) {
          throw new Error(`Missing primary investigation source identity for ${reference}.`);
        }
        declarationAllocations.set(reference, {
          selectionRank: draft.selection.selectionRank,
          requestedCharacters: source.text.length,
          allocatedCharacters,
          emittedCharacters: rendered.receipt.emittedCharacters,
          truncated: source.truncated || !rendered.receipt.complete
        });
        renderedSources.set(reference, {
          source: {
            ...source,
            text: rendered.text,
            sourceIdentity: primarySourceIdentity,
            renderedRange: rendered.renderedRange,
            renderedCharacterOffsets: rendered.receipt.sourceCharacterOffsets,
            renderedSegments,
            primarySegmentIndex: rendered.primarySegmentIndex,
            truncated: source.truncated || !rendered.receipt.complete
          },
          render: rendered.receipt
        });
      }
    }

    const declarations = drafts.map((draft): InvestigationDeclaration => {
      const reference = draft.selection.symbol.qualifiedName;
      const allocation = declarationAllocations.get(reference) ?? null;
      const rendered = renderedSources.get(reference) ?? null;
      const source = draft.source === null || allocation === null || rendered === null
        ? null
        : rendered.source;
      return {
        reference,
        sourceAvailability: source === null ? "unavailable" : "active-generation",
        source,
        allocation,
        render: rendered?.render ?? null
      };
    });
    const files = reservation.files.map((file) => {
      const group = grouped.get(file.filePath);
      if (group === undefined) {
        throw new Error(`Missing investigation allocation receipt group for ${file.filePath}.`);
      }
      const emittedCharacters = group.declarationReferences.reduce(
        (total, reference) =>
          total + (declarationAllocations.get(reference)?.emittedCharacters ?? 0),
        0
      );
      return {
        ...file,
        truncated: file.truncated || emittedCharacters < file.requestedCharacters,
        declarationReferences: [...group.declarationReferences],
        emittedCharacters,
        reservedButNotEmittedCharacters: file.allocatedCharacters - emittedCharacters
      };
    });
    const emittedCharacters = files.reduce(
      (total, file) => total + file.emittedCharacters,
      0
    );
    const reservedButNotEmittedCharacters = files.reduce(
      (total, file) => total + file.reservedButNotEmittedCharacters,
      0
    );
    return {
      declarations,
      allocation: {
        ...reservation,
        summary: {
          ...reservation.summary,
          emittedCharacters,
          unusedCharacters: sourceCharacterBudget - emittedCharacters,
          reservedButNotEmittedCharacters,
          truncated: reservation.summary.truncated || emittedCharacters < reservation.summary.requestedCharacters
        },
        files
      }
    };
  }

  private extractPersistedFacts(
    document: SourceDocument,
    frameworkEvidence?: ExtractFileFactsInput["frameworkEvidence"]
  ): PersistedArtifactFacts {
    return {
      ...this.artifactFactsExtractor({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language,
        ...(frameworkEvidence === undefined ? {} : { frameworkEvidence })
      }),
      filePath: document.relativePath,
      language: document.language,
      contentHash: document.contentHash,
      extractorVersion: this.activeArtifactFactsExtractorVersion
    };
  }

  private replaceGeneration(
    projectPath: string,
    scan: ProjectScan,
    artifactFacts: readonly PersistedArtifactFacts[],
    indexWork: IndexWork
  ): void {
    const indexedAt = new Date().toISOString();
    const snapshot = resolveProjectFacts({
      sourceDocuments: scan.sourceDocuments,
      extractedFiles: artifactFacts,
      indexedAt,
      moduleResolver: scan.moduleResolver,
      ...(scan.xcodeTargetMemberships === undefined
        ? {}
        : { xcodeTargetMemberships: scan.xcodeTargetMemberships }),
      ...(scan.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: scan.jvmProjectModuleEvidence }),
      ...(this.referenceResolverPlugins === undefined
        ? {}
        : { referenceResolverPlugins: this.referenceResolverPlugins }),
      ...(this.frameworkProjectPlugins === undefined
        ? {}
        : { frameworkProjectPlugins: this.frameworkProjectPlugins })
    });
    this.graphStore.replaceProjectFacts({
      projectPath,
      snapshot,
      indexedAt,
      artifactFacts,
      indexInputs: scan.indexInputs,
      resolverVersion: this.activeProjectResolverVersion,
      sourceDocuments: scan.sourceDocuments.map((document) => ({
        filePath: document.relativePath,
        language: document.language,
        sourceText: document.sourceText
      })),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork
    });
  }

  private async getStatusForBundle(
    normalizedProjectPath: string,
    bundle: ActiveGraphBundle
  ): Promise<GraphContext["status"]> {
    const persistedStatus = bundle.status;
    if (!persistedStatus.initialized) {
      return persistedStatus;
    }

    const versionChanged =
      bundle.snapshot.files.length > 0 &&
      (bundle.extractorVersion !== this.activeArtifactFactsExtractorVersion ||
        bundle.resolverVersion !== this.activeProjectResolverVersion ||
        this.sourceSearchProjectionChanged(bundle.sourceSearchVersion));
    const persistedInputs = bundle.indexInputs;
    if (persistedInputs === null) {
      return {
        ...persistedStatus,
        stale: true,
        staleReasons: [
          "configuration-untracked",
          ...(versionChanged ? (["indexer-version-changed"] as const) : [])
        ]
      };
    }

    let scan;
    try {
      scan = await this.sourceCatalog.scan(normalizedProjectPath, {
        scopeRoots: persistedInputs.scopeRoots
      });
    } catch (error) {
      if (error instanceof ProjectConfigurationError) {
        return {
          ...persistedStatus,
          stale: true,
          staleReasons: [
            "configuration-invalid",
            ...(versionChanged ? (["indexer-version-changed"] as const) : [])
          ]
        };
      }
      throw error;
    }
    const staleReasons = [
      ...(filesMatch(scan.sourceDocuments, bundle.snapshot.files)
        ? []
        : (["source-files-changed"] as const)),
      ...(scan.indexInputs.fingerprint === persistedInputs.fingerprint
        ? []
        : (["project-inputs-changed"] as const)),
      ...(versionChanged ? (["indexer-version-changed"] as const) : [])
    ];
    return {
      ...persistedStatus,
      stale: staleReasons.length > 0,
      staleReasons
    };
  }

  /**
   * Reusable non-mutating broad-path guard for explicit index lifecycles.
   * Foreground watch calls it before its first status scan so a fresh unsafe
   * index cannot bypass the same deliberate `--force` requirement as sync.
   */
  public assertSafeProjectPath(options: IndexOptions): void {
    const projectPath = resolve(options.projectPath);
    if (!options.force && this.sourceCatalog.isUnsafeProjectPath(projectPath)) {
      throw new SymbolLatticeError(
        "INVALID_PROJECT_PATH",
        `Refusing to index ${projectPath}. Pass --force only when that broad scope is intentional.`
      );
    }
  }

  private async scanForIndex(
    projectPath: string,
    options: IndexOptions,
    previousInputs: ProjectIndexInputs | null
  ): Promise<ProjectScan> {
    const selectedScopeRoots = options.scopeRoots ?? previousInputs?.scopeRoots;
    const scanOptions: ProjectScanOptions | undefined =
      selectedScopeRoots === undefined ? undefined : { scopeRoots: selectedScopeRoots };

    try {
      return await this.sourceCatalog.scan(projectPath, scanOptions);
    } catch (error) {
      if (error instanceof ProjectConfigurationError) {
        throw new SymbolLatticeError("INVALID_PROJECT_CONFIGURATION", error.message);
      }
      throw error;
    }
  }

  private async requireGraph(projectPath: string): Promise<GraphContext> {
    const normalizedProjectPath = resolve(projectPath);
    const bundle = this.getActiveGraphBundle(normalizedProjectPath);
    if (!bundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }

    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      snapshot: bundle.snapshot
    };
  }

  private async nodeResultForBundle(
    normalizedProjectPath: string,
    reference: string,
    bundle: ActiveGraphBundle,
    source: NodeSource | null,
    sourceAvailability: SourceAvailability
  ): Promise<NodeResult> {
    const match = matchSymbol(bundle.snapshot, reference);
    const boundedMatch = this.boundedContextMatch(match, NODE_MATCH_CANDIDATE_LIMIT);
    const status = await this.getStatusForBundle(normalizedProjectPath, bundle);
    if (match.status !== "exact") {
      return {
        status,
        bounds: { ...NODE_BOUNDS },
        match: boundedMatch.match,
        matchCandidatesTruncated: boundedMatch.truncated,
        sourceAvailability: "not-applicable",
        source: null,
        callers: { items: [], truncated: false },
        callees: { items: [], truncated: false }
      };
    }

    return {
      status,
      bounds: { ...NODE_BOUNDS },
      match: boundedMatch.match,
      matchCandidatesTruncated: boundedMatch.truncated,
      sourceAvailability,
      source,
      callers: this.boundedItems(getCallers(bundle.snapshot, match.symbol.id), NODE_RELATION_LIMIT),
      callees: this.boundedItems(getCallees(bundle.snapshot, match.symbol.id), NODE_RELATION_LIMIT)
    };
  }

  private exploreQueryFilePaths(
    plan: ExploreQueryPlan,
    pathSpinePlan: ExplorePathSpinePlan
  ): readonly string[] {
    const filePaths: string[] = [];
    const seen = new Set<string>();
    for (const selection of plan.selection) {
      if (seen.has(selection.symbol.filePath)) continue;
      seen.add(selection.symbol.filePath);
      filePaths.push(selection.symbol.filePath);
    }
    for (const spine of pathSpinePlan.spines) {
      for (const bridge of spine.bridgeSymbols) {
        if (seen.has(bridge.filePath)) continue;
        seen.add(bridge.filePath);
        filePaths.push(bridge.filePath);
      }
    }
    return filePaths;
  }

  private async exploreQueryResultForBundle(
    normalizedProjectPath: string,
    query: string,
    bundle: ActiveGraphBundle,
    plan: ExploreQueryPlan,
    pathSpinePlan: ExplorePathSpinePlan,
    documentsByFilePath: ReadonlyMap<string, IndexedSourceDocument>
  ): Promise<ExploreResult> {
    const matches: readonly SymbolMatch[] = plan.selection.map(({ symbol }) => ({
      status: "exact",
      reference: symbol.qualifiedName,
      symbol,
      candidates: [symbol]
    }));
    const bounds = this.contextBounds({
      sourceCharacterBudget: DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET
    });
    const read: ContextRead = { bundle, matches, documentsByFilePath };
    const contextPack = this.symbolContextPack(read, bounds);
    const focuses: readonly ExploreFocus[] = plan.selection.map((selection, index) => ({
      ...selection,
      ...(contextPack.contexts[index] ?? this.toSymbolContext(
        selection.symbol.qualifiedName,
        matches[index] ?? {
          status: "exact",
          reference: selection.symbol.qualifiedName,
          symbol: selection.symbol,
          candidates: [selection.symbol]
        },
        read,
        bounds,
        null
      ))
    }));
    const rankBySymbolId = new Map(
      plan.selection.map((selection) => [selection.symbol.id, selection.rank])
    );
    const symbolsById = new Map(
      plan.selection.map((selection) => [selection.symbol.id, selection.symbol])
    );
    const connectionCandidates = bundle.snapshot.edges
      .filter(
        (edge): edge is typeof edge & { readonly sourceId: string; readonly targetId: string } =>
          edge.resolution === "exact" &&
          edge.sourceId !== null &&
          edge.targetId !== null &&
          symbolsById.has(edge.sourceId) &&
          symbolsById.has(edge.targetId)
      )
      .sort(
        (left, right) =>
          (rankBySymbolId.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER) -
            (rankBySymbolId.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER) ||
          (rankBySymbolId.get(left.targetId) ?? Number.MAX_SAFE_INTEGER) -
            (rankBySymbolId.get(right.targetId) ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.kind, right.kind) ||
          compareText(left.id, right.id)
      );
    const connections: ExploreConnection[] = connectionCandidates
      .slice(0, EXPLORE_QUERY_LIMITS.maximumConnections)
      .flatMap((edge) => {
        const source = symbolsById.get(edge.sourceId);
        const target = symbolsById.get(edge.targetId);
        return source === undefined || target === undefined ? [] : [{ source, target, edge }];
      });

    const sourceWindowPlan = planExploreSourceWindows(focuses, connections, pathSpinePlan);
    const sourceWindowDrafts = new Map<number, ContextSourceDraft>();
    for (const window of sourceWindowPlan.windows) {
      const document = documentsByFilePath.get(window.filePath);
      if (document === undefined) continue;
      const draft = sourceWindowDraftFromPersistedText({
        referenceIndex: window.index,
        reference: `explore-window:${window.index}`,
        filePath: window.filePath,
        sourceText: document.sourceText,
        startLine: window.startLine,
        endLine: window.endLine
      });
      if (draft !== null) sourceWindowDrafts.set(window.index, draft);
    }
    const sourceWindowReservation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET,
      primaryEmittedCharacters: contextPack.allocation.summary.emittedCharacters,
      candidates: sourceWindowPlan.windows.flatMap((window) => {
        const draft = sourceWindowDrafts.get(window.index);
        return draft === undefined ? [] : [{
          index: window.index,
          requestedCharacters: draft.endOffset - draft.startOffset,
          relevanceWeight: window.relevanceWeight
        }];
      })
    });
    const renderedSourceWindows = new Map<number, DeliveredSourceExcerpt>();
    for (const allocation of sourceWindowReservation.windows) {
      if (allocation.allocatedCharacters === 0) continue;
      const draft = sourceWindowDrafts.get(allocation.index);
      if (draft === undefined) continue;
      const source = renderContextSource(draft, allocation.allocatedCharacters);
      if (source !== null) renderedSourceWindows.set(allocation.index, source);
    }
    const sourceWindows: ExploreSourceWindow[] = sourceWindowPlan.windows.flatMap((window) => {
      const source = renderedSourceWindows.get(window.index);
      return source === undefined ? [] : [{ ...window, source }];
    });
    const sourceWindowAllocations = sourceWindowReservation.windows.map((allocation) => {
      const emittedCharacters = renderedSourceWindows.get(allocation.index)?.emittedCharacters ?? 0;
      return {
        ...allocation,
        emittedCharacters,
        reservedButNotEmittedCharacters: allocation.allocatedCharacters - emittedCharacters
      };
    });
    const emittedWindowCharacters = sourceWindowAllocations.reduce(
      (total, allocation) => total + allocation.emittedCharacters,
      0
    );
    const sourceWindowAllocation: ExploreSourceWindowAllocationResult = {
      ...sourceWindowReservation,
      summary: {
        ...sourceWindowReservation.summary,
        emittedCharacters: emittedWindowCharacters,
        emittedWindows: sourceWindows.length,
        reservedButNotEmittedCharacters:
          sourceWindowReservation.summary.allocatedCharacters - emittedWindowCharacters
      },
      windows: sourceWindowAllocations
    };

    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      mode: "query",
      match: matchSymbol(bundle.snapshot, query),
      sourceAvailability: "not-applicable",
      source: null,
      callers: [],
      callees: [],
      impact: [],
      queryPlan: plan,
      pathSpinePlan,
      focuses,
      connections,
      connectionsTruncated: connectionCandidates.length > connections.length,
      sourceAllocation: contextPack.allocation,
      sourceWindowPlan,
      sourceWindows,
      sourceWindowAllocation,
      evidencePaths: this.contextEvidencePaths(matches, bundle, bounds)
    };
  }

  private async exploreResultForBundle(
    normalizedProjectPath: string,
    reference: string,
    bundle: ActiveGraphBundle,
    source: DeliveredSourceExcerpt | null,
    sourceAvailability: NonNullable<ExploreResult["sourceAvailability"]>
  ): Promise<ExploreResult> {
    const match = matchSymbol(bundle.snapshot, reference);
    const status = await this.getStatusForBundle(normalizedProjectPath, bundle);
    if (match.status !== "exact") {
      return {
        status,
        mode: "exact-symbol",
        match,
        sourceAvailability: "not-applicable",
        source: null,
        callers: [],
        callees: [],
        impact: [],
        queryPlan: null,
        focuses: [],
        connections: [],
        connectionsTruncated: false,
        sourceAllocation: null,
        evidencePaths: []
      };
    }

    return {
      status,
      mode: "exact-symbol",
      match,
      sourceAvailability,
      source,
      callers: getCallers(bundle.snapshot, match.symbol.id),
      callees: getCallees(bundle.snapshot, match.symbol.id),
      impact: getImpactPaths(bundle.snapshot, match.symbol.id, 2),
      queryPlan: null,
      focuses: [],
      connections: [],
      connectionsTruncated: false,
      sourceAllocation: null,
      evidencePaths: []
    };
  }

  /**
   * v0.4 adds a smaller graph-only bundle, but GraphStore is public and v0.3
   * adapters only expose the full generation bundle. Preserve that contract
   * rather than making ordinary reads depend on an optional optimization.
   */
  private getActiveGraphBundle(projectPath: string): ActiveGraphBundle {
    const readGraphBundle = this.graphStore.getActiveGraphBundle;
    if (typeof readGraphBundle === "function") {
      return readGraphBundle.call(this.graphStore, projectPath);
    }

    const legacyBundle = this.graphStore.getActiveGenerationBundle(projectPath);
    return {
      status: legacyBundle.status,
      snapshot: legacyBundle.snapshot,
      indexInputs: legacyBundle.indexInputs,
      extractorVersion: legacyBundle.extractorVersion,
      resolverVersion: legacyBundle.resolverVersion,
      sourceSearchVersion: legacyBundle.sourceSearchVersion ?? null
    };
  }

  private requireInitializedHistoryProject(
    normalizedProjectPath: string,
    activeBundle: ActiveGraphBundle
  ): void {
    if (!activeBundle.status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run "symbol-lattice init ${normalizedProjectPath}" first.`
      );
    }
  }

  private generationHistoryLimit(options: GenerationHistoryOptions): number {
    const limit = options.limit === undefined ? DEFAULT_GENERATION_HISTORY_LIMIT : options.limit;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_GENERATION_HISTORY_LIMIT
    ) {
      throw new SymbolLatticeError(
        "INVALID_GENERATION_HISTORY_LIMIT",
        `Generation history limit must be a whole number from 1 to ${MAX_GENERATION_HISTORY_LIMIT}.`
      );
    }
    return limit;
  }

  private generationDiffRequest(
    fromGenerationId: string,
    options: GenerationDiffOptions
  ): NormalizedGenerationDiffRequest {
    const limit = options.limit === undefined ? DEFAULT_GENERATION_DIFF_LIMIT : options.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GENERATION_DIFF_LIMIT) {
      throw new SymbolLatticeError(
        "INVALID_GENERATION_DIFF_LIMIT",
        `Generation diff limit must be a whole number from 1 to ${MAX_GENERATION_DIFF_LIMIT}.`
      );
    }

    return {
      fromGenerationId: this.normalizeGenerationId(fromGenerationId),
      toGenerationId:
        options.toGenerationId === undefined
          ? undefined
          : this.normalizeGenerationId(options.toGenerationId),
      limit
    };
  }

  private normalizeGenerationId(generationId: unknown): string {
    if (
      typeof generationId !== "string" ||
      generationId.length === 0 ||
      generationId !== generationId.trim() ||
      /[\u0000-\u001F\u007F]/u.test(generationId)
    ) {
      throw new SymbolLatticeError(
        "INVALID_GENERATION_ID",
        "Generation ID must be non-empty text without leading/trailing whitespace or control characters."
      );
    }
    return generationId;
  }

  private readGenerationHistoryBundle(projectPath: string): GenerationHistoryBundle {
    const readHistory = this.graphStore.getGenerationHistoryBundle;
    if (typeof readHistory !== "function") {
      throw new SymbolLatticeError(
        "GENERATION_HISTORY_UNAVAILABLE",
        `The configured SymbolLattice graph store for ${projectPath} does not expose immutable retained-generation history. Upgrade the adapter and run "symbol-lattice sync ${projectPath}" to create future snapshots.`
      );
    }

    const history = readHistory.call(this.graphStore, projectPath);
    if (history === null) {
      if (!this.graphStore.isInitialized(projectPath)) {
        throw new SymbolLatticeError(
          "MISSING_INDEX",
          `No SymbolLattice index exists for ${projectPath}. Run "symbol-lattice init ${projectPath}" first.`
        );
      }
      throw new SymbolLatticeError(
        "GENERATION_HISTORY_UNAVAILABLE",
        `A trustworthy retained-generation history is unavailable for ${projectPath}. The active generation may predate immutable snapshot retention; run "symbol-lattice sync ${projectPath}" to create a retained snapshot.`
      );
    }
    return history;
  }

  private readGenerationComparisonBundle(
    projectPath: string,
    fromGenerationId: string,
    toGenerationId: string | undefined
  ): GenerationComparisonBundle {
    const readComparison = this.graphStore.getGenerationComparisonBundle;
    if (typeof readComparison !== "function") {
      throw new SymbolLatticeError(
        "GENERATION_HISTORY_UNAVAILABLE",
        `The configured SymbolLattice graph store for ${projectPath} does not expose atomic immutable retained-generation comparisons. Upgrade the adapter and run "symbol-lattice sync ${projectPath}" to create future snapshots.`
      );
    }

    const comparison = readComparison.call(
      this.graphStore,
      projectPath,
      fromGenerationId,
      toGenerationId
    );
    if (comparison === null) {
      if (!this.graphStore.isInitialized(projectPath)) {
        throw new SymbolLatticeError(
          "MISSING_INDEX",
          `No SymbolLattice index exists for ${projectPath}. Run "symbol-lattice init ${projectPath}" first.`
        );
      }
      throw new SymbolLatticeError(
        "GENERATION_HISTORY_UNAVAILABLE",
        `A trustworthy retained-generation comparison is unavailable for ${projectPath}. The active generation may predate immutable snapshot retention; run "symbol-lattice sync ${projectPath}" to create a retained snapshot.`
      );
    }
    return comparison;
  }

  private requireComparisonSnapshot(
    projectPath: string,
    selection: "from" | "to",
    requestedGenerationId: string | undefined,
    bundle: GenerationComparisonBundle["from"]
  ): NonNullable<GenerationComparisonBundle["from"]> {
    if (bundle === null) {
      const requested = requestedGenerationId === undefined ? "the active generation" : `generation "${requestedGenerationId}"`;
      throw new SymbolLatticeError(
        "GENERATION_NOT_RETAINED",
        `${selection === "from" ? "From" : "To"} ${requested} is not retained for ${projectPath}. It may be unknown or have been evicted by the configured retention policy.`
      );
    }
    if (
      requestedGenerationId !== undefined &&
      bundle.generation.generationId !== requestedGenerationId
    ) {
      throw new SymbolLatticeError(
        "INVALID_GENERATION_COMPARISON",
        `The atomic retained-generation comparison returned generation "${bundle.generation.generationId}" for requested ${selection} generation "${requestedGenerationId}".`
      );
    }
    return bundle;
  }

  private toGenerationHistorySummary(entry: GenerationHistoryEntry): GenerationHistorySummary {
    return {
      generationId: entry.generationId,
      indexedAt: entry.indexedAt,
      snapshotVersion: entry.snapshotVersion,
      counts: entry.counts,
      indexWork: entry.indexWork ?? null,
      extractorVersion: entry.extractorVersion,
      resolverVersion: entry.resolverVersion
    };
  }

  /** A missing v0.4 capability on a v0.3 adapter is not index drift. */
  private sourceSearchProjectionChanged(
    sourceSearchVersion: string | null | undefined
  ): boolean {
    return (
      typeof this.graphStore.getActiveSourceSearchBundle === "function" &&
      sourceSearchVersion !== SOURCE_SEARCH_INDEX_VERSION
    );
  }

  private requireExactSymbol(context: GraphContext, reference: string): SymbolNode {
    const match = matchSymbol(context.snapshot, reference);
    if (match.status === "exact") {
      return match.symbol;
    }

    if (match.status === "ambiguous") {
      throw new SymbolLatticeError(
        "AMBIGUOUS_SYMBOL",
        `Symbol reference "${reference}" is ambiguous. Candidates: ${match.candidates
          .map((candidate) => candidate.qualifiedName)
          .join(", ")}`
      );
    }

    throw new SymbolLatticeError("SYMBOL_NOT_FOUND", `No symbol matches "${reference}".`);
  }

}

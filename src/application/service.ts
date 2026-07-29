import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  AFFECTED_TEST_EDGE_KINDS,
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  ARTIFACT_LANGUAGES,
  attributeGitHunkSide,
  classifyTestFile,
  diffGenerationSnapshots,
  DEFAULT_SOURCE_SEARCH_LIMIT,
  findEvidencePath,
  findAffectedTestPaths,
  findSymbols,
  getCallees,
  getCallers,
  getImpactPaths,
  MAX_SOURCE_SEARCH_LIMIT,
  matchSymbol,
  normalizeSourceSearchLexicalText,
  PROJECT_RESOLVER_VERSION,
  SOURCE_SEARCH_INDEX_VERSION,
  sourceSearchTerms,
  type GraphSnapshot,
  type GitLineRange,
  type GitUnifiedHunk,
  GenerationSnapshotComparisonError,
  type ImpactPath,
  type IndexedSourceDocument,
  type IndexedSourceSearchHit,
  type IndexWork,
  type PersistedArtifactFacts,
  type ProjectIndexInputs,
  type SourceSearchRequest,
  type SourceRange,
  type SymbolMatch,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";
import {
  extractFileFacts,
  type ExtractFileFactsInput,
  type ExtractedFileFacts
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
  DEFAULT_GENERATION_DIFF_LIMIT,
  DEFAULT_GENERATION_HISTORY_LIMIT,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_REFERENCES,
  MAX_CONTEXT_RELATION_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  MAX_GIT_HUNK_DECLARATION_ANCHORS,
  MAX_GIT_HUNK_LIMIT,
  MAX_GIT_HUNK_SOURCE_FILES,
  MAX_AFFECTED_CHANGED_FILES,
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_IMPACT_LIMIT,
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
  ExploreResult,
  FindResult,
  GenerationDiffOptions,
  GenerationDiffResult,
  GenerationHistoryOptions,
  GenerationHistoryResult,
  GenerationHistorySummary,
  GraphContext,
  ImpactOptions,
  ImpactResult,
  NodeBounds,
  NodeResult,
  NodeSource,
  RelationResult,
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
export type ArtifactFactsExtractor = (input: ExtractFileFactsInput) => ExtractedFileFacts;

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

interface NormalizedAffectedTestsRequest {
  readonly filePaths: readonly string[];
  readonly bounds: AffectedTestsBounds;
}

interface NormalizedGitHunksRequest {
  readonly baseRef: string;
  readonly limit: number;
}

interface NormalizedGenerationDiffRequest {
  readonly fromGenerationId: string;
  readonly toGenerationId: string | undefined;
  readonly limit: number;
}

/** One graph/source snapshot used consistently for every item in a context pack. */
interface ContextRead {
  readonly bundle: ActiveGraphBundle;
  readonly matches: readonly SymbolMatch[];
  readonly documentsByFilePath: ReadonlyMap<string, IndexedSourceDocument>;
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
    totalLines: countPhysicalSourceLines(lineStarts, startOffset, endOffset),
    totalCharacters: endOffset - startOffset,
    truncated: boundedEnd < endOffset
  };
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
  persisted: PersistedArtifactFacts | undefined
): boolean {
  return (
    persisted !== undefined &&
    persisted.contentHash === document.contentHash &&
    persisted.language === document.language &&
    persisted.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
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
  public constructor(
    private readonly graphStore: GraphStore,
    private readonly sourceCatalog: SourceCatalog,
    private readonly artifactFactsExtractor: ArtifactFactsExtractor = extractFileFacts,
    private readonly gitChangeSetProvider?: GitChangeSetProvider,
    private readonly gitRevisionHunkProvider?: GitRevisionHunkProvider
  ) {}

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
      this.extractPersistedFacts(document)
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
    const resolverChanged = bundle.resolverVersion !== PROJECT_RESOLVER_VERSION;
    const persistedFactsByPath = new Map(
      bundle.artifactFacts.map((facts) => [facts.filePath, facts])
    );
    const artifactFacts: PersistedArtifactFacts[] = [];
    const reExtractedFiles: string[] = [];
    const reusedArtifactFiles: string[] = [];
    const reuseInvalidationReasons = new Set<IndexWork["reuseInvalidationReasons"][number]>();

    for (const document of scan.sourceDocuments) {
      const persisted = persistedFactsByPath.get(document.relativePath);
      if (persisted !== undefined && reusedArtifactFacts(document, persisted)) {
        artifactFacts.push(persisted);
        reusedArtifactFiles.push(document.relativePath);
        continue;
      }
      if (persisted === undefined) {
        reuseInvalidationReasons.add("missing-persisted-facts");
      } else if (persisted.extractorVersion !== ARTIFACT_FACTS_EXTRACTOR_VERSION) {
        reuseInvalidationReasons.add("extractor-version-changed");
      }
      artifactFacts.push(this.extractPersistedFacts(document));
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

    return {
      status: await this.getStatusForBundle(normalizedProjectPath, bundle),
      results: bundle.hits.map((hit, index) =>
        this.toSourceSearchHitResult(hit, index + 1, request.terms, bundle.snapshot)
      )
    };
  }

  public async find(
    projectPath: string,
    query: string,
    options: FindOptions = {}
  ): Promise<FindResult> {
    const context = await this.requireGraph(projectPath);
    return {
      status: context.status,
      symbols: findSymbols(context.snapshot, query, options)
    };
  }

  public async callers(projectPath: string, reference: string): Promise<RelationResult> {
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    return {
      status: context.status,
      symbol,
      relations: getCallers(context.snapshot, symbol.id)
    };
  }

  public async callees(projectPath: string, reference: string): Promise<RelationResult> {
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    return {
      status: context.status,
      symbol,
      relations: getCallees(context.snapshot, symbol.id)
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
    if (options.limit === undefined) {
      return {
        status: context.status,
        symbol,
        paths
      };
    }

    return {
      status: context.status,
      symbol,
      paths: paths.slice(0, options.limit),
      truncated: paths.length > options.limit
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
    const request = this.gitChangeSetRequest(options);
    const changeSet = await this.readGitChangeSet(normalizedProjectPath, request);

    if (changeSet.sourcePaths.length === 0) {
      return {
        status: await this.getStatus(normalizedProjectPath),
        changeSet,
        affected: null
      };
    }

    if (changeSet.sourcePaths.length > MAX_AFFECTED_CHANGED_FILES) {
      throw new SymbolLatticeError(
        "INVALID_AFFECTED_FILES",
        `Git source selection is capped at ${MAX_AFFECTED_CHANGED_FILES} paths. Refine the base ref or working-tree changes.`
      );
    }

    const affected = await this.affectedTests(normalizedProjectPath, changeSet.sourcePaths, options);
    return {
      status: affected.status,
      changeSet,
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
      maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES
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
        maxVisitedFiles: request.bounds.maxVisitedFilesPerInput
      });
      resultLimitTruncated ||= traversal.resultLimitReached;
      traversalTruncated ||= traversal.traversalTruncated;
      depthLimitReached ||= traversal.depthLimitReached;

      for (const path of traversal.paths) {
        const terminal = path.symbols.at(-1);
        const classification = terminal === undefined ? null : classifyTestFile(terminal.filePath);
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
      indexedTestFiles: bundle.snapshot.files.filter((file) => classifyTestFile(file.path) !== null)
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
    const contexts = read.matches.map((match) =>
      this.toSymbolContext(match.reference, match, read, request.bounds)
    );

    return {
      status,
      bounds: request.bounds,
      contexts,
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
      return this.exploreResultForBundle(
        normalizedProjectPath,
        reference,
        graphBundle,
        null,
        "not-applicable"
      );
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
        return this.exploreResultForBundle(
          normalizedProjectPath,
          reference,
          sourceBundle,
          excerptFromSourceText(
            sourceDocument.filePath,
            sourceDocument.sourceText,
            sourceMatch.symbol.range.start.line
          ),
          "active-generation"
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

    return {
      filePaths: normalizedPaths,
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
      bounds: {
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
        )
      }
    };
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

  private toSymbolContext(
    reference: string,
    match: SymbolMatch,
    read: ContextRead,
    bounds: ContextBounds
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

    const sourceProjectionAvailable =
      read.bundle.sourceSearchVersion !== null && read.bundle.sourceSearchVersion !== undefined;
    const sourceDocument = sourceProjectionAvailable
      ? read.documentsByFilePath.get(match.symbol.filePath)
      : undefined;
    const callers = getCallers(read.bundle.snapshot, match.symbol.id);
    const callees = getCallees(read.bundle.snapshot, match.symbol.id);
    const impact = getImpactPaths(read.bundle.snapshot, match.symbol.id, bounds.impactDepth);

    return {
      reference,
      match: boundedMatch.match,
      matchCandidatesTruncated: boundedMatch.truncated,
      sourceAvailability: this.sourceAvailability(sourceDocument),
      source:
        sourceDocument === undefined
          ? null
          : excerptFromSourceText(
              sourceDocument.filePath,
              sourceDocument.sourceText,
              match.symbol.range.start.line
            ),
      callers: this.boundedItems(callers, bounds.relationLimit),
      callees: this.boundedItems(callees, bounds.relationLimit),
      impact: this.boundedImpact(impact, bounds.impactLimit)
    };
  }

  private sourceAvailability(sourceDocument: IndexedSourceDocument | undefined): SourceAvailability {
    return sourceDocument === undefined ? "unavailable" : "active-generation";
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

  private sourceSearchRequest(query: string, options: SearchOptions): SourceSearchRequest {
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
    return {
      query,
      terms,
      limit,
      ...(pathPrefix === undefined ? {} : { pathPrefix }),
      ...(language === undefined ? {} : { language })
    };
  }

  private normalizedSearchPathPrefix(pathPrefix: string): string | undefined {
    if (typeof pathPrefix !== "string") {
      throw new SymbolLatticeError(
        "INVALID_SEARCH_PATH_PREFIX",
        "Search path prefix must be a project-relative path."
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
        "INVALID_SEARCH_PATH_PREFIX",
        `Search path prefix must stay project-relative: ${pathPrefix}`
      );
    }

    const parts: string[] = [];
    for (const part of normalized.split("/")) {
      if (part === "" || part === ".") {
        continue;
      }
      if (part === "..") {
        throw new SymbolLatticeError(
          "INVALID_SEARCH_PATH_PREFIX",
          `Search path prefix must not traverse outside the project: ${pathPrefix}`
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
    rank: number,
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
      rank,
      filePath: hit.filePath,
      language: hit.language,
      range: lexicalMatch.range,
      excerpt: lexicalMatch.excerpt,
      matchingTerms: lexicalMatch.matchingTerms,
      lexicalReason: lexicalReason(terms, lexicalMatch.matchingTerms),
      symbolCandidates
    };
  }

  private extractPersistedFacts(document: SourceDocument): PersistedArtifactFacts {
    return {
      ...this.artifactFactsExtractor({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      }),
      filePath: document.relativePath,
      language: document.language,
      contentHash: document.contentHash,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
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
      moduleResolver: scan.moduleResolver
    });
    this.graphStore.replaceProjectFacts({
      projectPath,
      snapshot,
      indexedAt,
      artifactFacts,
      indexInputs: scan.indexInputs,
      resolverVersion: PROJECT_RESOLVER_VERSION,
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
      (bundle.extractorVersion !== ARTIFACT_FACTS_EXTRACTOR_VERSION ||
        bundle.resolverVersion !== PROJECT_RESOLVER_VERSION ||
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

  private async exploreResultForBundle(
    normalizedProjectPath: string,
    reference: string,
    bundle: ActiveGraphBundle,
    source: SourceExcerpt | null,
    sourceAvailability: NonNullable<ExploreResult["sourceAvailability"]>
  ): Promise<ExploreResult> {
    const match = matchSymbol(bundle.snapshot, reference);
    const status = await this.getStatusForBundle(normalizedProjectPath, bundle);
    if (match.status !== "exact") {
      return {
        status,
        match,
        sourceAvailability: "not-applicable",
        source: null,
        callers: [],
        callees: [],
        impact: []
      };
    }

    return {
      status,
      match,
      sourceAvailability,
      source,
      callers: getCallers(bundle.snapshot, match.symbol.id),
      callees: getCallees(bundle.snapshot, match.symbol.id),
      impact: getImpactPaths(bundle.snapshot, match.symbol.id, 2)
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

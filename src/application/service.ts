import { isAbsolute, resolve } from "node:path";

import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  ARTIFACT_LANGUAGES,
  DEFAULT_SOURCE_SEARCH_LIMIT,
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
  type IndexedSourceSearchHit,
  type IndexWork,
  type PersistedArtifactFacts,
  type ProjectIndexInputs,
  type SourceSearchRequest,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";
import {
  extractFileFacts,
  type ExtractFileFactsInput,
  type ExtractedFileFacts
} from "../extraction/index.js";
import type {
  ActiveGraphBundle,
  GraphStore,
  ProjectScan,
  ProjectScanOptions,
  SourceCatalog,
  SourceDocument
} from "../ports/index.js";
import { ProjectConfigurationError } from "../domain/configuration.js";
import { SymbolLatticeError } from "./errors.js";
import { resolveProjectFacts } from "./resolution.js";
import type {
  ExplainEdgeResult,
  ExploreResult,
  FindResult,
  GraphContext,
  ImpactResult,
  RelationResult,
  SearchOptions,
  SearchResult,
  SourceSearchHitResult,
  SourceExcerpt
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

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
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
    private readonly artifactFactsExtractor: ArtifactFactsExtractor = extractFileFacts
  ) {}

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

  public async impact(
    projectPath: string,
    reference: string,
    maxDepth = 1
  ): Promise<ImpactResult> {
    const context = await this.requireGraph(projectPath);
    const symbol = this.requireExactSymbol(context, reference);
    return {
      status: context.status,
      symbol,
      paths: getImpactPaths(context.snapshot, symbol.id, maxDepth)
    };
  }

  public async explore(projectPath: string, reference: string): Promise<ExploreResult> {
    const context = await this.requireGraph(projectPath);
    const match = matchSymbol(context.snapshot, reference);
    if (match.status !== "exact") {
      return {
        status: context.status,
        match,
        source: null,
        callers: [],
        callees: [],
        impact: []
      };
    }

    return {
      status: context.status,
      match,
      source: await this.readExcerpt(projectPath, match.symbol.filePath, match.symbol.range.start.line),
      callers: getCallers(context.snapshot, match.symbol.id),
      callees: getCallees(context.snapshot, match.symbol.id),
      impact: getImpactPaths(context.snapshot, match.symbol.id, 2)
    };
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

  private assertSafeProjectPath(options: IndexOptions): void {
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

  private async readExcerpt(
    projectPath: string,
    filePath: string,
    centerLine: number,
    contextLines = 2
  ): Promise<SourceExcerpt> {
    return excerptFromSourceText(
      filePath,
      await this.sourceCatalog.read(projectPath, filePath),
      centerLine,
      contextLines
    );
  }
}

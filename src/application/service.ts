import { resolve } from "node:path";

import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  findSymbols,
  getCallees,
  getCallers,
  getImpactPaths,
  matchSymbol,
  PROJECT_RESOLVER_VERSION,
  type GraphSnapshot,
  type IndexWork,
  type PersistedArtifactFacts,
  type ProjectIndexInputs,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";
import {
  extractFileFacts,
  type ExtractFileFactsInput,
  type ExtractedFileFacts
} from "../extraction/index.js";
import type {
  ActiveGenerationBundle,
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
      ? this.graphStore.getActiveGenerationBundle(projectPath)
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
    if (
      noSourceChange &&
      !configurationChanged &&
      !resolverChanged &&
      reExtractedFiles.length === 0
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
    const bundle = this.graphStore.getActiveGenerationBundle(normalizedProjectPath);
    return this.getStatusForBundle(normalizedProjectPath, bundle);
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
      indexWork
    });
  }

  private async getStatusForBundle(
    normalizedProjectPath: string,
    bundle: ActiveGenerationBundle
  ): Promise<GraphContext["status"]> {
    const persistedStatus = bundle.status;
    if (!persistedStatus.initialized) {
      return persistedStatus;
    }

    const persistedInputs = bundle.indexInputs;
    if (persistedInputs === null) {
      return {
        ...persistedStatus,
        stale: true,
        staleReasons: ["configuration-untracked"]
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
          staleReasons: ["configuration-invalid"]
        };
      }
      throw error;
    }
    const versionChanged =
      bundle.snapshot.files.length > 0 &&
      (bundle.extractorVersion !== ARTIFACT_FACTS_EXTRACTOR_VERSION ||
        bundle.resolverVersion !== PROJECT_RESOLVER_VERSION);
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
    const bundle = this.graphStore.getActiveGenerationBundle(normalizedProjectPath);
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
    const lines = (await this.sourceCatalog.read(projectPath, filePath)).split(/\r?\n/);
    const startLine = Math.max(1, centerLine - contextLines);
    const endLine = Math.min(lines.length, centerLine + contextLines);
    const excerptLines = lines.slice(startLine - 1, endLine).map((text, index) => ({
      line: startLine + index,
      text
    }));

    return { filePath, startLine, endLine, lines: excerptLines };
  }
}

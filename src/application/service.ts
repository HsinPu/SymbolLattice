import { resolve } from "node:path";

import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  findSymbols,
  getCallees,
  getCallers,
  getImpactPaths,
  matchSymbol,
  type PersistedArtifactFacts,
  type SymbolKind,
  type SymbolMatch
} from "../domain/index.js";
import { extractFileFacts } from "../extraction/index.js";
import type { GraphStore, ProjectScanOptions, SourceCatalog } from "../ports/index.js";
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

export class SymbolLatticeService {
  public constructor(
    private readonly graphStore: GraphStore,
    private readonly sourceCatalog: SourceCatalog
  ) {}

  public async init(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    return this.index(options);
  }

  public async index(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    const projectPath = resolve(options.projectPath);
    const scan = await this.scanForIndex(projectPath, options);
    const sourceDocuments = scan.sourceDocuments;
    const indexedAt = new Date().toISOString();
    const extractedFiles = sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    );
    const artifactFacts: readonly PersistedArtifactFacts[] = sourceDocuments.map(
      (document, index) => ({
        ...extractedFiles[index]!,
        filePath: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
      })
    );
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles,
      indexedAt,
      moduleResolver: scan.moduleResolver
    });

    this.graphStore.replaceProjectFacts({
      projectPath,
      snapshot,
      indexedAt,
      artifactFacts,
      indexInputs: scan.indexInputs
    });
    return this.getStatus(projectPath);
  }

  public async sync(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    const projectPath = resolve(options.projectPath);
    if (!this.graphStore.isInitialized(projectPath)) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${projectPath}. Run \"symbol-lattice init ${projectPath}\" first.`
      );
    }

    return this.index(options);
  }

  public async getStatus(projectPath: string): Promise<GraphContext["status"]> {
    const normalizedProjectPath = resolve(projectPath);
    const persistedStatus = this.graphStore.getStatus(normalizedProjectPath);
    if (!persistedStatus.initialized) {
      return persistedStatus;
    }

    const persistedInputs = this.graphStore.getIndexInputs(normalizedProjectPath);
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
    const snapshot = this.graphStore.getSnapshot(normalizedProjectPath);
    const staleReasons = [
      ...(filesMatch(scan.sourceDocuments, snapshot.files) ? [] : (["source-files-changed"] as const)),
      ...(scan.indexInputs.fingerprint === persistedInputs.fingerprint
        ? []
        : (["project-inputs-changed"] as const))
    ];
    return {
      ...persistedStatus,
      stale: staleReasons.length > 0,
      staleReasons
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
      throw new SymbolLatticeError("EDGE_NOT_FOUND", `No graph edge matches \"${edgeId}\".`);
    }

    const source = context.snapshot.symbols.find((symbol) => symbol.id === edge.sourceId);
    if (source === undefined) {
      throw new SymbolLatticeError(
        "EDGE_NOT_FOUND",
        `Graph edge \"${edgeId}\" has no persisted source symbol.`
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

  private assertSafeProjectPath(options: IndexOptions): void {
    const projectPath = resolve(options.projectPath);
    if (!options.force && this.sourceCatalog.isUnsafeProjectPath(projectPath)) {
      throw new SymbolLatticeError(
        "INVALID_PROJECT_PATH",
        `Refusing to index ${projectPath}. Pass --force only when that broad scope is intentional.`
      );
    }
  }

  private async scanForIndex(projectPath: string, options: IndexOptions) {
    const previousInputs = this.graphStore.isInitialized(projectPath)
      ? this.graphStore.getIndexInputs(projectPath)
      : null;
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
    if (!this.graphStore.isInitialized(normalizedProjectPath)) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${normalizedProjectPath}. Run \"symbol-lattice init ${normalizedProjectPath}\" first.`
      );
    }

    return {
      status: await this.getStatus(normalizedProjectPath),
      snapshot: this.graphStore.getSnapshot(normalizedProjectPath)
    };
  }

  private requireExactSymbol(context: GraphContext, reference: string) {
    const match = matchSymbol(context.snapshot, reference);
    if (match.status === "exact") {
      return match.symbol;
    }

    if (match.status === "ambiguous") {
      throw new SymbolLatticeError(
        "AMBIGUOUS_SYMBOL",
        `Symbol reference \"${reference}\" is ambiguous. Candidates: ${match.candidates
          .map((candidate) => candidate.qualifiedName)
          .join(", ")}`
      );
    }

    throw new SymbolLatticeError("SYMBOL_NOT_FOUND", `No symbol matches \"${reference}\".`);
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

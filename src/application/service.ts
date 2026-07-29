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
import type { GraphStore, SourceCatalog } from "../ports/index.js";
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
    this.graphStore.initialize(resolve(options.projectPath));
    return this.index(options);
  }

  public async index(options: IndexOptions): Promise<GraphContext["status"]> {
    this.assertSafeProjectPath(options);
    const projectPath = resolve(options.projectPath);
    this.graphStore.initialize(projectPath);
    const sourceDocuments = await this.sourceCatalog.discover(projectPath);
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
      indexedAt
    });

    this.graphStore.replaceProjectFacts({ projectPath, snapshot, indexedAt, artifactFacts });
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

    const [sourceDocuments, snapshot] = await Promise.all([
      this.sourceCatalog.discover(normalizedProjectPath),
      Promise.resolve(this.graphStore.getSnapshot(normalizedProjectPath))
    ]);
    return {
      ...persistedStatus,
      stale: !filesMatch(sourceDocuments, snapshot.files)
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

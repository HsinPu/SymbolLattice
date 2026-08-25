import type {
  GraphSnapshot,
  IndexedFile,
  IndexCounts,
  IndexStatus
} from "../domain/types.js";
import type { PersistedArtifactFacts } from "../domain/facts.js";
import type { ProjectIndexInputs } from "../domain/index-inputs.js";
import type { IndexWork } from "../domain/index-work.js";
import type {
  IndexedSourceDocument,
  IndexedSourceSearchHit,
  SourceSearchRequest
} from "../domain/source-search.js";

export interface ReplaceProjectFactsInput {
  readonly projectPath: string;
  readonly snapshot: GraphSnapshot;
  readonly indexedAt: string;
  readonly artifactFacts: readonly PersistedArtifactFacts[];
  readonly indexInputs: ProjectIndexInputs;
  readonly resolverVersion: string;
  /**
   * Additive v0.4 capability. Omission keeps an older GraphStore adapter
   * usable for graph-only indexing, while source retrieval stays unavailable.
   */
  readonly sourceDocuments?: readonly IndexedSourceDocument[];
  readonly sourceSearchVersion?: string;
  readonly indexWork?: IndexWork;
}

/** Graph data shared by query-only and synchronization read paths. */
export interface ActiveGraphBundle {
  readonly status: IndexStatus;
  readonly snapshot: GraphSnapshot;
  readonly indexInputs: ProjectIndexInputs | null;
  readonly extractorVersion: string | null;
  readonly resolverVersion: string | null;
  /** Undefined/null when an older adapter or generation has no source retrieval. */
  readonly sourceSearchVersion?: string | null;
}

/** Minimal active-generation projection needed for freshness checks. */
export interface ActiveStatusBundle {
  readonly status: IndexStatus;
  readonly files: readonly IndexedFile[];
  readonly indexInputs: ProjectIndexInputs | null;
  readonly extractorVersion: string | null;
  readonly resolverVersion: string | null;
  readonly sourceSearchVersion?: string | null;
}

/** All active-generation data required by synchronization, read consistently. */
export interface ActiveGenerationBundle extends ActiveGraphBundle {
  readonly artifactFacts: readonly PersistedArtifactFacts[];
}

/** A graph snapshot and bounded source hits from exactly the same generation. */
export interface ActiveSourceSearchBundle extends ActiveGraphBundle {
  readonly hits: readonly IndexedSourceSearchHit[];
}

/**
 * A graph snapshot and selected persisted source documents from exactly the
 * same active generation. For a nonempty path request, documents occur at
 * most once in first-requested-path order; unknown paths are omitted. An
 * empty request intentionally selects no documents, keeping this capability
 * bounded.
 */
export interface ActiveSourceDocumentsBundle extends ActiveGraphBundle {
  readonly documents: readonly IndexedSourceDocument[];
}

/**
 * A bounded source-only read from one expected active generation. Unlike
 * `ActiveSourceDocumentsBundle`, this projection deliberately omits the graph
 * snapshot so a query that already owns the matching graph does not materialize
 * every symbol, edge, and pending reference a second time.
 */
export interface ActiveSourceDocumentsProjection {
  readonly status: IndexStatus;
  readonly sourceSearchVersion?: string | null;
  readonly generationMatched: boolean;
  readonly documents: readonly IndexedSourceDocument[];
}

/**
 * Bounded query input for the SQLite-backed explore read projection. The
 * limits are deliberately carried by the request so the application can keep
 * the retrieval policy in one place while the store enforces hard caps.
 */
export interface BoundedGraphQueryRequest {
  readonly query: string;
  readonly terms: readonly string[];
  readonly maxSeedFiles: number;
  readonly maxSeedSymbols: number;
  readonly maxSymbolsPerFile: number;
  readonly maxNodes: number;
  readonly maxRelationships: number;
  readonly maxHops: number;
  /** Optional generation fence for callers that already read the active graph. */
  readonly expectedGenerationId?: string;
}

export interface BoundedGraphQueryDiagnostics {
  readonly generationMatched: boolean;
  readonly seedFiles: number;
  readonly seedSymbols: number;
  readonly returnedNodes: number;
  readonly returnedRelationships: number;
  readonly traversedHops: number;
  readonly truncated: boolean;
  readonly sourceSearchAvailable: boolean;
  readonly usedSourceSearch: boolean;
  readonly fallbackRequired: boolean;
}

/**
 * Active-generation graph metadata plus a bounded symbol/edge projection.
 * Files remain complete for freshness checks; pending references are omitted
 * because they are not needed by the bounded read path.
 */
export interface ActiveBoundedGraphBundle extends ActiveGraphBundle {
  readonly diagnostics: BoundedGraphQueryDiagnostics;
  readonly fallbackRequired: boolean;
}

export interface ActiveFileSummaryRequest {
  readonly limit: number;
  readonly pathPrefix?: string | undefined;
  readonly language?: IndexedFile["language"] | undefined;
  readonly afterFilePath?: string | undefined;
  readonly expectedGenerationId?: string | undefined;
}

export interface ActiveFileSummaryRow {
  readonly file: IndexedFile;
  readonly declarationCount: number;
  readonly edgeCount: number;
  readonly pendingReferenceCount: number;
}

/** SQL-paged file inventory with aggregate counts and no graph materialization. */
export interface ActiveFileSummaryPage extends ActiveStatusBundle {
  readonly generationMatched: boolean;
  readonly cursorMatched: boolean;
  readonly matchedFileCount: number;
  readonly remainingFileCount: number;
  readonly rows: readonly ActiveFileSummaryRow[];
}

/** Metadata for one immutable snapshot retained by a history-capable store. */
export interface GenerationHistoryEntry {
  readonly generationId: string;
  readonly indexedAt: string;
  /** Version of the immutable snapshot JSON payload, not the SQLite schema. */
  readonly snapshotVersion: number;
  readonly counts: IndexCounts;
  /** Null when this historical generation predates index-work telemetry. */
  readonly indexWork: IndexWork | null;
  readonly extractorVersion: string;
  readonly resolverVersion: string;
}

/**
 * A bounded retained-generation listing read with the current active
 * projection. `status` remains available for callers that only need its
 * metadata; `activeGraph` is the exact active projection read in the same
 * store transaction as the retained list.
 */
export interface GenerationHistoryBundle {
  readonly status: IndexStatus;
  readonly activeGraph: ActiveGraphBundle;
  readonly retentionLimit: number;
  readonly generations: readonly GenerationHistoryEntry[];
}

/** A selected immutable retained snapshot read with the current active status. */
export interface GenerationSnapshotBundle {
  readonly status: IndexStatus;
  readonly generation: GenerationHistoryEntry;
  readonly snapshot: GraphSnapshot;
}

/**
 * An atomic retained-generation comparison read. A missing selected snapshot
 * is represented by `null` for that selection; a `null` store result means a
 * trustworthy history itself is unavailable.
 */
export interface GenerationComparisonBundle {
  readonly history: GenerationHistoryBundle;
  readonly from: GenerationSnapshotBundle | null;
  readonly to: GenerationSnapshotBundle | null;
}

export interface GraphStore {
  isInitialized(projectPath: string): boolean;
  initialize(projectPath: string): void;
  getStatus(projectPath: string): IndexStatus;
  getSnapshot(projectPath: string): GraphSnapshot;
  getArtifactFacts(projectPath: string): readonly PersistedArtifactFacts[];
  getIndexInputs(projectPath: string): ProjectIndexInputs | null;
  /** Optional additive v0.4 read optimization; v0.3 adapters use the legacy bundle. */
  getActiveGraphBundle?(projectPath: string): ActiveGraphBundle;
  /** Optional lightweight freshness projection that omits symbols, edges, and pending references. */
  getActiveStatusBundle?(projectPath: string): ActiveStatusBundle;
  getActiveGenerationBundle(projectPath: string): ActiveGenerationBundle;
  /** Optional v0.4 retrieval capability. Its absence must not break graph reads. */
  getActiveSourceSearchBundle?(
    projectPath: string,
    request: SourceSearchRequest
  ): ActiveSourceSearchBundle;
  /**
   * Optional additive v0.4.1 retrieval capability. Paths are exact,
   * project-relative source paths; an unavailable projection is represented by
   * `sourceSearchVersion: null` and `documents: []`.
   */
  getActiveSourceDocumentsBundle?(
    projectPath: string,
    filePaths: readonly string[]
  ): ActiveSourceDocumentsBundle;
  /**
   * Optional source-only optimization for callers that already hold an active
   * graph bundle. A generation mismatch returns no documents so callers can
   * restart the complete read once without mixing generations.
   */
  getActiveSourceDocuments?(
    projectPath: string,
    expectedGenerationId: string,
    filePaths: readonly string[]
  ): ActiveSourceDocumentsProjection;
  /** Optional SQLite-driven bounded graph projection for explore queries. */
  getActiveBoundedGraphBundle?(
    projectPath: string,
    request: BoundedGraphQueryRequest
  ): ActiveBoundedGraphBundle;
  /** Optional SQLite-native file pagination and aggregate-count projection. */
  getActiveFileSummaryPage?(
    projectPath: string,
    request: ActiveFileSummaryRequest
  ): ActiveFileSummaryPage;
  /**
   * Optional v0.11 retained-history capability. `null` means this adapter or
   * index cannot provide a trustworthy history (including an active generation
   * without an immutable snapshot).
   */
  getGenerationHistoryBundle?(projectPath: string): GenerationHistoryBundle | null;
  /**
   * Optional v0.11 retained-snapshot capability. `null` means unavailable or
   * that the selected generation is no longer retained.
   */
  getGenerationSnapshotBundle?(
    projectPath: string,
    generationId: string
  ): GenerationSnapshotBundle | null;
  /**
   * Optional v0.11 atomic comparison capability. The retained history, active
   * projection, and both selected immutable snapshots are read from one
   * consistent store snapshot. Omit `toGenerationId` to select the active
   * generation. A null selection is no longer retained; a null result means
   * trustworthy retained history is unavailable.
   */
  getGenerationComparisonBundle?(
    projectPath: string,
    fromGenerationId: string,
    toGenerationId?: string
  ): GenerationComparisonBundle | null;
  replaceProjectFacts(input: ReplaceProjectFactsInput): void;
}

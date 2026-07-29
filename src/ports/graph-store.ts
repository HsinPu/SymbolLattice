import type {
  GraphSnapshot,
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

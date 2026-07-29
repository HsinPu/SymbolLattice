import type {
  GraphSnapshot,
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
  replaceProjectFacts(input: ReplaceProjectFactsInput): void;
}

import type {
  GraphSnapshot,
  IndexStatus
} from "../domain/types.js";
import type { PersistedArtifactFacts } from "../domain/facts.js";
import type { ProjectIndexInputs } from "../domain/index-inputs.js";
import type { IndexWork } from "../domain/index-work.js";

export interface ReplaceProjectFactsInput {
  readonly projectPath: string;
  readonly snapshot: GraphSnapshot;
  readonly indexedAt: string;
  readonly artifactFacts: readonly PersistedArtifactFacts[];
  readonly indexInputs: ProjectIndexInputs;
  readonly resolverVersion: string;
  readonly indexWork?: IndexWork;
}

/** All active-generation data read from one consistent storage snapshot. */
export interface ActiveGenerationBundle {
  readonly status: IndexStatus;
  readonly snapshot: GraphSnapshot;
  readonly artifactFacts: readonly PersistedArtifactFacts[];
  readonly indexInputs: ProjectIndexInputs | null;
  readonly extractorVersion: string | null;
  readonly resolverVersion: string | null;
}

export interface GraphStore {
  isInitialized(projectPath: string): boolean;
  initialize(projectPath: string): void;
  getStatus(projectPath: string): IndexStatus;
  getSnapshot(projectPath: string): GraphSnapshot;
  getArtifactFacts(projectPath: string): readonly PersistedArtifactFacts[];
  getIndexInputs(projectPath: string): ProjectIndexInputs | null;
  getActiveGenerationBundle(projectPath: string): ActiveGenerationBundle;
  replaceProjectFacts(input: ReplaceProjectFactsInput): void;
}

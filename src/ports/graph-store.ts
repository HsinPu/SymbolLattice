import type {
  GraphSnapshot,
  IndexStatus
} from "../domain/types.js";
import type { PersistedArtifactFacts } from "../domain/facts.js";
import type { ProjectIndexInputs } from "../domain/index-inputs.js";

export interface ReplaceProjectFactsInput {
  readonly projectPath: string;
  readonly snapshot: GraphSnapshot;
  readonly indexedAt: string;
  readonly artifactFacts: readonly PersistedArtifactFacts[];
  readonly indexInputs: ProjectIndexInputs;
}

export interface GraphStore {
  isInitialized(projectPath: string): boolean;
  initialize(projectPath: string): void;
  getStatus(projectPath: string): IndexStatus;
  getSnapshot(projectPath: string): GraphSnapshot;
  getArtifactFacts(projectPath: string): readonly PersistedArtifactFacts[];
  getIndexInputs(projectPath: string): ProjectIndexInputs | null;
  replaceProjectFacts(input: ReplaceProjectFactsInput): void;
}

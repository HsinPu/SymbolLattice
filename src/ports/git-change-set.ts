/**
 * A read-only, local Git selection contract. Application code supplies the
 * project path; the adapter must not shell out, fetch, or otherwise mutate a
 * repository while satisfying this port.
 */
export type GitChangeSetRequest =
  | {
      readonly mode: "working-tree";
    }
  | {
      readonly mode: "base";
      readonly baseRef: string;
    };

export const GIT_CHANGE_KINDS = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type-changed",
  "unmerged",
  "unknown"
] as const;

export type GitChangeKind = (typeof GIT_CHANGE_KINDS)[number];

/** One path record reported by local Git name-status output. */
export interface GitChangeRecord {
  readonly kind: GitChangeKind;
  /** Source-side project-relative path, when the record has one. */
  readonly previousPath: string | null;
  /** Destination-side project-relative path, when the record has one. */
  readonly currentPath: string | null;
  /** Git similarity score for rename/copy records; null for all other kinds. */
  readonly score: number | null;
}

/**
 * Immutable Git provenance plus the source file paths that may be sent to an
 * active SymbolLattice graph. `sourcePaths` deliberately retains both sides
 * of a rename/copy so the old generation cannot hide a missing current path.
 */
export interface GitChangeSet {
  readonly requestedBaseRef: string | null;
  /** Null for the HEAD-to-working-tree mode. */
  readonly mergeBaseCommit: string | null;
  readonly headCommit: string;
  readonly includesUntracked: boolean;
  readonly changes: readonly GitChangeRecord[];
  /** Sorted, unique TypeScript/JavaScript old/current paths from `changes`. */
  readonly sourcePaths: readonly string[];
}

/** A deliberately small error vocabulary that application code can map safely. */
export class GitChangeSetError extends Error {
  public constructor(
    public readonly code: "GIT_UNAVAILABLE" | "INVALID_GIT_BASE" | "MALFORMED_GIT_OUTPUT",
    message: string
  ) {
    super(message);
    this.name = "GitChangeSetError";
  }
}

export interface GitChangeSetProvider {
  getChangeSet(projectPath: string, request: GitChangeSetRequest): Promise<GitChangeSet>;
}

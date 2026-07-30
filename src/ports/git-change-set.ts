import type { GitUnifiedHunk } from "../domain/git-hunk-attribution.js";
import type { ArtifactLanguage } from "../domain/types.js";

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
  /** Sorted, unique supported-language old/current paths from `changes`. */
  readonly sourcePaths: readonly string[];
}

/** A deliberately small error vocabulary that application code can map safely. */
export class GitChangeSetError extends Error {
  public constructor(
    public readonly code:
      | "GIT_UNAVAILABLE"
      | "INVALID_GIT_BASE"
      | "MALFORMED_GIT_OUTPUT"
      | "GIT_CHANGE_SET_TOO_LARGE",
    message: string
  ) {
    super(message);
    this.name = "GitChangeSetError";
  }
}

export interface GitChangeSetProvider {
  getChangeSet(projectPath: string, request: GitChangeSetRequest): Promise<GitChangeSet>;
}

/**
 * An immutable base-to-HEAD selection. Unlike `GitChangeSetRequest`, this
 * intentionally excludes working-tree state: every patch and source blob is
 * read from the resolved merge-base and HEAD commits.
 */
export interface GitRevisionHunkRequest {
  readonly baseRef: string;
  /** Maximum number of supported old/current source paths to read. */
  readonly maxSourceFiles: number;
}

export const GIT_REVISION_SOURCE_AVAILABILITIES = [
  "available",
  "absent",
  "unsupported"
] as const;

export type GitRevisionSourceAvailability =
  (typeof GIT_REVISION_SOURCE_AVAILABILITIES)[number];

/**
 * Source text from exactly one side of an immutable Git comparison. A missing
 * side of an add/delete is `absent`; a non-source path is `unsupported`.
 */
export type GitRevisionSource =
  | {
      readonly revision: string;
      readonly filePath: string;
      readonly language: ArtifactLanguage;
      readonly availability: Extract<GitRevisionSourceAvailability, "available">;
      readonly sourceText: string;
    }
  | {
      readonly revision: string;
      readonly filePath: null;
      readonly language: null;
      readonly availability: Extract<GitRevisionSourceAvailability, "absent">;
      readonly sourceText?: never;
    }
  | {
      readonly revision: string;
      readonly filePath: string;
      readonly language: null;
      readonly availability: Extract<GitRevisionSourceAvailability, "unsupported">;
      readonly sourceText?: never;
    };

/**
 * One source-relevant Git path record together with its raw zero-context
 * unified hunks and immutable old/new source sides. Git provenance itself
 * remains complete on the enclosing `changeSet`.
 */
export interface GitRevisionHunkFile {
  readonly change: GitChangeRecord;
  readonly hunks: readonly GitUnifiedHunk[];
  readonly previous: GitRevisionSource;
  readonly current: GitRevisionSource;
}

export interface GitRevisionHunkSet {
  readonly changeSet: GitChangeSet;
  readonly files: readonly GitRevisionHunkFile[];
}

/**
 * Optional, additive immutable Git hunk capability. Implementations must not
 * inspect active filesystem contents while satisfying this port.
 */
export interface GitRevisionHunkProvider {
  getRevisionHunks(
    projectPath: string,
    request: GitRevisionHunkRequest
  ): Promise<GitRevisionHunkSet>;
}

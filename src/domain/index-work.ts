/** A transparent record of the work performed to publish one graph generation. */
export interface IndexWork {
  /** `index` always uses full extraction; `sync` may reuse unchanged raw facts. */
  readonly mode: "full" | "incremental";
  /** A whole-project resolution pass is retained for cross-file correctness. */
  readonly resolutionScope: "project";
  readonly addedFiles: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly removedFiles: readonly string[];
  readonly reExtractedFiles: readonly string[];
  readonly reusedArtifactFiles: readonly string[];
  /** Existing consumers reached through import or re-export reverse dependencies. */
  readonly dependencyInvalidatedFiles: readonly string[];
  /** Reasons that prevented reuse of otherwise unchanged raw facts. */
  readonly reuseInvalidationReasons: readonly IndexWorkReuseInvalidationReason[];
}

export const INDEX_WORK_REUSE_INVALIDATION_REASONS = [
  "extractor-version-changed",
  "missing-persisted-facts",
  "framework-evidence-changed"
] as const;

export type IndexWorkReuseInvalidationReason =
  (typeof INDEX_WORK_REUSE_INVALIDATION_REASONS)[number];

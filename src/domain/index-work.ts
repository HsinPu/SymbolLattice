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

export const INDEX_PERFORMANCE_POLICY = "index-performance-v1" as const;

export const INDEX_PERFORMANCE_PHASE_NAMES = [
  "load-prior-inputs",
  "load-status",
  "load-generation",
  "freshness-preflight",
  "scan",
  "extraction",
  "fast-path-check",
  "change-planning",
  "resolution",
  "persistence",
  "status-read"
] as const;

export type IndexPerformancePhaseName = (typeof INDEX_PERFORMANCE_PHASE_NAMES)[number];

export interface IndexPerformancePhase {
  readonly name: IndexPerformancePhaseName;
  /** Elapsed monotonic milliseconds spent in this phase. */
  readonly durationMs: number;
}

/**
 * Process-local timing receipt returned by an explicit index or sync command.
 * It is deliberately not persisted because timings describe one process run,
 * not immutable graph-generation semantics.
 */
export interface IndexOperationPerformance {
  readonly policy: typeof INDEX_PERFORMANCE_POLICY;
  readonly operation: "index" | "sync";
  readonly clock: "monotonic-milliseconds";
  readonly phases: readonly IndexPerformancePhase[];
  readonly totalDurationMs: number;
  readonly measuredDurationMs: number;
  readonly unattributedDurationMs: number;
}

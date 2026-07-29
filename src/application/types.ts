import type {
  EvidencePath,
  GraphRelation,
  ImpactPath,
  SymbolMatch,
  TestFileClassification
} from "../domain/graph.js";
import type {
  ArtifactLanguage,
  GraphEdge,
  GraphSnapshot,
  IndexStatus,
  SourceRange,
  SymbolNode
} from "../domain/types.js";

export interface GraphContext {
  readonly status: IndexStatus;
  readonly snapshot: GraphSnapshot;
}

export interface SourceExcerptLine {
  readonly line: number;
  readonly text: string;
}

export interface SourceExcerpt {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly SourceExcerptLine[];
}

/** Provenance for a source excerpt returned with graph evidence. */
export type SourceAvailability = "active-generation" | "unavailable" | "not-applicable";

/** Bounded context packs intentionally keep a small, explicit request surface. */
export const MAX_CONTEXT_REFERENCES = 8;
export const CONTEXT_MATCH_CANDIDATE_LIMIT = 25;
export const DEFAULT_CONTEXT_RELATION_LIMIT = 8;
export const MAX_CONTEXT_RELATION_LIMIT = 25;
export const DEFAULT_CONTEXT_MAX_HOPS = 4;
export const MAX_CONTEXT_MAX_HOPS = 6;
export const CONTEXT_MAX_VISITED_SYMBOLS = 500;
export const DEFAULT_CONTEXT_IMPACT_DEPTH = 2;
export const MAX_CONTEXT_IMPACT_DEPTH = 3;
export const DEFAULT_CONTEXT_IMPACT_LIMIT = 8;
export const MAX_CONTEXT_IMPACT_LIMIT = 25;
export const MAX_IMPACT_LIMIT = 100;

/** Bounded changed-file analysis mirrors common CI diff sizes without unbounded reads. */
export const MAX_AFFECTED_CHANGED_FILES = 50;
export const DEFAULT_AFFECTED_MAX_DEPTH = 5;
export const MAX_AFFECTED_MAX_DEPTH = 8;
export const DEFAULT_AFFECTED_LIMIT = 25;
export const MAX_AFFECTED_LIMIT = 100;
export const AFFECTED_MAX_VISITED_FILES_PER_INPUT = 500;

export interface FindResult {
  readonly status: IndexStatus;
  readonly symbols: readonly SymbolNode[];
}

/** Optional filters for persisted-source lexical retrieval. */
export interface SearchOptions {
  /** Maximum number of matching indexed files to return. */
  readonly limit?: number;
  /** Project-relative directory or file prefix, normalized to forward slashes. */
  readonly pathPrefix?: string;
  /** Restricts results to one indexed source language. */
  readonly language?: ArtifactLanguage;
}

/** One deterministic source hit from the active persisted graph generation. */
export interface SourceSearchHitResult {
  /** One-based position in the persisted retrieval ordering. */
  readonly rank: number;
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  /** Exact lexical span selected from the persisted source text. */
  readonly range: SourceRange;
  /** Small persisted-source context around the lexical span. */
  readonly excerpt: SourceExcerpt;
  /** Query terms found directly in the persisted source text. */
  readonly matchingTerms: readonly string[];
  /** Stable explanation of how this file matched the persisted lexical index. */
  readonly lexicalReason: string;
  /** All non-file declarations whose persisted ranges overlap the lexical span. */
  readonly symbolCandidates: readonly SymbolNode[];
}

export interface SearchResult {
  /** Freshness is evaluated against the current project without changing these persisted hits. */
  readonly status: IndexStatus;
  readonly results: readonly SourceSearchHitResult[];
}

export interface RelationResult {
  readonly status: IndexStatus;
  readonly symbol: SymbolNode;
  readonly relations: readonly GraphRelation[];
}

/** Optional output bound for the existing reverse-impact query. */
export interface ImpactOptions {
  readonly maxDepth?: number;
  readonly limit?: number;
}

export interface ImpactResult {
  readonly status: IndexStatus;
  readonly symbol: SymbolNode;
  readonly paths: readonly ImpactPath[];
  /** Present only when a caller explicitly requested a bounded result. */
  readonly truncated?: boolean;
}

/** Optional bounds for exact, file-level affected-test analysis. */
export interface AffectedTestsOptions {
  /** Maximum reverse import/export depth from each changed indexed file. */
  readonly maxDepth?: number;
  /** Maximum proof-bearing affected-test records returned across all inputs. */
  readonly limit?: number;
}

export type AffectedTestReason = "changed-test" | "exact-dependent";

/** One conventionally identified test file and its persisted graph proof. */
export interface AffectedTestEvidence {
  /** The indexed changed file that begins this exact reverse-dependency path. */
  readonly triggerFilePath: string;
  readonly filePath: string;
  readonly reason: AffectedTestReason;
  readonly classification: TestFileClassification;
  /** A zero-edge root path is retained when the changed file is itself a test. */
  readonly path: ImpactPath;
}

/** Actual limits and evidence semantics used for one affected-test query. */
export interface AffectedTestsBounds {
  readonly maxChangedFiles: number;
  readonly maxDepth: number;
  readonly limit: number;
  readonly maxVisitedFilesPerInput: number;
  readonly edgeKinds: readonly ["imports", "exports"];
  readonly resolution: "exact";
}

/** Canonical input paths, separated so missing index coverage cannot look successful. */
export interface AffectedTestsInputs {
  readonly requested: readonly string[];
  readonly indexed: readonly string[];
  readonly notIndexed: readonly string[];
}

export type AffectedTestsLimitation =
  | "index-stale"
  | "input-not-indexed"
  | "depth-limit-reached"
  | "visit-limit-reached"
  | "result-limit-reached";

export interface AffectedTestsResult {
  readonly status: IndexStatus;
  readonly bounds: AffectedTestsBounds;
  /** `null` means an older compatible adapter did not persist index inputs. */
  readonly indexScope: readonly string[] | null;
  /** Conventional test files available in the active generation before filtering. */
  readonly indexedTestFiles: number;
  readonly inputs: AffectedTestsInputs;
  readonly tests: {
    readonly items: readonly AffectedTestEvidence[];
    readonly resultLimitTruncated: boolean;
    readonly traversalTruncated: boolean;
    readonly depthLimitReached: boolean;
  };
  /** Completeness is only ever a claim about the active indexed generation. */
  readonly completeness: {
    readonly completeForActiveGeneration: boolean;
    readonly limitations: readonly AffectedTestsLimitation[];
  };
}

export interface ExploreResult {
  readonly status: IndexStatus;
  readonly match: SymbolMatch;
  /**
   * Additive provenance for v0.4.1-capable services. Omitted by compatible
   * legacy ExploreService embeddings that cannot make this claim.
   */
  readonly sourceAvailability?: SourceAvailability;
  readonly source: SourceExcerpt | null;
  readonly callers: readonly GraphRelation[];
  readonly callees: readonly GraphRelation[];
  readonly impact: readonly ImpactPath[];
}

/** Input bounds for a multi-symbol context pack. */
export interface ContextOptions {
  /** Maximum direct callers and callees retained for each exact symbol. */
  readonly relationLimit?: number;
  /** Maximum directed call/import edges in each adjacent-reference proof path. */
  readonly maxHops?: number;
  /** Maximum reverse dependency depth retained for each exact symbol. */
  readonly impactDepth?: number;
  /** Maximum reverse-impact paths retained for each exact symbol. */
  readonly impactLimit?: number;
}

/** Actual bounded values used to assemble a context result. */
export interface ContextBounds {
  readonly maxReferences: number;
  readonly matchCandidateLimit: number;
  readonly relationLimit: number;
  readonly maxHops: number;
  readonly maxVisitedSymbolsPerPath: number;
  readonly impactDepth: number;
  readonly impactLimit: number;
}

export interface BoundedRelations {
  readonly items: readonly GraphRelation[];
  readonly truncated: boolean;
}

export interface BoundedImpactPaths {
  readonly paths: readonly ImpactPath[];
  readonly truncated: boolean;
}

/** One input reference and its independently auditable graph/source context. */
export interface SymbolContext {
  readonly reference: string;
  readonly match: SymbolMatch;
  /** True when an ambiguous match has more persisted candidates than returned. */
  readonly matchCandidatesTruncated: boolean;
  readonly sourceAvailability: SourceAvailability;
  readonly source: SourceExcerpt | null;
  readonly callers: BoundedRelations;
  readonly callees: BoundedRelations;
  readonly impact: BoundedImpactPaths;
}

/**
 * A directed evidence check for adjacent input references. `path` is only
 * populated for `path` and `same-symbol`; no dynamic or reverse edge is made
 * up when no static route exists.
 */
export interface ContextEvidencePath {
  readonly fromReference: string;
  readonly toReference: string;
  readonly status: "path" | "same-symbol" | "no-path" | "not-applicable" | "truncated";
  readonly path: EvidencePath | null;
}

/**
 * A bounded, persisted-generation context pack. Results preserve input order;
 * evidence paths inspect only adjacent pairs in that order.
 */
export interface ContextResult {
  readonly status: IndexStatus;
  readonly bounds: ContextBounds;
  readonly contexts: readonly SymbolContext[];
  readonly evidencePaths: readonly ContextEvidencePath[];
}

/**
 * A proof-oriented view of one persisted graph relation. The edge retains its
 * optional evidence, while the resolved endpoints make the explanation useful
 * without a follow-up symbol lookup.
 */
export interface ExplainEdgeResult {
  readonly status: IndexStatus;
  readonly edge: GraphEdge;
  readonly source: SymbolNode;
  readonly target: SymbolNode | null;
}

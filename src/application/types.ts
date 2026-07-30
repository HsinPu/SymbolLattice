import type {
  ChildRelation,
  EntryPointOperation,
  EntryPointRecord,
  EntryPointTransport,
  EvidencePath,
  GraphRelation,
  ImpactPath,
  ParentRelation,
  RouteMethod,
  RouteRecord,
  SymbolMatch,
  TestFileClassification
} from "../domain/graph.js";
import type { GenerationSnapshotDiff } from "../domain/generation-history.js";
import type { IndexWork } from "../domain/index-work.js";
import type {
  ArtifactLanguage,
  GraphEdge,
  GraphSnapshot,
  IndexCounts,
  IndexStatus,
  SourceRange,
  SymbolNode
} from "../domain/types.js";
import type {
  GitHunkAttributionState,
  GitLineRange,
  GitUnifiedHunk
} from "../domain/git-hunk-attribution.js";
import type {
  GitChangeRecord,
  GitChangeSet,
  GitRevisionSourceAvailability
} from "../ports/git-change-set.js";

/** HTTP and client-navigation route extraction remains domain-owned; application callers consume these public records. */
export { ROUTE_METHODS } from "../domain/graph.js";
export type { RouteMethod, RouteRecord } from "../domain/graph.js";

/** Non-HTTP transport inventory stays separate from the HTTP route contract. */
export { ENTRYPOINT_OPERATIONS, ENTRYPOINT_TRANSPORTS } from "../domain/graph.js";
export type { EntryPointOperation, EntryPointRecord, EntryPointTransport } from "../domain/graph.js";

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

/** Fixed disclosure limits for the single-symbol declaration view. */
export const NODE_SOURCE_LINE_LIMIT = 200;
export const NODE_SOURCE_CHARACTER_LIMIT = 16_000;
export const NODE_RELATION_LIMIT = 25;
export const NODE_MATCH_CANDIDATE_LIMIT = 25;

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

/** Immutable Git hunk reads keep source and declaration work independently bounded. */
export const MAX_GIT_HUNK_SOURCE_FILES = 50;
export const DEFAULT_GIT_HUNK_LIMIT = 25;
export const MAX_GIT_HUNK_LIMIT = 100;
export const MAX_GIT_HUNK_DECLARATION_ANCHORS = 25;

/** Retained-generation reads are bounded independently from store retention. */
export const DEFAULT_GENERATION_HISTORY_LIMIT = 20;
export const MAX_GENERATION_HISTORY_LIMIT = 100;
export const DEFAULT_GENERATION_DIFF_LIMIT = 100;
export const MAX_GENERATION_DIFF_LIMIT = 100;

export interface GenerationHistoryOptions {
  /** Maximum retained-generation summaries returned from the store-owned history. */
  readonly limit?: number;
}

export interface GenerationDiffOptions {
  /** Omit to compare the required `from` generation with the current active generation. */
  readonly toGenerationId?: string;
  /** Maximum items returned independently for every structural change category. */
  readonly limit?: number;
}

/** Immutable metadata for one retained graph snapshot. */
export interface GenerationHistorySummary {
  readonly generationId: string;
  readonly indexedAt: string;
  readonly snapshotVersion: number;
  readonly counts: IndexCounts;
  /** Null means this older immutable generation predates index-work telemetry. */
  readonly indexWork: IndexWork | null;
  readonly extractorVersion: string;
  readonly resolverVersion: string;
}

/** Store retention and request-bound disclosure for one history response. */
export interface GenerationHistoryRetention {
  /** Maximum immutable generations the configured store is allowed to retain. */
  readonly capacity: number;
  /** Immutable generations currently retained before applying this request's limit. */
  readonly retained: number;
  /** Number returned after the caller's bounded request was applied. */
  readonly returned: number;
  /** True when retained summaries were omitted only because of the request bound. */
  readonly truncated: boolean;
}

export interface GenerationHistoryBounds {
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * Retained immutable summaries plus separately named live active freshness.
 * `activeStatus` is a non-mutating freshness scan over the active graph read
 * in the same store transaction as the retained history.
 */
export interface GenerationHistoryResult {
  readonly activeStatus: IndexStatus;
  readonly bounds: GenerationHistoryBounds;
  readonly retention: GenerationHistoryRetention;
  /** Ordered newest-first by immutable indexed timestamp, then generation ID. */
  readonly generations: readonly GenerationHistorySummary[];
}

export interface GenerationDiffBounds {
  /** Applied independently to every added, removed, and modified change category. */
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * Immutable structural comparison; no Git hunk, move, or live-source
 * attribution is implied. `activeStatus` is a non-mutating live-freshness
 * scan over the active graph captured with this atomic comparison read.
 */
export interface GenerationDiffResult extends GenerationSnapshotDiff {
  readonly activeStatus: IndexStatus;
  readonly bounds: GenerationDiffBounds;
  readonly from: GenerationHistorySummary;
  readonly to: GenerationHistorySummary;
}

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

/** Public route listing remains intentionally bounded independently of graph size. */
export const DEFAULT_ROUTE_LIMIT = 50;
export const MAX_ROUTE_LIMIT = 100;

/** Optional exact discriminator and prefix filters for persisted route records. */
export interface RoutesOptions {
  /** One supported uppercase HTTP method, ALL, or the NAVIGATE client-route discriminator. */
  readonly method?: RouteMethod;
  /** A nonempty route-path prefix beginning with a forward slash. */
  readonly pathPrefix?: string;
  /** Maximum persisted route records returned from the active generation. */
  readonly limit?: number;
}

/** Fixed disclosure bounds reported with every active-generation route listing. */
export interface RoutesBounds {
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * A read-only active-generation route inventory. The underlying records are
 * deterministic persisted graph facts; `status` reports current live freshness
 * without initializing, indexing, or synchronizing the project.
 */
export interface RoutesResult {
  readonly status: IndexStatus;
  readonly bounds: RoutesBounds;
  readonly routes: readonly RouteRecord[];
  /** True only when matching persisted records were omitted by `bounds.limit`. */
  readonly truncated: boolean;
}

/** Public non-HTTP entrypoint listing remains independently bounded from route inventory. */
export const DEFAULT_ENTRYPOINT_LIMIT = 50;
export const MAX_ENTRYPOINT_LIMIT = 100;

/** Optional transport, operation, and literal-name-prefix filters for persisted entrypoints. */
export interface EntrypointsOptions {
  /** One supported non-HTTP transport. */
  readonly transport?: EntryPointTransport;
  /** One operation supported by a transport extractor. */
  readonly operation?: EntryPointOperation;
  /** A nonempty exact prefix for the persisted transport-level entrypoint name. */
  readonly namePrefix?: string;
  /** Maximum persisted entrypoint records returned from the active generation. */
  readonly limit?: number;
}

/** Fixed disclosure bounds reported with every active-generation entrypoint listing. */
export interface EntrypointsBounds {
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * A read-only active-generation inventory for GraphQL, microservice, and
 * WebSocket entrypoints. HTTP routes deliberately remain available only via
 * `RoutesResult` so transport semantics cannot be conflated.
 */
export interface EntrypointsResult {
  readonly status: IndexStatus;
  readonly bounds: EntrypointsBounds;
  readonly entrypoints: readonly EntryPointRecord[];
  /** True only when matching persisted records were omitted by `bounds.limit`. */
  readonly truncated: boolean;
}

/** Direct hierarchy retrieval remains independently bounded from graph size. */
export const DEFAULT_HIERARCHY_LIMIT = 25;
export const MAX_HIERARCHY_LIMIT = 100;

/** Maximum parent and child records returned independently from a persisted hierarchy view. */
export interface HierarchyOptions {
  readonly limit?: number;
}

/** Fixed disclosure bounds reported with every direct hierarchy view. */
export interface HierarchyBounds {
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * A read-only direct declaration hierarchy from the active persisted graph.
 * Parents may contain unresolved evidence; children are exact relationships
 * only. The query never recursively traverses, initializes, indexes, or syncs.
 */
export interface HierarchyResult {
  readonly status: IndexStatus;
  readonly symbol: SymbolNode;
  readonly bounds: HierarchyBounds;
  readonly parents: readonly ParentRelation[];
  readonly children: readonly ChildRelation[];
  readonly parentsTruncated: boolean;
  readonly childrenTruncated: boolean;
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

/** Optional Git baseline combined with the existing affected-test bounds. */
export interface GitAffectedTestsOptions extends AffectedTestsOptions {
  /** Omit for working-tree changes; otherwise compare the requested Git base. */
  readonly baseRef?: string;
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

/**
 * Git-derived source selection plus exact persisted-generation test proofs.
 * `affected` is null when the Git change set contains no supported source
 * paths, so an empty selection cannot look like a complete graph traversal.
 */
export interface GitAffectedTestsResult {
  /** Current index freshness, evaluated without indexing or synchronization. */
  readonly status: IndexStatus;
  /** Immutable provenance returned by the injected Git change-set provider. */
  readonly changeSet: GitChangeSet;
  /** Exact test evidence for selected supported source paths, when any exist. */
  readonly affected: AffectedTestsResult | null;
}

/** Options for one immutable Git base-to-HEAD hunk attribution query. */
export interface GitHunksOptions {
  /** Maximum hunk records returned across every changed source file. */
  readonly limit?: number;
}

/** Fixed safety bounds and the caller-selected global hunk result bound. */
export interface GitHunksBounds {
  /** Maximum old/current TypeScript or JavaScript paths the Git adapter may read. */
  readonly maxSourceFiles: number;
  /** Maximum declarations anchored on each old or new hunk side. */
  readonly maxDeclarationAnchorsPerSide: number;
  /** Global hunk-record limit applied after deterministic ordering. */
  readonly limit: number;
  readonly maximumLimit: number;
}

/**
 * Declarations anchored on one immutable source side. `identityScope` applies
 * to every returned `SymbolNode.id`: it is meaningful only in that side's
 * revision-local extraction and never asserts old/new continuity.
 */
export interface GitHunkDeclarationAnchors {
  readonly identityScope: "revision-local";
  readonly items: readonly SymbolNode[];
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * One old or new hunk side. It is deliberately revision-local: no active
 * graph, cross-side symbol identity, move attribution, or rename continuity is
 * implied by this evidence.
 */
export interface GitHunkSideResult {
  readonly revision: string;
  readonly path: string | null;
  readonly sourceAvailability: GitRevisionSourceAvailability;
  readonly lineRange: GitLineRange;
  readonly attribution: GitHunkAttributionState;
  readonly declarationAnchors: GitHunkDeclarationAnchors;
}

/** One immutable unified hunk and independent old/new local declaration evidence. */
export interface GitHunkResultItem {
  readonly change: GitChangeRecord;
  readonly hunk: GitUnifiedHunk;
  readonly old: GitHunkSideResult;
  readonly new: GitHunkSideResult;
}

/** A globally bounded, deterministically ordered immutable Git hunk result. */
export interface GitHunksResult {
  /** Immutable Git provenance from the injected revision-hunk provider. */
  readonly changeSet: GitChangeSet;
  readonly bounds: GitHunksBounds;
  readonly hunks: {
    readonly items: readonly GitHunkResultItem[];
    readonly total: number;
    readonly truncated: boolean;
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
  /** Maximum directed call/route/import edges in each adjacent-reference proof path. */
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

/**
 * The declaration-range text retained with one active graph generation. The
 * text is an exact prefix of that persisted range when `truncated` is true;
 * it is never read from the current filesystem.
 */
export interface NodeSource {
  readonly filePath: string;
  readonly range: SourceRange;
  readonly text: string;
  /** Physical source lines covered by the full persisted declaration range. */
  readonly totalLines: number;
  /** Raw UTF-16 code units in the full persisted declaration range. */
  readonly totalCharacters: number;
  readonly truncated: boolean;
}

/** Fixed limits applied to every `node` response. */
export interface NodeBounds {
  readonly sourceLineLimit: number;
  readonly sourceCharacterLimit: number;
  readonly relationLimit: number;
  readonly matchCandidateLimit: number;
}

/**
 * A generation-bound exact symbol view. Nonexact matches deliberately carry
 * no source or relationships, preserving the match result for callers to
 * render ambiguity and absence without inventing graph evidence.
 */
export interface NodeResult {
  readonly status: IndexStatus;
  readonly bounds: NodeBounds;
  readonly match: SymbolMatch;
  /** True only when an ambiguous match has more persisted candidates than returned. */
  readonly matchCandidatesTruncated: boolean;
  readonly sourceAvailability: SourceAvailability;
  readonly source: NodeSource | null;
  readonly callers: BoundedRelations;
  readonly callees: BoundedRelations;
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

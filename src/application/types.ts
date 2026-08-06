import type {
  ChildRelation,
  EntryPointOperation,
  EntryPointRecord,
  EntryPointTransport,
  EvidencePath,
  GraphRelation,
  ImpactPath,
  ImpactSummary,
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
  EdgeKind,
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
export type { ImpactSummary, RouteMethod, RouteRecord } from "../domain/graph.js";

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

/** A bounded excerpt whose emitted text is provably tied to persisted source. */
export interface DeliveredSourceExcerpt extends SourceExcerpt {
  readonly range: SourceRange;
  readonly text: string;
  readonly sourceIdentity: import("./source-delivery.js").SourceDeliveryIdentity;
  /** Raw UTF-16 code units requested before the shared context budget was applied. */
  readonly requestedCharacters: number;
  /** Canonical UTF-16 code units actually emitted in `text`. */
  readonly emittedCharacters: number;
  readonly truncated: boolean;
  readonly truncationReason: "character-budget" | null;
}

/** Provenance for a source excerpt returned with graph evidence. */
export type SourceAvailability = "active-generation" | "unavailable" | "not-applicable";

/** Fixed disclosure limits for the single-symbol declaration view. */
export const NODE_SOURCE_LINE_LIMIT = 200;
export const NODE_SOURCE_CHARACTER_LIMIT = 16_000;
export const NODE_RELATION_LIMIT = 25;
export const NODE_MATCH_CANDIDATE_LIMIT = 25;

/** Persisted file views are deliberately windowed for Agent context safety. */
export const DEFAULT_FILE_VIEW_LINE_LIMIT = 200;
export const MAX_FILE_VIEW_LINE_LIMIT = 2_000;

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
/** One-question investigations stay compact while selecting enough persisted evidence to be useful. */
export const DEFAULT_INVESTIGATE_SEARCH_LIMIT = 12;
export const DEFAULT_INVESTIGATE_SYMBOL_LIMIT = 4;
export const MAX_INVESTIGATE_SYMBOL_LIMIT = MAX_CONTEXT_REFERENCES;
/** Fixed safety bounds for the exact multi-hop investigation ranking. */
export const INVESTIGATE_IMPACT_RANKING_MAX_DEPTH = 3;
export const INVESTIGATE_IMPACT_RANKING_PATH_LIMIT = 24;
/** Fixed safety bounds for the query-seeded exact-static topology ranking. */
export const INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS = 3;
export const INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS = 500;
export const INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT = 64;
export const INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT = 20;
export const INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY = 0.2;
/** Ranking is explicit: lexical preserves FTS order; graph-based strategies disclose static signals. */
export const INVESTIGATE_RANKING_STRATEGIES = ["lexical", "structure", "impact", "topology"] as const;
export type InvestigateRankingStrategy = (typeof INVESTIGATE_RANKING_STRATEGIES)[number];
export const DEFAULT_INVESTIGATE_RANKING_STRATEGY: InvestigateRankingStrategy = "lexical";
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
  readonly ranking: import("./generated-ranking.js").GeneratedRankingDiagnostics;
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
  readonly generated: import("../domain/generated-files.js").GeneratedFileClassification;
  readonly ranking: {
    readonly retrievalRank: number;
    readonly finalRank: number;
    readonly generatedPenalty: 0 | 1;
    readonly reason: import("./generated-ranking.js").GeneratedRankReason;
  };
}

export interface SearchResult {
  /** Freshness is evaluated against the current project without changing these persisted hits. */
  readonly status: IndexStatus;
  readonly results: readonly SourceSearchHitResult[];
  readonly ranking: import("./generated-ranking.js").GeneratedRankingDiagnostics & {
    readonly requestedLimit: number;
    readonly candidateLimit: number;
    /** True means the bounded retrieval pool was full; more lexical matches may exist. */
    readonly candidatePoolAtLimit: boolean;
  };
}

/** Public persisted file listing remains intentionally bounded independently of graph size. */
export const DEFAULT_FILE_LIMIT = 50;
export const MAX_FILE_LIMIT = 100;
export const MAX_FILE_PATTERN_LENGTH = 256;
export const MAX_FILE_TREE_DEPTH = 20;
export const MAX_FILE_CURSOR_LENGTH = 2048;
export const FILE_FORMATS = ["flat", "tree", "grouped"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

/** Optional project-relative path-prefix and exact language filters for indexed files. */
export interface FilesOptions {
  /** Project-relative directory or file prefix, normalized to forward slashes. */
  readonly pathPrefix?: string;
  /** Restricts results to one source language stored in the active generation. */
  readonly language?: ArtifactLanguage;
  /** Anchored project-relative glob. `*` excludes `/`; `**` may cross directories. */
  readonly pattern?: string;
  /** Optional projection; flat preserves the original file-list contract. */
  readonly format?: FileFormat;
  /** Tree-only maximum visible path depth. Top-level entries have depth 1. */
  readonly maxDepth?: number;
  /** Maximum indexed file records returned from the active generation. */
  readonly limit?: number;
  /** Opaque continuation token from a previous files result. */
  readonly cursor?: string;
}

/** One active-generation file plus deterministic graph-record counts for that file. */
export interface IndexedFileSummary {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  readonly indexedAt: string;
  /** Generation-bound verdict with the exact path/header rules that caused it. */
  readonly generated: import("../domain/generated-files.js").GeneratedFileClassification;
  /** Generation-bound production/test role with the exact path rule that caused it. */
  readonly sourceRole: import("../domain/source-roles.js").SourceRoleClassification;
  /** Non-file declaration symbols stored for this file. */
  readonly declarationCount: number;
  /** Resolved and unresolved graph edges whose evidence location is this file. */
  readonly edgeCount: number;
  /** Raw pending-reference facts retained for this file before graph resolution. */
  readonly pendingReferenceCount: number;
}

/** Fixed disclosure bounds reported with every active-generation file listing. */
export interface FilesBounds {
  readonly limit: number;
  readonly maximumLimit: number;
}

export interface FileTreeFileNode {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly file: IndexedFileSummary;
}

export interface FileTreeDirectoryNode {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  /** Number of returned file records represented below this directory. */
  readonly returnedFileCount: number;
  /** True when descendants exist but were intentionally hidden by maxDepth. */
  readonly depthLimited: boolean;
  readonly children: readonly FileTreeNode[];
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirectoryNode;

export interface FileTreeProjection {
  readonly returnedFileCount: number;
  readonly children: readonly FileTreeNode[];
}

export interface FileLanguageGroup {
  readonly language: ArtifactLanguage;
  readonly fileCount: number;
  readonly files: readonly IndexedFileSummary[];
}

export interface FilePagination {
  readonly returnedFileCount: number;
  readonly remainingFileCount: number;
  readonly nextCursor: string | null;
}

/**
 * A read-only active-generation file inventory. File records and counts are
 * derived only from the persisted graph; `status` reports live freshness
 * without initializing, indexing, or synchronizing the project.
 */
export interface FilesResult {
  readonly status: IndexStatus;
  readonly bounds: FilesBounds;
  readonly format: FileFormat;
  /** Count after path, language, and glob filters but before `bounds.limit`. */
  readonly matchedFileCount: number;
  /** Continuation evidence bound to this generation and file-selection filters. */
  readonly pagination: FilePagination;
  readonly files: readonly IndexedFileSummary[];
  readonly tree?: FileTreeProjection;
  readonly groups?: readonly FileLanguageGroup[];
  /** True only when matching persisted files were omitted by `bounds.limit`. */
  readonly truncated: boolean;
}

/** Public route listing remains intentionally bounded independently of graph size. */
export const DEFAULT_ROUTE_LIMIT = 50;
export const MAX_ROUTE_LIMIT = 100;

/** Optional exact discriminator, path-prefix, and host-condition filters for persisted route records. */
export interface RoutesOptions {
  /** One supported uppercase HTTP method, ALL, or the NAVIGATE client-route discriminator. */
  readonly method?: RouteMethod;
  /** A nonempty route-path prefix beginning with a forward slash. */
  readonly pathPrefix?: string;
  /** One exact literal route host condition, without normalization. */
  readonly domain?: string;
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
  readonly ranking: import("./generated-ranking.js").GeneratedRankingDiagnostics;
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
  /** Deterministic grouping and endpoint coverage for exactly these returned paths. */
  readonly summary: ImpactSummary;
  /** Present only when a caller explicitly requested a bounded result. */
  readonly truncated?: boolean;
}

/** Optional bounds for exact, file-level affected-test analysis. */
export interface AffectedTestsOptions {
  /** Maximum reverse import/export depth from each changed indexed file. */
  readonly maxDepth?: number;
  /** Maximum proof-bearing affected-test records returned across all inputs. */
  readonly limit?: number;
  /** Optional anchored project-relative glob that replaces conventional test classification. */
  readonly testPattern?: string;
}

/** Optional Git baseline combined with the existing affected-test bounds. */
export interface GitAffectedTestsOptions extends AffectedTestsOptions {
  /** Omit for working-tree changes; otherwise compare the requested Git base. */
  readonly baseRef?: string;
  /** Optional project-relative file or directory matched on either Git path side. */
  readonly pathPrefix?: string;
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
  readonly testSelection: {
    readonly mode: "conventional" | "glob";
    readonly pattern: string | null;
  };
  /** Test files selected by the disclosed classifier in the active generation. */
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
  readonly selection: {
    readonly pathPrefix: string | null;
    readonly totalChanges: number;
    readonly matchedSourceChanges: number;
    readonly sourcePaths: readonly string[];
  };
  /** Test classifier selected even when the Git change set contains no supported source path. */
  readonly testSelection: AffectedTestsResult["testSelection"];
  /** Exact test evidence for selected supported source paths, when any exist. */
  readonly affected: AffectedTestsResult | null;
}

/** Options for one immutable Git base-to-HEAD hunk attribution query. */
export interface GitHunksOptions {
  /** Optional project-relative file or directory selector, matched on either Git path side. */
  readonly pathPrefix?: string;
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
  readonly selection: {
    /** Normalized selector, or null when every changed source path is eligible. */
    readonly pathPrefix: string | null;
    /** Complete count from the immutable Git change set before source/path selection. */
    readonly totalChanges: number;
    /** Source-relevant change records retained after path selection. */
    readonly matchedSourceChanges: number;
  };
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
  readonly source: DeliveredSourceExcerpt | null;
  readonly callers: readonly GraphRelation[];
  readonly callees: readonly GraphRelation[];
  readonly impact: readonly ImpactPath[];
  /** Additive unified-explore mode; omitted only by compatible legacy embeddings. */
  readonly mode?: "exact-symbol" | "query";
  /** Present only when a non-exact query was converted into a bounded focus plan. */
  readonly queryPlan?: import("./explore-query.js").ExploreQueryPlan | null;
  /** Exact-only bounded paths whose unselected interior symbols explain focus connectivity. */
  readonly pathSpinePlan?: import("./explore-path-spines.js").ExplorePathSpinePlan | null;
  /** Ranked, generation-bound focus contexts for natural-language query mode. */
  readonly focuses?: readonly ExploreFocus[];
  /** Exact selected-to-selected relations; heuristic and unresolved edges are excluded. */
  readonly connections?: readonly ExploreConnection[];
  readonly connectionsTruncated?: boolean;
  /** Shared source allocation across query focuses; null for exact-symbol mode. */
  readonly sourceAllocation?: ContextSourceAllocationResult | null;
  /** Bounded additional exact-connection call-site plan; null for exact-symbol mode. */
  readonly sourceWindowPlan?: import("./explore-source-windows.js").ExploreSourceWindowPlan | null;
  /** Persisted-generation call-site excerpts outside the primary focus excerpts. */
  readonly sourceWindows?: readonly ExploreSourceWindow[];
  /** One auditable remainder allocation inside the same total source envelope. */
  readonly sourceWindowAllocation?: ExploreSourceWindowAllocationResult | null;
  /** Adjacent selected-focus path evidence; empty for exact-symbol mode. */
  readonly evidencePaths?: readonly ContextEvidencePath[];
}

export type ExploreFocus = import("./explore-query.js").ExploreQuerySelection & SymbolContext;

export interface ExploreConnection {
  readonly source: SymbolNode;
  readonly target: SymbolNode;
  readonly edge: GraphEdge;
}

export type ExploreSourceWindow =
  import("./explore-source-windows.js").ExploreSourceWindowPlanItem & {
    readonly source: DeliveredSourceExcerpt;
  };

type ExploreSourceWindowCharacterAllocation =
  import("./explore-source-windows.js").ExploreSourceWindowCharacterAllocation;

export type ExploreSourceWindowAllocationResult = Omit<
  ExploreSourceWindowCharacterAllocation,
  "summary" | "windows"
> & {
  readonly summary: ExploreSourceWindowCharacterAllocation["summary"] & {
    readonly emittedCharacters: number;
    readonly emittedWindows: number;
    readonly reservedButNotEmittedCharacters: number;
  };
  readonly windows: readonly (
    ExploreSourceWindowCharacterAllocation["windows"][number] & {
      readonly emittedCharacters: number;
      readonly reservedButNotEmittedCharacters: number;
    }
  )[];
};

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
  /** Shared raw-source character ceiling across every exact context reference. */
  readonly sourceCharacterBudget?: number;
}

/**
 * Input bounds for one persisted-source query that is expanded into graph
 * context. Search and graph-context limits remain independent and explicit.
 */
export interface InvestigateOptions extends ContextOptions {
  /** Maximum matching indexed source files examined for candidate symbols. */
  readonly searchLimit?: number;
  /** Maximum distinct exact symbol candidates expanded into graph context. */
  readonly symbolLimit?: number;
  /** Shared emitted declaration-source envelope across all selected files. */
  readonly sourceCharacterBudget?: number;
  /** Controls how each allocated persisted declaration is rendered. */
  readonly sourceRenderMode?: import("./context-rendering.js").InvestigateSourceRenderMode;
  /** `lexical` preserves persisted FTS order; `structure` and `impact` use disclosed static signals. */
  readonly ranking?: InvestigateRankingStrategy;
  /** Project-relative directory or file prefix for the persisted source search. */
  readonly pathPrefix?: string;
  /** Restricts the persisted source search to one indexed language. */
  readonly language?: ArtifactLanguage;
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
  readonly source: {
    readonly totalCharacterBudget: number;
    readonly minimumTotalCharacterBudget: number;
    readonly maximumTotalCharacterBudget: number;
    readonly minimumPerReference: number;
    readonly allocationPolicy: typeof import("./context-source-allocation.js").CONTEXT_SOURCE_ALLOCATION_POLICY;
  };
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
  /** Tool-independent identity for the exact persisted text delivered here. */
  readonly sourceIdentity: import("./source-delivery.js").SourceDeliveryIdentity;
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

export interface FileViewOptions {
  /** One-based first persisted source line. Defaults to 1. */
  readonly offset?: number;
  /** Maximum persisted source lines returned. */
  readonly limit?: number;
  /** Return structural evidence without source lines. */
  readonly symbolsOnly?: boolean;
}

export interface FileViewSymbol {
  readonly id: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SymbolNode["kind"];
  readonly range: SourceRange;
  readonly isExported: boolean;
}

export interface FileViewDependent {
  readonly filePath: string;
  readonly edgeKinds: readonly Extract<EdgeKind, "imports" | "exports">[];
  readonly edgeCount: number;
}

/** One immutable active-generation file view; never reconstructed from the live worktree. */
export interface FileViewResult {
  readonly status: IndexStatus;
  readonly selection: {
    readonly requestedPath: string;
    readonly filePath: string;
    readonly source: "active-generation";
    readonly resolution: "exact-path" | "case-insensitive-path" | "unique-suffix";
  };
  readonly file: {
    readonly language: ArtifactLanguage;
    readonly indexedAt: string;
  };
  readonly bounds: {
    readonly offset: number;
    readonly limit: number;
    readonly maximumLimit: number;
    readonly totalLines: number;
    readonly returnedLines: number;
    readonly truncatedBefore: boolean;
    readonly truncatedAfter: boolean;
  };
  readonly contentAvailability: "active-generation" | "withheld-sensitive-format" | "symbols-only";
  /** Null when source lines are withheld or intentionally omitted. */
  readonly sourceIdentity: import("./source-delivery.js").SourceDeliveryIdentity | null;
  readonly lines: readonly SourceExcerptLine[];
  readonly symbols: readonly FileViewSymbol[];
  readonly dependents: readonly FileViewDependent[];
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
  readonly source: DeliveredSourceExcerpt | null;
  readonly callers: BoundedRelations;
  readonly callees: BoundedRelations;
  readonly impact: BoundedImpactPaths;
}

export type ContextSourceReferenceAllocationReceipt =
  import("./context-source-allocation.js").ContextSourceReferenceAllocation & {
    readonly emittedCharacters: number;
    readonly reservedButNotEmittedCharacters: number;
  };

export type ContextSourceAllocationResult =
  Omit<import("./context-source-allocation.js").ContextSourceAllocation, "contexts" | "summary"> & {
    readonly summary: import("./context-source-allocation.js").ContextSourceAllocation["summary"] & {
      readonly emittedCharacters: number;
      readonly reservedButNotEmittedCharacters: number;
    };
    readonly contexts: readonly ContextSourceReferenceAllocationReceipt[];
  };

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
  readonly sourceAllocation: ContextSourceAllocationResult;
  readonly evidencePaths: readonly ContextEvidencePath[];
}

/** Direct, exact static graph facts used only by the optional `structure` selection strategy. */
export interface InvestigationStructuralSignals {
  readonly directExactCallerCount: number;
  readonly directExactCalleeCount: number;
  readonly isExported: boolean;
  /** `callerCount + calleeCount + (isExported ? 1 : 0)`; it does not include FTS relevance. */
  readonly score: number;
}

/** One fixed-depth bucket in a candidate exact reverse-impact traversal. */
export interface InvestigationImpactDepthCount {
  /** One-based shortest reverse-impact depth from the candidate. */
  readonly depth: number;
  /** Unique impacted symbols first discovered at this depth. */
  readonly count: number;
}

/** Count of final discovery-edge kinds across retained shortest exact impact paths. */
export interface InvestigationImpactEdgeKindCount {
  readonly kind: EdgeKind;
  readonly count: number;
}

/**
 * Disclosed exact reverse-impact evidence for the optional `impact` ranking.
 * The score is `sum(countAtDepth * (maxDepth - depth + 1))`; it has no FTS,
 * runtime, semantic, heuristic, or undisclosed weighting component.
 */
export interface InvestigationImpactSignals {
  readonly maxDepth: number;
  readonly pathLimit: number;
  /** Number of retained unique impacted symbols, each represented by one shortest exact path. */
  readonly exactDependentCount: number;
  readonly directExactDependentCount: number;
  readonly multiHopExactDependentCount: number;
  readonly pathCountsByDepth: readonly InvestigationImpactDepthCount[];
  readonly finalEdgeKindCounts: readonly InvestigationImpactEdgeKindCount[];
  readonly score: number;
  /** True when another exact impacted symbol was found after the path limit. */
  readonly truncated: boolean;
}

/**
 * Disclosed query-seeded exact-static topology evidence for the optional
 * `topology` ranking. The score is fixed-iteration non-restart walk mass
 * inside one bounded undirected scope; it is relative-only and has no FTS,
 * runtime, semantic, or heuristic weighting component.
 */
export interface InvestigationTopologySignals {
  readonly maxHops: number;
  readonly maxVisitedSymbols: number;
  readonly seedLimit: number;
  /** Number of lexical candidates retained in the equal-weight restart vector. */
  readonly seedCount: number;
  /** True when lexical candidates beyond `seedLimit` were not used as seeds. */
  readonly seedTruncated: boolean;
  /** Whether this candidate itself was retained in the restart seed vector. */
  readonly seeded: boolean;
  /** Total exact-static symbols retained in the bounded walk scope. */
  readonly scopeSymbolCount: number;
  /** Exact-static neighbors retained for this candidate inside that scope. */
  readonly scopedExactNeighborCount: number;
  /**
   * Exact persisted-edge incidences for this candidate inside the retained
   * scope. Every relation kind is present in fixed order; counts do not alter
   * the neighbor-deduplicated topology score.
   */
  readonly scopedExactIncidentEdgeKindCounts: readonly InvestigationTopologyEdgeKindCount[];
  readonly iterationCount: number;
  readonly restartProbability: number;
  readonly edgeKinds: readonly EdgeKind[];
  readonly score: number;
  /** The visited-symbol bound prevented at least one exact-static neighbor from entering the scope. */
  readonly traversalTruncated: boolean;
  /** The maximum-hop boundary left at least one exact-static neighbor outside the scope. */
  readonly depthLimitReached: boolean;
}

/** One exact persisted relation kind and its incident-edge count for a topology candidate. */
export interface InvestigationTopologyEdgeKindCount {
  readonly kind: EdgeKind;
  readonly count: number;
}

/** One selected declaration, traced back to its persisted lexical-search candidate. */
export interface InvestigationSelection {
  /** One-based position after the requested ranking strategy has been applied. */
  readonly selectionRank: number;
  /** One-based rank in `search.results`. */
  readonly sourceRank: number;
  /** One-based rank in that source result's `symbolCandidates`. */
  readonly candidateRank: number;
  readonly generatedRanking: import("./generated-ranking.js").GeneratedRankingItem;
  readonly structuralSignals: InvestigationStructuralSignals;
  /** Present only when `bounds.ranking` is `topology`; otherwise null to avoid extra traversal work. */
  readonly topologySignals: InvestigationTopologySignals | null;
  /** Present only when `bounds.ranking` is `impact`; otherwise null to avoid extra traversal work. */
  readonly impactSignals: InvestigationImpactSignals | null;
  /** Persisted lexical evidence used to focus an evidence-preserving source slice. */
  readonly lexicalFocus: {
    readonly language: ArtifactLanguage;
    readonly range: SourceRange;
    readonly matchingTerms: readonly string[];
  };
  readonly symbol: SymbolNode;
}

/** Deterministic candidate selection disclosure for a one-question investigation. */
export interface InvestigationSelectionResult {
  readonly items: readonly InvestigationSelection[];
  /** Distinct candidate symbols found before the request's symbol bound is applied. */
  readonly total: number;
  /** True when the explicit symbol bound omitted otherwise eligible candidates. */
  readonly truncated: boolean;
}

/**
 * One bounded declaration source for a selected symbol. Entries retain the
 * selection order and only use persisted text from the same active generation.
 */
export interface InvestigationDeclaration {
  /** Matches one selected symbol's qualified name. */
  readonly reference: string;
  readonly sourceAvailability: SourceAvailability;
  /** Exact persisted declaration text, subject to the declared response bounds. */
  readonly source: InvestigationRenderedNodeSource | null;
  /** Null only when persisted declaration source is unavailable. */
  readonly allocation: InvestigationDeclarationAllocation | null;
  /** Null only when persisted declaration source is unavailable. */
  readonly render: import("./context-rendering.js").InvestigationSourceRenderReceipt | null;
}

/** Exact generation-bound source plan with a backwards-compatible primary segment. */
export type InvestigationRenderedNodeSource = NodeSource & {
  readonly renderedRange: SourceRange;
  /** UTF-16 offsets inside the bounded persisted declaration text. */
  readonly renderedCharacterOffsets: {
    readonly start: number;
    readonly end: number;
  };
  /** Exact, independently hashable slices from the same bounded declaration. */
  readonly renderedSegments: readonly (
    import("./context-rendering.js").InvestigationSourceSegment & {
      readonly sourceIdentity: import("./source-delivery.js").SourceDeliveryIdentity;
    }
  )[];
  /** Segment mirrored by the backwards-compatible `text` and rendered range fields. */
  readonly primarySegmentIndex: number;
};

export interface InvestigationDeclarationAllocation {
  readonly selectionRank: number;
  readonly requestedCharacters: number;
  readonly allocatedCharacters: number;
  readonly emittedCharacters: number;
  readonly truncated: boolean;
}

export type InvestigationSourceFileAllocationReceipt =
  import("./context-allocation.js").InvestigationSourceFileAllocation & {
  readonly declarationReferences: readonly string[];
  readonly emittedCharacters: number;
  readonly reservedButNotEmittedCharacters: number;
};

export type InvestigationSourceAllocationResult =
  Omit<import("./context-allocation.js").InvestigationSourceAllocation, "files" | "summary"> & {
  readonly summary: import("./context-allocation.js").InvestigationSourceAllocation["summary"] & {
    readonly emittedCharacters: number;
    readonly reservedButNotEmittedCharacters: number;
  };
  readonly files: readonly InvestigationSourceFileAllocationReceipt[];
};

/** Actual bounds used for one persisted-source investigation. */
export interface InvestigateBounds {
  readonly searchLimit: number;
  readonly maximumSearchLimit: number;
  readonly symbolLimit: number;
  readonly maximumSymbolLimit: number;
  /** Actual selection strategy; `lexical` is the backwards-compatible default. */
  readonly ranking: InvestigateRankingStrategy;
  /** Per-declaration safety caps plus one shared emitted-source envelope. */
  readonly declarationSource: {
    readonly sourceLineLimit: number;
    readonly sourceCharacterLimit: number;
    readonly totalCharacterBudget: number;
    readonly minimumTotalCharacterBudget: number;
    readonly maximumTotalCharacterBudget: number;
    readonly allocationPolicy: typeof import("./context-allocation.js").INVESTIGATION_SOURCE_ALLOCATION_POLICY;
    readonly renderPolicy: typeof import("./context-rendering.js").INVESTIGATION_SOURCE_RENDER_POLICY;
    readonly requestedRenderMode: import("./context-rendering.js").InvestigateSourceRenderMode;
  };
  readonly context: ContextBounds;
}

/**
 * A one-question structural response assembled entirely from one active,
 * persisted graph/source generation. It does not perform semantic inference or
 * create a new index generation.
 */
export interface InvestigateResult {
  readonly status: IndexStatus;
  readonly query: string;
  readonly bounds: InvestigateBounds;
  readonly search: {
    readonly results: readonly SourceSearchHitResult[];
  };
  readonly selection: InvestigationSelectionResult;
  /** Bounded exact declaration source for every selected symbol, in selection order. */
  readonly declarations: readonly InvestigationDeclaration[];
  readonly sourceAllocation: InvestigationSourceAllocationResult;
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

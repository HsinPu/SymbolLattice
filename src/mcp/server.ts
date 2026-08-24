import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

import { SYMBOL_LATTICE_MCP_INSTRUCTIONS } from "../agent-guidance.js";
import { SymbolLatticeError } from "../application/errors.js";
import {
  INVESTIGATION_SOURCE_ALLOCATION_POLICY,
  INVESTIGATION_SOURCE_MINIMUM_PER_FILE,
  MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
  MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET
} from "../application/context-allocation.js";
import {
  CONTEXT_SOURCE_ALLOCATION_POLICY,
  CONTEXT_SOURCE_MINIMUM_PER_REFERENCE,
  MAX_CONTEXT_SOURCE_CHARACTER_BUDGET,
  MIN_CONTEXT_SOURCE_CHARACTER_BUDGET
} from "../application/context-source-allocation.js";
import {
  EXPLORE_GENERATED_SOURCE_WORTH,
  EXPLORE_ICON_SOURCE_WORTH,
  EXPLORE_LOCALIZATION_SOURCE_WORTH,
  EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS,
  EXPLORE_QUERY_GRAPH_EXPANSION_POLICY,
  EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS,
  EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY,
  EXPLORE_QUERY_GRAPH_MASS_LIMITS,
  EXPLORE_QUERY_GRAPH_MASS_POLICY,
  EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS,
  EXPLORE_QUERY_LIMITS,
  EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS,
  EXPLORE_QUERY_LOW_VALUE_FILTER_POLICY,
  EXPLORE_QUERY_PLAN_POLICY,
  EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS,
  EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_POLICY,
  EXPLORE_QUERY_SOURCE_WORTH_POLICY,
  EXPLORE_TEST_SOURCE_WORTH
} from "../application/explore-query.js";
import {
  EXPLORE_PATH_SPINE_LIMITS,
  EXPLORE_PATH_SPINE_POLICY
} from "../application/explore-path-spines.js";
import {
  EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
  EXPLORE_SOURCE_WINDOW_LIMITS,
  EXPLORE_SOURCE_WINDOW_POLICY
} from "../application/explore-source-windows.js";
import {
  INVESTIGATE_SOURCE_RENDER_MODES,
  INVESTIGATION_SOURCE_MAXIMUM_SEGMENTS,
  INVESTIGATION_SOURCE_RENDER_POLICY,
  INVESTIGATION_SOURCE_SEGMENT_POLICY
} from "../application/context-rendering.js";
import {
  MCP_INVESTIGATE_SOURCE_SESSION_LIMITS,
  MCP_INVESTIGATE_SOURCE_SESSION_MODES,
  MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
  McpInvestigateSourceSession,
  type McpInvestigateSourceSessionMode
} from "./investigate-session-source.js";
import {
  MCP_SOURCE_SESSION_LIMITS,
  MCP_SOURCE_SESSION_MODES,
  MCP_SOURCE_SESSION_POLICY,
  McpSourceSession,
  type McpSourceSessionMode
} from "./source-session.js";
import {
  MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS,
  MCP_SOURCE_POINTER_POLICY
} from "./source-pointer.js";
import {
  SOURCE_DELIVERY_IDENTITY_POLICY,
  SOURCE_DELIVERY_MAXIMUM_OFFSET_SPANS,
  SOURCE_DELIVERY_OFFSET_MAP_POLICY
} from "../application/source-delivery.js";
import {
  MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
  type AutoSyncDiagnosticJournalOptions,
  type AutoSyncDiagnosticJournalResult
} from "../application/auto-sync-journal.js";
import {
  MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS,
  type AutoSyncDiagnosticsOptions,
  type AutoSyncDiagnosticsResult,
  type AutoSyncStatusResult
} from "../application/watch.js";
import {
  MAX_AFFECTED_CHANGED_FILES,
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_REFERENCES,
  MAX_CONTEXT_RELATION_LIMIT,
  MAX_IMPACT_LIMIT,
  INVESTIGATE_IMPACT_RANKING_MAX_DEPTH,
  INVESTIGATE_IMPACT_RANKING_PATH_LIMIT,
  INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT,
  INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS,
  INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS,
  INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY,
  INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT,
  INVESTIGATE_RANKING_STRATEGIES,
  MAX_INVESTIGATE_SYMBOL_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  MAX_GIT_HUNK_LIMIT,
  MAX_HIERARCHY_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  FILE_FORMATS,
  MAX_FILE_PATTERN_LENGTH,
  MAX_FILE_TREE_DEPTH,
  MAX_FILE_LIMIT,
  MAX_FILE_CURSOR_LENGTH,
  MAX_FILE_VIEW_LINE_LIMIT,
  MAX_ROUTE_LIMIT,
  ENTRYPOINT_OPERATIONS,
  ENTRYPOINT_TRANSPORTS,
  ROUTE_METHODS
} from "../application/types.js";
import type {
  AffectedTestsOptions,
  AffectedTestsResult,
  ContextOptions,
  ContextResult,
  EntrypointsOptions,
  EntrypointsResult,
  ExplainEdgeResult,
  ExploreResult,
  FilesOptions,
  FilesResult,
  FileViewOptions,
  FileViewResult,
  GenerationDiffOptions,
  GenerationDiffResult,
  GenerationHistoryOptions,
  GenerationHistoryResult,
  GitAffectedTestsOptions,
  GitAffectedTestsResult,
  GitHunksOptions,
  GitHunksResult,
  HierarchyOptions,
  HierarchyResult,
  ImpactOptions,
  ImpactResult,
  InvestigateOptions,
  InvestigateResult,
  NodeResult,
  EntryPointOperation,
  EntryPointTransport,
  RouteMethod,
  RoutesOptions,
  RoutesResult,
  SearchOptions,
  SearchResult
} from "../application/types.js";
import {
  ARTIFACT_LANGUAGES,
  DEFAULT_EXACT_IMPACT_EDGE_KINDS,
  DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS,
  EDGE_EVIDENCE_STAGES,
  MAX_SOURCE_SEARCH_LIMIT
} from "../domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";
import {
  MCP_READ_QUERY_POOL_STATES,
  McpReadQueryPool,
  type McpReadQueryExecutor,
  type McpReadQueryPoolStatusService
} from "./read-query-pool.js";
import type { McpReadToolName } from "./read-query-protocol.js";
import {
  SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE,
  resolveMcpToolSelection,
  type SymbolLatticeMcpToolName
} from "./tool-selection.js";

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
}

/** Additive exact-node retrieval seam; older explore-only embeddings remain valid. */
export interface NodeService {
  node(projectPath: string, reference: string): Promise<NodeResult>;
}

/** Additive immutable file-view seam; older embeddings remain valid. */
export interface FileViewService {
  fileView(projectPath: string, filePath: string, options?: FileViewOptions): Promise<FileViewResult>;
}

/** Additive multi-symbol context seam; older explore embeddings remain valid. */
export interface ContextService {
  context(
    projectPath: string,
    references: readonly string[],
    options?: ContextOptions
  ): Promise<ContextResult>;
}

/** Additive changed-file test-analysis seam for existing read-only embeddings. */
export interface AffectedTestsService {
  affectedTests(
    projectPath: string,
    filePaths: readonly string[],
    options?: AffectedTestsOptions
  ): Promise<AffectedTestsResult>;
}

/** Additive local-Git change-set seam; older affected-test embeddings remain valid. */
export interface GitAffectedTestsService {
  gitAffectedTestsAvailable(): boolean;
  affectedTestsFromGit(
    projectPath: string,
    options?: GitAffectedTestsOptions
  ): Promise<GitAffectedTestsResult>;
}

/** Additive immutable Git hunk attribution seam; it does not require an index. */
export interface GitHunksService {
  gitHunksAvailable(): boolean;
  gitHunks(
    projectPath: string,
    baseRef: string,
    options?: GitHunksOptions
  ): Promise<GitHunksResult>;
}

export interface ExplainEdgeService {
  explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult>;
}

/** Minimal retrieval seam so existing explore-only embeddings remain usable. */
export interface SearchService {
  search(projectPath: string, query: string, options?: SearchOptions): Promise<SearchResult>;
}

/** Additive one-question structural context seam for compatible read-only embeddings. */
export interface InvestigateService {
  investigate(
    projectPath: string,
    query: string,
    options?: InvestigateOptions
  ): Promise<InvestigateResult>;
}

/** Additive bounded reverse-impact seam for existing read-only embeddings. */
export interface ImpactService {
  impact(projectPath: string, reference: string, options?: ImpactOptions): Promise<ImpactResult>;
}

/** Additive active-generation file inventory seam for existing read-only embeddings. */
export interface FilesService {
  files(projectPath: string, options?: FilesOptions): Promise<FilesResult>;
}

/** Additive active-generation route inventory seam for existing read-only embeddings. */
export interface RoutesService {
  routes(projectPath: string, options?: RoutesOptions): Promise<RoutesResult>;
}

/** Additive active-generation non-HTTP entrypoint inventory seam for read-only embeddings. */
export interface EntrypointsService {
  entrypoints(projectPath: string, options?: EntrypointsOptions): Promise<EntrypointsResult>;
}

/** Additive direct-hierarchy seam for existing read-only embeddings. */
export interface HierarchyService {
  hierarchy(
    projectPath: string,
    reference: string,
    options?: HierarchyOptions
  ): Promise<HierarchyResult>;
}

/** Optional retained-snapshot listing seam for compatible read-only embeddings. */
export interface GenerationHistoryService {
  history(
    projectPath: string,
    options?: GenerationHistoryOptions
  ): Promise<GenerationHistoryResult>;
}

/** Optional structural snapshot-diff seam for compatible read-only embeddings. */
export interface GenerationDiffService {
  diff(
    projectPath: string,
    fromGenerationId: string,
    options?: GenerationDiffOptions
  ): Promise<GenerationDiffResult>;
}

/** Optional host-owned watcher-health seam for MCP processes with auto-sync enabled or disabled. */
export interface AutoSyncStatusService {
  autoSyncStatus(): Promise<AutoSyncStatusResult>;
}

/** Optional host-owned, bounded watcher timeline seam for operational MCP diagnostics. */
export interface AutoSyncDiagnosticsService {
  autoSyncDiagnostics(options?: AutoSyncDiagnosticsOptions): Promise<AutoSyncDiagnosticsResult>;
}

/** Optional project-owned durable watcher-history seam for operational MCP diagnostics. */
export interface AutoSyncDiagnosticJournalService {
  autoSyncJournal(
    options?: AutoSyncDiagnosticJournalOptions
  ): Promise<AutoSyncDiagnosticJournalResult>;
}

/** Optional host-owned operational seam for a bounded MCP read-query pool. */
export interface QueryPoolStatusService extends McpReadQueryPoolStatusService {}

export type ReadOnlyMcpService = ExploreService & ExplainEdgeService;
export type NodeMcpService = ExploreService & NodeService;
export type SearchMcpService = ExploreService & SearchService;
export type InvestigateMcpService = ExploreService & InvestigateService;
export type ImpactMcpService = ExploreService & ImpactService;
export type FilesMcpService = ExploreService & FilesService;
export type FileViewMcpService = ExploreService & FileViewService;
export type RoutesMcpService = ExploreService & RoutesService;
export type EntrypointsMcpService = ExploreService & EntrypointsService;
export type HierarchyMcpService = ExploreService & HierarchyService;
export type ContextMcpService = ExploreService & ContextService;
export type AffectedTestsMcpService = ExploreService & AffectedTestsService;
export type GitAffectedTestsMcpService = ExploreService & GitAffectedTestsService;
export type GitHunksMcpService = ExploreService & GitHunksService;
export type GenerationHistoryMcpService = ExploreService & GenerationHistoryService;
export type GenerationDiffMcpService = ExploreService & GenerationDiffService;
export type AutoSyncStatusMcpService = ExploreService & AutoSyncStatusService;
export type AutoSyncDiagnosticsMcpService = ExploreService & AutoSyncDiagnosticsService;
export type AutoSyncDiagnosticJournalMcpService = ExploreService & AutoSyncDiagnosticJournalService;

export interface ExploreToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
  readonly sourceSessionMode?: McpSourceSessionMode | undefined;
}

export interface NodeToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
  readonly sourceSessionMode?: McpSourceSessionMode | undefined;
}

export interface ContextToolArguments {
  readonly references: readonly string[];
  readonly projectPath?: string | undefined;
  readonly relationLimit?: number | undefined;
  readonly maxHops?: number | undefined;
  readonly impactDepth?: number | undefined;
  readonly impactLimit?: number | undefined;
  readonly sourceCharacterBudget?: number | undefined;
  readonly sourceSessionMode?: McpSourceSessionMode | undefined;
}

export interface AffectedTestsToolArguments {
  readonly filePaths: readonly string[];
  readonly projectPath?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
  readonly testPattern?: string | undefined;
}

export interface GitAffectedTestsToolArguments {
  readonly projectPath?: string | undefined;
  /** Omit for HEAD-to-working-tree selection; otherwise compare local merge-base to HEAD. */
  readonly baseRef?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
  readonly path?: string | undefined;
  readonly testPattern?: string | undefined;
}

export interface GitHunksToolArguments {
  readonly projectPath?: string | undefined;
  /** Required local Git baseline; the service resolves its merge-base with HEAD. */
  readonly baseRef: string;
  readonly limit?: number | undefined;
  readonly path?: string | undefined;
}

export interface ExplainEdgeToolArguments {
  readonly edgeId: string;
  readonly projectPath?: string | undefined;
}

export interface SearchToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
  readonly limit?: number | undefined;
  /** Project-relative source-path prefix. */
  readonly path?: string | undefined;
  readonly language?: SearchOptions["language"];
}

export interface InvestigateToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
  readonly searchLimit?: number | undefined;
  readonly symbolLimit?: number | undefined;
  readonly sourceCharacterBudget?: number | undefined;
  readonly sourceRenderMode?: InvestigateOptions["sourceRenderMode"];
  readonly sourceSessionMode?: McpInvestigateSourceSessionMode | McpSourceSessionMode | undefined;
  readonly ranking?: InvestigateOptions["ranking"];
  /** Project-relative source-path prefix. */
  readonly path?: string | undefined;
  readonly language?: InvestigateOptions["language"];
  readonly relationLimit?: number | undefined;
  readonly maxHops?: number | undefined;
  readonly impactDepth?: number | undefined;
  readonly impactLimit?: number | undefined;
}

export interface ImpactToolArguments {
  readonly reference: string;
  readonly projectPath?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
}

export interface FilesToolArguments {
  readonly projectPath?: string | undefined;
  /** Project-relative source-path prefix. */
  readonly path?: string | undefined;
  readonly language?: FilesOptions["language"];
  readonly pattern?: string | undefined;
  readonly format?: FilesOptions["format"];
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface FileViewToolArguments {
  readonly filePath: string;
  readonly projectPath?: string | undefined;
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
  readonly symbolsOnly?: boolean | undefined;
  readonly sourceSessionMode?: McpSourceSessionMode | undefined;
}

export interface RoutesToolArguments {
  readonly projectPath?: string | undefined;
  readonly method?: RouteMethod | undefined;
  /** Slash-leading route path prefix. */
  readonly path?: string | undefined;
  /** Exact literal route domain condition. */
  readonly domain?: string | undefined;
  readonly limit?: number | undefined;
}

export interface EntrypointsToolArguments {
  readonly projectPath?: string | undefined;
  readonly transport?: EntryPointTransport | undefined;
  readonly operation?: EntryPointOperation | undefined;
  /** Nonempty persisted transport-level entrypoint name prefix. */
  readonly name?: string | undefined;
  readonly limit?: number | undefined;
}

export interface HierarchyToolArguments {
  readonly projectPath?: string | undefined;
  readonly reference: string;
  readonly limit?: number | undefined;
}

export interface GenerationHistoryToolArguments {
  readonly projectPath?: string | undefined;
  readonly limit?: number | undefined;
}

export interface GenerationDiffToolArguments {
  readonly fromGenerationId: string;
  readonly toGenerationId?: string | undefined;
  readonly projectPath?: string | undefined;
  readonly limit?: number | undefined;
}

export interface AutoSyncStatusToolArguments {}

export interface AutoSyncDiagnosticsToolArguments {
  readonly limit?: number | undefined;
}

export interface AutoSyncDiagnosticJournalToolArguments {
  readonly limit?: number | undefined;
}

export interface QueryPoolStatusToolArguments {}

export interface ReadOnlyToolResponse {
  readonly [key: string]: unknown;
  readonly content: {
    type: "text";
    text: string;
  }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

export type ExploreToolResponse = ReadOnlyToolResponse;
export type NodeToolResponse = ReadOnlyToolResponse;
export type ContextToolResponse = ReadOnlyToolResponse;
export type AffectedTestsToolResponse = ReadOnlyToolResponse;
export type GitAffectedTestsToolResponse = ReadOnlyToolResponse;
export type GitHunksToolResponse = ReadOnlyToolResponse;
export type ExplainEdgeToolResponse = ReadOnlyToolResponse;
export type SearchToolResponse = ReadOnlyToolResponse;
export type InvestigateToolResponse = ReadOnlyToolResponse;
export type ImpactToolResponse = ReadOnlyToolResponse;
export type FilesToolResponse = ReadOnlyToolResponse;
export type FileViewToolResponse = ReadOnlyToolResponse;
export type RoutesToolResponse = ReadOnlyToolResponse;
export type EntrypointsToolResponse = ReadOnlyToolResponse;
export type HierarchyToolResponse = ReadOnlyToolResponse;
export type GenerationHistoryToolResponse = ReadOnlyToolResponse;
export type GenerationDiffToolResponse = ReadOnlyToolResponse;
export type AutoSyncStatusToolResponse = ReadOnlyToolResponse;
export type AutoSyncDiagnosticsToolResponse = ReadOnlyToolResponse;
export type AutoSyncDiagnosticJournalToolResponse = ReadOnlyToolResponse;
export type QueryPoolStatusToolResponse = ReadOnlyToolResponse;

/** Optional execution seam for graph reads that must not own an index writer. */
export interface CreateMcpServerOptions {
  readonly readQueryExecutor?: McpReadQueryExecutor | undefined;
  readonly queryPoolStatusService?: QueryPoolStatusService | undefined;
  /** Undefined preserves the complete programmatic surface; stdio hosts pass an explicit selection. */
  readonly enabledTools?: ReadonlySet<SymbolLatticeMcpToolName> | undefined;
}

function isMcpToolEnabled(
  enabledTools: ReadonlySet<SymbolLatticeMcpToolName> | undefined,
  toolName: SymbolLatticeMcpToolName
): boolean {
  return toolName === "explore" || enabledTools === undefined || enabledTools.has(toolName);
}

function executeReadTool<TResponse extends ReadOnlyToolResponse>(
  executor: McpReadQueryExecutor | undefined,
  toolName: McpReadToolName,
  arguments_: unknown,
  fallback: () => Promise<TResponse>
): Promise<TResponse> {
  return executor === undefined ? fallback() : executor.execute(toolName, arguments_, fallback);
}

const sourcePositionOutputSchema = z.object({
  line: z.number().int(),
  column: z.number().int()
});

const sourceRangeOutputSchema = z.object({
  start: sourcePositionOutputSchema,
  end: sourcePositionOutputSchema
});

const sourceExcerptOutputSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  lines: z.array(
    z.object({
      line: z.number().int(),
      text: z.string()
    })
  )
});

const indexStatusOutputSchema = z
  .object({
    initialized: z.boolean(),
    stale: z.boolean(),
    staleReasons: z.array(z.string()),
    projectPath: z.string(),
    indexedAt: z.string().nullable(),
    generationId: z.string().nullable(),
    counts: z.object({
      files: z.number().int().nonnegative(),
      symbols: z.number().int().nonnegative(),
      edges: z.number().int().nonnegative(),
      pendingReferences: z.number().int().nonnegative()
    }),
    lastIndexWork: z.object({}).passthrough().optional()
  })
  .passthrough();

const watchErrorOutputSchema = z.object({
  code: z.string(),
  message: z.string()
});

const autoSyncStateOutputSchema = z.enum([
  "disabled",
  "starting",
  "fresh",
  "pending",
  "syncing",
  "retrying",
  "blocked",
  "failed",
  "stopped"
]);

const autoSyncWatcherModeOutputSchema = z.enum([
  "disabled",
  "starting",
  "native-events",
  "polling-fallback",
  "polling-only",
  "blocked"
]);

const autoSyncOwnerLeaseStateOutputSchema = z.enum([
  "not-required",
  "acquiring",
  "owned",
  "unavailable"
]);

const watchEventOutputSchema = z.enum([
  "started",
  "stale-detected",
  "synced",
  "sync-failed",
  "status-failed",
  "event-watch-active",
  "event-watch-failed",
  "event-pending",
  "event-fresh",
  "fresh-observed",
  "owner-lease-unavailable",
  "stopped"
]);

const autoSyncSnapshotOutputSchema = z.object({
  enabled: z.boolean(),
  state: autoSyncStateOutputSchema,
  watcherMode: autoSyncWatcherModeOutputSchema,
  ownerLease: z.object({
    state: autoSyncOwnerLeaseStateOutputSchema,
    observedAt: z.string().nullable(),
    error: watchErrorOutputSchema.nullable()
  }),
  observedAt: z.string().nullable(),
  lastEvent: watchEventOutputSchema.nullable(),
  lastSuccessfulSyncAt: z.string().nullable(),
  lastSyncFailure: watchErrorOutputSchema.nullable(),
  eventWatchFailure: watchErrorOutputSchema.nullable(),
  retryDelayMs: z.number().int().positive().nullable(),
  pendingFileCount: z.number().int().nonnegative().nullable(),
  pendingFiles: z.array(z.string()),
  pendingFilesTruncated: z.boolean(),
  pendingFilesUnknown: z.boolean()
});

const autoSyncStatusOutputSchema = z
  .object({
    index: indexStatusOutputSchema,
    autoSync: autoSyncSnapshotOutputSchema
  })
  .passthrough();

const autoSyncDiagnosticEventOutputSchema = z.object({
  hostId: z.string().min(1),
  sequence: z.number().int().positive(),
  event: watchEventOutputSchema,
  observedAt: z.string(),
  state: autoSyncStateOutputSchema,
  watcherMode: autoSyncWatcherModeOutputSchema,
  generationId: z.string().nullable(),
  error: watchErrorOutputSchema.nullable(),
  retryDelayMs: z.number().int().positive().nullable(),
  pendingFileCount: z.number().int().nonnegative().nullable(),
  pendingFiles: z.array(z.string()),
  pendingFilesTruncated: z.boolean(),
  pendingFilesUnknown: z.boolean()
});

const autoSyncDiagnosticsOutputSchema = z
  .object({
    index: z.object({
      status: indexStatusOutputSchema.nullable(),
      error: watchErrorOutputSchema.nullable()
    }),
    autoSync: autoSyncSnapshotOutputSchema,
    timeline: z.object({
      capacity: z.literal(MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS),
      retained: z.number().int().nonnegative().max(MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS),
      returned: z.number().int().nonnegative().max(MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS),
      dropped: z.number().int().nonnegative(),
      truncated: z.boolean(),
      events: z.array(autoSyncDiagnosticEventOutputSchema).max(MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS)
    })
  })
  .passthrough();

const autoSyncDiagnosticJournalOutputSchema = z
  .object({
    state: z.enum(["active", "read-only", "unavailable", "failed"]),
    capacity: z.literal(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS),
    retained: z.number().int().nonnegative().max(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS),
    returned: z.number().int().nonnegative().max(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS),
    dropped: z.number().int().nonnegative(),
    truncated: z.boolean(),
    lastPersistedAt: z.string().nullable(),
    error: watchErrorOutputSchema.nullable(),
    events: z
      .array(autoSyncDiagnosticEventOutputSchema)
      .max(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS)
  })
  .passthrough();

const queryPoolStatusOutputSchema = z
  .object({
    state: z.enum(MCP_READ_QUERY_POOL_STATES),
    capacity: z.number().int().positive(),
    workers: z.object({
      live: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      idle: z.number().int().nonnegative(),
      crashes: z.number().int().nonnegative()
    }),
    requests: z.object({
      inflight: z.number().int().nonnegative(),
      queued: z.number().int().nonnegative()
    }),
    fallbacks: z.object({
      coldStart: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
      queueTimeout: z.number().int().nonnegative(),
      workerFailure: z.number().int().nonnegative(),
      invalidWorkerResponse: z.number().int().nonnegative(),
      unsupportedTool: z.number().int().nonnegative(),
      total: z.number().int().nonnegative()
    })
  })
  .passthrough();

const sourceDeliveryOffsetMapOutputSchema = z.object({
  policy: z.literal(SOURCE_DELIVERY_OFFSET_MAP_POLICY),
  deliveredTextLength: z.number().int().nonnegative(),
  sourceTextLength: z.number().int().nonnegative(),
  spans: z.array(z.object({
    kind: z.enum(["identity", "normalized-line-ending"]),
    deliveredCharacterOffsets: z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative()
    }),
    fullFileCharacterOffsets: z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative()
    })
  })).max(SOURCE_DELIVERY_MAXIMUM_OFFSET_SPANS),
  mapSha256: z.string().regex(/^[0-9a-f]{64}$/u)
});

const sourceDeliveryIdentityOutputSchema = z.object({
  policy: z.literal(SOURCE_DELIVERY_IDENTITY_POLICY),
  id: z.string().regex(/^source:[0-9a-f]{64}$/u),
  canonicalization: z.literal("line-endings-lf"),
  filePath: z.string().min(1),
  fullFileCharacterOffsets: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  }),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  offsetMap: sourceDeliveryOffsetMapOutputSchema
});

const sourceCharacterRangeOutputSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
});

const sourcePointerSymbolOutputSchema = z.object({
  reference: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  range: sourceRangeOutputSchema
});

const sourcePointerOutputSchema = z.object({
  policy: z.literal(MCP_SOURCE_POINTER_POLICY),
  sourceId: z.string().regex(/^source:[0-9a-f]{64}$/u),
  filePath: z.string().min(1),
  range: sourceRangeOutputSchema,
  lineSpan: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive()
  }),
  fullFileCharacterOffsets: sourceCharacterRangeOutputSchema,
  symbols: z.array(sourcePointerSymbolOutputSchema).max(MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS),
  symbolsTruncated: z.boolean(),
  display: z.string().min(1),
  pointerSha256: z.string().regex(/^[0-9a-f]{64}$/u)
});

const sourceCoverageReceiptOutputSchema = z.object({
  sourceId: z.string().regex(/^source:[0-9a-f]{64}$/u),
  firstDeliveredCallIndex: z.number().int().positive(),
  firstDeliveredTool: z.enum(["node", "investigate", "file", "explore", "context"]),
  pointer: sourcePointerOutputSchema.optional()
});

const sourceDeliveryOutputSchema = z.union([
  z.object({
    policy: z.literal(MCP_SOURCE_SESSION_POLICY),
    status: z.literal("emitted"),
    sourceId: z.string().regex(/^source:[0-9a-f]{64}$/u),
    callIndex: z.number().int().positive(),
    tool: z.enum(["node", "investigate", "file", "explore", "context"]),
    pointer: sourcePointerOutputSchema.optional(),
    intervalDecision: z.object({
      status: z.literal("full"),
      reason: z.enum([
        "mode-full",
        "offset-map-unavailable",
        "no-proven-overlap",
        "below-minimum-savings",
        "insufficient-new-context",
        "too-many-fragments"
      ]),
      provenCoveredCharacterOffsets: z.array(sourceCharacterRangeOutputSchema)
    })
  }),
  z.object({
    policy: z.literal(MCP_SOURCE_SESSION_POLICY),
    status: z.literal("already-served"),
    sourceId: z.string().regex(/^source:[0-9a-f]{64}$/u),
    firstDeliveredCallIndex: z.number().int().positive(),
    firstDeliveredTool: z.enum(["node", "investigate", "file", "explore", "context"]),
    coveredCharacterOffsets: z.array(sourceCharacterRangeOutputSchema).min(1),
    coveredPointers: z.array(sourcePointerOutputSchema).min(1).optional(),
    coveredBy: z.array(sourceCoverageReceiptOutputSchema).min(1),
    message: z.string().min(1)
  }),
  z.object({
    policy: z.literal(MCP_SOURCE_SESSION_POLICY),
    status: z.literal("partially-served"),
    sourceId: z.string().regex(/^source:[0-9a-f]{64}$/u),
    callIndex: z.number().int().positive(),
    tool: z.enum(["node", "investigate", "file", "explore", "context"]),
    coveredCharacterOffsets: z.array(sourceCharacterRangeOutputSchema).min(1),
    coveredPointers: z.array(sourcePointerOutputSchema).min(1).optional(),
    coveredBy: z.array(sourceCoverageReceiptOutputSchema).min(1),
    fragments: z.array(z.object({
      text: z.string().min(1),
      sourceIdentity: sourceDeliveryIdentityOutputSchema,
      pointer: sourcePointerOutputSchema.optional()
    })).min(1),
    intervalDecision: z.object({
      status: z.literal("partial"),
      reason: z.literal("proven-overlap"),
      avoidedCharacters: z.number().int().positive(),
      emittedCharacters: z.number().int().positive()
    }),
    message: z.string().min(1)
  })
]);

const sourceSessionReceiptOutputSchema = z.object({
  policy: z.literal(MCP_SOURCE_SESSION_POLICY),
  scope: z.literal("mcp-server-session"),
  identityPolicy: z.literal(SOURCE_DELIVERY_IDENTITY_POLICY),
  pointerPolicy: z.literal(MCP_SOURCE_POINTER_POLICY),
  equality: z.literal("verified-offset-map-and-canonical-content"),
  mode: z.enum(MCP_SOURCE_SESSION_MODES),
  tool: z.enum(["node", "investigate", "file", "explore", "context"]),
  projectPath: z.string().min(1),
  generationId: z.string().min(1),
  callIndex: z.number().int().positive(),
  generationReset: z.boolean(),
  bounds: z.object({
    maximumProjects: z.number().int().positive(),
    maximumSourcesPerProject: z.number().int().positive(),
    minimumAvoidedCharacters: z.number().int().nonnegative(),
    minimumEmittedCharacters: z.number().int().nonnegative(),
    maximumFragmentsPerSource: z.number().int().positive(),
    maximumPointerSymbols: z.literal(MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS)
  }),
  summary: z.object({
    candidateSources: z.number().int().nonnegative(),
    emittedSources: z.number().int().nonnegative(),
    partiallyReferencedSources: z.number().int().nonnegative(),
    referencedSources: z.number().int().nonnegative(),
    emittedCharacters: z.number().int().nonnegative(),
    avoidedCharacters: z.number().int().nonnegative(),
    stateSourcesAfterCall: z.number().int().nonnegative(),
    stateTruncated: z.boolean()
  })
});

const deliveredSourceExcerptOutputSchema = sourceExcerptOutputSchema.extend({
  range: sourceRangeOutputSchema,
  text: z.string().nullable(),
  sourceIdentity: sourceDeliveryIdentityOutputSchema,
  requestedCharacters: z.number().int().positive(),
  emittedCharacters: z.number().int().nonnegative(),
  truncated: z.boolean(),
  truncationReason: z.literal("character-budget").nullable(),
  delivery: sourceDeliveryOutputSchema.optional()
});

const contextSourceAllocationOutputSchema = z.object({
  policy: z.literal(CONTEXT_SOURCE_ALLOCATION_POLICY),
  budget: z.object({
    characterBudget: z.number().int().min(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET).max(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
    minimumCharacterBudget: z.literal(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET),
    maximumCharacterBudget: z.literal(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
    minimumPerReference: z.literal(CONTEXT_SOURCE_MINIMUM_PER_REFERENCE)
  }),
  summary: z.object({
    candidateCount: z.number().int().nonnegative(),
    requestedCharacters: z.number().int().nonnegative(),
    allocatedCharacters: z.number().int().nonnegative(),
    unusedCharacters: z.number().int().nonnegative(),
    truncated: z.boolean(),
    emittedCharacters: z.number().int().nonnegative(),
    reservedButNotEmittedCharacters: z.number().int().nonnegative()
  }),
  contexts: z.array(z.object({
    referenceIndex: z.number().int().nonnegative(),
    reference: z.string().min(1),
    filePath: z.string().min(1),
    requestedCharacters: z.number().int().positive(),
    referenceOrderWeight: z.number().int().positive(),
    allocatedCharacters: z.number().int().nonnegative(),
    truncated: z.boolean(),
    reason: z.literal("reference-order-weight"),
    emittedCharacters: z.number().int().nonnegative(),
    reservedButNotEmittedCharacters: z.number().int().nonnegative()
  }))
});

const contextEvidencePathOutputSchema = z.object({
  fromReference: z.string(),
  toReference: z.string(),
  status: z.enum(["path", "same-symbol", "no-path", "not-applicable", "truncated"]),
  path: z.object({}).passthrough().nullable()
});

const exploreQueryGraphMassRelationCountsOutputSchema = z.object({
  contains: z.number().int().nonnegative().optional(),
  imports: z.number().int().nonnegative().optional(),
  exports: z.number().int().nonnegative().optional(),
  references: z.number().int().nonnegative().optional(),
  calls: z.number().int().nonnegative().optional(),
  accepts: z.number().int().nonnegative().optional(),
  returns: z.number().int().nonnegative().optional(),
  instantiates: z.number().int().nonnegative().optional(),
  overrides: z.number().int().nonnegative().optional(),
  routes: z.number().int().nonnegative().optional(),
  handles: z.number().int().nonnegative().optional(),
  extends: z.number().int().nonnegative().optional(),
  implements: z.number().int().nonnegative().optional()
}).strict();

const exploreQueryGraphMassOutputSchema = z.object({
  policy: z.literal(EXPLORE_QUERY_GRAPH_MASS_POLICY),
  eligibleRelationshipCount: z.number().int().nonnegative(),
  exactRelationshipCount: z.number().int().nonnegative().max(
    EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships
  ),
  omittedRelationshipCount: z.number().int().nonnegative(),
  distinctNeighborCount: z.number().int().nonnegative().max(
    EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships
  ),
  uncappedScore: z.number().int().nonnegative().max(
    EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships *
      EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.calls
  ),
  score: z.number().int().nonnegative().max(EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore),
  rankingContribution: z.number().finite().nonnegative().max(
    EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore
  ),
  truncated: z.boolean(),
  relationCounts: exploreQueryGraphMassRelationCountsOutputSchema
});

const exploreQueryGraphExpansionPathSegmentOutputSchema = z.object({
  edgeId: z.string().min(1),
  kind: z.enum([
    "contains",
    "imports",
    "exports",
    "references",
    "calls",
    "accepts",
    "returns",
    "instantiates",
    "overrides",
    "routes",
    "handles",
    "extends",
    "implements"
  ]),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  direction: z.enum(["forward", "reverse"])
});

const exploreQueryGraphExpansionOutputSchema = z.object({
  policy: z.literal(EXPLORE_QUERY_GRAPH_EXPANSION_POLICY),
  state: z.enum(["lexical", "expanded"]),
  seedSymbolId: z.string().min(1).nullable(),
  seedFilePath: z.string().min(1).nullable(),
  hops: z.number().int().nonnegative().max(EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumHops),
  corroboratingSeedFileCount: z.number().int().nonnegative().max(
    EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedFiles
  ),
  score: z.number().finite().nonnegative().max(
    EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumScore
  ),
  rankingContribution: z.number().finite().nonnegative().max(
    EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumScore
  ),
  path: z.array(exploreQueryGraphExpansionPathSegmentOutputSchema).max(
    EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumHops
  )
});

const exploreQueryGraphDiffusionOutputSchema = z.object({
  policy: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY),
  state: z.enum(["seed", "reached", "outside-subgraph", "no-mass"]),
  seed: z.boolean(),
  seedWeight: z.number().finite().nonnegative().max(1),
  nodeMass: z.number().finite().nonnegative().max(1),
  fileMass: z.number().finite().nonnegative().max(1),
  normalizedFileMass: z.number().finite().nonnegative().max(1),
  score: z.number().finite().nonnegative().max(
    EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore
  ),
  rankingContribution: z.number().finite().nonnegative().max(
    EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore
  )
});

const exploreQuerySelectionOutputSchema = z.object({
  rank: z.number().int().positive().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
  symbol: z.object({}).passthrough(),
  score: z.number().finite(),
  baseScore: z.number().finite(),
  connectionScore: z.number().finite(),
  graphMass: exploreQueryGraphMassOutputSchema,
  graphExpansion: exploreQueryGraphExpansionOutputSchema,
  graphDiffusion: exploreQueryGraphDiffusionOutputSchema,
  generated: z.object({
    classifierVersion: z.string().min(1),
    generated: z.boolean(),
    evidence: z.array(z.object({
      kind: z.enum(["path", "header"]),
      ruleId: z.string().min(1),
      range: sourceRangeOutputSchema.nullable()
    })).max(8)
  }),
  sourceWorth: z.number().finite().positive().max(1),
  sourceRole: z.object({
    classifierVersion: z.string().min(1),
    role: z.enum(["production", "test", "icon", "localization"]),
    evidence: z.array(z.object({
      kind: z.literal("path"),
      ruleId: z.string().min(1)
    })).max(1)
  }),
  sourceRoleWorth: z.number().finite().positive().max(1),
  rankingScore: z.number().finite().nonnegative(),
  rankingDecision: z.enum([
    "explicit-file-exempt",
    "handwritten-source-worth",
    "generated-source-worth"
  ]),
  sourceRoleDecision: z.enum([
    "production-source",
    "test-source-worth",
    "test-intent-exempt",
    "explicit-test-file-exempt",
    "icon-source-worth",
    "icon-intent-exempt",
    "explicit-icon-file-exempt",
    "localization-source-worth",
    "localization-intent-exempt",
    "explicit-localization-file-exempt"
  ]),
  matchedTerms: z.array(z.string()),
  reasons: z.array(
    z.enum([
      "explicit-file",
      "exact-symbol-term",
      "qualified-symbol-term",
      "partial-symbol-term",
      "file-name-term",
      "graph-connected",
      "graph-mass"
    ])
  )
});

const exploreQueryPlanOutputSchema = z.object({
  policy: z.literal(EXPLORE_QUERY_PLAN_POLICY),
  query: z.string(),
  normalizedQuery: z.string().max(EXPLORE_QUERY_LIMITS.maximumQueryCharacters),
  input: z.object({
    characters: z.number().int().nonnegative(),
    usedCharacters: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumQueryCharacters),
    truncated: z.boolean()
  }),
  fileHints: z.array(z.string()).max(EXPLORE_QUERY_LIMITS.maximumFileHints),
  identifierTerms: z.array(z.string()).max(EXPLORE_QUERY_LIMITS.maximumIdentifierTerms),
  queryIntent: z.object({
    tests: z.boolean(),
    icons: z.boolean(),
    localization: z.boolean(),
    matchedTerms: z.array(z.string()).max(EXPLORE_QUERY_LIMITS.maximumIdentifierTerms)
  }),
  filtering: z.object({
    policy: z.literal(EXPLORE_QUERY_LOW_VALUE_FILTER_POLICY),
    reason: z.enum([
      "no-low-value-candidates",
      "all-low-value-candidates-exempt",
      "insufficient-production-evidence",
      "sufficient-production-evidence"
    ]),
    applied: z.boolean(),
    minimumProductionFileCount: z.literal(
      EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.minimumProductionFileCount
    ),
    maximumExcludedFileReceipts: z.literal(
      EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts
    ),
    candidateFileCount: z.number().int().nonnegative(),
    productionCandidateFileCount: z.number().int().nonnegative(),
    lowValueCandidateFileCount: z.number().int().nonnegative(),
    testCandidateFileCount: z.number().int().nonnegative(),
    iconCandidateFileCount: z.number().int().nonnegative(),
    localizationCandidateFileCount: z.number().int().nonnegative(),
    retainedCandidateCount: z.number().int().nonnegative(),
    retainedFileCount: z.number().int().nonnegative(),
    excludedLowValueCandidateCount: z.number().int().nonnegative(),
    excludedLowValueFileCount: z.number().int().nonnegative(),
    excludedTestCandidateCount: z.number().int().nonnegative(),
    excludedTestFileCount: z.number().int().nonnegative(),
    excludedIconCandidateCount: z.number().int().nonnegative(),
    excludedIconFileCount: z.number().int().nonnegative(),
    excludedLocalizationCandidateCount: z.number().int().nonnegative(),
    excludedLocalizationFileCount: z.number().int().nonnegative(),
    excludedFilesTruncated: z.boolean(),
    excludedFiles: z.array(z.object({
      filePath: z.string().min(1),
      candidateCount: z.number().int().positive(),
      reason: z.enum([
        "test-source-filtered",
        "icon-source-filtered",
        "localization-source-filtered"
      ]),
      sourceRole: z.object({
        classifierVersion: z.string().min(1),
        role: z.enum(["test", "icon", "localization"]),
        evidence: z.array(z.object({
          kind: z.literal("path"),
          ruleId: z.string().min(1)
        })).max(1)
      })
    })).max(EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts)
  }),
  scoreFloor: z.object({
    policy: z.literal(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_POLICY),
    reason: z.enum([
      "no-candidate-files",
      "all-files-past-floor",
      "minimum-backfill-applied",
      "relative-floor-applied"
    ]),
    applied: z.boolean(),
    absoluteFloor: z.literal(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor),
    fractionOfTop: z.literal(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.fractionOfTop),
    maximumFloor: z.literal(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFloor),
    backfillTargetFileCount: z.literal(
      EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.backfillTargetFileCount
    ),
    maximumFileReceipts: z.literal(
      EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts
    ),
    fileScoreAggregation: z.literal("maximum-candidate-score"),
    backfillEvidenceFloor: z.number().nonnegative().max(
      EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor
    ),
    topFileScore: z.number().nonnegative(),
    computedFloor: z.number().nonnegative().max(
      EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFloor
    ),
    candidateFileCount: z.number().int().nonnegative(),
    filesPastFloorCount: z.number().int().nonnegative(),
    retainedFileCount: z.number().int().nonnegative(),
    backfilledFileCount: z.number().int().nonnegative(),
    excludedFileCount: z.number().int().nonnegative(),
    backfilledFilesTruncated: z.boolean(),
    backfilledFiles: z.array(z.object({
      filePath: z.string().min(1),
      candidateCount: z.number().int().positive(),
      fileScore: z.number().nonnegative(),
      bestCandidateId: z.string().min(1),
      bestCandidateScore: z.number().nonnegative(),
      reason: z.literal("minimum-retained-files")
    })).max(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts),
    excludedFilesTruncated: z.boolean(),
    excludedFiles: z.array(z.object({
      filePath: z.string().min(1),
      candidateCount: z.number().int().positive(),
      fileScore: z.number().nonnegative(),
      bestCandidateId: z.string().min(1),
      bestCandidateScore: z.number().nonnegative(),
      reason: z.literal("below-relative-floor")
    })).max(EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts)
  }),
  ranking: z.object({
    policy: z.literal(EXPLORE_QUERY_SOURCE_WORTH_POLICY),
    generatedSourceWorth: z.literal(EXPLORE_GENERATED_SOURCE_WORTH),
    explicitFileExempt: z.literal(true),
    classifierVersion: z.string().min(1),
    testSourceWorth: z.literal(EXPLORE_TEST_SOURCE_WORTH),
    testIntentExempt: z.literal(true),
    iconSourceWorth: z.literal(EXPLORE_ICON_SOURCE_WORTH),
    iconIntentExempt: z.literal(true),
    localizationSourceWorth: z.literal(EXPLORE_LOCALIZATION_SOURCE_WORTH),
    localizationIntentExempt: z.literal(true),
    sourceRoleClassifierVersion: z.string().min(1),
    graphMass: z.object({
      policy: z.literal(EXPLORE_QUERY_GRAPH_MASS_POLICY),
      maximumRelationships: z.literal(EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships),
      maximumScore: z.literal(EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore),
      relationWeights: z.object({
        contains: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.contains),
        imports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.imports),
        exports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.exports),
        references: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.references),
        calls: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.calls),
        accepts: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.accepts),
        returns: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.returns),
        instantiates: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.instantiates),
        overrides: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.overrides),
        routes: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.routes),
        handles: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.handles),
        extends: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.extends),
        implements: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.implements)
      }).strict()
    }),
    graphExpansion: z.object({
      policy: z.literal(EXPLORE_QUERY_GRAPH_EXPANSION_POLICY),
      reason: z.enum([
        "no-lexical-candidates",
        "no-strong-lexical-seeds",
        "no-reachable-candidates",
        "completed"
      ]),
      applied: z.boolean(),
      maximumHops: z.literal(EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumHops),
      maximumSeedFiles: z.literal(EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedFiles),
      maximumSeedSymbols: z.literal(EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedSymbols),
      maximumSeedSymbolsPerFile: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedSymbolsPerFile
      ),
      maximumVisitedNodes: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumVisitedNodes
      ),
      maximumVisitedRelationships: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumVisitedRelationships
      ),
      maximumExpandedFiles: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedFiles
      ),
      maximumExpandedSymbols: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedSymbols
      ),
      maximumExpandedSymbolsPerFile: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedSymbolsPerFile
      ),
      minimumRelationWeight: z.literal(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.minimumRelationWeight
      ),
      relationWeights: z.object({
        contains: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.contains),
        imports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.imports),
        exports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.exports),
        references: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.references),
        calls: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.calls),
        accepts: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.accepts),
        returns: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.returns),
        instantiates: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.instantiates),
        overrides: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.overrides),
        routes: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.routes),
        handles: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.handles),
        extends: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.extends),
        implements: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.implements)
      }).strict(),
      seedFileCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedFiles
      ),
      seedSymbolCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedSymbols
      ),
      visitedNodeCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumVisitedNodes
      ),
      visitedRelationshipCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumVisitedRelationships
      ),
      discoveredSymbolCount: z.number().int().nonnegative(),
      admittedSymbolCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedSymbols
      ),
      admittedFileCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedFiles
      ),
      rejectedExistingFileCount: z.number().int().nonnegative(),
      rejectedLowValueSymbolCount: z.number().int().nonnegative(),
      seedFileLimitReached: z.boolean(),
      seedSymbolLimitReached: z.boolean(),
      nodeLimitReached: z.boolean(),
      relationshipLimitReached: z.boolean(),
      expandedFileLimitReached: z.boolean(),
      expandedSymbolLimitReached: z.boolean(),
      candidatesTruncated: z.boolean(),
      candidates: z.array(z.object({
        symbolId: z.string().min(1),
        filePath: z.string().min(1),
        admitted: z.boolean(),
        reason: z.enum([
          "admitted",
          "existing-candidate-file",
          "unrequested-low-value-source",
          "expanded-file-limit",
          "expanded-symbol-limit",
          "expanded-symbols-per-file-limit"
        ]),
        seedSymbolId: z.string().min(1),
        seedFilePath: z.string().min(1),
        hops: z.number().int().positive().max(
          EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumHops
        ),
        corroboratingSeedFileCount: z.number().int().positive().max(
          EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumSeedFiles
        ),
        score: z.number().finite().nonnegative().max(
          EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumScore
        ),
        path: z.array(exploreQueryGraphExpansionPathSegmentOutputSchema).min(1).max(
          EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumHops
        ),
        sourceRole: z.object({
          classifierVersion: z.string().min(1),
          role: z.enum(["production", "test", "icon", "localization"]),
          evidence: z.array(z.object({
            kind: z.literal("path"),
            ruleId: z.string().min(1)
          })).max(1)
        })
      })).max(EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumReceiptCandidates)
    }),
    graphDiffusion: z.object({
      policy: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY),
      reason: z.enum([
        "no-candidates",
        "no-seeds",
        "no-reachable-relationships",
        "completed"
      ]),
      applied: z.boolean(),
      seedMode: z.enum([
        "none",
        "strong-lexical",
        "partial-lexical",
        "all-candidates-fallback"
      ]),
      seedFileWeighting: z.literal("uniform-per-file"),
      restartProbability: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.restartProbability),
      maximumHops: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumHops),
      maximumSeedFiles: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedFiles),
      maximumSeedSymbols: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols),
      maximumSeedSymbolsPerFile: z.literal(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbolsPerFile
      ),
      maximumNodes: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumNodes),
      maximumRelationships: z.literal(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumRelationships
      ),
      maximumIterations: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumIterations),
      convergenceTolerance: z.literal(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.convergenceTolerance
      ),
      maximumScore: z.literal(EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore),
      relationWeights: z.object({
        contains: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.contains),
        imports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.imports),
        exports: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.exports),
        references: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.references),
        calls: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.calls),
        accepts: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.accepts),
        returns: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.returns),
        instantiates: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.instantiates),
        overrides: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.overrides),
        routes: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.routes),
        handles: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.handles),
        extends: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.extends),
        implements: z.literal(EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS.implements)
      }).strict(),
      seedFileCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedFiles
      ),
      seedSymbolCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols
      ),
      normalizedSeedWeight: z.number().finite().nonnegative().max(1),
      seedFileLimitReached: z.boolean(),
      seedSymbolLimitReached: z.boolean(),
      subgraphNodeCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumNodes
      ),
      subgraphRelationshipCount: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumRelationships
      ),
      hopLimitReached: z.boolean(),
      nodeLimitReached: z.boolean(),
      relationshipLimitReached: z.boolean(),
      iterations: z.number().int().nonnegative().max(
        EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumIterations
      ),
      converged: z.boolean(),
      residual: z.number().finite().nonnegative(),
      candidateWithMassCount: z.number().int().nonnegative(),
      topCandidateFileMass: z.number().finite().nonnegative().max(1)
    })
  }),
  limits: z.object({
    maximumQueryCharacters: z.literal(EXPLORE_QUERY_LIMITS.maximumQueryCharacters),
    maximumFileHints: z.literal(EXPLORE_QUERY_LIMITS.maximumFileHints),
    maximumIdentifierTerms: z.literal(EXPLORE_QUERY_LIMITS.maximumIdentifierTerms),
    maximumFiles: z.literal(EXPLORE_QUERY_LIMITS.maximumFiles),
    maximumSymbols: z.literal(EXPLORE_QUERY_LIMITS.maximumSymbols),
    maximumSymbolsPerFile: z.literal(EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile),
    maximumConnections: z.literal(EXPLORE_QUERY_LIMITS.maximumConnections)
  }),
  summary: z.object({
    candidateCount: z.number().int().nonnegative(),
    lexicalCandidateCount: z.number().int().nonnegative(),
    expandedCandidateCount: z.number().int().nonnegative().max(
      EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedSymbols
    ),
    expandedCandidateFileCount: z.number().int().nonnegative().max(
      EXPLORE_QUERY_GRAPH_EXPANSION_LIMITS.maximumExpandedFiles
    ),
    generatedCandidateCount: z.number().int().nonnegative(),
    lowValueCandidateCount: z.number().int().nonnegative(),
    lowValuePenaltyCandidateCount: z.number().int().nonnegative(),
    testCandidateCount: z.number().int().nonnegative(),
    testPenaltyCandidateCount: z.number().int().nonnegative(),
    iconCandidateCount: z.number().int().nonnegative(),
    localizationCandidateCount: z.number().int().nonnegative(),
    filteredCandidateCount: z.number().int().nonnegative(),
    scoreFloorFilteredCandidateCount: z.number().int().nonnegative(),
    scoreFloorFilteredFileCount: z.number().int().nonnegative(),
    graphMassCandidateCount: z.number().int().nonnegative(),
    graphMassTruncatedCandidateCount: z.number().int().nonnegative(),
    graphDiffusionCandidateCount: z.number().int().nonnegative(),
    graphDiffusionReachedCandidateCount: z.number().int().nonnegative(),
    selectedCount: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    selectedGeneratedCount: z.number().int().nonnegative().max(
      EXPLORE_QUERY_LIMITS.maximumSymbols
    ),
    selectedLowValueCount: z.number().int().nonnegative().max(
      EXPLORE_QUERY_LIMITS.maximumSymbols
    ),
    selectedTestCount: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    selectedIconCount: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    selectedLocalizationCount: z.number().int().nonnegative().max(
      EXPLORE_QUERY_LIMITS.maximumSymbols
    ),
    selectedFileCount: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumFiles),
    truncated: z.boolean()
  }),
  selection: z.array(exploreQuerySelectionOutputSchema).max(EXPLORE_QUERY_LIMITS.maximumSymbols)
});

const exploreFocusOutputSchema = exploreQuerySelectionOutputSchema
  .extend({
    reference: z.string(),
    match: z.object({}).passthrough(),
    matchCandidatesTruncated: z.boolean(),
    sourceAvailability: z.enum(["active-generation", "unavailable", "not-applicable"]),
    source: deliveredSourceExcerptOutputSchema.nullable(),
    callers: z.object({}).passthrough(),
    callees: z.object({}).passthrough(),
    impact: z.object({}).passthrough()
  })
  .passthrough();

const explorePathSpinePlanOutputSchema = z.object({
  policy: z.literal(EXPLORE_PATH_SPINE_POLICY),
  limits: z.object({
    maximumPairAttempts: z.literal(EXPLORE_PATH_SPINE_LIMITS.maximumPairAttempts),
    maximumHops: z.literal(EXPLORE_PATH_SPINE_LIMITS.maximumHops),
    maximumVisitedSymbolsPerPair: z.literal(
      EXPLORE_PATH_SPINE_LIMITS.maximumVisitedSymbolsPerPair
    ),
    maximumSpines: z.literal(EXPLORE_PATH_SPINE_LIMITS.maximumSpines),
    maximumBridgeSymbols: z.literal(EXPLORE_PATH_SPINE_LIMITS.maximumBridgeSymbols)
  }),
  summary: z.object({
    pairCandidateCount: z.number().int().nonnegative(),
    attemptedPairCount: z.number().int().nonnegative().max(EXPLORE_PATH_SPINE_LIMITS.maximumPairAttempts),
    discoveredSpineCount: z.number().int().nonnegative(),
    selectedSpineCount: z.number().int().nonnegative().max(EXPLORE_PATH_SPINE_LIMITS.maximumSpines),
    bridgeSymbolCount: z.number().int().nonnegative().max(EXPLORE_PATH_SPINE_LIMITS.maximumBridgeSymbols),
    pairAttemptsTruncated: z.boolean(),
    spinesTruncated: z.boolean(),
    traversalTruncated: z.boolean()
  }),
  spines: z.array(z.object({
    index: z.number().int().nonnegative().max(EXPLORE_PATH_SPINE_LIMITS.maximumSpines - 1),
    fromFocusRank: z.number().int().positive().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    toFocusRank: z.number().int().positive().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    score: z.number().finite(),
    path: z.object({}).passthrough(),
    bridgeSymbols: z.array(z.object({}).passthrough()).max(
      EXPLORE_PATH_SPINE_LIMITS.maximumBridgeSymbols
    ),
    edgeIds: z.array(z.string()).max(EXPLORE_PATH_SPINE_LIMITS.maximumHops)
  })).max(EXPLORE_PATH_SPINE_LIMITS.maximumSpines)
});

const exploreSourceWindowPlanItemOutputSchema = z.object({
  index: z.number().int().nonnegative().max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows - 1),
  focusRank: z.number().int().positive().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  connectionEdgeIds: z.array(z.string()).max(EXPLORE_QUERY_LIMITS.maximumConnections),
  pathSpineIndexes: z.array(z.number().int().nonnegative()).max(
    EXPLORE_PATH_SPINE_LIMITS.maximumSpines
  ),
  relatedSymbolIds: z.array(z.string()).max(EXPLORE_QUERY_LIMITS.maximumConnections),
  relevanceWeight: z.number().finite().positive(),
  reason: z.enum(["exact-connection-site", "exact-path-spine"])
});

const exploreSourceWindowPlanOutputSchema = z.object({
  policy: z.literal(EXPLORE_SOURCE_WINDOW_POLICY),
  limits: z.object({
    contextPaddingLines: z.literal(EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
    mergeGapLines: z.literal(EXPLORE_SOURCE_WINDOW_LIMITS.mergeGapLines),
    maximumWindows: z.literal(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows),
    maximumWindowsPerFocus: z.literal(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindowsPerFocus)
  }),
  summary: z.object({
    candidateCount: z.number().int().nonnegative(),
    selectedCount: z.number().int().nonnegative().max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows),
    selectedFocusCount: z.number().int().nonnegative().max(EXPLORE_QUERY_LIMITS.maximumSymbols),
    truncated: z.boolean()
  }),
  windows: z.array(exploreSourceWindowPlanItemOutputSchema).max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows)
});

const exploreSourceWindowAllocationOutputSchema = z.object({
  policy: z.literal(EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY),
  budget: z.object({
    totalCharacterBudget: z.number().int().nonnegative(),
    primaryEmittedCharacters: z.number().int().nonnegative(),
    availableCharacters: z.number().int().nonnegative(),
    minimumPerWindow: z.literal(EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow),
    maximumShareFraction: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction
    ),
    generatedSourceWorth: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.generatedSourceWorth
    ),
    relativeCliffFraction: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffFraction
    ),
    relativeCliffMaximumWeight: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffMaximumWeight
    ),
    relativeCliffThreshold: z.number().finite().nonnegative(),
    wholeFileGraceFraction: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceFraction
    ),
    wholeFileGraceMaximumCharacters: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceMaximumCharacters
    ),
    wholeFileBuyMinimumCoverageFraction: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyMinimumCoverageFraction
    ),
    wholeFileBuyOvershootFraction: z.literal(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyOvershootFraction
    ),
    wholeFileBuyOvershootBudget: z.number().int().nonnegative(),
    wholeFileBuyOvershootSpentCharacters: z.number().int().nonnegative()
  }),
  summary: z.object({
    candidateCount: z.number().int().nonnegative().max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows),
    generatedCandidates: z.number().int().nonnegative().max(
      EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows
    ),
    cliffedWindows: z.number().int().nonnegative().max(
      EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows
    ),
    wholeFileEligibleCandidates: z.number().int().nonnegative().max(
      EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows
    ),
    wholeFilePromotedWindows: z.number().int().nonnegative().max(
      EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows
    ),
    requestedCharacters: z.number().int().nonnegative(),
    baseAllocatedCharacters: z.number().int().nonnegative(),
    allocatedCharacters: z.number().int().nonnegative(),
    emittedCharacters: z.number().int().nonnegative(),
    emittedWindows: z.number().int().nonnegative().max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows),
    unusedCharacters: z.number().int().nonnegative(),
    reservedButNotEmittedCharacters: z.number().int().nonnegative(),
    truncated: z.boolean()
  }),
  windows: z.array(z.object({
    index: z.number().int().nonnegative().max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows - 1),
    filePath: z.string().min(1),
    windowRequestedCharacters: z.number().int().positive(),
    fullFileCharacters: z.number().int().positive(),
    requestedCharacters: z.number().int().positive(),
    relevanceWeight: z.number().finite().positive(),
    generated: z.boolean(),
    generatedClassifierVersion: z.string().min(1),
    generatedEvidenceRuleIds: z.array(z.string().min(1)).max(8),
    sourceWorth: z.number().finite().positive().max(1),
    effectiveWeight: z.number().finite().positive(),
    cliffExempt: z.boolean(),
    allocationDecision: z.enum(["admitted", "relative-cliff"]),
    maximumShareCharacters: z.number().int().nonnegative(),
    baseAllocatedCharacters: z.number().int().nonnegative(),
    allocatedCharacters: z.number().int().nonnegative(),
    wholeFileEligible: z.boolean(),
    wholeFileCoverageFraction: z.number().finite().min(0).max(1),
    wholeFileGraceCharacters: z.number().int().nonnegative(),
    wholeFileOvershootCharacters: z.number().int().nonnegative(),
    wholeFileBuySpentCharacters: z.number().int().nonnegative(),
    renderMode: z.enum(["window", "whole-file"]),
    wholeFileDecision: z.enum([
      "not-eligible",
      "duplicate-file",
      "window-only",
      "exact-fit",
      "grace",
      "buy"
    ]),
    emittedCharacters: z.number().int().nonnegative(),
    reservedButNotEmittedCharacters: z.number().int().nonnegative(),
    truncated: z.boolean(),
    reason: z.literal("score-spine-and-source-worth")
  })).max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows)
});

const exploreOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    mode: z.enum(["exact-symbol", "query"]).optional(),
    match: z.object({}).passthrough(),
    sourceAvailability: z
      .enum(["active-generation", "unavailable", "not-applicable"])
      .describe(
        "When present, reports whether source is active-generation evidence, unavailable, or not applicable to the match."
      )
      .optional(),
    source: deliveredSourceExcerptOutputSchema.nullable(),
    sessionSource: sourceSessionReceiptOutputSchema.optional(),
    callers: z.array(z.object({}).passthrough()),
    callees: z.array(z.object({}).passthrough()),
    impact: z.array(z.object({}).passthrough()),
    queryPlan: exploreQueryPlanOutputSchema.nullable().optional(),
    focuses: z.array(exploreFocusOutputSchema).max(EXPLORE_QUERY_LIMITS.maximumSymbols).optional(),
    connections: z
      .array(
        z.object({
          source: z.object({}).passthrough(),
          target: z.object({}).passthrough(),
          edge: z.object({}).passthrough()
        })
      )
      .max(EXPLORE_QUERY_LIMITS.maximumConnections)
      .optional(),
    connectionsTruncated: z.boolean().optional(),
    sourceAllocation: contextSourceAllocationOutputSchema.nullable().optional(),
    pathSpinePlan: explorePathSpinePlanOutputSchema.nullable().optional(),
    sourceWindowPlan: exploreSourceWindowPlanOutputSchema.nullable().optional(),
    sourceWindows: z.array(
      exploreSourceWindowPlanItemOutputSchema.extend({ source: deliveredSourceExcerptOutputSchema })
    ).max(EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows).optional(),
    sourceWindowAllocation: exploreSourceWindowAllocationOutputSchema.nullable().optional(),
    evidencePaths: z.array(contextEvidencePathOutputSchema).optional()
  })
  .passthrough();

const nodeSourceOutputSchema = z.object({
  filePath: z.string(),
  range: sourceRangeOutputSchema,
  text: z.string().nullable(),
  sourceIdentity: sourceDeliveryIdentityOutputSchema.optional(),
  delivery: sourceDeliveryOutputSchema.optional(),
  totalLines: z.number().int().positive(),
  totalCharacters: z.number().int().nonnegative(),
  truncated: z.boolean()
});

const investigateSourceSegmentMetadataOutputSchema = z.object({
  id: z.string().regex(/^segment:[0-9a-f]{64}$/u),
  policy: z.literal(INVESTIGATION_SOURCE_SEGMENT_POLICY),
  roles: z.array(z.enum(["full", "prefix", "signature", "focus"])).min(1),
  contiguous: z.literal(true),
  lineAligned: z.boolean(),
  renderedRange: sourceRangeOutputSchema,
  sourceCharacterOffsets: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  }),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  sourceIdentity: sourceDeliveryIdentityOutputSchema.optional()
});

const investigateSourceSegmentOutputSchema = z.union([
  investigateSourceSegmentMetadataOutputSchema.extend({
    text: z.string(),
    delivery: z.union([
      z.object({
        policy: z.literal(MCP_INVESTIGATE_SOURCE_SESSION_POLICY),
        status: z.literal("emitted"),
        segmentId: z.string().regex(/^segment:[0-9a-f]{64}$/u),
        callIndex: z.number().int().positive()
      }),
      sourceDeliveryOutputSchema
    ])
  }),
  investigateSourceSegmentMetadataOutputSchema.extend({
    delivery: z.union([
      z.object({
        policy: z.literal(MCP_INVESTIGATE_SOURCE_SESSION_POLICY),
        status: z.literal("already-served"),
        segmentId: z.string().regex(/^segment:[0-9a-f]{64}$/u),
        firstDeliveredCallIndex: z.number().int().positive(),
        message: z.string().min(1)
      }),
      sourceDeliveryOutputSchema
    ])
  })
]);

const investigateNodeSourceOutputSchema = nodeSourceOutputSchema.extend({
  text: z.string().nullable(),
  renderedRange: sourceRangeOutputSchema.optional(),
  renderedCharacterOffsets: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  }).optional(),
  renderedSegments: z.array(investigateSourceSegmentOutputSchema).min(1).optional(),
  primarySegmentIndex: z.number().int().nonnegative().optional()
});

const investigateSourceRenderReceiptOutputSchema = z.object({
  policy: z.literal(INVESTIGATION_SOURCE_RENDER_POLICY),
  requestedMode: z.enum(INVESTIGATE_SOURCE_RENDER_MODES),
  mode: z.enum(["full", "focused", "signature", "prefix", "multi"]),
  complete: z.boolean(),
  contiguous: z.boolean(),
  lineAligned: z.boolean(),
  emittedCharacters: z.number().int().nonnegative(),
  sourceCharacterOffsets: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  }),
  omittedCharactersBefore: z.number().int().nonnegative(),
  omittedCharactersBetween: z.number().int().nonnegative(),
  omittedCharactersAfter: z.number().int().nonnegative(),
  primarySegmentId: z.string().regex(/^segment:[0-9a-f]{64}$/u),
  segmentCount: z.number().int().min(1).max(INVESTIGATION_SOURCE_MAXIMUM_SEGMENTS),
  segments: z.array(investigateSourceSegmentMetadataOutputSchema)
    .min(1)
    .max(INVESTIGATION_SOURCE_MAXIMUM_SEGMENTS),
  multi: z.object({
    requested: z.boolean(),
    emitted: z.boolean(),
    maximumSegments: z.literal(INVESTIGATION_SOURCE_MAXIMUM_SEGMENTS),
    fallbackReason: z.string().nullable()
  }),
  navigation: z.object({
    synthesizedText: z.null(),
    gaps: z.array(z.object({
      fromSegmentId: z.string().regex(/^segment:[0-9a-f]{64}$/u),
      toSegmentId: z.string().regex(/^segment:[0-9a-f]{64}$/u),
      sourceCharacterOffsets: z.object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative()
      }),
      omittedCharacters: z.number().int().nonnegative()
    }))
  }),
  focus: z.object({
    available: z.boolean(),
    included: z.boolean(),
    fallbackReason: z.string().nullable()
  }),
  signature: z.object({
    strategy: z.enum(["brace-header", "python-header"]).nullable(),
    proven: z.boolean(),
    fallbackReason: z.string().nullable()
  })
});

const nodeOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      sourceLineLimit: z.number().int().positive(),
      sourceCharacterLimit: z.number().int().positive(),
      relationLimit: z.number().int().positive(),
      matchCandidateLimit: z.number().int().positive()
    }),
    match: z.object({}).passthrough(),
    matchCandidatesTruncated: z.boolean(),
    sourceAvailability: z.enum(["active-generation", "unavailable", "not-applicable"]),
    source: nodeSourceOutputSchema.nullable(),
    sessionSource: sourceSessionReceiptOutputSchema.optional(),
    callers: z.object({
      items: z.array(z.object({}).passthrough()),
      truncated: z.boolean()
    }),
    callees: z.object({
      items: z.array(z.object({}).passthrough()),
      truncated: z.boolean()
    })
  })
  .passthrough();

const contextOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      maxReferences: z.number().int().positive(),
      matchCandidateLimit: z.number().int().positive(),
      relationLimit: z.number().int().positive(),
      maxHops: z.number().int().positive(),
      maxVisitedSymbolsPerPath: z.number().int().positive(),
      impactDepth: z.number().int().positive(),
      impactLimit: z.number().int().positive(),
      source: z.object({
        totalCharacterBudget: z.number().int().min(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET).max(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
        minimumTotalCharacterBudget: z.literal(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET),
        maximumTotalCharacterBudget: z.literal(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
        minimumPerReference: z.literal(CONTEXT_SOURCE_MINIMUM_PER_REFERENCE),
        allocationPolicy: z.literal(CONTEXT_SOURCE_ALLOCATION_POLICY)
      })
    }),
    contexts: z.array(
      z.object({
        reference: z.string(),
        match: z.object({}).passthrough(),
        matchCandidatesTruncated: z.boolean(),
        sourceAvailability: z.enum(["active-generation", "unavailable", "not-applicable"]),
        source: deliveredSourceExcerptOutputSchema.nullable(),
        callers: z.object({
          items: z.array(z.object({}).passthrough()),
          truncated: z.boolean()
        }),
        callees: z.object({
          items: z.array(z.object({}).passthrough()),
          truncated: z.boolean()
        }),
        impact: z.object({
          paths: z.array(z.object({}).passthrough()),
          truncated: z.boolean()
        })
      })
    ),
    sourceAllocation: contextSourceAllocationOutputSchema,
    sessionSource: sourceSessionReceiptOutputSchema.optional(),
    evidencePaths: z.array(contextEvidencePathOutputSchema)
  })
  .passthrough();

const affectedTestsOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      maxChangedFiles: z.number().int().positive(),
      maxDepth: z.number().int().positive(),
      limit: z.number().int().positive(),
      maxVisitedFilesPerInput: z.number().int().positive(),
      edgeKinds: z.tuple([z.literal("imports"), z.literal("exports")]),
      resolution: z.literal("exact")
    }),
    indexScope: z.array(z.string()).nullable(),
    testSelection: z.object({
      mode: z.enum(["conventional", "glob"]),
      pattern: z.string().nullable()
    }),
    indexedTestFiles: z.number().int().nonnegative(),
    inputs: z.object({
      requested: z.array(z.string()),
      indexed: z.array(z.string()),
      notIndexed: z.array(z.string())
    }),
    tests: z.object({
      items: z.array(
        z.object({
          triggerFilePath: z.string(),
          filePath: z.string(),
          reason: z.enum(["changed-test", "exact-dependent"]),
          classification: z.enum(["test-file-name", "test-directory", "custom-pattern"]),
          path: z.object({}).passthrough()
        })
      ),
      resultLimitTruncated: z.boolean(),
      traversalTruncated: z.boolean(),
      depthLimitReached: z.boolean()
    }),
    completeness: z.object({
      completeForActiveGeneration: z.boolean(),
      limitations: z.array(
        z.enum([
          "index-stale",
          "input-not-indexed",
          "depth-limit-reached",
          "visit-limit-reached",
          "result-limit-reached"
        ])
      )
    })
  })
  .passthrough();

const gitAffectedTestsOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    changeSet: z.object({}).passthrough(),
    selection: z.object({
      pathPrefix: z.string().nullable(),
      totalChanges: z.number().int().nonnegative(),
      matchedSourceChanges: z.number().int().nonnegative(),
      sourcePaths: z.array(z.string())
    }),
    testSelection: z.object({
      mode: z.enum(["conventional", "glob"]),
      pattern: z.string().nullable()
    }),
    affected: affectedTestsOutputSchema.nullable()
  })
  .passthrough();

const gitHunksOutputSchema = z
  .object({
    changeSet: z.object({}).passthrough(),
    selection: z.object({
      pathPrefix: z.string().nullable(),
      totalChanges: z.number().int().nonnegative(),
      matchedSourceChanges: z.number().int().nonnegative()
    }),
    bounds: z.object({
      maxSourceFiles: z.number().int().positive(),
      maxDeclarationAnchorsPerSide: z.number().int().positive(),
      limit: z.number().int().positive(),
      maximumLimit: z.number().int().positive()
    }),
    hunks: z.object({
      items: z.array(z.object({}).passthrough()),
      total: z.number().int().nonnegative(),
      truncated: z.boolean()
    })
  })
  .passthrough();

const searchOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    results: z.array(
      z
        .object({
          rank: z.number().int().positive(),
          filePath: z.string(),
          language: z.enum(ARTIFACT_LANGUAGES),
          range: sourceRangeOutputSchema,
          excerpt: sourceExcerptOutputSchema,
          matchingTerms: z.array(z.string()),
          lexicalReason: z.string(),
          symbolCandidates: z.array(z.object({}).passthrough())
        })
        .passthrough()
    )
  })
  .passthrough();

const investigateOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    query: z.string(),
    bounds: z.object({
      searchLimit: z.number().int().min(1).max(MAX_SOURCE_SEARCH_LIMIT),
      maximumSearchLimit: z.literal(MAX_SOURCE_SEARCH_LIMIT),
      symbolLimit: z.number().int().min(1).max(MAX_INVESTIGATE_SYMBOL_LIMIT),
      maximumSymbolLimit: z.literal(MAX_INVESTIGATE_SYMBOL_LIMIT),
      ranking: z.enum(INVESTIGATE_RANKING_STRATEGIES),
      declarationSource: z.object({
        sourceLineLimit: z.number().int().positive(),
        sourceCharacterLimit: z.number().int().positive(),
        totalCharacterBudget: z.number().int().min(MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET).max(MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        minimumTotalCharacterBudget: z.literal(MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        maximumTotalCharacterBudget: z.literal(MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        allocationPolicy: z.literal(INVESTIGATION_SOURCE_ALLOCATION_POLICY),
        renderPolicy: z.literal(INVESTIGATION_SOURCE_RENDER_POLICY).optional(),
        requestedRenderMode: z.enum(INVESTIGATE_SOURCE_RENDER_MODES).optional()
      }),
      context: z.object({
        maxReferences: z.number().int().positive(),
        matchCandidateLimit: z.number().int().positive(),
        relationLimit: z.number().int().positive(),
        maxHops: z.number().int().positive(),
        maxVisitedSymbolsPerPath: z.number().int().positive(),
        impactDepth: z.number().int().positive(),
        impactLimit: z.number().int().positive(),
        source: z.object({
          totalCharacterBudget: z.number().int().min(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET).max(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
          minimumTotalCharacterBudget: z.literal(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET),
          maximumTotalCharacterBudget: z.literal(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET),
          minimumPerReference: z.literal(CONTEXT_SOURCE_MINIMUM_PER_REFERENCE),
          allocationPolicy: z.literal(CONTEXT_SOURCE_ALLOCATION_POLICY)
        })
      })
    }),
    search: z.object({
      results: z.array(z.object({}).passthrough())
    }),
    selection: z.object({
      items: z.array(
        z.object({
          selectionRank: z.number().int().positive(),
          sourceRank: z.number().int().positive(),
          candidateRank: z.number().int().positive(),
          generatedRanking: z.object({
            itemId: z.string().min(1),
            filePath: z.string().min(1),
            generated: z.object({
              classifierVersion: z.string().min(1),
              generated: z.boolean(),
              evidence: z.array(z.object({
                kind: z.enum(["path", "header"]),
                ruleId: z.string().min(1),
                range: sourceRangeOutputSchema.nullable()
              })).max(8)
            }),
            baseRank: z.number().int().positive(),
            finalRank: z.number().int().positive(),
            generatedPenalty: z.union([z.literal(0), z.literal(1)]),
            reason: z.enum([
              "handwritten-preferred",
              "generated-file-soft-penalty",
              "original-order-preserved"
            ])
          }),
          structuralSignals: z.object({
            directExactCallerCount: z.number().int().nonnegative(),
            directExactCalleeCount: z.number().int().nonnegative(),
            isExported: z.boolean(),
            score: z.number().int().nonnegative()
          }),
          topologySignals: z
            .object({
              maxHops: z.literal(INVESTIGATE_TOPOLOGY_RANKING_MAX_HOPS),
              maxVisitedSymbols: z.literal(INVESTIGATE_TOPOLOGY_RANKING_MAX_VISITED_SYMBOLS),
              seedLimit: z.literal(INVESTIGATE_TOPOLOGY_RANKING_SEED_LIMIT),
              seedCount: z.number().int().nonnegative(),
              seedTruncated: z.boolean(),
              seeded: z.boolean(),
              scopeSymbolCount: z.number().int().nonnegative(),
              scopedExactNeighborCount: z.number().int().nonnegative(),
              iterationCount: z.literal(INVESTIGATE_TOPOLOGY_RANKING_ITERATION_COUNT),
              restartProbability: z.literal(INVESTIGATE_TOPOLOGY_RANKING_RESTART_PROBABILITY),
              edgeKinds: z.tuple([
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[0]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[1]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[2]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[3]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[4]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[5]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[6]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[7]),
                z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[8])
              ]),
              scopedExactIncidentEdgeKindCounts: z.tuple([
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[0]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[1]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[2]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[3]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[4]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[5]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[6]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[7]),
                  count: z.number().int().nonnegative()
                }),
                z.object({
                  kind: z.literal(DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS[8]),
                  count: z.number().int().nonnegative()
                })
              ]),
              score: z.number().nonnegative(),
              traversalTruncated: z.boolean(),
              depthLimitReached: z.boolean()
            })
            .nullable(),
          impactSignals: z
            .object({
              maxDepth: z.literal(INVESTIGATE_IMPACT_RANKING_MAX_DEPTH),
              pathLimit: z.literal(INVESTIGATE_IMPACT_RANKING_PATH_LIMIT),
              exactDependentCount: z.number().int().nonnegative(),
              directExactDependentCount: z.number().int().nonnegative(),
              multiHopExactDependentCount: z.number().int().nonnegative(),
              pathCountsByDepth: z.tuple([
                z.object({ depth: z.literal(1), count: z.number().int().nonnegative() }),
                z.object({ depth: z.literal(2), count: z.number().int().nonnegative() }),
                z.object({
                  depth: z.literal(INVESTIGATE_IMPACT_RANKING_MAX_DEPTH),
                  count: z.number().int().nonnegative()
                })
              ]),
              finalEdgeKindCounts: z.tuple([
                z.object({ kind: z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[0]), count: z.number().int().nonnegative() }),
                z.object({ kind: z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[1]), count: z.number().int().nonnegative() }),
                z.object({ kind: z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[2]), count: z.number().int().nonnegative() }),
                z.object({ kind: z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[3]), count: z.number().int().nonnegative() }),
                z.object({ kind: z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[4]), count: z.number().int().nonnegative() })
              ]),
              score: z.number().int().nonnegative(),
              truncated: z.boolean()
            })
            .nullable(),
          lexicalFocus: z.object({
            language: z.enum(ARTIFACT_LANGUAGES),
            range: sourceRangeOutputSchema,
            matchingTerms: z.array(z.string())
          }),
          symbol: z.object({}).passthrough()
        })
      ),
      total: z.number().int().nonnegative(),
      truncated: z.boolean()
    }),
    declarations: z.array(
      z.object({
        reference: z.string(),
        sourceAvailability: z.enum(["active-generation", "unavailable", "not-applicable"]),
        source: investigateNodeSourceOutputSchema.nullable(),
        allocation: z.object({
          selectionRank: z.number().int().positive(),
          requestedCharacters: z.number().int().nonnegative(),
          allocatedCharacters: z.number().int().nonnegative(),
          emittedCharacters: z.number().int().nonnegative(),
          truncated: z.boolean()
        }).nullable(),
        render: investigateSourceRenderReceiptOutputSchema.nullable().optional()
      })
    ),
    sourceAllocation: z.object({
      policy: z.literal(INVESTIGATION_SOURCE_ALLOCATION_POLICY),
      budget: z.object({
        characterBudget: z.number().int().min(MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET).max(MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        minimumCharacterBudget: z.literal(MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        maximumCharacterBudget: z.literal(MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET),
        minimumPerFile: z.literal(INVESTIGATION_SOURCE_MINIMUM_PER_FILE)
      }),
      summary: z.object({
        candidateFileCount: z.number().int().nonnegative(),
        requestedCharacters: z.number().int().nonnegative(),
        allocatedCharacters: z.number().int().nonnegative(),
        emittedCharacters: z.number().int().nonnegative(),
        reservedButNotEmittedCharacters: z.number().int().nonnegative().optional(),
        unusedCharacters: z.number().int().nonnegative(),
        truncated: z.boolean()
      }),
      files: z.array(z.object({
        filePath: z.string().min(1),
        selectionRanks: z.array(z.number().int().positive()).min(1),
        declarationReferences: z.array(z.string().min(1)).min(1),
        requestedCharacters: z.number().int().nonnegative(),
        rankWeight: z.number().positive(),
        generatedMultiplier: z.number().positive().max(1),
        effectiveWeight: z.number().positive(),
        allocatedCharacters: z.number().int().nonnegative(),
        emittedCharacters: z.number().int().nonnegative(),
        reservedButNotEmittedCharacters: z.number().int().nonnegative().optional(),
        truncated: z.boolean(),
        reason: z.enum(["selection-rank-weight", "generated-file-worth-penalty"])
      }))
    }),
    contexts: z.array(z.object({}).passthrough()),
    evidencePaths: z.array(z.object({}).passthrough()),
    sessionSource: z.union([
      z.object({
        policy: z.literal(MCP_INVESTIGATE_SOURCE_SESSION_POLICY),
        scope: z.literal("mcp-server-session"),
        mode: z.enum(MCP_INVESTIGATE_SOURCE_SESSION_MODES),
        projectPath: z.string().min(1),
        generationId: z.string().min(1),
        callIndex: z.number().int().positive(),
        generationReset: z.boolean(),
        bounds: z.object({
          maximumProjects: z.number().int().positive(),
          maximumSegmentsPerProject: z.number().int().positive()
        }),
        summary: z.object({
          candidateSegments: z.number().int().nonnegative(),
          emittedSegments: z.number().int().nonnegative(),
          referencedSegments: z.number().int().nonnegative(),
          emittedCharacters: z.number().int().nonnegative(),
          avoidedCharacters: z.number().int().nonnegative(),
          stateSegmentsAfterCall: z.number().int().nonnegative(),
          stateTruncated: z.boolean()
        })
      }),
      sourceSessionReceiptOutputSchema
    ]).optional()
  })
  .passthrough();

const indexedFileSummaryOutputSchema = z.object({
  filePath: z.string().min(1),
  language: z.enum(ARTIFACT_LANGUAGES),
  indexedAt: z.string().min(1),
  generated: z.object({
    classifierVersion: z.string().min(1),
    generated: z.boolean(),
    evidence: z.array(z.object({
      kind: z.enum(["path", "header"]),
      ruleId: z.string().min(1),
      range: sourceRangeOutputSchema.nullable()
    })).max(8)
  }),
  sourceRole: z.object({
    classifierVersion: z.string().min(1),
    role: z.enum(["production", "test", "icon", "localization"]),
    evidence: z.array(z.object({ kind: z.literal("path"), ruleId: z.string().min(1) })).max(1)
  }),
  declarationCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  pendingReferenceCount: z.number().int().nonnegative()
});

const fileTreeNodeOutputSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("file"),
      name: z.string().min(1),
      path: z.string().min(1),
      file: indexedFileSummaryOutputSchema
    }),
    z.object({
      kind: z.literal("directory"),
      name: z.string().min(1),
      path: z.string().min(1),
      returnedFileCount: z.number().int().nonnegative(),
      depthLimited: z.boolean(),
      children: z.array(fileTreeNodeOutputSchema)
    })
  ])
);

const filesOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      limit: z.number().int().min(1).max(MAX_FILE_LIMIT),
      maximumLimit: z.literal(MAX_FILE_LIMIT)
    }),
    format: z.enum(FILE_FORMATS),
    matchedFileCount: z.number().int().nonnegative(),
    pagination: z.object({
      returnedFileCount: z.number().int().nonnegative(),
      remainingFileCount: z.number().int().nonnegative(),
      nextCursor: z.string().min(1).max(MAX_FILE_CURSOR_LENGTH).nullable()
    }),
    files: z.array(indexedFileSummaryOutputSchema).max(MAX_FILE_LIMIT),
    tree: z.object({
      returnedFileCount: z.number().int().nonnegative(),
      children: z.array(fileTreeNodeOutputSchema)
    }).optional(),
    groups: z.array(z.object({
      language: z.enum(ARTIFACT_LANGUAGES),
      fileCount: z.number().int().nonnegative(),
      files: z.array(indexedFileSummaryOutputSchema).max(MAX_FILE_LIMIT)
    })).optional(),
    truncated: z.boolean()
  })
  .passthrough();

const fileViewOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    selection: z.object({
      requestedPath: z.string().min(1),
      filePath: z.string().min(1),
      source: z.literal("active-generation"),
      resolution: z.enum(["exact-path", "case-insensitive-path", "unique-suffix"])
    }),
    file: z.object({ language: z.enum(ARTIFACT_LANGUAGES), indexedAt: z.string().min(1) }),
    bounds: z.object({
      offset: z.number().int().positive(),
      limit: z.number().int().positive().max(MAX_FILE_VIEW_LINE_LIMIT),
      maximumLimit: z.literal(MAX_FILE_VIEW_LINE_LIMIT),
      totalLines: z.number().int().nonnegative(),
      returnedLines: z.number().int().nonnegative(),
      truncatedBefore: z.boolean(),
      truncatedAfter: z.boolean()
    }),
    contentAvailability: z.enum([
      "active-generation",
      "withheld-sensitive-format",
      "symbols-only"
    ]),
    sourceIdentity: sourceDeliveryIdentityOutputSchema.nullable().optional(),
    sourceDelivery: sourceDeliveryOutputSchema.optional(),
    sessionSource: sourceSessionReceiptOutputSchema.optional(),
    lines: z.array(z.object({ line: z.number().int().positive(), text: z.string() })),
    symbols: z.array(z.object({}).passthrough()),
    dependents: z.array(z.object({
      filePath: z.string().min(1),
      edgeKinds: z.array(z.enum(["imports", "exports"])),
      edgeCount: z.number().int().positive(),
      edges: z.array(z.object({
        sourceId: z.string().min(1),
        targetId: z.string().min(1),
        kind: z.enum(["imports", "exports"]),
        resolution: z.literal("exact"),
        confidence: z.number().min(0).max(1),
        evidence: z.object({
          ruleId: z.string().min(1),
          stage: z.enum(EDGE_EVIDENCE_STAGES),
          candidateSymbolIds: z.array(z.string().min(1))
        }).passthrough().optional()
      }).passthrough())
    }))
  })
  .passthrough();

const routesOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      limit: z.number().int().min(1).max(MAX_ROUTE_LIMIT),
      maximumLimit: z.literal(MAX_ROUTE_LIMIT)
    }),
    routes: z
      .array(
        z.object({
          method: z.enum(ROUTE_METHODS),
          path: z
            .string()
            .min(1)
            .refine((path) => path === "*" || path.startsWith("/"), {
              message: "A persisted route path must begin with '/' or be '*'."
            }),
          domain: z.string().nullable(),
          route: z.object({}).passthrough(),
          edge: z.object({}).passthrough(),
          handler: z.object({}).passthrough().nullable()
        })
      )
      .max(MAX_ROUTE_LIMIT),
    truncated: z.boolean()
  })
  .passthrough();

const entrypointsOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    bounds: z.object({
      limit: z.number().int().min(1).max(MAX_ENTRYPOINT_LIMIT),
      maximumLimit: z.literal(MAX_ENTRYPOINT_LIMIT)
    }),
    entrypoints: z
      .array(
        z.object({
          transport: z.enum(ENTRYPOINT_TRANSPORTS),
          operation: z.enum(ENTRYPOINT_OPERATIONS),
          name: z.string(),
          entrypoint: z.object({}).passthrough(),
          edge: z.object({}).passthrough(),
          handler: z.object({}).passthrough().nullable()
        })
      )
      .max(MAX_ENTRYPOINT_LIMIT),
    truncated: z.boolean()
  })
  .passthrough();

const impactOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    symbol: z.object({}).passthrough(),
    paths: z
      .array(
        z.object({
          symbols: z.array(z.object({}).passthrough()),
          edges: z.array(z.object({}).passthrough()),
          steps: z.array(z.object({}).passthrough())
        })
      )
      .max(MAX_IMPACT_LIMIT),
    summary: z.object({
      returnedPathCount: z.number().int().min(0).max(MAX_IMPACT_LIMIT),
      impactedFileCount: z.number().int().min(0).max(MAX_IMPACT_LIMIT),
      files: z
        .array(
          z.object({
            filePath: z.string(),
            nearestDepth: z.number().int().positive(),
            impactedSymbols: z
              .array(
                z.object({
                  symbol: z.object({}).passthrough(),
                  depth: z.number().int().positive(),
                  discoveryEdge: z.object({}).passthrough()
                })
              )
              .max(MAX_IMPACT_LIMIT)
          })
        )
        .max(MAX_IMPACT_LIMIT),
      entrypointCoverage: z.object({
        routes: z.array(z.object({}).passthrough()).max(MAX_IMPACT_LIMIT),
        entrypoints: z.array(z.object({}).passthrough()).max(MAX_IMPACT_LIMIT)
      })
    }),
    truncated: z.boolean()
  })
  .passthrough();

const hierarchyOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    symbol: z.object({}).passthrough(),
    bounds: z.object({
      limit: z.number().int().min(1).max(MAX_HIERARCHY_LIMIT),
      maximumLimit: z.literal(MAX_HIERARCHY_LIMIT)
    }),
    parents: z
      .array(
        z
          .object({
            relation: z.enum(["extends", "implements"]),
            edge: z.object({}).passthrough(),
            parent: z.object({}).passthrough().nullable()
          })
          .passthrough()
      )
      .max(MAX_HIERARCHY_LIMIT),
    children: z
      .array(
        z
          .object({
            relation: z.enum(["extends", "implements"]),
            edge: z.object({}).passthrough(),
            child: z.object({}).passthrough()
          })
          .passthrough()
      )
      .max(MAX_HIERARCHY_LIMIT),
    parentsTruncated: z.boolean(),
    childrenTruncated: z.boolean()
  })
  .passthrough();

const generationSummaryOutputSchema = z
  .object({
    generationId: z.string(),
    indexedAt: z.string(),
    snapshotVersion: z.number().int().positive(),
    counts: z.object({
      files: z.number().int().nonnegative(),
      symbols: z.number().int().nonnegative(),
      edges: z.number().int().nonnegative(),
      pendingReferences: z.number().int().nonnegative()
    }),
    indexWork: z.object({}).passthrough().nullable(),
    extractorVersion: z.string().nullable(),
    resolverVersion: z.string().nullable()
  })
  .passthrough();

const boundedGenerationChangesOutputSchema = z
  .object({
    items: z.array(z.object({}).passthrough()),
    total: z.number().int().nonnegative(),
    truncated: z.boolean()
  })
  .passthrough();

const generationHistoryOutputSchema = z
  .object({
    activeStatus: indexStatusOutputSchema,
    bounds: z.object({
      limit: z.number().int().positive(),
      maximumLimit: z.number().int().positive()
    }),
    retention: z.object({
      capacity: z.number().int().positive(),
      retained: z.number().int().nonnegative(),
      returned: z.number().int().nonnegative(),
      truncated: z.boolean()
    }),
    generations: z.array(generationSummaryOutputSchema)
  })
  .passthrough();

const generationDiffOutputSchema = z
  .object({
    activeStatus: indexStatusOutputSchema,
    bounds: z.object({
      limit: z.number().int().positive(),
      maximumLimit: z.number().int().positive()
    }),
    from: generationSummaryOutputSchema,
    to: generationSummaryOutputSchema,
    files: z.object({
      added: boundedGenerationChangesOutputSchema,
      removed: boundedGenerationChangesOutputSchema,
      modified: boundedGenerationChangesOutputSchema
    }),
    symbols: z.object({
      added: boundedGenerationChangesOutputSchema,
      removed: boundedGenerationChangesOutputSchema,
      modified: boundedGenerationChangesOutputSchema
    }),
    edges: z.object({
      added: boundedGenerationChangesOutputSchema,
      removed: boundedGenerationChangesOutputSchema,
      modified: boundedGenerationChangesOutputSchema
    }),
    pendingReferences: z.object({
      added: boundedGenerationChangesOutputSchema,
      removed: boundedGenerationChangesOutputSchema,
      modified: boundedGenerationChangesOutputSchema
    })
  })
  .passthrough();

function supportsExplainEdge(service: ExploreService): service is ReadOnlyMcpService {
  return "explainEdge" in service && typeof service.explainEdge === "function";
}

function supportsNode(service: ExploreService): service is NodeMcpService {
  return "node" in service && typeof service.node === "function";
}

function supportsSearch(service: ExploreService): service is SearchMcpService {
  return "search" in service && typeof service.search === "function";
}

function supportsInvestigate(service: ExploreService): service is InvestigateMcpService {
  return "investigate" in service && typeof service.investigate === "function";
}

function supportsImpact(service: ExploreService): service is ImpactMcpService {
  return "impact" in service && typeof service.impact === "function";
}

function supportsFiles(service: ExploreService): service is FilesMcpService {
  return "files" in service && typeof service.files === "function";
}

function supportsFileView(service: ExploreService): service is FileViewMcpService {
  return "fileView" in service && typeof service.fileView === "function";
}

function supportsRoutes(service: ExploreService): service is RoutesMcpService {
  return "routes" in service && typeof service.routes === "function";
}

function supportsEntrypoints(service: ExploreService): service is EntrypointsMcpService {
  return "entrypoints" in service && typeof service.entrypoints === "function";
}

function supportsHierarchy(service: ExploreService): service is HierarchyMcpService {
  return "hierarchy" in service && typeof service.hierarchy === "function";
}

function supportsContext(service: ExploreService): service is ContextMcpService {
  return "context" in service && typeof service.context === "function";
}

function supportsAffectedTests(service: ExploreService): service is AffectedTestsMcpService {
  return "affectedTests" in service && typeof service.affectedTests === "function";
}

function supportsGenerationHistory(service: ExploreService): service is GenerationHistoryMcpService {
  return "history" in service && typeof service.history === "function";
}

function supportsGenerationDiff(service: ExploreService): service is GenerationDiffMcpService {
  return "diff" in service && typeof service.diff === "function";
}

function supportsAutoSyncStatus(service: ExploreService): service is AutoSyncStatusMcpService {
  return "autoSyncStatus" in service && typeof service.autoSyncStatus === "function";
}

function supportsAutoSyncDiagnostics(service: ExploreService): service is AutoSyncDiagnosticsMcpService {
  return "autoSyncDiagnostics" in service && typeof service.autoSyncDiagnostics === "function";
}

function supportsAutoSyncDiagnosticJournal(
  service: ExploreService
): service is AutoSyncDiagnosticJournalMcpService {
  return "autoSyncJournal" in service && typeof service.autoSyncJournal === "function";
}

function supportsGitAffectedTests(service: ExploreService): service is GitAffectedTestsMcpService {
  return (
    "gitAffectedTestsAvailable" in service &&
    typeof service.gitAffectedTestsAvailable === "function" &&
    service.gitAffectedTestsAvailable() &&
    "affectedTestsFromGit" in service &&
    typeof service.affectedTestsFromGit === "function"
  );
}

function supportsGitHunks(service: ExploreService): service is GitHunksMcpService {
  return (
    "gitHunksAvailable" in service &&
    typeof service.gitHunksAvailable === "function" &&
    service.gitHunksAvailable() &&
    "gitHunks" in service &&
    typeof service.gitHunks === "function"
  );
}

function renderToolError(error: unknown): ReadOnlyToolResponse {
  const message =
    error instanceof SymbolLatticeError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Unknown SymbolLattice error.";
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

/** Reports host-owned watcher health and live index freshness without triggering a sync. */
export async function runAutoSyncStatusTool(
  service: AutoSyncStatusService,
  _arguments: AutoSyncStatusToolArguments = {}
): Promise<AutoSyncStatusToolResponse> {
  try {
    const result = await service.autoSyncStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Returns host-local read-query worker health without reading project content. */
export async function runQueryPoolStatusTool(
  service: QueryPoolStatusService,
  _arguments: QueryPoolStatusToolArguments = {}
): Promise<QueryPoolStatusToolResponse> {
  try {
    const result = await service.queryPoolStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Returns bounded host-owned watcher history without triggering index work. */
export async function runAutoSyncDiagnosticsTool(
  service: AutoSyncDiagnosticsService,
  arguments_: AutoSyncDiagnosticsToolArguments = {}
): Promise<AutoSyncDiagnosticsToolResponse> {
  try {
    const result = await service.autoSyncDiagnostics(
      arguments_.limit === undefined ? {} : { limit: arguments_.limit }
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Reads bounded durable watcher history without creating, indexing, or synchronizing a project. */
export async function runAutoSyncDiagnosticJournalTool(
  service: AutoSyncDiagnosticJournalService,
  arguments_: AutoSyncDiagnosticJournalToolArguments = {}
): Promise<AutoSyncDiagnosticJournalToolResponse> {
  try {
    const result = await service.autoSyncJournal(
      arguments_.limit === undefined ? {} : { limit: arguments_.limit }
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds a read-only tool result without ever triggering an index operation. */
export async function runExploreTool(
  service: ExploreService,
  defaultProjectPath: string,
  arguments_: ExploreToolArguments
): Promise<ExploreToolResponse> {
  try {
    const result = await service.explore(arguments_.projectPath ?? defaultProjectPath, arguments_.query);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Retrieves exact persisted node evidence without ever triggering an index operation. */
export async function runNodeTool(
  service: NodeService,
  defaultProjectPath: string,
  arguments_: NodeToolArguments
): Promise<NodeToolResponse> {
  try {
    const result = await service.node(arguments_.projectPath ?? defaultProjectPath, arguments_.query);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds a bounded, generation-bound context response without indexing. */
export async function runContextTool(
  service: ContextService,
  defaultProjectPath: string,
  arguments_: ContextToolArguments
): Promise<ContextToolResponse> {
  try {
    const options: ContextOptions = {
      ...(arguments_.relationLimit === undefined ? {} : { relationLimit: arguments_.relationLimit }),
      ...(arguments_.maxHops === undefined ? {} : { maxHops: arguments_.maxHops }),
      ...(arguments_.impactDepth === undefined ? {} : { impactDepth: arguments_.impactDepth }),
      ...(arguments_.impactLimit === undefined ? {} : { impactLimit: arguments_.impactLimit }),
      ...(arguments_.sourceCharacterBudget === undefined
        ? {}
        : { sourceCharacterBudget: arguments_.sourceCharacterBudget })
    };
    const result = await service.context(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.references,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds an idempotent changed-file test-selection response without indexing. */
export async function runAffectedTestsTool(
  service: AffectedTestsService,
  defaultProjectPath: string,
  arguments_: AffectedTestsToolArguments
): Promise<AffectedTestsToolResponse> {
  try {
    const options: AffectedTestsOptions = {
      ...(arguments_.maxDepth === undefined ? {} : { maxDepth: arguments_.maxDepth }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.testPattern === undefined ? {} : { testPattern: arguments_.testPattern })
    };
    const result = await service.affectedTests(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.filePaths,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds a bounded local-Git changed-file selection response without indexing. */
export async function runGitAffectedTestsTool(
  service: GitAffectedTestsService,
  defaultProjectPath: string,
  arguments_: GitAffectedTestsToolArguments
): Promise<GitAffectedTestsToolResponse> {
  try {
    const options: GitAffectedTestsOptions = {
      ...(arguments_.baseRef === undefined ? {} : { baseRef: arguments_.baseRef }),
      ...(arguments_.maxDepth === undefined ? {} : { maxDepth: arguments_.maxDepth }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path }),
      ...(arguments_.testPattern === undefined ? {} : { testPattern: arguments_.testPattern })
    };
    const result = await service.affectedTestsFromGit(
      arguments_.projectPath ?? defaultProjectPath,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds a bounded immutable Git hunk-attribution response without indexing. */
export async function runGitHunksTool(
  service: GitHunksService,
  defaultProjectPath: string,
  arguments_: GitHunksToolArguments
): Promise<GitHunksToolResponse> {
  try {
    const options: GitHunksOptions = {
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path })
    };
    const result = await service.gitHunks(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.baseRef,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds an idempotent indexed-source retrieval response without triggering an index operation. */
export async function runSearchTool(
  service: SearchService,
  defaultProjectPath: string,
  arguments_: SearchToolArguments
): Promise<SearchToolResponse> {
  try {
    const options: SearchOptions = {
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path }),
      ...(arguments_.language === undefined ? {} : { language: arguments_.language })
    };
    const result = await service.search(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.query,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds a one-question, persisted-generation graph context without indexing. */
export async function runInvestigateTool(
  service: InvestigateService,
  defaultProjectPath: string,
  arguments_: InvestigateToolArguments
): Promise<InvestigateToolResponse> {
  try {
    const options: InvestigateOptions = {
      ...(arguments_.searchLimit === undefined ? {} : { searchLimit: arguments_.searchLimit }),
      ...(arguments_.symbolLimit === undefined ? {} : { symbolLimit: arguments_.symbolLimit }),
      ...(arguments_.sourceCharacterBudget === undefined
        ? {}
        : { sourceCharacterBudget: arguments_.sourceCharacterBudget }),
      ...(arguments_.sourceRenderMode === undefined
        ? {}
        : { sourceRenderMode: arguments_.sourceRenderMode }),
      ...(arguments_.ranking === undefined ? {} : { ranking: arguments_.ranking }),
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path }),
      ...(arguments_.language === undefined ? {} : { language: arguments_.language }),
      ...(arguments_.relationLimit === undefined ? {} : { relationLimit: arguments_.relationLimit }),
      ...(arguments_.maxHops === undefined ? {} : { maxHops: arguments_.maxHops }),
      ...(arguments_.impactDepth === undefined ? {} : { impactDepth: arguments_.impactDepth }),
      ...(arguments_.impactLimit === undefined ? {} : { impactLimit: arguments_.impactLimit })
    };
    const result = await service.investigate(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.query,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Returns bounded reverse-impact evidence from an existing generation without indexing. */
export async function runImpactTool(
  service: ImpactService,
  defaultProjectPath: string,
  arguments_: ImpactToolArguments
): Promise<ImpactToolResponse> {
  try {
    const result = await service.impact(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.reference,
      {
        maxDepth: arguments_.maxDepth ?? 1,
        limit: arguments_.limit ?? MAX_IMPACT_LIMIT
      }
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Lists bounded persisted file records without ever triggering an index operation. */
export async function runFilesTool(
  service: FilesService,
  defaultProjectPath: string,
  arguments_: FilesToolArguments
): Promise<FilesToolResponse> {
  try {
    const options: FilesOptions = {
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path }),
      ...(arguments_.language === undefined ? {} : { language: arguments_.language }),
      ...(arguments_.pattern === undefined ? {} : { pattern: arguments_.pattern }),
      ...(arguments_.format === undefined ? {} : { format: arguments_.format }),
      ...(arguments_.maxDepth === undefined ? {} : { maxDepth: arguments_.maxDepth }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.cursor === undefined ? {} : { cursor: arguments_.cursor })
    };
    const result = await service.files(arguments_.projectPath ?? defaultProjectPath, options);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Reads one immutable active-generation file view without touching the live source. */
export async function runFileViewTool(
  service: FileViewService,
  defaultProjectPath: string,
  arguments_: FileViewToolArguments
): Promise<FileViewToolResponse> {
  try {
    const options: FileViewOptions = {
      ...(arguments_.offset === undefined ? {} : { offset: arguments_.offset }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit }),
      ...(arguments_.symbolsOnly === undefined ? {} : { symbolsOnly: arguments_.symbolsOnly })
    };
    const result = await service.fileView(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.filePath,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Lists bounded persisted route facts without ever triggering an index operation. */
export async function runRoutesTool(
  service: RoutesService,
  defaultProjectPath: string,
  arguments_: RoutesToolArguments
): Promise<RoutesToolResponse> {
  try {
    const options: RoutesOptions = {
      ...(arguments_.method === undefined ? {} : { method: arguments_.method }),
      ...(arguments_.path === undefined ? {} : { pathPrefix: arguments_.path }),
      ...(arguments_.domain === undefined ? {} : { domain: arguments_.domain }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit })
    };
    const result = await service.routes(arguments_.projectPath ?? defaultProjectPath, options);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Lists bounded persisted non-HTTP entrypoints without ever triggering an index operation. */
export async function runEntrypointsTool(
  service: EntrypointsService,
  defaultProjectPath: string,
  arguments_: EntrypointsToolArguments
): Promise<EntrypointsToolResponse> {
  try {
    const options: EntrypointsOptions = {
      ...(arguments_.transport === undefined ? {} : { transport: arguments_.transport }),
      ...(arguments_.operation === undefined ? {} : { operation: arguments_.operation }),
      ...(arguments_.name === undefined ? {} : { namePrefix: arguments_.name }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit })
    };
    const result = await service.entrypoints(arguments_.projectPath ?? defaultProjectPath, options);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Returns bounded direct hierarchy facts without ever triggering an index operation. */
export async function runHierarchyTool(
  service: HierarchyService,
  defaultProjectPath: string,
  arguments_: HierarchyToolArguments
): Promise<HierarchyToolResponse> {
  try {
    const options: HierarchyOptions =
      arguments_.limit === undefined ? {} : { limit: arguments_.limit };
    const result = await service.hierarchy(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.reference,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Lists immutable retained graph generations without initializing or synchronizing. */
export async function runGenerationHistoryTool(
  service: GenerationHistoryService,
  defaultProjectPath: string,
  arguments_: GenerationHistoryToolArguments
): Promise<GenerationHistoryToolResponse> {
  try {
    const options: GenerationHistoryOptions =
      arguments_.limit === undefined ? {} : { limit: arguments_.limit };
    const result = await service.history(
      arguments_.projectPath ?? defaultProjectPath,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Compares two immutable retained graph generations without reading Git or live source. */
export async function runGenerationDiffTool(
  service: GenerationDiffService,
  defaultProjectPath: string,
  arguments_: GenerationDiffToolArguments
): Promise<GenerationDiffToolResponse> {
  try {
    const options: GenerationDiffOptions = {
      ...(arguments_.toGenerationId === undefined
        ? {}
        : { toGenerationId: arguments_.toGenerationId }),
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit })
    };
    const result = await service.diff(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.fromGenerationId,
      options
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

/** Builds an idempotent evidence response without ever triggering an index operation. */
export async function runExplainEdgeTool(
  service: ExplainEdgeService,
  defaultProjectPath: string,
  arguments_: ExplainEdgeToolArguments
): Promise<ExplainEdgeToolResponse> {
  try {
    const result = await service.explainEdge(
      arguments_.projectPath ?? defaultProjectPath,
      arguments_.edgeId
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>
    };
  } catch (error) {
    return renderToolError(error);
  }
}

export function createMcpServer(
  service: ExploreService,
  defaultProjectPath: string,
  options: CreateMcpServerOptions = {}
): McpServer {
  const server = new McpServer(
    { name: "SymbolLattice", version: SYMBOL_LATTICE_VERSION },
    { instructions: SYMBOL_LATTICE_MCP_INSTRUCTIONS }
  );
  const readQueryExecutor = options.readQueryExecutor;
  const investigateSourceSession = new McpInvestigateSourceSession({
    maximumProjects: MCP_INVESTIGATE_SOURCE_SESSION_LIMITS.maximumProjects,
    maximumSegmentsPerProject: MCP_INVESTIGATE_SOURCE_SESSION_LIMITS.maximumSegmentsPerProject
  });
  const sourceSession = new McpSourceSession({
    maximumProjects: MCP_SOURCE_SESSION_LIMITS.maximumProjects,
    maximumSourcesPerProject: MCP_SOURCE_SESSION_LIMITS.maximumSourcesPerProject
  });

  server.registerTool(
    "SymbolLattice_explore",
    {
      title: "Explore a SymbolLattice code graph",
      description:
        "Primary read-equivalent code-intelligence tool. Call it before Read or Grep for code questions, architecture, flows, bug fixes, feature work, or a named file or symbol. It returns generation-bound line-numbered source, exact connections and paths, plus bounded impact context; treat returned source as already read. It reports index freshness and never creates or refreshes an index.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Exact symbol reference or a bounded question containing project-relative file and identifier clues."),
        projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
        sourceSessionMode: z.enum(MCP_SOURCE_SESSION_MODES).optional().describe("MCP-only exact-source delivery policy shared across explore, context, node, investigate, and file. `deduplicate` is the default; `full` re-emits source.")
      },
      outputSchema: exploreOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true
      }
    },
    async (arguments_) => {
      const response = await executeReadTool(readQueryExecutor, "explore", arguments_, () =>
        runExploreTool(service, defaultProjectPath, arguments_)
      );
      return sourceSession.project(response, "explore", arguments_.sourceSessionMode ?? "deduplicate");
    }
  );

  const queryPoolStatusService = options.queryPoolStatusService ?? null;
  if (queryPoolStatusService !== null && isMcpToolEnabled(options.enabledTools, "query_pool_status")) {
    server.registerTool(
      "SymbolLattice_query_pool_status",
      {
        title: "Inspect SymbolLattice MCP query-pool health",
        description:
          "Returns host-local query-worker, queue, crash, and fallback counters. It contains no project path, source, query, or graph data and never creates, indexes, or synchronizes a project.",
        inputSchema: {},
        outputSchema: queryPoolStatusOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => runQueryPoolStatusTool(queryPoolStatusService, arguments_)
    );
  }

  const autoSyncStatusService = supportsAutoSyncStatus(service) ? service : null;
  if (autoSyncStatusService !== null && isMcpToolEnabled(options.enabledTools, "auto_sync_status")) {
    server.registerTool(
      "SymbolLattice_auto_sync_status",
      {
        title: "Inspect SymbolLattice MCP auto-sync health",
        description:
          "Reports the default MCP host's live index freshness plus its background watcher state, retry information, and bounded pending-file summary. This tool only reads status; it never creates, indexes, or synchronizes a project.",
        inputSchema: {},
        outputSchema: autoSyncStatusOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => runAutoSyncStatusTool(autoSyncStatusService, arguments_)
    );
  }

  const autoSyncDiagnosticsService = supportsAutoSyncDiagnostics(service) ? service : null;
  if (autoSyncDiagnosticsService !== null && isMcpToolEnabled(options.enabledTools, "auto_sync_diagnostics")) {
    server.registerTool(
      "SymbolLattice_auto_sync_diagnostics",
      {
        title: "Inspect SymbolLattice MCP auto-sync diagnostics",
        description:
          "Returns the default MCP host's live index observation when available plus a bounded chronological watcher timeline. It only reads host-owned state and never creates, indexes, or synchronizes a project.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_AUTO_SYNC_DIAGNOSTIC_EVENTS)
            .optional()
            .describe("Maximum latest watcher transitions to return.")
        },
        outputSchema: autoSyncDiagnosticsOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => runAutoSyncDiagnosticsTool(autoSyncDiagnosticsService, arguments_)
    );
  }

  const autoSyncDiagnosticJournalService = supportsAutoSyncDiagnosticJournal(service) ? service : null;
  if (autoSyncDiagnosticJournalService !== null && isMcpToolEnabled(options.enabledTools, "auto_sync_journal")) {
    server.registerTool(
      "SymbolLattice_auto_sync_journal",
      {
        title: "Inspect durable SymbolLattice auto-sync history",
        description:
          "Returns bounded persisted watcher transitions for the default MCP project. This tool only reads a host-owned diagnostic journal; it never creates, indexes, or synchronizes a project.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS)
            .optional()
            .describe("Maximum latest persisted watcher transitions to return.")
        },
        outputSchema: autoSyncDiagnosticJournalOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        runAutoSyncDiagnosticJournalTool(autoSyncDiagnosticJournalService, arguments_)
    );
  }

  const nodeService = supportsNode(service) ? service : null;
  if (nodeService !== null && isMcpToolEnabled(options.enabledTools, "node")) {
    server.registerTool(
      "SymbolLattice_node",
      {
        title: "Retrieve an exact SymbolLattice node",
        description:
          "Retrieves one node's persisted graph evidence from an existing local SymbolLattice index. This tool never creates or refreshes an index.",
        inputSchema: {
          query: z.string().trim().min(1).describe("Exact symbol or source reference for the indexed node."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          sourceSessionMode: z.enum(MCP_SOURCE_SESSION_MODES).optional().describe("MCP-only exact-source delivery policy shared with investigate and file. `deduplicate` is the default; `full` re-emits source.")
        },
        outputSchema: nodeOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => {
        const response = await executeReadTool(readQueryExecutor, "node", arguments_, () =>
          runNodeTool(nodeService, defaultProjectPath, arguments_)
        );
        return sourceSession.project(response, "node", arguments_.sourceSessionMode ?? "deduplicate");
      }
    );
  }

  const contextService = supportsContext(service) ? service : null;
  if (contextService !== null && isMcpToolEnabled(options.enabledTools, "context")) {
    server.registerTool(
      "SymbolLattice_context",
      {
        title: "Build a bounded SymbolLattice context pack",
        description:
          "Resolves up to eight symbol references from one existing SymbolLattice generation, returns generation-bound source when available, bounded callers/callees/impact, and directed static evidence paths for adjacent references. This tool never creates or refreshes an index.",
        inputSchema: {
          references: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(MAX_CONTEXT_REFERENCES)
            .describe("One to eight symbol references in the order whose adjacent directed paths should be checked."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          relationLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_RELATION_LIMIT)
            .optional()
            .describe("Maximum direct callers and callees included for each exact symbol."),
          maxHops: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_MAX_HOPS)
            .optional()
            .describe("Maximum directed call/route/import hops in each adjacent-reference evidence path."),
          impactDepth: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_IMPACT_DEPTH)
            .optional()
            .describe("Maximum reverse dependency depth included for each exact symbol."),
          impactLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_IMPACT_LIMIT)
            .optional()
            .describe("Maximum reverse-impact paths included for each exact symbol."),
          sourceCharacterBudget: z
            .number()
            .int()
            .min(MIN_CONTEXT_SOURCE_CHARACTER_BUDGET)
            .max(MAX_CONTEXT_SOURCE_CHARACTER_BUDGET)
            .optional()
            .describe("Shared persisted-source character envelope across all exact context references."),
          sourceSessionMode: z.enum(MCP_SOURCE_SESSION_MODES).optional().describe("MCP-only exact-source delivery policy shared across explore, context, node, investigate, and file. `deduplicate` is the default; `full` re-emits source.")
        },
        outputSchema: contextOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => {
        const response = await executeReadTool(readQueryExecutor, "context", arguments_, () =>
          runContextTool(contextService, defaultProjectPath, arguments_)
        );
        return sourceSession.project(response, "context", arguments_.sourceSessionMode ?? "deduplicate");
      }
    );
  }

  const affectedTestsService = supportsAffectedTests(service) ? service : null;
  if (affectedTestsService !== null && isMcpToolEnabled(options.enabledTools, "affected")) {
    server.registerTool(
      "SymbolLattice_affected",
      {
        title: "Select affected tests from a SymbolLattice generation",
        description:
          "Accepts changed project files and returns conventionally named tests, or tests selected by one optional project-relative glob, reached through exact persisted import/export evidence with bounded proof paths and explicit completeness limitations. This tool never runs Git, creates, or refreshes an index.",
        inputSchema: {
          filePaths: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(MAX_AFFECTED_CHANGED_FILES)
            .describe("One to fifty changed project-relative or absolute source file paths."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          maxDepth: z
            .number()
            .int()
            .min(1)
            .max(MAX_AFFECTED_MAX_DEPTH)
            .optional()
            .describe("Maximum reverse exact import/export depth per changed file."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_AFFECTED_LIMIT)
            .optional()
            .describe("Maximum proof-bearing affected-test records returned."),
          testPattern: z
            .string()
            .trim()
            .min(1)
            .max(MAX_FILE_PATTERN_LENGTH)
            .optional()
            .describe("Optional anchored project-relative glob that replaces conventional test classification.")
        },
        outputSchema: affectedTestsOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "affected-tests", arguments_, () =>
          runAffectedTestsTool(affectedTestsService, defaultProjectPath, arguments_)
        )
    );
  }

  const gitAffectedTestsService = supportsGitAffectedTests(service) ? service : null;
  if (gitAffectedTestsService !== null && isMcpToolEnabled(options.enabledTools, "affected_git")) {
    server.registerTool(
      "SymbolLattice_affected_git",
      {
        title: "Select affected tests from a local Git change set",
        description:
          "Uses local read-only Git commands to select TypeScript/JavaScript changes, then returns conventionally named tests, or tests selected by one optional project-relative glob, with exact persisted import/export proofs and completeness limits. Omit baseRef for HEAD-to-working-tree plus untracked files; provide baseRef for local merge-base-to-HEAD selection. This tool never fetches, creates, refreshes, or synchronizes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed Git project."),
          baseRef: z
            .string()
            .min(1)
            .max(256)
            .optional()
            .describe("Optional local Git ref; compares its merge-base with HEAD. Omit for working-tree selection."),
          path: z
            .string()
            .min(1)
            .optional()
            .describe("Optional project-relative file or directory matched on either rename/copy path side."),
          maxDepth: z
            .number()
            .int()
            .min(1)
            .max(MAX_AFFECTED_MAX_DEPTH)
            .optional()
            .describe("Maximum reverse exact import/export depth per selected source file."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_AFFECTED_LIMIT)
            .optional()
            .describe("Maximum proof-bearing affected-test records returned."),
          testPattern: z
            .string()
            .trim()
            .min(1)
            .max(MAX_FILE_PATTERN_LENGTH)
            .optional()
            .describe("Optional anchored project-relative glob that replaces conventional test classification.")
        },
        outputSchema: gitAffectedTestsOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "git-affected-tests", arguments_, () =>
          runGitAffectedTestsTool(gitAffectedTestsService, defaultProjectPath, arguments_)
        )
    );
  }

  const gitHunksService = supportsGitHunks(service) ? service : null;
  if (gitHunksService !== null && isMcpToolEnabled(options.enabledTools, "git_hunks")) {
    server.registerTool(
      "SymbolLattice_git_hunks",
      {
        title: "Attribute immutable local Git hunks to declarations",
        description:
          "Resolves the local merge-base of baseRef and HEAD, reads only immutable local Git blobs, and attributes TypeScript/JavaScript hunk sides to declarations extracted within each exact revision. Declaration IDs are revision-local: this tool does not infer rename, move, or old/new identity continuity. It never fetches, reads working-tree or staged changes, creates, refreshes, or synchronizes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to a local Git project."),
          baseRef: z
            .string()
            .min(1)
            .max(256)
            .describe("Required local Git ref; compares its resolved merge-base with HEAD."),
          path: z
            .string()
            .min(1)
            .optional()
            .describe("Optional project-relative file or directory matched on either rename/copy path side."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_GIT_HUNK_LIMIT)
            .optional()
            .describe("Maximum hunk records returned across all supported source files.")
        },
        outputSchema: gitHunksOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "git-hunks", arguments_, () =>
          runGitHunksTool(gitHunksService, defaultProjectPath, arguments_)
        )
    );
  }

  const searchService = supportsSearch(service) ? service : null;
  if (searchService !== null && isMcpToolEnabled(options.enabledTools, "search")) {
    server.registerTool(
      "SymbolLattice_search",
      {
        title: "Search an indexed SymbolLattice generation",
        description:
          "Searches source text from an existing indexed SymbolLattice generation, returns matching evidence and stale status, and never creates or refreshes an index.",
        inputSchema: {
          query: z.string().trim().min(1).describe("Words or identifier fragments to search for in indexed source text."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return (1-100)."),
          path: z.string().trim().min(1).optional().describe("Optional project-relative source-path prefix."),
          language: z.enum(ARTIFACT_LANGUAGES).optional().describe("Optional indexed source language filter.")
        },
        outputSchema: searchOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "search", arguments_, () =>
          runSearchTool(searchService, defaultProjectPath, arguments_)
        )
    );
  }

  const investigateService = supportsInvestigate(service) ? service : null;
  if (investigateService !== null && isMcpToolEnabled(options.enabledTools, "investigate")) {
    server.registerTool(
      "SymbolLattice_investigate",
      {
        title: "Investigate one question through a SymbolLattice generation",
        description:
          "Searches persisted source evidence, deterministically selects overlapping declarations, and returns their generation-bound source, callers, callees, impact, and adjacent proof paths. This tool never creates or refreshes an index.",
        inputSchema: {
          query: z.string().trim().min(1).describe("Words or identifier fragments to investigate in indexed source text."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          searchLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_SOURCE_SEARCH_LIMIT)
            .optional()
            .describe(`Maximum persisted source matches examined (1-${MAX_SOURCE_SEARCH_LIMIT}).`),
          symbolLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_INVESTIGATE_SYMBOL_LIMIT)
            .optional()
            .describe(`Maximum distinct declaration contexts returned (1-${MAX_INVESTIGATE_SYMBOL_LIMIT}).`),
          sourceCharacterBudget: z
            .number()
            .int()
            .min(MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET)
            .max(MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET)
            .optional()
            .describe(`Shared emitted declaration-source budget (${MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET}-${MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET} characters).`),
          sourceRenderMode: z
            .enum(INVESTIGATE_SOURCE_RENDER_MODES)
            .optional()
            .describe("`adaptive` returns full source when it fits, then a persisted lexical-focus slice; `prefix`, `focused`, and `signature` request one exact segment; `multi` requests at most two independently hashable signature-plus-focus segments."),
          sourceSessionMode: z
            .enum(MCP_INVESTIGATE_SOURCE_SESSION_MODES)
            .optional()
            .describe("MCP-only delivery policy. `deduplicate` (default) replaces proven same-generation segments already delivered by this server session with explicit back-references; `full` re-emits exact source."),
          ranking: z
            .enum(INVESTIGATE_RANKING_STRATEGIES)
            .optional()
            .describe("`lexical` preserves persisted FTS order; `structure` uses direct static signals; `impact` uses bounded exact reverse-impact evidence; `topology` uses a bounded bidirectional exact-static restart walk."),
          path: z.string().trim().min(1).optional().describe("Optional project-relative source-path prefix."),
          language: z.enum(ARTIFACT_LANGUAGES).optional().describe("Optional indexed source language filter."),
          relationLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_RELATION_LIMIT)
            .optional()
            .describe("Maximum direct callers and callees included for each selected symbol."),
          maxHops: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_MAX_HOPS)
            .optional()
            .describe("Maximum directed call/route/import hops in adjacent evidence paths."),
          impactDepth: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_IMPACT_DEPTH)
            .optional()
            .describe("Maximum reverse dependency depth included for each selected symbol."),
          impactLimit: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_IMPACT_LIMIT)
            .optional()
            .describe("Maximum reverse-impact paths included for each selected symbol.")
        },
        outputSchema: investigateOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => {
        const response = await executeReadTool(readQueryExecutor, "investigate", arguments_, () =>
          runInvestigateTool(investigateService, defaultProjectPath, arguments_)
        );
        const projected = sourceSession.project(
          response,
          "investigate",
          arguments_.sourceSessionMode ?? "deduplicate"
        );
        return projected === response
          ? investigateSourceSession.project(response, arguments_.sourceSessionMode ?? "deduplicate")
          : projected;
      }
    );
  }

  const impactService = supportsImpact(service) ? service : null;
  if (impactService !== null && isMcpToolEnabled(options.enabledTools, "impact")) {
    server.registerTool(
      "SymbolLattice_impact",
      {
        title: "Inspect bounded SymbolLattice reverse impact",
        description:
          "Returns bounded persisted reverse-impact paths, groups their terminal symbols by file, and reports route or non-HTTP entrypoint records only when a retained path ends at that same persisted record. This tool never creates or refreshes an index.",
        inputSchema: {
          reference: z.string().trim().min(1).describe("Exact symbol or source reference in an already indexed project."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          maxDepth: z
            .number()
            .int()
            .min(1)
            .max(MAX_CONTEXT_IMPACT_DEPTH)
            .optional()
            .describe(`Maximum reverse dependency depth (1-${MAX_CONTEXT_IMPACT_DEPTH}).`),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_IMPACT_LIMIT)
            .optional()
            .describe(`Maximum returned impact paths (1-${MAX_IMPACT_LIMIT}).`)
        },
        outputSchema: impactOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "impact", arguments_, () =>
          runImpactTool(impactService, defaultProjectPath, arguments_)
        )
    );
  }

  const filesService = supportsFiles(service) ? service : null;
  if (filesService !== null && isMcpToolEnabled(options.enabledTools, "files")) {
    server.registerTool(
      "SymbolLattice_files",
      {
        title: "List indexed files from a SymbolLattice generation",
        description:
          "Lists bounded file records and per-file graph counts from an existing SymbolLattice generation. File results are persisted evidence; the reported status may check freshness but this tool never creates or refreshes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          path: z.string().trim().min(1).optional().describe("Optional project-relative indexed-file prefix."),
          language: z.enum(ARTIFACT_LANGUAGES).optional().describe("Optional indexed source language filter."),
          pattern: z.string().trim().min(1).max(MAX_FILE_PATTERN_LENGTH).optional()
            .describe("Optional anchored project-relative glob using *, ?, and **."),
          format: z.enum(FILE_FORMATS).optional()
            .describe("Optional flat, tree, or language-grouped projection."),
          maxDepth: z.number().int().min(1).max(MAX_FILE_TREE_DEPTH).optional()
            .describe(`Maximum tree depth (1-${MAX_FILE_TREE_DEPTH}; tree format only).`),
          cursor: z.string().min(1).max(MAX_FILE_CURSOR_LENGTH).refine((value) => value === value.trim(), {
            message: "File cursor must not have surrounding whitespace."
          }).optional().describe("Opaque continuation token from a previous files result."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_FILE_LIMIT)
            .optional()
            .describe(`Maximum indexed file records to return (1-${MAX_FILE_LIMIT}).`)
        },
        outputSchema: filesOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "files", arguments_, () =>
          runFilesTool(filesService, defaultProjectPath, arguments_)
        )
    );
  }

  const fileViewService = supportsFileView(service) ? service : null;
  if (fileViewService !== null && isMcpToolEnabled(options.enabledTools, "file")) {
    server.registerTool(
      "SymbolLattice_file",
      {
        title: "Read one persisted SymbolLattice source file",
        description:
          "Returns a bounded active-generation source window, symbol map, exact file dependents, and live freshness. YAML and properties values are withheld. This query never reads live source content and never creates or refreshes an index.",
        inputSchema: {
          filePath: z.string().trim().min(1).describe("Exact project-relative path or unique path suffix. Ambiguous suffixes are rejected."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          offset: z.number().int().min(1).optional().describe("One-based first persisted source line."),
          limit: z.number().int().min(1).max(MAX_FILE_VIEW_LINE_LIMIT).optional().describe("Maximum persisted source lines."),
          symbolsOnly: z.boolean().optional().describe("Return symbols and dependents without source lines."),
          sourceSessionMode: z.enum(MCP_SOURCE_SESSION_MODES).optional().describe("MCP-only exact-source delivery policy shared with node and investigate. `deduplicate` is the default; `full` re-emits source.")
        },
        outputSchema: fileViewOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => {
        const response = await executeReadTool(readQueryExecutor, "file-view", arguments_, () =>
          runFileViewTool(fileViewService, defaultProjectPath, arguments_)
        );
        return sourceSession.project(response, "file", arguments_.sourceSessionMode ?? "deduplicate");
      }
    );
  }

  const routesService = supportsRoutes(service) ? service : null;
  if (routesService !== null && isMcpToolEnabled(options.enabledTools, "routes")) {
    server.registerTool(
      "SymbolLattice_routes",
      {
        title: "List routes from a SymbolLattice generation",
        description:
          "Lists bounded persisted route facts and resolved or unresolved handlers from an existing SymbolLattice index. This tool never creates or refreshes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          method: z
            .enum(ROUTE_METHODS)
            .optional()
            .describe("Optional supported uppercase HTTP method or NAVIGATE client-route filter."),
          path: z
            .string()
            .min(1)
            .startsWith("/")
            .optional()
            .describe("Optional nonempty slash-leading route path prefix."),
          domain: z
            .string()
            .min(1)
            .refine((value) => value === value.trim(), {
              message: "Route domain must not have surrounding whitespace."
            })
            .optional()
            .describe("Optional exact literal route domain condition."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_ROUTE_LIMIT)
            .optional()
            .describe(`Maximum route records to return (1-${MAX_ROUTE_LIMIT}).`)
        },
        outputSchema: routesOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "routes", arguments_, () =>
          runRoutesTool(routesService, defaultProjectPath, arguments_)
        )
    );
  }

  const entrypointsService = supportsEntrypoints(service) ? service : null;
  if (entrypointsService !== null && isMcpToolEnabled(options.enabledTools, "entrypoints")) {
    server.registerTool(
      "SymbolLattice_entrypoints",
      {
        title: "List non-HTTP entrypoints from a SymbolLattice generation",
        description:
          "Lists bounded persisted GraphQL, microservice, and WebSocket entrypoint facts with exact handler evidence from an existing SymbolLattice index. HTTP routes remain available through SymbolLattice_routes. This tool never creates or refreshes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          transport: z
            .enum(ENTRYPOINT_TRANSPORTS)
            .optional()
            .describe("Optional non-HTTP transport filter."),
          operation: z
            .enum(ENTRYPOINT_OPERATIONS)
            .optional()
            .describe("Optional transport operation filter."),
          name: z
            .string()
            .min(1)
            .optional()
            .describe("Optional nonempty persisted entrypoint-name prefix."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_ENTRYPOINT_LIMIT)
            .optional()
            .describe(`Maximum entrypoint records to return (1-${MAX_ENTRYPOINT_LIMIT}).`)
        },
        outputSchema: entrypointsOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "entrypoints", arguments_, () =>
          runEntrypointsTool(entrypointsService, defaultProjectPath, arguments_)
        )
    );
  }

  const hierarchyService = supportsHierarchy(service) ? service : null;
  if (hierarchyService !== null && isMcpToolEnabled(options.enabledTools, "hierarchy")) {
    server.registerTool(
      "SymbolLattice_hierarchy",
      {
        title: "Inspect direct TypeScript declaration hierarchy",
        description:
          "Returns bounded direct extends and implements parents and children from an existing SymbolLattice generation. Parents can include unresolved evidence; this tool never recursively traverses, creates, refreshes, or synchronizes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          reference: z.string().trim().min(1).describe("Exact indexed symbol reference for the hierarchy view."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_HIERARCHY_LIMIT)
            .optional()
            .describe(`Maximum direct parent and child records returned independently (1-${MAX_HIERARCHY_LIMIT}).`)
        },
        outputSchema: hierarchyOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "hierarchy", arguments_, () =>
          runHierarchyTool(hierarchyService, defaultProjectPath, arguments_)
        )
    );
  }

  const generationHistoryService = supportsGenerationHistory(service) ? service : null;
  if (generationHistoryService !== null && isMcpToolEnabled(options.enabledTools, "history")) {
    server.registerTool(
      "SymbolLattice_history",
      {
        title: "List retained SymbolLattice graph generations",
        description:
          "Lists immutable graph generations retained by an existing SymbolLattice index, with the current active generation's live freshness reported separately. It never initializes, refreshes, or synchronizes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_GENERATION_HISTORY_LIMIT)
            .optional()
            .describe("Maximum retained-generation summaries to return.")
        },
        outputSchema: generationHistoryOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "generation-history", arguments_, () =>
          runGenerationHistoryTool(generationHistoryService, defaultProjectPath, arguments_)
        )
    );
  }

  const generationDiffService = supportsGenerationDiff(service) ? service : null;
  if (generationDiffService !== null && isMcpToolEnabled(options.enabledTools, "diff")) {
    server.registerTool(
      "SymbolLattice_diff",
      {
        title: "Compare retained SymbolLattice graph generations",
        description:
          "Compares two immutable retained graph snapshots structurally. This is not a Git commit, hunk, rename, or live-source diff, and it never initializes, refreshes, or synchronizes an index.",
        inputSchema: {
          fromGenerationId: z
            .string()
            .trim()
            .min(1)
            .describe("Required retained generation ID used as the comparison baseline."),
          toGenerationId: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe("Optional retained generation ID; defaults to the active generation."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project."),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_GENERATION_DIFF_LIMIT)
            .optional()
            .describe("Maximum changes returned independently for each structural category.")
        },
        outputSchema: generationDiffOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "generation-diff", arguments_, () =>
          runGenerationDiffTool(generationDiffService, defaultProjectPath, arguments_)
        )
    );
  }

  const explainEdgeService = supportsExplainEdge(service) ? service : null;
  if (explainEdgeService !== null && isMcpToolEnabled(options.enabledTools, "explain_edge")) {
    server.registerTool(
      "SymbolLattice_explain_edge",
      {
        title: "Explain a SymbolLattice graph edge",
        description:
          "Returns a persisted graph edge with its evidence and resolved endpoint symbols from an existing local SymbolLattice index. This tool never creates or refreshes an index.",
        inputSchema: {
          edgeId: z.string().trim().min(1).describe("Stable graph edge identifier returned by another SymbolLattice query."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project.")
        },
        outputSchema: z.object({
          status: z.object({}).passthrough(),
          edge: z.object({}).passthrough(),
          source: z.object({}).passthrough(),
          target: z.object({}).passthrough().nullable()
        }),
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "explain-edge", arguments_, () =>
          runExplainEdgeTool(explainEdgeService, defaultProjectPath, arguments_)
        )
    );
  }

  return server;
}

/**
 * Minimal lifecycle surface needed to stop a long-lived stdio MCP connection.
 * `closed` never performs graph work; it only reports transport termination.
 */
export interface McpServerSession {
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

/** Process-stdin subset used to stop the MCP session when its parent disconnects. */
export interface McpLifecycleInput {
  once(event: "end" | "close", listener: () => void): unknown;
  off(event: "end" | "close", listener: () => void): unknown;
}

/** Injectable seams keep the stdio lifecycle independently testable. */
export interface McpServerOptions {
  readonly transport?: Transport;
  readonly lifecycleInput?: McpLifecycleInput;
  /** Optional host-owned executor for persisted graph read tools only. */
  readonly readQueryExecutor?: McpReadQueryExecutor;
  /** Optional host-owned status surface for the read-query executor. */
  readonly queryPoolStatusService?: QueryPoolStatusService;
  /** Injectable environment used only to select the stdio MCP tool surface. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

/**
 * Starts an MCP server and returns a close-aware session.
 *
 * The server remains query-only. Its lifecycle is intentionally exposed so a
 * CLI host can own a separate background freshness watcher without teaching
 * individual MCP handlers how to index or synchronize.
 */
export async function startMcpServer(
  service: ExploreService,
  defaultProjectPath: string,
  options: McpServerOptions = {}
): Promise<McpServerSession> {
  const environment = options.environment ?? process.env;
  const server = createMcpServer(service, defaultProjectPath, {
    readQueryExecutor: options.readQueryExecutor,
    queryPoolStatusService: options.queryPoolStatusService,
    enabledTools: resolveMcpToolSelection(
      environment[SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE]
    )
  });
  const transport = options.transport ?? new StdioServerTransport();
  const lifecycleInput = options.lifecycleInput ?? process.stdin;
  let resolveClosed: (() => void) | null = null;
  let settled = false;
  let lifecycleAttached = false;
  let closePromise: Promise<void> | null = null;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const detachLifecycleInput = (): void => {
    if (!lifecycleAttached) {
      return;
    }
    lifecycleInput.off("end", requestClose);
    lifecycleInput.off("close", requestClose);
    lifecycleAttached = false;
  };
  const settleClosed = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    detachLifecycleInput();
    resolveClosed?.();
    resolveClosed = null;
  };
  const existingOnClose = transport.onclose;
  transport.onclose = (): void => {
    existingOnClose?.();
    settleClosed();
  };
  const close = (): Promise<void> => {
    if (closePromise !== null) {
      return closePromise;
    }
    detachLifecycleInput();
    closePromise = server.close().finally(settleClosed);
    return closePromise;
  };
  function requestClose(): void {
    void close().catch(() => undefined);
  }

  try {
    await server.connect(transport);
  } catch (error) {
    settleClosed();
    throw error;
  }

  if (!settled) {
    lifecycleInput.once("end", requestClose);
    lifecycleInput.once("close", requestClose);
    lifecycleAttached = true;
  }

  return { closed, close };
}

/**
 * Starts an MCP session with a bounded worker-thread executor for graph reads.
 *
 * The executor has no indexing or watcher capability. If its first worker has
 * not warmed yet, or it becomes unhealthy, individual tool calls retain the
 * existing in-process read handler as a safe compatibility fallback.
 */
export async function startMcpServerWithReadQueryPool(
  service: ExploreService,
  defaultProjectPath: string,
  options: Omit<McpServerOptions, "readQueryExecutor" | "queryPoolStatusService"> = {}
): Promise<McpServerSession> {
  const readQueryPool = new McpReadQueryPool({ defaultProjectPath });
  let session: McpServerSession;
  try {
    session = await startMcpServer(service, defaultProjectPath, {
      ...options,
      readQueryExecutor: readQueryPool,
      queryPoolStatusService: readQueryPool
    });
  } catch (error) {
    await readQueryPool.close();
    throw error;
  }

  return {
    closed: session.closed.finally(() => readQueryPool.close()),
    async close(): Promise<void> {
      try {
        await session.close();
      } finally {
        await readQueryPool.close();
      }
    }
  };
}

/** Backward-compatible one-shot stdio server start for programmatic callers. */
export async function serveMcp(
  service: ExploreService,
  defaultProjectPath: string
): Promise<void> {
  await startMcpServer(service, defaultProjectPath);
}

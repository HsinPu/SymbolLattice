import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

import { SymbolLatticeError } from "../application/errors.js";
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

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
}

/** Additive exact-node retrieval seam; older explore-only embeddings remain valid. */
export interface NodeService {
  node(projectPath: string, reference: string): Promise<NodeResult>;
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
}

export interface NodeToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
}

export interface ContextToolArguments {
  readonly references: readonly string[];
  readonly projectPath?: string | undefined;
  readonly relationLimit?: number | undefined;
  readonly maxHops?: number | undefined;
  readonly impactDepth?: number | undefined;
  readonly impactLimit?: number | undefined;
}

export interface AffectedTestsToolArguments {
  readonly filePaths: readonly string[];
  readonly projectPath?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
}

export interface GitAffectedTestsToolArguments {
  readonly projectPath?: string | undefined;
  /** Omit for HEAD-to-working-tree selection; otherwise compare local merge-base to HEAD. */
  readonly baseRef?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly limit?: number | undefined;
}

export interface GitHunksToolArguments {
  readonly projectPath?: string | undefined;
  /** Required local Git baseline; the service resolves its merge-base with HEAD. */
  readonly baseRef: string;
  readonly limit?: number | undefined;
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

const exploreOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    match: z.object({}).passthrough(),
    sourceAvailability: z
      .enum(["active-generation", "unavailable", "not-applicable"])
      .describe("When present, reports whether source is active-generation evidence, unavailable, or not applicable to the match.")
      .optional(),
    source: sourceExcerptOutputSchema.nullable(),
    callers: z.array(z.object({}).passthrough()),
    callees: z.array(z.object({}).passthrough()),
    impact: z.array(z.object({}).passthrough())
  })
  .passthrough();

const nodeSourceOutputSchema = z.object({
  filePath: z.string(),
  range: sourceRangeOutputSchema,
  text: z.string(),
  totalLines: z.number().int().positive(),
  totalCharacters: z.number().int().nonnegative(),
  truncated: z.boolean()
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
      impactLimit: z.number().int().positive()
    }),
    contexts: z.array(
      z.object({
        reference: z.string(),
        match: z.object({}).passthrough(),
        matchCandidatesTruncated: z.boolean(),
        sourceAvailability: z.enum(["active-generation", "unavailable", "not-applicable"]),
        source: sourceExcerptOutputSchema.nullable(),
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
    evidencePaths: z.array(
      z.object({
        fromReference: z.string(),
        toReference: z.string(),
        status: z.enum(["path", "same-symbol", "no-path", "not-applicable", "truncated"]),
        path: z.object({}).passthrough().nullable()
      })
    )
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
          classification: z.enum(["test-file-name", "test-directory"]),
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
    affected: affectedTestsOutputSchema.nullable()
  })
  .passthrough();

const gitHunksOutputSchema = z
  .object({
    changeSet: z.object({}).passthrough(),
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
        sourceCharacterLimit: z.number().int().positive()
      }),
      context: z.object({
        maxReferences: z.number().int().positive(),
        matchCandidateLimit: z.number().int().positive(),
        relationLimit: z.number().int().positive(),
        maxHops: z.number().int().positive(),
        maxVisitedSymbolsPerPath: z.number().int().positive(),
        impactDepth: z.number().int().positive(),
        impactLimit: z.number().int().positive()
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
                z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[0]),
                z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[1]),
                z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[2]),
                z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[3]),
                z.literal(DEFAULT_EXACT_IMPACT_EDGE_KINDS[4])
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
        source: nodeSourceOutputSchema.nullable()
      })
    ),
    contexts: z.array(z.object({}).passthrough()),
    evidencePaths: z.array(z.object({}).passthrough())
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
      ...(arguments_.impactLimit === undefined ? {} : { impactLimit: arguments_.impactLimit })
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
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit })
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
      ...(arguments_.limit === undefined ? {} : { limit: arguments_.limit })
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
    const options: GitHunksOptions =
      arguments_.limit === undefined ? {} : { limit: arguments_.limit };
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
  const server = new McpServer({ name: "symbol-lattice", version: SYMBOL_LATTICE_VERSION });
  const readQueryExecutor = options.readQueryExecutor;

  server.registerTool(
    "symbol_lattice_explore",
    {
      title: "Explore a SymbolLattice code graph",
      description:
        "Returns generation-bound source evidence when available, direct callers/callees, impact paths, and index freshness from an existing local SymbolLattice index. When supplied by a v0.4.1-capable service, sourceAvailability reports whether persisted source evidence is unavailable or not applicable. This tool never creates or refreshes an index.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Symbol qualified name, simple name, or relative path:line reference."),
        projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project.")
      },
      outputSchema: exploreOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true
      }
    },
    async (arguments_) =>
      executeReadTool(readQueryExecutor, "explore", arguments_, () =>
        runExploreTool(service, defaultProjectPath, arguments_)
      )
  );

  const queryPoolStatusService = options.queryPoolStatusService ?? null;
  if (queryPoolStatusService !== null) {
    server.registerTool(
      "symbol_lattice_query_pool_status",
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
  if (autoSyncStatusService !== null) {
    server.registerTool(
      "symbol_lattice_auto_sync_status",
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
  if (autoSyncDiagnosticsService !== null) {
    server.registerTool(
      "symbol_lattice_auto_sync_diagnostics",
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
  if (autoSyncDiagnosticJournalService !== null) {
    server.registerTool(
      "symbol_lattice_auto_sync_journal",
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
  if (nodeService !== null) {
    server.registerTool(
      "symbol_lattice_node",
      {
        title: "Retrieve an exact SymbolLattice node",
        description:
          "Retrieves one node's persisted graph evidence from an existing local SymbolLattice index. This tool never creates or refreshes an index.",
        inputSchema: {
          query: z.string().trim().min(1).describe("Exact symbol or source reference for the indexed node."),
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project.")
        },
        outputSchema: nodeOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "node", arguments_, () =>
          runNodeTool(nodeService, defaultProjectPath, arguments_)
        )
    );
  }

  const contextService = supportsContext(service) ? service : null;
  if (contextService !== null) {
    server.registerTool(
      "symbol_lattice_context",
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
            .describe("Maximum reverse-impact paths included for each exact symbol.")
        },
        outputSchema: contextOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "context", arguments_, () =>
          runContextTool(contextService, defaultProjectPath, arguments_)
        )
    );
  }

  const affectedTestsService = supportsAffectedTests(service) ? service : null;
  if (affectedTestsService !== null) {
    server.registerTool(
      "symbol_lattice_affected",
      {
        title: "Select affected tests from a SymbolLattice generation",
        description:
          "Accepts changed project files and returns conventionally named tests reached through exact persisted import/export evidence, with bounded proof paths and explicit completeness limitations. This tool never runs Git, creates, or refreshes an index.",
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
            .describe("Maximum proof-bearing affected-test records returned.")
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
  if (gitAffectedTestsService !== null) {
    server.registerTool(
      "symbol_lattice_affected_git",
      {
        title: "Select affected tests from a local Git change set",
        description:
          "Uses local read-only Git commands to select TypeScript/JavaScript changes, then returns exact persisted import/export test proofs and completeness limits. Omit baseRef for HEAD-to-working-tree plus untracked files; provide baseRef for local merge-base-to-HEAD selection. This tool never fetches, creates, refreshes, or synchronizes an index.",
        inputSchema: {
          projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed Git project."),
          baseRef: z
            .string()
            .min(1)
            .max(256)
            .optional()
            .describe("Optional local Git ref; compares its merge-base with HEAD. Omit for working-tree selection."),
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
            .describe("Maximum proof-bearing affected-test records returned.")
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
  if (gitHunksService !== null) {
    server.registerTool(
      "symbol_lattice_git_hunks",
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
  if (searchService !== null) {
    server.registerTool(
      "symbol_lattice_search",
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
  if (investigateService !== null) {
    server.registerTool(
      "symbol_lattice_investigate",
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
      async (arguments_) =>
        executeReadTool(readQueryExecutor, "investigate", arguments_, () =>
          runInvestigateTool(investigateService, defaultProjectPath, arguments_)
        )
    );
  }

  const impactService = supportsImpact(service) ? service : null;
  if (impactService !== null) {
    server.registerTool(
      "symbol_lattice_impact",
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

  const routesService = supportsRoutes(service) ? service : null;
  if (routesService !== null) {
    server.registerTool(
      "symbol_lattice_routes",
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
  if (entrypointsService !== null) {
    server.registerTool(
      "symbol_lattice_entrypoints",
      {
        title: "List non-HTTP entrypoints from a SymbolLattice generation",
        description:
          "Lists bounded persisted GraphQL, microservice, and WebSocket entrypoint facts with exact handler evidence from an existing SymbolLattice index. HTTP routes remain available through symbol_lattice_routes. This tool never creates or refreshes an index.",
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
  if (hierarchyService !== null) {
    server.registerTool(
      "symbol_lattice_hierarchy",
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
  if (generationHistoryService !== null) {
    server.registerTool(
      "symbol_lattice_history",
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
  if (generationDiffService !== null) {
    server.registerTool(
      "symbol_lattice_diff",
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
  if (explainEdgeService !== null) {
    server.registerTool(
      "symbol_lattice_explain_edge",
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
  const server = createMcpServer(service, defaultProjectPath, {
    readQueryExecutor: options.readQueryExecutor,
    queryPoolStatusService: options.queryPoolStatusService
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

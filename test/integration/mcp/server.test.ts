import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AffectedTestsResult,
  type AutoSyncDiagnosticJournalResult,
  type AutoSyncDiagnosticsResult,
  type AutoSyncStatusResult,
  SymbolLatticeError,
  type ContextResult,
  type EntrypointsOptions,
  type EntrypointsResult,
  type ExplainEdgeResult,
  type ExploreResult,
  type GenerationDiffOptions,
  type GenerationDiffResult,
  type GenerationHistoryOptions,
  type GenerationHistoryResult,
  type GitAffectedTestsOptions,
  type GitAffectedTestsResult,
  type GitHunksOptions,
  type GitHunksResult,
  type HierarchyOptions,
  type HierarchyResult,
  type ImpactOptions,
  type ImpactResult,
  type InvestigateOptions,
  type InvestigateResult,
  type NodeResult,
  type RoutesOptions,
  type RoutesResult,
  type SearchResult
} from "../../../src/application/index.js";
import {
  createMcpServer,
  runAffectedTestsTool,
  runAutoSyncDiagnosticJournalTool,
  runAutoSyncDiagnosticsTool,
  runAutoSyncStatusTool,
  runContextTool,
  runEntrypointsTool,
  runExplainEdgeTool,
  runExploreTool,
  runGenerationDiffTool,
  runGenerationHistoryTool,
  runGitAffectedTestsTool,
  runGitHunksTool,
  runHierarchyTool,
  runImpactTool,
  runInvestigateTool,
  runNodeTool,
  runRoutesTool,
  runSearchTool,
  startMcpServer,
  type McpReadQueryExecutor,
  type McpReadQueryPoolDiagnostics
} from "../../../src/mcp/index.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

class FakeLifecycleInput {
  private readonly listeners = new Map<"end" | "close", Set<() => void>>();

  public once(event: "end" | "close", listener: () => void): void {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  public off(event: "end" | "close", listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  public emit(event: "end" | "close"): void {
    const listeners = [...(this.listeners.get(event) ?? [])];
    this.listeners.delete(event);
    for (const listener of listeners) {
      listener();
    }
  }

  public listenerCount(event: "end" | "close"): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

function exploreResult(): ExploreResult {
  return {
    status: {
      initialized: true,
      stale: false,
      staleReasons: [],
      projectPath: "C:/project",
      indexedAt: "2026-07-29T00:00:00.000Z",
      generationId: "generation:test",
      counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
    },
    match: { status: "not_found", reference: "missing", candidates: [] },
    sourceAvailability: "not-applicable",
    source: null,
    callers: [],
    callees: [],
    impact: []
  };
}

function legacyExploreResult(): ExploreResult {
  const { sourceAvailability: _sourceAvailability, ...result } = exploreResult();
  return result;
}

function autoSyncStatusResult(): AutoSyncStatusResult {
  return {
    index: exploreResult().status,
    autoSync: {
      enabled: true,
      state: "pending",
      watcherMode: "native-events",
      ownerLease: {
        state: "owned",
        observedAt: "2026-07-31T00:00:00.000Z",
        error: null
      },
      observedAt: "2026-07-31T00:00:00.000Z",
      lastEvent: "event-pending",
      lastSuccessfulSyncAt: null,
      lastSyncFailure: null,
      eventWatchFailure: null,
      retryDelayMs: null,
      pendingFileCount: 1,
      pendingFiles: ["src/changed.ts"],
      pendingFilesTruncated: false,
      pendingFilesUnknown: false
    }
  };
}

function autoSyncDiagnosticsResult(): AutoSyncDiagnosticsResult {
  return {
    index: { status: exploreResult().status, error: null },
    autoSync: autoSyncStatusResult().autoSync,
    timeline: {
      capacity: 32,
      retained: 2,
      returned: 2,
      dropped: 0,
      truncated: false,
      events: [
        {
          hostId: "host:session-test",
          sequence: 1,
          event: "started",
          observedAt: "2026-07-31T00:00:00.000Z",
          state: "fresh",
          watcherMode: "starting",
          generationId: "generation:test",
          error: null,
          retryDelayMs: null,
          pendingFileCount: 0,
          pendingFiles: [],
          pendingFilesTruncated: false,
          pendingFilesUnknown: false
        },
        {
          hostId: "host:session-test",
          sequence: 2,
          event: "event-pending",
          observedAt: "2026-07-31T00:00:01.000Z",
          state: "pending",
          watcherMode: "native-events",
          generationId: "generation:test",
          error: null,
          retryDelayMs: null,
          pendingFileCount: 1,
          pendingFiles: ["src/changed.ts"],
          pendingFilesTruncated: false,
          pendingFilesUnknown: false
        }
      ]
    }
  };
}

function autoSyncDiagnosticJournalResult(): AutoSyncDiagnosticJournalResult {
  return {
    state: "active",
    capacity: 128,
    retained: 3,
    returned: 3,
    dropped: 4,
    truncated: true,
    lastPersistedAt: "2026-07-31T00:00:03.000Z",
    error: null,
    events: [
      {
        hostId: "host:journal-a",
        sequence: 7,
        event: "started",
        observedAt: "2026-07-31T00:00:01.000Z",
        state: "fresh",
        watcherMode: "starting",
        generationId: "generation:test",
        error: null,
        retryDelayMs: null,
        pendingFileCount: 0,
        pendingFiles: [],
        pendingFilesTruncated: false,
        pendingFilesUnknown: false
      },
      {
        hostId: "host:journal-a",
        sequence: 8,
        event: "event-pending",
        observedAt: "2026-07-31T00:00:02.000Z",
        state: "pending",
        watcherMode: "native-events",
        generationId: "generation:test",
        error: null,
        retryDelayMs: null,
        pendingFileCount: 1,
        pendingFiles: ["src/changed.ts"],
        pendingFilesTruncated: false,
        pendingFilesUnknown: false
      },
      {
        hostId: "host:journal-b",
        sequence: 9,
        event: "synced",
        observedAt: "2026-07-31T00:00:03.000Z",
        state: "fresh",
        watcherMode: "native-events",
        generationId: "generation:next",
        error: null,
        retryDelayMs: null,
        pendingFileCount: 0,
        pendingFiles: [],
        pendingFilesTruncated: false,
        pendingFilesUnknown: false
      }
    ]
  };
}

function nodeResult(): NodeResult {
  const symbol = {
    id: "symbol:users:userById",
    name: "userById",
    qualifiedName: "src/users.ts#userById",
    kind: "function" as const,
    filePath: "src/users.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 52 }
    },
    isExported: true,
    declarationOrdinal: 0
  };

  return {
    status: exploreResult().status,
    bounds: {
      sourceLineLimit: 200,
      sourceCharacterLimit: 16_000,
      relationLimit: 25,
      matchCandidateLimit: 25
    },
    match: {
      status: "exact",
      reference: "src/users.ts#userById",
      symbol,
      candidates: [symbol]
    },
    matchCandidatesTruncated: false,
    sourceAvailability: "active-generation",
    source: {
      filePath: symbol.filePath,
      range: symbol.range,
      text: "export function userById(id: string) { return id; }",
      totalLines: 1,
      totalCharacters: 51,
      truncated: false
    },
    callers: { items: [], truncated: false },
    callees: { items: [], truncated: false }
  };
}

function hierarchyResult(): HierarchyResult {
  const base = {
    id: "symbol:base",
    name: "Base",
    qualifiedName: "src/base.ts#Base",
    kind: "class" as const,
    filePath: "src/base.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 21 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
  const child = {
    id: "symbol:child",
    name: "Child",
    qualifiedName: "src/child.ts#Child",
    kind: "class" as const,
    filePath: "src/child.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 27 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
  return {
    status: exploreResult().status,
    symbol: base,
    bounds: { limit: 2, maximumLimit: 100 },
    parents: [
      {
        relation: "implements",
        edge: {
          id: "edge:base:missing-contract",
          sourceId: base.id,
          targetId: null,
          kind: "implements",
          filePath: base.filePath,
          range: base.range,
          resolution: "unresolved",
          confidence: 0,
          referenceName: "MissingContract"
        },
        parent: null
      }
    ],
    children: [
      {
        relation: "extends",
        edge: {
          id: "edge:child:base",
          sourceId: child.id,
          targetId: base.id,
          kind: "extends",
          filePath: child.filePath,
          range: child.range,
          resolution: "exact",
          confidence: 1,
          referenceName: "Base"
        },
        child
      }
    ],
    parentsTruncated: false,
    childrenTruncated: false
  };
}

function contextResult(): ContextResult {
  return {
    status: exploreResult().status,
    bounds: {
      maxReferences: 8,
      matchCandidateLimit: 25,
      relationLimit: 2,
      maxHops: 3,
      maxVisitedSymbolsPerPath: 500,
      impactDepth: 2,
      impactLimit: 2
    },
    contexts: [
      {
        reference: "src/users.ts#userById",
        match: { status: "not_found", reference: "src/users.ts#userById", candidates: [] },
        matchCandidatesTruncated: false,
        sourceAvailability: "not-applicable",
        source: null,
        callers: { items: [], truncated: false },
        callees: { items: [], truncated: false },
        impact: { paths: [], truncated: false }
      }
    ],
    evidencePaths: []
  };
}

function affectedTestsResult(): AffectedTestsResult {
  return {
    status: exploreResult().status,
    bounds: {
      maxChangedFiles: 50,
      maxDepth: 5,
      limit: 25,
      maxVisitedFilesPerInput: 500,
      edgeKinds: ["imports", "exports"],
      resolution: "exact"
    },
    indexScope: [],
    indexedTestFiles: 0,
    inputs: {
      requested: ["src/math.ts"],
      indexed: ["src/math.ts"],
      notIndexed: []
    },
    tests: {
      items: [],
      resultLimitTruncated: false,
      traversalTruncated: false,
      depthLimitReached: false
    },
    completeness: {
      completeForActiveGeneration: true,
      limitations: []
    }
  };
}

function gitAffectedTestsResult(): GitAffectedTestsResult {
  return {
    status: exploreResult().status,
    changeSet: {
      requestedBaseRef: null,
      mergeBaseCommit: null,
      headCommit: "a".repeat(40),
      includesUntracked: true,
      changes: [
        {
          kind: "modified",
          previousPath: "src/math.ts",
          currentPath: "src/math.ts",
          score: null
        }
      ],
      sourcePaths: ["src/math.ts"]
    },
    affected: affectedTestsResult()
  };
}

function gitHunksResult(): GitHunksResult {
  return {
    changeSet: {
      requestedBaseRef: "origin/main",
      mergeBaseCommit: "b".repeat(40),
      headCommit: "a".repeat(40),
      includesUntracked: false,
      changes: [],
      sourcePaths: []
    },
    bounds: {
      maxSourceFiles: 50,
      maxDeclarationAnchorsPerSide: 25,
      limit: 7,
      maximumLimit: 100
    },
    hunks: { items: [], total: 0, truncated: false }
  };
}

function searchResult(): SearchResult {
  return {
    status: exploreResult().status,
    results: [
      {
        rank: 1,
        filePath: "src/users.ts",
        language: "typescript",
        range: {
          start: { line: 4, column: 17 },
          end: { line: 4, column: 21 }
        },
        excerpt: {
          filePath: "src/users.ts",
          startLine: 3,
          endLine: 5,
          lines: [
            { line: 3, text: "" },
            { line: 4, text: "export function userById(id: string) {" },
            { line: 5, text: "  return id;" }
          ]
        },
        matchingTerms: ["user"],
        lexicalReason: "all query terms matched indexed source text",
        symbolCandidates: [
          {
            id: "symbol:user-by-id",
            name: "userById",
            qualifiedName: "src/users.ts#userById",
            kind: "function",
            filePath: "src/users.ts",
            range: {
              start: { line: 4, column: 1 },
              end: { line: 6, column: 2 }
            },
            isExported: true,
            declarationOrdinal: 0
          }
        ]
      }
    ]
  };
}

function investigateResult(): InvestigateResult {
  const search = searchResult();
  const context = contextResult();
  const candidate = search.results[0]!.symbolCandidates[0]!;
  return {
    status: search.status,
    query: "user",
    bounds: {
      searchLimit: 4,
      maximumSearchLimit: 100,
      symbolLimit: 2,
      maximumSymbolLimit: 8,
      ranking: "topology",
      declarationSource: {
        sourceLineLimit: 200,
        sourceCharacterLimit: 16_000
      },
      context: context.bounds
    },
    search: { results: search.results },
    selection: {
      items: [
        {
          selectionRank: 1,
          sourceRank: 1,
          candidateRank: 1,
          structuralSignals: {
            directExactCallerCount: 0,
            directExactCalleeCount: 0,
            isExported: true,
            score: 1
          },
          topologySignals: {
            maxHops: 3,
            maxVisitedSymbols: 500,
            seedLimit: 64,
            seedCount: 1,
            seedTruncated: false,
            seeded: true,
            scopeSymbolCount: 2,
            scopedExactNeighborCount: 1,
            iterationCount: 20,
            restartProbability: 0.2,
            edgeKinds: ["calls", "references", "routes", "handles", "imports", "extends", "implements"],
            scopedExactIncidentEdgeKindCounts: [
              { kind: "calls", count: 1 },
              { kind: "references", count: 0 },
              { kind: "routes", count: 0 },
              { kind: "handles", count: 0 },
              { kind: "imports", count: 0 },
              { kind: "extends", count: 0 },
              { kind: "implements", count: 0 }
            ],
            score: 0.16,
            traversalTruncated: false,
            depthLimitReached: false
          },
          impactSignals: null,
          symbol: candidate
        }
      ],
      total: 1,
      truncated: false
    },
    declarations: [
      {
        reference: candidate.qualifiedName,
        sourceAvailability: "active-generation",
        source: {
          filePath: candidate.filePath,
          range: candidate.range,
          text: "export function userById(): void {}",
          totalLines: 1,
          totalCharacters: 35,
          truncated: false
        }
      }
    ],
    contexts: context.contexts,
    evidencePaths: context.evidencePaths
  };
}

function routesResult(): RoutesResult {
  const route = {
    id: "symbol:route:get-users",
    name: "GET /api/users",
    qualifiedName: "src/routes.ts#GET /api/users",
    kind: "route" as const,
    filePath: "src/routes.ts",
    range: {
      start: { line: 5, column: 1 },
      end: { line: 5, column: 38 }
    },
    isExported: false,
    declarationOrdinal: 0
  };
  const handler = {
    id: "symbol:handlers:listUsers",
    name: "listUsers",
    qualifiedName: "src/handlers.ts#listUsers",
    kind: "function" as const,
    filePath: "src/handlers.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 3, column: 2 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
  const unresolvedRoute = {
    ...route,
    id: "symbol:route:post-missing",
    name: "POST /api/missing",
    qualifiedName: "src/routes.ts#POST /api/missing",
    range: {
      start: { line: 6, column: 1 },
      end: { line: 6, column: 43 }
    },
    declarationOrdinal: 1
  };
  return {
    status: exploreResult().status,
    bounds: { limit: 7, maximumLimit: 100 },
    routes: [
      {
        method: "GET",
        path: "/api/users",
        domain: "api.example.test",
        route,
        edge: {
          id: "edge:route:get-users",
          sourceId: route.id,
          targetId: handler.id,
          kind: "routes",
          filePath: route.filePath,
          range: route.range,
          resolution: "exact",
          confidence: 1,
          referenceName: handler.name
        },
        handler
      },
      {
        method: "POST",
        path: "/api/missing",
        domain: null,
        route: unresolvedRoute,
        edge: {
          id: "edge:route:post-missing",
          sourceId: unresolvedRoute.id,
          targetId: null,
          kind: "routes",
          filePath: unresolvedRoute.filePath,
          range: unresolvedRoute.range,
          resolution: "unresolved",
          confidence: 0,
          referenceName: "missingHandler"
        },
        handler: null
      }
    ],
    truncated: false
  };
}

function entrypointsResult(): EntrypointsResult {
  const entrypoint = {
    id: "symbol:entrypoint:author",
    name: "graphql query author",
    qualifiedName: "src/authors.resolver.ts#entrypoint:graphql query author",
    kind: "entrypoint" as const,
    filePath: "src/authors.resolver.ts",
    range: {
      start: { line: 5, column: 3 },
      end: { line: 5, column: 28 }
    },
    isExported: false,
    declarationOrdinal: 0
  };
  const handler = {
    id: "symbol:resolver:author",
    name: "author",
    qualifiedName: "src/authors.resolver.ts#AuthorsResolver.author",
    kind: "method" as const,
    filePath: "src/authors.resolver.ts",
    range: {
      start: { line: 6, column: 3 },
      end: { line: 6, column: 32 }
    },
    isExported: false,
    declarationOrdinal: 0
  };
  return {
    status: exploreResult().status,
    bounds: { limit: 7, maximumLimit: 100 },
    entrypoints: [
      {
        transport: "graphql",
        operation: "query",
        name: "author",
        entrypoint,
        edge: {
          id: "edge:entrypoint:author",
          sourceId: entrypoint.id,
          targetId: handler.id,
          kind: "handles",
          filePath: entrypoint.filePath,
          range: entrypoint.range,
          resolution: "exact",
          confidence: 1,
          referenceName: handler.name
        },
        handler
      }
    ],
    truncated: false
  };
}

function impactResult(): ImpactResult {
  const target = {
    id: "symbol:handlers:users",
    name: "users",
    qualifiedName: "src/handlers.ts#users",
    kind: "function" as const,
    filePath: "src/handlers.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 3, column: 2 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
  const route = {
    id: "symbol:route:get-users",
    name: "GET /users",
    qualifiedName: "src/routes.ts#GET /users",
    kind: "route" as const,
    filePath: "src/routes.ts",
    range: {
      start: { line: 5, column: 1 },
      end: { line: 5, column: 25 }
    },
    isExported: false,
    declarationOrdinal: 0
  };
  const entrypoint = {
    id: "symbol:entrypoint:users",
    name: "graphql query users",
    qualifiedName: "src/resolvers.ts#entrypoint:graphql query users",
    kind: "entrypoint" as const,
    filePath: "src/resolvers.ts",
    range: {
      start: { line: 4, column: 3 },
      end: { line: 4, column: 27 }
    },
    isExported: false,
    declarationOrdinal: 0
  };
  const routeEdge = {
    id: "edge:route:get-users",
    sourceId: route.id,
    targetId: target.id,
    kind: "routes" as const,
    filePath: route.filePath,
    range: route.range,
    resolution: "exact" as const,
    confidence: 1,
    referenceName: target.name
  };
  const entrypointEdge = {
    id: "edge:entrypoint:users",
    sourceId: entrypoint.id,
    targetId: target.id,
    kind: "handles" as const,
    filePath: entrypoint.filePath,
    range: entrypoint.range,
    resolution: "exact" as const,
    confidence: 1,
    referenceName: target.name
  };
  const paths = [
    {
      symbols: [target, route],
      edges: [routeEdge],
      steps: [{ from: target, to: route, edge: routeEdge }]
    },
    {
      symbols: [target, entrypoint],
      edges: [entrypointEdge],
      steps: [{ from: target, to: entrypoint, edge: entrypointEdge }]
    }
  ];

  return {
    status: exploreResult().status,
    symbol: target,
    paths,
    summary: {
      returnedPathCount: paths.length,
      impactedFileCount: 2,
      files: [
        {
          filePath: route.filePath,
          nearestDepth: 1,
          impactedSymbols: [{ symbol: route, depth: 1, discoveryEdge: routeEdge }]
        },
        {
          filePath: entrypoint.filePath,
          nearestDepth: 1,
          impactedSymbols: [{ symbol: entrypoint, depth: 1, discoveryEdge: entrypointEdge }]
        }
      ],
      entrypointCoverage: {
        routes: [
          {
            method: "GET",
            path: "/users",
            domain: null,
            route,
            edge: routeEdge,
            handler: target
          }
        ],
        entrypoints: [
          {
            transport: "graphql",
            operation: "query",
            name: "users",
            entrypoint,
            edge: entrypointEdge,
            handler: target
          }
        ]
      }
    },
    truncated: false
  };
}

function generationHistoryResult(): GenerationHistoryResult {
  return {
    activeStatus: exploreResult().status,
    bounds: { limit: 5, maximumLimit: 100 },
    retention: { capacity: 5, retained: 2, returned: 2, truncated: false },
    generations: [
      {
        generationId: "generation:new",
        indexedAt: "2026-07-30T00:00:01.000Z",
        snapshotVersion: 1,
        counts: { files: 2, symbols: 2, edges: 1, pendingReferences: 0 },
        indexWork: null,
        extractorVersion: "extractor:test",
        resolverVersion: "resolver:test"
      },
      {
        generationId: "generation:old",
        indexedAt: "2026-07-30T00:00:00.000Z",
        snapshotVersion: 1,
        counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 },
        indexWork: null,
        extractorVersion: "extractor:test",
        resolverVersion: "resolver:test"
      }
    ]
  };
}

function generationDiffResult(): GenerationDiffResult {
  const history = generationHistoryResult();
  return {
    activeStatus: history.activeStatus,
    bounds: { limit: 3, maximumLimit: 100 },
    from: history.generations[1]!,
    to: history.generations[0]!,
    files: {
      added: { items: [], total: 0, truncated: false },
      removed: { items: [], total: 0, truncated: false },
      modified: { items: [], total: 0, truncated: false }
    },
    symbols: {
      added: { items: [], total: 0, truncated: false },
      removed: { items: [], total: 0, truncated: false },
      modified: { items: [], total: 0, truncated: false }
    },
    edges: {
      added: { items: [], total: 0, truncated: false },
      removed: { items: [], total: 0, truncated: false },
      modified: { items: [], total: 0, truncated: false }
    },
    pendingReferences: {
      added: { items: [], total: 0, truncated: false },
      removed: { items: [], total: 0, truncated: false },
      modified: { items: [], total: 0, truncated: false }
    }
  };
}

function explainEdgeResult(): ExplainEdgeResult {
  const source = {
    id: "symbol:caller",
    name: "caller",
    qualifiedName: "src/caller.ts#caller",
    kind: "function" as const,
    filePath: "src/caller.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 32 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
  const target = {
    id: "symbol:callee",
    name: "callee",
    qualifiedName: "src/callee.ts#callee",
    kind: "function" as const,
    filePath: "src/callee.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 32 }
    },
    isExported: true,
    declarationOrdinal: 0
  };

  return {
    status: {
      initialized: true,
      stale: false,
      staleReasons: [],
      projectPath: "C:/project",
      indexedAt: "2026-07-29T00:00:00.000Z",
      generationId: "generation:test",
      counts: { files: 2, symbols: 2, edges: 1, pendingReferences: 0 }
    },
    edge: {
      id: "edge:caller-callee",
      sourceId: source.id,
      targetId: target.id,
      kind: "calls",
      filePath: source.filePath,
      range: {
        start: { line: 1, column: 28 },
        end: { line: 1, column: 34 }
      },
      resolution: "exact",
      confidence: 1,
      referenceName: target.name,
      evidence: {
        ruleId: "module.named-import",
        stage: "module",
        candidateSymbolIds: [target.id]
      }
    },
    source,
    target
  };
}

describe("SymbolLattice MCP server", () => {
  it("owns a close-aware stdio session and releases its parent-input listeners", async () => {
    const [serverTransport] = InMemoryTransport.createLinkedPair();
    const lifecycleInput = new FakeLifecycleInput();
    const session = await startMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        }
      },
      "C:/default-project",
      { transport: serverTransport, lifecycleInput }
    );
    closeCallbacks.push(() => session.close());

    expect(lifecycleInput.listenerCount("end")).toBe(1);
    expect(lifecycleInput.listenerCount("close")).toBe(1);

    lifecycleInput.emit("end");
    await session.closed;

    expect(lifecycleInput.listenerCount("end")).toBe(0);
    expect(lifecycleInput.listenerCount("close")).toBe(0);
  });

  it("routes graph reads through an injected executor while host auto-sync stays local", async () => {
    const dispatched: string[] = [];
    const executor: McpReadQueryExecutor = {
      async execute(toolName, _arguments, fallback) {
        dispatched.push(toolName);
        return fallback();
      }
    };
    let autoSyncCalls = 0;
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async impact(): Promise<ImpactResult> {
          return impactResult();
        },
        async autoSyncStatus(): Promise<AutoSyncStatusResult> {
          autoSyncCalls += 1;
          return autoSyncStatusResult();
        }
      },
      "C:/default-project",
      { readQueryExecutor: executor }
    );
    const client = new Client({ name: "symbol-lattice-query-executor-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    await client.callTool({ name: "symbol_lattice_explore", arguments: { query: "App" } });
    await client.callTool({
      name: "symbol_lattice_impact",
      arguments: { reference: "src/handlers.ts#users" }
    });
    await client.callTool({ name: "symbol_lattice_auto_sync_status", arguments: {} });

    expect(dispatched).toEqual(["explore", "impact"]);
    expect(autoSyncCalls).toBe(1);
  });

  it("exposes query-pool health only when a host-owned status service is supplied", async () => {
    const diagnostics: McpReadQueryPoolDiagnostics = {
      state: "ready",
      capacity: 2,
      workers: { live: 2, pending: 0, idle: 1, crashes: 1 },
      requests: { inflight: 1, queued: 3 },
      fallbacks: {
        coldStart: 1,
        unavailable: 0,
        queueTimeout: 2,
        workerFailure: 0,
        invalidWorkerResponse: 0,
        unsupportedTool: 0,
        total: 3
      }
    };
    let statusCalls = 0;
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        }
      },
      "C:/default-project",
      {
        queryPoolStatusService: {
          queryPoolStatus(): McpReadQueryPoolDiagnostics {
            statusCalls += 1;
            return diagnostics;
          }
        }
      }
    );
    const client = new Client({ name: "symbol-lattice-query-pool-status-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_query_pool_status"
    ]);

    const result = await client.callTool({ name: "symbol_lattice_query_pool_status", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(diagnostics);
    expect(statusCalls).toBe(1);
  });

  it("exposes read-only retrieval tools and forwards projects and filters", async () => {
    const exploreCalls: Array<{ projectPath: string; reference: string }> = [];
    const explainCalls: Array<{ projectPath: string; edgeId: string }> = [];
    const searchCalls: Array<{
      projectPath: string;
      query: string;
      options: SearchOptions;
    }> = [];
    const service = {
      async explore(projectPath: string, reference: string): Promise<ExploreResult> {
        exploreCalls.push({ projectPath, reference });
        return exploreResult();
      },
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        searchCalls.push({ projectPath, query, options });
        return searchResult();
      },
      async explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult> {
        explainCalls.push({ projectPath, edgeId });
        return explainEdgeResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_search",
      "symbol_lattice_explain_edge"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_explore",
      arguments: { query: "missing", projectPath: "C:/chosen-project" }
    });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      match: { status: "not_found" },
      sourceAvailability: "not-applicable"
    });
    expect(exploreCalls).toEqual([{ projectPath: "C:/chosen-project", reference: "missing" }]);

    const search = await client.callTool({
      name: "symbol_lattice_search",
      arguments: {
        query: "user",
        projectPath: "C:/chosen-project",
        limit: 7,
        path: "src/",
        language: "liquid"
      }
    });
    expect(search.isError).not.toBe(true);
    expect(search.structuredContent).toMatchObject({
      status: { stale: false },
      results: [{ filePath: "src/users.ts", matchingTerms: ["user"] }]
    });
    expect(searchCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        query: "user",
        options: { limit: 7, pathPrefix: "src/", language: "liquid" }
      }
    ]);

    const explanation = await client.callTool({
      name: "symbol_lattice_explain_edge",
      arguments: { edgeId: "edge:caller-callee", projectPath: "C:/chosen-project" }
    });
    expect(explanation.isError).not.toBe(true);
    expect(explanation.structuredContent).toMatchObject({
      edge: { evidence: { ruleId: "module.named-import" } },
      source: { name: "caller" },
      target: { name: "callee" }
    });
    expect(explainCalls).toEqual([
      { projectPath: "C:/chosen-project", edgeId: "edge:caller-callee" }
    ]);
  });

  it("exposes host-owned auto-sync health without accepting a project or mutation input", async () => {
    let statusCalls = 0;
    const diagnosticCalls: Array<{ limit?: number }> = [];
    const journalCalls: Array<{ limit?: number }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async autoSyncStatus(): Promise<AutoSyncStatusResult> {
          statusCalls += 1;
          return autoSyncStatusResult();
        },
        async autoSyncDiagnostics(options = {}): Promise<AutoSyncDiagnosticsResult> {
          diagnosticCalls.push(options);
          return autoSyncDiagnosticsResult();
        },
        async autoSyncJournal(options = {}): Promise<AutoSyncDiagnosticJournalResult> {
          journalCalls.push(options);
          return autoSyncDiagnosticJournalResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-auto-sync-status-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_auto_sync_status",
      "symbol_lattice_auto_sync_diagnostics",
      "symbol_lattice_auto_sync_journal"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_auto_sync_status",
      arguments: {}
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      index: { stale: false, generationId: "generation:test" },
      autoSync: {
        state: "pending",
        watcherMode: "native-events",
        pendingFiles: ["src/changed.ts"]
      }
    });
    expect(statusCalls).toBe(1);

    const diagnostics = await client.callTool({
      name: "symbol_lattice_auto_sync_diagnostics",
      arguments: { limit: 2 }
    });
    expect(diagnostics.isError).not.toBe(true);
    expect(diagnostics.structuredContent).toMatchObject({
      index: { status: { stale: false }, error: null },
      timeline: {
        retained: 2,
        returned: 2,
        events: [{ event: "started" }, { event: "event-pending", state: "pending" }]
      }
    });
    expect(diagnosticCalls).toEqual([{ limit: 2 }]);

    const invalidDiagnostics = await client.callTool({
      name: "symbol_lattice_auto_sync_diagnostics",
      arguments: { limit: 33 }
    });
    expect(invalidDiagnostics.isError).toBe(true);
    expect(diagnosticCalls).toEqual([{ limit: 2 }]);

    const journal = await client.callTool({
      name: "symbol_lattice_auto_sync_journal",
      arguments: { limit: 1 }
    });
    expect(journal.isError).not.toBe(true);
    expect(journal.structuredContent).toMatchObject({
      state: "active",
      retained: 3,
      returned: 3,
      dropped: 4,
      events: [{ event: "started" }, { event: "event-pending" }, { event: "synced" }]
    });
    expect(journalCalls).toEqual([{ limit: 1 }]);

    const invalidJournal = await client.callTool({
      name: "symbol_lattice_auto_sync_journal",
      arguments: { limit: 129 }
    });
    expect(invalidJournal.isError).toBe(true);
    expect(journalCalls).toEqual([{ limit: 1 }]);
  });

  it("does not register automatic sync diagnostics for a status-only embedding", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async autoSyncStatus(): Promise<AutoSyncStatusResult> {
          return autoSyncStatusResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-status-only-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_auto_sync_status"
    ]);
  });

  it("does not register durable journal history for a timeline-only embedding", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async autoSyncDiagnostics(): Promise<AutoSyncDiagnosticsResult> {
          return autoSyncDiagnosticsResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-timeline-only-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_auto_sync_diagnostics"
    ]);
  });

  it("registers bounded reverse impact only when the service supports it", async () => {
    const impactCalls: Array<{ projectPath: string; reference: string; options: ImpactOptions }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async impact(
        projectPath: string,
        reference: string,
        options: ImpactOptions = {}
      ): Promise<ImpactResult> {
        impactCalls.push({ projectPath, reference, options });
        return impactResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-impact-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_impact"
    ]);
    const impactTool = tools.tools.find((tool) => tool.name === "symbol_lattice_impact");
    expect(impactTool?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(impactTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        reference: expect.objectContaining({ type: "string", minLength: 1 }),
        maxDepth: expect.objectContaining({ type: "integer", minimum: 1, maximum: 3 }),
        limit: expect.objectContaining({ type: "integer", minimum: 1, maximum: 100 })
      }
    });
    expect(impactTool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        status: { type: "object" },
        symbol: { type: "object" },
        paths: { type: "array" },
        summary: { type: "object" },
        truncated: { type: "boolean" }
      }
    });

    const result = await client.callTool({
      name: "symbol_lattice_impact",
      arguments: {
        projectPath: "C:/chosen-project",
        reference: "src/handlers.ts#users",
        maxDepth: 3,
        limit: 7
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      symbol: { name: "users" },
      summary: {
        returnedPathCount: 2,
        impactedFileCount: 2,
        files: [{ filePath: "src/routes.ts" }, { filePath: "src/resolvers.ts" }],
        entrypointCoverage: {
          routes: [{ method: "GET", path: "/users" }],
          entrypoints: [{ transport: "graphql", operation: "query", name: "users" }]
        }
      },
      truncated: false
    });
    expect(impactCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        reference: "src/handlers.ts#users",
        options: { maxDepth: 3, limit: 7 }
      }
    ]);

    const defaults = await client.callTool({
      name: "symbol_lattice_impact",
      arguments: { reference: "src/handlers.ts#users" }
    });
    expect(defaults.isError).not.toBe(true);
    expect(impactCalls[1]).toEqual({
      projectPath: "C:/default-project",
      reference: "src/handlers.ts#users",
      options: { maxDepth: 1, limit: 100 }
    });

    const invalidDepth = await client.callTool({
      name: "symbol_lattice_impact",
      arguments: { reference: "src/handlers.ts#users", maxDepth: 4 }
    });
    expect(invalidDepth.isError).toBe(true);
    expect(impactCalls).toHaveLength(2);
  });

  it("registers bounded route inventory only when the service supports it", async () => {
    const routeCalls: Array<{ projectPath: string; options: RoutesOptions }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async routes(
        projectPath: string,
        options: RoutesOptions = {}
      ): Promise<RoutesResult> {
        routeCalls.push({ projectPath, options });
        return routesResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-routes-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_routes"
    ]);
    const routeTool = tools.tools.find((tool) => tool.name === "symbol_lattice_routes");
    expect(routeTool?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(routeTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        method: expect.objectContaining({ type: "string" }),
        path: expect.objectContaining({ type: "string" }),
        domain: expect.objectContaining({ type: "string" }),
        limit: expect.objectContaining({ type: "integer", minimum: 1, maximum: 100 })
      }
    });
    expect(JSON.stringify(routeTool?.inputSchema)).toContain("GET");
    expect(JSON.stringify(routeTool?.inputSchema)).toContain("NAVIGATE");
    expect(routeTool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        status: { type: "object" },
        bounds: { type: "object" },
        routes: { type: "array" },
        truncated: { type: "boolean" }
      }
    });

    const result = await client.callTool({
      name: "symbol_lattice_routes",
      arguments: {
        projectPath: "C:/chosen-project",
        method: "GET",
        path: "/api",
        domain: "api.example.test",
        limit: 7
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      bounds: { limit: 7, maximumLimit: 100 },
      routes: [
        {
          method: "GET",
          path: "/api/users",
          domain: "api.example.test",
          handler: { name: "listUsers" }
        },
        { method: "POST", path: "/api/missing", domain: null, handler: null }
      ],
      truncated: false
    });
    expect(routeCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        options: { method: "GET", pathPrefix: "/api", domain: "api.example.test", limit: 7 }
      }
    ]);

    const navigation = await client.callTool({
      name: "symbol_lattice_routes",
      arguments: { method: "NAVIGATE" }
    });
    expect(navigation.isError).not.toBe(true);
    expect(routeCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        options: { method: "GET", pathPrefix: "/api", domain: "api.example.test", limit: 7 }
      },
      {
        projectPath: "C:/default-project",
        options: { method: "NAVIGATE" }
      }
    ]);

    const unsupportedMethod = await client.callTool({
      name: "symbol_lattice_routes",
      arguments: { method: "get" }
    });
    expect(unsupportedMethod.isError).toBe(true);
    expect(routeCalls).toHaveLength(2);

    const invalidPath = await client.callTool({
      name: "symbol_lattice_routes",
      arguments: { path: "api" }
    });
    expect(invalidPath.isError).toBe(true);
    expect(routeCalls).toHaveLength(2);

    const invalidDomain = await client.callTool({
      name: "symbol_lattice_routes",
      arguments: { domain: " " }
    });
    expect(invalidDomain.isError).toBe(true);
    expect(routeCalls).toHaveLength(2);
  });

  it("does not register routes for an explore-only embedding", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-routes-legacy-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore"
    ]);
  });

  it("registers bounded non-HTTP entrypoint inventory only when the service supports it", async () => {
    const entrypointCalls: Array<{ projectPath: string; options: EntrypointsOptions }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async entrypoints(
        projectPath: string,
        options: EntrypointsOptions = {}
      ): Promise<EntrypointsResult> {
        entrypointCalls.push({ projectPath, options });
        return entrypointsResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-entrypoints-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_entrypoints"
    ]);
    const entrypointTool = tools.tools.find((tool) => tool.name === "symbol_lattice_entrypoints");
    expect(entrypointTool?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(entrypointTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        transport: expect.objectContaining({ type: "string" }),
        operation: expect.objectContaining({ type: "string" }),
        name: expect.objectContaining({ type: "string", minLength: 1 }),
        limit: expect.objectContaining({ type: "integer", minimum: 1, maximum: 100 })
      }
    });
    expect(JSON.stringify(entrypointTool?.inputSchema)).toContain("graphql");
    expect(entrypointTool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        status: { type: "object" },
        bounds: { type: "object" },
        entrypoints: { type: "array" },
        truncated: { type: "boolean" }
      }
    });

    const result = await client.callTool({
      name: "symbol_lattice_entrypoints",
      arguments: {
        projectPath: "C:/chosen-project",
        transport: "graphql",
        operation: "query",
        name: "auth",
        limit: 7
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      bounds: { limit: 7, maximumLimit: 100 },
      entrypoints: [
        { transport: "graphql", operation: "query", name: "author", handler: { name: "author" } }
      ],
      truncated: false
    });
    expect(entrypointCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        options: { transport: "graphql", operation: "query", namePrefix: "auth", limit: 7 }
      }
    ]);

    const unsupportedTransport = await client.callTool({
      name: "symbol_lattice_entrypoints",
      arguments: { transport: "http" }
    });
    expect(unsupportedTransport.isError).toBe(true);
    expect(entrypointCalls).toHaveLength(1);
  });

  it("registers bounded direct hierarchy only when the service supports it", async () => {
    const hierarchyCalls: Array<{
      projectPath: string;
      reference: string;
      options: HierarchyOptions;
    }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async hierarchy(
        projectPath: string,
        reference: string,
        options: HierarchyOptions = {}
      ): Promise<HierarchyResult> {
        hierarchyCalls.push({ projectPath, reference, options });
        return hierarchyResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-hierarchy-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_hierarchy"
    ]);
    const hierarchyTool = tools.tools.find((tool) => tool.name === "symbol_lattice_hierarchy");
    expect(hierarchyTool?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(hierarchyTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        reference: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      },
      required: ["reference"]
    });
    expect(hierarchyTool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        symbol: { type: "object" },
        parents: { type: "array" },
        children: { type: "array" },
        parentsTruncated: { type: "boolean" },
        childrenTruncated: { type: "boolean" }
      }
    });

    const result = await client.callTool({
      name: "symbol_lattice_hierarchy",
      arguments: {
        projectPath: "C:/chosen-project",
        reference: "src/base.ts#Base",
        limit: 2
      }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      symbol: { qualifiedName: "src/base.ts#Base" },
      bounds: { limit: 2, maximumLimit: 100 },
      parents: [{ relation: "implements", parent: null }],
      children: [{ relation: "extends", child: { name: "Child" } }],
      parentsTruncated: false,
      childrenTruncated: false
    });
    expect(hierarchyCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        reference: "src/base.ts#Base",
        options: { limit: 2 }
      }
    ]);

    const invalidLimit = await client.callTool({
      name: "symbol_lattice_hierarchy",
      arguments: { reference: "Base", limit: 101 }
    });
    expect(invalidLimit.isError).toBe(true);
    expect(hierarchyCalls).toHaveLength(1);
  });

  it("registers exact node retrieval only when the service supports it", async () => {
    const nodeCalls: Array<{ projectPath: string; reference: string }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async node(projectPath: string, reference: string): Promise<NodeResult> {
        nodeCalls.push({ projectPath, reference });
        return nodeResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-node-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const listedTools = (await client.listTools()).tools;
    expect(listedTools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_node"
    ]);
    const nodeTool = listedTools.find((tool) => tool.name === "symbol_lattice_node");
    expect(nodeTool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        status: { type: "object" },
        bounds: { type: "object" },
        match: { type: "object" },
        matchCandidatesTruncated: { type: "boolean" },
        sourceAvailability: { type: "string" },
        source: {},
        callers: { type: "object" },
        callees: { type: "object" }
      },
      required: expect.arrayContaining([
        "status",
        "bounds",
        "match",
        "matchCandidatesTruncated",
        "sourceAvailability",
        "source",
        "callers",
        "callees"
      ])
    });

    const result = await client.callTool({
      name: "symbol_lattice_node",
      arguments: { query: "src/users.ts#userById", projectPath: "C:/chosen-project" }
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify(nodeResult(), null, 2)
    });
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      bounds: { sourceLineLimit: 200, relationLimit: 25 },
      match: { status: "exact", symbol: { qualifiedName: "src/users.ts#userById" } },
      sourceAvailability: "active-generation",
      source: { filePath: "src/users.ts", truncated: false }
    });
    const defaultProjectResult = await client.callTool({
      name: "symbol_lattice_node",
      arguments: { query: "symbol:users:userById" }
    });
    expect(defaultProjectResult.isError).not.toBe(true);
    expect(nodeCalls).toEqual([
      { projectPath: "C:/chosen-project", reference: "src/users.ts#userById" },
      { projectPath: "C:/default-project", reference: "symbol:users:userById" }
    ]);
  });

  it("exposes retained graph history and structural diff only when the service supports them", async () => {
    const historyCalls: Array<{ projectPath: string; options: GenerationHistoryOptions }> = [];
    const diffCalls: Array<{
      projectPath: string;
      fromGenerationId: string;
      options: GenerationDiffOptions;
    }> = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async history(
        projectPath: string,
        options: GenerationHistoryOptions = {}
      ): Promise<GenerationHistoryResult> {
        historyCalls.push({ projectPath, options });
        return generationHistoryResult();
      },
      async diff(
        projectPath: string,
        fromGenerationId: string,
        options: GenerationDiffOptions = {}
      ): Promise<GenerationDiffResult> {
        diffCalls.push({ projectPath, fromGenerationId, options });
        return generationDiffResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-history-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_history",
      "symbol_lattice_diff"
    ]);

    const history = await client.callTool({
      name: "symbol_lattice_history",
      arguments: { projectPath: "C:/chosen-project", limit: 2 }
    });
    expect(history.isError).not.toBe(true);
    expect(history.structuredContent).toMatchObject({
      activeStatus: { generationId: "generation:test" },
      retention: { capacity: 5, retained: 2 }
    });
    expect((history.structuredContent as { generations?: unknown }).generations).toEqual(
      expect.arrayContaining([expect.objectContaining({ generationId: "generation:new" })])
    );
    expect(historyCalls).toEqual([
      { projectPath: "C:/chosen-project", options: { limit: 2 } }
    ]);

    const diff = await client.callTool({
      name: "symbol_lattice_diff",
      arguments: {
        projectPath: "C:/chosen-project",
        fromGenerationId: "generation:old",
        toGenerationId: "generation:new",
        limit: 3
      }
    });
    expect(diff.isError).not.toBe(true);
    expect(diff.structuredContent).toMatchObject({
      from: { generationId: "generation:old" },
      to: { generationId: "generation:new" },
      bounds: { limit: 3 }
    });
    expect(diffCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        fromGenerationId: "generation:old",
        options: { toGenerationId: "generation:new", limit: 3 }
      }
    ]);
  });

  it("registers bounded multi-symbol context only when the service supports it", async () => {
    const contextCalls: Array<{
      projectPath: string;
      references: readonly string[];
      options: {
        relationLimit?: number;
        maxHops?: number;
        impactDepth?: number;
        impactLimit?: number;
      };
    }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async context(
          projectPath: string,
          references: readonly string[],
          options = {}
        ): Promise<ContextResult> {
          contextCalls.push({ projectPath, references, options });
          return contextResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-context-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_context"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_context",
      arguments: {
        projectPath: "C:/chosen-project",
        references: ["src/entry.ts#entry", "src/target.ts#target"],
        relationLimit: 2,
        maxHops: 3,
        impactDepth: 2,
        impactLimit: 4
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      bounds: { relationLimit: 2, maxHops: 3 },
      contexts: [{ sourceAvailability: "not-applicable" }]
    });
    expect(contextCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        references: ["src/entry.ts#entry", "src/target.ts#target"],
        options: { relationLimit: 2, maxHops: 3, impactDepth: 2, impactLimit: 4 }
      }
    ]);
  });

  it("registers one-question investigation only when the service supports it", async () => {
    const investigateCalls: Array<{
      projectPath: string;
      query: string;
      options: InvestigateOptions;
    }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async investigate(
          projectPath: string,
          query: string,
          options: InvestigateOptions = {}
        ): Promise<InvestigateResult> {
          investigateCalls.push({ projectPath, query, options });
          return investigateResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-investigate-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_investigate"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_investigate",
      arguments: {
        projectPath: "C:/chosen-project",
        query: "user",
        searchLimit: 4,
        symbolLimit: 2,
        ranking: "topology",
        path: "src/",
        language: "typescript",
        relationLimit: 3,
        maxHops: 2,
        impactDepth: 2,
        impactLimit: 4
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "user",
      bounds: { ranking: "topology" },
      selection: {
        items: [
          {
            topologySignals: {
              maxHops: 3,
              maxVisitedSymbols: 500,
              seedCount: 1,
              scopedExactNeighborCount: 1,
              score: 0.16
            }
          }
        ],
        total: 1,
        truncated: false
      },
      declarations: [
        {
          reference: "src/users.ts#userById",
          sourceAvailability: "active-generation",
          source: { text: "export function userById(): void {}" }
        }
      ],
      contexts: [{ sourceAvailability: "not-applicable" }]
    });
    expect(investigateCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        query: "user",
        options: {
          searchLimit: 4,
          symbolLimit: 2,
          ranking: "topology",
          pathPrefix: "src/",
          language: "typescript",
          relationLimit: 3,
          maxHops: 2,
          impactDepth: 2,
          impactLimit: 4
        }
      }
    ]);
  });

  it("registers affected-test analysis only when the service supports it", async () => {
    const affectedCalls: Array<{
      projectPath: string;
      filePaths: readonly string[];
      options: { maxDepth?: number; limit?: number };
    }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async affectedTests(
          projectPath: string,
          filePaths: readonly string[],
          options = {}
        ): Promise<AffectedTestsResult> {
          affectedCalls.push({ projectPath, filePaths, options });
          return affectedTestsResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-affected-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_affected"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_affected",
      arguments: {
        projectPath: "C:/chosen-project",
        filePaths: ["src/math.ts", "tests/math.spec.ts"],
        maxDepth: 4,
        limit: 7
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      bounds: { maxDepth: 5, limit: 25 },
      completeness: { completeForActiveGeneration: true }
    });
    expect(affectedCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        filePaths: ["src/math.ts", "tests/math.spec.ts"],
        options: { maxDepth: 4, limit: 7 }
      }
    ]);
  });

  it("registers local Git affected-test selection only when the capability is available", async () => {
    const gitCalls: Array<{
      projectPath: string;
      options: GitAffectedTestsOptions;
    }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        gitAffectedTestsAvailable(): boolean {
          return true;
        },
        async affectedTestsFromGit(
          projectPath: string,
          options: GitAffectedTestsOptions = {}
        ): Promise<GitAffectedTestsResult> {
          gitCalls.push({ projectPath, options });
          if (options.baseRef === " origin/main") {
            throw new SymbolLatticeError(
              "INVALID_GIT_BASE_REF",
              "Git base ref must not contain surrounding whitespace."
            );
          }
          return gitAffectedTestsResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-affected-git-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_affected_git"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_affected_git",
      arguments: {
        projectPath: "C:/chosen-project",
        baseRef: "origin/main",
        maxDepth: 4,
        limit: 7
      }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      changeSet: { requestedBaseRef: null, sourcePaths: ["src/math.ts"] },
      affected: { completeness: { completeForActiveGeneration: true } }
    });
    expect(gitCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        options: { baseRef: "origin/main", maxDepth: 4, limit: 7 }
      }
    ]);

    const invalidBaseResult = await client.callTool({
      name: "symbol_lattice_affected_git",
      arguments: { baseRef: " origin/main" }
    });
    expect(invalidBaseResult.isError).toBe(true);
    expect(invalidBaseResult.content[0]?.text).toContain("INVALID_GIT_BASE_REF");
    expect(gitCalls.at(-1)).toEqual({
      projectPath: "C:/default-project",
      options: { baseRef: " origin/main" }
    });

    const unavailableServer = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        gitAffectedTestsAvailable(): boolean {
          return false;
        },
        async affectedTestsFromGit(): Promise<GitAffectedTestsResult> {
          return gitAffectedTestsResult();
        }
      },
      "C:/default-project"
    );
    const unavailableClient = new Client({ name: "symbol-lattice-git-disabled-test", version: "1.0.0" });
    const [unavailableServerTransport, unavailableClientTransport] = InMemoryTransport.createLinkedPair();
    await unavailableServer.connect(unavailableServerTransport);
    await unavailableClient.connect(unavailableClientTransport);
    closeCallbacks.push(() => unavailableClient.close(), () => unavailableServer.close());
    expect((await unavailableClient.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore"
    ]);
  });

  it("registers immutable Git hunk attribution only when the capability is available", async () => {
    const gitCalls: Array<{
      projectPath: string;
      baseRef: string;
      options: GitHunksOptions;
    }> = [];
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        gitHunksAvailable(): boolean {
          return true;
        },
        async gitHunks(
          projectPath: string,
          baseRef: string,
          options: GitHunksOptions = {}
        ): Promise<GitHunksResult> {
          gitCalls.push({ projectPath, baseRef, options });
          if (baseRef === " origin/main") {
            throw new SymbolLatticeError(
              "INVALID_GIT_BASE_REF",
              "Git base ref must not contain surrounding whitespace."
            );
          }
          return gitHunksResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-git-hunks-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_git_hunks"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_git_hunks",
      arguments: {
        projectPath: "C:/chosen-project",
        baseRef: "origin/main",
        limit: 7
      }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      changeSet: { requestedBaseRef: "origin/main", includesUntracked: false },
      bounds: { limit: 7, maximumLimit: 100 }
    });
    expect(gitCalls).toEqual([
      {
        projectPath: "C:/chosen-project",
        baseRef: "origin/main",
        options: { limit: 7 }
      }
    ]);

    const invalidBaseResult = await client.callTool({
      name: "symbol_lattice_git_hunks",
      arguments: { baseRef: " origin/main" }
    });
    expect(invalidBaseResult.isError).toBe(true);
    expect(invalidBaseResult.content[0]?.text).toContain("INVALID_GIT_BASE_REF");
    expect(gitCalls.at(-1)).toEqual({
      projectPath: "C:/default-project",
      baseRef: " origin/main",
      options: {}
    });

    const unavailableServer = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        gitHunksAvailable(): boolean {
          return false;
        },
        async gitHunks(): Promise<GitHunksResult> {
          return gitHunksResult();
        }
      },
      "C:/default-project"
    );
    const unavailableClient = new Client({ name: "symbol-lattice-git-hunks-disabled-test", version: "1.0.0" });
    const [unavailableServerTransport, unavailableClientTransport] = InMemoryTransport.createLinkedPair();
    await unavailableServer.connect(unavailableServerTransport);
    await unavailableClient.connect(unavailableClientTransport);
    closeCallbacks.push(() => unavailableClient.close(), () => unavailableServer.close());
    expect((await unavailableClient.listTools()).tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore"
    ]);
  });

  it("does not register search for an existing explore-and-explain embedding", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        },
        async explainEdge(): Promise<ExplainEdgeResult> {
          return explainEdgeResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-pre-search-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "symbol_lattice_explore",
      "symbol_lattice_explain_edge"
    ]);
  });

  it("keeps the v0.1 explore-only embedding contract usable without registering node", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return exploreResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-legacy-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["symbol_lattice_explore"]);
  });

  it("accepts a legacy explore response that omits source availability", async () => {
    const server = createMcpServer(
      {
        async explore(): Promise<ExploreResult> {
          return legacyExploreResult();
        }
      },
      "C:/default-project"
    );
    const client = new Client({ name: "symbol-lattice-legacy-provenance-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const result = await client.callTool({
      name: "symbol_lattice_explore",
      arguments: { query: "missing" }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: { stale: false },
      match: { status: "not_found" }
    });
    expect(result.structuredContent).not.toHaveProperty("sourceAvailability");
  });

  it("returns actionable explore errors", async () => {
    const response = await runExploreTool(
      {
        async explore(): Promise<ExploreResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { query: "anything" }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns automatic sync status errors without indexing", async () => {
    const response = await runAutoSyncStatusTool({
      async autoSyncStatus(): Promise<AutoSyncStatusResult> {
        throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
      }
    });

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns automatic sync diagnostic errors without indexing", async () => {
    const response = await runAutoSyncDiagnosticsTool({
      async autoSyncDiagnostics(): Promise<AutoSyncDiagnosticsResult> {
        throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
      }
    });

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns durable automatic sync journal errors without indexing", async () => {
    const response = await runAutoSyncDiagnosticJournalTool({
      async autoSyncJournal(): Promise<AutoSyncDiagnosticJournalResult> {
        throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
      }
    });

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns exact-node errors without indexing", async () => {
    const response = await runNodeTool(
      {
        async node(): Promise<NodeResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { query: "src/missing.ts#missing" }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns context errors without indexing", async () => {
    const response = await runContextTool(
      {
        async context(): Promise<ContextResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { references: ["src/missing.ts#missing"] }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns affected-test errors without indexing", async () => {
    const response = await runAffectedTestsTool(
      {
        async affectedTests(): Promise<AffectedTestsResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { filePaths: ["src/missing.ts"] }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns local Git affected-test errors without indexing", async () => {
    const response = await runGitAffectedTestsTool(
      {
        gitAffectedTestsAvailable(): boolean {
          return true;
        },
        async affectedTestsFromGit(): Promise<GitAffectedTestsResult> {
          throw new SymbolLatticeError(
            "GIT_CHANGE_SET_UNAVAILABLE",
            "Git is not available in this project."
          );
        }
      },
      "C:/project",
      { baseRef: "origin/main" }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("GIT_CHANGE_SET_UNAVAILABLE");
  });

  it("returns immutable Git hunk errors without indexing", async () => {
    const response = await runGitHunksTool(
      {
        gitHunksAvailable(): boolean {
          return true;
        },
        async gitHunks(): Promise<GitHunksResult> {
          throw new SymbolLatticeError(
            "GIT_HUNKS_UNAVAILABLE",
            "Git is not available in this project."
          );
        }
      },
      "C:/project",
      { baseRef: "origin/main" }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("GIT_HUNKS_UNAVAILABLE");
  });

  it("returns indexed-search errors without indexing", async () => {
    const response = await runSearchTool(
      {
        async search(): Promise<SearchResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { query: "anything", limit: 3 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns one-question investigation errors without indexing", async () => {
    const response = await runInvestigateTool(
      {
        async investigate(): Promise<InvestigateResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { query: "anything", searchLimit: 3, symbolLimit: 2 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns reverse-impact errors without indexing", async () => {
    const response = await runImpactTool(
      {
        async impact(): Promise<ImpactResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { reference: "src/handlers.ts#users", maxDepth: 2, limit: 3 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns route inventory errors without indexing", async () => {
    const response = await runRoutesTool(
      {
        async routes(): Promise<RoutesResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { method: "GET", path: "/api", limit: 3 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns entrypoint inventory errors without indexing", async () => {
    const response = await runEntrypointsTool(
      {
        async entrypoints(): Promise<EntrypointsResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { transport: "graphql", operation: "query", name: "author", limit: 3 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns hierarchy errors without indexing", async () => {
    const response = await runHierarchyTool(
      {
        async hierarchy(): Promise<HierarchyResult> {
          throw new SymbolLatticeError("MISSING_INDEX", "Run symbol-lattice init first.");
        }
      },
      "C:/project",
      { reference: "src/base.ts#Base", limit: 3 }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("MISSING_INDEX");
  });

  it("returns retained-history and structural-diff errors without indexing", async () => {
    const history = await runGenerationHistoryTool(
      {
        async history(): Promise<GenerationHistoryResult> {
          throw new SymbolLatticeError(
            "GENERATION_HISTORY_UNAVAILABLE",
            "Run an explicit sync or index before reading retained history."
          );
        }
      },
      "C:/project",
      { limit: 2 }
    );
    const diff = await runGenerationDiffTool(
      {
        async diff(): Promise<GenerationDiffResult> {
          throw new SymbolLatticeError(
            "GENERATION_NOT_RETAINED",
            "The requested generation is not retained."
          );
        }
      },
      "C:/project",
      { fromGenerationId: "generation:old" }
    );

    expect(history.content[0]?.text).toContain("GENERATION_HISTORY_UNAVAILABLE");
    expect(diff.content[0]?.text).toContain("GENERATION_NOT_RETAINED");
  });

  it("returns edge lookup errors without indexing", async () => {
    const response = await runExplainEdgeTool(
      {
        async explainEdge(): Promise<ExplainEdgeResult> {
          throw new SymbolLatticeError("EDGE_NOT_FOUND", "No graph edge matches \"missing\".");
        }
      },
      "C:/project",
      { edgeId: "missing" }
    );

    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("EDGE_NOT_FOUND");
  });

  it("never invokes init, index, or sync for any query tool", async () => {
    const mutationCalls: string[] = [];
    const service = {
      async explore(): Promise<ExploreResult> {
        return exploreResult();
      },
      async node(): Promise<NodeResult> {
        return nodeResult();
      },
      async context(): Promise<ContextResult> {
        return contextResult();
      },
      async affectedTests(): Promise<AffectedTestsResult> {
        return affectedTestsResult();
      },
      gitAffectedTestsAvailable(): boolean {
        return true;
      },
      async affectedTestsFromGit(): Promise<GitAffectedTestsResult> {
        return gitAffectedTestsResult();
      },
      gitHunksAvailable(): boolean {
        return true;
      },
      async gitHunks(): Promise<GitHunksResult> {
        return gitHunksResult();
      },
      async search(): Promise<SearchResult> {
        return searchResult();
      },
      async investigate(): Promise<InvestigateResult> {
        return investigateResult();
      },
      async impact(): Promise<ImpactResult> {
        return impactResult();
      },
      async routes(): Promise<RoutesResult> {
        return routesResult();
      },
      async hierarchy(): Promise<HierarchyResult> {
        return hierarchyResult();
      },
      async history(): Promise<GenerationHistoryResult> {
        return generationHistoryResult();
      },
      async diff(): Promise<GenerationDiffResult> {
        return generationDiffResult();
      },
      async explainEdge(): Promise<ExplainEdgeResult> {
        return explainEdgeResult();
      },
      async autoSyncStatus(): Promise<AutoSyncStatusResult> {
        return autoSyncStatusResult();
      },
      async autoSyncDiagnostics(): Promise<AutoSyncDiagnosticsResult> {
        return autoSyncDiagnosticsResult();
      },
      async autoSyncJournal(): Promise<AutoSyncDiagnosticJournalResult> {
        return autoSyncDiagnosticJournalResult();
      },
      async init(): Promise<void> {
        mutationCalls.push("init");
      },
      async index(): Promise<void> {
        mutationCalls.push("index");
      },
      async sync(): Promise<void> {
        mutationCalls.push("sync");
      }
    };

    await runExploreTool(service, "C:/project", { query: "missing" });
    await runAutoSyncStatusTool(service);
    await runAutoSyncDiagnosticsTool(service, { limit: 2 });
    await runAutoSyncDiagnosticJournalTool(service, { limit: 2 });
    await runNodeTool(service, "C:/project", { query: "src/missing.ts#missing" });
    await runContextTool(service, "C:/project", { references: ["src/missing.ts#missing"] });
    await runAffectedTestsTool(service, "C:/project", { filePaths: ["src/missing.ts"] });
    await runGitAffectedTestsTool(service, "C:/project", {});
    await runGitHunksTool(service, "C:/project", { baseRef: "origin/main" });
    await runSearchTool(service, "C:/project", { query: "user" });
    await runInvestigateTool(service, "C:/project", { query: "user" });
    await runImpactTool(service, "C:/project", { reference: "src/missing.ts#missing" });
    await runRoutesTool(service, "C:/project", { method: "GET", path: "/api" });
    await runHierarchyTool(service, "C:/project", { reference: "src/base.ts#Base" });
    await runGenerationHistoryTool(service, "C:/project", {});
    await runGenerationDiffTool(service, "C:/project", { fromGenerationId: "generation:old" });
    await runExplainEdgeTool(service, "C:/project", { edgeId: "edge:caller-callee" });

    expect(mutationCalls).toEqual([]);
  });
});

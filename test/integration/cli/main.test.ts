import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type AffectedTestsOptions,
  type AffectedTestsResult,
  type ContextOptions,
  type ContextResult,
  type EntrypointsOptions,
  type EntrypointsResult,
  type ForegroundWatchOptions,
  type GenerationDiffOptions,
  type GenerationDiffResult,
  type GenerationHistoryOptions,
  type GenerationHistoryResult,
  type GitAffectedTestsOptions,
  type GitAffectedTestsResult,
  type GitHunksOptions,
  type GitHunksResult,
  type ImpactOptions,
  type ImpactResult,
  type HierarchyOptions,
  type HierarchyResult,
  type NodeResult,
  type RoutesOptions,
  type RoutesResult,
  type SearchOptions,
  type SearchResult,
  type WatchReceipt,
  type SymbolLatticeService
} from "../../../src/application/index.js";
import {
  createProgram,
  parseAffectedStdin,
  runForegroundWatch,
  type WatchSignalSource
} from "../../../src/cli/main.js";

function resultStatus(): SearchResult["status"] {
  return {
    initialized: true,
    stale: false,
    staleReasons: [],
    projectPath: "C:/project",
    indexedAt: "2026-07-29T00:00:00.000Z",
    generationId: "generation:test",
    counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
  };
}

function searchResult(): SearchResult {
  return {
    status: resultStatus(),
    results: []
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
  return {
    status: resultStatus(),
    bounds: { limit: 7, maximumLimit: 100 },
    routes: [
      {
        method: "GET",
        path: "/api/users",
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
    status: resultStatus(),
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
  return {
    status: resultStatus(),
    symbol: base,
    bounds: { limit: 2, maximumLimit: 100 },
    parents: [],
    children: [],
    parentsTruncated: false,
    childrenTruncated: false
  };
}

function contextResult(): ContextResult {
  return {
    status: resultStatus(),
    bounds: {
      maxReferences: 8,
      matchCandidateLimit: 25,
      relationLimit: 8,
      maxHops: 4,
      maxVisitedSymbolsPerPath: 500,
      impactDepth: 2,
      impactLimit: 8
    },
    contexts: [],
    evidencePaths: []
  };
}

function impactResult(): ImpactResult {
  return {
    status: resultStatus(),
    symbol: {
      id: "symbol:target",
      name: "target",
      qualifiedName: "src/target.ts#target",
      kind: "function",
      filePath: "src/target.ts",
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 32 }
      },
      isExported: true,
      declarationOrdinal: 0
    },
    paths: []
  };
}

function affectedTestsResult(): AffectedTestsResult {
  return {
    status: resultStatus(),
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
    status: resultStatus(),
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

function generationHistoryResult(): GenerationHistoryResult {
  return {
    activeStatus: resultStatus(),
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
    bounds: { limit: 7, maximumLimit: 100 },
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

describe("symbol-lattice search CLI", () => {
  it("forwards bounded source-search filters and renders the stable JSON result", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const result = searchResult();
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "search",
        "  User Token  ",
        "--project",
        "C:/chosen-project",
        "--limit",
        "7",
        "--path",
        " src/ ",
        "--language",
        "python",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        query: "User Token",
        options: { limit: 7, pathPrefix: "src/", language: "python" }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("accepts Rust as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "rust", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "rust" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts Java as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "java", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "java" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts PHP as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "users", "--language", "php", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "users",
        options: { language: "php" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts C as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "c", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "c" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts Haskell as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "haskell", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "haskell" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts C++ as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "cpp", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "cpp" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts C# as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "csharp", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "csharp" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts Ruby as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "ruby", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "ruby" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("accepts Kotlin as a persisted source-search language filter", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return searchResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "search", "health", "--language", "kotlin", "--json"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        query: "health",
        options: { language: "kotlin" }
      }
    ]);
    expect(write).toHaveBeenCalled();
  });

  it("rejects search limits above the persisted retrieval bound", async () => {
    const service = { async search(): Promise<SearchResult> { return searchResult(); } } as unknown as SymbolLatticeService;
    const program = createProgram(service);
    program.exitOverride();

    await expect(
      program.parseAsync(
        ["node", "symbol-lattice", "search", "user", "--limit", "101"],
        { from: "node" }
      )
    ).rejects.toThrow("Expected an integer between 1 and 100");
  });
});

describe("symbol-lattice v0.14 routes CLI", () => {
  it("forwards route filters, positional project selection, and stable JSON without mutating", async () => {
    const calls: Array<{ projectPath: string; options: RoutesOptions }> = [];
    const mutationCalls: string[] = [];
    const result = routesResult();
    const service = {
      async routes(projectPath: string, options: RoutesOptions = {}): Promise<RoutesResult> {
        calls.push({ projectPath, options });
        return result;
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
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "routes",
        "C:/positional-project",
        "--project",
        "C:/ignored-project",
        "--method",
        "GET",
        "--path",
        "/api",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/positional-project"),
        options: { method: "GET", pathPrefix: "/api", limit: 7 }
      }
    ]);
    expect(mutationCalls).toEqual([]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("forwards the NAVIGATE client-route discriminator without treating it as HTTP", async () => {
    const calls: Array<{ projectPath: string; options: RoutesOptions }> = [];
    const service = {
      async routes(projectPath: string, options: RoutesOptions = {}): Promise<RoutesResult> {
        calls.push({ projectPath, options });
        return routesResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "routes", "--project", "C:/project", "--method", "NAVIGATE"],
      { from: "node" }
    );

    expect(calls).toEqual([
      { projectPath: resolve("C:/project"), options: { method: "NAVIGATE" } }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(routesResult(), null, 2)}\n`);
  });

  it("forwards the CONNECT HTTP method through the existing read-only route command", async () => {
    const calls: Array<{ projectPath: string; options: RoutesOptions }> = [];
    const service = {
      async routes(projectPath: string, options: RoutesOptions = {}): Promise<RoutesResult> {
        calls.push({ projectPath, options });
        return routesResult();
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "routes", "--project", "C:/project", "--method", "CONNECT"],
      { from: "node" }
    );

    expect(calls).toEqual([
      { projectPath: resolve("C:/project"), options: { method: "CONNECT" } }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(routesResult(), null, 2)}\n`);
  });

  it.each([
    [["--method", "get"], "Expected one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE, CONNECT, ALL, NAVIGATE"],
    [["--path", "api"], "Expected a non-empty route path prefix beginning with"],
    [["--limit", "101"], "Expected an integer between 1 and 100"]
  ])("rejects invalid route filter %j before invoking the service", async (arguments_, message) => {
    const routes = vi.fn();
    const program = createProgram({ routes } as unknown as SymbolLatticeService);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "symbol-lattice", "routes", ...arguments_], {
        from: "node"
      })
    ).rejects.toThrow(message);
    expect(routes).not.toHaveBeenCalled();
  });
});

describe("symbol-lattice v0.18 entrypoints CLI", () => {
  it("forwards transport entrypoint filters and renders stable JSON without mutating", async () => {
    const calls: Array<{ projectPath: string; options: EntrypointsOptions }> = [];
    const mutationCalls: string[] = [];
    const result = entrypointsResult();
    const service = {
      async entrypoints(
        projectPath: string,
        options: EntrypointsOptions = {}
      ): Promise<EntrypointsResult> {
        calls.push({ projectPath, options });
        return result;
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
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "entrypoints",
        "C:/positional-project",
        "--project",
        "C:/ignored-project",
        "--transport",
        "graphql",
        "--operation",
        "query",
        "--name",
        "auth",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/positional-project"),
        options: { transport: "graphql", operation: "query", namePrefix: "auth", limit: 7 }
      }
    ]);
    expect(mutationCalls).toEqual([]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it.each([
    [["--transport", "http"], "Expected one of: graphql, microservice, websocket"],
    [["--operation", "route"], "Expected one of: query, mutation, subscription, message, event, subscribe"],
    [["--name", ""], "Expected a non-empty entrypoint name prefix"],
    [["--limit", "101"], "Expected an integer between 1 and 100"]
  ])("rejects invalid entrypoint filter %j before invoking the service", async (arguments_, message) => {
    const entrypoints = vi.fn();
    const program = createProgram({ entrypoints } as unknown as SymbolLatticeService);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "symbol-lattice", "entrypoints", ...arguments_], {
        from: "node"
      })
    ).rejects.toThrow(message);
    expect(entrypoints).not.toHaveBeenCalled();
  });
});

describe("symbol-lattice v0.15 hierarchy CLI", () => {
  it("forwards a bounded direct hierarchy request and renders stable JSON without mutating", async () => {
    const calls: Array<{ projectPath: string; reference: string; options: HierarchyOptions }> = [];
    const mutationCalls: string[] = [];
    const result = hierarchyResult();
    const service = {
      async hierarchy(
        projectPath: string,
        reference: string,
        options: HierarchyOptions = {}
      ): Promise<HierarchyResult> {
        calls.push({ projectPath, reference, options });
        return result;
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
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "hierarchy",
        "src/base.ts#Base",
        "--project",
        "C:/indexed-project",
        "--limit",
        "2",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/indexed-project"),
        reference: "src/base.ts#Base",
        options: { limit: 2 }
      }
    ]);
    expect(mutationCalls).toEqual([]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("rejects an out-of-range hierarchy limit before invoking the service", async () => {
    const hierarchy = vi.fn();
    const program = createProgram({ hierarchy } as unknown as SymbolLatticeService);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "symbol-lattice", "hierarchy", "Base", "--limit", "101"], {
        from: "node"
      })
    ).rejects.toThrow("Expected an integer between 1 and 100");
    expect(hierarchy).not.toHaveBeenCalled();
  });
});

describe("symbol-lattice v0.11 retained-generation CLI", () => {
  it("forwards a bounded history request and renders the stable JSON result", async () => {
    const calls: Array<{ projectPath: string; options: GenerationHistoryOptions }> = [];
    const result = generationHistoryResult();
    const service = {
      async history(
        projectPath: string,
        options: GenerationHistoryOptions = {}
      ): Promise<GenerationHistoryResult> {
        calls.push({ projectPath, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "history",
        "C:/chosen-project",
        "--limit",
        "2",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      { projectPath: resolve("C:/chosen-project"), options: { limit: 2 } }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("forwards explicit retained generation IDs, a target, and a bounded structural diff", async () => {
    const calls: Array<{
      projectPath: string;
      fromGenerationId: string;
      options: GenerationDiffOptions;
    }> = [];
    const result = generationDiffResult();
    const service = {
      async diff(
        projectPath: string,
        fromGenerationId: string,
        options: GenerationDiffOptions = {}
      ): Promise<GenerationDiffResult> {
        calls.push({ projectPath, fromGenerationId, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "diff",
        "generation:old",
        "C:/chosen-project",
        "--to",
        "generation:new",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        fromGenerationId: "generation:old",
        options: { toGenerationId: "generation:new", limit: 7 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  for (const rangeCase of [
    ["history", "101"],
    ["diff", "generation:old", "101"]
  ] as const) {
    it(`rejects an out-of-range retained-generation bound: ${rangeCase.join(" ")}`, async () => {
      const program = createProgram({} as SymbolLatticeService);
      program.exitOverride();
      const command =
        rangeCase[0] === "history"
          ? ["node", "symbol-lattice", "history", "--limit", rangeCase[1]]
          : ["node", "symbol-lattice", "diff", rangeCase[1], "--limit", rangeCase[2]];

      await expect(program.parseAsync(command, { from: "node" })).rejects.toThrow(
        "Expected an integer between 1 and 100"
      );
    });
  }
});

describe("symbol-lattice v0.5 context and impact CLI", () => {
  it("forwards bounded context options, references, project selection, and JSON output", async () => {
    const calls: Array<{
      projectPath: string;
      references: readonly string[];
      options: ContextOptions;
    }> = [];
    const result = contextResult();
    const service = {
      async context(
        projectPath: string,
        references: readonly string[],
        options: ContextOptions = {}
      ): Promise<ContextResult> {
        calls.push({ projectPath, references, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "context",
        "src/consumer.ts#calculate",
        "src/math.ts#add",
        "--project",
        "C:/chosen-project",
        "--relation-limit",
        "7",
        "--max-hops",
        "5",
        "--impact-depth",
        "3",
        "--impact-limit",
        "12",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        references: ["src/consumer.ts#calculate", "src/math.ts#add"],
        options: {
          relationLimit: 7,
          maxHops: 5,
          impactDepth: 3,
          impactLimit: 12
        }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  for (const rangeCase of [
    ["--relation-limit", "26", "Expected an integer between 1 and 25"],
    ["--max-hops", "7", "Expected an integer between 1 and 6"],
    ["--impact-depth", "4", "Expected an integer between 1 and 3"],
    ["--impact-limit", "26", "Expected an integer between 1 and 25"]
  ] as const) {
    it(`rejects ${rangeCase[0]} outside its bounded context range`, async () => {
      const service = {
        async context(): Promise<ContextResult> {
          return contextResult();
        }
      } as unknown as SymbolLatticeService;
      const program = createProgram(service);
      program.exitOverride();

      await expect(
        program.parseAsync(
          ["node", "symbol-lattice", "context", "src/example.ts#one", rangeCase[0], rangeCase[1]],
          { from: "node" }
        )
      ).rejects.toThrow(rangeCase[2]);
    });
  }

  it("forwards an explicit impact limit through the options overload", async () => {
    const calls: Array<{ projectPath: string; reference: string; options: ImpactOptions }> = [];
    const result = impactResult();
    const service = {
      async impact(
        projectPath: string,
        reference: string,
        options: ImpactOptions
      ): Promise<ImpactResult> {
        calls.push({ projectPath, reference, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "impact",
        "src/math.ts#add",
        "--project",
        "C:/chosen-project",
        "--depth",
        "2",
        "--limit",
        "9",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        reference: "src/math.ts#add",
        options: { maxDepth: 2, limit: 9 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("uses the impact options overload without a limit property when none was requested", async () => {
    const calls: Array<{ projectPath: string; reference: string; options: ImpactOptions }> = [];
    const service = {
      async impact(
        projectPath: string,
        reference: string,
        options: ImpactOptions
      ): Promise<ImpactResult> {
        calls.push({ projectPath, reference, options });
        return impactResult();
      }
    } as unknown as SymbolLatticeService;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "impact", "src/math.ts#add", "--depth", "2"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        reference: "src/math.ts#add",
        options: { maxDepth: 2 }
      }
    ]);
  });

  it("rejects impact limits above the bounded public range", async () => {
    const service = {
      async impact(): Promise<ImpactResult> {
        return impactResult();
      }
    } as unknown as SymbolLatticeService;
    const program = createProgram(service);
    program.exitOverride();

    await expect(
      program.parseAsync(
        ["node", "symbol-lattice", "impact", "src/math.ts#add", "--limit", "101"],
        { from: "node" }
      )
    ).rejects.toThrow("Expected an integer between 1 and 100");
  });
});

describe("symbol-lattice v0.6 affected-test CLI", () => {
  it("parses Git-style stdin file lists without blank records", () => {
    expect(parseAffectedStdin("src/math.ts\r\ntest/math.test.ts\n\n")).toEqual([
      "src/math.ts",
      "test/math.test.ts"
    ]);
  });

  it("forwards changed files and bounded affected-test options", async () => {
    const calls: Array<{
      projectPath: string;
      filePaths: readonly string[];
      options: AffectedTestsOptions;
    }> = [];
    const result = affectedTestsResult();
    const service = {
      async affectedTests(
        projectPath: string,
        filePaths: readonly string[],
        options: AffectedTestsOptions = {}
      ): Promise<AffectedTestsResult> {
        calls.push({ projectPath, filePaths, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "affected",
        "src/math.ts",
        "tests/math.spec.ts",
        "--project",
        "C:/chosen-project",
        "--depth",
        "4",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        filePaths: ["src/math.ts", "tests/math.spec.ts"],
        options: { maxDepth: 4, limit: 7 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("forwards working-tree Git selection and preserves stable JSON output", async () => {
    const calls: Array<{ projectPath: string; options: GitAffectedTestsOptions }> = [];
    const result = gitAffectedTestsResult();
    const service = {
      async affectedTestsFromGit(
        projectPath: string,
        options: GitAffectedTestsOptions = {}
      ): Promise<GitAffectedTestsResult> {
        calls.push({ projectPath, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "affected",
        "--working-tree",
        "--project",
        "C:/chosen-project",
        "--depth",
        "4",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        options: { maxDepth: 4, limit: 7 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("forwards an explicit Git base ref without changing the existing file-list contract", async () => {
    const calls: Array<{ projectPath: string; options: GitAffectedTestsOptions }> = [];
    const service = {
      async affectedTestsFromGit(
        projectPath: string,
        options: GitAffectedTestsOptions = {}
      ): Promise<GitAffectedTestsResult> {
        calls.push({ projectPath, options });
        return gitAffectedTestsResult();
      }
    } as unknown as SymbolLatticeService;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "affected", "--base", "origin/main", "--project", "C:/chosen-project"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        options: { baseRef: "origin/main" }
      }
    ]);
  });

  for (const conflictCase of [
    ["src/math.ts", "--working-tree"],
    ["--base", "HEAD", "--working-tree"],
    ["--base", "HEAD", "--stdin"]
  ] as const) {
    it(`rejects incompatible Git affected selection: ${conflictCase.join(" ")}`, async () => {
      const program = createProgram({} as SymbolLatticeService);
      program.exitOverride();

      await expect(
        program.parseAsync(["node", "symbol-lattice", "affected", ...conflictCase], {
          from: "node"
        })
      ).rejects.toThrow(/Git selection|either "--working-tree"/u);
    });
  }

  for (const rangeCase of [
    ["--depth", "9", "Expected an integer between 1 and 8"],
    ["--limit", "101", "Expected an integer between 1 and 100"]
  ] as const) {
    it(`rejects affected-test ${rangeCase[0]} outside its public bounds`, async () => {
      const service = {
        async affectedTests(): Promise<AffectedTestsResult> {
          return affectedTestsResult();
        }
      } as unknown as SymbolLatticeService;
      const program = createProgram(service);
      program.exitOverride();

      await expect(
        program.parseAsync(
          ["node", "symbol-lattice", "affected", "src/math.ts", rangeCase[0], rangeCase[1]],
          { from: "node" }
        )
      ).rejects.toThrow(rangeCase[2]);
    });
  }
});

describe("symbol-lattice v0.13 node CLI", () => {
  it("forwards the reference and project path and renders the stable JSON result", async () => {
    const calls: Array<{ projectPath: string; reference: string }> = [];
    const result: NodeResult = {
      status: resultStatus(),
      bounds: {
        sourceLineLimit: 200,
        sourceCharacterLimit: 16_000,
        relationLimit: 25,
        matchCandidateLimit: 25
      },
      match: { status: "not_found", reference: "src/math.ts#add", candidates: [] },
      matchCandidatesTruncated: false,
      sourceAvailability: "not-applicable",
      source: null,
      callers: { items: [], truncated: false },
      callees: { items: [], truncated: false }
    };
    const service = {
      async node(projectPath: string, reference: string): Promise<NodeResult> {
        calls.push({ projectPath, reference });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "node",
        "src/math.ts#add",
        "--project",
        "C:/chosen-project",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      { projectPath: resolve("C:/chosen-project"), reference: "src/math.ts#add" }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("requires a reference before invoking the service", async () => {
    const node = vi.fn();
    const program = createProgram({ node } as unknown as SymbolLatticeService);
    const nodeCommand = program.commands.find((command) => command.name() === "node");
    expect(nodeCommand).toBeDefined();
    nodeCommand?.exitOverride();

    await expect(
      program.parseAsync(["node", "symbol-lattice", "node"], { from: "node" })
    ).rejects.toThrow(/missing required argument/u);
    expect(node).not.toHaveBeenCalled();
  });
});

describe("symbol-lattice v0.12 immutable Git hunk CLI", () => {
  it("forwards the required base ref, positional project, and bounded limit", async () => {
    const calls: Array<{ projectPath: string; baseRef: string; options: GitHunksOptions }> = [];
    const result = gitHunksResult();
    const service = {
      async gitHunks(
        projectPath: string,
        baseRef: string,
        options: GitHunksOptions = {}
      ): Promise<GitHunksResult> {
        calls.push({ projectPath, baseRef, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "git-hunks",
        "C:/chosen-project",
        "--base",
        "origin/main",
        "--limit",
        "7",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        baseRef: "origin/main",
        options: { limit: 7 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("rejects Git hunk limits outside the public bound before invoking the service", async () => {
    const program = createProgram({} as SymbolLatticeService);
    program.exitOverride();

    await expect(
      program.parseAsync(
        ["node", "symbol-lattice", "git-hunks", "--base", "origin/main", "--limit", "101"],
        { from: "node" }
      )
    ).rejects.toThrow("Expected an integer between 1 and 100");
  });
});

describe("symbol-lattice v0.10 foreground watch CLI", () => {
  it("forwards the bounded interval and force flag, enables native events, and renders compact NDJSON receipts", async () => {
    const calls: ForegroundWatchOptions[] = [];
    const service = {} as SymbolLatticeService;
    const receipt: WatchReceipt = {
      event: "started",
      observedAt: "2026-07-30T00:00:00.000Z",
      projectPath: resolve("C:/chosen-project"),
      status: resultStatus(),
      previousGenerationId: "generation:test",
      generationId: "generation:test",
      lastIndexWork: null,
      error: null,
      retryDelayMs: null,
      pendingFileCount: 0,
      pendingFiles: [],
      pendingFilesTruncated: false,
      pendingFilesUnknown: false
    };
    const watchRunner = async (
      _receivedService: SymbolLatticeService,
      options: ForegroundWatchOptions
    ): Promise<void> => {
      calls.push(options);
      options.onReceipt?.(receipt);
    };
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service, watchRunner).parseAsync(
      [
        "node",
        "symbol-lattice",
        "watch",
        "--project",
        "C:/chosen-project",
        "--force",
        "--interval",
        "750",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      projectPath: resolve("C:/chosen-project"),
      force: true,
      intervalMs: 750
    });
    expect(calls[0]?.eventSource).toBeDefined();
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(receipt)}\n`);
  });

  it("lets callers opt out of native event acceleration with --poll", async () => {
    const calls: ForegroundWatchOptions[] = [];
    const service = {} as SymbolLatticeService;
    const watchRunner = async (
      _receivedService: SymbolLatticeService,
      options: ForegroundWatchOptions
    ): Promise<void> => {
      calls.push(options);
    };

    await createProgram(service, watchRunner).parseAsync(
      ["node", "symbol-lattice", "watch", "--project", "C:/chosen-project", "--poll"],
      { from: "node" }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toHaveProperty("eventSource");
  });

  it("rejects out-of-range watch intervals before starting a lifecycle", async () => {
    const program = createProgram({} as SymbolLatticeService, async () => undefined);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "symbol-lattice", "watch", "--interval", "249"], {
        from: "node"
      })
    ).rejects.toThrow("Watch interval must be an integer between 250 and 60000 milliseconds.");
  });

  it("installs signal handling before the initial freshness check and stops cleanly", async () => {
    let resolveStatus: ((status: SearchResult["status"]) => void) | undefined;
    const pendingStatus = new Promise<SearchResult["status"]>((resolve) => {
      resolveStatus = resolve;
    });
    const handlers = new Map<NodeJS.Signals, Set<() => void>>();
    const signals: WatchSignalSource & { emit(signal: NodeJS.Signals): void; listenerCount(signal: NodeJS.Signals): number } = {
      once(signal, listener): void {
        const listeners = handlers.get(signal) ?? new Set<() => void>();
        listeners.add(listener);
        handlers.set(signal, listeners);
      },
      off(signal, listener): void {
        handlers.get(signal)?.delete(listener);
      },
      emit(signal): void {
        const listeners = [...(handlers.get(signal) ?? [])];
        handlers.delete(signal);
        for (const listener of listeners) {
          listener();
        }
      },
      listenerCount(signal): number {
        return handlers.get(signal)?.size ?? 0;
      }
    };
    const receipts: WatchReceipt[] = [];
    const service = {
      assertSafeProjectPath(): void {},
      async getStatus(): Promise<SearchResult["status"]> {
        return pendingStatus;
      },
      async sync(): Promise<SearchResult["status"]> {
        throw new Error("sync must not run for a fresh initial status");
      }
    } as unknown as SymbolLatticeService;

    const running = runForegroundWatch(
      service,
      {
        projectPath: "C:/chosen-project",
        intervalMs: 250,
        onReceipt: (receipt) => receipts.push(receipt)
      },
      signals
    );

    expect(signals.listenerCount("SIGINT")).toBe(1);
    signals.emit("SIGINT");
    resolveStatus?.(resultStatus());
    await running;

    expect(receipts.map((receipt) => receipt.event)).toEqual(["started", "stopped"]);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });
});

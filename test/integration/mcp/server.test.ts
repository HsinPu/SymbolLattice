import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  SymbolLatticeError,
  type ExplainEdgeResult,
  type ExploreResult,
  type SearchResult
} from "../../../src/application/index.js";
import {
  createMcpServer,
  runExplainEdgeTool,
  runExploreTool,
  runSearchTool
} from "../../../src/mcp/index.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

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
  it("exposes read-only retrieval tools and forwards projects and filters", async () => {
    const exploreCalls: Array<{ projectPath: string; reference: string }> = [];
    const explainCalls: Array<{ projectPath: string; edgeId: string }> = [];
    const searchCalls: Array<{
      projectPath: string;
      query: string;
      options: { limit?: number; pathPrefix?: string; language?: "typescript" | "javascript" };
    }> = [];
    const service = {
      async explore(projectPath: string, reference: string): Promise<ExploreResult> {
        exploreCalls.push({ projectPath, reference });
        return exploreResult();
      },
      async search(
        projectPath: string,
        query: string,
        options: { limit?: number; pathPrefix?: string; language?: "typescript" | "javascript" } = {}
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
        language: "typescript"
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
        options: { limit: 7, pathPrefix: "src/", language: "typescript" }
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

  it("keeps the v0.1 explore-only embedding contract usable", async () => {
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
      async search(): Promise<SearchResult> {
        return searchResult();
      },
      async explainEdge(): Promise<ExplainEdgeResult> {
        return explainEdgeResult();
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
    await runSearchTool(service, "C:/project", { query: "user" });
    await runExplainEdgeTool(service, "C:/project", { edgeId: "edge:caller-callee" });

    expect(mutationCalls).toEqual([]);
  });
});

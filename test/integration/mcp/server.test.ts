import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  SymbolLatticeError,
  type ExplainEdgeResult,
  type ExploreResult
} from "../../../src/application/index.js";
import { createMcpServer, runExplainEdgeTool, runExploreTool } from "../../../src/mcp/index.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

function exploreResult(): ExploreResult {
  return {
    status: {
      initialized: true,
      stale: false,
      projectPath: "C:/project",
      indexedAt: "2026-07-29T00:00:00.000Z",
      generationId: "generation:test",
      counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
    },
    match: { status: "not_found", reference: "missing", candidates: [] },
    source: null,
    callers: [],
    callees: [],
    impact: []
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
  it("exposes read-only exploration and evidence tools and forwards their projects", async () => {
    const exploreCalls: Array<{ projectPath: string; reference: string }> = [];
    const explainCalls: Array<{ projectPath: string; edgeId: string }> = [];
    const service = {
      async explore(projectPath: string, reference: string): Promise<ExploreResult> {
        exploreCalls.push({ projectPath, reference });
        return exploreResult();
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
      "symbol_lattice_explain_edge"
    ]);

    const result = await client.callTool({
      name: "symbol_lattice_explore",
      arguments: { query: "missing", projectPath: "C:/chosen-project" }
    });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(exploreCalls).toEqual([{ projectPath: "C:/chosen-project", reference: "missing" }]);

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

  it("returns actionable tool errors without indexing", async () => {
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
});

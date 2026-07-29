import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeError, type ExploreResult } from "../../../src/application/index.js";
import { createMcpServer, runExploreTool } from "../../../src/mcp/index.js";

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
      counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
    },
    match: { status: "not_found", reference: "missing", candidates: [] },
    source: null,
    callers: [],
    callees: [],
    impact: []
  };
}

describe("SymbolLattice MCP server", () => {
  it("exposes only the read-only exploration tool and forwards its project", async () => {
    const calls: Array<{ projectPath: string; reference: string }> = [];
    const service = {
      async explore(projectPath: string, reference: string): Promise<ExploreResult> {
        calls.push({ projectPath, reference });
        return exploreResult();
      }
    };
    const server = createMcpServer(service, "C:/default-project");
    const client = new Client({ name: "symbol-lattice-test", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(() => client.close(), () => server.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["symbol_lattice_explore"]);

    const result = await client.callTool({
      name: "symbol_lattice_explore",
      arguments: { query: "missing", projectPath: "C:/chosen-project" }
    });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(calls).toEqual([{ projectPath: "C:/chosen-project", reference: "missing" }]);
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
});

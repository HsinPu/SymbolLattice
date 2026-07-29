import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SymbolLatticeError } from "../application/errors.js";
import type { ExploreResult } from "../application/types.js";

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
}

export interface ExploreToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
}

export interface ExploreToolResponse {
  readonly [key: string]: unknown;
  readonly content: {
    type: "text";
    text: string;
  }[];
  readonly isError?: boolean;
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
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
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
}

export function createMcpServer(
  service: ExploreService,
  defaultProjectPath: string
): McpServer {
  const server = new McpServer({ name: "symbol-lattice", version: "0.1.0" });

  server.registerTool(
    "symbol_lattice_explore",
    {
      title: "Explore a SymbolLattice code graph",
      description:
        "Returns source evidence, direct callers/callees, impact paths, and index freshness from an existing local SymbolLattice index. This tool never creates or refreshes an index.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Symbol qualified name, simple name, or relative path:line reference."),
        projectPath: z.string().trim().min(1).optional().describe("Optional path to an already indexed project.")
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true
      }
    },
    async (arguments_) => runExploreTool(service, defaultProjectPath, arguments_)
  );

  return server;
}

export async function serveMcp(
  service: ExploreService,
  defaultProjectPath: string
): Promise<void> {
  const server = createMcpServer(service, defaultProjectPath);
  await server.connect(new StdioServerTransport());
}

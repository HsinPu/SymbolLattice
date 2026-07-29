import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SymbolLatticeError } from "../application/errors.js";
import type { ExplainEdgeResult, ExploreResult } from "../application/types.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
}

export interface ExplainEdgeService {
  explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult>;
}

export type ReadOnlyMcpService = ExploreService & ExplainEdgeService;

export interface ExploreToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
}

export interface ExplainEdgeToolArguments {
  readonly edgeId: string;
  readonly projectPath?: string | undefined;
}

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
export type ExplainEdgeToolResponse = ReadOnlyToolResponse;

function supportsExplainEdge(service: ExploreService): service is ReadOnlyMcpService {
  return "explainEdge" in service && typeof service.explainEdge === "function";
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
  defaultProjectPath: string
): McpServer {
  const server = new McpServer({ name: "symbol-lattice", version: SYMBOL_LATTICE_VERSION });

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
      async (arguments_) => runExplainEdgeTool(explainEdgeService, defaultProjectPath, arguments_)
    );
  }

  return server;
}

export async function serveMcp(
  service: ExploreService,
  defaultProjectPath: string
): Promise<void> {
  const server = createMcpServer(service, defaultProjectPath);
  await server.connect(new StdioServerTransport());
}

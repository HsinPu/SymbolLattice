import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SymbolLatticeError } from "../application/errors.js";
import type {
  ExplainEdgeResult,
  ExploreResult,
  SearchOptions,
  SearchResult
} from "../application/types.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
}

export interface ExplainEdgeService {
  explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult>;
}

/** Minimal retrieval seam so existing explore-only embeddings remain usable. */
export interface SearchService {
  search(projectPath: string, query: string, options?: SearchOptions): Promise<SearchResult>;
}

export type ReadOnlyMcpService = ExploreService & ExplainEdgeService;
export type SearchMcpService = ExploreService & SearchService;

export interface ExploreToolArguments {
  readonly query: string;
  readonly projectPath?: string | undefined;
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
  readonly language?: "typescript" | "javascript" | undefined;
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
export type SearchToolResponse = ReadOnlyToolResponse;

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

const exploreOutputSchema = z
  .object({
    status: indexStatusOutputSchema,
    match: z.object({}).passthrough(),
    source: sourceExcerptOutputSchema.nullable(),
    callers: z.array(z.object({}).passthrough()),
    callees: z.array(z.object({}).passthrough()),
    impact: z.array(z.object({}).passthrough())
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
          language: z.enum(["typescript", "javascript"]),
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

function supportsExplainEdge(service: ExploreService): service is ReadOnlyMcpService {
  return "explainEdge" in service && typeof service.explainEdge === "function";
}

function supportsSearch(service: ExploreService): service is SearchMcpService {
  return "search" in service && typeof service.search === "function";
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
      outputSchema: exploreOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true
      }
    },
    async (arguments_) => runExploreTool(service, defaultProjectPath, arguments_)
  );

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
          language: z.enum(["typescript", "javascript"]).optional().describe("Optional indexed source language filter.")
        },
        outputSchema: searchOutputSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true
        }
      },
      async (arguments_) => runSearchTool(searchService, defaultProjectPath, arguments_)
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

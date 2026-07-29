import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SymbolLatticeError } from "../application/errors.js";
import {
  MAX_AFFECTED_CHANGED_FILES,
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_REFERENCES,
  MAX_CONTEXT_RELATION_LIMIT
} from "../application/types.js";
import type {
  AffectedTestsOptions,
  AffectedTestsResult,
  ContextOptions,
  ContextResult,
  ExplainEdgeResult,
  ExploreResult,
  GitAffectedTestsOptions,
  GitAffectedTestsResult,
  SearchOptions,
  SearchResult
} from "../application/types.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";

export interface ExploreService {
  explore(projectPath: string, reference: string): Promise<ExploreResult>;
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

export interface ExplainEdgeService {
  explainEdge(projectPath: string, edgeId: string): Promise<ExplainEdgeResult>;
}

/** Minimal retrieval seam so existing explore-only embeddings remain usable. */
export interface SearchService {
  search(projectPath: string, query: string, options?: SearchOptions): Promise<SearchResult>;
}

export type ReadOnlyMcpService = ExploreService & ExplainEdgeService;
export type SearchMcpService = ExploreService & SearchService;
export type ContextMcpService = ExploreService & ContextService;
export type AffectedTestsMcpService = ExploreService & AffectedTestsService;
export type GitAffectedTestsMcpService = ExploreService & GitAffectedTestsService;

export interface ExploreToolArguments {
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
export type ContextToolResponse = ReadOnlyToolResponse;
export type AffectedTestsToolResponse = ReadOnlyToolResponse;
export type GitAffectedTestsToolResponse = ReadOnlyToolResponse;
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

function supportsContext(service: ExploreService): service is ContextMcpService {
  return "context" in service && typeof service.context === "function";
}

function supportsAffectedTests(service: ExploreService): service is AffectedTestsMcpService {
  return "affectedTests" in service && typeof service.affectedTests === "function";
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
    async (arguments_) => runExploreTool(service, defaultProjectPath, arguments_)
  );

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
            .describe("Maximum directed call/import hops in each adjacent-reference evidence path."),
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
      async (arguments_) => runContextTool(contextService, defaultProjectPath, arguments_)
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
      async (arguments_) => runAffectedTestsTool(affectedTestsService, defaultProjectPath, arguments_)
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
      async (arguments_) => runGitAffectedTestsTool(gitAffectedTestsService, defaultProjectPath, arguments_)
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

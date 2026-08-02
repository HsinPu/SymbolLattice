import { parentPort, workerData } from "node:worker_threads";

import { SymbolLatticeService } from "../application/service.js";
import { FileSystemSourceCatalog } from "../infrastructure/filesystem/index.js";
import { FileSystemGitChangeSetProvider } from "../infrastructure/git/index.js";
import { SqliteGraphStore } from "../infrastructure/sqlite/index.js";
import {
  runAffectedTestsTool,
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
  type AffectedTestsToolArguments,
  type ContextToolArguments,
  type EntrypointsToolArguments,
  type ExplainEdgeToolArguments,
  type ExploreToolArguments,
  type GenerationDiffToolArguments,
  type GenerationHistoryToolArguments,
  type GitAffectedTestsToolArguments,
  type GitHunksToolArguments,
  type HierarchyToolArguments,
  type ImpactToolArguments,
  type InvestigateToolArguments,
  type NodeToolArguments,
  type ReadOnlyToolResponse,
  type RoutesToolArguments,
  type SearchToolArguments
} from "./server.js";
import {
  isMcpReadToolName,
  type McpReadToolName,
  type McpReadWorkerRequest
} from "./read-query-protocol.js";

interface WorkerConfiguration {
  readonly defaultProjectPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workerConfiguration(value: unknown): WorkerConfiguration | null {
  if (!isRecord(value) || typeof value.defaultProjectPath !== "string" || value.defaultProjectPath.length === 0) {
    return null;
  }

  return { defaultProjectPath: value.defaultProjectPath };
}

function isWorkerRequest(value: unknown): value is McpReadWorkerRequest {
  return (
    isRecord(value) &&
    value.type === "execute" &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    isMcpReadToolName(value.toolName)
  );
}

function errorResponse(message: string): ReadOnlyToolResponse {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

function createReadOnlyService(defaultProjectPath: string): {
  readonly service: SymbolLatticeService;
  readonly close: () => void;
} {
  const gitChangeSetProvider = new FileSystemGitChangeSetProvider();
  const graphStore = new SqliteGraphStore({
    persistentReadProjectPath: defaultProjectPath,
    readOnly: true
  });
  return {
    service: new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      undefined,
      gitChangeSetProvider,
      gitChangeSetProvider
    ),
    close: () => graphStore.close()
  };
}

async function execute(
  service: SymbolLatticeService,
  defaultProjectPath: string,
  toolName: McpReadToolName,
  arguments_: unknown
): Promise<ReadOnlyToolResponse> {
  switch (toolName) {
    case "explore":
      return runExploreTool(service, defaultProjectPath, arguments_ as ExploreToolArguments);
    case "node":
      return runNodeTool(service, defaultProjectPath, arguments_ as NodeToolArguments);
    case "context":
      return runContextTool(service, defaultProjectPath, arguments_ as ContextToolArguments);
    case "affected-tests":
      return runAffectedTestsTool(service, defaultProjectPath, arguments_ as AffectedTestsToolArguments);
    case "git-affected-tests":
      return runGitAffectedTestsTool(service, defaultProjectPath, arguments_ as GitAffectedTestsToolArguments);
    case "git-hunks":
      return runGitHunksTool(service, defaultProjectPath, arguments_ as GitHunksToolArguments);
    case "search":
      return runSearchTool(service, defaultProjectPath, arguments_ as SearchToolArguments);
    case "investigate":
      return runInvestigateTool(service, defaultProjectPath, arguments_ as InvestigateToolArguments);
    case "impact":
      return runImpactTool(service, defaultProjectPath, arguments_ as ImpactToolArguments);
    case "routes":
      return runRoutesTool(service, defaultProjectPath, arguments_ as RoutesToolArguments);
    case "entrypoints":
      return runEntrypointsTool(service, defaultProjectPath, arguments_ as EntrypointsToolArguments);
    case "hierarchy":
      return runHierarchyTool(service, defaultProjectPath, arguments_ as HierarchyToolArguments);
    case "generation-history":
      return runGenerationHistoryTool(service, defaultProjectPath, arguments_ as GenerationHistoryToolArguments);
    case "generation-diff":
      return runGenerationDiffTool(service, defaultProjectPath, arguments_ as GenerationDiffToolArguments);
    case "explain-edge":
      return runExplainEdgeTool(service, defaultProjectPath, arguments_ as ExplainEdgeToolArguments);
  }
}

if (parentPort !== null) {
  const port = parentPort;
  const configuration = workerConfiguration(workerData);
  let service: SymbolLatticeService | null = null;
  let closeReadStore: (() => void) | null = null;
  let initializationError: string | null = null;

  try {
    if (configuration === null) {
      throw new Error("Missing MCP worker default project path.");
    }
    const readOnlyService = createReadOnlyService(configuration.defaultProjectPath);
    service = readOnlyService.service;
    closeReadStore = readOnlyService.close;
  } catch (error) {
    initializationError = error instanceof Error ? error.message : String(error);
  }

  process.once("exit", () => {
    try {
      closeReadStore?.();
    } catch {
      // Worker teardown still releases the OS handle if SQLite is already closing.
    }
  });

  port.postMessage(
    initializationError === null
      ? { type: "ready", ok: true }
      : { type: "ready", ok: false, error: initializationError }
  );

  port.on("message", (message: unknown) => {
    if (!isWorkerRequest(message)) {
      return;
    }

    void (async (): Promise<void> => {
      const response =
        service === null || configuration === null
          ? errorResponse(`SymbolLattice MCP query worker is unavailable: ${initializationError ?? "unknown error"}`)
          : await execute(service, configuration.defaultProjectPath, message.toolName, message.arguments_);
      port.postMessage({ type: "result", id: message.id, response });
    })().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      port.postMessage({
        type: "result",
        id: message.id,
        response: errorResponse(`SymbolLattice MCP query worker failed: ${detail}`)
      });
    });
  });
}

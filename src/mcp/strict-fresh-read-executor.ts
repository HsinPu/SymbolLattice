import { resolve } from "node:path";

import type { ReadQueryFreshnessReceipt } from "../application/index.js";
import { SymbolLatticeError } from "../application/errors.js";
import {
  isMcpLiveReadToolName,
  type McpReadToolName
} from "./read-query-protocol.js";
import type { McpReadQueryExecutor } from "./read-query-pool.js";
import type { ReadOnlyToolResponse } from "./server.js";

export interface StrictFreshReadExecutionCoordinator {
  execute<Result>(
    projectPath: string,
    query: (receipt: ReadQueryFreshnessReceipt) => Promise<Result>
  ): Promise<Result>;
}

/** Applies strict freshness around both worker dispatch and host fallback. */
export class StrictFreshMcpReadExecutor implements McpReadQueryExecutor {
  public constructor(
    private readonly delegate: McpReadQueryExecutor,
    private readonly coordinator: StrictFreshReadExecutionCoordinator,
    private readonly defaultProjectPath: string
  ) {}

  public execute<Response extends ReadOnlyToolResponse>(
    toolName: McpReadToolName,
    arguments_: unknown,
    fallback: () => Promise<Response>,
    freshnessReceipt?: ReadQueryFreshnessReceipt
  ): Promise<Response> {
    if (!isMcpLiveReadToolName(toolName)) {
      return this.delegate.execute(toolName, arguments_, fallback, freshnessReceipt);
    }
    const projectPath = liveReadProjectPath(arguments_, this.defaultProjectPath);
    return this.coordinator
      .execute(projectPath, (receipt) =>
        this.delegate.execute(toolName, arguments_, fallback, receipt)
      )
      .catch((error: unknown) => strictFreshnessErrorResponse<Response>(error));
  }
}

function strictFreshnessErrorResponse<Response extends ReadOnlyToolResponse>(error: unknown): Response {
  const code = error instanceof SymbolLatticeError ? error.code : "UNEXPECTED_ERROR";
  const message = error instanceof Error ? error.message : "Unknown strict freshness failure.";
  const operationId =
    typeof error === "object" && error !== null && "operationId" in error &&
    typeof error.operationId === "string"
      ? ` [operation ${error.operationId}]`
      : "";
  return {
    content: [{ type: "text", text: `${code}: ${message}${operationId}` }],
    isError: true
  } as Response;
}

/** Keeps immutable tools usable while rejecting uncoordinated live reads. */
export class FailClosedLiveMcpReadExecutor implements McpReadQueryExecutor {
  public constructor(private readonly delegate: McpReadQueryExecutor) {}

  public execute<Response extends ReadOnlyToolResponse>(
    toolName: McpReadToolName,
    arguments_: unknown,
    fallback: () => Promise<Response>,
    freshnessReceipt?: ReadQueryFreshnessReceipt
  ): Promise<Response> {
    if (!isMcpLiveReadToolName(toolName)) {
      return this.delegate.execute(toolName, arguments_, fallback, freshnessReceipt);
    }
    return Promise.resolve({
      content: [{
        type: "text",
        text: "FRESH_INDEX_REQUIRED: This MCP server has no strict freshness coordinator; no live query result was returned."
      }],
      isError: true
    } as Response);
  }
}

function liveReadProjectPath(arguments_: unknown, defaultProjectPath: string): string {
  if (
    typeof arguments_ === "object" &&
    arguments_ !== null &&
    !Array.isArray(arguments_) &&
    "projectPath" in arguments_ &&
    typeof arguments_.projectPath === "string" &&
    arguments_.projectPath.trim().length > 0
  ) {
    return resolve(arguments_.projectPath);
  }
  return resolve(defaultProjectPath);
}

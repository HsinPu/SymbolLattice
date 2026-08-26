/** Read-only MCP operations that may run outside the transport event loop. */
export const MCP_READ_TOOL_NAMES = [
  "explore",
  "node",
  "context",
  "affected-tests",
  "git-affected-tests",
  "git-hunks",
  "search",
  "investigate",
  "impact",
  "files",
  "file-view",
  "routes",
  "entrypoints",
  "hierarchy",
  "generation-history",
  "generation-diff",
  "explain-edge"
] as const;

export const MCP_LIVE_READ_TOOL_NAMES = MCP_READ_TOOL_NAMES.filter(
  (name) => name !== "generation-history" && name !== "generation-diff"
);

export type McpReadToolName = (typeof MCP_READ_TOOL_NAMES)[number];

export interface McpReadWorkerRequest {
  readonly type: "execute";
  readonly id: number;
  readonly toolName: McpReadToolName;
  readonly arguments_: unknown;
  readonly freshnessReceipt?: ReadQueryFreshnessReceipt | undefined;
}

export interface McpReadWorkerReadyMessage {
  readonly type: "ready";
  readonly ok: boolean;
  readonly error?: string | undefined;
}

export interface McpReadWorkerResultMessage {
  readonly type: "result";
  readonly id: number;
  readonly response: unknown;
  readonly retryReason?: "generation-mismatch" | undefined;
  readonly fallbackReason?: "host-only" | undefined;
}

export type McpReadWorkerMessage = McpReadWorkerReadyMessage | McpReadWorkerResultMessage;

export function isMcpReadToolName(value: unknown): value is McpReadToolName {
  return typeof value === "string" && MCP_READ_TOOL_NAMES.includes(value as McpReadToolName);
}

export function isMcpLiveReadToolName(value: McpReadToolName): boolean {
  return MCP_LIVE_READ_TOOL_NAMES.includes(value as (typeof MCP_LIVE_READ_TOOL_NAMES)[number]);
}
import type { ReadQueryFreshnessReceipt } from "../application/read-query-freshness.js";

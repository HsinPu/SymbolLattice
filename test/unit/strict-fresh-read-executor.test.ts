import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  FailClosedLiveMcpReadExecutor,
  StrictFreshMcpReadExecutor
} from "../../src/mcp/index.js";
import type { McpReadQueryExecutor } from "../../src/mcp/read-query-pool.js";
import type { ReadQueryFreshnessReceipt } from "../../src/application/index.js";

const response = { content: [{ type: "text" as const, text: "ok" }] };

describe("StrictFreshMcpReadExecutor", () => {
  it("gates live reads and forwards the project-bound receipt to the pool", async () => {
    const receipt: ReadQueryFreshnessReceipt = {
      policy: "strict-fresh-read-v1",
      verificationId: "verification:test",
      verifiedAt: "2026-08-26T00:00:00.000Z",
      projectPath: resolve("C:/chosen"),
      expectedGenerationId: "generation:test",
      freshnessVerified: true
    };
    const delegate: McpReadQueryExecutor = { execute: vi.fn(async () => response) };
    const coordinator = { execute: vi.fn(async (_path: string, query: (value: ReadQueryFreshnessReceipt) => Promise<unknown>) => query(receipt)) };
    const executor = new StrictFreshMcpReadExecutor(delegate, coordinator, "C:/default");

    await expect(executor.execute("search", { query: "x", projectPath: "C:/chosen" }, async () => response)).resolves.toEqual(response);
    expect(coordinator.execute).toHaveBeenCalledWith(resolve("C:/chosen"), expect.any(Function));
    expect(delegate.execute).toHaveBeenCalledWith("search", { query: "x", projectPath: "C:/chosen" }, expect.any(Function), receipt);
  });

  it("keeps immutable history and diff reads outside the live freshness gate", async () => {
    const delegate: McpReadQueryExecutor = { execute: vi.fn(async () => response) };
    const coordinator = { execute: vi.fn() };
    const executor = new StrictFreshMcpReadExecutor(delegate, coordinator, "C:/default");

    await executor.execute("generation-history", {}, async () => response);
    await executor.execute("generation-diff", { fromGenerationId: "generation:a" }, async () => response);
    expect(coordinator.execute).not.toHaveBeenCalled();
    expect(delegate.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects live reads when a pool has no coordinator", async () => {
    const delegate: McpReadQueryExecutor = { execute: vi.fn(async () => response) };
    const executor = new FailClosedLiveMcpReadExecutor(delegate);

    await expect(executor.execute("explore", { query: "x" }, async () => response)).resolves.toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining("FRESH_INDEX_REQUIRED") }]
    });
    await executor.execute("generation-history", {}, async () => response);
    expect(delegate.execute).toHaveBeenCalledOnce();
  });

  it("renders coordinator failures through the existing MCP error shape", async () => {
    const delegate: McpReadQueryExecutor = { execute: vi.fn(async () => response) };
    const coordinator = {
      execute: vi.fn(async () => {
        throw Object.assign(new Error("sync required"), { code: "FRESH_INDEX_REQUIRED" });
      })
    };
    const executor = new StrictFreshMcpReadExecutor(delegate, coordinator, "C:/default");

    await expect(executor.execute("search", { query: "x" }, async () => response)).resolves.toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining("UNEXPECTED_ERROR: sync required") }]
    });
    expect(delegate.execute).not.toHaveBeenCalled();
  });
});

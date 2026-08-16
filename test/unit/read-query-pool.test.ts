import { describe, expect, it, vi } from "vitest";

import type { ReadOnlyToolResponse } from "../../src/mcp/server.js";
import {
  MAX_MCP_READ_QUERY_WORKERS,
  McpReadQueryPool,
  resolveMcpReadQueryPoolSize,
  type McpReadQueryWorker
} from "../../src/mcp/index.js";
import type { McpReadWorkerRequest } from "../../src/mcp/read-query-protocol.js";

class FakeQueryWorker implements McpReadQueryWorker {
  public readonly requests: McpReadWorkerRequest[] = [];
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly exitListeners = new Set<(code: number) => void>();
  public terminated = false;

  public postMessage(message: McpReadWorkerRequest): void {
    this.requests.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public on(event: "message", listener: (message: unknown) => void): void;
  public on(event: "error", listener: (error: Error) => void): void;
  public on(event: "exit", listener: (code: number) => void): void;
  public on(
    event: "message" | "error" | "exit",
    listener: ((message: unknown) => void) | ((error: Error) => void) | ((code: number) => void)
  ): void {
    if (event === "message") {
      this.messageListeners.add(listener as (message: unknown) => void);
      return;
    }
    if (event === "error") {
      this.errorListeners.add(listener as (error: Error) => void);
      return;
    }
    this.exitListeners.add(listener as (code: number) => void);
  }

  public ready(): void {
    this.emitMessage({ type: "ready", ok: true });
  }

  public respond(request: McpReadWorkerRequest, response: ReadOnlyToolResponse): void {
    this.emitMessage({ type: "result", id: request.id, response });
  }

  public exit(code: number): void {
    for (const listener of this.exitListeners) {
      listener(code);
    }
  }

  private emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

function response(text: string): ReadOnlyToolResponse {
  return { content: [{ type: "text", text }] };
}

describe("McpReadQueryPool", () => {
  it("uses a conservative process-aware size and ignores malformed overrides", () => {
    expect(MAX_MCP_READ_QUERY_WORKERS).toBe(8);
    expect(resolveMcpReadQueryPoolSize({}, 1)).toBe(1);
    expect(resolveMcpReadQueryPoolSize({}, 32)).toBe(MAX_MCP_READ_QUERY_WORKERS);
    expect(resolveMcpReadQueryPoolSize({ SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "2" }, 32)).toBe(2);
    expect(resolveMcpReadQueryPoolSize({ SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "8" }, 32)).toBe(8);
    expect(resolveMcpReadQueryPoolSize({ SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "0" }, 32)).toBe(
      MAX_MCP_READ_QUERY_WORKERS
    );
    expect(resolveMcpReadQueryPoolSize({ SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "eight" }, 32)).toBe(
      MAX_MCP_READ_QUERY_WORKERS
    );
    expect(resolveMcpReadQueryPoolSize({ SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "9" }, 32)).toBe(
      MAX_MCP_READ_QUERY_WORKERS
    );
  });

  it("clamps an injected worker count to the eight-worker host ceiling", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      size: MAX_MCP_READ_QUERY_WORKERS + 1,
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });

    expect(pool.queryPoolStatus()).toMatchObject({
      capacity: MAX_MCP_READ_QUERY_WORKERS,
      workers: { live: 1, pending: 1 }
    });
    expect(workers).toHaveLength(1);
    await pool.close();
  });

  it("expands to all eight slots when queued work needs every worker", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      size: MAX_MCP_READ_QUERY_WORKERS,
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });

    workers[0]?.ready();
    const pending = Array.from({ length: MAX_MCP_READ_QUERY_WORKERS }, (_, index) =>
      pool.execute("search", { query: "queued-" + index }, async () => response("fallback"))
    );

    expect(workers).toHaveLength(2);
    expect(pool.queryPoolStatus().workers.pending).toBe(1);

    for (let index = 1; index < MAX_MCP_READ_QUERY_WORKERS; index += 1) {
      const worker = workers[index];
      if (worker === undefined) {
        throw new Error("Expected queued work to spawn the next worker slot.");
      }
      worker.ready();
    }

    expect(workers).toHaveLength(MAX_MCP_READ_QUERY_WORKERS);
    expect(pool.queryPoolStatus()).toMatchObject({
      capacity: MAX_MCP_READ_QUERY_WORKERS,
      workers: { live: MAX_MCP_READ_QUERY_WORKERS, pending: 0, idle: 0 },
      requests: { inflight: MAX_MCP_READ_QUERY_WORKERS, queued: 0 }
    });

    await pool.close();
    await expect(Promise.all(pending)).resolves.toHaveLength(MAX_MCP_READ_QUERY_WORKERS);
  });

  it("reports a redacted health snapshot with no project or query content", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/private-project",
      size: 2,
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });

    expect(pool.queryPoolStatus()).toEqual({
      state: "warming",
      capacity: 2,
      workers: { live: 1, pending: 1, idle: 0, crashes: 0 },
      requests: { inflight: 0, queued: 0 },
      fallbacks: {
        coldStart: 0,
        unavailable: 0,
        queueTimeout: 0,
        workerFailure: 0,
        invalidWorkerResponse: 0,
        unsupportedTool: 0,
        total: 0
      }
    });

    await pool.execute("explore", { query: "privateSymbol" }, async () => response("fallback"));
    expect(pool.queryPoolStatus().fallbacks).toMatchObject({ coldStart: 1, total: 1 });
    expect(JSON.stringify(pool.queryPoolStatus())).not.toContain("private");

    const worker = workers[0];
    worker?.ready();
    const pending = pool.execute("search", { query: "active" }, async () => response("fallback-active"));
    expect(pool.queryPoolStatus()).toMatchObject({
      state: "ready",
      requests: { inflight: 1, queued: 0 }
    });
    const request = worker?.requests[0];
    if (request === undefined) {
      throw new Error("Expected the ready worker to receive a request.");
    }
    worker?.respond(request, response("active"));
    await expect(pending).resolves.toEqual(response("active"));
    await pool.close();
  });

  it("uses the existing handler until the eager worker has warmed", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });
    let fallbackCalls = 0;

    await expect(
      pool.execute("explore", { query: "App" }, async () => {
        fallbackCalls += 1;
        return response("fallback");
      })
    ).resolves.toEqual(response("fallback"));

    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests).toEqual([]);
    expect(fallbackCalls).toBe(1);
    await pool.close();
  });

  it("grows only for queued work and dispatches each request to one ready worker", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      size: 2,
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });
    const firstWorker = workers[0];
    expect(firstWorker).toBeDefined();
    firstWorker?.ready();

    const first = pool.execute("search", { query: "first" }, async () => response("fallback-first"));
    const firstRequest = firstWorker?.requests[0];
    expect(firstRequest?.toolName).toBe("search");

    const second = pool.execute("investigate", { query: "second" }, async () => response("fallback-second"));
    expect(workers).toHaveLength(2);
    const secondWorker = workers[1];
    secondWorker?.ready();
    const secondRequest = secondWorker?.requests[0];
    expect(secondRequest?.toolName).toBe("investigate");

    if (firstRequest === undefined || secondRequest === undefined) {
      throw new Error("Expected both query requests to be dispatched.");
    }
    firstWorker?.respond(firstRequest, response("first"));
    secondWorker?.respond(secondRequest, response("second"));

    await expect(first).resolves.toEqual(response("first"));
    await expect(second).resolves.toEqual(response("second"));
    await pool.close();
  });

  it("retries a request on a replacement worker after one crash", async () => {
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });
    const firstWorker = workers[0];
    firstWorker?.ready();
    let fallbackCalls = 0;
    const pending = pool.execute("explore", { query: "App" }, async () => {
      fallbackCalls += 1;
      return response("fallback");
    });

    firstWorker?.exit(13);
    expect(workers).toHaveLength(2);
    expect(pool.queryPoolStatus()).toMatchObject({
      state: "recovering",
      workers: { crashes: 1, pending: 1 }
    });
    const replacement = workers[1];
    replacement?.ready();
    const retriedRequest = replacement?.requests[0];
    expect(retriedRequest?.toolName).toBe("explore");
    if (retriedRequest === undefined) {
      throw new Error("Expected the crashed request to be retried.");
    }
    replacement?.respond(retriedRequest, response("retried"));

    await expect(pending).resolves.toEqual(response("retried"));
    expect(fallbackCalls).toBe(0);
    await pool.close();
  });

  it("falls back after a bounded worker wait instead of leaving a request stuck", async () => {
    vi.useFakeTimers();
    const workers: FakeQueryWorker[] = [];
    const pool = new McpReadQueryPool({
      defaultProjectPath: "C:/project",
      queueTimeoutMs: 25,
      createWorker: () => {
        const worker = new FakeQueryWorker();
        workers.push(worker);
        return worker;
      }
    });

    try {
      workers[0]?.ready();
      let fallbackCalls = 0;
      const pending = pool.execute("search", { query: "slow" }, async () => {
        fallbackCalls += 1;
        return response("fallback-after-wait");
      });
      expect(workers[0]?.requests).toHaveLength(1);
      const timedOutRequest = workers[0]?.requests[0];
      if (timedOutRequest === undefined) {
        throw new Error("Expected the worker to receive the timed request.");
      }

      await vi.advanceTimersByTimeAsync(25);

      await expect(pending).resolves.toEqual(response("fallback-after-wait"));
      expect(fallbackCalls).toBe(1);
      expect(pool.queryPoolStatus()).toMatchObject({
        requests: { inflight: 1, queued: 0 },
        fallbacks: { queueTimeout: 1, total: 1 }
      });

      workers[0]?.respond(timedOutRequest, response("late-worker-result"));
      await Promise.resolve();
      expect(fallbackCalls).toBe(1);
      expect(pool.queryPoolStatus().requests).toEqual({ inflight: 0, queued: 0 });
    } finally {
      await pool.close();
      vi.useRealTimers();
    }
  });
});

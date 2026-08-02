import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { ReadOnlyToolResponse } from "./server.js";
import { isMcpReadToolName } from "./read-query-protocol.js";
import type {
  McpReadToolName,
  McpReadWorkerMessage,
  McpReadWorkerRequest
} from "./read-query-protocol.js";

/** A deliberately conservative cap protects memory on long-lived MCP hosts. */
export const MAX_MCP_READ_QUERY_WORKERS = 8;
export const DEFAULT_MCP_READ_QUERY_QUEUE_TIMEOUT_MS = 45_000;
export const MCP_READ_QUERY_POOL_STATES = [
  "warming",
  "ready",
  "recovering",
  "degraded",
  "closed"
] as const;

export type McpReadQueryPoolState = (typeof MCP_READ_QUERY_POOL_STATES)[number];

export interface McpReadQueryFallbacks {
  readonly coldStart: number;
  readonly unavailable: number;
  readonly queueTimeout: number;
  readonly workerFailure: number;
  readonly invalidWorkerResponse: number;
  readonly unsupportedTool: number;
  readonly total: number;
}

export interface McpReadQueryPoolDiagnostics {
  readonly state: McpReadQueryPoolState;
  readonly capacity: number;
  readonly workers: {
    readonly live: number;
    readonly pending: number;
    readonly idle: number;
    readonly crashes: number;
  };
  /** Worker work only; a timed-out request may remain in flight until its worker returns. */
  readonly requests: {
    readonly inflight: number;
    readonly queued: number;
  };
  readonly fallbacks: McpReadQueryFallbacks;
}

export interface McpReadQueryPoolStatusService {
  queryPoolStatus(): McpReadQueryPoolDiagnostics;
}

const MAX_MCP_READ_QUERY_WORKER_CRASHES = 4;
const MAX_MCP_READ_QUERY_RETRIES = 1;
const MAX_MCP_READ_QUERY_CONCURRENT_SPAWNS = 2;

type McpReadQueryFallbackReason = Exclude<keyof McpReadQueryFallbacks, "total">;

export interface McpReadQueryWorker {
  postMessage(message: McpReadWorkerRequest): void;
  terminate(): Promise<number> | void;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
}

export interface McpReadQueryExecutor {
  execute<TResponse extends ReadOnlyToolResponse>(
    toolName: McpReadToolName,
    arguments_: unknown,
    fallback: () => Promise<TResponse>
  ): Promise<TResponse>;
}

export interface McpReadQueryPoolOptions {
  /** Default project path passed to worker-side read-only tool handlers. */
  readonly defaultProjectPath: string;
  /** Overrides the bounded worker count. Defaults to the process-aware resolver. */
  readonly size?: number | undefined;
  /** Bounded wait before the existing in-process handler is used as a safe fallback. */
  readonly queueTimeoutMs?: number | undefined;
  /** Injectable worker factory for deterministic pool tests. */
  readonly createWorker?: (() => McpReadQueryWorker) | undefined;
}

interface QueryJob {
  readonly id: number;
  readonly toolName: McpReadToolName;
  readonly arguments_: unknown;
  readonly fallback: () => Promise<ReadOnlyToolResponse>;
  readonly resolve: (response: ReadOnlyToolResponse) => void;
  retries: number;
  settled: boolean;
  fallbackStarted: boolean;
  timer?: NodeJS.Timeout | undefined;
}

function boundedDefaultSize(cpuCount: number): number {
  const available = Number.isFinite(cpuCount) ? Math.trunc(cpuCount) : 1;
  return Math.max(1, Math.min(MAX_MCP_READ_QUERY_WORKERS, Math.max(1, available - 1)));
}

function positiveSafeInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Resolves a safe host-local concurrency value. Invalid environment input is
 * ignored instead of preventing an MCP server from starting.
 */
export function resolveMcpReadQueryPoolSize(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  cpuCount = availableParallelism()
): number {
  const fallback = boundedDefaultSize(cpuCount);
  const raw = environment.SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE?.trim();
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_MCP_READ_QUERY_WORKERS) {
    return fallback;
  }

  return parsed;
}

function responseError(message: string): ReadOnlyToolResponse {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

function isReadOnlyToolResponse(value: unknown): value is ReadOnlyToolResponse {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { content?: unknown }).content)) {
    return false;
  }

  return (value as { content: unknown[] }).content.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string"
  );
}

/**
 * Runs bounded, persisted-graph MCP reads off the transport event loop.
 *
 * It never receives an indexing capability. Before its first worker is ready,
 * when the pool is unavailable, or after a bounded queue wait, it delegates to the
 * existing handler so an unavailable worker cannot make the MCP host unusable.
 */
export class McpReadQueryPool implements McpReadQueryExecutor, McpReadQueryPoolStatusService {
  private readonly maxSize: number;
  private readonly queueTimeoutMs: number;
  private readonly createWorker: () => McpReadQueryWorker;
  private readonly workers = new Set<McpReadQueryWorker>();
  private readonly pendingWorkers = new Set<McpReadQueryWorker>();
  private readonly inflight = new Map<McpReadQueryWorker, QueryJob>();
  private readonly idle: McpReadQueryWorker[] = [];
  private queue: QueryJob[] = [];
  private nextId = 1;
  private totalCrashes = 0;
  private everReady = false;
  private destroyed = false;
  private readonly fallbackCounts: Record<McpReadQueryFallbackReason, number> = {
    coldStart: 0,
    unavailable: 0,
    queueTimeout: 0,
    workerFailure: 0,
    invalidWorkerResponse: 0,
    unsupportedTool: 0
  };

  public constructor(options: McpReadQueryPoolOptions) {
    const requestedSize = positiveSafeInteger(options.size, resolveMcpReadQueryPoolSize());
    this.maxSize = Math.max(
      1,
      Math.min(requestedSize, MAX_MCP_READ_QUERY_WORKERS)
    );
    this.queueTimeoutMs = positiveSafeInteger(
      options.queueTimeoutMs,
      DEFAULT_MCP_READ_QUERY_QUEUE_TIMEOUT_MS
    );
    this.createWorker =
      options.createWorker ??
      (() =>
        new Worker(new URL("./read-query-worker.js", import.meta.url), {
          workerData: { defaultProjectPath: options.defaultProjectPath },
          // `node --input-type=module --eval` is useful for embedders, but that
          // flag is invalid for a file-backed worker entrypoint.
          execArgv: process.execArgv.filter((argument) => !argument.startsWith("--input-type"))
        }));
    this.spawnOne();
  }

  /** At least one worker successfully initialized during this host session. */
  public get ready(): boolean {
    return this.everReady && !this.destroyed;
  }

  /** A bounded crash budget prevents endless respawn loops. */
  public get healthy(): boolean {
    return !this.destroyed && this.totalCrashes < MAX_MCP_READ_QUERY_WORKER_CRASHES;
  }

  /** Visible for deterministic tests and operational embedding checks. */
  public get liveWorkerCount(): number {
    return this.workers.size;
  }

  /** Returns host-local execution counters without exposing any query or project data. */
  public queryPoolStatus(): McpReadQueryPoolDiagnostics {
    const totalFallbacks = Object.values(this.fallbackCounts).reduce((total, count) => total + count, 0);
    return {
      state: this.statusState(),
      capacity: this.maxSize,
      workers: {
        live: this.workers.size,
        pending: this.pendingWorkers.size,
        idle: this.idle.length,
        crashes: this.totalCrashes
      },
      requests: {
        inflight: this.inflight.size,
        queued: this.queue.filter((job) => !job.settled && !job.fallbackStarted).length
      },
      fallbacks: {
        ...this.fallbackCounts,
        total: totalFallbacks
      }
    };
  }

  public execute<TResponse extends ReadOnlyToolResponse>(
    toolName: McpReadToolName,
    arguments_: unknown,
    fallback: () => Promise<TResponse>
  ): Promise<TResponse> {
    if (!isMcpReadToolName(toolName)) {
      return this.fallbackImmediately("unsupportedTool", fallback);
    }
    if (!this.healthy) {
      return this.fallbackImmediately("unavailable", fallback);
    }
    if (!this.ready) {
      this.ensureWarmWorker();
      return this.fallbackImmediately("coldStart", fallback);
    }

    return new Promise<TResponse>((resolve) => {
      const job: QueryJob = {
        id: this.nextId++,
        toolName,
        arguments_,
        fallback: async () => fallback(),
        resolve: (response) => resolve(response as TResponse),
        retries: 0,
        settled: false,
        fallbackStarted: false
      };
      job.timer = setTimeout(() => {
        this.settleWithFallback(job, "queueTimeout");
      }, this.queueTimeoutMs);
      job.timer.unref?.();
      this.queue.push(job);
      this.drain();
    });
  }

  /** Terminates workers and answers any queued callers without a hang. */
  public async close(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    const workers = [...this.workers];
    this.workers.clear();
    this.pendingWorkers.clear();
    this.idle.splice(0);
    for (const job of [...this.inflight.values(), ...this.queue]) {
      this.settle(job, responseError("SymbolLattice MCP query workers are shutting down; retry shortly."));
    }
    this.inflight.clear();
    this.queue = [];
    await Promise.all(
      workers.map((worker) => Promise.resolve(worker.terminate()).catch(() => undefined))
    );
  }

  private ensureWarmWorker(): void {
    if (this.workers.size === 0 && this.healthy) {
      this.spawnOne();
    }
  }

  private spawnOne(): void {
    if (this.destroyed || !this.healthy || this.workers.size >= this.maxSize) {
      return;
    }

    let worker: McpReadQueryWorker;
    try {
      worker = this.createWorker();
    } catch {
      this.totalCrashes += 1;
      return;
    }

    this.workers.add(worker);
    this.pendingWorkers.add(worker);
    worker.on("message", (message) => this.onMessage(worker, message));
    worker.on("error", () => this.onWorkerGone(worker));
    worker.on("exit", () => this.onWorkerGone(worker));
  }

  private onMessage(worker: McpReadQueryWorker, message: unknown): void {
    if (!this.workers.has(worker) || typeof message !== "object" || message === null) {
      return;
    }

    const typed = message as McpReadWorkerMessage;
    if (typed.type === "ready") {
      if (!this.pendingWorkers.has(worker)) {
        return;
      }
      this.pendingWorkers.delete(worker);
      if (!typed.ok) {
        this.onWorkerGone(worker);
        return;
      }

      this.everReady = true;
      this.idle.push(worker);
      this.drain();
      return;
    }

    if (typed.type !== "result") {
      return;
    }

    const job = this.inflight.get(worker);
    if (job === undefined || job.id !== typed.id) {
      return;
    }

    this.inflight.delete(worker);
    this.idle.push(worker);
    if (job.fallbackStarted) {
      this.drain();
      return;
    }
    if (isReadOnlyToolResponse(typed.response)) {
      this.settle(job, typed.response);
    } else {
      this.settleWithFallback(job, "invalidWorkerResponse");
    }
    this.drain();
  }

  private onWorkerGone(worker: McpReadQueryWorker): void {
    if (!this.workers.has(worker)) {
      return;
    }

    this.workers.delete(worker);
    this.pendingWorkers.delete(worker);
    const idleIndex = this.idle.indexOf(worker);
    if (idleIndex >= 0) {
      this.idle.splice(idleIndex, 1);
    }
    this.totalCrashes += 1;
    const job = this.inflight.get(worker);
    this.inflight.delete(worker);
    try {
      void worker.terminate();
    } catch {
      // The worker already exited or could not be terminated.
    }

    if (job !== undefined && !job.fallbackStarted) {
      if (job.retries < MAX_MCP_READ_QUERY_RETRIES && this.healthy) {
        job.retries += 1;
        this.queue.unshift(job);
      } else {
        this.settleWithFallback(job, "workerFailure");
      }
    }

    this.ensureWarmWorker();
    this.drain();
  }

  private drain(): void {
    while (
      this.queue.length > this.idle.length + this.pendingWorkers.size &&
      this.workers.size < this.maxSize &&
      this.pendingWorkers.size < MAX_MCP_READ_QUERY_CONCURRENT_SPAWNS &&
      this.healthy
    ) {
      this.spawnOne();
    }

    while (this.idle.length > 0 && this.queue.length > 0) {
      const job = this.queue.shift();
      if (job === undefined || job.settled || job.fallbackStarted) {
        continue;
      }

      const worker = this.idle.pop();
      if (worker === undefined || !this.workers.has(worker)) {
        continue;
      }

      this.inflight.set(worker, job);
      try {
        worker.postMessage({
          type: "execute",
          id: job.id,
          toolName: job.toolName,
          arguments_: job.arguments_
        });
      } catch {
        this.onWorkerGone(worker);
      }
    }
  }

  private fallbackImmediately<TResponse extends ReadOnlyToolResponse>(
    reason: McpReadQueryFallbackReason,
    fallback: () => Promise<TResponse>
  ): Promise<TResponse> {
    this.fallbackCounts[reason] += 1;
    return fallback();
  }

  private settleWithFallback(job: QueryJob, reason: McpReadQueryFallbackReason): void {
    if (job.settled || job.fallbackStarted) {
      return;
    }

    job.fallbackStarted = true;
    this.fallbackCounts[reason] += 1;
    this.queue = this.queue.filter((queued) => queued !== job);

    void job
      .fallback()
      .then((response) => this.settle(job, response))
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.settle(job, responseError(`SymbolLattice MCP query fallback failed: ${detail}`));
      });
  }

  private settle(job: QueryJob, response: ReadOnlyToolResponse): void {
    if (job.settled) {
      return;
    }

    job.settled = true;
    if (job.timer !== undefined) {
      clearTimeout(job.timer);
    }
    job.resolve(response);
  }

  private statusState(): McpReadQueryPoolState {
    if (this.destroyed) {
      return "closed";
    }
    if (!this.healthy) {
      return "degraded";
    }
    if (!this.everReady) {
      return "warming";
    }
    if (
      this.workers.size > 0 &&
      this.pendingWorkers.size === this.workers.size &&
      this.inflight.size === 0
    ) {
      return "recovering";
    }
    return "ready";
  }
}

import type { IndexWork } from "../domain/index-work.js";
import type { IndexStatus } from "../domain/types.js";

import { SymbolLatticeError } from "./errors.js";
import type { IndexOptions } from "./service.js";

/** Default cadence for the explicit foreground freshness monitor. */
export const DEFAULT_WATCH_INTERVAL_MS = 2_000;
export const MIN_WATCH_INTERVAL_MS = 250;
export const MAX_WATCH_INTERVAL_MS = 60_000;

/**
 * A bounded, machine-readable receipt from the foreground watch lifecycle.
 * Every field is present so newline-delimited JSON consumers do not need to
 * infer whether a missing value means "not observed" or "not applicable".
 */
export interface WatchReceipt {
  readonly event:
    | "started"
    | "stale-detected"
    | "synced"
    | "sync-failed"
    | "status-failed"
    | "stopped";
  readonly observedAt: string;
  readonly projectPath: string;
  readonly status: IndexStatus | null;
  readonly previousGenerationId: string | null;
  readonly generationId: string | null;
  readonly lastIndexWork: IndexWork | null;
  readonly error: {
    readonly code: string;
    readonly message: string;
  } | null;
  /** Present only when a failed check or sync will be retried. */
  readonly retryDelayMs: number | null;
}

/** The narrow application surface needed by an automatic foreground sync. */
export interface IndexWatchService {
  /** Enforces the same non-mutating broad-path consent gate as index and sync. */
  assertSafeProjectPath(options: IndexOptions): void;
  getStatus(projectPath: string): Promise<IndexStatus>;
  sync(options: IndexOptions): Promise<IndexStatus>;
}

export interface ForegroundWatchOptions {
  readonly projectPath: string;
  /** Reasserts deliberate broad-scope indexing on every automatic sync. */
  readonly force?: boolean;
  readonly intervalMs?: number;
  readonly onReceipt?: (receipt: WatchReceipt) => void;
}

export interface ForegroundWatchSession {
  /** Resolves after a caller stops the watch; rejects if its index disappears. */
  readonly done: Promise<void>;
  /** Idempotently stops future polls; an in-flight sync is allowed to finish. */
  stop(): Promise<void>;
}

export interface WatchScheduler {
  readonly now: () => Date;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemScheduler: WatchScheduler = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
};

function toWatchError(error: unknown): WatchReceipt["error"] {
  return {
    code: error instanceof SymbolLatticeError ? error.code : "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "Unknown SymbolLattice error."
  };
}

function isMissingIndexError(error: unknown): error is SymbolLatticeError {
  return error instanceof SymbolLatticeError && error.code === "MISSING_INDEX";
}

function statusGenerationId(status: IndexStatus | null): string | null {
  return status?.generationId ?? null;
}

function statusIndexWork(status: IndexStatus | null): IndexWork | null {
  return status?.lastIndexWork ?? null;
}

function retryDelay(intervalMs: number, consecutiveFailures: number): number {
  const multiplier = 2 ** Math.min(consecutiveFailures, 5);
  return Math.min(intervalMs * multiplier, MAX_WATCH_INTERVAL_MS);
}

/** Validates an already parsed polling interval at the shared application boundary. */
export function validateWatchInterval(intervalMs: number): number {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_WATCH_INTERVAL_MS ||
    intervalMs > MAX_WATCH_INTERVAL_MS
  ) {
    throw new SymbolLatticeError(
      "INVALID_WATCH_INTERVAL",
      `Watch interval must be an integer between ${MIN_WATCH_INTERVAL_MS} and ${MAX_WATCH_INTERVAL_MS} milliseconds.`
    );
  }

  return intervalMs;
}

class ForegroundWatch implements ForegroundWatchSession {
  private readonly intervalMs: number;
  private readonly onReceipt: (receipt: WatchReceipt) => void;
  private readonly donePromise: Promise<void>;
  private resolveDone: (() => void) | null = null;
  private rejectDone: ((reason?: unknown) => void) | null = null;
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private finished = false;
  private consecutiveFailures = 0;
  private lastStatus: IndexStatus | null = null;

  public constructor(
    private readonly service: IndexWatchService,
    private readonly options: ForegroundWatchOptions,
    private readonly scheduler: WatchScheduler
  ) {
    this.intervalMs = validateWatchInterval(options.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS);
    this.onReceipt = options.onReceipt ?? (() => undefined);
    this.donePromise = new Promise<void>((resolveDone, rejectDone) => {
      this.resolveDone = resolveDone;
      this.rejectDone = rejectDone;
    });
    // The public session still exposes the original rejecting promise. This
    // observer merely prevents a same-tick terminal poll from becoming an
    // unhandled rejection before a foreground CLI caller awaits `done`.
    void this.donePromise.catch(() => undefined);
  }

  public get done(): Promise<void> {
    return this.donePromise;
  }

  public async start(): Promise<void> {
    this.service.assertSafeProjectPath({
      projectPath: this.options.projectPath,
      force: this.options.force ?? false
    });

    let status: IndexStatus;
    try {
      status = await this.service.getStatus(this.options.projectPath);
    } catch (error) {
      if (isMissingIndexError(error)) {
        throw error;
      }
      this.scheduleNext(this.emitFailure("status-failed", error, null));
      return;
    }

    if (!status.initialized) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${this.options.projectPath}. Run "symbol-lattice init ${this.options.projectPath}" first.`
      );
    }

    this.lastStatus = status;
    this.emit("started", status, statusGenerationId(status), statusGenerationId(status));
    const delayMs = await this.reconcile(status);
    if (!this.stopped && delayMs !== null) {
      this.scheduleNext(delayMs);
    }
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      return this.done;
    }

    this.stopped = true;
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running === null) {
      this.finish();
    }

    return this.done;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped || this.finished) {
      return;
    }

    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.running = this.poll()
        .then((delayMs) => {
          if (!this.stopped && delayMs !== null) {
            this.scheduleNext(delayMs);
          }
        })
        .finally(() => {
          this.running = null;
          if (this.stopped) {
            this.finish();
          }
        });
      void this.running;
    }, delayMs);
  }

  private async poll(): Promise<number | null> {
    let status: IndexStatus;
    try {
      status = await this.service.getStatus(this.options.projectPath);
    } catch (error) {
      if (isMissingIndexError(error)) {
        this.terminate(error, this.lastStatus);
        return null;
      }
      return this.emitFailure("status-failed", error, this.lastStatus);
    }

    this.lastStatus = status;
    if (!status.initialized) {
      this.terminate(
        new SymbolLatticeError(
          "MISSING_INDEX",
          `The SymbolLattice index for ${this.options.projectPath} is no longer available.`
        ),
        status
      );
      return null;
    }

    return this.reconcile(status);
  }

  private async reconcile(status: IndexStatus): Promise<number | null> {
    if (!status.stale || this.stopped) {
      this.consecutiveFailures = 0;
      return this.intervalMs;
    }

    const previousGenerationId = statusGenerationId(status);
    this.emit("stale-detected", status, previousGenerationId, previousGenerationId);
    try {
      const synced = await this.service.sync({
        projectPath: this.options.projectPath,
        force: this.options.force ?? false
      });
      this.lastStatus = synced;
      this.consecutiveFailures = 0;
      this.emit("synced", synced, previousGenerationId, statusGenerationId(synced));
      return this.intervalMs;
    } catch (error) {
      if (isMissingIndexError(error)) {
        this.terminate(error, status);
        return null;
      }
      return this.emitFailure("sync-failed", error, status, previousGenerationId);
    }
  }

  private emitFailure(
    event: Extract<WatchReceipt["event"], "sync-failed" | "status-failed">,
    error: unknown,
    status: IndexStatus | null,
    previousGenerationId = statusGenerationId(status)
  ): number {
    this.consecutiveFailures += 1;
    const delayMs = retryDelay(this.intervalMs, this.consecutiveFailures);
    this.emit(event, status, previousGenerationId, statusGenerationId(status), {
      error: toWatchError(error),
      retryDelayMs: delayMs
    });
    return delayMs;
  }

  private emit(
    event: WatchReceipt["event"],
    status: IndexStatus | null,
    previousGenerationId: string | null,
    generationId: string | null,
    overrides: Pick<WatchReceipt, "error" | "retryDelayMs"> = { error: null, retryDelayMs: null }
  ): void {
    this.onReceipt({
      event,
      observedAt: this.scheduler.now().toISOString(),
      projectPath: this.options.projectPath,
      status,
      previousGenerationId,
      generationId,
      lastIndexWork: statusIndexWork(status),
      error: overrides.error,
      retryDelayMs: overrides.retryDelayMs
    });
  }

  private finish(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.emit(
      "stopped",
      this.lastStatus,
      statusGenerationId(this.lastStatus),
      statusGenerationId(this.lastStatus)
    );
    this.resolveDone?.();
    this.resolveDone = null;
    this.rejectDone = null;
  }

  private terminate(error: SymbolLatticeError, status: IndexStatus | null): void {
    if (this.finished) {
      return;
    }

    this.stopped = true;
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit(
      "status-failed",
      status,
      statusGenerationId(status),
      statusGenerationId(status),
      { error: toWatchError(error), retryDelayMs: null }
    );
    this.finished = true;
    this.rejectDone?.(error);
    this.resolveDone = null;
    this.rejectDone = null;
  }
}

/**
 * Starts an explicit foreground polling watch. It never initializes an index,
 * never changes persisted scope, and delegates every graph mutation to the
 * existing atomic `sync` operation.
 */
export async function startForegroundWatch(
  service: IndexWatchService,
  options: ForegroundWatchOptions,
  scheduler: WatchScheduler = systemScheduler
): Promise<ForegroundWatchSession> {
  const watch = new ForegroundWatch(service, options, scheduler);
  await watch.start();
  return watch;
}

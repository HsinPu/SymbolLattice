import type { IndexWork } from "../domain/index-work.js";
import type { IndexStatus } from "../domain/types.js";

import { SymbolLatticeError } from "./errors.js";
import type { IndexOptions } from "./service.js";

/** Default cadence for the explicit foreground freshness monitor. */
export const DEFAULT_WATCH_INTERVAL_MS = 2_000;
/** Delay used to coalesce a burst of source-change notifications. */
export const DEFAULT_WATCH_EVENT_DEBOUNCE_MS = 250;
export const MIN_WATCH_INTERVAL_MS = 250;
export const MAX_WATCH_INTERVAL_MS = 60_000;
const MAX_WATCH_PENDING_FILES = 25;

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
    | "event-watch-active"
    | "event-watch-failed"
    | "event-pending"
    | "event-fresh"
    | "fresh-observed"
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
  /** Exact only when every pending event identified a path and none exceeded the cap. */
  readonly pendingFileCount: number | null;
  /** Bounded, lexically sorted paths observed from pending source-change events. */
  readonly pendingFiles: readonly string[];
  /** True when more than the bounded set of pending paths was observed. */
  readonly pendingFilesTruncated: boolean;
  /** True when at least one pending source-change event did not identify a path. */
  readonly pendingFilesUnknown: boolean;
}

/** Coarse, user-facing state of the watcher that owns automatic synchronization. */
export type AutoSyncState =
  | "disabled"
  | "starting"
  | "fresh"
  | "pending"
  | "syncing"
  | "retrying"
  | "failed"
  | "stopped";

/** How the active watcher receives source-change notifications. */
export type AutoSyncWatcherMode =
  | "disabled"
  | "starting"
  | "native-events"
  | "polling-fallback"
  | "polling-only";

/**
 * Read-only snapshot of watcher health. File paths have already passed the
 * watcher's bounded, project-relative disclosure contract.
 */
export interface AutoSyncStatus {
  readonly enabled: boolean;
  readonly state: AutoSyncState;
  readonly watcherMode: AutoSyncWatcherMode;
  readonly observedAt: string | null;
  readonly lastEvent: WatchReceipt["event"] | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastSyncFailure: WatchReceipt["error"];
  readonly eventWatchFailure: WatchReceipt["error"];
  readonly retryDelayMs: number | null;
  readonly pendingFileCount: number | null;
  readonly pendingFiles: readonly string[];
  readonly pendingFilesTruncated: boolean;
  readonly pendingFilesUnknown: boolean;
}

/** Composes live index freshness with the watcher's non-mutating lifecycle snapshot. */
export interface AutoSyncStatusResult {
  readonly index: IndexStatus;
  readonly autoSync: AutoSyncStatus;
}

export interface AutoSyncStatusTrackerOptions {
  /** False when the MCP host was explicitly started with `--no-auto-sync`. */
  readonly enabled?: boolean;
  /** False when the MCP host was explicitly started with `--poll`. */
  readonly nativeEventsRequested?: boolean;
}

/**
 * Converts watch receipts into a stable, query-safe status snapshot.
 *
 * This class does not observe files, call `sync`, or mutate an index. Its only
 * input is the receipt stream that the foreground watcher already produces.
 */
export class AutoSyncStatusTracker {
  private readonly enabled: boolean;
  private state: AutoSyncState;
  private watcherMode: AutoSyncWatcherMode;
  private observedAt: string | null = null;
  private lastEvent: WatchReceipt["event"] | null = null;
  private lastSuccessfulSyncAt: string | null = null;
  private lastSyncFailure: WatchReceipt["error"] = null;
  private eventWatchFailure: WatchReceipt["error"] = null;
  private retryDelayMs: number | null = null;
  private pendingFileCount: number | null = 0;
  private pendingFiles: readonly string[] = [];
  private pendingFilesTruncated = false;
  private pendingFilesUnknown = false;

  public constructor(options: AutoSyncStatusTrackerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.state = this.enabled ? "starting" : "disabled";
    this.watcherMode = this.enabled
      ? options.nativeEventsRequested === false
        ? "polling-only"
        : "starting"
      : "disabled";
  }

  /** Records one watcher receipt without invoking any index or filesystem operation. */
  public record(receipt: WatchReceipt): void {
    if (!this.enabled) {
      return;
    }

    this.observedAt = receipt.observedAt;
    this.lastEvent = receipt.event;
    this.retryDelayMs = receipt.retryDelayMs;
    this.pendingFileCount = receipt.pendingFileCount;
    this.pendingFiles = [...receipt.pendingFiles];
    this.pendingFilesTruncated = receipt.pendingFilesTruncated;
    this.pendingFilesUnknown = receipt.pendingFilesUnknown;

    switch (receipt.event) {
      case "started":
        this.state = receipt.status?.stale === true ? "syncing" : "fresh";
        break;
      case "stale-detected":
        this.state = "syncing";
        break;
      case "synced":
        this.state = "fresh";
        this.lastSuccessfulSyncAt = receipt.observedAt;
        this.lastSyncFailure = null;
        this.retryDelayMs = null;
        break;
      case "sync-failed":
      case "status-failed":
        this.state = receipt.retryDelayMs === null ? "failed" : "retrying";
        this.lastSyncFailure = receipt.error;
        break;
      case "event-pending":
        this.state = "pending";
        break;
      case "event-fresh":
      case "fresh-observed":
        this.state = "fresh";
        this.lastSyncFailure = null;
        this.retryDelayMs = null;
        break;
      case "event-watch-active":
        this.watcherMode = "native-events";
        if (this.state === "starting" || this.state === "retrying") {
          this.state = receipt.status?.stale === true ? "syncing" : "fresh";
        }
        this.eventWatchFailure = null;
        break;
      case "event-watch-failed":
        this.watcherMode = "polling-fallback";
        this.eventWatchFailure = receipt.error;
        break;
      case "stopped":
        this.state = "stopped";
        break;
    }
  }

  /** Returns a defensive copy suitable for an MCP or HTTP status response. */
  public snapshot(): AutoSyncStatus {
    return {
      enabled: this.enabled,
      state: this.state,
      watcherMode: this.watcherMode,
      observedAt: this.observedAt,
      lastEvent: this.lastEvent,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      lastSyncFailure: this.lastSyncFailure,
      eventWatchFailure: this.eventWatchFailure,
      retryDelayMs: this.retryDelayMs,
      pendingFileCount: this.pendingFileCount,
      pendingFiles: [...this.pendingFiles],
      pendingFilesTruncated: this.pendingFilesTruncated,
      pendingFilesUnknown: this.pendingFilesUnknown
    };
  }
}

/** The narrow application surface needed by an automatic foreground sync. */
export interface IndexWatchService {
  /** Enforces the same non-mutating broad-path consent gate as index and sync. */
  assertSafeProjectPath(options: IndexOptions): void;
  getStatus(projectPath: string): Promise<IndexStatus>;
  sync(options: IndexOptions): Promise<IndexStatus>;
}

/** Callbacks supplied to an optional local project-change event source. */
export interface WatchEventCallbacks {
  onChange(change?: { filePath: string | null }): void;
  onError(error: unknown): void;
}

/** A closeable subscription to local project-change events. */
export interface WatchEventSubscription {
  close(): void;
}

/** Optional event source that complements the foreground polling watch. */
export interface WatchEventSource {
  subscribe(projectPath: string, callbacks: WatchEventCallbacks): WatchEventSubscription;
}

export interface ForegroundWatchOptions {
  readonly projectPath: string;
  /** Reasserts deliberate broad-scope indexing on every automatic sync. */
  readonly force?: boolean;
  readonly intervalMs?: number;
  readonly eventSource?: WatchEventSource;
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

function toEventWatchError(
  code: "WATCH_EVENTS_UNAVAILABLE" | "WATCH_EVENTS_FAILED",
  error: unknown
): WatchReceipt["error"] {
  return {
    code,
    message: error instanceof Error ? error.message : "Unknown watch event source error."
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

/**
 * Watch sources are pluggable, so never disclose arbitrary callback text in a
 * receipt. Known paths use a portable, unambiguous project-relative form;
 * anything else is reported as an unknown invalidation instead.
 */
function normalizePendingFilePath(filePath: unknown): string | null {
  if (typeof filePath !== "string") {
    return null;
  }

  const normalized = filePath.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.trim().length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\u0000-\u001F]/.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  return normalized;
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
  private eventTimer: unknown = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private finished = false;
  private consecutiveFailures = 0;
  private lastStatus: IndexStatus | null = null;
  private eventSourceAttempted = false;
  private eventSourceActive = false;
  private eventSubscription: WatchEventSubscription | null = null;
  private eventReconcilePending = false;
  private pendingEventRevision = 0;
  private readonly pendingFiles = new Set<string>();
  private pendingFilesTruncated = false;
  private pendingFilesUnknown = false;

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
      this.startEventWatch();
    }
    if (
      !this.stopped &&
      delayMs !== null &&
      this.timer === null
    ) {
      this.scheduleNext(delayMs);
    }
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      return this.done;
    }

    this.stopped = true;
    this.cancelPollTimer();
    this.disableEventSource();
    if (this.running === null) {
      this.finish();
    }

    return this.done;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped || this.finished || this.timer !== null) {
      return;
    }

    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.startPoll();
    }, delayMs);
  }

  private startPoll(): void {
    if (this.stopped || this.finished || this.running !== null) {
      return;
    }

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
          return;
        }

        if (this.eventTimer === null && this.eventReconcilePending) {
          this.eventReconcilePending = false;
          this.startPoll();
        }
      });
    void this.running;
  }

  private startEventWatch(): void {
    const source = this.options.eventSource;
    if (
      source === undefined ||
      this.stopped ||
      this.finished ||
      this.eventSourceAttempted ||
      this.eventSourceActive
    ) {
      return;
    }

    this.eventSourceAttempted = true;
    this.eventSourceActive = true;
    let subscription: WatchEventSubscription;
    try {
      subscription = source.subscribe(this.options.projectPath, {
        onChange: (change) => this.handleEventChange(change),
        onError: (error) => this.handleEventError(error)
      });
    } catch (error) {
      if (this.eventSourceActive) {
        this.handleEventSourceFailure("WATCH_EVENTS_UNAVAILABLE", error);
      }
      return;
    }

    if (!this.eventSourceActive || this.stopped || this.finished) {
      this.closeEventSubscription(subscription);
      return;
    }

    this.eventSubscription = subscription;
    this.emit(
      "event-watch-active",
      this.lastStatus,
      statusGenerationId(this.lastStatus),
      statusGenerationId(this.lastStatus)
    );
  }

  private handleEventChange(change?: { filePath: string | null }): void {
    if (!this.eventSourceActive || this.stopped || this.finished) {
      return;
    }

    this.recordPendingEvent(change);
    this.emit(
      "event-pending",
      this.lastStatus,
      statusGenerationId(this.lastStatus),
      statusGenerationId(this.lastStatus)
    );

    if (!this.eventSourceActive || this.stopped || this.finished) {
      return;
    }

    this.eventReconcilePending = true;
    this.cancelEventTimer();
    this.eventTimer = this.scheduler.setTimeout(() => {
      this.eventTimer = null;
      this.runDebouncedEventReconcile();
    }, DEFAULT_WATCH_EVENT_DEBOUNCE_MS);
  }

  private runDebouncedEventReconcile(): void {
    if (!this.eventSourceActive || this.stopped || this.finished) {
      return;
    }

    if (this.running !== null) {
      return;
    }

    this.eventReconcilePending = false;
    this.startPoll();
  }

  private handleEventError(error: unknown): void {
    if (!this.eventSourceActive || this.stopped || this.finished) {
      return;
    }

    this.handleEventSourceFailure("WATCH_EVENTS_FAILED", error);
  }

  private handleEventSourceFailure(
    code: "WATCH_EVENTS_UNAVAILABLE" | "WATCH_EVENTS_FAILED",
    error: unknown
  ): void {
    this.disableEventSource();
    this.emit(
      "event-watch-failed",
      this.lastStatus,
      statusGenerationId(this.lastStatus),
      statusGenerationId(this.lastStatus),
      { error: toEventWatchError(code, error), retryDelayMs: null }
    );

    if (!this.stopped && !this.finished && this.running === null && this.timer === null) {
      this.scheduleNext(this.intervalMs);
    }
  }

  private cancelPollTimer(): void {
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private cancelEventTimer(): void {
    if (this.eventTimer !== null) {
      this.scheduler.clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
  }

  private disableEventSource(): void {
    this.eventSourceActive = false;
    this.eventReconcilePending = false;
    this.cancelEventTimer();
    const subscription = this.eventSubscription;
    this.eventSubscription = null;
    if (subscription !== null) {
      this.closeEventSubscription(subscription);
    }
  }

  private closeEventSubscription(subscription: WatchEventSubscription): void {
    try {
      subscription.close();
    } catch {
      // A failed cleanup must not reactivate the event source or block polling fallback.
    }
  }

  private async poll(): Promise<number | null> {
    const pendingReconciliation = {
      hadPendingEvents: this.hasPendingEvents(),
      revision: this.pendingEventRevision
    };
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

    this.startEventWatch();
    return this.reconcile(status, pendingReconciliation);
  }

  private async reconcile(
    status: IndexStatus,
    pendingReconciliation: { readonly hadPendingEvents: boolean; readonly revision: number } | null = null
  ): Promise<number | null> {
    if (!status.stale || this.stopped) {
      const recoveredFromFailure = this.consecutiveFailures > 0;
      this.consecutiveFailures = 0;
      if (!this.stopped) {
        if (this.clearPendingAfterSuccessfulReconciliation(pendingReconciliation)) {
          this.emit(
            "event-fresh",
            status,
            statusGenerationId(status),
            statusGenerationId(status)
          );
        } else if (recoveredFromFailure) {
          // A successful polling check after a status failure is meaningful to
          // long-lived hosts even when no source-change event was pending.
          this.emit(
            "fresh-observed",
            status,
            statusGenerationId(status),
            statusGenerationId(status)
          );
        }
      }
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
      this.clearPendingAfterSuccessfulReconciliation(pendingReconciliation);
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

  private recordPendingEvent(change?: { filePath: string | null }): void {
    this.pendingEventRevision += 1;
    const filePath = normalizePendingFilePath(change?.filePath);
    if (filePath === null) {
      this.pendingFilesUnknown = true;
      return;
    }

    if (this.pendingFiles.has(filePath)) {
      return;
    }

    if (this.pendingFiles.size < MAX_WATCH_PENDING_FILES) {
      this.pendingFiles.add(filePath);
      return;
    }

    // Keep the bounded disclosure independent of native event ordering. The
    // receipt always exposes the lexical first 25 paths from the observed
    // batch rather than whichever 25 happened to arrive first.
    this.pendingFilesTruncated = true;
    const greatestRetainedPath = Array.from(this.pendingFiles).reduce(
      (greatest, candidate) => (candidate > greatest ? candidate : greatest)
    );
    if (filePath < greatestRetainedPath) {
      this.pendingFiles.delete(greatestRetainedPath);
      this.pendingFiles.add(filePath);
    }
  }

  private hasPendingEvents(): boolean {
    return (
      this.pendingFiles.size > 0 ||
      this.pendingFilesTruncated ||
      this.pendingFilesUnknown
    );
  }

  private clearPendingAfterSuccessfulReconciliation(
    pendingReconciliation: { readonly hadPendingEvents: boolean; readonly revision: number } | null
  ): boolean {
    if (
      pendingReconciliation === null ||
      !pendingReconciliation.hadPendingEvents ||
      this.pendingEventRevision !== pendingReconciliation.revision
    ) {
      return false;
    }

    this.pendingFiles.clear();
    this.pendingFilesTruncated = false;
    this.pendingFilesUnknown = false;
    this.eventReconcilePending = false;
    this.cancelEventTimer();
    return true;
  }

  private pendingReceiptFields(): Pick<
    WatchReceipt,
    "pendingFileCount" | "pendingFiles" | "pendingFilesTruncated" | "pendingFilesUnknown"
  > {
    const pendingFiles = Array.from(this.pendingFiles).sort();
    return {
      pendingFileCount:
        this.pendingFilesUnknown || this.pendingFilesTruncated ? null : pendingFiles.length,
      pendingFiles,
      pendingFilesTruncated: this.pendingFilesTruncated,
      pendingFilesUnknown: this.pendingFilesUnknown
    };
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
      retryDelayMs: overrides.retryDelayMs,
      ...this.pendingReceiptFields()
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
    this.cancelPollTimer();
    this.disableEventSource();
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
 * Starts an explicit foreground watch with optional event acceleration and a
 * polling fallback. It never initializes an index, never changes persisted
 * scope, and delegates every graph mutation to the existing atomic `sync`
 * operation.
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

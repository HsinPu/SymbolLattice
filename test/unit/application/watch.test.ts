import { describe, expect, it } from "vitest";

import {
  DEFAULT_WATCH_EVENT_DEBOUNCE_MS,
  DEFAULT_WATCH_INTERVAL_MS,
  MAX_WATCH_INTERVAL_MS,
  MIN_WATCH_INTERVAL_MS,
  SymbolLatticeError,
  startForegroundWatch,
  validateWatchInterval,
  type ForegroundWatchOptions,
  type IndexWatchService,
  type WatchEventCallbacks,
  type WatchEventSource,
  type WatchReceipt,
  type WatchScheduler
} from "../../../src/application/index.js";
import type { IndexStatus, IndexWork } from "../../../src/domain/index.js";

class ManualScheduler implements WatchScheduler {
  private readonly timers: Array<{
    readonly callback: () => void;
    readonly delayMs: number;
    readonly dueAt: number;
    active: boolean;
  }> = [];
  private timestamp = Date.parse("2026-07-30T00:00:00.000Z");

  public now = (): Date => new Date(this.timestamp);

  public setTimeout(callback: () => void, delayMs: number): unknown {
    const timer = { callback, delayMs, dueAt: this.timestamp + delayMs, active: true };
    this.timers.push(timer);
    return timer;
  }

  public clearTimeout(handle: unknown): void {
    (handle as { active: boolean }).active = false;
  }

  public get scheduledDelays(): readonly number[] {
    return this.timers.filter((timer) => timer.active).map((timer) => timer.delayMs);
  }

  public advanceBy(delayMs: number): void {
    this.timestamp += delayMs;
  }

  public fireNext(): void {
    const timer = this.timers
      .filter((candidate) => candidate.active)
      .reduce<(typeof this.timers)[number] | undefined>(
        (earliest, candidate) =>
          earliest === undefined || candidate.dueAt < earliest.dueAt ? candidate : earliest,
        undefined
      );
    if (timer === undefined) {
      throw new Error("No active timer is scheduled.");
    }
    timer.active = false;
    this.timestamp = timer.dueAt;
    timer.callback();
  }
}

function indexWork(): IndexWork {
  return {
    mode: "incremental",
    resolutionScope: "project",
    addedFiles: [],
    modifiedFiles: ["src/math.ts"],
    removedFiles: [],
    reExtractedFiles: ["src/math.ts"],
    reusedArtifactFiles: ["src/consumer.ts"],
    dependencyInvalidatedFiles: ["src/consumer.ts"],
    reuseInvalidationReasons: []
  };
}

function status(
  generationId: string | null,
  stale = false,
  lastIndexWork?: IndexWork
): IndexStatus {
  return {
    initialized: true,
    stale,
    staleReasons: stale ? ["source-files-changed"] : [],
    projectPath: "C:/project",
    indexedAt: "2026-07-30T00:00:00.000Z",
    generationId,
    counts: { files: 2, symbols: 3, edges: 1, pendingReferences: 0 },
    ...(lastIndexWork === undefined ? {} : { lastIndexWork })
  };
}

class FakeWatchService implements IndexWatchService {
  public readonly getStatusCalls: string[] = [];
  public readonly syncCalls: Array<{ readonly projectPath: string; readonly force?: boolean }> = [];

  public constructor(
    private readonly statuses: Array<IndexStatus | Error>,
    private readonly syncResults: Array<IndexStatus | Error> = []
  ) {}

  public assertSafeProjectPath(): void {}

  public async getStatus(projectPath: string): Promise<IndexStatus> {
    this.getStatusCalls.push(projectPath);
    const next = this.statuses.shift();
    if (next === undefined) {
      throw new Error("No fake status remains.");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  public async sync(options: { readonly projectPath: string; readonly force?: boolean }): Promise<IndexStatus> {
    this.syncCalls.push(options);
    const next = this.syncResults.shift();
    if (next === undefined) {
      throw new Error("No fake sync result remains.");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }
}

class FakeWatchEventSource implements WatchEventSource {
  public readonly subscribeCalls: string[] = [];
  public closeCalls = 0;
  private callbacks: WatchEventCallbacks | null = null;

  public constructor(
    private readonly subscribeError: Error | null = null,
    private readonly emitChangeDuringSubscribe = false
  ) {}

  public subscribe(projectPath: string, callbacks: WatchEventCallbacks): { close(): void } {
    this.subscribeCalls.push(projectPath);
    if (this.subscribeError !== null) {
      throw this.subscribeError;
    }
    this.callbacks = callbacks;
    if (this.emitChangeDuringSubscribe) {
      callbacks.onChange();
    }
    return {
      close: () => {
        this.closeCalls += 1;
      }
    };
  }

  public emitChange(): void {
    this.callbacks?.onChange();
  }

  public emitError(error: unknown): void {
    this.callbacks?.onError(error);
  }
}

async function settle(): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    await Promise.resolve();
  }
}

function watchOptions(receipts: WatchReceipt[]): ForegroundWatchOptions {
  return {
    projectPath: "C:/project",
    intervalMs: MIN_WATCH_INTERVAL_MS,
    onReceipt: (receipt) => receipts.push(receipt)
  };
}

describe("foreground index watch", () => {
  it("checks immediately, syncs only after detected drift, and emits stable receipts", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const service = new FakeWatchService(
      [status("generation:one"), status("generation:one", true)],
      [status("generation:two", false, indexWork())]
    );

    const session = await startForegroundWatch(service, watchOptions(receipts), scheduler);

    expect(receipts.map((receipt) => receipt.event)).toEqual(["started"]);
    expect(service.syncCalls).toEqual([]);
    expect(scheduler.scheduledDelays).toEqual([MIN_WATCH_INTERVAL_MS]);

    scheduler.fireNext();
    await settle();

    expect(service.syncCalls).toEqual([{ projectPath: "C:/project", force: false }]);
    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "stale-detected",
      "synced"
    ]);
    expect(receipts[2]).toMatchObject({
      previousGenerationId: "generation:one",
      generationId: "generation:two",
      lastIndexWork: indexWork(),
      error: null,
      retryDelayMs: null
    });

    await session.stop();
    expect(receipts.at(-1)?.event).toBe("stopped");
  });

  it("backs off after a failed sync, retains the old generation in the receipt, then recovers", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const service = new FakeWatchService(
      [status("generation:one", true), status("generation:one", true)],
      [new SymbolLatticeError("INVALID_PROJECT_CONFIGURATION", "Temporary invalid tsconfig."), status("generation:two")]
    );

    const session = await startForegroundWatch(service, watchOptions(receipts), scheduler);

    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "stale-detected",
      "sync-failed"
    ]);
    expect(receipts.at(-1)).toMatchObject({
      generationId: "generation:one",
      error: { code: "INVALID_PROJECT_CONFIGURATION", message: "Temporary invalid tsconfig." },
      retryDelayMs: MIN_WATCH_INTERVAL_MS * 2
    });
    expect(scheduler.scheduledDelays).toEqual([MIN_WATCH_INTERVAL_MS * 2]);

    scheduler.fireNext();
    await settle();

    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "stale-detected",
      "sync-failed",
      "stale-detected",
      "synced"
    ]);
    expect(scheduler.scheduledDelays).toEqual([MIN_WATCH_INTERVAL_MS]);

    await session.stop();
  });

  it("never overlaps polls and waits for an in-flight sync before writing stopped", async () => {
    let releaseSync: ((result: IndexStatus) => void) | undefined;
    const pendingSync = new Promise<IndexStatus>((resolveSync) => {
      releaseSync = resolveSync;
    });
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const service: IndexWatchService & {
      readonly syncCalls: Array<{ readonly projectPath: string; readonly force?: boolean }>;
      statusCalls: number;
    } = {
      syncCalls: [],
      statusCalls: 0,
      assertSafeProjectPath(): void {},
      async getStatus(): Promise<IndexStatus> {
        this.statusCalls += 1;
        return this.statusCalls === 1 ? status("generation:one") : status("generation:one", true);
      },
      async sync(options): Promise<IndexStatus> {
        this.syncCalls.push(options);
        return pendingSync;
      }
    };

    const session = await startForegroundWatch(service, watchOptions(receipts), scheduler);
    expect(scheduler.scheduledDelays).toEqual([MIN_WATCH_INTERVAL_MS]);
    scheduler.fireNext();
    await settle();
    expect(service.syncCalls).toHaveLength(1);
    expect(scheduler.scheduledDelays).toEqual([]);

    const stopping = session.stop();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await settle();
    expect(stopped).toBe(false);

    releaseSync?.(status("generation:two"));
    await stopping;
    expect(receipts.at(-1)?.event).toBe("stopped");
  });

  it("rejects a missing initial index instead of silently initializing it", async () => {
    const service: IndexWatchService = {
      assertSafeProjectPath(): void {},
      async getStatus(): Promise<IndexStatus> {
        return {
          ...status(null),
          initialized: false,
          indexedAt: null,
          counts: { files: 0, symbols: 0, edges: 0, pendingReferences: 0 }
        };
      },
      async sync(): Promise<IndexStatus> {
        throw new Error("sync must not run");
      }
    };

    await expect(
      startForegroundWatch(service, { projectPath: "C:/project" }, new ManualScheduler())
    ).rejects.toMatchObject({ code: "MISSING_INDEX" });
  });

  it("terminates instead of retrying forever when an active index disappears", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const service = new FakeWatchService([
      status("generation:one"),
      {
        ...status(null),
        initialized: false,
        indexedAt: null,
        counts: { files: 0, symbols: 0, edges: 0, pendingReferences: 0 }
      }
    ]);
    const session = await startForegroundWatch(service, watchOptions(receipts), scheduler);
    const terminal = session.done.then(
      () => null,
      (error: unknown) => error
    );

    scheduler.fireNext();
    await settle();

    await expect(terminal).resolves.toMatchObject({ code: "MISSING_INDEX" });
    expect(receipts.map((receipt) => receipt.event)).toEqual(["started", "status-failed"]);
    expect(receipts.at(-1)).toMatchObject({
      error: { code: "MISSING_INDEX" },
      retryDelayMs: null
    });
    expect(scheduler.scheduledDelays).toEqual([]);
    expect(service.syncCalls).toEqual([]);
  });

  it("enforces the documented polling bounds", () => {
    expect(validateWatchInterval(DEFAULT_WATCH_INTERVAL_MS)).toBe(DEFAULT_WATCH_INTERVAL_MS);
    for (const intervalMs of [MIN_WATCH_INTERVAL_MS - 1, MAX_WATCH_INTERVAL_MS + 1, 1.5]) {
      expect(() => validateWatchInterval(intervalMs)).toThrowError(
        expect.objectContaining({ code: "INVALID_WATCH_INTERVAL" })
      );
    }
  });

  it("enforces deliberate force consent before checking a fresh unsafe project", async () => {
    const assertionCalls: Array<{ readonly projectPath: string; readonly force?: boolean }> = [];
    let statusChecks = 0;
    const service: IndexWatchService = {
      assertSafeProjectPath(options): void {
        assertionCalls.push(options);
        if (!options.force) {
          throw new SymbolLatticeError("INVALID_PROJECT_PATH", "Pass --force for this project.");
        }
      },
      async getStatus(): Promise<IndexStatus> {
        statusChecks += 1;
        return status("generation:one");
      },
      async sync(): Promise<IndexStatus> {
        throw new Error("sync must not run for a fresh project");
      }
    };

    await expect(
      startForegroundWatch(service, { projectPath: "C:/unsafe-project" }, new ManualScheduler())
    ).rejects.toMatchObject({ code: "INVALID_PROJECT_PATH" });
    expect(assertionCalls).toEqual([{ projectPath: "C:/unsafe-project", force: false }]);
    expect(statusChecks).toBe(0);

    const session = await startForegroundWatch(
      service,
      { projectPath: "C:/unsafe-project", force: true },
      new ManualScheduler()
    );
    expect(assertionCalls).toEqual([
      { projectPath: "C:/unsafe-project", force: false },
      { projectPath: "C:/unsafe-project", force: true }
    ]);
    expect(statusChecks).toBe(1);
    await session.stop();
  });

  it("debounces source-change bursts ahead of the regular poll", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService(
      [status("generation:one"), status("generation:one", true)],
      [status("generation:two")]
    );
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    expect(source.subscribeCalls).toEqual(["C:/project"]);
    expect(receipts.map((receipt) => receipt.event)).toEqual(["started", "event-watch-active"]);
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    source.emitChange();
    source.emitChange();
    source.emitChange();

    expect(service.getStatusCalls).toHaveLength(1);
    expect(scheduler.scheduledDelays).toEqual([1_000, DEFAULT_WATCH_EVENT_DEBOUNCE_MS]);

    scheduler.fireNext();
    await settle();

    expect(service.getStatusCalls).toHaveLength(2);
    expect(service.syncCalls).toEqual([{ projectPath: "C:/project", force: false }]);
    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "event-watch-active",
      "stale-detected",
      "synced"
    ]);
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    await session.stop();
  });

  it("keeps the polling safety sweep live during a continuous event stream", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService(
      [status("generation:one"), status("generation:one", true)],
      [status("generation:two")]
    );
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    for (let tick = 0; tick < 9; tick += 1) {
      source.emitChange();
      scheduler.advanceBy(100);
    }

    expect(scheduler.scheduledDelays).toEqual([1_000, DEFAULT_WATCH_EVENT_DEBOUNCE_MS]);

    scheduler.fireNext();
    await settle();

    expect(service.getStatusCalls).toHaveLength(2);
    expect(service.syncCalls).toEqual([{ projectPath: "C:/project", force: false }]);
    expect(receipts.map((receipt) => receipt.event)).toContain("synced");

    await session.stop();
  });

  it("arms the polling safety sweep when an event arrives during subscription", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource(null, true);
    const service = new FakeWatchService([status("generation:one")]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    expect(receipts.map((receipt) => receipt.event)).toEqual(["started", "event-watch-active"]);
    expect(scheduler.scheduledDelays).toEqual([DEFAULT_WATCH_EVENT_DEBOUNCE_MS, 1_000]);

    await session.stop();
  });

  it("coalesces source changes received during an in-flight sync into one later reconciliation", async () => {
    let releaseSync: ((result: IndexStatus) => void) | undefined;
    const pendingSync = new Promise<IndexStatus>((resolveSync) => {
      releaseSync = resolveSync;
    });
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const statuses = [status("generation:one"), status("generation:one", true), status("generation:two")];
    const service: IndexWatchService & {
      readonly syncCalls: Array<{ readonly projectPath: string; readonly force?: boolean }>;
      statusCalls: number;
    } = {
      syncCalls: [],
      statusCalls: 0,
      assertSafeProjectPath(): void {},
      async getStatus(): Promise<IndexStatus> {
        this.statusCalls += 1;
        const next = statuses.shift();
        if (next === undefined) {
          throw new Error("No fake status remains.");
        }
        return next;
      },
      async sync(options): Promise<IndexStatus> {
        this.syncCalls.push(options);
        return pendingSync;
      }
    };

    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    source.emitChange();
    scheduler.fireNext();
    await settle();
    expect(service.syncCalls).toHaveLength(1);

    source.emitChange();
    source.emitChange();
    expect(scheduler.scheduledDelays).toEqual([1_000, DEFAULT_WATCH_EVENT_DEBOUNCE_MS]);
    scheduler.fireNext();
    await settle();
    expect(service.statusCalls).toBe(2);
    expect(service.syncCalls).toHaveLength(1);

    releaseSync?.(status("generation:two"));
    await settle();

    expect(service.statusCalls).toBe(3);
    expect(service.syncCalls).toHaveLength(1);
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    await session.stop();
  });

  it("falls back to polling when event subscription setup fails", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource(new Error("Native watcher is unavailable."));
    const service = new FakeWatchService([status("generation:one"), status("generation:one")]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    expect(receipts.map((receipt) => receipt.event)).toEqual(["started", "event-watch-failed"]);
    expect(receipts.at(-1)).toMatchObject({
      error: { code: "WATCH_EVENTS_UNAVAILABLE", message: "Native watcher is unavailable." },
      retryDelayMs: null
    });
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    scheduler.fireNext();
    await settle();
    expect(service.getStatusCalls).toHaveLength(2);
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    await session.stop();
  });

  it("activates the event source after recovering from an initial status failure", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService([
      new Error("Temporary status failure."),
      status("generation:one")
    ]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    expect(source.subscribeCalls).toEqual([]);
    expect(scheduler.scheduledDelays).toEqual([2_000]);

    scheduler.fireNext();
    await settle();

    expect(source.subscribeCalls).toEqual(["C:/project"]);
    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "status-failed",
      "event-watch-active"
    ]);
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    await session.stop();
  });

  it("closes a failed event source and retains polling after a runtime callback error", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService([status("generation:one"), status("generation:one")]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    source.emitError(new Error("Native watcher ended."));

    expect(source.closeCalls).toBe(1);
    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "event-watch-active",
      "event-watch-failed"
    ]);
    expect(receipts.at(-1)).toMatchObject({
      error: { code: "WATCH_EVENTS_FAILED", message: "Native watcher ended." },
      retryDelayMs: null
    });
    expect(scheduler.scheduledDelays).toEqual([1_000]);

    source.emitChange();
    expect(scheduler.scheduledDelays).toEqual([1_000]);
    scheduler.fireNext();
    await settle();
    expect(service.getStatusCalls).toHaveLength(2);

    await session.stop();
    expect(source.closeCalls).toBe(1);
  });

  it("cancels event work, closes once, and ignores late callbacks after stop", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService([status("generation:one")]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );

    source.emitChange();
    expect(scheduler.scheduledDelays).toEqual([1_000, DEFAULT_WATCH_EVENT_DEBOUNCE_MS]);

    await session.stop();
    await session.stop();
    expect(source.closeCalls).toBe(1);
    expect(scheduler.scheduledDelays).toEqual([]);
    expect(receipts.at(-1)?.event).toBe("stopped");

    source.emitChange();
    source.emitError(new Error("Late watcher error."));
    expect(scheduler.scheduledDelays).toEqual([]);
    expect(receipts.at(-1)?.event).toBe("stopped");
  });

  it("closes the event source and ignores late callbacks when the active index disappears", async () => {
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const source = new FakeWatchEventSource();
    const service = new FakeWatchService([
      status("generation:one"),
      {
        ...status(null),
        initialized: false,
        indexedAt: null,
        counts: { files: 0, symbols: 0, edges: 0, pendingReferences: 0 }
      }
    ]);
    const session = await startForegroundWatch(
      service,
      {
        ...watchOptions(receipts),
        intervalMs: 1_000,
        eventSource: source
      },
      scheduler
    );
    const terminal = session.done.then(
      () => null,
      (error: unknown) => error
    );

    source.emitChange();
    scheduler.fireNext();
    await settle();

    await expect(terminal).resolves.toMatchObject({ code: "MISSING_INDEX" });
    expect(source.closeCalls).toBe(1);
    expect(scheduler.scheduledDelays).toEqual([]);

    source.emitChange();
    source.emitError(new Error("Late watcher error."));
    expect(scheduler.scheduledDelays).toEqual([]);
    expect(receipts.map((receipt) => receipt.event)).toEqual([
      "started",
      "event-watch-active",
      "status-failed"
    ]);
  });
});

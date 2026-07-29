import { describe, expect, it } from "vitest";

import {
  DEFAULT_WATCH_INTERVAL_MS,
  MAX_WATCH_INTERVAL_MS,
  MIN_WATCH_INTERVAL_MS,
  SymbolLatticeError,
  startForegroundWatch,
  validateWatchInterval,
  type ForegroundWatchOptions,
  type IndexWatchService,
  type WatchReceipt,
  type WatchScheduler
} from "../../../src/application/index.js";
import type { IndexStatus, IndexWork } from "../../../src/domain/index.js";

class ManualScheduler implements WatchScheduler {
  private readonly timers: Array<{ readonly callback: () => void; readonly delayMs: number; active: boolean }> = [];
  private timestamp = Date.parse("2026-07-30T00:00:00.000Z");

  public now = (): Date => new Date(this.timestamp);

  public setTimeout(callback: () => void, delayMs: number): unknown {
    const timer = { callback, delayMs, active: true };
    this.timers.push(timer);
    return timer;
  }

  public clearTimeout(handle: unknown): void {
    (handle as { active: boolean }).active = false;
  }

  public get scheduledDelays(): readonly number[] {
    return this.timers.filter((timer) => timer.active).map((timer) => timer.delayMs);
  }

  public fireNext(): void {
    const timer = this.timers.find((candidate) => candidate.active);
    if (timer === undefined) {
      throw new Error("No active timer is scheduled.");
    }
    timer.active = false;
    this.timestamp += timer.delayMs;
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
});

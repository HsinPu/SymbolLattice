import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

import {
  FreshIndexRequiredError,
  ProjectNotStableError,
  StrictFreshReadCoordinator,
  type StrictFreshReadService,
  type StrictFreshWriterLease
} from "../../../src/application/index.js";
import type { IndexStatus } from "../../../src/domain/index.js";
import type { WatchFreshnessObservation } from "../../../src/application/watch.js";

const projectPath = resolve("C:/project");

function status(generationId: string, stale = false): IndexStatus {
  return {
    initialized: true,
    stale,
    staleReasons: stale ? ["source-files-changed"] : [],
    projectPath,
    indexedAt: "2026-08-26T00:00:00.000Z",
    generationId,
    counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
  };
}

class MutableFreshnessService implements StrictFreshReadService {
  public current = status("generation:one");
  public observeCalls = 0;
  public syncCalls = 0;
  public observeBarrier: Promise<void> | null = null;

  public assertSafeProjectPath(): void {}

  public async observeFreshness(): Promise<WatchFreshnessObservation> {
    this.observeCalls += 1;
    await this.observeBarrier;
    return {
      status: this.current,
      expectedGenerationId: this.current.generationId,
      knownStale: this.current.stale
    };
  }

  public async syncObserved(): Promise<IndexStatus> {
    this.syncCalls += 1;
    this.current = status(`generation:synced-${this.syncCalls}`);
    return this.current;
  }
}

function ownedLease(): StrictFreshWriterLease {
  return { state: "owned", release: vi.fn() };
}

describe("StrictFreshReadCoordinator", () => {
  it("verifies a fresh generation before and after one query without syncing", async () => {
    const service = new MutableFreshnessService();
    const coordinator = new StrictFreshReadCoordinator({ service, writerEnabled: false });
    const receipts: string[] = [];

    const result = await coordinator.execute(projectPath, async (receipt) => {
      receipts.push(receipt.expectedGenerationId);
      expect(receipt).toMatchObject({
        policy: "strict-fresh-read-v1",
        projectPath,
        freshnessVerified: true,
        verificationId: expect.any(String),
        verifiedAt: expect.any(String)
      });
      return "fresh-result";
    });

    expect(result).toBe("fresh-result");
    expect(receipts).toEqual(["generation:one"]);
    expect(service.observeCalls).toBe(2);
    expect(service.syncCalls).toBe(0);
  });

  it("fails closed when stale and no writer authority is enabled", async () => {
    const service = new MutableFreshnessService();
    service.current = status("generation:stale", true);
    const coordinator = new StrictFreshReadCoordinator({ service, writerEnabled: false });
    const query = vi.fn();

    await expect(coordinator.execute(projectPath, query)).rejects.toMatchObject({
      code: "FRESH_INDEX_REQUIRED",
      generationId: "generation:stale",
      staleReasons: ["source-files-changed"],
      writerState: "disabled"
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("acquires a project lease and synchronizes before returning fresh evidence", async () => {
    const service = new MutableFreshnessService();
    service.current = status("generation:stale", true);
    const lease = ownedLease();
    const acquireWriterLease = vi.fn(async () => lease);
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease
    });

    const result = await coordinator.execute(projectPath, async (receipt) => receipt.expectedGenerationId);

    expect(result).toBe("generation:synced-1");
    expect(service.syncCalls).toBe(1);
    expect(acquireWriterLease).toHaveBeenCalledWith(projectPath);
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("discards a result changed during the query and reruns once on a new generation", async () => {
    const service = new MutableFreshnessService();
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: async () => ownedLease()
    });
    const seen: string[] = [];

    const result = await coordinator.execute(projectPath, async (receipt) => {
      seen.push(receipt.expectedGenerationId);
      if (seen.length === 1) service.current = status("generation:one", true);
      return `result:${receipt.expectedGenerationId}`;
    });

    expect(seen).toEqual(["generation:one", "generation:synced-1"]);
    expect(result).toBe("result:generation:synced-1");
    expect(service.syncCalls).toBe(1);
  });

  it("blocks the second result when the project changes during both query attempts", async () => {
    const service = new MutableFreshnessService();
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: async () => ownedLease()
    });
    const query = vi.fn(async () => {
      service.current = status(service.current.generationId ?? "generation:unknown", true);
      return "discarded";
    });

    await expect(coordinator.execute(projectPath, query)).rejects.toBeInstanceOf(ProjectNotStableError);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent project verification without a TTL cache", async () => {
    const service = new MutableFreshnessService();
    let releaseObservation = (): void => undefined;
    service.observeBarrier = new Promise<void>((resolve) => { releaseObservation = resolve; });
    const coordinator = new StrictFreshReadCoordinator({ service, writerEnabled: false });

    const first = coordinator.execute(projectPath, async () => "first");
    const second = coordinator.execute(projectPath, async () => "second");
    await vi.waitFor(() => expect(service.observeCalls).toBe(1));
    releaseObservation();
    service.observeBarrier = null;

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(service.observeCalls).toBe(2);
    await coordinator.execute(projectPath, async () => "third");
    expect(service.observeCalls).toBe(4);
  });

  it("waits for another owner to publish fresh evidence without writing concurrently", async () => {
    const service = new MutableFreshnessService();
    service.current = status("generation:stale", true);
    let clock = 0;
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: async () => ({
        state: "unavailable",
        error: { code: "AUTO_SYNC_OWNER_UNAVAILABLE", message: "owned elsewhere" }
      }),
      now: () => new Date(clock),
      sleep: async (milliseconds) => {
        clock += milliseconds;
        service.current = status("generation:other-owner");
      }
    });

    await expect(
      coordinator.execute(projectPath, async (receipt) => receipt.expectedGenerationId)
    ).resolves.toBe("generation:other-owner");
    expect(service.syncCalls).toBe(0);
  });

  it("fails closed after the bounded lease wait when the owner leaves the index stale", async () => {
    const service = new MutableFreshnessService();
    service.current = status("generation:stale", true);
    let clock = 0;
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: async () => ({
        state: "unavailable",
        error: { code: "AUTO_SYNC_OWNER_UNAVAILABLE", message: "owned elsewhere" }
      }),
      now: () => new Date(clock),
      sleep: async (milliseconds) => { clock += milliseconds; }
    });

    await expect(coordinator.execute(projectPath, async () => "forbidden")).rejects.toMatchObject({
      code: "FRESH_INDEX_REQUIRED",
      writerState: "lease-unavailable"
    });
    expect(clock).toBe(2_000);
  });

  it("exports distinct fail-closed error classes", () => {
    expect(FreshIndexRequiredError).toBeTypeOf("function");
    expect(ProjectNotStableError).toBeTypeOf("function");
  });
});

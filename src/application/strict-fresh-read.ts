import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { IndexStatus } from "../domain/types.js";
import type { WatchFreshnessObservation, WatchPendingBatch } from "./watch.js";
import { SymbolLatticeError } from "./errors.js";
import type { IndexOptions } from "./service.js";
import {
  ReadQueryGenerationMismatchError,
  type ReadQueryFreshnessReceipt
} from "./read-query-freshness.js";

export const STRICT_FRESH_READ_POLICY = "strict-fresh-read-v1" as const;
export const STRICT_FRESH_READ_MAXIMUM_QUERY_ATTEMPTS = 2;
export const STRICT_FRESH_READ_MAXIMUM_SYNCS = 2;
export const STRICT_FRESH_READ_LEASE_WAIT_MS = 2_000;
export const STRICT_FRESH_READ_LEASE_POLL_MS = 250;

export type StrictFreshWriterState = "disabled" | "available" | "lease-unavailable";

export interface StrictFreshReadService {
  assertSafeProjectPath(options: IndexOptions): void;
  observeFreshness(
    projectPath: string,
    pendingBatch: WatchPendingBatch
  ): Promise<WatchFreshnessObservation>;
  syncObserved(
    options: IndexOptions,
    observation: WatchFreshnessObservation
  ): Promise<IndexStatus>;
}

export interface StrictFreshWriterLease {
  readonly state: "owned";
  release(): void;
}

export interface StrictFreshWriterLeaseUnavailable {
  readonly state: "unavailable";
  readonly error: { readonly code: string; readonly message: string };
}

export type StrictFreshWriterLeaseResult =
  | StrictFreshWriterLease
  | StrictFreshWriterLeaseUnavailable;

export class FreshIndexRequiredError extends SymbolLatticeError {
  public readonly generationId: string | null;
  public readonly staleReasons: readonly string[];
  public readonly writerState: StrictFreshWriterState;

  public constructor(status: IndexStatus, writerState: StrictFreshWriterState) {
    super(
      "FRESH_INDEX_REQUIRED",
      `The SymbolLattice index is not proven fresh (${status.staleReasons.join(", ") || "unknown reason"}). Run SymbolLattice sync for this project before retrying.`
    );
    this.name = "FreshIndexRequiredError";
    this.generationId = status.generationId;
    this.staleReasons = [...status.staleReasons];
    this.writerState = writerState;
  }
}

export class ProjectNotStableError extends SymbolLatticeError {
  public readonly generationId: string | null;
  public readonly staleReasons: readonly string[];

  public constructor(status: IndexStatus) {
    super(
      "PROJECT_NOT_STABLE",
      "The project changed during both strict freshness attempts; no query result was returned."
    );
    this.name = "ProjectNotStableError";
    this.generationId = status.generationId;
    this.staleReasons = [...status.staleReasons];
  }
}

export interface StrictFreshReadCoordinatorOptions {
  readonly service: StrictFreshReadService;
  readonly writerEnabled: boolean;
  readonly acquireWriterLease?: (
    projectPath: string
  ) => Promise<StrictFreshWriterLeaseResult> | StrictFreshWriterLeaseResult;
  readonly force?: boolean;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly leaseWaitMs?: number;
  readonly leasePollMs?: number;
}

interface FreshAdmission {
  readonly receipt: ReadQueryFreshnessReceipt;
  readonly lease: StrictFreshWriterLease | null;
}

interface SyncBudget { remaining: number; }

/** Host-owned pre/post freshness gate. Query callbacks receive no writer capability. */
export class StrictFreshReadCoordinator {
  private readonly service: StrictFreshReadService;
  private readonly writerEnabled: boolean;
  private readonly acquireWriterLease: StrictFreshReadCoordinatorOptions["acquireWriterLease"];
  private readonly force: boolean;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly leaseWaitMs: number;
  private readonly leasePollMs: number;
  private readonly observations = new Map<string, Promise<WatchFreshnessObservation>>();

  public constructor(options: StrictFreshReadCoordinatorOptions) {
    this.service = options.service;
    this.writerEnabled = options.writerEnabled;
    this.acquireWriterLease = options.acquireWriterLease;
    this.force = options.force ?? false;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
    this.leaseWaitMs = options.leaseWaitMs ?? STRICT_FRESH_READ_LEASE_WAIT_MS;
    this.leasePollMs = options.leasePollMs ?? STRICT_FRESH_READ_LEASE_POLL_MS;
  }

  public async execute<Result>(
    projectPath: string,
    query: (receipt: ReadQueryFreshnessReceipt) => Promise<Result>
  ): Promise<Result> {
    const normalizedProjectPath = resolve(projectPath);
    this.service.assertSafeProjectPath({ projectPath: normalizedProjectPath, force: this.force });
    const budget: SyncBudget = { remaining: STRICT_FRESH_READ_MAXIMUM_SYNCS };
    let lastStatus: IndexStatus | null = null;

    for (let attempt = 0; attempt < STRICT_FRESH_READ_MAXIMUM_QUERY_ATTEMPTS; attempt += 1) {
      const admission = await this.ensureFresh(normalizedProjectPath, budget);
      let result: Result | undefined;
      let queryError: unknown;
      try {
        result = await query(admission.receipt);
      } catch (error) {
        queryError = error;
      }

      const after = await this.observe(normalizedProjectPath);
      lastStatus = after.status;
      const stable = !(queryError instanceof ReadQueryGenerationMismatchError) &&
        this.isFresh(after) &&
        after.expectedGenerationId === admission.receipt.expectedGenerationId;
      admission.lease?.release();
      if (stable) {
        if (queryError !== undefined) throw queryError;
        return result as Result;
      }
      if (attempt + 1 === STRICT_FRESH_READ_MAXIMUM_QUERY_ATTEMPTS) {
        throw new ProjectNotStableError(after.status);
      }
    }

    throw new ProjectNotStableError(lastStatus ?? missingStatus(normalizedProjectPath));
  }

  private async ensureFresh(projectPath: string, budget: SyncBudget): Promise<FreshAdmission> {
    let observation = await this.observe(projectPath);
    this.assertInitialized(observation.status);
    if (this.isFresh(observation)) return { receipt: this.receipt(projectPath, observation), lease: null };
    if (!this.writerEnabled) throw new FreshIndexRequiredError(observation.status, "disabled");

    const authority = await this.acquireAuthority(projectPath, observation);
    if (authority.lease === null) {
      if (this.isFresh(authority.observation)) {
        return { receipt: this.receipt(projectPath, authority.observation), lease: null };
      }
      throw new FreshIndexRequiredError(authority.observation.status, "lease-unavailable");
    }

    observation = authority.observation;
    try {
      while (!this.isFresh(observation) && budget.remaining > 0) {
        budget.remaining -= 1;
        await this.service.syncObserved(
          { projectPath, force: this.force },
          observation
        );
        observation = await this.observe(projectPath);
      }
      if (!this.isFresh(observation)) throw new ProjectNotStableError(observation.status);
      return { receipt: this.receipt(projectPath, observation), lease: authority.lease };
    } catch (error) {
      authority.lease.release();
      throw error;
    }
  }

  private async acquireAuthority(
    projectPath: string,
    initialObservation: WatchFreshnessObservation
  ): Promise<{ readonly lease: StrictFreshWriterLease | null; readonly observation: WatchFreshnessObservation }> {
    if (this.acquireWriterLease === undefined) {
      return { lease: null, observation: initialObservation };
    }
    const deadline = this.now().getTime() + this.leaseWaitMs;
    let observation = initialObservation;
    while (true) {
      const lease = await this.acquireWriterLease(projectPath);
      if (lease.state === "owned") {
        observation = await this.observe(projectPath);
        return { lease, observation };
      }
      if (this.now().getTime() >= deadline) return { lease: null, observation };
      await this.sleep(this.leasePollMs);
      observation = await this.observe(projectPath);
      if (this.isFresh(observation)) return { lease: null, observation };
    }
  }

  private observe(projectPath: string): Promise<WatchFreshnessObservation> {
    const existing = this.observations.get(projectPath);
    if (existing !== undefined) return existing;
    const pending = this.service
      .observeFreshness(projectPath, { paths: [], complete: false })
      .finally(() => {
        if (this.observations.get(projectPath) === pending) this.observations.delete(projectPath);
      });
    this.observations.set(projectPath, pending);
    return pending;
  }

  private isFresh(observation: WatchFreshnessObservation): boolean {
    return observation.status.initialized &&
      !observation.status.stale &&
      observation.expectedGenerationId !== null;
  }

  private receipt(projectPath: string, observation: WatchFreshnessObservation): ReadQueryFreshnessReceipt {
    if (observation.expectedGenerationId === null) {
      throw new SymbolLatticeError("MISSING_INDEX", "The active SymbolLattice generation is unavailable.");
    }
    return {
      policy: STRICT_FRESH_READ_POLICY,
      verificationId: randomUUID(),
      verifiedAt: this.now().toISOString(),
      projectPath,
      expectedGenerationId: observation.expectedGenerationId,
      freshnessVerified: true
    };
  }

  private assertInitialized(status: IndexStatus): void {
    if (!status.initialized || status.generationId === null) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${status.projectPath}. Run SymbolLattice init for this project first.`
      );
    }
  }
}

function missingStatus(projectPath: string): IndexStatus {
  return {
    initialized: false,
    stale: true,
    staleReasons: [],
    projectPath,
    indexedAt: null,
    generationId: null,
    counts: { files: 0, symbols: 0, edges: 0, pendingReferences: 0 }
  };
}

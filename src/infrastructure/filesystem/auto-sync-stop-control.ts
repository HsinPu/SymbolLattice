import { createHash, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";

import {
  SymbolLatticeError,
  type AutoSyncHostObservation,
  type AutoSyncHostRecord,
  type AutoSyncHostRegistry,
  type AutoSyncStopControl,
  type AutoSyncStopExecutionResult,
  type AutoSyncStopMonitor,
  type AutoSyncStopOptions,
  type AutoSyncStopPlan,
  type AutoSyncStopPlanStatus,
  type AutoSyncStopResult
} from "../../application/index.js";

const INDEX_DIRECTORY_NAME = ".SymbolLattice";
export const AUTO_SYNC_STOP_REQUEST_DIRECTORY_NAME = "auto-sync-stop-requests";
const MAX_STOP_REQUEST_BYTES = 4 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const REQUEST_TTL_MS = 10_000;

interface StopRequest {
  readonly schemaVersion: 1;
  readonly action: "stop-auto-sync-host";
  readonly hostId: string;
  readonly approval: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
}

export interface FileSystemAutoSyncStopControlOptions {
  readonly version: string;
  readonly pollIntervalMs?: number;
  readonly waitTimeoutMs?: number;
  readonly now?: () => Date;
}

export class FileSystemAutoSyncStopControl implements AutoSyncStopControl {
  private readonly projectPath: string;
  private readonly pollIntervalMs: number;
  private readonly waitTimeoutMs: number;
  private readonly now: () => Date;

  public constructor(
    projectPath: string,
    private readonly registry: AutoSyncHostRegistry,
    private readonly options: FileSystemAutoSyncStopControlOptions
  ) {
    this.projectPath = resolve(projectPath);
    this.pollIntervalMs = boundedDuration(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    this.waitTimeoutMs = boundedDuration(options.waitTimeoutMs, DEFAULT_WAIT_TIMEOUT_MS);
    this.now = options.now ?? (() => new Date());
  }

  public preview(hostId: string): AutoSyncStopPlan {
    const observation = this.registry.inspect().hosts.find((host) => host.hostId === hostId) ?? null;
    const status = this.planStatus(observation);
    return {
      schemaVersion: 1,
      mode: "preview",
      action: "stop-auto-sync-host",
      status,
      projectPath: this.projectPath,
      requestedHostId: hostId,
      target: observation === null ? null : cloneObservation(observation),
      approval: status === "ready" && observation !== null ? this.approvalFor(observation) : null,
      mutation: { performed: false },
      notes: [
        "Approval is bound to the canonical project path and exact current host record.",
        "Apply writes a short-lived cooperative request; it never sends TERM, KILL, or another process signal.",
        "The target host must validate the request and stop itself."
      ]
    };
  }

  public async execute(
    hostId: string,
    options: AutoSyncStopOptions = {}
  ): Promise<AutoSyncStopResult> {
    const plan = this.preview(hostId);
    if (options.apply !== true) {
      return plan;
    }
    if (plan.status !== "ready" || plan.target === null || plan.approval === null) {
      throw new SymbolLatticeError(
        "STOP_TARGET_NOT_READY",
        `Auto-sync host ${hostId} is not ready for a cooperative stop (${plan.status}).`
      );
    }
    if (options.yes !== true) {
      throw new SymbolLatticeError(
        "STOP_CONFIRMATION_REQUIRED",
        'Stopping an auto-sync host requires both "--apply" and "--yes".'
      );
    }
    if (options.approval === undefined || !sameApproval(options.approval, plan.approval)) {
      throw new SymbolLatticeError(
        "STOP_APPROVAL_INVALID",
        "The approval does not match the canonical project and current host record. Run watch-stop without --apply to preview again."
      );
    }

    const requestedAt = this.now();
    const request: StopRequest = {
      schemaVersion: 1,
      action: "stop-auto-sync-host",
      hostId,
      approval: plan.approval,
      requestedAt: requestedAt.toISOString(),
      expiresAt: new Date(requestedAt.getTime() + REQUEST_TTL_MS).toISOString()
    };
    this.writeRequest(request);
    const stopped = await this.waitForStop(hostId);
    if (!stopped) {
      this.removeMatchingRequest(request);
    }

    const result: AutoSyncStopExecutionResult = {
      schemaVersion: 1,
      mode: "apply",
      action: "stop-auto-sync-host",
      status: stopped ? "stopped" : "request-timeout",
      projectPath: this.projectPath,
      target: toRecord(plan.target),
      approval: plan.approval,
      request: {
        requestedAt: request.requestedAt,
        expiresAt: request.expiresAt
      },
      completedAt: this.now().toISOString(),
      mutation: { performed: true, operation: "cooperative-stop-request" },
      error: stopped
        ? null
        : {
            code: "STOP_REQUEST_TIMEOUT",
            message: "The host did not acknowledge the cooperative stop request before the bounded timeout."
          }
    };
    return result;
  }

  public monitor(record: AutoSyncHostRecord, onStop: () => void): AutoSyncStopMonitor {
    let closed = false;
    let handling = false;
    const poll = (): void => {
      if (closed || handling) return;
      let request: StopRequest | null;
      try {
        request = this.readRequest(record.hostId);
        if (request === null || !this.validRequestFor(record, request)) return;
      } catch {
        // A removed or no-longer-canonical project cannot authorize a stop.
        return;
      }
      handling = true;
      closed = true;
      clearInterval(timer);
      this.removeMatchingRequest(request);
      onStop();
    };
    const timer = setInterval(poll, this.pollIntervalMs);
    timer.unref();
    poll();
    return {
      close: () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
      }
    };
  }

  private planStatus(observation: AutoSyncHostObservation | null): AutoSyncStopPlanStatus {
    if (observation === null) return "host-not-found";
    if (observation.liveness === "stale") return "host-not-live";
    if (observation.liveness === "unverifiable") return "host-unverifiable";
    return observation.version === this.options.version ? "ready" : "incompatible-host-version";
  }

  private approvalFor(record: AutoSyncHostRecord): string {
    const canonicalProjectPath = realpathSync.native(this.projectPath);
    const canonical = JSON.stringify({
      schemaVersion: 1,
      action: "stop-auto-sync-host",
      projectPath:
        process.platform === "win32" ? canonicalProjectPath.toLowerCase() : canonicalProjectPath,
      host: {
        schemaVersion: record.schemaVersion,
        hostId: record.hostId,
        kind: record.kind,
        pid: record.pid,
        version: record.version,
        startedAt: record.startedAt
      }
    });
    return `watch-stop:${createHash("sha256").update(canonical).digest("hex")}`;
  }

  private validRequestFor(record: AutoSyncHostRecord, request: StopRequest): boolean {
    const now = this.now().getTime();
    return (
      request.hostId === record.hostId &&
      sameApproval(request.approval, this.approvalFor(record)) &&
      Date.parse(request.requestedAt) <= now &&
      Date.parse(request.expiresAt) >= now &&
      Date.parse(request.expiresAt) - Date.parse(request.requestedAt) === REQUEST_TTL_MS
    );
  }

  private async waitForStop(hostId: string): Promise<boolean> {
    const deadline = Date.now() + this.waitTimeoutMs;
    while (Date.now() < deadline) {
      if (!this.registry.inspect().hosts.some((host) => host.hostId === hostId)) return true;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, this.pollIntervalMs));
    }
    return !this.registry.inspect().hosts.some((host) => host.hostId === hostId);
  }

  private writeRequest(request: StopRequest): void {
    const directory = this.requestDirectory();
    const target = this.requestPath(request.hostId);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(temporary, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporary, target);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // Preserve the original request-write failure.
      }
      throw new SymbolLatticeError(
        "STOP_REQUEST_WRITE_FAILED",
        error instanceof Error ? error.message : "Could not write the cooperative stop request."
      );
    }
  }

  private readRequest(hostId: string): StopRequest | null {
    const path = this.requestPath(hostId);
    if (!existsSync(path)) return null;
    try {
      const raw = readBounded(path);
      if (raw === null) return null;
      const value = JSON.parse(raw) as Partial<StopRequest>;
      if (
        value.schemaVersion !== 1 ||
        value.action !== "stop-auto-sync-host" ||
        value.hostId !== hostId ||
        typeof value.approval !== "string" ||
        typeof value.requestedAt !== "string" ||
        typeof value.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(value.requestedAt)) ||
        !Number.isFinite(Date.parse(value.expiresAt))
      ) return null;
      return value as StopRequest;
    } catch {
      return null;
    }
  }

  private removeMatchingRequest(expected: StopRequest): void {
    const path = this.requestPath(expected.hostId);
    try {
      const current = this.readRequest(expected.hostId);
      if (current !== null && sameRequest(current, expected)) unlinkSync(path);
    } catch {
      // A raced replacement or already-removed request is not ours to delete.
    }
  }

  private requestDirectory(): string {
    return join(this.projectPath, INDEX_DIRECTORY_NAME, AUTO_SYNC_STOP_REQUEST_DIRECTORY_NAME);
  }

  private requestPath(hostId: string): string {
    return join(this.requestDirectory(), `${hostId}.json`);
  }
}

function readBounded(path: string): string | null {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_STOP_REQUEST_BYTES + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    return bytesRead > MAX_STOP_REQUEST_BYTES ? null : buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
}

function boundedDuration(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function sameApproval(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sameRequest(left: StopRequest, right: StopRequest): boolean {
  return (
    left.hostId === right.hostId &&
    left.approval === right.approval &&
    left.requestedAt === right.requestedAt &&
    left.expiresAt === right.expiresAt
  );
}

function cloneObservation(host: AutoSyncHostObservation): AutoSyncHostObservation {
  return { ...host, probeError: host.probeError === null ? null : { ...host.probeError } };
}

function toRecord(host: AutoSyncHostObservation): AutoSyncHostRecord {
  return {
    schemaVersion: host.schemaVersion,
    hostId: host.hostId,
    kind: host.kind,
    pid: host.pid,
    version: host.version,
    startedAt: host.startedAt
  };
}

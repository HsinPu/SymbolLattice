import { createHash, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import {
  SymbolLatticeError,
  type AutoSyncHostObservation,
  type AutoSyncHostRecord,
  type AutoSyncHostRegistry,
  type AutoSyncRestartControl,
  type AutoSyncRestartExecutionResult,
  type AutoSyncRestartOptions,
  type AutoSyncRestartPlan,
  type AutoSyncRestartPlanStatus,
  type AutoSyncRestartResult,
  type AutoSyncStartCommand,
  type AutoSyncStartControl,
  type AutoSyncStartExecutionResult,
  type AutoSyncStopControl,
  type AutoSyncStopExecutionResult
} from "../../application/index.js";

export interface FileSystemAutoSyncRestartControlOptions {
  readonly version: string;
  readonly now?: () => Date;
}

export class FileSystemAutoSyncRestartControl implements AutoSyncRestartControl {
  private readonly projectPath: string;
  private readonly now: () => Date;

  public constructor(
    projectPath: string,
    private readonly registry: AutoSyncHostRegistry,
    private readonly stopControl: AutoSyncStopControl,
    private readonly startControl: AutoSyncStartControl,
    private readonly options: FileSystemAutoSyncRestartControlOptions
  ) {
    this.projectPath = realpathSync.native(resolve(projectPath));
    this.now = options.now ?? (() => new Date());
  }

  public async preview(hostId: string): Promise<AutoSyncRestartPlan> {
    const registry = this.registry.inspect();
    const target = registry.hosts.find((host) => host.hostId === hostId) ?? null;
    const conflictingHosts = registry.hosts
      .filter((host) => host.hostId !== hostId && host.liveness !== "stale")
      .map(cloneObservation);
    const status = this.planStatus(registry, target, conflictingHosts);
    const command = status === "ready" ? await this.startControl.describeCommand() : null;
    return {
      schemaVersion: 1,
      mode: "preview",
      action: "restart-auto-sync-host",
      status,
      projectPath: this.projectPath,
      requestedHostId: hostId,
      target: target === null ? null : cloneObservation(target),
      command,
      conflictingHosts,
      approval:
        status === "ready" && target !== null && command !== null
          ? this.approvalFor(target, command)
          : null,
      mutation: { performed: false },
      notes: [
        "Approval binds the canonical project, exact current foreground host record, replacement command, and SHA-256 of executable JavaScript inputs.",
        "Apply requests a cooperative stop and proves the old host is absent before any replacement launch is attempted.",
        "Partial failure returns an attributed receipt; restart never sends TERM, KILL, or another process signal."
      ]
    };
  }

  public async execute(
    hostId: string,
    options: AutoSyncRestartOptions = {}
  ): Promise<AutoSyncRestartResult> {
    const plan = await this.preview(hostId);
    if (options.apply !== true) return plan;
    if (
      plan.status !== "ready" ||
      plan.target === null ||
      plan.command === null ||
      plan.approval === null
    ) {
      throw new SymbolLatticeError(
        "RESTART_TARGET_NOT_READY",
        `Auto-sync host ${hostId} is not ready for a safe restart (${plan.status}).`
      );
    }
    if (options.yes !== true) {
      throw new SymbolLatticeError(
        "RESTART_CONFIRMATION_REQUIRED",
        'Restarting an auto-sync host requires both "--apply" and "--yes".'
      );
    }
    if (options.approval === undefined || !sameText(options.approval, plan.approval)) {
      throw new SymbolLatticeError(
        "RESTART_APPROVAL_INVALID",
        "The approval does not match the current host identity and replacement launch plan. Run watch-restart without --apply to preview again."
      );
    }
    const approvedPlan = {
      ...plan,
      target: plan.target,
      command: plan.command,
      approval: plan.approval
    };

    const stopPlan = this.stopControl.preview(hostId);
    if (
      stopPlan.status !== "ready" ||
      stopPlan.target === null ||
      stopPlan.approval === null ||
      !sameHostRecord(approvedPlan.target, stopPlan.target)
    ) {
      throw new SymbolLatticeError(
        "RESTART_TARGET_CHANGED",
        "The target host changed after restart approval. No cooperative stop request was written."
      );
    }
    const stopResult = await this.stopControl.execute(hostId, {
      apply: true,
      yes: true,
      approval: stopPlan.approval
    });
    if (stopResult.mode !== "apply") {
      throw new SymbolLatticeError(
        "RESTART_STOP_RECEIPT_INVALID",
        "The cooperative stop control did not return an apply receipt."
      );
    }
    if (stopResult.status !== "stopped") {
      return this.receipt(
        "stop-timeout",
        approvedPlan,
        stopResult,
        null,
        false,
        stopResult.error ?? restartError("RESTART_STOP_TIMEOUT", "The old host did not stop before the bounded timeout.")
      );
    }

    const postStopRegistry = this.registry.inspect();
    const postStopConflicts = postStopRegistry.hosts.filter(
      (host) => host.liveness !== "stale"
    );
    if (
      postStopRegistry.state === "failed" ||
      postStopRegistry.truncated ||
      postStopRegistry.retained !== postStopRegistry.returned ||
      postStopConflicts.length > 0
    ) {
      const reason =
        postStopRegistry.state === "failed"
          ? "registry-failed"
          : postStopRegistry.truncated || postStopRegistry.retained !== postStopRegistry.returned
            ? "registry-incomplete"
            : "conflicting-host";
      return this.receipt(
        "start-not-ready",
        approvedPlan,
        stopResult,
        null,
        false,
        restartError(
          "RESTART_START_NOT_READY",
          `The old host stopped, but the post-stop registry barrier failed (${reason}).`
        )
      );
    }

    const startPlan = await this.startControl.preview();
    if (startPlan.status !== "ready" || startPlan.approval === null) {
      return this.receipt(
        "start-not-ready",
        approvedPlan,
        stopResult,
        null,
        false,
        restartError(
          "RESTART_START_NOT_READY",
          `The old host stopped, but the replacement is not ready to start (${startPlan.status}).`
        )
      );
    }
    if (!sameCommand(approvedPlan.command, startPlan.command)) {
      return this.receipt(
        "start-plan-changed",
        approvedPlan,
        stopResult,
        null,
        false,
        restartError(
          "RESTART_START_PLAN_CHANGED",
          "The replacement command or executable JavaScript changed after the old host stopped. Preview a new restart approval."
        )
      );
    }

    let startResult: AutoSyncStartExecutionResult;
    try {
      const executed = await this.startControl.execute({
        apply: true,
        yes: true,
        approval: startPlan.approval
      });
      if (executed.mode !== "apply") {
        return this.receipt(
          "start-failed",
          approvedPlan,
          stopResult,
          null,
          true,
          restartError("RESTART_START_RECEIPT_INVALID", "The start control did not return an apply receipt.")
        );
      }
      startResult = executed;
    } catch (error) {
      return this.receipt(
        "start-failed",
        approvedPlan,
        stopResult,
        null,
        true,
        restartError(
          error instanceof SymbolLatticeError ? error.code : "RESTART_START_FAILED",
          error instanceof Error ? error.message : "The replacement launch failed."
        )
      );
    }

    return this.receipt(
      startResult.status === "started" ? "restarted" : "registration-timeout",
      approvedPlan,
      stopResult,
      startResult,
      true,
      startResult.error
    );
  }

  private planStatus(
    registry: ReturnType<AutoSyncHostRegistry["inspect"]>,
    target: AutoSyncHostObservation | null,
    conflictingHosts: readonly AutoSyncHostObservation[]
  ): AutoSyncRestartPlanStatus {
    if (registry.state === "failed") return "registry-failed";
    if (registry.truncated || registry.retained !== registry.returned) return "registry-incomplete";
    if (target === null) return "host-not-found";
    if (target.liveness === "stale") return "host-not-live";
    if (target.liveness === "unverifiable") return "host-unverifiable";
    if (target.version !== this.options.version) return "incompatible-host-version";
    if (target.kind !== "foreground-watch") return "unsupported-host-kind";
    if (conflictingHosts.some((host) => host.liveness === "unverifiable")) {
      return "conflicting-host-unverifiable";
    }
    return conflictingHosts.length > 0 ? "conflicting-host" : "ready";
  }

  private approvalFor(target: AutoSyncHostRecord, command: AutoSyncStartCommand): string {
    const canonical = JSON.stringify({
      schemaVersion: 1,
      action: "restart-auto-sync-host",
      version: this.options.version,
      projectPath: platformPath(this.projectPath),
      target: hostIdentity(target),
      command: canonicalCommand(command)
    });
    return `watch-restart:${createHash("sha256").update(canonical).digest("hex")}`;
  }

  private receipt(
    status: AutoSyncRestartExecutionResult["status"],
    plan: AutoSyncRestartPlan & {
      readonly target: AutoSyncHostObservation;
      readonly command: AutoSyncStartCommand;
      readonly approval: string;
    },
    stop: AutoSyncStopExecutionResult,
    start: AutoSyncStartExecutionResult | null,
    startAttempted: boolean,
    error: AutoSyncRestartExecutionResult["error"]
  ): AutoSyncRestartExecutionResult {
    const operations: AutoSyncRestartExecutionResult["mutation"]["operations"] =
      start === null
        ? ["cooperative-stop-request"]
        : ["cooperative-stop-request", "detached-watch-launch"];
    return {
      schemaVersion: 1,
      mode: "apply",
      action: "restart-auto-sync-host",
      status,
      projectPath: this.projectPath,
      target: toRecord(plan.target),
      command: plan.command,
      approval: plan.approval,
      stop,
      start,
      completedAt: this.now().toISOString(),
      mutation: { performed: true, operations, startAttempted },
      error
    };
  }
}

function cloneObservation(host: AutoSyncHostObservation): AutoSyncHostObservation {
  return { ...host, probeError: host.probeError === null ? null : { ...host.probeError } };
}

function toRecord(host: AutoSyncHostRecord): AutoSyncHostRecord {
  return hostIdentity(host);
}

function hostIdentity(host: AutoSyncHostRecord): AutoSyncHostRecord {
  return {
    schemaVersion: 1,
    hostId: host.hostId,
    kind: host.kind,
    pid: host.pid,
    version: host.version,
    startedAt: host.startedAt
  };
}

function sameHostRecord(left: AutoSyncHostRecord, right: AutoSyncHostRecord): boolean {
  return JSON.stringify(hostIdentity(left)) === JSON.stringify(hostIdentity(right));
}

function sameCommand(left: AutoSyncStartCommand, right: AutoSyncStartCommand): boolean {
  return JSON.stringify(canonicalCommand(left)) === JSON.stringify(canonicalCommand(right));
}

function canonicalCommand(command: AutoSyncStartCommand): object {
  return {
    executable: platformPath(command.executable),
    arguments: command.arguments.map((value, index) => (index === 2 ? platformPath(value) : value)),
    workingDirectory: platformPath(command.workingDirectory),
    logPath: platformPath(command.logPath),
    pluginModulePaths: command.pluginModulePaths.map(platformPath),
    integrity: {
      entrySha256: command.integrity.entrySha256,
      pluginModules: command.integrity.pluginModules.map((module) => ({
        path: platformPath(module.path),
        sha256: module.sha256
      }))
    }
  };
}

function platformPath(value: string): string {
  const canonical = resolve(value);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function restartError(code: string, message: string): NonNullable<AutoSyncRestartExecutionResult["error"]> {
  return { code, message };
}

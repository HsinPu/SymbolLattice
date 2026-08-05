import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  resolveSymbolLatticePluginModulePaths,
  SymbolLatticeError,
  type AutoSyncHostObservation,
  type AutoSyncHostRegistry,
  type AutoSyncStartCommand,
  type AutoSyncStartControl,
  type AutoSyncStartExecutionResult,
  type AutoSyncStartLaunchOptions,
  type AutoSyncStartOptions,
  type AutoSyncStartPlan,
  type AutoSyncStartPlanStatus,
  type AutoSyncStartResult
} from "../../application/index.js";

const INDEX_DIRECTORY_NAME = ".symbol-lattice";
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
export const MANAGED_AUTO_SYNC_HOST_ID_ENV = "SYMBOL_LATTICE_MANAGED_HOST_ID";

export interface DetachedWatchLaunchRequest {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly logPath: string;
  readonly hostId: string;
}

export interface DetachedWatchLauncher {
  launch(request: DetachedWatchLaunchRequest): { readonly pid: number };
}

export interface FileSystemAutoSyncStartControlOptions {
  readonly version: string;
  readonly executablePath: string;
  readonly entryPath: string;
  readonly launch: AutoSyncStartLaunchOptions;
  readonly pollIntervalMs?: number;
  readonly waitTimeoutMs?: number;
  readonly now?: () => Date;
  readonly hostIdFactory?: () => string;
}

class NodeDetachedWatchLauncher implements DetachedWatchLauncher {
  public launch(request: DetachedWatchLaunchRequest): { readonly pid: number } {
    mkdirSync(dirname(request.logPath), { recursive: true });
    const logFd = openSync(request.logPath, "a", 0o600);
    try {
      const child = spawn(request.executable, [...request.arguments], {
        cwd: request.workingDirectory,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, [MANAGED_AUTO_SYNC_HOST_ID_ENV]: request.hostId }
      });
      if (child.pid === undefined) {
        throw new Error("The detached watch process did not report a PID.");
      }
      child.unref();
      return { pid: child.pid };
    } finally {
      closeSync(logFd);
    }
  }
}

export class FileSystemAutoSyncStartControl implements AutoSyncStartControl {
  private readonly projectPath: string;
  private readonly pollIntervalMs: number;
  private readonly waitTimeoutMs: number;
  private readonly now: () => Date;
  private readonly hostIdFactory: () => string;

  public constructor(
    projectPath: string,
    private readonly registry: AutoSyncHostRegistry,
    private readonly options: FileSystemAutoSyncStartControlOptions,
    private readonly launcher: DetachedWatchLauncher = new NodeDetachedWatchLauncher()
  ) {
    this.projectPath = realpathSync.native(resolve(projectPath));
    this.pollIntervalMs = boundedDuration(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    this.waitTimeoutMs = boundedDuration(options.waitTimeoutMs, DEFAULT_WAIT_TIMEOUT_MS);
    this.now = options.now ?? (() => new Date());
    this.hostIdFactory = options.hostIdFactory ?? randomUUID;
  }

  public async preview(): Promise<AutoSyncStartPlan> {
    const command = await this.describeCommand();
    const registry = this.registry.inspect();
    const conflictingHosts = registry.hosts
      .filter((host) => host.liveness !== "stale")
      .map(cloneObservation);
    const status = this.planStatus(registry.state, conflictingHosts);
    return {
      schemaVersion: 1,
      mode: "preview",
      action: "start-auto-sync-host",
      status,
      projectPath: this.projectPath,
      command,
      conflictingHosts,
      approval: status === "ready" ? this.approvalFor(command) : null,
      mutation: { performed: false },
      notes: [
        "Approval is bound to the canonical project, executable, entry point, launch options, and SHA-256 of executable JavaScript inputs.",
        "Apply starts one detached watch process without a shell and waits for its exact host ID to appear in the project registry.",
        "A timeout never triggers TERM, KILL, or another process signal; inspect watch-status before retrying."
      ]
    };
  }

  public async execute(options: AutoSyncStartOptions = {}): Promise<AutoSyncStartResult> {
    const plan = await this.preview();
    if (options.apply !== true) return plan;
    if (plan.status !== "ready" || plan.approval === null) {
      throw new SymbolLatticeError(
        "START_TARGET_NOT_READY",
        `An auto-sync host cannot be started for this project (${plan.status}).`
      );
    }
    if (options.yes !== true) {
      throw new SymbolLatticeError(
        "START_CONFIRMATION_REQUIRED",
        'Starting a detached auto-sync host requires both "--apply" and "--yes".'
      );
    }
    if (options.approval === undefined || !sameApproval(options.approval, plan.approval)) {
      throw new SymbolLatticeError(
        "START_APPROVAL_INVALID",
        "The approval does not match the current canonical launch plan. Run watch-start without --apply to preview again."
      );
    }

    const hostId = this.hostIdFactory();
    const launched = this.launcher.launch({ ...plan.command, hostId });
    const host = await this.waitForHost(hostId, launched.pid);
    const result: AutoSyncStartExecutionResult = {
      schemaVersion: 1,
      mode: "apply",
      action: "start-auto-sync-host",
      status: host === null ? "registration-timeout" : "started",
      projectPath: this.projectPath,
      command: plan.command,
      approval: plan.approval,
      hostId,
      pid: launched.pid,
      host,
      completedAt: this.now().toISOString(),
      mutation: { performed: true, operation: "detached-watch-launch" },
      error:
        host === null
          ? {
              code: "START_REGISTRATION_TIMEOUT",
              message: "The detached process did not publish the expected live host record before the bounded timeout."
            }
          : null
    };
    return result;
  }

  public async describeCommand(): Promise<AutoSyncStartCommand> {
    const canonicalProject = realpathSync.native(this.projectPath);
    const canonicalEntry = realpathSync.native(resolve(this.options.entryPath));
    const canonicalExecutable = realpathSync.native(resolve(this.options.executablePath));
    const pluginModulePaths = await resolveSymbolLatticePluginModulePaths({
      projectPath: canonicalProject,
      modulePaths: this.options.launch.pluginModulePaths ?? [],
      allowExternalModules: this.options.launch.allowExternalPlugin ?? false
    });
    const arguments_: string[] = [
      canonicalEntry,
      "watch",
      canonicalProject,
      "--interval",
      String(this.options.launch.intervalMs),
      "--json"
    ];
    if (this.options.launch.force === true) arguments_.push("--force");
    if (this.options.launch.poll === true) arguments_.push("--poll");
    for (const modulePath of pluginModulePaths) arguments_.push("--plugin", modulePath);
    if (this.options.launch.allowExternalPlugin === true) arguments_.push("--allow-external-plugin");
    return {
      executable: canonicalExecutable,
      arguments: arguments_,
      workingDirectory: canonicalProject,
      logPath: join(canonicalProject, INDEX_DIRECTORY_NAME, "auto-sync-host.log"),
      pluginModulePaths,
      integrity: {
        entrySha256: sha256File(canonicalEntry),
        pluginModules: pluginModulePaths.map((path) => ({ path, sha256: sha256File(path) }))
      }
    };
  }

  private planStatus(
    registryState: ReturnType<AutoSyncHostRegistry["inspect"]>["state"],
    hosts: readonly AutoSyncHostObservation[]
  ): AutoSyncStartPlanStatus {
    if (registryState === "failed") return "registry-failed";
    if (hosts.some((host) => host.liveness === "unverifiable")) return "host-unverifiable";
    return hosts.length > 0 ? "host-already-live" : "ready";
  }

  private approvalFor(command: AutoSyncStartCommand): string {
    const canonical = JSON.stringify({
      schemaVersion: 1,
      action: "start-auto-sync-host",
      version: this.options.version,
      projectPath: platformPath(this.projectPath),
      command: {
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
      }
    });
    return `watch-start:${createHash("sha256").update(canonical).digest("hex")}`;
  }

  private async waitForHost(hostId: string, pid: number): Promise<AutoSyncHostObservation | null> {
    const deadline = Date.now() + this.waitTimeoutMs;
    while (Date.now() < deadline) {
      const host = this.matchingHost(hostId, pid);
      if (host !== null) return host;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, this.pollIntervalMs));
    }
    return this.matchingHost(hostId, pid);
  }

  private matchingHost(hostId: string, pid: number): AutoSyncHostObservation | null {
    const host = this.registry.inspect().hosts.find((candidate) => candidate.hostId === hostId);
    return host?.kind === "foreground-watch" &&
      host.pid === pid &&
      host.version === this.options.version &&
      host.liveness === "live"
      ? cloneObservation(host)
      : null;
  }
}

function cloneObservation(host: AutoSyncHostObservation): AutoSyncHostObservation {
  return { ...host, probeError: host.probeError === null ? null : { ...host.probeError } };
}

function boundedDuration(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function platformPath(value: string): string {
  const canonical = resolve(value);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function sameApproval(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

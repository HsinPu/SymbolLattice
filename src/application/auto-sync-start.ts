import type { AutoSyncHostObservation } from "./auto-sync-host-registry.js";
import type { WatchReceipt } from "./watch.js";

export type AutoSyncStartPlanStatus =
  | "ready"
  | "host-already-live"
  | "host-unverifiable"
  | "registry-failed";

export interface AutoSyncStartLaunchOptions {
  readonly force?: boolean;
  readonly intervalMs: number;
  readonly poll?: boolean;
  readonly pluginModulePaths?: readonly string[];
  readonly allowExternalPlugin?: boolean;
}

export interface AutoSyncStartCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly logPath: string;
  readonly pluginModulePaths: readonly string[];
  readonly integrity: {
    readonly entrySha256: string;
    readonly pluginModules: readonly {
      readonly path: string;
      readonly sha256: string;
    }[];
  };
}

export interface AutoSyncStartPlan {
  readonly schemaVersion: 1;
  readonly mode: "preview";
  readonly action: "start-auto-sync-host";
  readonly status: AutoSyncStartPlanStatus;
  readonly projectPath: string;
  readonly command: AutoSyncStartCommand;
  readonly conflictingHosts: readonly AutoSyncHostObservation[];
  readonly approval: string | null;
  readonly mutation: { readonly performed: false };
  readonly notes: readonly string[];
}

export interface AutoSyncStartExecutionResult {
  readonly schemaVersion: 1;
  readonly mode: "apply";
  readonly action: "start-auto-sync-host";
  readonly status: "started" | "registration-timeout";
  readonly projectPath: string;
  readonly command: AutoSyncStartCommand;
  readonly approval: string;
  readonly hostId: string;
  readonly pid: number;
  readonly host: AutoSyncHostObservation | null;
  readonly completedAt: string;
  readonly mutation: {
    readonly performed: true;
    readonly operation: "detached-watch-launch";
  };
  readonly error: WatchReceipt["error"];
}

export type AutoSyncStartResult = AutoSyncStartPlan | AutoSyncStartExecutionResult;

export interface AutoSyncStartOptions {
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly approval?: string;
}

/** Preview-first lifecycle seam for launching one independently managed writer host. */
export interface AutoSyncStartControl {
  /** Resolve and hash the exact shell-free launch command without inspecting or changing host state. */
  describeCommand(): Promise<AutoSyncStartCommand>;
  preview(): Promise<AutoSyncStartPlan>;
  execute(options?: AutoSyncStartOptions): Promise<AutoSyncStartResult>;
}

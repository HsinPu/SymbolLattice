import type { AutoSyncHostObservation, AutoSyncHostRecord } from "./auto-sync-host-registry.js";
import type {
  AutoSyncStartCommand,
  AutoSyncStartExecutionResult
} from "./auto-sync-start.js";
import type { AutoSyncStopExecutionResult } from "./auto-sync-stop.js";
import type { WatchReceipt } from "./watch.js";

export type AutoSyncRestartPlanStatus =
  | "ready"
  | "registry-failed"
  | "registry-incomplete"
  | "host-not-found"
  | "host-not-live"
  | "host-unverifiable"
  | "incompatible-host-version"
  | "unsupported-host-kind"
  | "conflicting-host"
  | "conflicting-host-unverifiable";

export interface AutoSyncRestartPlan {
  readonly schemaVersion: 1;
  readonly mode: "preview";
  readonly action: "restart-auto-sync-host";
  readonly status: AutoSyncRestartPlanStatus;
  readonly projectPath: string;
  readonly requestedHostId: string;
  readonly target: AutoSyncHostObservation | null;
  readonly command: AutoSyncStartCommand | null;
  readonly conflictingHosts: readonly AutoSyncHostObservation[];
  readonly approval: string | null;
  readonly mutation: { readonly performed: false };
  readonly notes: readonly string[];
}

export type AutoSyncRestartExecutionStatus =
  | "restarted"
  | "stop-timeout"
  | "start-not-ready"
  | "start-plan-changed"
  | "registration-timeout"
  | "start-failed";

export interface AutoSyncRestartExecutionResult {
  readonly schemaVersion: 1;
  readonly mode: "apply";
  readonly action: "restart-auto-sync-host";
  readonly status: AutoSyncRestartExecutionStatus;
  readonly projectPath: string;
  readonly target: AutoSyncHostRecord;
  readonly command: AutoSyncStartCommand;
  readonly approval: string;
  readonly stop: AutoSyncStopExecutionResult;
  readonly start: AutoSyncStartExecutionResult | null;
  readonly completedAt: string;
  readonly mutation: {
    readonly performed: true;
    readonly operations: readonly (
      | "cooperative-stop-request"
      | "detached-watch-launch"
    )[];
    readonly startAttempted: boolean;
  };
  readonly error: WatchReceipt["error"];
}

export type AutoSyncRestartResult = AutoSyncRestartPlan | AutoSyncRestartExecutionResult;

export interface AutoSyncRestartOptions {
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly approval?: string;
}

/** Preview-first transaction that replaces one proven foreground watch host. */
export interface AutoSyncRestartControl {
  preview(hostId: string): Promise<AutoSyncRestartPlan>;
  execute(hostId: string, options?: AutoSyncRestartOptions): Promise<AutoSyncRestartResult>;
}

import type { AutoSyncHostObservation, AutoSyncHostRecord } from "./auto-sync-host-registry.js";
import type { WatchReceipt } from "./watch.js";

export type AutoSyncStopPlanStatus =
  | "ready"
  | "host-not-found"
  | "host-not-live"
  | "host-unverifiable"
  | "incompatible-host-version";

export interface AutoSyncStopPlan {
  readonly schemaVersion: 1;
  readonly mode: "preview";
  readonly action: "stop-auto-sync-host";
  readonly status: AutoSyncStopPlanStatus;
  readonly projectPath: string;
  readonly requestedHostId: string;
  readonly target: AutoSyncHostObservation | null;
  readonly approval: string | null;
  readonly mutation: { readonly performed: false };
  readonly notes: readonly string[];
}

export interface AutoSyncStopExecutionResult {
  readonly schemaVersion: 1;
  readonly mode: "apply";
  readonly action: "stop-auto-sync-host";
  readonly status: "stopped" | "request-timeout";
  readonly projectPath: string;
  readonly target: AutoSyncHostRecord;
  readonly approval: string;
  readonly request: {
    readonly requestedAt: string;
    readonly expiresAt: string;
  };
  readonly completedAt: string;
  readonly mutation: {
    readonly performed: true;
    readonly operation: "cooperative-stop-request";
  };
  readonly error: WatchReceipt["error"];
}

export type AutoSyncStopResult = AutoSyncStopPlan | AutoSyncStopExecutionResult;

export interface AutoSyncStopOptions {
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly approval?: string;
}

export interface AutoSyncStopMonitor {
  close(): void;
}

export interface AutoSyncStopControl {
  preview(hostId: string): AutoSyncStopPlan;
  execute(hostId: string, options?: AutoSyncStopOptions): Promise<AutoSyncStopResult>;
  monitor(record: AutoSyncHostRecord, onStop: () => void): AutoSyncStopMonitor;
}

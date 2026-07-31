/**
 * Project-scoped ownership is required before a foreground watcher may write
 * automatic graph updates. The MCP request surface never receives this port.
 */
export type AutoSyncOwnerLeaseState = "not-required" | "acquiring" | "owned" | "unavailable";

/** A safe, host-local explanation for a lease state; it never exposes another host's PID or path. */
export interface AutoSyncOwnerLeaseError {
  readonly code: string;
  readonly message: string;
}

/** Read-only lease state included in the MCP auto-sync health snapshot. */
export interface AutoSyncOwnerLeaseStatus {
  readonly state: AutoSyncOwnerLeaseState;
  readonly observedAt: string | null;
  readonly error: AutoSyncOwnerLeaseError | null;
}

/** A caller that acquired the exclusive owner lease and must release it during shutdown. */
export interface AcquiredAutoSyncOwnerLease {
  readonly state: "owned";
  release(): void;
}

/** A caller that must not start a watcher because another owner or lock failure won the race. */
export interface UnavailableAutoSyncOwnerLease {
  readonly state: "unavailable";
  readonly error: AutoSyncOwnerLeaseError;
}

export type AutoSyncOwnerLeaseResult =
  | AcquiredAutoSyncOwnerLease
  | UnavailableAutoSyncOwnerLease;

/**
 * Infrastructure port for an exclusive, project-local automatic-sync owner.
 * Acquiring it is a CLI lifecycle operation, never an MCP request operation.
 */
export interface AutoSyncOwnerLease {
  acquire(): AutoSyncOwnerLeaseResult;
}

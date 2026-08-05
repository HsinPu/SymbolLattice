import type { WatchReceipt } from "./watch.js";

export const MAX_AUTO_SYNC_HOST_RECORDS = 128;

export type AutoSyncHostKind = "foreground-watch" | "mcp-auto-sync";
export type AutoSyncHostLiveness = "live" | "stale" | "unverifiable";

export interface AutoSyncHostRecord {
  readonly schemaVersion: 1;
  readonly hostId: string;
  readonly kind: AutoSyncHostKind;
  readonly pid: number;
  readonly version: string;
  readonly startedAt: string;
}

export interface AutoSyncHostObservation extends AutoSyncHostRecord {
  readonly liveness: AutoSyncHostLiveness;
  readonly observedAt: string;
  readonly probeError: WatchReceipt["error"];
}

export interface AutoSyncHostRegistryResult {
  readonly state: "available" | "unavailable" | "failed";
  readonly capacity: number;
  readonly retained: number;
  readonly returned: number;
  readonly truncated: boolean;
  readonly error: WatchReceipt["error"];
  readonly hosts: readonly AutoSyncHostObservation[];
}

export type AutoSyncHostRegistration =
  | { readonly state: "registered"; unregister(): void }
  | { readonly state: "failed"; readonly error: NonNullable<WatchReceipt["error"]> };

/** Project-local discovery seam for writer hosts; read inspection never mutates records. */
export interface AutoSyncHostRegistry {
  register(record: AutoSyncHostRecord): AutoSyncHostRegistration;
  inspect(): AutoSyncHostRegistryResult;
}

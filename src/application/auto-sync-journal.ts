import type { AutoSyncDiagnosticEvent, WatchReceipt } from "./watch.js";

/** Maximum durable watcher transitions retained for one indexed project. */
export const MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS = 128;

/** Whether a host can write, only read, cannot find, or failed to read its durable journal. */
export type AutoSyncDiagnosticJournalState = "active" | "read-only" | "unavailable" | "failed";

/** Controls the latest durable transitions returned by a journal query. */
export interface AutoSyncDiagnosticJournalOptions {
  readonly limit?: number;
}

/**
 * Bounded durable watcher history. This is intentionally distinct from the
 * process-local timeline: several MCP hosts may contribute to this project
 * journal, while every individual host retains its own live timeline.
 */
export interface AutoSyncDiagnosticJournalResult {
  readonly state: AutoSyncDiagnosticJournalState;
  readonly capacity: number;
  readonly retained: number;
  readonly returned: number;
  readonly dropped: number;
  readonly truncated: boolean;
  readonly lastPersistedAt: string | null;
  readonly error: WatchReceipt["error"];
  readonly events: readonly AutoSyncDiagnosticEvent[];
}

/**
 * Host-owned persistence seam. MCP request handlers only call `diagnostics`;
 * `append` is reserved for the foreground watcher receipt callback.
 */
export interface AutoSyncDiagnosticJournal {
  append(event: AutoSyncDiagnosticEvent): void;
  diagnostics(options?: AutoSyncDiagnosticJournalOptions): AutoSyncDiagnosticJournalResult;
}

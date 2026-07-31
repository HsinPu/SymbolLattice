import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
  type AutoSyncDiagnosticEvent,
  type AutoSyncDiagnosticJournal,
  type AutoSyncDiagnosticJournalOptions,
  type AutoSyncDiagnosticJournalResult
} from "../../application/index.js";

const INDEX_DIRECTORY_NAME = ".symbol-lattice";
const INDEX_DATABASE_FILE_NAME = "index.sqlite";
export const AUTO_SYNC_DIAGNOSTIC_JOURNAL_FILE_NAME = "auto-sync-diagnostics.sqlite";

const JOURNAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS auto_sync_diagnostic_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    state TEXT NOT NULL,
    watcher_mode TEXT NOT NULL,
    generation_id TEXT,
    error_code TEXT,
    error_message TEXT,
    retry_delay_ms INTEGER,
    pending_file_count INTEGER,
    pending_files_json TEXT NOT NULL,
    pending_files_truncated INTEGER NOT NULL,
    pending_files_unknown INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auto_sync_diagnostic_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auto_sync_diagnostic_events_id_desc
    ON auto_sync_diagnostic_events(id DESC);
`;

interface JournalEventRow {
  readonly host_id: string;
  readonly sequence: number;
  readonly event: string;
  readonly observed_at: string;
  readonly state: string;
  readonly watcher_mode: string;
  readonly generation_id: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly retry_delay_ms: number | null;
  readonly pending_file_count: number | null;
  readonly pending_files_json: string;
  readonly pending_files_truncated: number;
  readonly pending_files_unknown: number;
}

interface CountRow {
  readonly count: number;
}

interface MetaRow {
  readonly value: string;
}

export interface SqliteAutoSyncDiagnosticJournalOptions {
  /** False for an MCP host that must inspect a prior journal without writing it. */
  readonly writable?: boolean;
}

/**
 * Project-local SQLite journal for sanitized foreground watcher transitions.
 * It is deliberately separate from `index.sqlite`: journal I/O must not alter
 * graph schema or turn a read-only MCP request into an index operation.
 */
export class SqliteAutoSyncDiagnosticJournal implements AutoSyncDiagnosticJournal {
  private readonly projectPath: string;
  private readonly writable: boolean;
  private lastWriteError: AutoSyncDiagnosticJournalResult["error"] = null;

  public constructor(
    projectPath: string,
    options: SqliteAutoSyncDiagnosticJournalOptions = {}
  ) {
    this.projectPath = resolve(projectPath);
    this.writable = options.writable ?? true;
  }

  /**
   * Best-effort persistence must never stop an active watcher. An unavailable
   * or failed journal remains visible through `diagnostics` instead.
   */
  public append(event: AutoSyncDiagnosticEvent): void {
    if (!this.canWrite()) {
      return;
    }

    let database: DatabaseSync | null = null;
    let transactionStarted = false;
    try {
      mkdirSync(this.indexDirectoryPath(), { recursive: true });
      database = new DatabaseSync(this.journalPath());
      database.exec(JOURNAL_SCHEMA);
      database.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      this.insertEvent(database, event);
      this.prune(database);
      database.exec("COMMIT");
      transactionStarted = false;
      this.lastWriteError = null;
    } catch (error) {
      if (transactionStarted && database !== null) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Preserve the persistence error, which is the actionable diagnostic.
        }
      }
      this.lastWriteError = journalError(error);
    } finally {
      database?.close();
    }
  }

  /** Reads bounded persisted history without creating a directory, database, or index. */
  public diagnostics(
    options: AutoSyncDiagnosticJournalOptions = {}
  ): AutoSyncDiagnosticJournalResult {
    const limit = journalLimit(options.limit);
    if (!existsSync(this.journalPath())) {
      return emptyJournalResult(this.canWrite() ? "active" : "unavailable", this.lastWriteError);
    }

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(this.journalPath(), { readOnly: true });
      if (!journalSchemaExists(database)) {
        return emptyJournalResult("unavailable", this.lastWriteError);
      }

      const retained = countEvents(database);
      const rows = database
        .prepare(
        `SELECT sequence, event, observed_at, state, watcher_mode, generation_id,
                host_id,
                error_code, error_message, retry_delay_ms, pending_file_count,
                  pending_files_json, pending_files_truncated, pending_files_unknown
           FROM auto_sync_diagnostic_events
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(limit) as unknown as JournalEventRow[];
      const events = rows.reverse().map(toDiagnosticEvent);
      const dropped = readDropped(database);
      const lastPersistedAt = events.at(-1)?.observedAt ?? null;
      return {
        state: this.lastWriteError === null ? (this.canWrite() ? "active" : "read-only") : "failed",
        capacity: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
        retained,
        returned: events.length,
        dropped,
        truncated: dropped > 0 || events.length < retained,
        lastPersistedAt,
        error: this.lastWriteError,
        events: events.map(cloneDiagnosticEvent)
      };
    } catch (error) {
      return emptyJournalResult("failed", journalError(error));
    } finally {
      database?.close();
    }
  }

  private canWrite(): boolean {
    return this.writable && existsSync(join(this.indexDirectoryPath(), INDEX_DATABASE_FILE_NAME));
  }

  private indexDirectoryPath(): string {
    return join(this.projectPath, INDEX_DIRECTORY_NAME);
  }

  private journalPath(): string {
    return join(this.indexDirectoryPath(), AUTO_SYNC_DIAGNOSTIC_JOURNAL_FILE_NAME);
  }

  private insertEvent(database: DatabaseSync, event: AutoSyncDiagnosticEvent): void {
    database
      .prepare(
        `INSERT INTO auto_sync_diagnostic_events(
          host_id, sequence, event, observed_at, state, watcher_mode, generation_id,
          error_code, error_message, retry_delay_ms, pending_file_count,
          pending_files_json, pending_files_truncated, pending_files_unknown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.hostId,
        event.sequence,
        event.event,
        event.observedAt,
        event.state,
        event.watcherMode,
        event.generationId,
        event.error?.code ?? null,
        event.error?.message ?? null,
        event.retryDelayMs,
        event.pendingFileCount,
        JSON.stringify([...event.pendingFiles]),
        Number(event.pendingFilesTruncated),
        Number(event.pendingFilesUnknown)
      );
  }

  private prune(database: DatabaseSync): void {
    const retained = countEvents(database);
    const evicted = Math.max(retained - MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS, 0);
    if (evicted === 0) {
      return;
    }

    database
      .prepare(
        `DELETE FROM auto_sync_diagnostic_events
         WHERE id NOT IN (
           SELECT id
           FROM auto_sync_diagnostic_events
           ORDER BY id DESC
           LIMIT ?
         )`
      )
      .run(MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS);
    const dropped = readDropped(database) + evicted;
    database
      .prepare(
        `INSERT INTO auto_sync_diagnostic_meta(key, value)
         VALUES ('dropped', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(String(dropped));
  }
}

function journalSchemaExists(database: DatabaseSync): boolean {
  return (
    database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'auto_sync_diagnostic_events'"
      )
      .get() !== undefined
  );
}

function countEvents(database: DatabaseSync): number {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM auto_sync_diagnostic_events")
    .get() as unknown as CountRow;
  return row.count;
}

function readDropped(database: DatabaseSync): number {
  const row = database
    .prepare("SELECT value FROM auto_sync_diagnostic_meta WHERE key = 'dropped'")
    .get() as unknown as MetaRow | undefined;
  if (row === undefined) {
    return 0;
  }

  const value = Number(row.value);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Auto-sync diagnostic journal has an invalid dropped-event counter.");
  }
  return value;
}

function journalLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS;
  }
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS
  ) {
    throw new RangeError(
      `Journal limit must be an integer between 1 and ${MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS}.`
    );
  }
  return limit;
}

function emptyJournalResult(
  state: AutoSyncDiagnosticJournalResult["state"],
  error: AutoSyncDiagnosticJournalResult["error"]
): AutoSyncDiagnosticJournalResult {
  return {
    state,
    capacity: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
    retained: 0,
    returned: 0,
    dropped: 0,
    truncated: false,
    lastPersistedAt: null,
    error,
    events: []
  };
}

function journalError(error: unknown): AutoSyncDiagnosticJournalResult["error"] {
  return {
    code: "AUTO_SYNC_JOURNAL_FAILED",
    message: error instanceof Error ? error.message : "Unknown auto-sync diagnostic journal error."
  };
}

function toDiagnosticEvent(row: JournalEventRow): AutoSyncDiagnosticEvent {
  const pendingFiles = parsePendingFiles(row.pending_files_json);
  const error = parseError(row.error_code, row.error_message);
  return {
    hostId: nonEmptyText(row.host_id, "hostId"),
    sequence: positiveInteger(row.sequence, "sequence"),
    event: nonEmptyText(row.event, "event") as AutoSyncDiagnosticEvent["event"],
    observedAt: nonEmptyText(row.observed_at, "observedAt"),
    state: nonEmptyText(row.state, "state") as AutoSyncDiagnosticEvent["state"],
    watcherMode: nonEmptyText(row.watcher_mode, "watcherMode") as AutoSyncDiagnosticEvent["watcherMode"],
    generationId: nullableText(row.generation_id, "generationId"),
    error,
    retryDelayMs: nullablePositiveInteger(row.retry_delay_ms, "retryDelayMs"),
    pendingFileCount: nullableNonNegativeInteger(row.pending_file_count, "pendingFileCount"),
    pendingFiles,
    pendingFilesTruncated: sqliteBoolean(row.pending_files_truncated, "pendingFilesTruncated"),
    pendingFilesUnknown: sqliteBoolean(row.pending_files_unknown, "pendingFilesUnknown")
  };
}

function parsePendingFiles(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Auto-sync diagnostic journal has invalid pending-files JSON.${reason}`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("Auto-sync diagnostic journal pending-files value must be a string array.");
  }
  return [...parsed];
}

function parseError(code: string | null, message: string | null): AutoSyncDiagnosticEvent["error"] {
  if (code === null && message === null) {
    return null;
  }
  if (code === null || message === null) {
    throw new Error("Auto-sync diagnostic journal error fields must be present together.");
  }
  return {
    code: nonEmptyText(code, "error code"),
    message: nonEmptyText(message, "error message")
  };
}

function cloneDiagnosticEvent(event: AutoSyncDiagnosticEvent): AutoSyncDiagnosticEvent {
  return {
    ...event,
    error: event.error === null ? null : { ...event.error },
    pendingFiles: [...event.pendingFiles]
  };
}

function nonEmptyText(value: string, description: string): string {
  if (value.length === 0) {
    throw new Error(`Auto-sync diagnostic journal ${description} must be non-empty.`);
  }
  return value;
}

function nullableText(value: string | null, description: string): string | null {
  return value === null ? null : nonEmptyText(value, description);
}

function positiveInteger(value: number, description: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Auto-sync diagnostic journal ${description} must be a positive integer.`);
  }
  return value;
}

function nullablePositiveInteger(value: number | null, description: string): number | null {
  return value === null ? null : positiveInteger(value, description);
}

function nullableNonNegativeInteger(value: number | null, description: string): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Auto-sync diagnostic journal ${description} must be a non-negative integer.`);
  }
  return value;
}

function sqliteBoolean(value: number, description: string): boolean {
  if (value !== 0 && value !== 1) {
    throw new Error(`Auto-sync diagnostic journal ${description} must be a SQLite boolean.`);
  }
  return value === 1;
}

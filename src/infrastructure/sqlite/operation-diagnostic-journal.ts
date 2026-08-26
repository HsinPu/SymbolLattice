import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  MAX_OPERATION_DIAGNOSTIC_RECORDS,
  OPERATION_DIAGNOSTIC_OPERATIONS,
  OPERATION_DIAGNOSTIC_OUTCOMES,
  OPERATION_DIAGNOSTIC_STAGES,
  type FinishOperationDiagnostic,
  type OperationDiagnosticError,
  type OperationDiagnosticFilters,
  type OperationDiagnosticJournal,
  type OperationDiagnosticJournalResult,
  type OperationDiagnosticOperation,
  type OperationDiagnosticOutcome,
  type OperationDiagnosticRecord,
  type OperationDiagnosticStage,
  type StartOperationDiagnostic
} from "../../application/index.js";

export const OPERATION_DIAGNOSTIC_JOURNAL_FILE_NAME = "operation-diagnostics.sqlite";
const INDEX_DIRECTORY_NAME = ".SymbolLattice";
const BUSY_TIMEOUT_MS = 250;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operation_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms REAL,
  active_stage TEXT NOT NULL,
  completed_stages_json TEXT NOT NULL,
  generation_before TEXT,
  generation_after TEXT,
  error_json TEXT
);
CREATE TABLE IF NOT EXISTS operation_diagnostic_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS operation_diagnostics_id_desc ON operation_diagnostics(id DESC);
`;

interface Row {
  operation_id: string; version: string; operation: string; outcome: string;
  started_at: string; updated_at: string; finished_at: string | null;
  duration_ms: number | null; active_stage: string; completed_stages_json: string;
  generation_before: string | null; generation_after: string | null; error_json: string | null;
}

export interface SqliteOperationDiagnosticJournalOptions { readonly writable?: boolean; }

export class SqliteOperationDiagnosticJournal implements OperationDiagnosticJournal {
  private readonly projectPath: string;
  private readonly writable: boolean;
  private lastError: OperationDiagnosticJournalResult["error"] = null;

  public constructor(projectPath: string, options: SqliteOperationDiagnosticJournalOptions = {}) {
    this.projectPath = resolve(projectPath);
    this.writable = options.writable ?? true;
  }

  public start(input: StartOperationDiagnostic): void {
    this.write((database) => {
      database.prepare(`INSERT INTO operation_diagnostics(
        operation_id, version, operation, outcome, started_at, updated_at, active_stage,
        completed_stages_json, generation_before
      ) VALUES (?, ?, ?, 'running', ?, ?, 'preflight', '[]', ?)`)
        .run(input.operationId, input.version, input.operation, input.startedAt, input.startedAt, input.generationBefore);
    });
  }

  public advance(operationId: string, stage: OperationDiagnosticStage, updatedAt: string): void {
    this.write((database) => {
      const row = database.prepare("SELECT active_stage, completed_stages_json FROM operation_diagnostics WHERE operation_id = ?")
        .get(operationId) as { active_stage: string; completed_stages_json: string } | undefined;
      if (row === undefined) return;
      const completed = parseStages(row.completed_stages_json);
      if (row.active_stage !== stage && isStage(row.active_stage) && !completed.includes(row.active_stage)) completed.push(row.active_stage);
      database.prepare("UPDATE operation_diagnostics SET active_stage = ?, completed_stages_json = ?, updated_at = ? WHERE operation_id = ? AND outcome = 'running'")
        .run(stage, JSON.stringify(completed), updatedAt, operationId);
    });
  }

  public complete(operationId: string, input: FinishOperationDiagnostic): void {
    this.finish(operationId, "completed", input);
  }

  public fail(operationId: string, input: FinishOperationDiagnostic): void {
    this.finish(operationId, "failed", input);
  }

  public state(): Pick<OperationDiagnosticJournalResult, "state" | "error"> {
    return { state: this.lastError === null ? (this.writable ? "active" : "read-only") : "failed", error: this.lastError };
  }

  public diagnostics(options: OperationDiagnosticFilters = {}): OperationDiagnosticJournalResult {
    const limit = normalizeLimit(options.limit);
    if (!existsSync(this.path())) return empty(this.writable ? "unavailable" : "unavailable", this.lastError);
    let database: DatabaseSync | null = null;
    try {
      database = this.open(true);
      if (!hasSchema(database)) return empty("unavailable", this.lastError);
      const retained = Number((database.prepare("SELECT COUNT(*) AS count FROM operation_diagnostics").get() as { count: number }).count);
      const clauses: string[] = [];
      const parameters: string[] = [];
      if (options.operation !== undefined) { validateOperation(options.operation); clauses.push("operation = ?"); parameters.push(options.operation); }
      if (options.outcome !== undefined) { validateOutcome(options.outcome); clauses.push("outcome = ?"); parameters.push(options.outcome); }
      const where = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
      const rows = database.prepare(`SELECT operation_id, version, operation, outcome, started_at, updated_at,
        finished_at, duration_ms, active_stage, completed_stages_json, generation_before, generation_after, error_json
        FROM operation_diagnostics${where} ORDER BY id DESC LIMIT ?`).all(...parameters, limit) as unknown as Row[];
      const filtered = Number((database.prepare(`SELECT COUNT(*) AS count FROM operation_diagnostics${where}`).get(...parameters) as { count: number }).count);
      const dropped = readDropped(database);
      return {
        state: this.lastError === null ? (this.writable ? "active" : "read-only") : "failed",
        capacity: MAX_OPERATION_DIAGNOSTIC_RECORDS, retained, returned: rows.length, dropped,
        truncated: dropped > 0 || rows.length < filtered, error: this.lastError,
        operations: rows.reverse().map(toRecord)
      };
    } catch (error) {
      return empty("failed", journalError(error));
    } finally { database?.close(); }
  }

  private finish(operationId: string, outcome: "completed" | "failed", input: FinishOperationDiagnostic): void {
    this.write((database) => {
      const row = database.prepare("SELECT started_at, active_stage, completed_stages_json FROM operation_diagnostics WHERE operation_id = ?")
        .get(operationId) as { started_at: string; active_stage: string; completed_stages_json: string } | undefined;
      if (row === undefined) return;
      const completed = parseStages(row.completed_stages_json);
      if (isStage(row.active_stage) && !completed.includes(row.active_stage)) completed.push(row.active_stage);
      const duration = Math.max(Date.parse(input.finishedAt) - Date.parse(row.started_at), 0);
      database.prepare(`UPDATE operation_diagnostics SET outcome = ?, updated_at = ?, finished_at = ?, duration_ms = ?,
        completed_stages_json = ?, generation_after = ?, error_json = ? WHERE operation_id = ? AND outcome = 'running'`)
        .run(outcome, input.finishedAt, input.finishedAt, duration, JSON.stringify(completed), input.generationAfter ?? null,
          input.error == null ? null : JSON.stringify(input.error), operationId);
    });
  }

  private write(action: (database: DatabaseSync) => void): void {
    if (!this.writable) return;
    let database: DatabaseSync | null = null;
    try {
      mkdirSync(join(this.projectPath, INDEX_DIRECTORY_NAME), { recursive: true });
      database = this.open(false);
      database.exec(SCHEMA);
      database.exec("BEGIN IMMEDIATE");
      action(database);
      this.prune(database);
      database.exec("COMMIT");
      this.lastError = null;
    } catch (error) {
      try { database?.exec("ROLLBACK"); } catch { /* retain primary journal error */ }
      this.lastError = journalError(error);
    } finally { database?.close(); }
  }

  private open(readOnly: boolean): DatabaseSync {
    const database = new DatabaseSync(this.path(), { readOnly });
    if (!readOnly) database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
    else database.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
    return database;
  }

  private prune(database: DatabaseSync): void {
    const count = Number((database.prepare("SELECT COUNT(*) AS count FROM operation_diagnostics").get() as { count: number }).count);
    const evicted = Math.max(count - MAX_OPERATION_DIAGNOSTIC_RECORDS, 0);
    if (evicted === 0) return;
    database.prepare("DELETE FROM operation_diagnostics WHERE id NOT IN (SELECT id FROM operation_diagnostics ORDER BY id DESC LIMIT ?)")
      .run(MAX_OPERATION_DIAGNOSTIC_RECORDS);
    database.prepare(`INSERT INTO operation_diagnostic_meta(key, value) VALUES ('dropped', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(readDropped(database) + evicted));
  }

  private path(): string { return join(this.projectPath, INDEX_DIRECTORY_NAME, OPERATION_DIAGNOSTIC_JOURNAL_FILE_NAME); }
}

function hasSchema(database: DatabaseSync): boolean {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='operation_diagnostics'").get() !== undefined;
}
function readDropped(database: DatabaseSync): number {
  const row = database.prepare("SELECT value FROM operation_diagnostic_meta WHERE key='dropped'").get() as { value: string } | undefined;
  const value = row === undefined ? 0 : Number(row.value);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Operation diagnostic journal has an invalid dropped counter.");
  return value;
}
function normalizeLimit(value: number | undefined): number {
  const limit = value ?? MAX_OPERATION_DIAGNOSTIC_RECORDS;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_OPERATION_DIAGNOSTIC_RECORDS) throw new RangeError("Diagnostics limit must be an integer between 1 and 256.");
  return limit;
}
function validateOperation(value: string): asserts value is OperationDiagnosticOperation {
  if (!(OPERATION_DIAGNOSTIC_OPERATIONS as readonly string[]).includes(value)) throw new RangeError("Invalid diagnostic operation filter.");
}
function validateOutcome(value: string): asserts value is OperationDiagnosticOutcome {
  if (!(OPERATION_DIAGNOSTIC_OUTCOMES as readonly string[]).includes(value)) throw new RangeError("Invalid diagnostic outcome filter.");
}
function isStage(value: string): value is OperationDiagnosticStage { return (OPERATION_DIAGNOSTIC_STAGES as readonly string[]).includes(value); }
function parseStages(value: string): OperationDiagnosticStage[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string" || !isStage(entry))) throw new Error("Operation diagnostic journal has invalid stages.");
  return [...parsed];
}
function toRecord(row: Row): OperationDiagnosticRecord {
  validateOperation(row.operation); validateOutcome(row.outcome);
  if (!isStage(row.active_stage)) throw new Error("Operation diagnostic journal has an invalid active stage.");
  return {
    operationId: row.operation_id, version: row.version, operation: row.operation, outcome: row.outcome,
    startedAt: row.started_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
    durationMs: row.duration_ms, activeStage: row.active_stage, completedStages: parseStages(row.completed_stages_json),
    generationBefore: row.generation_before, generationAfter: row.generation_after,
    error: row.error_json === null ? null : JSON.parse(row.error_json) as OperationDiagnosticError
  };
}
function journalError(error: unknown): OperationDiagnosticJournalResult["error"] {
  return { code: "OPERATION_JOURNAL_FAILED", message: error instanceof Error ? error.message : "Unknown operation journal error." };
}
function empty(state: OperationDiagnosticJournalResult["state"], error: OperationDiagnosticJournalResult["error"]): OperationDiagnosticJournalResult {
  return { state, capacity: MAX_OPERATION_DIAGNOSTIC_RECORDS, retained: 0, returned: 0, dropped: 0, truncated: false, error, operations: [] };
}

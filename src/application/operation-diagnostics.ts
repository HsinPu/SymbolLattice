/** Maximum lifecycle operations retained for one project. */
export const MAX_OPERATION_DIAGNOSTIC_RECORDS = 256;

export const OPERATION_DIAGNOSTIC_OPERATIONS = ["init", "index", "sync", "watch"] as const;
export type OperationDiagnosticOperation = (typeof OPERATION_DIAGNOSTIC_OPERATIONS)[number];

export const OPERATION_DIAGNOSTIC_OUTCOMES = ["running", "completed", "failed"] as const;
export type OperationDiagnosticOutcome = (typeof OPERATION_DIAGNOSTIC_OUTCOMES)[number];

export const OPERATION_DIAGNOSTIC_STAGES = [
  "preflight",
  "store-initialize",
  "load-status",
  "freshness-preflight",
  "scan",
  "extraction",
  "change-planning",
  "resolution",
  "persistence",
  "status-read",
  "watch-observe",
  "watch-sync"
] as const;
export type OperationDiagnosticStage = (typeof OPERATION_DIAGNOSTIC_STAGES)[number];

export type OperationDiagnosticJournalState = "active" | "read-only" | "unavailable" | "failed";

export interface OperationDiagnosticError {
  readonly code: string;
  readonly message: string;
  readonly evidence: readonly { readonly path: string; readonly code: string }[];
  readonly evidenceTotal: number;
  readonly evidenceTruncated: boolean;
}

export interface OperationDiagnosticRecord {
  readonly operationId: string;
  readonly version: string;
  readonly operation: OperationDiagnosticOperation;
  readonly outcome: OperationDiagnosticOutcome;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly activeStage: OperationDiagnosticStage;
  readonly completedStages: readonly OperationDiagnosticStage[];
  readonly generationBefore: string | null;
  readonly generationAfter: string | null;
  readonly error: OperationDiagnosticError | null;
}

export interface OperationDiagnosticFilters {
  readonly limit?: number;
  readonly operation?: OperationDiagnosticOperation;
  readonly outcome?: OperationDiagnosticOutcome;
}

export interface OperationDiagnosticJournalResult {
  readonly state: OperationDiagnosticJournalState;
  readonly capacity: number;
  readonly retained: number;
  readonly returned: number;
  readonly dropped: number;
  readonly truncated: boolean;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly operations: readonly OperationDiagnosticRecord[];
}

export interface StartOperationDiagnostic {
  readonly operationId: string;
  readonly version: string;
  readonly operation: OperationDiagnosticOperation;
  readonly startedAt: string;
  readonly generationBefore: string | null;
}

export interface FinishOperationDiagnostic {
  readonly finishedAt: string;
  readonly generationAfter?: string | null;
  readonly error?: OperationDiagnosticError | null;
}

/** Project-local best-effort persistence seam for write lifecycle diagnostics. */
export interface OperationDiagnosticJournal {
  start(input: StartOperationDiagnostic): void;
  advance(operationId: string, stage: OperationDiagnosticStage, updatedAt: string): void;
  complete(operationId: string, input: FinishOperationDiagnostic): void;
  fail(operationId: string, input: FinishOperationDiagnostic): void;
  diagnostics(options?: OperationDiagnosticFilters): OperationDiagnosticJournalResult;
  state(): Pick<OperationDiagnosticJournalResult, "state" | "error">;
}

export interface PersistentOperationDiagnosticsResult {
  readonly operationJournal: OperationDiagnosticJournalResult;
  readonly autoSyncJournal: import("./auto-sync-journal.js").AutoSyncDiagnosticJournalResult;
}

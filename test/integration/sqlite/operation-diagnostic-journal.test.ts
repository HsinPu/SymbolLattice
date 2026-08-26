import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_OPERATION_DIAGNOSTIC_RECORDS } from "../../../src/application/index.js";
import { OPERATION_DIAGNOSTIC_JOURNAL_FILE_NAME, SqliteOperationDiagnosticJournal } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
async function project(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "SymbolLattice-operation-journal-")); temporaryDirectories.push(path); return path; }
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("SQLite operation diagnostic journal", () => {
  it("persists stage progress and a failed initial operation before an index exists", async () => {
    const projectPath = await project();
    const writer = new SqliteOperationDiagnosticJournal(projectPath);
    writer.start({ operationId: "00000000-0000-4000-8000-000000000001", version: "0.445.0", operation: "init", startedAt: "2026-08-26T00:00:00.000Z", generationBefore: null });
    writer.advance("00000000-0000-4000-8000-000000000001", "scan", "2026-08-26T00:00:00.010Z");
    writer.fail("00000000-0000-4000-8000-000000000001", { finishedAt: "2026-08-26T00:00:00.020Z", error: { code: "PROJECT_PATH_UNREADABLE", message: "backend/.pytest_cache [EPERM]", evidence: [{ path: "backend/.pytest_cache", code: "EPERM" }], evidenceTotal: 1, evidenceTruncated: false } });
    const result = new SqliteOperationDiagnosticJournal(projectPath, { writable: false }).diagnostics();
    expect(result).toMatchObject({ state: "read-only", retained: 1, returned: 1, operations: [{ operation: "init", outcome: "failed", activeStage: "scan", completedStages: ["preflight", "scan"], generationBefore: null, durationMs: 20, error: { code: "PROJECT_PATH_UNREADABLE", evidence: [{ path: "backend/.pytest_cache" }] } }] });
  });

  it("filters records and retains only the newest 256", async () => {
    const projectPath = await project(); const journal = new SqliteOperationDiagnosticJournal(projectPath);
    for (let index = 0; index < MAX_OPERATION_DIAGNOSTIC_RECORDS + 2; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      journal.start({ operationId: id, version: "0.445.0", operation: index % 2 === 0 ? "sync" : "index", startedAt: new Date(index).toISOString(), generationBefore: null });
      journal.complete(id, { finishedAt: new Date(index + 1).toISOString(), generationAfter: `generation:${index}` });
    }
    expect(journal.diagnostics({ limit: 2, operation: "sync", outcome: "completed" })).toMatchObject({ retained: 256, returned: 2, dropped: 2, truncated: true });
  }, 120_000);

  it("does not mutate an uninitialized project during read-only diagnostics", async () => {
    const projectPath = await project();
    expect(new SqliteOperationDiagnosticJournal(projectPath, { writable: false }).diagnostics()).toMatchObject({ state: "unavailable", retained: 0 });
    await expect(access(join(projectPath, ".SymbolLattice"))).rejects.toThrow();
  });

  it("reports a corrupt journal without returning partial records", async () => {
    const projectPath = await project(); const directory = join(projectPath, ".SymbolLattice");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(directory));
    await writeFile(join(directory, OPERATION_DIAGNOSTIC_JOURNAL_FILE_NAME), "not sqlite");
    expect(new SqliteOperationDiagnosticJournal(projectPath, { writable: false }).diagnostics()).toMatchObject({ state: "failed", error: { code: "OPERATION_JOURNAL_FAILED" }, operations: [] });
  });
});

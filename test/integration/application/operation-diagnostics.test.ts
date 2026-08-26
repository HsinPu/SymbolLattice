import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { ProjectPathUnreadableError } from "../../../src/domain/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore, SqliteOperationDiagnosticJournal } from "../../../src/infrastructure/sqlite/index.js";
import type { SourceCatalog } from "../../../src/ports/index.js";

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function project(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-operation-lifecycle-"));
  temporaryDirectories.push(projectPath);
  await mkdir(join(projectPath, "src"));
  await writeFile(join(projectPath, "src", "entry.ts"), "export const entry = true;\n");
  return projectPath;
}

function service(projectPath: string, sourceCatalog: SourceCatalog): SymbolLatticeService {
  return new SymbolLatticeService(new SqliteGraphStore(), sourceCatalog, {
    operationDiagnosticJournalFactory: () => new SqliteOperationDiagnosticJournal(projectPath)
  });
}

describe("operation lifecycle diagnostics", () => {
  it("records completed init and no-op sync with generation receipts", async () => {
    const projectPath = await project();
    const instance = service(projectPath, new FileSystemSourceCatalog());
    const initial = await instance.init({ projectPath });
    const synced = await instance.sync({ projectPath });
    const result = new SqliteOperationDiagnosticJournal(projectPath, { writable: false }).diagnostics();

    expect(result.operations).toMatchObject([
      { operation: "init", outcome: "completed", generationBefore: null, generationAfter: initial.generationId },
      { operation: "sync", outcome: "completed", generationBefore: initial.generationId, generationAfter: synced.generationId }
    ]);
    expect(result.operations[0]?.completedStages).toEqual(expect.arrayContaining(["scan", "extraction", "resolution", "persistence", "status-read"]));
  });

  it("records a sanitized initial failure without publishing a generation", async () => {
    const projectPath = await project();
    const backing = new FileSystemSourceCatalog();
    const unreadable = new ProjectPathUnreadableError([{ path: "backend/.pytest_cache", code: "EPERM" }]);
    const catalog: SourceCatalog = {
      async scan() { throw unreadable; },
      async verifyFreshness() { throw unreadable; },
      read: (...args) => backing.read(...args),
      isUnsafeProjectPath: (...args) => backing.isUnsafeProjectPath(...args)
    };
    const store = new SqliteGraphStore();
    const instance = new SymbolLatticeService(store, catalog, {
      operationDiagnosticJournalFactory: () => new SqliteOperationDiagnosticJournal(projectPath)
    });

    const error = await instance.init({ projectPath }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      operationId: expect.any(String),
      operationJournal: { state: "active", error: null }
    });
    expect(store.getStatus(projectPath).generationId).toBeNull();
    expect(new SqliteOperationDiagnosticJournal(projectPath, { writable: false }).diagnostics()).toMatchObject({
      operations: [{ operation: "init", outcome: "failed", activeStage: "scan", generationBefore: null,
        error: { code: "PROJECT_PATH_UNREADABLE", evidence: [{ path: "backend/.pytest_cache", code: "EPERM" }] } }]
    });
  });
});

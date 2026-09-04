import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("VB.NET relations v0.506", () => {
  it("persists exact private fixed-arity calls from classes and modules", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-vbnet-v0506-"));
    directories.push(projectPath);
    await writeFile(join(projectPath, "Worker.vb"), `Public Class Worker
    Public Function Run(value As Integer) As Integer
        Record(value, "first")
        Return Record(value + 1, "second")
    End Function
    Private Function Record(value As Integer, label As String) As Integer
        Return value
    End Function
End Class`, "utf8");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const edges = store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls");
    expect(edges).toHaveLength(2);
    expect(edges.every((edge) =>
      edge.resolution === "exact" && edge.confidence === 1 &&
      edge.evidence.ruleId === "syntax.vbnet.same-container.unique-private-fixed-arity-method-call" &&
      edge.evidence.candidateSymbolIds.length === 1
    )).toBe(true);
  });
});

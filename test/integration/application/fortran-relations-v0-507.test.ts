import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Fortran relations v0.507", () => {
  it("resolves a fixed-form continued CALL to one unique project subroutine", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-fortran-v0507-"));
    directories.push(projectPath);
    await writeFile(join(projectPath, "entry.f"), "      SUBROUTINE ENTRY()\n      CALL HELPER(1,\n     $            2)\n      END\n", "utf8");
    await writeFile(join(projectPath, "helper.f"), "      SUBROUTINE HELPER(A, B)\n      END\n", "utf8");
    const store = new SqliteGraphStore();
    await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({ referenceName: "HELPER", resolution: "exact", confidence: 1, evidence: {
        ruleId: "project.fortran.unique-subroutine.fixed-arity-call", stage: "module", candidateSymbolIds: [expect.any(String)]
      } })
    ]);
  });

  it("keeps duplicate project targets unresolved", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-fortran-v0507-negative-"));
    directories.push(projectPath);
    await writeFile(join(projectPath, "entry.f"), "      SUBROUTINE ENTRY()\n      CALL HELPER(1)\n      END\n", "utf8");
    await writeFile(join(projectPath, "a.f"), "      SUBROUTINE HELPER(A)\n      END\n", "utf8");
    await writeFile(join(projectPath, "b.f"), "      SUBROUTINE HELPER(A)\n      END\n", "utf8");
    const store = new SqliteGraphStore();
    await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });
});

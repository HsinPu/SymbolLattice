import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const directories: string[] = [];

afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Pascal relations v0.510", () => {
  it("resolves one bare program-main call through an explicit unit uses edge", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-pascal-v0510-"));
    directories.push(projectPath);
    await writeFile(
      join(projectPath, "helper.pas"),
      "unit HelperUnit;\n\ninterface\n\nprocedure Helper;\n\nimplementation\n\nprocedure Helper;\nbegin\nend;\n\nend.\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "main.pas"),
      "program Main;\n\nuses HelperUnit;\n\nbegin\n  Helper;\nend.\n",
      "utf8"
    );

    const store = new SqliteGraphStore();
    await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });

    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        referenceName: "Helper",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "project.pascal.unit-uses.unique-exported-zero-argument-call",
          stage: "module",
          candidateSymbolIds: [expect.any(String)]
        })
      })
    ]);
  });

  it("keeps a call unresolved when two explicitly used units export the same routine", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-pascal-v0510-negative-"));
    directories.push(projectPath);
    const unit = (name: string) =>
      `unit ${name};\n\ninterface\n\nprocedure Helper;\n\nimplementation\n\nprocedure Helper;\nbegin\nend;\n\nend.\n`;
    await writeFile(join(projectPath, "first.pas"), unit("FirstUnit"), "utf8");
    await writeFile(join(projectPath, "second.pas"), unit("SecondUnit"), "utf8");
    await writeFile(
      join(projectPath, "main.pas"),
      "program Main;\n\nuses FirstUnit, SecondUnit;\n\nbegin\n  Helper;\nend.\n",
      "utf8"
    );

    const store = new SqliteGraphStore();
    await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });
});

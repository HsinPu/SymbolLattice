import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SymbolLatticeService } from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../../src/domain/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Java modern heritage relations v0.486", () => {
  it("projects direct cross-file superclass and interface edges from a legacy-recovery file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-heritage-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "Base.java"), "package app; public class Base {}\n", "utf8");
    await writeFile(join(projectPath, "Contract.java"), "package app; public interface Contract {}\n", "utf8");
    await writeFile(
      join(projectPath, "Child.java"),
      [
        "package app;",
        "public class Child extends Base implements Contract {",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const child = snapshot.symbols.find((symbol) => symbol.name === "Child");
    const base = snapshot.symbols.find((symbol) => symbol.name === "Base");
    const contract = snapshot.symbols.find((symbol) => symbol.name === "Contract");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v396");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v197");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: child?.id,
        targetId: base?.id,
        kind: "extends",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.jvm.cross-file.same-package.direct-superclass",
          candidateSymbolIds: [base?.id]
        })
      }),
      expect.objectContaining({
        sourceId: child?.id,
        targetId: contract?.id,
        kind: "implements",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.jvm.cross-file.same-package.direct-implements",
          candidateSymbolIds: [contract?.id]
        })
      })
    ]));
  });

  it("does not resolve duplicate same-package interface names from modern heritage facts", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "ContractA.java"), "package app; interface Contract {}\n", "utf8");
    await writeFile(join(projectPath, "ContractB.java"), "package app; interface Contract {}\n", "utf8");
    await writeFile(
      join(projectPath, "Child.java"),
      [
        "package app;",
        "public class Child implements Contract {",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });

    expect(
      store.getSnapshot(projectPath).edges.filter((edge) =>
        edge.kind === "implements" && edge.evidence?.ruleId?.startsWith("syntax.jvm.cross-file.")
      )
    ).toEqual([]);
  });
});

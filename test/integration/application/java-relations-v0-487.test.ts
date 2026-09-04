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

describe("Java modern object creation relations v0.487", () => {
  it("projects a direct generic object creation from a parser-recovery method", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-new-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "Service.java"), "package app; public class Service<T> {}\n", "utf8");
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "public class Runner {",
        "  void run(Object value) {",
        "    Service<String> created = new Service<>();",
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
    const run = snapshot.symbols.find((symbol) => symbol.name === "run");
    const target = snapshot.symbols.find((symbol) => symbol.name === "Service");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v411");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v198");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: run?.id,
        targetId: target?.id,
        kind: "instantiates",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.java.object-creation.same-package",
          candidateSymbolIds: [target?.id]
        })
      })
    ]));
  });

  it("does not resolve an ambiguous object-creation target from a parser-recovery method", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-new-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "ServiceA.java"), "package app; class Service {}\n", "utf8");
    await writeFile(join(projectPath, "ServiceB.java"), "package app; class Service {}\n", "utf8");
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "public class Runner {",
        "  void run(Object value) {",
        "    new Service<>();",
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
        edge.kind === "instantiates" && edge.evidence?.ruleId?.startsWith("syntax.java.object-creation.")
      )
    ).toEqual([]);
  });
});

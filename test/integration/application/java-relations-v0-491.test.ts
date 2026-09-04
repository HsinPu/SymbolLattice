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

describe("Java modern field receiver call relations v0.491", () => {
  it("projects a unique final imported field receiver from a parser-recovery file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-field-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Worker.java"),
      "package api; public class Worker { public void handle() {} }\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.Worker;",
        "public class Runner {",
        "  private final Worker worker;",
        "  public Runner(Worker worker) { this.worker = worker; }",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> worker.handle();",
        "      default -> {}",
        "    }",
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
    const handle = snapshot.symbols.find((symbol) => symbol.name === "handle");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v410");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v198");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: run?.id,
        targetId: handle?.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "call.java.member.field.arity.direct-dispatch",
          candidateSymbolIds: [handle?.id]
        })
      })
    ]));
  });

  it("does not project a field receiver after an argument escape", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-field-taint-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Worker.java"),
      "package api; public class Worker { public void handle() {} }\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.Worker;",
        "public class Runner {",
        "  private final Worker worker;",
        "  public Runner(Worker worker) { this.worker = worker; }",
        "  void consume(Worker value) {}",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> { consume(worker); worker.handle(); }",
        "      default -> {}",
        "    }",
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
        edge.kind === "calls" && edge.referenceName === "handle"
      )
    ).toEqual([]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Java modern declared-supertype local initializer calls v0.494", () => {
  async function createProject(
    concreteRelation: "direct" | "indirect" | "unrelated"
  ): Promise<string> {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-widening-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "BaseService.java"),
      "package api; public class BaseService { public void run() {} }\n",
      "utf8"
    );
    if (concreteRelation === "indirect") {
      await writeFile(
        join(projectPath, "IntermediateService.java"),
        "package api; public class IntermediateService extends BaseService {}\n",
        "utf8"
      );
    }
    await writeFile(
      join(projectPath, "ConcreteService.java"),
      concreteRelation === "direct"
        ? "package api; public class ConcreteService extends BaseService {}\n"
        : concreteRelation === "indirect"
          ? "package api; public class ConcreteService extends IntermediateService {}\n"
          : "package api; public class ConcreteService { public void run() {} }\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.BaseService;",
        "import api.ConcreteService;",
        "public class Runner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        BaseService service = new ConcreteService();",
        "        service.run();",
        "      }",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );
    return projectPath;
  }

  it("projects one exact call after a unique direct extends proof", async () => {
    const projectPath = await createProject("direct");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const caller = snapshot.symbols.find(
      (symbol) => symbol.name === "run" && symbol.filePath === "Runner.java"
    );
    const target = snapshot.symbols.find(
      (symbol) => symbol.name === "run" && symbol.filePath === "BaseService.java"
    );
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: caller?.id,
        targetId: target?.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "call.java.member.local.arity.direct-dispatch",
          candidateSymbolIds: [target?.id]
        })
      })
    ]));
  });

  it("does not project an exact call when the concrete initializer is not assignable", async () => {
    const projectPath = await createProject("unrelated");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(
      store.getSnapshot(projectPath).edges.filter(
        (edge) => edge.kind === "calls" && edge.referenceName === "run"
      )
    ).toEqual([]);
  });

  it("keeps an indirect heritage chain unresolved in the bounded slice", async () => {
    const projectPath = await createProject("indirect");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(
      store.getSnapshot(projectPath).edges.filter(
        (edge) => edge.kind === "calls" && edge.referenceName === "run"
      )
    ).toEqual([]);
  });
});

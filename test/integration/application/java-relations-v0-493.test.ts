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

describe("Java modern generic local initializer receiver calls v0.493", () => {
  it("projects a raw-type exact edge for a generic local initializer in a recovery-safe file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-generic-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Box.java"),
      "package api; public class Box<T> { public void run() {} }\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.Box;",
        "public class Runner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        var box = new Box<String>();",
        "        box.run();",
        "      }",
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
    const snapshot = store.getSnapshot(projectPath);
    const caller = snapshot.symbols.find((symbol) => symbol.name === "run" && symbol.filePath === "Runner.java");
    const target = snapshot.symbols.find((symbol) => symbol.name === "run" && symbol.filePath === "Box.java");

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

  it("does not project a generic local when a raw target is ambiguous", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-generic-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Box.java"),
      "package api; public class Box<T> { public void run(Object value) {} public void run(String value) {} }\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.Box;",
        "public class Runner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        var box = new Box<String>();",
        "        box.run(unknown());",
        "      }",
        "      default -> {}",
        "    }",
        "  }",
        "  String unknown() { return \"x\"; }",
        "}"
      ].join("\n"),
      "utf8"
    );

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });

    expect(
      store.getSnapshot(projectPath).edges.filter((edge) =>
        edge.kind === "calls" && edge.referenceName === "run"
      )
    ).toEqual([]);
  });
});

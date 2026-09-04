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

describe("Java modern callable signature relations v0.488", () => {
  it("projects direct imported accepts and returns edges from a parser-recovery file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-signature-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "Input.java"), "package api; public class Input {}\n", "utf8");
    await writeFile(join(projectPath, "Result.java"), "package api; public class Result {}\n", "utf8");
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "import api.Input;",
        "import api.Result;",
        "public class Runner {",
        "  public Result run(Input input) {",
        "    Object marker = input;",
        "    if (marker instanceof String text) { System.out.println(text); }",
        "    return null;",
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
    const input = snapshot.symbols.find((symbol) => symbol.name === "Input");
    const result = snapshot.symbols.find((symbol) => symbol.name === "Result");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v412");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v198");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: run?.id,
        targetId: input?.id,
        kind: "accepts",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "signature.java.explicit-import.accepts",
          candidateSymbolIds: [input?.id]
        })
      }),
      expect.objectContaining({
        sourceId: run?.id,
        targetId: result?.id,
        kind: "returns",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "signature.java.explicit-import.returns",
          candidateSymbolIds: [result?.id]
        })
      })
    ]));
  });

  it("projects same-package signature edges when legacy parsing rejects the body", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-signature-local-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "LocalType.java"), "package app; class LocalType {}\n", "utf8");
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "public class Runner {",
        "  LocalType run(LocalType input) {",
        "    Object marker = input;",
        "    if (marker instanceof String text) { System.out.println(text); }",
        "    return input;",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const run = snapshot.symbols.find((symbol) => symbol.name === "run");
    const local = snapshot.symbols.find((symbol) => symbol.name === "LocalType");

    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: run?.id,
        targetId: local?.id,
        kind: "accepts",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "signature.java.same-package.accepts",
          candidateSymbolIds: [local?.id]
        })
      }),
      expect.objectContaining({
        sourceId: run?.id,
        targetId: local?.id,
        kind: "returns",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "signature.java.same-package.returns",
          candidateSymbolIds: [local?.id]
        })
      })
    ]));
  });
});

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

describe("Java modern callable call relations v0.489", () => {
  it("projects private bare calls from a parser-recovery file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-call-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Runner.java"),
      [
        "package app;",
        "public class Runner {",
        "  private static void staticHelper() {}",
        "  private void instanceHelper() {}",
        "  static void entry(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    staticHelper();",
        "  }",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    instanceHelper();",
        "  }",
        "}"
      ].join("\n"),
      "utf8"
    );

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const entry = snapshot.symbols.find((symbol) => symbol.name === "entry");
    const run = snapshot.symbols.find((symbol) => symbol.name === "run");
    const staticHelper = snapshot.symbols.find((symbol) => symbol.name === "staticHelper");
    const instanceHelper = snapshot.symbols.find((symbol) => symbol.name === "instanceHelper");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v414");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v199");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: entry?.id,
        targetId: staticHelper?.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "call.java.member.implicit-static.arity.direct-dispatch",
          candidateSymbolIds: [staticHelper?.id]
        })
      }),
      expect.objectContaining({
        sourceId: run?.id,
        targetId: instanceHelper?.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "call.java.member.implicit-instance.private-binding.arity.direct-dispatch",
          candidateSymbolIds: [instanceHelper?.id]
        })
      })
    ]));
  });

  it("keeps same-owner overloads unresolved without argument type proof", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-java-modern-call-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await writeFile(
      join(projectPath, "Ambiguous.java"),
      [
        "package app;",
        "public class Ambiguous {",
        "  private static void helper(int value) {}",
        "  private static void helper(long value) {}",
        "  static void entry(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    helper(1);",
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
        edge.kind === "calls" && edge.referenceName === "helper"
      )
    ).toEqual([]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const temporaryDirectories: string[] = [];

async function createProject(sourceText: string): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-groovy-v0497-"));
  temporaryDirectories.push(projectPath);
  const sourcePath = resolve(projectPath, "src", "recursive.groovy");
  await mkdir(resolve(sourcePath, ".."), { recursive: true });
  await writeFile(sourcePath, sourceText, "utf8");
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Groovy relations v0.497", () => {
  it("persists compiler-approved unique top-level self-recursion as exact calls", async () => {
    const projectPath = await createProject("def fib(n) { n < 2 ? n : fib(n - 1) + fib(n - 2) }\n");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    const status = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const fib = snapshot.symbols.find((symbol) => symbol.name === "fib");
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls");

    expect(status.stale).toBe(false);
    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v414");
    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: fib?.id,
        targetId: fib?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.groovy.same-file.unique-direct-self-call.arity",
          candidateSymbolIds: [fib?.id]
        })
      })
    ]));
  });

  it("persists no call for dynamic or nested Groovy dispatch surfaces", async () => {
    const projectPath = await createProject([
      "def recurse(value) { [value].each { recurse(it) } }",
      "External.metaClass.recurse = { it }",
      ""
    ].join("\n"));
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });
});

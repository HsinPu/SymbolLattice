import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const temporaryDirectories: string[] = [];

async function createProject(sourceText: string): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-groovy-v0498-"));
  temporaryDirectories.push(projectPath);
  const sourcePath = resolve(projectPath, "src", "direct.groovy");
  await mkdir(resolve(sourcePath, ".."), { recursive: true });
  await writeFile(sourcePath, sourceText, "utf8");
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Groovy relations v0.498", () => {
  it("persists one exact call between unique top-level def functions", async () => {
    const projectPath = await createProject([
      "def helper(value) { value }",
      "def entry() { return helper(1) }",
      ""
    ].join("\n"));
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    const status = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const helper = snapshot.symbols.find((symbol) => symbol.name === "helper");
    const entry = snapshot.symbols.find((symbol) => symbol.name === "entry");

    expect(status.stale).toBe(false);
    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v419");
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        sourceId: entry?.id,
        targetId: helper?.id,
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "syntax.groovy.same-file.unique-direct-function-call.arity",
          stage: "syntax",
          candidateSymbolIds: [helper?.id]
        }
      })
    ]);
  });

  it("persists no inter-function call when a dynamic hook or binding assignment exists", async () => {
    for (const sourceText of [
      [
        "def helper(value) { value }",
        "def methodMissing(name, args) { null }",
        "def entry() { helper(1) }"
      ].join("\n"),
      [
        "def helper(value) { value }",
        "def entry() { helper(1) }",
        "helper = { it }"
      ].join("\n")
    ]) {
      const projectPath = await createProject(sourceText);
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      await service.init({ projectPath });
      expect(store.getSnapshot(projectPath).edges.filter((edge) =>
        edge.evidence?.ruleId === "syntax.groovy.same-file.unique-direct-function-call.arity"
      )).toEqual([]);
    }
  });
});

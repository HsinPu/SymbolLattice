import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const temporaryDirectories: string[] = [];

async function createProject(sourceText: string): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-groovy-v0499-"));
  temporaryDirectories.push(projectPath);
  const sourcePath = resolve(projectPath, "src", "slashy.groovy");
  await mkdir(resolve(sourcePath, ".."), { recursive: true });
  await writeFile(sourcePath, sourceText, "utf8");
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Groovy relations v0.499", () => {
  it("persists one exact string-argument call after an assignment-position slashy literal", async () => {
    const projectPath = await createProject([
      "regex = /(?ms)foo\\/bar/",
      "def helper(value) { value }",
      "def entry() { return helper(\"value\") }",
      ""
    ].join("\n"));
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const helper = snapshot.symbols.find((symbol) => symbol.name === "helper");
    const entry = snapshot.symbols.find((symbol) => symbol.name === "entry");

    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v410");
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        sourceId: entry?.id,
        targetId: helper?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.groovy.same-file.unique-direct-function-call.arity",
          candidateSymbolIds: [helper?.id]
        })
      })
    ]);
  });

  it("persists no call for division or unsupported slashy forms", async () => {
    const suffix = "\ndef helper(value) { value }\ndef entry() { helper(\"value\") }\n";
    for (const prefix of [
      "value = total / count",
      "assert value ==~ /pattern/",
      "regex = $/pattern/$",
      "regex = /first\nsecond/",
      "regex = /unterminated"
    ]) {
      const projectPath = await createProject(prefix + suffix);
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      await service.init({ projectPath });
      expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls")).toEqual([]);
    }
  });
});

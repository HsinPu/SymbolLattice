import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-javascript-v0500-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("JavaScript relations v0.500", () => {
  it("retains a safe top-level CommonJS import beside one nested dynamic require", async () => {
    const projectPath = await createProject({
      "lib/entry.js": [
        "'use strict'",
        "const helper = require('./helper')",
        "function lazy(name) { return require(name) }"
      ].join("\n"),
      "lib/helper.js": "'use strict'\nmodule.exports = {}\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const source = snapshot.symbols.find((symbol) => symbol.kind === "file" && symbol.filePath === "lib/entry.js");
    const target = snapshot.symbols.find((symbol) => symbol.kind === "file" && symbol.filePath === "lib/helper.js");

    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v410");
    expect(snapshot.edges.filter((edge) => edge.kind === "imports" && edge.sourceId === source?.id)).toEqual([
      expect.objectContaining({
        targetId: target?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "module.relative-specifier",
          candidateSymbolIds: [target?.id]
        })
      })
    ]);
  });

  it("keeps hoisted and reassigned require bindings unresolved", async () => {
    for (const sourceText of [
      "'use strict'; if (false) { var require }; const helper = require('./helper')",
      "'use strict'; const helper = require('./helper'); require = other"
    ]) {
      const projectPath = await createProject({
        "lib/entry.js": sourceText,
        "lib/helper.js": "'use strict'\nmodule.exports = {}\n"
      });
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      await service.init({ projectPath });
      expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "imports")).toEqual([]);
    }
  });
});

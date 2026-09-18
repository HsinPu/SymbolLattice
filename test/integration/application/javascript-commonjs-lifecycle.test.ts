import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const projects: string[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await rm(project, { recursive: true, force: true }); });

describe("persisted CommonJS object-call evidence", () => {
  it("survives reopening and unrelated sync, then invalidates and restores a changed export", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-commonjs-lifecycle-"));
    projects.push(projectPath);
    const provider = "'use strict'; function handle() {} module.exports = { handle };";
    await writeFile(join(projectPath, "provider.js"), provider);
    await writeFile(join(projectPath, "consumer.js"), "'use strict'; const { handle: run } = require('./provider'); function start() { run(); }");
    await writeFile(join(projectPath, "reader.js"), "'use strict'; const mod = require('./provider'); mod.handle();");
    let store = new SqliteGraphStore();
    const calls = () => store.getSnapshot(projectPath).edges.filter((edge) => edge.evidence?.ruleId === "module.commonjs-object-call");
    try {
      await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });
      expect(calls()).toHaveLength(1);
      const original = calls()[0];
      store.close();
      store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      const saved = store.getArtifactFacts(projectPath);
      expect(saved.find((item) => item.filePath === "consumer.js")?.commonJsFacts?.calls).toHaveLength(1);
      expect(saved.find((item) => item.filePath === "provider.js")?.commonJsFacts?.exports).toHaveLength(1);
      await writeFile(join(projectPath, "unrelated.js"), "'use strict'; const value = 1;");
      const updated = await service.sync({ projectPath });
      expect(updated.lastIndexWork?.reExtractedFiles).not.toContain("consumer.js");
      expect(updated.lastIndexWork?.reExtractedFiles).not.toContain("provider.js");
      expect(calls()).toEqual([original]);
      await writeFile(join(projectPath, "provider.js"), `${provider} module.exports.handle = other;`);
      await service.sync({ projectPath });
      expect(calls()).toEqual([]);
      await writeFile(join(projectPath, "provider.js"), provider);
      await service.sync({ projectPath });
      expect(calls()).toEqual([original]);
      await writeFile(join(projectPath, "mutator.js"), "'use strict'; require('./provider').handle = other;");
      await service.sync({ projectPath });
      expect(calls()).toEqual([]);
      await writeFile(join(projectPath, "unrelated.js"), "'use strict'; const value = 2;");
      await service.sync({ projectPath });
      expect(calls()).toEqual([]);
      await rm(join(projectPath, "mutator.js"));
      await service.sync({ projectPath });
      expect(calls()).toEqual([original]);
    } finally { store.close(); }
  });
});

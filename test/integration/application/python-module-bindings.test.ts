import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SymbolLatticeService } from "../../../src/application/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

it("re-extracts old facts and returns the exact module binding source after sync", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "python-module-bindings-"));
  const store = new SqliteGraphStore();
  try {
    await writeFile(join(projectPath, "settings.py"), "handler500 = defaults.server_error\n");
    const oldExtractor = Object.assign((input: Parameters<typeof extractFileFacts>[0]) => {
      const facts = extractFileFacts(input);
      const omitted = new Set(facts.symbols.filter((s) => s.kind === "variable").map((s) => s.id));
      return { ...facts, symbols: facts.symbols.filter((s) => !omitted.has(s.id)),
        edges: facts.edges.filter((e) => !omitted.has(e.sourceId) && !omitted.has(e.targetId ?? "")) };
    }, { version: "multi-language-ast-v425" });
    const oldService = new SymbolLatticeService(store, new FileSystemSourceCatalog(), { artifactFactsExtractor: oldExtractor });
    await oldService.init({ projectPath });
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    expect(await service.getStatus(projectPath)).toMatchObject({ stale: true,
      staleReasons: expect.arrayContaining(["indexer-version-changed"]) });
    const synced = await service.sync({ projectPath });
    expect(synced.lastIndexWork?.reExtractedFiles).toContain("settings.py");
    const result = await service.explore(projectPath, "handler500");
    expect(result.match).toMatchObject({ status: "exact", symbol: { kind: "variable", name: "handler500", filePath: "settings.py" } });
    expect(JSON.stringify(result.source)).toContain("handler500 = defaults.server_error");
    expect(result.callees).toEqual([]);
  } finally {
    store.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});

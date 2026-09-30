import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import { renderExploreText } from "../../../src/mcp/explore-text.js";

const projects: string[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture(linked = true) {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-imported-lead-"));
  projects.push(projectPath);
  await writeFile(join(projectPath, "signal.ts"), "export class Signal { isCycle(id: number) { return id > 0; } }\n");
  await writeFile(join(projectPath, "main.ts"), ["import { Signal } from './signal';", "export class Consumer {",
    "  create() { return new Signal(); }", "  inspect(value: any) {",
    linked ? "    const built = this.create();" : "    const built = 1;",
    "    if (value?.isCycle(1)) throw new Error('circular dependency provider instance');",
    "    return built;", "  }", "}"].join("\n"));
  const store = new SqliteGraphStore();
  const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
  const initial = await service.init({ projectPath });
  const graph = store.getSnapshot(projectPath);
  const call = graph.edges.find(edge => edge.referenceName === "isCycle" && edge.kind === "calls")!;
  return { projectPath, store, service, generation: initial.generationId!, call };
}

describe("imported construction declaration leads", () => {
  it("adds a source-cited supplementary predicate without resolving the written call", async () => {
    const { projectPath, store, service, generation, call } = await fixture();
    const projection = store.getActiveImportedCallDeclarations(projectPath, generation, [call.id], 16);
    expect(projection).toMatchObject({ generationMatched: true, truncated: false, candidates: [
      { call: { id: call.id, targetId: null, resolution: "unresolved" },
        declaration: { name: "isCycle", filePath: "signal.ts" }, callerEdge: { kind: "calls", resolution: "exact" },
        constructionEdge: { kind: "instantiates", resolution: "exact" }, importEdge: { kind: "imports", resolution: "exact" } }
    ] });
    const result = await service.explore(projectPath, "How does a provider instance detect a circular dependency?");
    const lead = result.focuses?.find(focus => focus.importedCallDeclaration !== undefined)!;
    expect(lead.symbol).toMatchObject({ name: "isCycle", filePath: "signal.ts" });
    expect(lead.source?.text).toContain("return id > 0;");
    expect(lead).toMatchObject({ score: 0, connectionScore: 0, matchedTerms: [],
      importedCallDeclaration: { state: "unresolved-declaration-candidate", call: { targetId: null } } });
    expect(renderExploreText(result)).toContain("receiver and call target remain unconfirmed");
    expect(store.getSnapshot(projectPath).edges.find(edge => edge.id === call.id)).toEqual(call);
  });

  it("rejects a construction in an unrelated method without a caller link", async () => {
    const { projectPath, store, generation, call } = await fixture(false);
    expect(store.getActiveImportedCallDeclarations(projectPath, generation, [call.id], 16))
      .toEqual({ generationMatched: true, candidates: [], truncated: false });
  });

  it("does not mix generations and exposes witness truncation", async () => {
    const { projectPath, store, generation, call } = await fixture();
    expect(store.getActiveImportedCallDeclarations(projectPath, "old-generation", [call.id], 16))
      .toEqual({ generationMatched: false, candidates: [], truncated: false });
    expect(store.getActiveImportedCallDeclarations(projectPath, generation, [call.id], 0))
      .toEqual({ generationMatched: true, candidates: [], truncated: true });
    expect(() => store.getActiveImportedCallDeclarations(projectPath, generation, Array(9).fill(call.id), 16)).toThrow(RangeError);
    expect(() => store.getActiveImportedCallDeclarations(projectPath, generation, [call.id], 17)).toThrow(RangeError);
  });
});

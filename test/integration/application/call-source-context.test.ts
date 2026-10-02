import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import { renderExploreText } from "../../../src/mcp/explore-text.js";

it("delivers both base methods through one nested call read and retains unknown dispatch", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-call-source-context-"));
  const store = new SqliteGraphStore();
  try {
    await mkdir(join(projectPath, "pkg"));
    await writeFile(join(projectPath, "pkg", "__init__.py"), "");
    await writeFile(join(projectPath, "pkg", "base.py"), "class Base:\n    def exception_code(self, error):\n        return (type(error), 500)\n");
    await writeFile(join(projectPath, "pkg", "middle.py"), "from .base import Base\nclass Middle(Base):\n    def select_handler(self, error):\n        return self.exception_code(error)\n");
    await writeFile(join(projectPath, "wrapper.py"), "from pkg.middle import Middle\nclass Wrapper(Middle):\n    def alpha(self, error):\n        # bravo charlie delta echo foxtrot golf hotel\n        return self.select_handler(error)\n    def process_request(self, error):\n        return self.alpha(error)\n");
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const full = vi.spyOn(store, "getSnapshot"), declarations = vi.spyOn(store, "getActiveNamedDeclarations");
    const reads = vi.spyOn(store, "getActiveUnresolvedCalls"), documents = vi.spyOn(store, "getActiveSourceDocuments");
    const result = await service.explore(projectPath, "alpha bravo charlie delta echo foxtrot golf hotel handler exception codes request");
    const contexts = result.sourceWindows?.filter(window => window.callSourceContext) ?? [];
    expect(contexts.map(window => window.callSourceContext?.declaration.name)).toEqual(["select_handler", "exception_code"]);
    expect(contexts[1]?.callSourceContext?.steps).toHaveLength(2);
    expect(contexts[1]?.source?.text).toContain("return (type(error), 500)");
    expect(result.sourceWindows?.some(window => window.source?.text.includes("return self.alpha(error)"))).toBe(true);
    expect(result.sourceWindowPlan?.callSourceContextSearch).toMatchObject({ matchedCount: 3, selectedCount: 2, truncated: false });
    for (const window of contexts) for (const step of window.callSourceContext?.steps ?? []) {
      expect(step.call).toMatchObject({ targetId: null, confidence: 0, resolution: "unresolved" });
    }
    const nestedReads = reads.mock.calls.filter(call => call[2].some(id => id.includes("select_handler")));
    expect(nestedReads).toHaveLength(1);
    expect(nestedReads[0]?.[3]).toBe(8);
    expect(documents.mock.calls.some(call => call[2].includes("pkg/base.py"))).toBe(true);
    expect(full).not.toHaveBeenCalled();
    expect(declarations).not.toHaveBeenCalled();
    const text = renderExploreText(result);
    expect(text).toContain("self calls remain unresolved");
    expect(text).toContain("Base import");
    expect(text).toContain("runtime MRO or dispatch proof");
    const emitted = (result.sourceAllocation?.summary.emittedCharacters ?? 0) +
      (result.sourceWindowAllocation?.summary.emittedCharacters ?? 0);
    expect(emitted).toBeLessThanOrEqual(24000);
  } finally {
    store.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});

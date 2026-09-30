import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import { renderExploreText } from "../../../src/mcp/explore-text.js";

it("returns base-method source with indexed witnesses without a full snapshot or extra declaration lookup", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-inherited-source-"));
  const store = new SqliteGraphStore();
  try {
    await mkdir(join(projectPath, "pkg"));
    await writeFile(join(projectPath, "pkg", "__init__.py"), "");
    await writeFile(join(projectPath, "pkg", "base.py"), "class Base:\n    def temporary_connection(self):\n        return 'base source'\n");
    await writeFile(join(projectPath, "wrapper.py"), "from pkg.base import Base\nclass Wrapper(Base):\n    def alpha(self):\n        # bravo charlie delta echo foxtrot golf hotel\n        return self.temporary_connection()\n");
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const full = vi.spyOn(store, "getSnapshot"), declarations = vi.spyOn(store, "getActiveNamedDeclarations");
    const result = await service.explore(projectPath, "alpha bravo charlie delta echo foxtrot golf hotel temporary connection");
    const lead = result.focuses?.find(focus => focus.omittedQueryDeclaration?.scope === "inspected-inherited-source");
    expect(lead?.symbol.filePath).toBe("pkg/base.py");
    expect(lead?.source?.text).toContain("base source");
    expect(lead?.omittedQueryDeclaration?.call).toMatchObject({ targetId: null, confidence: 0, resolution: "unresolved" });
    expect(renderExploreText(result)).toContain("Written direct-base source context; runtime inheritance and dispatch remain unconfirmed.");
    expect(renderExploreText(result)).toContain("Base import");
    expect(full).not.toHaveBeenCalled();
    expect(declarations).not.toHaveBeenCalled();
  } finally {
    store.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});

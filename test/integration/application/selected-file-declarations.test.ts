import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import { renderExploreText } from "../../../src/mcp/explore-text.js";

describe("selected-file declaration projection", () => {
  it("recovers source outside the graph without resolving calls or reading the full snapshot", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-selected-declaration-"));
    const store = new SqliteGraphStore();
    try {
      await writeFile(join(projectPath, "restore.py"), "def alpha():\n    # charlie delta echo foxtrot golf hotel\n    return connection.constraint_checks_disabled()\n");
      await writeFile(join(projectPath, "base.py"), "def bravo():\n    return None\n\ndef constraint_checks_disabled():\n    return 'disable checks'\n");
      await writeFile(join(projectPath, "outside.py"), "def constraint_checks_disabled():\n    return 'outside'\n");
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      const initial = await service.init({ projectPath });
      const generation = initial.generationId!;
      const projection = store.getActiveNamedDeclarations(projectPath, generation, ["constraint_checks_disabled"], ["base.py"], 16);
      expect(projection).toMatchObject({ generationMatched: true, truncated: false,
        declarations: [{ name: "constraint_checks_disabled", filePath: "base.py" }] });
      expect(store.getActiveNamedDeclarations(projectPath, generation, ["constraint_checks_disabled"], ["base.py", "outside.py"], 1)).toMatchObject({ truncated: true });
      expect(store.getActiveNamedDeclarations(projectPath, "wrong-generation", ["constraint_checks_disabled"], ["base.py"], 16)).toEqual({ generationMatched: false, declarations: [], truncated: false });
      expect(store.getActiveNamedDeclarations(projectPath, generation, ["CONSTRAINT_CHECKS_DISABLED"], ["base.py"], 16).declarations).toEqual([]);
      expect(store.getActiveNamedDeclarations(projectPath, generation, [], ["base.py"], 16).declarations).toEqual([]);
      expect(() => store.getActiveNamedDeclarations(projectPath, generation, Array(9).fill("x"), ["base.py"], 16)).toThrow(RangeError);
      expect(() => store.getActiveNamedDeclarations(projectPath, generation, ["x"], Array(9).fill("base.py"), 16)).toThrow(RangeError);
      expect(() => store.getActiveNamedDeclarations(projectPath, generation, ["x"], ["base.py"], 17)).toThrow(RangeError);
      const boundedRead = store.getActiveBoundedGraphBundle.bind(store);
      vi.spyOn(store, "getActiveBoundedGraphBundle").mockImplementation((path, request) => {
        const bundle = boundedRead(path, request);
        return { ...bundle, snapshot: { ...bundle.snapshot,
          symbols: bundle.snapshot.symbols.filter(symbol => symbol.name !== "constraint_checks_disabled") },
          diagnostics: { ...bundle.diagnostics, truncated: true } };
      });
      const fullRead = vi.spyOn(store, "getSnapshot");
      const result = await service.explore(projectPath, "alpha bravo charlie delta echo foxtrot golf hotel checking constraints");
      const lead = result.focuses?.find(focus => focus.omittedQueryDeclaration?.scope === "selected-files-index");
      expect(lead?.symbol.filePath).toBe("base.py");
      expect(lead?.source?.text).toContain("disable checks");
      expect(lead?.omittedQueryDeclaration?.call).toMatchObject({ targetId: null, resolution: "unresolved", confidence: 0 });
      expect(renderExploreText(result)).toContain("selected-file index lookup");
      expect(fullRead).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});

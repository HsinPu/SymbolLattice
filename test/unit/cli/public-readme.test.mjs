import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readRepositoryFile(name) {
  return readFile(new URL(`../../../${name}`, import.meta.url), "utf8");
}

describe("public SymbolLattice installation documentation", () => {
  it("keeps the primary bilingual installation flow on the new breaking names", async () => {
    const [traditional, english, packageText] = await Promise.all([
      readRepositoryFile("README.md"),
      readRepositoryFile("README.en.md"),
      readRepositoryFile("package.json")
    ]);
    const packageJson = JSON.parse(packageText);

    expect(packageJson.name).toBe("@hsinpu/symbollattice");
    expect(packageJson.bin).toEqual({ SymbolLattice: "./dist/cli/main.js" });

    for (const [readme, upgradeHeading] of [
      [traditional, "## 從 v0.420.0 或更早版本升級"],
      [english, "## Upgrading from v0.420.0 or earlier"]
    ]) {
      const [primary, migration] = readme.split(upgradeHeading);
      expect(migration).toBeDefined();
      expect(primary).toContain("https://github.com/HsinPu/SymbolLattice.git");
      expect(primary).toContain("install.ps1");
      expect(primary).toContain("-Ref");
      expect(primary).toContain("-Apply -Yes");
      expect(primary).toContain("SymbolLattice install codex --apply --yes");
      expect(primary).toContain("SymbolLattice doctor codex");
      expect(primary).toContain("dist/cli/main.js");
      expect(primary).toContain("SymbolLattice init .");
      expect(primary).toContain("monorepo");
      expect(primary).toContain("workspace");
      expect(primary).toContain("projectPath");
      expect(primary).toContain("SYMBOL_LATTICE_MCP_TOOLS");
      expect(primary).toContain("mcp_servers.SymbolLattice");
      expect(primary).toContain(".SymbolLattice");
      expect(primary).not.toContain("npm install -g @hsinpu/symbollattice");
      expect(primary).not.toContain("@hsinpu/symbol-lattice");
      expect(primary).not.toContain("symbol-lattice uninstall");
      expect(primary).not.toContain(".symbol-lattice");
      expect(primary).not.toContain("symbol_lattice");

      expect(migration).toContain("symbol-lattice uninstall codex --apply --yes");
      expect(migration).toContain("npm uninstall -g @hsinpu/symbol-lattice");
      expect(migration).toContain("GitHub");
      expect(migration).not.toContain("npm install -g @hsinpu/symbollattice");
      expect(migration).toContain("SymbolLattice init .");
    }

    expect(traditional).toContain("[English](README.en.md)");
    expect(english).toContain("[繁體中文](README.md)");
    expect(traditional).not.toContain("仍需完成隔離安裝");
    expect(english).not.toContain("remains pending isolated installation");
  });
});

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const docs = [
  { path: "README.md", language: "zh-TW" },
  { path: "README.en.md", language: "en" }
];

describe("GitHub source installation documentation", () => {
  for (const doc of docs) {
    it(`${doc.language} documents the fixed-ref preview-first source installer`, async () => {
      const content = await readFile(doc.path, "utf8");
      const packageVersion = JSON.parse(await readFile("package.json", "utf8")).version;

      expect(content).toContain(`v${packageVersion}`);
      expect(content).toContain("https://github.com/HsinPu/SymbolLattice.git");
      expect(content).toContain("install.ps1");
      expect(content).toContain("-Ref");
      expect(content).toContain("-Apply -Yes");
      expect(content).toContain("SymbolLattice install codex");
      expect(content).toContain("SymbolLattice init .");
      expect(content).not.toContain("npm install -g @hsinpu/symbollattice");
      expect(content).not.toContain("npm install -g @hsinpu/symbol-lattice");
    });
  }
});

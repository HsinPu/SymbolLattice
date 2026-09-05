import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Markdown reference-link project relations v0.482", () => {
  it("resolves unique reference links to indexed local files", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-markdown-reference-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "docs"), { recursive: true });
    await writeFile(join(projectPath, "docs", "index.md"), [
      "# Index",
      "",
      "[guide][guide-ref]",
      "[guide-ref][]",
      "",
      "[guide-ref]: guide.md",
      ""
    ].join("\n"), "utf8");
    await writeFile(join(projectPath, "docs", "guide.md"), "# Guide\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const status = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const referenceEdges = snapshot.edges.filter((edge) => edge.kind === "references");

    expect(status).toMatchObject({ initialized: true, stale: false });
    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v414");
    expect(store.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v199");
    expect(referenceEdges).toHaveLength(2);
    expect(referenceEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.markdown.reference-link.literal-project-file.exact-target"
        })
      })
    ]));
  });

  it("keeps duplicate reference definitions unresolved", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-markdown-reference-duplicate-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "docs"), { recursive: true });
    await writeFile(join(projectPath, "docs", "index.md"), [
      "[guide][guide-ref]",
      "[guide-ref]: first.md",
      "[guide-ref]: second.md",
      ""
    ].join("\n"), "utf8");
    await writeFile(join(projectPath, "docs", "first.md"), "# First\n", "utf8");
    await writeFile(join(projectPath, "docs", "second.md"), "# Second\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "references")).toEqual([]);
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("HTML project indexing", () => {
  it("includes HTML files and element containment during init", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-html-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "web"), { recursive: true });
    await writeFile(
      join(projectPath, "web", "index.html"),
      '<!doctype html><html lang="en"><body><main id="app"><h1>Welcome</h1><h3>Details</h3><img></main></body></html>\n',
      "utf8"
    );
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    const status = await service.init({ projectPath });
    const htmlFacts = store
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "web/index.html");
    const result = await service.find(projectPath, "web/index.html#html-element:html[1]/body[1]/main[1]");
    const attributeResult = await service.find(projectPath, "html-attribute:id=app");
    const diagnosticResult = await service.find(projectPath, "diagnostic:image-missing-alt");

    expect(status).toMatchObject({ initialized: true, stale: false });
    expect(htmlFacts).toMatchObject({
      language: "html",
      symbols: expect.arrayContaining([
        expect.objectContaining({ name: "html", kind: "resource" }),
        expect.objectContaining({ name: "main", kind: "resource" }),
        expect.objectContaining({ name: "id=app", kind: "resource" }),
        expect.objectContaining({ name: "landmark:main", kind: "resource" }),
        expect.objectContaining({ name: "diagnostic:image-missing-alt", kind: "resource" })
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({
          kind: "contains",
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({ ruleId: "syntax.html.direct-child-element" })
        })
      ])
    });
    expect(result.symbols).toContainEqual(
      expect.objectContaining({ name: "main", kind: "resource", filePath: "web/index.html" })
    );
    expect(attributeResult.symbols).toContainEqual(
      expect.objectContaining({ name: "id=app", filePath: "web/index.html" })
    );
    expect(diagnosticResult.symbols).toContainEqual(
      expect.objectContaining({ name: "diagnostic:image-missing-alt", filePath: "web/index.html" })
    );
  });
});

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

describe("Markdown project indexing", () => {
  it("indexes headings, exact file references, and persisted Markdown source search", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-markdown-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "docs"), { recursive: true });
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(
      join(projectPath, "README.md"),
      ["# Project Guide", "", "See [implementation](src/index.ts)."].join("\n"),
      "utf8"
    );
    await writeFile(join(projectPath, "docs", "notes.markdown"), "Release checklist needle\n", "utf8");
    await writeFile(join(projectPath, "src", "index.ts"), "export const ready = true;\n", "utf8");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    const status = await service.init({ projectPath });
    const markdownFacts = store
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "README.md");
    const graph = store.getSnapshot(projectPath);
    const search = await service.search(projectPath, "checklist needle", { language: "markdown" });
    const heading = graph.symbols.find((symbol) => symbol.name === "Project Guide");
    const node = await service.node(projectPath, heading?.id ?? "missing");

    expect(status).toMatchObject({ initialized: true, stale: false });
    expect(markdownFacts).toMatchObject({
      language: "markdown",
      symbols: expect.arrayContaining([
        expect.objectContaining({ name: "Project Guide", kind: "resource" })
      ]),
      markdownFacts: {
        links: [expect.objectContaining({ targetFilePath: "src/index.ts" })]
      }
    });
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: "references",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.markdown.inline-link.literal-project-file.exact-target"
        })
      })
    );
    expect(search.results).toMatchObject([
      expect.objectContaining({
        filePath: "docs/notes.markdown",
        language: "markdown",
        matchingTerms: ["checklist", "needle"]
      })
    ]);
    expect(node).toMatchObject({
      match: { status: "exact", symbol: { name: "Project Guide" } },
      sourceAvailability: "active-generation",
      source: { filePath: "README.md", text: "# Project Guide", truncated: false }
    });
  });
});

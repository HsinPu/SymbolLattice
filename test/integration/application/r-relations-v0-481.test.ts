import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-r-relations-project-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true })));
});

describe("R project relations v0.481", () => {
  it("resolves a unique same-file direct call and never guesses a cross-file call", async () => {
    const projectPath = await createInlineProject({
      "R/entry.R": [
        "helper <- function(value) { value }",
        "entry <- function(value) { helper(value) }",
        ""
      ].join("\n"),
      "R/foreign.R": "helper <- function(value) { value + 1 }\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const entry = snapshot.symbols.find((symbol) => symbol.qualifiedName === "R/entry.R#entry");
    const helper = snapshot.symbols.find((symbol) => symbol.qualifiedName === "R/entry.R#helper");
    expect(indexed).toMatchObject({ stale: false });
    expect(graphStore.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v398");
    expect(graphStore.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v197");
    expect(graphStore.getArtifactFacts(projectPath).find((facts) => facts.filePath === "R/entry.R")?.rFacts).toMatchObject({ parserRejected: false });
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: entry?.id, targetId: helper?.id, kind: "calls", resolution: "exact", confidence: 1 })
    ]));
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toHaveLength(1);
  });

  it("keeps duplicate same-file targets and dispatch-tainted targets unresolved", async () => {
    const projectPath = await createInlineProject({
      "R/duplicate.R": [
        "helper <- function(value) { value }",
        "helper <- function(value) { value + 1 }",
        "entry <- function(value) { helper(value) }",
        ""
      ].join("\n"),
      "R/generic.R": [
        "helper <- function(value) { UseMethod(\"helper\") }",
        "entry <- function(value) { helper(value) }",
        ""
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });
});

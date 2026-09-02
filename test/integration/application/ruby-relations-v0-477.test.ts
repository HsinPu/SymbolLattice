import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-ruby-project-"));
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

describe("Ruby project relations v0.477", () => {
  it("resolves unique required module, superclass, and singleton call", async () => {
    const projectPath = await createInlineProject({
      "src/parent.rb": [
        "class Parent",
        "  def self.ping(value)",
        "    value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "src/child.rb": [
        'require_relative "./parent"',
        "class Child < Parent",
        "  def run(value)",
        "    Parent.ping(value)",
        "  end",
        "end",
        ""
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const childFile = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/child.rb");
    const parentFile = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/parent.rb");
    const child = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/child.rb#Child");
    const parent = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/parent.rb#Parent");
    const run = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/child.rb#Child.run");
    const ping = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/parent.rb#Parent.ping");
    expect(indexed).toMatchObject({ stale: false });
    expect(graphStore.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v396");
    expect(graphStore.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v197");
    expect(graphStore.getArtifactFacts(projectPath).find((facts) => facts.filePath === "src/child.rb")?.rubyFacts).toMatchObject({ parserRejected: false });
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: childFile?.id, targetId: parentFile?.id, kind: "imports", resolution: "exact" }),
      expect.objectContaining({ sourceId: child?.id, targetId: parent?.id, kind: "extends", resolution: "exact" }),
      expect.objectContaining({ sourceId: run?.id, targetId: ping?.id, kind: "calls", resolution: "exact" })
    ]));
  });

  it("fails closed for ambiguous required paths and duplicate type declarations", async () => {
    const projectPath = await createInlineProject({
      "src/a/parent.rb": "module Parent\nend\n",
      "src/b/parent.rb": "module Parent\nend\n",
      "src/child.rb": [
        'require_relative "./parent"',
        "class Child < Parent",
        "  def run",
        "    Parent.ping",
        "  end",
        "end",
        ""
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    expect(snapshot.edges.filter((edge) => edge.kind === "imports" || edge.kind === "calls" || edge.kind === "extends")).toEqual([]);
  });
});

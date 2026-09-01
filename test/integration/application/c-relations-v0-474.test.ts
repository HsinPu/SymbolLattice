import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-c-v474-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("C v0.474 project relations", () => {
  it("projects one unique local include, cross-file call, and signature edges", async () => {
    const projectPath = await createProject({
      "src/api.h": [
        "struct Model { int value; };",
        "struct Model build(struct Model value) { return value; }"
      ].join("\n"),
      "src/app.c": [
        '#include "api.h"',
        "struct Model run(struct Model value) { return build(value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const appFile = symbol("src/app.c");
    const headerFile = symbol("src/api.h");
    const model = symbol("src/api.h#Model");
    const build = symbol("src/api.h#build");
    const run = symbol("src/app.c#run");
    expect(appFile).toBeDefined();
    expect(headerFile).toBeDefined();
    expect(model).toBeDefined();
    expect(build).toBeDefined();
    expect(run).toBeDefined();
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: headerFile?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "calls", sourceId: run?.id, targetId: build?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "accepts", sourceId: run?.id, targetId: model?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "returns", sourceId: run?.id, targetId: model?.id, resolution: "exact" })
      ])
    );
  });

  it("fails closed for duplicate include targets, macros, and missing headers", async () => {
    const projectPath = await createProject({
      "src/one.h": "int build(int value) { return value; }",
      "src/two.h": "int build(int value) { return value + 1; }",
      "src/app.c": [
        '#include "one.h"',
        '#include "two.h"',
        "int duplicate(int value) { return build(value); }",
        "#define local_build(value) value",
        "int macro(int value) { return local_build(value); }",
        '#include "missing.h"',
        "int missing(int value) { return foreign(value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const exactCalls = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    expect(exactCalls).toEqual([]);
  });
});

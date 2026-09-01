import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-cpp-v473-"));
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

describe("C++ v0.473 project relations", () => {
  it("projects a unique local include, cross-file call/construction, member call, and signatures", async () => {
    const projectPath = await createProject({
      "src/api.hpp": [
        "struct Model {};",
        "inline Model build(Model value) { return value; }",
        "struct Box {",
        "  int helper(int value) { return value; }",
        "  int caller(int value) { this->helper(value); return value; }",
        "};"
      ].join("\n"),
      "src/app.cpp": [
        '#include "api.hpp"',
        "inline Model run(Model value) { return *new Model(); }",
        "inline Model invoke(Model value) { return build(value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const appFile = symbol("src/app.cpp");
    const headerFile = symbol("src/api.hpp");
    const model = symbol("src/api.hpp#Model");
    const build = symbol("src/api.hpp#build");
    const run = symbol("src/app.cpp#run");
    const invoke = symbol("src/app.cpp#invoke");
    const boxHelper = symbol("src/api.hpp#Box.helper");
    const boxCaller = symbol("src/api.hpp#Box.caller");
    expect(appFile).toBeDefined();
    expect(headerFile).toBeDefined();
    expect(model).toBeDefined();
    expect(build).toBeDefined();
    expect(run).toBeDefined();
    expect(invoke).toBeDefined();
    expect(boxHelper).toBeDefined();
    expect(boxCaller).toBeDefined();
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: headerFile?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "calls", sourceId: invoke?.id, targetId: build?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "instantiates", sourceId: run?.id, targetId: model?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "calls", sourceId: boxCaller?.id, targetId: boxHelper?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "accepts", sourceId: run?.id, targetId: model?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "returns", sourceId: run?.id, targetId: model?.id, resolution: "exact" })
      ])
    );
  });

  it("keeps overload and missing include targets unresolved", async () => {
    const projectPath = await createProject({
      "src/api.hpp": [
        "inline int build(int value) { return value; }",
        "inline double build(double value) { return value; }"
      ].join("\n"),
      "src/app.cpp": [
        '#include "api.hpp"',
        "inline int invoke(int value) { return build(value); }",
        "#include \"missing.hpp\"",
        "inline int missing(int value) { return foreign(value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const exact = store.getSnapshot(projectPath).edges.filter((edge) => ["imports", "calls", "instantiates"].includes(edge.kind) && edge.resolution === "exact");
    expect(exact.filter((edge) => edge.kind === "calls")).toEqual([]);
    expect(exact.filter((edge) => edge.kind === "imports")).toHaveLength(1);
  });
});

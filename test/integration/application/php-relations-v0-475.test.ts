import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-php-v475-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("PHP v0.475 project relations", () => {
  it("projects unique use imports, direct calls, new, static calls, heritage, and signatures", async () => {
    const projectPath = await createProject({
      "src/Domain.php": [
        "<?php",
        "namespace Domain;",
        "class Model {",
        "  public static function make(Model $value): Model { return new Model(); }",
        "}",
        "function build(Model $value): Model { return $value; }"
      ].join("\n"),
      "src/App.php": [
        "<?php",
        "namespace App;",
        "use Domain\\Model;",
        "use function Domain\\build as buildModel;",
        "class Child extends Model {",
        "  public function run(Model $value): Model { return Model::make($value); }",
        "}",
        "function execute(Model $value): Model { return buildModel($value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const appFile = symbol("src/App.php");
    const domainFile = symbol("src/Domain.php");
    const model = symbol("src/Domain.php#Model");
    const build = symbol("src/Domain.php#build");
    const child = symbol("src/App.php#Child");
    const run = symbol("src/App.php#Child.run");
    const execute = symbol("src/App.php#execute");
    const modelMake = symbol("src/Domain.php#Model.make");
    expect(appFile).toBeDefined();
    expect(domainFile).toBeDefined();
    expect(model).toBeDefined();
    expect(build).toBeDefined();
    expect(child).toBeDefined();
    expect(run).toBeDefined();
    expect(execute).toBeDefined();
    expect(modelMake).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: domainFile?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: build?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: run?.id, targetId: modelMake?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: modelMake?.id, targetId: model?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: child?.id, targetId: model?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: model?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: model?.id, resolution: "exact" })
    ]));
  });

  it("fails closed for ambiguous imports, dynamic calls, and duplicate static methods", async () => {
    const projectPath = await createProject({
      "src/One.php": "<?php namespace One; class Model { public static function make(): Model { return new Model(); } }",
      "src/Two.php": "<?php namespace Two; class Model { public static function make(): Model { return new Model(); } }",
      "src/App.php": [
        "<?php",
        "namespace App;",
        "use One\\Model;",
        "use Two\\Model;",
        "class Run { public function go(): Model { return Model::make(); } }",
        "function dynamic(string $name): mixed { return $name(); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const exact = store.getSnapshot(projectPath).edges.filter((edge) => edge.filePath === "src/App.php" && edge.resolution === "exact" && ["calls", "instantiates", "extends", "accepts", "returns"].includes(edge.kind));
    expect(exact).toEqual([]);
  });
});

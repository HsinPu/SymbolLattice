import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-fsharp-v463-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("F# v0.463 project relations", () => {
  it("projects explicit open, typed calls, pipeline, constructor, heritage, signatures, and override", async () => {
    const projectPath = await createProject({
      "src/Api.fs": [
        "module Demo.Api",
        "",
        "type Point(value: int) =",
        "    member _.Magnitude() : int = value",
        "",
        "type IContract = abstract Act: Point -> Point",
        "type Base() =",
        "    abstract Run: Point -> Point",
        "",
        "type Service() =",
        "    inherit Base()",
        "    interface IContract with",
        "        member _.Act(p: Point) : Point = p",
        "    override _.Run(p: Point) : Point = p",
        "",
        "module Helpers =",
        "    let helper (p: Point) : Point = p"
      ].join("\n"),
      "src/App.fs": [
        "module Demo.App",
        "open Demo.Api",
        "",
        "let localA (p: Point) : Point = p",
        "",
        "let execute (p: Point) (service: Service) : Point =",
        "    let local: Point = Point(1)",
        "    service.Run(p)",
        "    local.Magnitude()",
        "    Helpers.helper(p)",
        "    p |> localA",
        "    Point(2)"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/App.fs#Demo.App.execute");
    const point = symbol("src/Api.fs#Demo.Api.Point");
    const serviceType = symbol("src/Api.fs#Demo.Api.Service");
    const run = symbol("src/Api.fs#Demo.Api.Service.Run");
    const magnitude = symbol("src/Api.fs#Demo.Api.Point.Magnitude");
    const helper = symbol("src/Api.fs#Demo.Api.Helpers.helper");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/App.fs")?.id, targetId: symbol("src/Api.fs")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: run?.id, referenceName: "Run", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: magnitude?.id, referenceName: "Magnitude", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: serviceType?.id, targetId: symbol("src/Api.fs#Demo.Api.Base")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: symbol("src/Api.fs#Demo.Api.IContract")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: run?.id, targetId: symbol("src/Api.fs#Demo.Api.Base.Run")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate opened modules and untyped receivers unresolved", async () => {
    const projectPath = await createProject({
      "src/One.fs": "module Demo.One\ntype Point() = member _.Run() = ()\n",
      "src/Two.fs": "module Demo.Two\ntype Point() = member _.Run() = ()\n",
      "src/App.fs": "module Demo.App\nopen Demo.One\nopen Demo.Two\nlet execute value = value.Run()\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    expect(snapshot.edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

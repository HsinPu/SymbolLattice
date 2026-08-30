import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-scala-v466-"));
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

describe("Scala v0.466 project relations", () => {
  it("projects explicit imports, direct/object/member calls, constructors, heritage, signatures, and override", async () => {
    const projectPath = await createProject({
      "src/Api.scala": [
        "package demo.api",
        "trait Contract { def run(value: Int): Int }",
        "class Base { def run(value: Int): Int = value }",
        "case class Point(value: Int) { def magnitude(): Int = value }",
        "class Service(val point: Point) extends Base with Contract { override def run(value: Int): Int = value; def execute(input: Point): Point = Api.helper(input) }",
        "object Api { def helper(point: Point): Point = point }",
        "enum Color { case Red, Blue }",
        "type Alias = Point"
      ].join("\n"),
      "src/App.scala": [
        "package demo.app",
        "import demo.api.Api",
        "import demo.api.Point",
        "import demo.api.Service",
        "object App {",
        "  def local(value: Point): Point = Api.helper(value)",
        "  def execute(value: Point): Point = {",
        "    val created: Point = new Point(1)",
        "    val caseCreated: Point = Point(2)",
        "    val service: Service = new Service(created)",
        "    val localResult: Point = local(value)",
        "    val memberResult: Int = created.magnitude()",
        "    val serviceResult: Point = service.execute(value)",
        "    Api.helper(created)",
        "  }",
        "}"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/App.scala#App.execute");
    const local = symbol("src/App.scala#App.local");
    const helper = symbol("src/Api.scala#Api.helper");
    const point = symbol("src/Api.scala#Point");
    const serviceType = symbol("src/Api.scala#Service");
    const contract = symbol("src/Api.scala#Contract");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/App.scala")?.id, targetId: symbol("src/Api.scala")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: local?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: local?.id, referenceName: "local", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: symbol("src/Api.scala#Point.magnitude")?.id, referenceName: "magnitude", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: serviceType?.id, referenceName: "Service", resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: serviceType?.id, targetId: symbol("src/Api.scala#Base")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: symbol("src/Api.scala#Service.run")?.id, targetId: symbol("src/Api.scala#Base.run")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate package types and ambiguous overloads unresolved", async () => {
    const projectPath = await createProject({
      "src/One.scala": "package demo\nclass Point { def run(): Int = 1 }\n",
      "src/Two.scala": "package demo\nclass Point { def run(): Int = 2 }\n",
      "src/App.scala": "package app\nimport demo.Point\nobject App { def execute(point: Point): Int = point.run() }\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

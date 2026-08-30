import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-dart-v461-"));
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

describe("Dart v0.461 project relations", () => {
  it("projects literal local imports, calls, construction, heritage, signatures, and override", async () => {
    const projectPath = await createProject({
      "lib/api.dart": [
        "class Base {",
        "  Base(int value) {}",
        "  void run() {}",
        "}",
        "class Child extends Base with Mixin implements Contract {",
        "  Child(int value) : super(value);",
        "  @override",
        "  void run() {}",
        "}",
        "mixin Mixin { void mix() {} }",
        "abstract class Contract { void act(); }",
        "class Point {",
        "  Point(int value) {}",
        "  int magnitude() => 0;",
        "}",
        "extension PointExtensions on Point { int doubled() => 2; }",
        "int helper(Point value) => value.magnitude();"
      ].join("\n"),
      "lib/app.dart": [
        "import 'api.dart';",
        "void caller() {",
        "  final Point local = Point(1);",
        "  local.magnitude();",
        "  local.doubled();",
        "  helper(Point(1));",
        "  Child(1);",
        "}"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("lib/app.dart#caller");
    const point = symbol("lib/api.dart#Point");
    const pointMagnitude = symbol("lib/api.dart#Point.magnitude");
    const pointDoubled = symbol("lib/api.dart#PointExtensions.doubled");
    const child = symbol("lib/api.dart#Child");
    const base = symbol("lib/api.dart#Base");
    const contract = symbol("lib/api.dart#Contract");
    const helper = symbol("lib/api.dart#helper");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("lib/app.dart")?.id, targetId: symbol("lib/api.dart")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: pointMagnitude?.id, referenceName: "magnitude", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: pointDoubled?.id, referenceName: "doubled", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: caller?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: caller?.id, targetId: child?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: child?.id, targetId: base?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: child?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: symbol("lib/api.dart#Child.run")?.id, targetId: symbol("lib/api.dart#Base.run")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: helper?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("does not project a private cross-file declaration", async () => {
    const projectPath = await createProject({
      "lib/hidden.dart": "class _Hidden { _Hidden() {} void run() {} }\n",
      "lib/app.dart": "import 'hidden.dart';\nvoid caller() { _Hidden(); }\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    expect(snapshot.edges.some((edge) => edge.kind === "instantiates" && edge.resolution === "exact")).toBe(false);
  });
});

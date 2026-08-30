import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-swift-v460-"));
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

describe("Swift v0.460 project relations", () => {
  it("projects explicit imports, calls, instantiation, conformance, extension, and override", async () => {
    const projectPath = await createProject({
      "Sources/API.swift": `public protocol Contract {
  func act()
}
public class Base {
  public init() {}
  public func run() {}
}
public struct Point {
  public init(x: Int) {}
  public func magnitude() {}
}
public class Service: Base, Contract {
  public init(value: Int) {}
  override public func run() {}
  func act() {}
}
extension Point {
  public func doubled() {}
}
public func helper() {}
public func makePoint(_ value: Point) -> Point { value }`,
      "Sources/App.swift": `import Demo.Point
import Demo.Service
import Demo.Contract
import Demo.helper
import Demo.makePoint

func caller(_ point: Point, _ service: Service) {
  point.magnitude()
  point.doubled()
  service.run()
  Point(x: 1)
  helper()
  makePoint(Point(x: 1))
}`
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("Sources/App.swift#caller");
    const point = symbol("Sources/API.swift#Point");
    const pointMagnitude = symbol("Sources/API.swift#Point.magnitude");
    const pointDoubled = symbol("Sources/API.swift#extension:Point.doubled");
    const serviceType = symbol("Sources/API.swift#Service");
    const base = symbol("Sources/API.swift#Base");
    const contract = symbol("Sources/API.swift#Contract");
    const helper = symbol("Sources/API.swift#helper");
    const makePoint = symbol("Sources/API.swift#makePoint");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("Sources/App.swift")?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: pointMagnitude?.id, referenceName: "magnitude", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: pointDoubled?.id, referenceName: "doubled", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: makePoint?.id, referenceName: "makePoint", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: caller?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: makePoint?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: makePoint?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: serviceType?.id, targetId: base?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: symbol("Sources/API.swift#Service.run")?.id, targetId: symbol("Sources/API.swift#Base.run")?.id, resolution: "exact" })
    ]));
  });

  it("keeps private cross-file targets unresolved", async () => {
    const projectPath = await createProject({
      "Sources/Hidden.swift": `private class Hidden {
  init() {}
  func run() {}
}`,
      "Sources/Caller.swift": `import Demo.Hidden
func caller(_ hidden: Hidden) {
  hidden.run()
  Hidden()
}`
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const caller = snapshot.symbols.find((symbol) => symbol.qualifiedName === "Sources/Caller.swift#caller");
    const hidden = snapshot.symbols.find((symbol) => symbol.qualifiedName === "Sources/Hidden.swift#Hidden");
    expect(snapshot.edges.some((edge) => edge.sourceId === caller?.id && edge.targetId === hidden?.id && edge.resolution === "exact")).toBe(false);
  });
});

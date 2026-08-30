import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-csharp-v462-"));
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

describe("C# v0.462 project relations", () => {
  it("projects a unique namespace using, member/static calls, constructors, heritage, signature, and override", async () => {
    const projectPath = await createProject({
      "src/Api.cs": [
        "namespace Demo.Api {",
        "  public interface IContract { void Act(Point p); }",
        "  public record Point(int Value);",
        "  public class Base {",
        "    public Base(int value) {}",
        "    public virtual Point Run(Point p) => p;",
        "  }",
        "  public class Service : Base, IContract {",
        "    public Service(int value) : base(value) {}",
        "    public override Point Run(Point p) => p;",
        "    public void Act(Point p) {}",
        "  }",
        "  public static class Helpers { public static Point Helper(Point p) => p; }",
        "}"
      ].join("\n"),
      "src/App.cs": [
        "using Demo.Api;",
        "namespace Demo.App {",
        "  public class Caller {",
        "    public Point Execute(Point point, Service service) {",
        "      Point local = new Point(1);",
        "      local = new Point(2);",
        "      service.Run(point);",
        "      Helpers.Helper(new Point(3));",
        "      new Service(1);",
        "      return Helpers.Helper(new Point(4));",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("src/App.cs#Caller.Execute");
    const point = symbol("src/Api.cs#Point");
    const serviceType = symbol("src/Api.cs#Service");
    const run = symbol("src/Api.cs#Service.Run");
    const helper = symbol("src/Api.cs#Helpers.Helper");
    const base = symbol("src/Api.cs#Base");
    const contract = symbol("src/Api.cs#IContract");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/App.cs")?.id, targetId: symbol("src/Api.cs")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: run?.id, referenceName: "Run", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: helper?.id, referenceName: "Helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: caller?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: caller?.id, targetId: serviceType?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: serviceType?.id, targetId: base?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: run?.id, targetId: symbol("src/Api.cs#Base.Run")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: caller?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: caller?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("does not project a private constructor across a using boundary", async () => {
    const projectPath = await createProject({
      "src/Api.cs": "namespace Demo.Api { public class Hidden { private Hidden() {} } }\n",
      "src/App.cs": "using Demo.Api;\nnamespace Demo.App { public class Caller { public void Run() { new Hidden(); } } }\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    expect(snapshot.edges.some((edge) => edge.kind === "instantiates" && edge.resolution === "exact")).toBe(false);
  });
});

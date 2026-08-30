import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-haskell-v465-"));
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

describe("Haskell v0.465 project relations", () => {
  it("projects explicit imports, qualified/direct calls, constructor creation, instances, and signatures", async () => {
    const projectPath = await createProject({
      "src/Api.hs": [
        "module Api (Point(..), Contract, helper) where",
        "data Point = Point Int",
        "class Contract a where",
        "  run :: a -> a",
        "instance Contract Point where",
        "  run p = p",
        "helper :: Point -> Point",
        "helper p = p"
      ].join("\n"),
      "src/App.hs": [
        "module App where",
        "import Api (Point(..), helper, Contract)",
        "import qualified Api as A",
        "local :: Point -> Point",
        "local p = helper p",
        "execute :: Point -> Point",
        "execute p =",
        "  let created = Point 1 in",
        "  let localResult = local p in",
        "  A.helper created"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/App.hs#App.execute");
    const local = symbol("src/App.hs#App.local");
    const helper = symbol("src/Api.hs#Api.helper");
    const point = symbol("src/Api.hs#Api.Point");
    const contract = symbol("src/Api.hs#Api.Contract");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/App.hs")?.id, targetId: symbol("src/Api.hs")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: local?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: local?.id, referenceName: "local", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: point?.id, targetId: contract?.id, referenceName: "Contract", resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("keeps ambiguous modules and untyped receivers unresolved", async () => {
    const projectPath = await createProject({
      "src/One.hs": "module One where\ndata Point = Point Int\nhelper :: Point -> Point\nhelper p = p\n",
      "src/Two.hs": "module Two where\ndata Point = Point Int\nhelper :: Point -> Point\nhelper p = p\n",
      "src/App.hs": "module App where\nimport qualified One as A\nimport qualified Two as A\nrun value = A.helper value\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

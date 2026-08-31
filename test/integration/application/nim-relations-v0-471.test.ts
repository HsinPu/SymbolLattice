import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-nim-v471-"));
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

describe("Nim v0.471 project relations", () => {
  it("projects literal imports, local/qualified calls, construction, and object heritage", async () => {
    const projectPath = await createProject({
      "src/api.nim": "proc build*(value: int): int = value\n",
      "src/base.nim": "type Parent* = object\n",
      "src/model.nim": [
        "import base",
        "type Child* = object of Parent"
      ].join("\n"),
      "src/app.nim": [
        "import api, model",
        "proc helper*(value: int): int = value",
        "proc local*(value: int): int = helper(value)",
        "proc remote*(value: int): int = api.build(value)",
        "proc make*(): Child = Child()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const appFile = symbol("src/app.nim");
    const local = symbol("src/app.nim.local");
    const remote = symbol("src/app.nim.remote");
    const helper = symbol("src/app.nim.helper");
    const build = symbol("src/api.nim.build");
    const child = symbol("src/model.nim#type:Child");
    const parent = symbol("src/base.nim#type:Parent");
    expect(appFile).toBeDefined();
    expect(local).toBeDefined();
    expect(remote).toBeDefined();
    expect(helper).toBeDefined();
    expect(build).toBeDefined();
    expect(child).toBeDefined();
    expect(parent).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: symbol("src/api.nim")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: symbol("src/model.nim")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: local?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: remote?.id, targetId: build?.id, referenceName: "api.build", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: symbol("src/app.nim.make")?.id, targetId: child?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: child?.id, targetId: parent?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate module candidates unresolved", async () => {
    const projectPath = await createProject({
      "src/one/api.nim": "proc build*(value: int): int = value\n",
      "src/two/api.nim": "proc build*(value: int): int = value\n",
      "src/app.nim": "import api\nproc remote*(value: int): int = api.build(value)\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

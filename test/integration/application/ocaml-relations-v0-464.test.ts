import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-ocaml-v464-"));
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

describe("OCaml v0.464 project relations", () => {
  it("projects explicit open, typed object calls, module calls, construction, heritage, signatures, and override", async () => {
    const projectPath = await createProject({
      "src/Api.ml": [
        "module Api = struct",
        "  class point (value : int) = object",
        "    method magnitude : int = value",
        "  end",
        "  class type contract = object",
        "    method act : point -> point",
        "  end",
        "  class base = object",
        "    method virtual run : point -> point",
        "  end",
        "  class service : contract = object",
        "    inherit base",
        "    method! run (p : point) : point = p",
        "  end",
        "  let helper (p : point) : point = p",
        "end"
      ].join("\n"),
      "src/App.ml": [
        "open Api",
        "let local_a (p : point) : point = p",
        "let execute (p : point) (service : service) : point =",
        "  let local : point = new point (1) in",
        "  service#run (p);",
        "  local#magnitude;",
        "  Api.helper (p);",
        "  local_a (p);",
        "  new service;",
        "  local"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/App.ml#execute");
    const point = symbol("src/Api.ml#Api.point");
    const serviceType = symbol("src/Api.ml#Api.service");
    const run = symbol("src/Api.ml#Api.service.run");
    const magnitude = symbol("src/Api.ml#Api.point.magnitude");
    const helper = symbol("src/Api.ml#Api.helper");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/App.ml")?.id, targetId: symbol("src/Api.ml")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: run?.id, referenceName: "run", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: magnitude?.id, referenceName: "magnitude", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: serviceType?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "extends", sourceId: serviceType?.id, targetId: symbol("src/Api.ml#Api.base")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: symbol("src/Api.ml#Api.contract")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "overrides", sourceId: run?.id, targetId: symbol("src/Api.ml#Api.base.run")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate modules and untyped object receivers unresolved", async () => {
    const projectPath = await createProject({
      "src/One.ml": "module One = struct\n  class point = object method run = () end\nend\n",
      "src/Two.ml": "module Two = struct\n  class point = object method run = () end\nend\n",
      "src/App.ml": "open One\nopen Two\nlet execute value = value#run\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    expect(snapshot.edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

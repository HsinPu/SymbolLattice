import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-erlang-v468-"));
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

describe("Erlang v0.468 project relations", () => {
  it("projects explicit imports, qualified/local calls, record creation, behaviour implementation, and specs", async () => {
    const projectPath = await createProject({
      "src/api.erl": [
        "-module(api).",
        "-export([helper/1]).",
        "-export_type([point/0]).",
        "-record(point, {value}).",
        "-type point() :: atom().",
        "-spec helper(point()) -> point().",
        "helper(Value) -> Value."
      ].join("\n"),
      "src/app.erl": [
        "-module(app).",
        "-import(api, [helper/1]).",
        "-export([execute/1]).",
        "-spec execute(point()) -> point().",
        "execute(Value) ->",
        "  Point = #point{value = Value},",
        "  api:helper(Point),",
        "  helper(Point)."
      ].join("\n"),
      "src/contract.erl": [
        "-module(contract).",
        "-export([]).",
        "-callback run(point()) -> point()."
      ].join("\n"),
      "src/service.erl": [
        "-module(service).",
        "-behaviour(contract).",
        "-export([run/1]).",
        "-spec run(point()) -> point().",
        "run(Value) -> Value."
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/app.erl#app.execute/1");
    const helper = symbol("src/api.erl#api.helper/1");
    const pointRecord = snapshot.symbols.find((item) => item.qualifiedName === "src/api.erl#api.point" && item.kind === "type" && item.range.start.line === 4);
    const pointType = snapshot.symbols.find((item) => item.qualifiedName === "src/api.erl#api.point" && item.kind === "type" && item.range.start.line === 5);
    const serviceType = symbol("src/service.erl#service");
    const contract = symbol("src/contract.erl#contract");
    expect(pointRecord).toBeDefined();
    expect(pointType).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/app.erl")?.id, targetId: symbol("src/api.erl")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper/1", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: pointRecord?.id, referenceName: "point", resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: pointType?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: pointType?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate modules and same-name imports unresolved", async () => {
    const projectPath = await createProject({
      "src/one.erl": "-module(duplicate).\n-export([run/1]).\nrun(Value) -> Value.\n",
      "src/two.erl": "-module(duplicate).\n-export([run/1]).\nrun(Value) -> Value.\n",
      "src/app.erl": [
        "-module(app).",
        "-import(duplicate, [run/1]).",
        "-export([execute/1]).",
        "execute(Value) -> duplicate:run(Value), run(Value)."
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.filter((edge) =>
      edge.resolution === "exact" && (edge.kind === "imports" || edge.kind === "calls")
    )).toEqual([]);
  });
});

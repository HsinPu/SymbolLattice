import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-elixir-v467-"));
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

describe("Elixir v0.467 project relations", () => {
  it("projects unique aliases, qualified/direct calls, struct creation, behaviour implementation, and specs", async () => {
    const projectPath = await createProject({
      "src/model.ex": [
        "defmodule Model do",
        "  defstruct value: 0",
        "end"
      ].join("\n"),
      "src/api.ex": [
        "defmodule Api do",
        "  alias Model",
        "  @spec build(%Model{}) :: %Model{}",
        "  def build(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n"),
      "src/contract.ex": [
        "defprotocol Contract do",
        "  def run(value)",
        "end",
        "defmodule Service do",
        "  @behaviour Contract",
        "  @spec run(%Model{}) :: %Model{}",
        "  def run(value) do",
        "    value",
        "  end",
        "end",
        "defimpl Contract, for: Model do",
        "  def run(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n"),
      "src/app.ex": [
        "defmodule App do",
        "  alias Api",
        "  alias Model",
        "  @spec execute(%Model{}) :: %Model{}",
        "  def execute(value) do",
        "    created = %Model{value: value}",
        "    Api.build(created)",
        "    execute_local(created)",
        "  end",
        "  @spec execute_local(%Model{}) :: %Model{}",
        "  def execute_local(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/app.ex#App.execute");
    const local = symbol("src/app.ex#App.execute_local");
    const build = symbol("src/api.ex#Api.build");
    const model = symbol("src/model.ex#Model.struct");
    const contract = symbol("src/contract.ex#Contract");
    const serviceType = symbol("src/contract.ex#Service");
    expect(execute).toBeDefined();
    expect(local).toBeDefined();
    expect(build).toBeDefined();
    expect(model).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/app.ex")?.id, targetId: symbol("src/api.ex")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: build?.id, referenceName: "build", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: local?.id, referenceName: "execute_local", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: model?.id, referenceName: "Model", resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: serviceType?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: model?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: model?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: model?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate module aliases unresolved", async () => {
    const projectPath = await createProject({
      "src/one.ex": "defmodule Duplicate do\n  def run(value), do: value\nend\n",
      "src/two.ex": "defmodule Duplicate do\n  def run(value), do: value\nend\n",
      "src/app.ex": [
        "defmodule App do",
        "  alias Duplicate",
        "  def execute(value) do",
        "    Duplicate.run(value)",
        "  end",
        "end"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const exact = store.getSnapshot(projectPath).edges.filter((edge) =>
      (edge.kind === "imports" || edge.kind === "calls") && edge.resolution === "exact"
    );
    expect(exact).toEqual([]);
  });

  it("keeps conflicting alias names unresolved", async () => {
    const projectPath = await createProject({
      "src/one.ex": "defmodule One do\n  def run(value), do: value\nend\n",
      "src/two.ex": "defmodule Two do\n  def run(value), do: value\nend\n",
      "src/app.ex": [
        "defmodule App do",
        "  alias One, as: Same",
        "  alias Two, as: Same",
        "  def execute(value) do",
        "    Same.run(value)",
        "  end",
        "end"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.resolution === "exact" && (edge.kind === "imports" || edge.kind === "calls"))).toBe(false);
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-clojure-v469-"));
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

describe("Clojure v0.469 project relations", () => {
  it("projects unique require/imports, local/referred/qualified calls, records, protocols, and type hints", async () => {
    const projectPath = await createProject({
      "src/api.clj": [
        "(ns api)",
        "(defn build [value] value)",
        "(defn helper [value] value)"
      ].join("\n"),
      "src/contract.clj": "(ns contract)\n(defprotocol Contract (run [value]))\n",
      "src/model.clj": [
        "(ns model (:require [contract :refer [Contract]]))",
        "(defrecord Point [value] Contract (run [this] this))"
      ].join("\n"),
      "src/app.clj": [
        "(ns app (:require [api :as api] [api :refer [helper]] [model :refer [Point ->Point]]))",
        "(defn ^Point execute [^Point value]",
        "  (api/build value)",
        "  (helper value)",
        "  (->Point value))"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const execute = symbol("src/app.clj#app.execute");
    const build = symbol("src/api.clj#api.build");
    const helper = symbol("src/api.clj#api.helper");
    const point = symbol("src/model.clj#model.Point");
    const contract = symbol("src/contract.clj#contract.Contract");
    expect(execute).toBeDefined();
    expect(build).toBeDefined();
    expect(helper).toBeDefined();
    expect(point).toBeDefined();
    expect(contract).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: symbol("src/app.clj")?.id, targetId: symbol("src/api.clj#api")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: build?.id, referenceName: "build", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: execute?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "instantiates", sourceId: execute?.id, targetId: point?.id, referenceName: "Point", resolution: "exact" }),
      expect.objectContaining({ kind: "implements", sourceId: point?.id, targetId: contract?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "accepts", sourceId: execute?.id, targetId: point?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "returns", sourceId: execute?.id, targetId: point?.id, resolution: "exact" })
    ]));
  });

  it("keeps duplicate namespaces, aliases, and same-name call targets unresolved", async () => {
    const projectPath = await createProject({
      "src/one.clj": "(ns duplicate)\n(defn run [value] value)\n",
      "src/two.clj": "(ns duplicate)\n(defn run [value] value)\n",
      "src/app.clj": [
        "(ns app (:require [duplicate :as same] [duplicate :as same]))",
        "(defn execute [value] (same/run value))"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.resolution === "exact" && (edge.kind === "imports" || edge.kind === "calls"))).toBe(false);
  });
});

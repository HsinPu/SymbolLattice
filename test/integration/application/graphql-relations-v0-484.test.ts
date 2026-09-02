import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GraphQL schema relations v0.484", () => {
  it("resolves a unique cross-file interface implementation", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-graphql-relations-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "schema"), { recursive: true });
    await writeFile(join(projectPath, "schema", "node.graphql"), "interface Node { id: ID! }\n", "utf8");
    await writeFile(join(projectPath, "schema", "user.graphql"), "type User implements Node { id: ID! }\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const user = snapshot.symbols.find((symbol) => symbol.name === "User");
    const node = snapshot.symbols.find((symbol) => symbol.name === "Node");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v394");
    expect(store.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v197");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: user?.id,
        targetId: node?.id,
        kind: "extends",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "module.graphql.unique-direct-interface-implementation",
          stage: "module",
          candidateSymbolIds: [node?.id]
        })
      })
    ]));
  });

  it("keeps duplicate interface and duplicate source types unresolved", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-graphql-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "schema"), { recursive: true });
    await writeFile(join(projectPath, "schema", "node-a.graphql"), "interface Node { id: ID! }\n", "utf8");
    await writeFile(join(projectPath, "schema", "node-b.graphql"), "interface Node { key: ID! }\n", "utf8");
    await writeFile(join(projectPath, "schema", "user.graphql"), "type User implements Node { id: ID! }\n", "utf8");
    await writeFile(join(projectPath, "schema", "user-copy.graphql"), "type User implements Node { id: ID! }\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(
      store.getSnapshot(projectPath).edges.filter((edge) =>
        edge.kind === "extends" && edge.evidence?.ruleId?.startsWith("module.graphql.")
      )
    ).toEqual([]);
  });
});

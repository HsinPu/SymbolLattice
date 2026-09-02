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

describe("Protocol Buffers project relations v0.483", () => {
  it("resolves literal imports and imported RPC message references", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-proto-relations-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "api"), { recursive: true });
    await writeFile(join(projectPath, "api", "messages.proto"), [
      'syntax = "proto3";',
      "message HelloRequest {}",
      "message HelloResponse {}",
      ""
    ].join("\n"), "utf8");
    await writeFile(join(projectPath, "api", "service.proto"), [
      'syntax = "proto3";',
      'import "messages.proto";',
      "service Greeter {",
      "  rpc Say(HelloRequest) returns (HelloResponse);",
      "}",
      ""
    ].join("\n"), "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const rpc = snapshot.symbols.find((symbol) => symbol.name === "Say");
    const request = snapshot.symbols.find((symbol) => symbol.name === "HelloRequest");
    const response = snapshot.symbols.find((symbol) => symbol.name === "HelloResponse");

    expect(indexed).toMatchObject({ initialized: true, stale: false });
    expect(store.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v393");
    expect(store.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v197");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", referenceName: "messages.proto", resolution: "exact" }),
      expect.objectContaining({ sourceId: rpc?.id, targetId: request?.id, kind: "references", resolution: "exact", evidence: expect.objectContaining({ ruleId: "module.proto.unique-imported-rpc-request-message-reference" }) }),
      expect.objectContaining({ sourceId: rpc?.id, targetId: response?.id, kind: "references", resolution: "exact", evidence: expect.objectContaining({ ruleId: "module.proto.unique-imported-rpc-response-message-reference" }) })
    ]));
  });

  it("keeps ambiguous imported message names unresolved", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-proto-ambiguous-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "api"), { recursive: true });
    await writeFile(join(projectPath, "api", "a.proto"), "message HelloRequest {}\nmessage HelloResponse {}\n", "utf8");
    await writeFile(join(projectPath, "api", "b.proto"), "message HelloRequest {}\nmessage HelloResponse {}\n", "utf8");
    await writeFile(join(projectPath, "api", "service.proto"), [
      'import "a.proto";',
      'import "b.proto";',
      "service Greeter { rpc Say(HelloRequest) returns (HelloResponse); }",
      ""
    ].join("\n"), "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(
      store.getSnapshot(projectPath).edges.filter((edge) =>
        edge.kind === "references" && edge.evidence?.ruleId?.startsWith("module.proto.unique-imported-rpc-")
      )
    ).toEqual([]);
  });
});

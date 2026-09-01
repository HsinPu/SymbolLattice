import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-zig-v472-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Zig v0.472 project relations", () => {
  it("projects a unique tracked import, qualified call, construction, and signatures", async () => {
    const projectPath = await createProject({
      "src/api.zig": [
        "pub const Model = struct {};",
        "pub fn build(value: i32) i32 { return value; }"
      ].join("\n"),
      "src/app.zig": [
        'const api = @import("api.zig");',
        "const Local = struct {};",
        "pub fn helper(value: Local) Local { return value; }",
        "pub fn caller(value: Local) Local {",
        "  _ = api.build(1);",
        "  return helper(value);",
        "}",
        "pub fn make(value: Local) Local { return Local{ .value = value }; }"
      ].join("\n"),
      "src/local.zig": [
        "const Local = struct {};",
        "pub fn helper(value: Local) Local { return value; }",
        "pub fn caller(value: Local) Local { return helper(value); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const appFile = symbol("src/app.zig");
    const apiFile = symbol("src/api.zig");
    const caller = symbol("src/app.zig.caller");
    const helper = symbol("src/app.zig.helper");
    const local = symbol("src/app.zig.Local");
    const build = symbol("src/api.zig.build");
    const localCaller = symbol("src/local.zig.caller");
    const localHelper = symbol("src/local.zig.helper");
    expect(appFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(caller).toBeDefined();
    expect(helper).toBeDefined();
    expect(local).toBeDefined();
    expect(build).toBeDefined();
    expect(localCaller).toBeDefined();
    expect(localHelper).toBeDefined();
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "imports", sourceId: appFile?.id, targetId: apiFile?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "calls", sourceId: localCaller?.id, targetId: localHelper?.id, referenceName: "helper", resolution: "exact" }),
        expect.objectContaining({ kind: "calls", sourceId: caller?.id, targetId: build?.id, referenceName: "api.build", resolution: "exact" }),
        expect.objectContaining({ kind: "instantiates", sourceId: symbol("src/app.zig.make")?.id, targetId: local?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "accepts", sourceId: helper?.id, targetId: local?.id, resolution: "exact" }),
        expect.objectContaining({ kind: "returns", sourceId: helper?.id, targetId: local?.id, resolution: "exact" })
      ])
    );
  });

  it("keeps duplicate callable names and non-relative imports unresolved", async () => {
    const projectPath = await createProject({
      "src/api.zig": [
        "pub fn build(value: i32) i32 { return value; }",
        "pub fn build(value: u8) u8 { return value; }"
      ].join("\n"),
      "src/app.zig": [
        'const api = @import("api.zig");',
        "pub fn caller() void { _ = api.build(1); }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const exactCalls = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    expect(exactCalls).toEqual([]);
  });
});

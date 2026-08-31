import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-nix-v470-"));
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

describe("Nix v0.470 project relations", () => {
  it("projects literal relative imports, local calls, and imported attribute calls", async () => {
    const projectPath = await createProject({
      "src/api.nix": "{ build = value: value; }\n",
      "src/default.nix": [
        "{",
        "  helper = value: value;",
        "  imported = import ./api.nix;",
        "  local = value: helper value;",
        "  remote = value: imported.build value;",
        "}"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const defaultFile = symbol("src/default.nix");
    const local = symbol("src/default.nix#function:local");
    const remote = symbol("src/default.nix#function:remote");
    const helper = symbol("src/default.nix#function:helper");
    const build = symbol("src/api.nix#function:build");
    expect(defaultFile).toBeDefined();
    expect(local).toBeDefined();
    expect(remote).toBeDefined();
    expect(helper).toBeDefined();
    expect(build).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "imports", sourceId: defaultFile?.id, targetId: symbol("src/api.nix")?.id, resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: local?.id, targetId: helper?.id, referenceName: "helper", resolution: "exact" }),
      expect.objectContaining({ kind: "calls", sourceId: remote?.id, targetId: build?.id, referenceName: "imported.build", resolution: "exact" })
    ]));
  });

  it("keeps duplicate import bindings unresolved", async () => {
    const projectPath = await createProject({
      "src/one.nix": "{ build = value: value; }\n",
      "src/two.nix": "{ build = value: value; }\n",
      "src/default.nix": [
        "{",
        "  imported = import ./one.nix;",
        "  imported = import ./two.nix;",
        "  remote = value: imported.build value;",
        "}"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    expect(store.getSnapshot(projectPath).edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact")).toBe(false);
  });
});

import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const directories: string[] = [];

afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Pascal .pp discovery v0.511", () => {
  it("indexes content-proven Pascal .pp while rejecting Puppet and .inc", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-pascal-pp-v0511-"));
    directories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(
      join(projectPath, "src", "real.pp"),
      "{ fake program Fake; }\nunit RealUnit;\ninterface\nprocedure Helper;\nimplementation\nprocedure Helper; begin end;\nend.\n",
      "utf8"
    );
    await writeFile(join(projectPath, "src", "puppet.pp"), "class webserver { package { 'nginx': ensure => installed } }\n", "utf8");
    await writeFile(join(projectPath, "src", "fragment.inc"), "unit HiddenFragment;\n", "utf8");

    const store = new SqliteGraphStore();
    await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });

    const facts = store.getArtifactFacts(projectPath);
    expect(facts.map((item) => item.filePath)).toEqual(["src/real.pp"]);
    expect(facts[0]?.language).toBe("pascal");
  });
});

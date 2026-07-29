import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "basic-project"
);

async function createFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-service-"));
  temporaryDirectories.push(projectPath);
  await cp(fixturePath, projectPath, { recursive: true });
  return projectPath;
}

function createService(): SymbolLatticeService {
  return new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("SymbolLatticeService", () => {
  it("indexes a TS/JS project, resolves direct graph facts, and detects staleness", async () => {
    const projectPath = await createFixtureProject();
    const service = createService();

    const initialStatus = await service.init({ projectPath });
    expect(initialStatus).toMatchObject({
      initialized: true,
      stale: false,
      counts: { files: 3 }
    });

    const add = await service.find(projectPath, "add");
    const addSymbol = add.symbols.find((symbol) => symbol.name === "add");
    expect(addSymbol).toBeDefined();

    const callers = await service.callers(projectPath, addSymbol?.qualifiedName ?? "missing");
    expect(callers.relations.map((relation) => relation.symbol.name)).toEqual(
      expect.arrayContaining(["calculate", "increment"])
    );
    expect(callers.relations.every((relation) => relation.edge.confidence > 0)).toBe(true);

    const exploration = await service.explore(projectPath, addSymbol?.qualifiedName ?? "missing");
    expect(exploration.source).toMatchObject({ filePath: "src/math.ts" });
    expect(exploration.source?.lines.map((line) => line.text).join("\n")).toContain("function add");

    await writeFile(join(projectPath, "src", "math.ts"), "export const changed = true;", "utf8");
    expect((await service.getStatus(projectPath)).stale).toBe(true);
    expect((await service.sync({ projectPath })).stale).toBe(false);
  });

  it("does not create an index while answering status for a new project", async () => {
    const projectPath = await createFixtureProject();
    const service = createService();

    expect(await service.getStatus(projectPath)).toMatchObject({ initialized: false, stale: false });
  });
});

import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../../../src/cli/main.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "basic-project");

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("strict fresh CLI reads", () => {
  it("blocks a stale live query without publishing a generation", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-cli-"));
    temporaryDirectories.push(projectPath);
    await cp(fixturePath, projectPath, { recursive: true });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"], { from: "node" });
    const store = new SqliteGraphStore();
    const generationBefore = store.getStatus(projectPath).generationId;
    await writeFile(join(projectPath, "src", "math.ts"), "export const newest = 446;\n", "utf8");

    await expect(
      createProgram().parseAsync(["node", "SymbolLattice", "search", "newest", "--project", projectPath, "--json"], { from: "node" })
    ).rejects.toMatchObject({
      code: "FRESH_INDEX_REQUIRED",
      generationId: generationBefore,
      staleReasons: ["source-files-changed"],
      writerState: "disabled"
    });
    expect(store.getStatus(projectPath).generationId).toBe(generationBefore);
    await expect(
      createProgram().parseAsync(["node", "SymbolLattice", "history", projectPath, "--json"], { from: "node" })
    ).resolves.toBeDefined();
    expect(store.getStatus(projectPath).generationId).toBe(generationBefore);
  });
});

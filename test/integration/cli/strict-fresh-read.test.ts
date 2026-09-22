import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../../../src/cli/main.js";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "basic-project");

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("strict fresh CLI reads", () => {
  it("reuses admission only inside the query and still verifies before and after each read", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-cli-receipt-"));
    temporaryDirectories.push(projectPath);
    await cp(fixturePath, projectPath, { recursive: true });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();
    await program.parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"], { from: "node" });
    const verification = vi.spyOn(FileSystemSourceCatalog.prototype, "verifyFreshness");
    const reads = vi.spyOn(SqliteGraphStore.prototype, "getActiveBoundedGraphBundle");
    const generation = new SqliteGraphStore().getStatus(projectPath).generationId;
    for (let i = 0; i < 2; i += 1) {
      await program.parseAsync(["node", "SymbolLattice", "explore", "How does addition work?", "--project", projectPath, "--json"], { from: "node" });
      expect(verification).toHaveBeenCalledTimes((i + 1) * 2);
    }
    expect(reads.mock.calls.every(([, request]) => request.expectedGenerationId === generation)).toBe(true);
    expect(reads).toHaveBeenCalled();
    await program.parseAsync(["node", "SymbolLattice", "status", projectPath, "--json"], { from: "node" });
    expect(verification).toHaveBeenCalledTimes(5);
  });

  it("does not publish a query result when source changes after admission", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-cli-postcheck-"));
    temporaryDirectories.push(projectPath);
    await cp(fixturePath, projectPath, { recursive: true });
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"], { from: "node" });
    output.mockClear();
    const original = SymbolLatticeService.prototype.explore;
    vi.spyOn(SymbolLatticeService.prototype, "explore").mockImplementationOnce(async function (this: SymbolLatticeService, project, query) {
      const result = await original.call(this, project, query);
      await writeFile(join(projectPath, "src", "math.ts"), "export const changedDuringRead = 447;\n", "utf8");
      return result;
    });
    await expect(createProgram().parseAsync(["node", "SymbolLattice", "explore", "How does addition work?", "--project", projectPath, "--json"], { from: "node" }))
      .rejects.toMatchObject({ code: "FRESH_INDEX_REQUIRED", staleReasons: ["source-files-changed"] });
    expect(output).not.toHaveBeenCalled();
  });

  it("retries with a new admission when another writer replaces the generation", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-cli-generation-"));
    temporaryDirectories.push(projectPath);
    await cp(fixturePath, projectPath, { recursive: true });
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"], { from: "node" });
    output.mockClear();
    const store = new SqliteGraphStore();
    const before = store.getStatus(projectPath).generationId;
    const writer = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const original = SymbolLatticeService.prototype.explore;
    const queries = vi.spyOn(SymbolLatticeService.prototype, "explore").mockImplementationOnce(async function (this: SymbolLatticeService, project, query) {
      await writeFile(join(projectPath, "src", "math.ts"), "export const replacementValue = 448;\n", "utf8");
      await writer.sync({ projectPath });
      return original.call(this, project, query);
    });
    await createProgram().parseAsync(["node", "SymbolLattice", "explore", "Find replacement value", "--project", projectPath, "--json"], { from: "node" });
    const current = store.getStatus(projectPath).generationId;
    expect(current).not.toBe(before);
    expect(queries).toHaveBeenCalledTimes(2);
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({ status: { generationId: current, stale: false } });
  });

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

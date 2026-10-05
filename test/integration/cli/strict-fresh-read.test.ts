import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../../../src/cli/main.js";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteAutoSyncOwnerLease, SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "basic-project");

async function fixture(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-cli-sync-"));
  temporaryDirectories.push(projectPath);
  await cp(fixturePath, projectPath, { recursive: true });
  return projectPath;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("strict fresh CLI reads", () => {
  it("offers opt-in synchronization only on live reads, leaving inspection commands read-only", () => {
    const program = createProgram();
    const enabled = program.commands.filter((command) =>
      command.options.some((option) => option.long === "--sync-if-stale")
    ).map((command) => command.name()).sort();
    expect(enabled).toEqual([
      "affected", "callees", "callers", "context", "entrypoints", "explain-edge", "explore",
      "file", "files", "find", "git-hunks", "hierarchy", "impact", "investigate", "node",
      "query", "routes", "search"
    ]);
  });

  it("synchronizes edited source once and returns current evidence with --sync-if-stale", async () => {
    const projectPath = await fixture();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"]);
    const store = new SqliteGraphStore();
    const before = store.getStatus(projectPath).generationId;
    await writeFile(join(projectPath, "src", "math.ts"), "export const optInValue = 449;\n", "utf8");
    const sync = vi.spyOn(SymbolLatticeService.prototype, "syncObserved");
    output.mockClear();

    await createProgram().parseAsync([
      "node", "SymbolLattice", "explore", "optInValue", "--project", projectPath, "--sync-if-stale", "--json"
    ]);
    const current = store.getStatus(projectPath).generationId;
    expect(current).not.toBe(before);
    expect(store.getStatus(projectPath).lastIndexWork?.mode).toBe("incremental");
    expect(sync).toHaveBeenCalledTimes(1);
    const result = JSON.parse(String(output.mock.calls[0]![0]));
    expect(result).toMatchObject({ status: { generationId: current, stale: false } });
    expect(JSON.stringify(result)).toContain("export const optInValue = 449;");

    await createProgram().parseAsync([
      "node", "SymbolLattice", "file", "src/math.ts", "--project", projectPath, "--sync-if-stale", "--json"
    ]);
    expect(JSON.stringify(JSON.parse(String(output.mock.calls[1]![0])))).toContain("export const optInValue = 449;");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(store.getStatus(projectPath).generationId).toBe(current);
    const successor = new SqliteAutoSyncOwnerLease(projectPath).acquire();
    expect(successor.state).toBe("owned");
    if (successor.state === "owned") successor.release();
  });

  it("leaves a fresh index and its evidence unchanged without acquiring a writer", async () => {
    const projectPath = await fixture();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"]);
    const store = new SqliteGraphStore();
    const before = store.getStatus(projectPath).generationId;
    const sync = vi.spyOn(SymbolLatticeService.prototype, "syncObserved");
    output.mockClear();
    for (const extra of [[], ["--sync-if-stale"]]) {
      await createProgram().parseAsync([
        "node", "SymbolLattice", "explore", "How does addition work?", "--project", projectPath, "--json", ...extra
      ]);
    }
    expect(JSON.parse(String(output.mock.calls[1]![0]))).toEqual(JSON.parse(String(output.mock.calls[0]![0])));
    expect(sync).not.toHaveBeenCalled();
    expect(store.getStatus(projectPath).generationId).toBe(before);
    expect(existsSync(join(projectPath, ".SymbolLattice", "auto-sync-owner.sqlite"))).toBe(false);
  });

  it("recovers source, configuration and extractor changes while preserving the stored scope", async () => {
    const projectPath = await fixture();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--scope", "src", "--json"]);
    await writeFile(join(projectPath, "src", "math.ts"), "export const scopedOptInValue = 450;\n", "utf8");
    await writeFile(join(projectPath, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
    await writeFile(join(projectPath, "outside.ts"), "export const excluded = true;\n", "utf8");
    const database = new DatabaseSync(join(projectPath, ".SymbolLattice", "index.sqlite"));
    try {
      database.prepare("UPDATE generations SET extractor_version = ?").run("older-extractor");
    } finally {
      database.close();
    }
    output.mockClear();
    await createProgram().parseAsync(["node", "SymbolLattice", "status", projectPath, "--json"]);
    expect(JSON.parse(String(output.mock.calls[0]![0])).staleReasons).toEqual(expect.arrayContaining([
      "source-files-changed", "project-inputs-changed", "indexer-version-changed"
    ]));
    const before = new SqliteGraphStore().getStatus(projectPath).generationId;
    await createProgram().parseAsync([
      "node", "SymbolLattice", "search", "scopedOptInValue", "--project", projectPath, "--sync-if-stale", "--json"
    ]);
    expect(JSON.parse(String(output.mock.calls[1]![0]))).toMatchObject({
      status: { stale: false, counts: { files: 3 } }, results: [{ filePath: "src/math.ts" }]
    });
    const bundle = new SqliteGraphStore().getActiveStatusBundle(projectPath);
    expect(bundle.status.generationId).not.toBe(before);
    expect(bundle.indexInputs?.scopeRoots).toEqual(["src"]);
  });

  it("does not initialize a missing index or permit an unsafe project with the flag", async () => {
    const projectPath = await fixture();
    const sync = vi.spyOn(SymbolLatticeService.prototype, "syncObserved");
    await expect(createProgram().parseAsync([
      "node", "SymbolLattice", "explore", "addition", "--project", projectPath, "--sync-if-stale", "--json"
    ])).rejects.toMatchObject({ code: "MISSING_INDEX" });
    expect(existsSync(join(projectPath, ".SymbolLattice"))).toBe(false);
    await expect(createProgram().parseAsync([
      "node", "SymbolLattice", "explore", "addition", "--project", homedir(), "--sync-if-stale", "--json"
    ])).rejects.toMatchObject({ code: "INVALID_PROJECT_PATH" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("preserves explicitly configured plugins instead of replacing their facts during recovery", async () => {
    const projectPath = await fixture();
    await writeFile(join(projectPath, "plugin.mjs"), `export default {
      schemaVersion: 1,
      frameworkFactPlugins: [{
        id: "sample/cli-protected", version: "1", languages: ["typescript"], extract: () => null
      }]
    };\n`, "utf8");
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--plugin", "plugin.mjs", "--json"]);
    const store = new SqliteGraphStore();
    const before = store.getActiveStatusBundle(projectPath);
    expect(before.extractorVersion).toContain("+framework-facts-");
    await writeFile(join(projectPath, "src", "math.ts"), "export const pluginOptInValue = 452;\n", "utf8");
    const sync = vi.spyOn(SymbolLatticeService.prototype, "syncObserved");
    output.mockClear();
    await expect(createProgram().parseAsync([
      "node", "SymbolLattice", "search", "pluginOptInValue", "--project", projectPath, "--sync-if-stale", "--json"
    ])).rejects.toMatchObject({ code: "CLI_SYNC_REQUIRES_PLUGINS" });
    expect(sync).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
    expect(store.getActiveStatusBundle(projectPath)).toEqual(before);
    const successor = new SqliteAutoSyncOwnerLease(projectPath).acquire();
    expect(successor.state).toBe("owned");
    if (successor.state === "owned") successor.release();
  });

  it("does not synchronize or return stale evidence while another owner holds its lease", async () => {
    const projectPath = await fixture();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"]);
    const before = new SqliteGraphStore().getStatus(projectPath).generationId;
    await writeFile(join(projectPath, "src", "math.ts"), "export const blockedOptInValue = 451;\n", "utf8");
    const owner = new SqliteAutoSyncOwnerLease(projectPath).acquire();
    expect(owner.state).toBe("owned");
    const sync = vi.spyOn(SymbolLatticeService.prototype, "syncObserved");
    output.mockClear();
    try {
      await expect(createProgram().parseAsync([
        "node", "SymbolLattice", "search", "blockedOptInValue", "--project", projectPath, "--sync-if-stale", "--json"
      ])).rejects.toMatchObject({ code: "FRESH_INDEX_REQUIRED", writerState: "lease-unavailable" });
      expect(sync).not.toHaveBeenCalled();
      expect(output).not.toHaveBeenCalled();
      expect(new SqliteGraphStore().getStatus(projectPath).generationId).toBe(before);
    } finally {
      if (owner.state === "owned") owner.release();
    }
  }, 10_000);

  it("discards both query attempts if source keeps changing despite opt-in synchronization", async () => {
    const projectPath = await fixture();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "SymbolLattice", "init", projectPath, "--json"]);
    const original = SymbolLatticeService.prototype.explore;
    let edits = 0;
    vi.spyOn(SymbolLatticeService.prototype, "explore").mockImplementation(async function (this: SymbolLatticeService, project, query) {
      const result = await original.call(this, project, query);
      await writeFile(join(projectPath, "src", "math.ts"), `export const movingOptInValue = ${++edits};\n`, "utf8");
      return result;
    });
    output.mockClear();
    await expect(createProgram().parseAsync([
      "node", "SymbolLattice", "explore", "addition", "--project", projectPath, "--sync-if-stale", "--json"
    ])).rejects.toMatchObject({ code: "PROJECT_NOT_STABLE" });
    expect(edits).toBe(2);
    expect(output).not.toHaveBeenCalled();
    const successor = new SqliteAutoSyncOwnerLease(projectPath).acquire();
    expect(successor.state).toBe("owned");
    if (successor.state === "owned") successor.release();
  });

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

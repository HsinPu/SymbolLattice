import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { StrictFreshReadCoordinator, SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteAutoSyncOwnerLease, SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "basic-project");
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("strict fresh read integration", () => {
  it("synchronizes a stale repository under its project lease before searching", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-integration-"));
    temporaryDirectories.push(projectPath);
    await cp(fixturePath, projectPath, { recursive: true });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    const initial = await service.init({ projectPath });
    await writeFile(join(projectPath, "src", "math.ts"), "export const newestStrictValue = 446;\n", "utf8");
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: (path) => new SqliteAutoSyncOwnerLease(path).acquire()
    });

    const result = await coordinator.execute(projectPath, async (receipt) => ({
      receipt,
      search: await service.search(projectPath, "newestStrictValue")
    }));

    expect(result.receipt.expectedGenerationId).not.toBe(initial.generationId);
    expect(result.search.status).toMatchObject({
      stale: false,
      generationId: result.receipt.expectedGenerationId
    });
    expect(result.search.results).toEqual([
      expect.objectContaining({ filePath: "src/math.ts" })
    ]);
  });
});

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AUTO_SYNC_OWNER_LEASE_FILE_NAME,
  SqliteAutoSyncOwnerLease
} from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createIndexedProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-auto-sync-owner-"));
  temporaryDirectories.push(projectPath);
  const indexDirectory = join(projectPath, ".SymbolLattice");
  await mkdir(indexDirectory, { recursive: true });
  await writeFile(join(indexDirectory, "index.sqlite"), "placeholder");
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("SQLite auto-sync owner lease", () => {
  it("allows one host, blocks a concurrent contender, and releases for a successor", async () => {
    const projectPath = await createIndexedProject();
    const first = new SqliteAutoSyncOwnerLease(projectPath);
    const contender = new SqliteAutoSyncOwnerLease(projectPath);
    const acquired = first.acquire();

    expect(acquired.state).toBe("owned");
    if (acquired.state !== "owned") {
      throw new Error("Expected the first auto-sync owner lease acquisition to succeed.");
    }
    await expect(access(join(projectPath, ".SymbolLattice", AUTO_SYNC_OWNER_LEASE_FILE_NAME))).resolves.toBeUndefined();

    const unavailable = contender.acquire();
    expect(unavailable).toMatchObject({
      state: "unavailable",
      error: { code: "AUTO_SYNC_OWNER_UNAVAILABLE" }
    });

    acquired.release();

    const successor = contender.acquire();
    expect(successor.state).toBe("owned");
    if (successor.state !== "owned") {
      throw new Error("Expected the successor auto-sync owner lease acquisition to succeed.");
    }
    successor.release();
  });

  it("does not create an owner database when no graph index exists", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-auto-sync-owner-uninitialized-"));
    temporaryDirectories.push(projectPath);
    const lease = new SqliteAutoSyncOwnerLease(projectPath);

    expect(() => lease.acquire()).toThrow('Run "SymbolLattice init');
    await expect(access(join(projectPath, ".SymbolLattice"))).rejects.toThrow();
  });
});

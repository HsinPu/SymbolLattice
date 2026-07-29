import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  MIN_WATCH_INTERVAL_MS,
  SymbolLatticeService,
  startForegroundWatch,
  type WatchReceipt,
  type WatchScheduler
} from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

class ManualScheduler implements WatchScheduler {
  private readonly timers: Array<{ readonly callback: () => void; readonly delayMs: number; active: boolean }> = [];

  public now = (): Date => new Date("2026-07-30T00:00:00.000Z");

  public setTimeout(callback: () => void, delayMs: number): unknown {
    const timer = { callback, delayMs, active: true };
    this.timers.push(timer);
    return timer;
  }

  public clearTimeout(handle: unknown): void {
    (handle as { active: boolean }).active = false;
  }

  public fireNext(): void {
    const timer = this.timers.find((candidate) => candidate.active);
    if (timer === undefined) {
      throw new Error("No active watch timer is scheduled.");
    }
    timer.active = false;
    timer.callback();
  }
}

const temporaryDirectories: string[] = [];
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "basic-project"
);

async function createFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-watch-"));
  temporaryDirectories.push(projectPath);
  await cp(fixturePath, projectPath, { recursive: true });
  return projectPath;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the foreground watch operation.");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("foreground watch integration", () => {
  it("detects a persisted source change and publishes one incremental generation through existing sync", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    const initial = await service.init({ projectPath });
    const scheduler = new ManualScheduler();
    const receipts: WatchReceipt[] = [];
    const session = await startForegroundWatch(
      service,
      {
        projectPath,
        intervalMs: MIN_WATCH_INTERVAL_MS,
        onReceipt: (receipt) => receipts.push(receipt)
      },
      scheduler
    );

    await writeFile(join(projectPath, "src", "math.ts"), "export const changed = true;\n", "utf8");
    scheduler.fireNext();
    await waitFor(() =>
      receipts.some(
        (receipt) => receipt.event === "synced" || receipt.event === "sync-failed" || receipt.event === "status-failed"
      )
    );

    const synced = receipts.find((receipt) => receipt.event === "synced");
    expect(receipts).not.toContainEqual(
      expect.objectContaining({ event: "sync-failed" })
    );
    expect(receipts).not.toContainEqual(
      expect.objectContaining({ event: "status-failed" })
    );
    expect(synced).toMatchObject({
      previousGenerationId: initial.generationId,
      error: null,
      retryDelayMs: null,
      status: {
        stale: false,
        lastIndexWork: {
          mode: "incremental",
          modifiedFiles: ["src/math.ts"]
        }
      }
    });
    expect(synced?.generationId).not.toBe(initial.generationId);

    await session.stop();
    expect(receipts.at(-1)?.event).toBe("stopped");
  });
});

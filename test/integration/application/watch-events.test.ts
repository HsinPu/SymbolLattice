import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_WATCH_INTERVAL_MS,
  SymbolLatticeService,
  startForegroundWatch,
  type WatchReceipt
} from "../../../src/application/index.js";
import {
  FileSystemSourceCatalog,
  NodeFileSystemWatchSource
} from "../../../src/infrastructure/filesystem/index.js";
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
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-watch-events-"));
  temporaryDirectories.push(projectPath);
  await cp(fixturePath, projectPath, { recursive: true });
  return projectPath;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for a native watch event.");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("native foreground watch integration", () => {
  it("uses a native event to publish an incremental generation when supported, otherwise falls back visibly", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    const initial = await service.init({ projectPath });
    const receipts: WatchReceipt[] = [];
    const session = await startForegroundWatch(service, {
      projectPath,
      // The native event must be responsible for the refresh inside this test;
      // ordinary polling cannot fire during its short deadline.
      intervalMs: MAX_WATCH_INTERVAL_MS,
      eventSource: new NodeFileSystemWatchSource(),
      onReceipt: (receipt) => receipts.push(receipt)
    });

    try {
      const setupFailure = receipts.find((receipt) => receipt.event === "event-watch-failed");
      if (setupFailure !== undefined) {
        expect(setupFailure).toMatchObject({
          error: { code: "WATCH_EVENTS_UNAVAILABLE" },
          retryDelayMs: null
        });
        return;
      }

      expect(receipts.map((receipt) => receipt.event)).toEqual([
        "started",
        "event-watch-active"
      ]);
      await writeFile(join(projectPath, "src", "math.ts"), "export const changed = true;\n", "utf8");
      await waitFor(() =>
        receipts.some(
          (receipt) => receipt.event === "synced" || receipt.event === "event-watch-failed"
        )
      );

      const runtimeFailure = receipts.find((receipt) => receipt.event === "event-watch-failed");
      if (runtimeFailure !== undefined) {
        expect(runtimeFailure).toMatchObject({
          error: { code: "WATCH_EVENTS_FAILED" },
          retryDelayMs: null
        });
        return;
      }

      const synced = receipts.find((receipt) => receipt.event === "synced");
      const pending = receipts.find((receipt) => receipt.event === "event-pending");
      expect(pending).toMatchObject({
        pendingFileCount: 1,
        pendingFiles: ["src/math.ts"],
        pendingFilesTruncated: false,
        pendingFilesUnknown: false
      });
      expect(synced).toMatchObject({
        previousGenerationId: initial.generationId,
        error: null,
        retryDelayMs: null,
        pendingFileCount: 0,
        pendingFiles: [],
        pendingFilesTruncated: false,
        pendingFilesUnknown: false,
        status: {
          stale: false,
          lastIndexWork: {
            mode: "incremental",
            modifiedFiles: ["src/math.ts"]
          }
        }
      });
      expect(synced?.generationId).not.toBe(initial.generationId);
    } finally {
      await session.stop();
    }

    expect(receipts.at(-1)?.event).toBe("stopped");
  }, 10_000);
});

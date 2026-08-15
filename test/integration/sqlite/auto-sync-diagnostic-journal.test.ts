import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
  type AutoSyncDiagnosticEvent
} from "../../../src/application/index.js";
import {
  AUTO_SYNC_DIAGNOSTIC_JOURNAL_FILE_NAME,
  SqliteAutoSyncDiagnosticJournal
} from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createIndexedProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-auto-sync-journal-"));
  temporaryDirectories.push(projectPath);
  const indexDirectory = join(projectPath, ".SymbolLattice");
  await mkdir(indexDirectory, { recursive: true });
  await writeFile(join(indexDirectory, "index.sqlite"), "placeholder");
  return projectPath;
}

function event(sequence: number): AutoSyncDiagnosticEvent {
  return {
    hostId: "host:journal-test",
    sequence,
    event: sequence % 2 === 0 ? "synced" : "event-pending",
    observedAt: `2026-07-31T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    state: sequence % 2 === 0 ? "fresh" : "pending",
    watcherMode: "native-events",
    generationId: `generation:${sequence}`,
    error: null,
    retryDelayMs: null,
    pendingFileCount: sequence % 2 === 0 ? 0 : 1,
    pendingFiles: sequence % 2 === 0 ? [] : ["src/changed.ts"],
    pendingFilesTruncated: false,
    pendingFilesUnknown: false
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("SQLite auto-sync diagnostic journal", () => {
  it("persists sanitized watcher transitions for a later read-only host", async () => {
    const projectPath = await createIndexedProject();
    const writer = new SqliteAutoSyncDiagnosticJournal(projectPath);

    writer.append(event(1));
    writer.append(event(2));

    const reader = new SqliteAutoSyncDiagnosticJournal(projectPath, { writable: false });
    const result = reader.diagnostics({ limit: 1 });

    expect(result).toMatchObject({
      state: "read-only",
      capacity: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
      retained: 2,
      returned: 1,
      dropped: 0,
      truncated: true,
      lastPersistedAt: "2026-07-31T00:00:02.000Z",
      events: [{ hostId: "host:journal-test", sequence: 2, event: "synced", pendingFiles: [] }]
    });
    expect(result.error).toBeNull();
  });

  it("retains only the configured durable bound and reports evicted events", async () => {
    const projectPath = await createIndexedProject();
    const journal = new SqliteAutoSyncDiagnosticJournal(projectPath);

    for (let sequence = 1; sequence <= MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS + 2; sequence += 1) {
      journal.append(event(sequence));
    }

    const result = journal.diagnostics({ limit: 2 });
    expect(result).toMatchObject({
      state: "active",
      retained: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS,
      returned: 2,
      dropped: 2,
      truncated: true,
      events: [
        { sequence: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS + 1 },
        { sequence: MAX_AUTO_SYNC_DIAGNOSTIC_JOURNAL_EVENTS + 2 }
      ]
    });
  }, 120_000);

  it("does not create a diagnostic directory for an uninitialized project", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-auto-sync-uninitialized-"));
    temporaryDirectories.push(projectPath);
    const journal = new SqliteAutoSyncDiagnosticJournal(projectPath);

    journal.append(event(1));

    expect(journal.diagnostics()).toMatchObject({
      state: "unavailable",
      retained: 0,
      returned: 0,
      events: []
    });
    await expect(
      import("node:fs/promises").then(({ access }) => access(join(projectPath, ".SymbolLattice")))
    ).rejects.toThrow();
  });

  it("reports malformed durable data without exposing partial events", async () => {
    const projectPath = await createIndexedProject();
    await writeFile(
      join(projectPath, ".SymbolLattice", AUTO_SYNC_DIAGNOSTIC_JOURNAL_FILE_NAME),
      "not a SQLite database"
    );
    const journal = new SqliteAutoSyncDiagnosticJournal(projectPath, { writable: false });

    expect(journal.diagnostics()).toMatchObject({
      state: "failed",
      retained: 0,
      returned: 0,
      error: { code: "AUTO_SYNC_JOURNAL_FAILED" },
      events: []
    });
  });
});

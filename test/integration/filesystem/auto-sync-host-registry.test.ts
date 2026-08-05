import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AUTO_SYNC_HOST_DIRECTORY_NAME,
  FileSystemAutoSyncHostRegistry
} from "../../../src/infrastructure/filesystem/index.js";

const HOST_ID = "123e4567-e89b-42d3-a456-426614174000";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    removeTemporaryDirectory(directory);
  }
});

function project(): string {
  const directory = mkdtempSync(join(tmpdir(), "symbol-lattice-host-registry-"));
  temporaryDirectories.push(directory);
  return directory;
}

function removeTemporaryDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

function record(pid = 4312) {
  return {
    schemaVersion: 1 as const,
    hostId: HOST_ID,
    kind: "mcp-auto-sync" as const,
    pid,
    version: "0.268.0",
    startedAt: "2026-08-05T01:02:03.000Z"
  };
}

describe("project-local auto-sync host registry", () => {
  it("registers a bounded private record, reports a live PID, and unregisters its own record", () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(
      root,
      () => undefined,
      () => new Date("2026-08-05T02:00:00.000Z")
    );

    const registration = registry.register(record());
    expect(registration.state).toBe("registered");
    expect(registry.inspect()).toMatchObject({
      state: "available",
      retained: 1,
      returned: 1,
      hosts: [{ hostId: HOST_ID, liveness: "live", probeError: null }]
    });

    if (registration.state === "registered") registration.unregister();
    expect(registry.inspect()).toMatchObject({ state: "available", retained: 0, hosts: [] });
  });

  it("classifies ESRCH as stale, EPERM as live, and other probe errors as unverifiable", () => {
    const outcomes = ["ESRCH", "EPERM", "EACCES"];
    for (const [index, code] of outcomes.entries()) {
      const root = project();
      const registry = new FileSystemAutoSyncHostRegistry(root, () => {
        throw Object.assign(new Error(`probe ${code}`), { code });
      });
      registry.register({ ...record(5000 + index), hostId: `123e4567-e89b-42d3-a456-42661417400${index}` });
      const host = registry.inspect().hosts[0];
      expect(host?.liveness).toBe(code === "ESRCH" ? "stale" : code === "EPERM" ? "live" : "unverifiable");
      expect(host?.probeError === null).toBe(code !== "EACCES");
    }
  });

  it("ignores malformed records without deleting them during read-only inspection", () => {
    const root = project();
    const directory = join(root, ".symbol-lattice", AUTO_SYNC_HOST_DIRECTORY_NAME);
    mkdirSync(directory, { recursive: true });
    const malformed = join(directory, "malformed.json");
    writeFileSync(malformed, "{not-json}\n", "utf8");

    const result = new FileSystemAutoSyncHostRegistry(root).inspect();

    expect(result).toMatchObject({ state: "available", retained: 1, returned: 0 });
    expect(readFileSync(malformed, "utf8")).toBe("{not-json}\n");
  });

  it("does not parse or delete a record that exceeds the fixed read bound", () => {
    const root = project();
    const directory = join(root, ".symbol-lattice", AUTO_SYNC_HOST_DIRECTORY_NAME);
    mkdirSync(directory, { recursive: true });
    const oversized = join(directory, `${HOST_ID}.json`);
    writeFileSync(oversized, "x".repeat(16 * 1024 + 1), "utf8");

    const result = new FileSystemAutoSyncHostRegistry(root).inspect();

    expect(result).toMatchObject({ state: "available", retained: 1, returned: 0 });
    expect(readFileSync(oversized, "utf8")).toHaveLength(16 * 1024 + 1);
  });
});

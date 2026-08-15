import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AutoSyncHostObservation,
  AutoSyncHostRegistry,
  AutoSyncHostRegistryResult
} from "../../../src/application/index.js";
import {
  FileSystemAutoSyncStartControl,
  type DetachedWatchLauncher
} from "../../../src/infrastructure/filesystem/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function fixture(): { projectPath: string; entryPath: string } {
  const projectPath = mkdtempSync(join(tmpdir(), "SymbolLattice-watch-start-"));
  temporaryDirectories.push(projectPath);
  mkdirSync(join(projectPath, ".SymbolLattice"));
  const entryPath = join(projectPath, "main.mjs");
  writeFileSync(entryPath, "export {};\n", "utf8");
  return { projectPath, entryPath };
}

function result(hosts: readonly AutoSyncHostObservation[]): AutoSyncHostRegistryResult {
  return {
    state: hosts.length === 0 ? "unavailable" : "available",
    capacity: 128,
    retained: hosts.length,
    returned: hosts.length,
    truncated: false,
    error: null,
    hosts
  };
}

function registry(observations: AutoSyncHostObservation[]): AutoSyncHostRegistry {
  return {
    register: vi.fn(() => ({ state: "failed", error: { code: "UNUSED", message: "unused" } })),
    inspect: vi.fn(() => result(observations))
  };
}

describe("FileSystemAutoSyncStartControl", () => {
  it("previews an exact shell-free launch without starting a process", async () => {
    const { projectPath, entryPath } = fixture();
    const launch = vi.fn(() => ({ pid: 9001 }));
    const control = new FileSystemAutoSyncStartControl(
      projectPath,
      registry([]),
      {
        version: "0.270.0",
        executablePath: process.execPath,
        entryPath,
        launch: { intervalMs: 750, force: true, poll: true }
      },
      { launch }
    );

    const preview = await control.preview();

    expect(preview).toMatchObject({
      mode: "preview",
      status: "ready",
      mutation: { performed: false },
      command: {
        executable: resolve(process.execPath),
        workingDirectory: resolve(projectPath),
        pluginModulePaths: []
      }
    });
    expect(preview.command.arguments).toEqual([
      resolve(entryPath),
      "watch",
      resolve(projectPath),
      "--interval",
      "750",
      "--json",
      "--force",
      "--poll"
    ]);
    expect(preview.command.integrity).toEqual({
      entrySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      pluginModules: []
    });
    expect(preview.approval).toMatch(/^watch-start:[a-f0-9]{64}$/);
    expect(launch).not.toHaveBeenCalled();
  });

  it("launches only after exact approval and verifies the registered host identity", async () => {
    const { projectPath, entryPath } = fixture();
    const observations: AutoSyncHostObservation[] = [];
    const launch = vi.fn((request: Parameters<DetachedWatchLauncher["launch"]>[0]) => {
      observations.push({
        schemaVersion: 1,
        hostId: request.hostId,
        kind: "foreground-watch",
        pid: 9001,
        version: "0.270.0",
        startedAt: "2026-08-05T00:00:00.000Z",
        liveness: "live",
        observedAt: "2026-08-05T00:00:01.000Z",
        probeError: null
      });
      return { pid: 9001 };
    });
    const control = new FileSystemAutoSyncStartControl(
      projectPath,
      registry(observations),
      {
        version: "0.270.0",
        executablePath: process.execPath,
        entryPath,
        launch: { intervalMs: 500 },
        hostIdFactory: () => "123e4567-e89b-42d3-a456-426614174000"
      },
      { launch }
    );
    const preview = await control.preview();

    const applied = await control.execute({ apply: true, yes: true, approval: preview.approval! });

    expect(applied).toMatchObject({
      mode: "apply",
      status: "started",
      hostId: "123e4567-e89b-42d3-a456-426614174000",
      pid: 9001,
      mutation: { performed: true, operation: "detached-watch-launch" },
      error: null,
      host: { hostId: "123e4567-e89b-42d3-a456-426614174000", liveness: "live" }
    });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("invalidates approval when a trusted plugin file changes after preview", async () => {
    const { projectPath, entryPath } = fixture();
    const pluginPath = join(projectPath, "plugin.mjs");
    writeFileSync(pluginPath, "export default { schemaVersion: 1 };\n", "utf8");
    const launch = vi.fn(() => ({ pid: 9001 }));
    const control = new FileSystemAutoSyncStartControl(
      projectPath,
      registry([]),
      {
        version: "0.270.0",
        executablePath: process.execPath,
        entryPath,
        launch: { intervalMs: 500, pluginModulePaths: [pluginPath] }
      },
      { launch }
    );
    const preview = await control.preview();
    writeFileSync(pluginPath, "export default { schemaVersion: 1, changed: true };\n", "utf8");

    await expect(control.execute({ apply: true, yes: true, approval: preview.approval! }))
      .rejects.toMatchObject({ code: "START_APPROVAL_INVALID" });
    expect(launch).not.toHaveBeenCalled();
  });

  it("rejects stale approval and refuses to launch beside a live writer host", async () => {
    const { projectPath, entryPath } = fixture();
    const observations: AutoSyncHostObservation[] = [{
      schemaVersion: 1,
      hostId: "123e4567-e89b-42d3-a456-426614174001",
      kind: "mcp-auto-sync",
      pid: 10,
      version: "0.270.0",
      startedAt: "2026-08-05T00:00:00.000Z",
      liveness: "live",
      observedAt: "2026-08-05T00:00:01.000Z",
      probeError: null
    }];
    const launch = vi.fn(() => ({ pid: 9001 }));
    const control = new FileSystemAutoSyncStartControl(
      projectPath,
      registry(observations),
      {
        version: "0.270.0",
        executablePath: process.execPath,
        entryPath,
        launch: { intervalMs: 500 }
      },
      { launch }
    );

    await expect(control.execute({ apply: true, yes: true, approval: "watch-start:stale" }))
      .rejects.toMatchObject({ code: "START_TARGET_NOT_READY" });
    expect((await control.preview()).status).toBe("host-already-live");
    expect(launch).not.toHaveBeenCalled();
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AutoSyncHostObservation,
  AutoSyncHostRegistry,
  AutoSyncHostRegistryResult,
  AutoSyncStartCommand,
  AutoSyncStartControl,
  AutoSyncStartExecutionResult,
  AutoSyncStartPlan,
  AutoSyncStopControl,
  AutoSyncStopExecutionResult,
  AutoSyncStopPlan
} from "../../../src/application/index.js";
import { FileSystemAutoSyncRestartControl } from "../../../src/infrastructure/filesystem/index.js";

const HOST_ID = "123e4567-e89b-42d3-a456-426614174000";
const REPLACEMENT_ID = "123e4567-e89b-42d3-a456-426614174001";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function project(): string {
  const directory = mkdtempSync(join(tmpdir(), "SymbolLattice-restart-control-"));
  temporaryDirectories.push(directory);
  return directory;
}

function host(
  overrides: Partial<AutoSyncHostObservation> = {}
): AutoSyncHostObservation {
  return {
    schemaVersion: 1,
    hostId: HOST_ID,
    kind: "foreground-watch",
    pid: 4312,
    version: "0.271.0",
    startedAt: "2026-08-05T11:00:00.000Z",
    liveness: "live",
    observedAt: "2026-08-05T11:00:01.000Z",
    probeError: null,
    ...overrides
  };
}

function registryResult(
  hosts: readonly AutoSyncHostObservation[],
  overrides: Partial<AutoSyncHostRegistryResult> = {}
): AutoSyncHostRegistryResult {
  return {
    state: "available",
    capacity: 128,
    retained: hosts.length,
    returned: hosts.length,
    truncated: false,
    error: null,
    hosts,
    ...overrides
  };
}

function registry(
  inspect: () => AutoSyncHostRegistryResult
): AutoSyncHostRegistry {
  return {
    register: vi.fn(() => ({ state: "failed", error: { code: "UNUSED", message: "unused" } })),
    inspect: vi.fn(inspect)
  };
}

function command(suffix = "a"): AutoSyncStartCommand {
  return {
    executable: "C:/node/node.exe",
    arguments: ["C:/SymbolLattice/main.js", "watch", "C:/project", "--json"],
    workingDirectory: "C:/project",
    logPath: "C:/project/.SymbolLattice/auto-sync-host.log",
    pluginModulePaths: ["C:/project/plugin.mjs"],
    integrity: {
      entrySha256: suffix.repeat(64),
      pluginModules: [{ path: "C:/project/plugin.mjs", sha256: suffix.repeat(64) }]
    }
  };
}

function startPlan(startCommand = command()): AutoSyncStartPlan {
  return {
    schemaVersion: 1,
    mode: "preview",
    action: "start-auto-sync-host",
    status: "ready",
    projectPath: "C:/project",
    command: startCommand,
    conflictingHosts: [],
    approval: "watch-start:approved",
    mutation: { performed: false },
    notes: []
  };
}

function started(startCommand = command()): AutoSyncStartExecutionResult {
  return {
    schemaVersion: 1,
    mode: "apply",
    action: "start-auto-sync-host",
    status: "started",
    projectPath: "C:/project",
    command: startCommand,
    approval: "watch-start:approved",
    hostId: REPLACEMENT_ID,
    pid: 4313,
    host: host({ hostId: REPLACEMENT_ID, pid: 4313 }),
    completedAt: "2026-08-05T11:00:03.000Z",
    mutation: { performed: true, operation: "detached-watch-launch" },
    error: null
  };
}

function stopped(): AutoSyncStopExecutionResult {
  return {
    schemaVersion: 1,
    mode: "apply",
    action: "stop-auto-sync-host",
    status: "stopped",
    projectPath: "C:/project",
    target: host(),
    approval: "watch-stop:approved",
    request: {
      requestedAt: "2026-08-05T11:00:01.000Z",
      expiresAt: "2026-08-05T11:00:11.000Z"
    },
    completedAt: "2026-08-05T11:00:02.000Z",
    mutation: { performed: true, operation: "cooperative-stop-request" },
    error: null
  };
}

function stopPlan(): AutoSyncStopPlan {
  return {
    schemaVersion: 1,
    mode: "preview",
    action: "stop-auto-sync-host",
    status: "ready",
    projectPath: "C:/project",
    requestedHostId: HOST_ID,
    target: host(),
    approval: "watch-stop:approved",
    mutation: { performed: false },
    notes: []
  };
}

function controls(options: {
  describe?: () => Promise<AutoSyncStartCommand>;
  preview?: () => Promise<AutoSyncStartPlan>;
  start?: () => Promise<AutoSyncStartExecutionResult>;
  stop?: () => Promise<AutoSyncStopExecutionResult>;
} = {}): {
  start: AutoSyncStartControl;
  stop: AutoSyncStopControl;
  describe: ReturnType<typeof vi.fn>;
  startExecute: ReturnType<typeof vi.fn>;
  stopExecute: ReturnType<typeof vi.fn>;
} {
  const describe = vi.fn(options.describe ?? (async () => command()));
  const startExecute = vi.fn(options.start ?? (async () => started()));
  const stopExecute = vi.fn(options.stop ?? (async () => stopped()));
  return {
    start: {
      describeCommand: describe,
      preview: vi.fn(options.preview ?? (async () => startPlan())),
      execute: startExecute
    },
    stop: {
      preview: vi.fn(() => stopPlan()),
      execute: stopExecute,
      monitor: vi.fn()
    },
    describe,
    startExecute,
    stopExecute
  };
}

describe("FileSystemAutoSyncRestartControl", () => {
  it("previews one approval bound to the exact live host and replacement command", async () => {
    const root = project();
    const target = host();
    const collaborators = controls();
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([target])),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );

    const preview = await control.preview(HOST_ID);

    expect(preview).toMatchObject({
      schemaVersion: 1,
      mode: "preview",
      action: "restart-auto-sync-host",
      status: "ready",
      requestedHostId: HOST_ID,
      target: { hostId: HOST_ID, pid: 4312 },
      command: command(),
      conflictingHosts: [],
      mutation: { performed: false }
    });
    expect(preview.approval).toMatch(/^watch-restart:[a-f0-9]{64}$/);
    expect(collaborators.stopExecute).not.toHaveBeenCalled();
    expect(collaborators.startExecute).not.toHaveBeenCalled();
  });

  it.each([
    ["host-not-found", []],
    ["host-not-live", [host({ liveness: "stale" })]],
    ["host-unverifiable", [host({ liveness: "unverifiable" })]],
    ["incompatible-host-version", [host({ version: "0.270.0" })]],
    ["unsupported-host-kind", [host({ kind: "mcp-auto-sync" })]]
  ] as const)("fails closed with %s", async (status, hosts) => {
    const root = project();
    const collaborators = controls();
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(hosts)),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );

    await expect(control.preview(HOST_ID)).resolves.toMatchObject({ status, approval: null });
  });

  it("rejects incomplete registry evidence and another non-stale host", async () => {
    const root = project();
    const collaborators = controls();
    const second = host({ hostId: REPLACEMENT_ID, pid: 5000 });
    const incomplete = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host()], { retained: 2, returned: 1 })),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const conflict = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host(), second])),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );

    await expect(incomplete.preview(HOST_ID)).resolves.toMatchObject({
      status: "registry-incomplete",
      approval: null
    });
    await expect(conflict.preview(HOST_ID)).resolves.toMatchObject({
      status: "conflicting-host",
      approval: null,
      conflictingHosts: [{ hostId: REPLACEMENT_ID }]
    });
  });

  it("rejects failed, truncated, and unverifiable competing registry evidence", async () => {
    const root = project();
    const collaborators = controls();
    const failed = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([], {
        state: "failed",
        error: { code: "EACCES", message: "denied" }
      })),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const truncated = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host()], { retained: 129, returned: 1, truncated: true })),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const unknownConflict = host({
      hostId: REPLACEMENT_ID,
      pid: 5000,
      liveness: "unverifiable"
    });
    const conflicting = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host(), unknownConflict])),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );

    await expect(failed.preview(HOST_ID)).resolves.toMatchObject({ status: "registry-failed" });
    await expect(truncated.preview(HOST_ID)).resolves.toMatchObject({ status: "registry-incomplete" });
    await expect(conflicting.preview(HOST_ID)).resolves.toMatchObject({
      status: "conflicting-host-unverifiable"
    });
  });

  it("requires apply, yes, and the exact current restart approval", async () => {
    const root = project();
    const collaborators = controls();
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host()])),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const preview = await control.preview(HOST_ID);

    await expect(control.execute(HOST_ID)).resolves.toMatchObject({ mode: "preview" });
    await expect(control.execute(HOST_ID, {
      apply: true,
      approval: preview.approval ?? undefined
    })).rejects.toMatchObject({ code: "RESTART_CONFIRMATION_REQUIRED" });
    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: "watch-restart:wrong"
    })).rejects.toMatchObject({ code: "RESTART_APPROVAL_INVALID" });
    expect(collaborators.stopExecute).not.toHaveBeenCalled();
  });

  it("cooperatively stops first, proves absence, then starts and attributes both mutations", async () => {
    const root = project();
    const observations = [host()];
    const order: string[] = [];
    const collaborators = controls({
      stop: async () => {
        order.push("stop");
        observations.splice(0);
        return stopped();
      },
      preview: async () => {
        order.push("start-preview");
        return startPlan();
      },
      start: async () => {
        order.push("start");
        return started();
      }
    });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0", now: () => new Date("2026-08-05T11:00:04.000Z") }
    );
    const preview = await control.preview(HOST_ID);

    const result = await control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: preview.approval ?? undefined
    });

    expect(order).toEqual(["stop", "start-preview", "start"]);
    expect(result).toMatchObject({
      mode: "apply",
      action: "restart-auto-sync-host",
      status: "restarted",
      stop: { status: "stopped" },
      start: { status: "started", hostId: REPLACEMENT_ID },
      mutation: {
        performed: true,
        operations: ["cooperative-stop-request", "detached-watch-launch"],
        startAttempted: true
      },
      error: null
    });
  });

  it("invalidates approval when the host identity or executable inputs change", async () => {
    const root = project();
    const observations = [host()];
    let replacementCommand = command();
    const collaborators = controls({ describe: async () => replacementCommand });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const first = await control.preview(HOST_ID);
    observations[0] = host({ startedAt: "2026-08-05T11:01:00.000Z" });

    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: first.approval ?? undefined
    })).rejects.toMatchObject({ code: "RESTART_APPROVAL_INVALID" });
    expect(collaborators.stopExecute).not.toHaveBeenCalled();

    observations[0] = host();
    const second = await control.preview(HOST_ID);
    replacementCommand = command("b");
    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: second.approval ?? undefined
    })).rejects.toMatchObject({ code: "RESTART_APPROVAL_INVALID" });
    expect(collaborators.stopExecute).not.toHaveBeenCalled();
  });

  it("never starts when cooperative stop times out", async () => {
    const root = project();
    const timedOut = { ...stopped(), status: "request-timeout" as const, error: {
      code: "STOP_REQUEST_TIMEOUT",
      message: "timed out"
    } };
    const collaborators = controls({ stop: async () => timedOut });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult([host()])),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const preview = await control.preview(HOST_ID);

    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: preview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "stop-timeout",
      start: null,
      mutation: {
        operations: ["cooperative-stop-request"],
        startAttempted: false
      },
      error: { code: "STOP_REQUEST_TIMEOUT" }
    });
    expect(collaborators.startExecute).not.toHaveBeenCalled();
  });

  it("returns a partial-failure receipt when a competing host appears after stop", async () => {
    const root = project();
    const observations = [host()];
    const competitor = host({ hostId: REPLACEMENT_ID, pid: 5000 });
    const collaborators = controls({
      stop: async () => {
        observations.splice(0, observations.length, competitor);
        return stopped();
      },
      preview: async () => ({
        ...startPlan(),
        status: "host-already-live",
        conflictingHosts: [competitor],
        approval: null
      })
    });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const preview = await control.preview(HOST_ID);

    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: preview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "start-not-ready",
      stop: { status: "stopped" },
      start: null,
      mutation: {
        operations: ["cooperative-stop-request"],
        startAttempted: false
      },
      error: { code: "RESTART_START_NOT_READY" }
    });
  });

  it("rechecks registry completeness after stop before asking the start control to launch", async () => {
    const root = project();
    let phase: "before" | "after" = "before";
    const collaborators = controls({
      stop: async () => {
        phase = "after";
        return stopped();
      }
    });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() =>
        phase === "before"
          ? registryResult([host()])
          : registryResult([], { retained: 1, returned: 0 })
      ),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const preview = await control.preview(HOST_ID);

    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: preview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "start-not-ready",
      start: null,
      mutation: { startAttempted: false },
      error: {
        code: "RESTART_START_NOT_READY",
        message: expect.stringContaining("registry-incomplete")
      }
    });
    expect(collaborators.startExecute).not.toHaveBeenCalled();
  });

  it("does not launch when executable inputs change after the old host stops", async () => {
    const root = project();
    const observations = [host()];
    const collaborators = controls({
      stop: async () => {
        observations.splice(0);
        return stopped();
      },
      preview: async () => startPlan(command("b"))
    });
    const control = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      collaborators.stop,
      collaborators.start,
      { version: "0.271.0" }
    );
    const preview = await control.preview(HOST_ID);

    await expect(control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: preview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "start-plan-changed",
      start: null,
      mutation: { startAttempted: false },
      error: { code: "RESTART_START_PLAN_CHANGED" }
    });
    expect(collaborators.startExecute).not.toHaveBeenCalled();
  });

  it("preserves registration timeout and thrown launch failures as attributed receipts", async () => {
    const root = project();
    const observations = [host()];
    const timedOutStart = {
      ...started(),
      status: "registration-timeout" as const,
      host: null,
      error: { code: "START_REGISTRATION_TIMEOUT", message: "timed out" }
    };
    const timeoutCollaborators = controls({
      stop: async () => {
        observations.splice(0);
        return stopped();
      },
      start: async () => timedOutStart
    });
    const timeoutControl = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      timeoutCollaborators.stop,
      timeoutCollaborators.start,
      { version: "0.271.0" }
    );
    const timeoutPreview = await timeoutControl.preview(HOST_ID);
    await expect(timeoutControl.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: timeoutPreview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "registration-timeout",
      start: { status: "registration-timeout" },
      mutation: {
        operations: ["cooperative-stop-request", "detached-watch-launch"],
        startAttempted: true
      },
      error: { code: "START_REGISTRATION_TIMEOUT" }
    });

    observations.push(host());
    const failingCollaborators = controls({
      stop: async () => {
        observations.splice(0);
        return stopped();
      },
      start: async () => {
        throw new Error("spawn denied");
      }
    });
    const failingControl = new FileSystemAutoSyncRestartControl(
      root,
      registry(() => registryResult(observations)),
      failingCollaborators.stop,
      failingCollaborators.start,
      { version: "0.271.0" }
    );
    const failingPreview = await failingControl.preview(HOST_ID);
    await expect(failingControl.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: failingPreview.approval ?? undefined
    })).resolves.toMatchObject({
      status: "start-failed",
      start: null,
      mutation: {
        operations: ["cooperative-stop-request"],
        startAttempted: true
      },
      error: { code: "RESTART_START_FAILED", message: "spawn denied" }
    });
  });
});

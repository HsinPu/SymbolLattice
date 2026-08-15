import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SymbolLatticeError, type AutoSyncHostRecord } from "../../../src/application/index.js";
import {
  FileSystemAutoSyncHostRegistry,
  FileSystemAutoSyncStopControl
} from "../../../src/infrastructure/filesystem/index.js";

const HOST_ID = "123e4567-e89b-42d3-a456-426614174000";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function project(): string {
  const directory = mkdtempSync(join(tmpdir(), "SymbolLattice-stop-control-"));
  temporaryDirectories.push(directory);
  return directory;
}

function hostRecord(version = "0.269.0"): AutoSyncHostRecord {
  return {
    schemaVersion: 1,
    hostId: HOST_ID,
    kind: "foreground-watch",
    pid: 4312,
    version,
    startedAt: "2026-08-05T03:00:00.000Z"
  };
}

describe("cooperative auto-sync stop control", () => {
  it("creates a read-only approval preview bound to one live host record", () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    registry.register(hostRecord());
    const control = new FileSystemAutoSyncStopControl(root, registry, { version: "0.269.0" });

    const plan = control.preview(HOST_ID);

    expect(plan).toMatchObject({
      mode: "preview",
      status: "ready",
      requestedHostId: HOST_ID,
      target: { hostId: HOST_ID, liveness: "live" },
      mutation: { performed: false }
    });
    expect(plan.approval).toMatch(/^watch-stop:[0-9a-f]{64}$/);
    expect(existsSync(join(root, ".SymbolLattice", "auto-sync-stop-requests"))).toBe(false);
  });

  it("fails closed for a missing, stale, unverifiable, or incompatible host", () => {
    const root = project();
    const missingRegistry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    const missing = new FileSystemAutoSyncStopControl(root, missingRegistry, { version: "0.269.0" });
    expect(missing.preview(HOST_ID).status).toBe("host-not-found");

    const staleRegistry = new FileSystemAutoSyncHostRegistry(root, () => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    staleRegistry.register(hostRecord());
    expect(new FileSystemAutoSyncStopControl(root, staleRegistry, { version: "0.269.0" }).preview(HOST_ID).status).toBe("host-not-live");

    const unknownRegistry = new FileSystemAutoSyncHostRegistry(root, () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    });
    expect(new FileSystemAutoSyncStopControl(root, unknownRegistry, { version: "0.269.0" }).preview(HOST_ID).status).toBe("host-unverifiable");

    const liveRegistry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    expect(new FileSystemAutoSyncStopControl(root, liveRegistry, { version: "0.270.0" }).preview(HOST_ID).status).toBe("incompatible-host-version");
  });

  it("requires apply, yes, and the exact current approval before writing a request", async () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    registry.register(hostRecord());
    const control = new FileSystemAutoSyncStopControl(root, registry, { version: "0.269.0" });
    const approval = control.preview(HOST_ID).approval;

    await expect(control.execute(HOST_ID)).resolves.toMatchObject({ mode: "preview" });
    await expect(control.execute(HOST_ID, { apply: true, approval: approval ?? undefined })).rejects.toMatchObject({ code: "STOP_CONFIRMATION_REQUIRED" });
    await expect(control.execute(HOST_ID, { apply: true, yes: true, approval: "watch-stop:wrong" })).rejects.toMatchObject({ code: "STOP_APPROVAL_INVALID" });
    expect(existsSync(join(root, ".SymbolLattice", "auto-sync-stop-requests"))).toBe(false);
  });

  it("lets only the matching host consume a short-lived request and returns an attributed receipt", async () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    const registration = registry.register(hostRecord());
    const control = new FileSystemAutoSyncStopControl(root, registry, {
      version: "0.269.0",
      pollIntervalMs: 5,
      waitTimeoutMs: 500
    });
    const monitor = control.monitor(hostRecord(), () => {
      if (registration.state === "registered") registration.unregister();
    });
    const approval = control.preview(HOST_ID).approval;

    const result = await control.execute(HOST_ID, {
      apply: true,
      yes: true,
      approval: approval ?? undefined
    });

    monitor.close();
    expect(result).toMatchObject({
      mode: "apply",
      status: "stopped",
      target: { hostId: HOST_ID, pid: 4312 },
      approval,
      mutation: { performed: true, operation: "cooperative-stop-request" },
      error: null
    });
  });

  it("invalidates a preview when the exact host identity changes before apply", async () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    const first = registry.register(hostRecord());
    const control = new FileSystemAutoSyncStopControl(root, registry, { version: "0.269.0" });
    const approval = control.preview(HOST_ID).approval;
    if (first.state === "registered") first.unregister();
    registry.register({ ...hostRecord(), startedAt: "2026-08-05T03:01:00.000Z" });

    await expect(
      control.execute(HOST_ID, { apply: true, yes: true, approval: approval ?? undefined })
    ).rejects.toMatchObject({ code: "STOP_APPROVAL_INVALID" });
    expect(existsSync(join(root, ".SymbolLattice", "auto-sync-stop-requests"))).toBe(false);
  });

  it("returns a bounded timeout receipt and removes its own unacknowledged request", async () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    registry.register(hostRecord());
    const control = new FileSystemAutoSyncStopControl(root, registry, {
      version: "0.269.0",
      pollIntervalMs: 5,
      waitTimeoutMs: 20
    });
    const approval = control.preview(HOST_ID).approval;

    await expect(
      control.execute(HOST_ID, { apply: true, yes: true, approval: approval ?? undefined })
    ).resolves.toMatchObject({
      mode: "apply",
      status: "request-timeout",
      error: { code: "STOP_REQUEST_TIMEOUT" }
    });
    expect(
      existsSync(
        join(root, ".SymbolLattice", "auto-sync-stop-requests", `${HOST_ID}.json`)
      )
    ).toBe(false);
  });

  it("fails closed without stopping when the canonical project disappears", async () => {
    const root = project();
    const registry = new FileSystemAutoSyncHostRegistry(root, () => undefined);
    registry.register(hostRecord());
    const onStop = vi.fn();
    const control = new FileSystemAutoSyncStopControl(root, registry, {
      version: "0.269.0",
      pollIntervalMs: 5
    });
    rmSync(root, { recursive: true, force: true });

    const monitor = control.monitor(hostRecord(), onStop);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 20));
    monitor.close();

    expect(onStop).not.toHaveBeenCalled();
  });
});

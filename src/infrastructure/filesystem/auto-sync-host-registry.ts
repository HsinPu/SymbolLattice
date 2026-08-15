import {
  closeSync,
  existsSync,
  mkdirSync,
  readFileSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";

import {
  MAX_AUTO_SYNC_HOST_RECORDS,
  type AutoSyncHostLiveness,
  type AutoSyncHostObservation,
  type AutoSyncHostRecord,
  type AutoSyncHostRegistration,
  type AutoSyncHostRegistry,
  type AutoSyncHostRegistryResult
} from "../../application/index.js";

const INDEX_DIRECTORY_NAME = ".SymbolLattice";
export const AUTO_SYNC_HOST_DIRECTORY_NAME = "auto-sync-hosts";
const MAX_HOST_RECORD_BYTES = 16 * 1024;
const HOST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProcessLivenessProbe = (pid: number) => void;

const systemProcessProbe: ProcessLivenessProbe = (pid) => process.kill(pid, 0);

export class FileSystemAutoSyncHostRegistry implements AutoSyncHostRegistry {
  private readonly projectPath: string;

  public constructor(
    projectPath: string,
    private readonly processProbe: ProcessLivenessProbe = systemProcessProbe,
    private readonly now: () => Date = () => new Date()
  ) {
    this.projectPath = resolve(projectPath);
  }

  public register(record: AutoSyncHostRecord): AutoSyncHostRegistration {
    let temporary: string | null = null;
    try {
      validateRecord(record);
      const directory = this.registryPath();
      mkdirSync(directory, { recursive: true });
      const target = this.recordPath(record.hostId);
      temporary = `${target}.${record.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporary, target);
      return {
        state: "registered",
        unregister: () => this.unregister(target, record)
      };
    } catch (error) {
      if (temporary !== null) {
        try {
          unlinkSync(temporary);
        } catch {
          // The temporary file may not have been created or may already have been renamed.
        }
      }
      return { state: "failed", error: registryError(error) };
    }
  }

  public inspect(): AutoSyncHostRegistryResult {
    const directory = this.registryPath();
    if (!existsSync(directory)) {
      return emptyResult("unavailable", null);
    }

    try {
      const files = readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .sort();
      const selected = files.slice(0, MAX_AUTO_SYNC_HOST_RECORDS);
      const hosts: AutoSyncHostObservation[] = [];
      for (const file of selected) {
        const path = join(directory, file);
        const raw = readBoundedRecord(path);
        if (raw === null) {
          continue;
        }
        const record = parseRecord(raw);
        if (record !== null && file === `${record.hostId}.json`) {
          hosts.push(this.observe(record));
        }
      }
      hosts.sort(
        (left, right) =>
          right.startedAt.localeCompare(left.startedAt) || left.hostId.localeCompare(right.hostId)
      );
      return {
        state: "available",
        capacity: MAX_AUTO_SYNC_HOST_RECORDS,
        retained: files.length,
        returned: hosts.length,
        truncated: files.length > selected.length,
        error: null,
        hosts
      };
    } catch (error) {
      return emptyResult("failed", registryError(error));
    }
  }

  private observe(record: AutoSyncHostRecord): AutoSyncHostObservation {
    const observedAt = this.now().toISOString();
    let liveness: AutoSyncHostLiveness = "unverifiable";
    let probeError: AutoSyncHostObservation["probeError"] = null;
    try {
      this.processProbe(record.pid);
      liveness = "live";
    } catch (error) {
      const code = errnoCode(error);
      if (code === "EPERM") {
        liveness = "live";
      } else if (code === "ESRCH") {
        liveness = "stale";
      } else {
        probeError = registryError(error);
      }
    }
    return { ...record, liveness, observedAt, probeError };
  }

  private unregister(target: string, expected: AutoSyncHostRecord): void {
    try {
      const current = parseRecord(readFileSync(target, "utf8"));
      if (
        current?.hostId === expected.hostId &&
        current.pid === expected.pid &&
        current.startedAt === expected.startedAt
      ) {
        unlinkSync(target);
      }
    } catch {
      // Best-effort graceful cleanup; stale records remain safely observable.
    }
  }

  private registryPath(): string {
    return join(this.projectPath, INDEX_DIRECTORY_NAME, AUTO_SYNC_HOST_DIRECTORY_NAME);
  }

  private recordPath(hostId: string): string {
    return join(this.registryPath(), `${hostId}.json`);
  }
}

function readBoundedRecord(path: string): string | null {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_HOST_RECORD_BYTES + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    return bytesRead > MAX_HOST_RECORD_BYTES ? null : buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
}

function parseRecord(raw: string): AutoSyncHostRecord | null {
  try {
    const value = JSON.parse(raw) as unknown;
    validateRecord(value);
    return value;
  } catch {
    return null;
  }
}

function validateRecord(value: unknown): asserts value is AutoSyncHostRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Auto-sync host record must be an object.");
  }
  const record = value as Partial<AutoSyncHostRecord>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.hostId !== "string" ||
    !HOST_ID_PATTERN.test(record.hostId) ||
    (record.kind !== "foreground-watch" && record.kind !== "mcp-auto-sync") ||
    !Number.isSafeInteger(record.pid) ||
    (record.pid ?? 0) <= 0 ||
    typeof record.version !== "string" ||
    record.version.length < 1 ||
    record.version.length > 64 ||
    typeof record.startedAt !== "string" ||
    !Number.isFinite(Date.parse(record.startedAt))
  ) {
    throw new Error("Auto-sync host record is invalid.");
  }
}

function errnoCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : null;
}

function registryError(error: unknown): { readonly code: string; readonly message: string } {
  return {
    code: errnoCode(error) || "AUTO_SYNC_HOST_REGISTRY_FAILED",
    message: error instanceof Error ? error.message : String(error)
  };
}

function emptyResult(
  state: "unavailable" | "failed",
  error: AutoSyncHostRegistryResult["error"]
): AutoSyncHostRegistryResult {
  return {
    state,
    capacity: MAX_AUTO_SYNC_HOST_RECORDS,
    retained: 0,
    returned: 0,
    truncated: false,
    error,
    hosts: []
  };
}

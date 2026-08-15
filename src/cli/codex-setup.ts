import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import {
  planCodexInstructions,
  type CodexInstructionsPlan,
  type CodexInstructionsStatus
} from "./codex-instructions.js";
import {
  createMcpDoctor,
  type McpDoctorResult
} from "./mcp-doctor.js";
import {
  createMcpInstall,
  type McpInstallFileSystem,
  type McpInstallOptions,
  type McpInstallResult
} from "./mcp-install.js";
import {
  createMcpUninstall,
  type McpUninstallFileSystem,
  type McpUninstallResult
} from "./mcp-uninstall.js";

export interface CodexSetupFileSystem extends McpInstallFileSystem, McpUninstallFileSystem {
  readonly removeFile: (path: string) => void;
}

export interface CodexSetupOptions extends McpInstallOptions {
  readonly instructionsPath?: string;
  readonly fileSystem?: CodexSetupFileSystem;
  readonly homeDirectory?: string;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly platform?: NodeJS.Platform;
  readonly now?: Date;
}

export type CodexSetupStatus = "ready" | "applied" | "unchanged" | "blocked";

interface ManagedInstructionsResult {
  readonly status: CodexInstructionsStatus;
  readonly action: CodexInstructionsPlan["action"];
  readonly path: string;
  readonly strategy: CodexInstructionsPlan["strategy"];
  readonly backup: {
    readonly state: "not-needed" | "planned" | "created";
    readonly path: string | null;
  };
  readonly atomicWrite: boolean;
  readonly preservesOutsideOwnedSection: boolean;
  readonly preservesInstructionFile: true;
  readonly diagnostics: readonly string[];
}

export interface CodexSetupResult {
  readonly schemaVersion: 1;
  readonly operation: "install" | "uninstall";
  readonly mode: "preview" | "apply";
  readonly status: CodexSetupStatus;
  readonly target: "codex";
  readonly confirmation: McpInstallResult["confirmation"];
  readonly configuration: McpInstallResult["configuration"] | McpUninstallResult["configuration"];
  readonly instructions: ManagedInstructionsResult;
  readonly transaction: {
    readonly preflight: "passed" | "blocked";
    readonly backups: "not-needed" | "planned" | "created" | "failed";
    readonly writes: "not-attempted" | "completed" | "failed";
    readonly rollback: "not-needed" | "completed" | "failed";
    readonly consistent: boolean;
    readonly diagnostics: readonly string[];
  };
  readonly prerequisites: McpInstallResult["prerequisites"];
  readonly lifecycle: McpInstallResult["lifecycle"];
  readonly notes: readonly string[];
}

export interface CodexDoctorResult extends McpDoctorResult {
  readonly instructions: ManagedInstructionsResult;
}

interface FileSnapshot {
  readonly exists: boolean;
  readonly text: string | null;
}

interface StagedConfiguration {
  readonly result: McpInstallResult | McpUninstallResult;
  readonly snapshot: FileSnapshot;
  readonly writes: ReadonlyMap<string, string>;
  readonly backups: readonly { readonly sourcePath: string; readonly backupPath: string }[];
}

const DEFAULT_FILE_SYSTEM: CodexSetupFileSystem = {
  exists: existsSync,
  readText: (path) => readFileSync(path, "utf8"),
  writeAtomically,
  writeBackup,
  removeFile: (path) => {
    if (existsSync(path)) unlinkSync(path);
  }
};

export function createCodexInstall(options: CodexSetupOptions): CodexSetupResult {
  return createCodexSetup("install", options);
}

export function createCodexUninstall(options: CodexSetupOptions): CodexSetupResult {
  return createCodexSetup("uninstall", options);
}

export function createCodexDoctor(options: CodexSetupOptions): CodexDoctorResult {
  const fileSystem = options.fileSystem ?? DEFAULT_FILE_SYSTEM;
  const configuration = createMcpDoctor("codex", options, dependencies(options, fileSystem));
  const instructionsPlan = planInstructions("install", options, fileSystem);
  const instructions = renderInstructions(instructionsPlan, false);
  const instructionsHealthy = instructionsPlan.status === "matches" && instructionsPlan.action === "unchanged";
  return {
    ...configuration,
    instructions,
    overall: configuration.overall === "healthy" && instructionsHealthy ? "healthy" : "action-required",
    notes: [
      ...configuration.notes,
      "Codex instruction diagnosis is read-only and never changes AGENTS.md."
    ]
  };
}

function createCodexSetup(
  operation: "install" | "uninstall",
  options: CodexSetupOptions
): CodexSetupResult {
  if (options.apply === true && options.yes !== true) {
    throw new Error("Refusing to change Codex configuration without both --apply and --yes.");
  }
  const fileSystem = options.fileSystem ?? DEFAULT_FILE_SYSTEM;
  const now = options.now ?? new Date();
  const baseOptions = { ...options, apply: false, yes: false };
  const configurationPreview =
    operation === "install"
      ? createMcpInstall("codex", baseOptions, dependencies(options, fileSystem, now))
      : createMcpUninstall("codex", baseOptions, dependencies(options, fileSystem, now));
  const instructionsPlan = planInstructions(operation, { ...options, now }, fileSystem);
  const preflightBlocked =
    configurationPreview.configuration.action === "blocked" || instructionsPlan.action === "blocked";
  const hasChanges =
    isConfigurationChange(configurationPreview.configuration.action) || isInstructionChange(instructionsPlan.action);
  const hasPlannedBackups =
    configurationPreview.configuration.backup.state === "planned" || instructionsPlan.backup.state === "planned";

  if (preflightBlocked || options.apply !== true || !hasChanges) {
    const mode = options.apply === true ? "apply" : "preview";
    const status: CodexSetupStatus = preflightBlocked ? "blocked" : hasChanges ? "ready" : "unchanged";
    return renderSetupResult(operation, mode, status, configurationPreview, instructionsPlan, {
      preflight: preflightBlocked ? "blocked" : "passed",
      backups: hasPlannedBackups && !preflightBlocked ? "planned" : "not-needed",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: preflightBlocked
        ? ["No files were changed because both Codex-managed files did not pass preflight."]
        : mode === "preview"
          ? ["Preview only: neither Codex-managed file was written."]
          : ["Both Codex-managed files already match the reviewed plan; no write was needed."]
    });
  }

  let staged: StagedConfiguration;
  try {
    staged = stageConfiguration(operation, options, configurationPreview, fileSystem, now);
  } catch (error) {
    return renderSetupResult(operation, "apply", "blocked", configurationPreview, instructionsPlan, {
      preflight: "blocked",
      backups: "not-needed",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: [`Configuration staging failed: ${errorMessage(error)}`]
    });
  }
  if (staged.result.configuration.action === "blocked") {
    return renderSetupResult(operation, "apply", "blocked", staged.result, instructionsPlan, {
      preflight: "blocked",
      backups: "not-needed",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: ["The MCP configuration changed or became unsafe during staging; no files were written."]
    });
  }

  const configurationPath = configurationPreview.configuration.path;
  if (configurationPath === null) {
    throw new Error("Codex configuration staging produced no destination path.");
  }
  if (!snapshotMatches(fileSystem, configurationPath, staged.snapshot) || !instructionsSnapshotMatches(fileSystem, instructionsPlan)) {
    return renderSetupResult(operation, "apply", "blocked", configurationPreview, instructionsPlan, {
      preflight: "blocked",
      backups: "not-needed",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: ["A Codex-managed file changed after preflight; re-run the command to review a fresh plan."]
    });
  }

  const instructionBackup =
    isInstructionChange(instructionsPlan.action) && instructionsPlan.originalExists && instructionsPlan.backup.path !== null
      ? { sourcePath: instructionsPlan.path, backupPath: instructionsPlan.backup.path }
      : null;
  const backups = [...staged.backups, ...(instructionBackup === null ? [] : [instructionBackup])];
  try {
    for (const backup of backups) fileSystem.writeBackup(backup.sourcePath, backup.backupPath);
  } catch (error) {
    return renderSetupResult(operation, "apply", "blocked", configurationPreview, instructionsPlan, {
      preflight: "passed",
      backups: "failed",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: [`Backup creation failed before any managed file was written: ${errorMessage(error)}`]
    });
  }

  if (!snapshotMatches(fileSystem, configurationPath, staged.snapshot) || !instructionsSnapshotMatches(fileSystem, instructionsPlan)) {
    return renderSetupResult(operation, "apply", "blocked", configurationPreview, instructionsPlan, {
      preflight: "blocked",
      backups: backups.length === 0 ? "not-needed" : "created",
      writes: "not-attempted",
      rollback: "not-needed",
      consistent: true,
      diagnostics: ["A Codex-managed file changed while backups were being created; no managed file was written."]
    });
  }

  const changes = [
    ...[...staged.writes].map(([path, text]) => ({ path, text, snapshot: staged.snapshot })),
    ...(isInstructionChange(instructionsPlan.action) && instructionsPlan.updatedText !== null
      ? [{
          path: instructionsPlan.path,
          text: instructionsPlan.updatedText,
          snapshot: { exists: instructionsPlan.originalExists, text: instructionsPlan.originalText }
        }]
      : [])
  ];
  const attempted: typeof changes = [];
  try {
    for (const change of changes) {
      attempted.push(change);
      fileSystem.writeAtomically(change.path, change.text);
    }
  } catch (error) {
    const rollback = rollbackChanges(fileSystem, attempted);
    return renderSetupResult(operation, "apply", "blocked", configurationPreview, instructionsPlan, {
      preflight: "passed",
      backups: backups.length === 0 ? "not-needed" : "created",
      writes: "failed",
      rollback: rollback ? "completed" : "failed",
      consistent: rollback,
      diagnostics: [
        `A managed-file write failed: ${errorMessage(error)}`,
        rollback
          ? "Every attempted managed-file write was restored to its preflight state."
          : "At least one managed file could not be restored; use the created backups before retrying."
      ]
    });
  }

  return renderSetupResult(operation, "apply", "applied", staged.result, instructionsPlan, {
    preflight: "passed",
    backups: backups.length === 0 ? "not-needed" : "created",
    writes: "completed",
    rollback: "not-needed",
    consistent: true,
    diagnostics: ["Both Codex-managed files now match the reviewed plan."]
  }, true);
}

function stageConfiguration(
  operation: "install" | "uninstall",
  options: CodexSetupOptions,
  preview: McpInstallResult | McpUninstallResult,
  fileSystem: CodexSetupFileSystem,
  now: Date
): StagedConfiguration {
  const path = preview.configuration.path;
  if (path === null) throw new Error("Codex configuration preview produced no destination path.");
  const snapshot = readSnapshot(fileSystem, path);
  const writes = new Map<string, string>();
  const backups: Array<{ sourcePath: string; backupPath: string }> = [];
  const stagingFileSystem: CodexSetupFileSystem = {
    exists: (candidate) => candidate === path ? snapshot.exists : fileSystem.exists(candidate),
    readText: (candidate) => {
      if (candidate !== path) return fileSystem.readText(candidate);
      if (!snapshot.exists || snapshot.text === null) throw new Error(`Missing staged configuration: ${candidate}`);
      return snapshot.text;
    },
    writeAtomically: (candidate, text) => writes.set(candidate, text),
    writeBackup: (sourcePath, backupPath) => backups.push({ sourcePath, backupPath }),
    removeFile: () => undefined
  };
  const applyOptions = { ...options, apply: true, yes: true };
  const result =
    operation === "install"
      ? createMcpInstall("codex", applyOptions, dependencies(options, stagingFileSystem, now))
      : createMcpUninstall("codex", applyOptions, dependencies(options, stagingFileSystem, now));
  return { result, snapshot, writes, backups };
}

function renderSetupResult(
  operation: "install" | "uninstall",
  mode: "preview" | "apply",
  status: CodexSetupStatus,
  configurationResult: McpInstallResult | McpUninstallResult,
  instructionsPlan: CodexInstructionsPlan,
  transaction: CodexSetupResult["transaction"],
  applied = false
): CodexSetupResult {
  const configurationBackup = configurationResult.configuration.backup;
  const configurationNotes =
    mode === "apply"
      ? configurationResult.notes.filter(
          (note) => note !== "Preview only: no Agent configuration, backup, or project index has been written."
        )
      : configurationResult.notes;
  const configuration = {
    ...configurationResult.configuration,
    backup: {
      ...configurationBackup,
      state: applied && configurationBackup.state === "planned" ? "created" as const : configurationBackup.state
    }
  };
  return {
    schemaVersion: 1,
    operation,
    mode,
    status,
    target: "codex",
    confirmation: {
      requiredFlags: ["--apply", "--yes"],
      applyRequested: mode === "apply",
      acknowledgementReceived: mode === "apply"
    },
    configuration,
    instructions: renderInstructions(instructionsPlan, applied),
    transaction,
    prerequisites: configurationResult.prerequisites,
    lifecycle: configurationResult.lifecycle,
    notes: [
      ...configurationNotes,
      "The simplified Codex setup manages config.toml and one marker-owned AGENTS.md section as one reviewed plan.",
      "This command never starts MCP, Codex, init, or sync."
    ]
  };
}

function renderInstructions(plan: CodexInstructionsPlan, applied: boolean): ManagedInstructionsResult {
  return {
    status: plan.status,
    action: plan.action,
    path: plan.path,
    strategy: plan.strategy,
    backup: {
      state: applied && plan.backup.state === "planned" ? "created" : plan.backup.state,
      path: plan.backup.path
    },
    atomicWrite: isInstructionChange(plan.action),
    preservesOutsideOwnedSection: plan.preservesOutsideOwnedSection,
    preservesInstructionFile: true,
    diagnostics: plan.diagnostics
  };
}

function planInstructions(
  operation: "install" | "uninstall",
  options: CodexSetupOptions,
  fileSystem: CodexSetupFileSystem
): CodexInstructionsPlan {
  return planCodexInstructions(operation, {
    projectPath: options.projectPath,
    ...(options.instructionsPath === undefined ? {} : { instructionsPath: options.instructionsPath }),
    ...(options.backupDirectory === undefined ? {} : { backupDirectory: options.backupDirectory }),
    ...(options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }),
    ...(options.now === undefined ? {} : { now: options.now }),
    fileSystem
  });
}

function dependencies(
  options: CodexSetupOptions,
  fileSystem: McpInstallFileSystem & McpUninstallFileSystem,
  now = options.now ?? new Date()
) {
  return {
    fileSystem,
    now: () => now,
    ...(options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.platform === undefined ? {} : { platform: options.platform })
  };
}

function readSnapshot(fileSystem: CodexSetupFileSystem, path: string): FileSnapshot {
  if (!fileSystem.exists(path)) return { exists: false, text: null };
  return { exists: true, text: fileSystem.readText(path) };
}

function snapshotMatches(fileSystem: CodexSetupFileSystem, path: string, snapshot: FileSnapshot): boolean {
  if (fileSystem.exists(path) !== snapshot.exists) return false;
  if (!snapshot.exists) return true;
  try {
    return fileSystem.readText(path) === snapshot.text;
  } catch {
    return false;
  }
}

function instructionsSnapshotMatches(fileSystem: CodexSetupFileSystem, plan: CodexInstructionsPlan): boolean {
  return snapshotMatches(fileSystem, plan.path, { exists: plan.originalExists, text: plan.originalText });
}

function rollbackChanges(
  fileSystem: CodexSetupFileSystem,
  attempted: readonly { readonly path: string; readonly snapshot: FileSnapshot }[]
): boolean {
  let restored = true;
  for (const change of [...attempted].reverse()) {
    try {
      if (change.snapshot.exists && change.snapshot.text !== null) {
        fileSystem.writeAtomically(change.path, change.snapshot.text);
      } else {
        fileSystem.removeFile(change.path);
      }
    } catch {
      restored = false;
    }
  }
  return restored;
}

function isConfigurationChange(action: McpInstallResult["configuration"]["action"] | McpUninstallResult["configuration"]["action"]): boolean {
  return action === "create" || action === "update" || action === "remove";
}

function isInstructionChange(action: CodexInstructionsPlan["action"]): boolean {
  return action === "create" || action === "update" || action === "remove";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

function writeBackup(sourcePath: string, backupPath: string): void {
  const sourceMode = statSync(sourcePath).mode & 0o777;
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(sourcePath, backupPath, constants.COPYFILE_EXCL);
  chmodSync(backupPath, sourceMode);
}

function writeAtomically(path: string, text: string): void {
  const existingMode = existsSync(path) ? statSync(path).mode & 0o777 : null;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.SymbolLattice-${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporaryPath,
      text,
      existingMode === null ? "utf8" : { encoding: "utf8", mode: existingMode }
    );
    if (existingMode !== null) chmodSync(temporaryPath, existingMode);
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write failure; temporary cleanup is best effort.
    }
    throw error;
  }
}

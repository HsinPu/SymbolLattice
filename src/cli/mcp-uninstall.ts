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
import { basename, dirname, join, resolve } from "node:path";

import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser";
import { parseDocument } from "yaml";

import {
  createMcpConfig,
  type McpConfigResult,
  type McpConfigTarget
} from "./mcp-config.js";
import {
  createMcpDoctor,
  type McpDoctorDependencies,
  type McpDoctorFileSystem,
  type McpDoctorOptions,
  type McpDoctorResult
} from "./mcp-doctor.js";

/** Options for a preview-first removal of one SymbolLattice MCP configuration entry. */
export interface McpUninstallOptions extends McpDoctorOptions {
  /** Writes only when both `apply` and `yes` are true. Preview is the default. */
  readonly apply?: boolean;
  /** Explicit acknowledgement required together with `apply`. */
  readonly yes?: boolean;
  /** Directory for full-file backups before an existing configuration is updated. */
  readonly backupDirectory?: string;
}

/** The minimal write capability granted only to the explicit apply path. */
export interface McpUninstallFileSystem extends McpDoctorFileSystem {
  readonly writeAtomically: (path: string, text: string) => void;
  readonly writeBackup: (sourcePath: string, backupPath: string) => void;
}

/** Injectable time, environment, and filesystem seams for safe deterministic verification. */
export interface McpUninstallDependencies extends Omit<McpDoctorDependencies, "fileSystem"> {
  readonly fileSystem?: McpUninstallFileSystem;
  readonly now?: () => Date;
}

export type McpUninstallMode = "preview" | "apply";
export type McpUninstallStatus = "ready" | "applied" | "unchanged" | "blocked";
export type McpUninstallAction = "remove" | "unchanged" | "blocked";

/** Stable, side-effect-transparent result for a planned or applied configuration removal. */
export interface McpUninstallResult {
  readonly schemaVersion: 1;
  readonly mode: McpUninstallMode;
  readonly status: McpUninstallStatus;
  readonly target: McpConfigTarget;
  readonly location: McpConfigResult["location"];
  readonly confirmation: {
    readonly requiredFlags: readonly ["--apply", "--yes"];
    readonly applyRequested: boolean;
    readonly acknowledgementReceived: boolean;
  };
  readonly configuration: {
    readonly beforeStatus: McpDoctorResult["configuration"]["status"];
    readonly action: McpUninstallAction;
    readonly path: string | null;
    readonly format: McpDoctorResult["configuration"]["format"];
    readonly source: McpDoctorResult["configuration"]["source"];
    readonly entry: string;
    readonly selection?: string;
    readonly strategy:
      | "json-object-remove"
      | "jsonc-surgical-remove"
      | "yaml-document-remove"
      | "toml-owned-section-remove"
      | "not-applicable";
    readonly backup: {
      readonly state: "not-needed" | "planned" | "created" | "unavailable";
      readonly path: string | null;
    };
    readonly atomicWrite: boolean;
    readonly preservesSiblingEntries: boolean;
    readonly preservesConfigurationFile: true;
    readonly diagnostics: readonly string[];
  };
  readonly prerequisites: {
    readonly command: McpDoctorResult["runtime"];
    readonly project: McpDoctorResult["project"];
  };
  readonly lifecycle: McpConfigResult["lifecycle"];
  readonly notes: readonly string[];
}

interface UninstallPlan {
  readonly expected: McpConfigResult;
  readonly diagnosis: McpDoctorResult;
  readonly action: McpUninstallAction;
  readonly strategy: McpUninstallResult["configuration"]["strategy"];
  /** Kept internal so apply can reject a configuration changed after planning. */
  readonly originalText: string | null;
  readonly updatedText: string | null;
  readonly backupPath: string | null;
  readonly diagnostics: readonly string[];
}

const DEFAULT_FILE_SYSTEM: McpUninstallFileSystem = {
  exists: existsSync,
  readText: (path) => readFileSync(path, "utf8"),
  writeAtomically,
  writeBackup
};

/**
 * Builds a non-mutating removal plan by default. Passing both `apply: true`
 * and `yes: true` performs exactly the planned backup and atomic replacement.
 * The configuration file itself is always retained.
 */
export function createMcpUninstall(
  targetInput: string,
  options: McpUninstallOptions,
  dependencies: McpUninstallDependencies = {}
): McpUninstallResult {
  if (options.apply === true && options.yes !== true) {
    throw new Error("Refusing to change an Agent configuration without both --apply and --yes.");
  }

  const fileSystem = dependencies.fileSystem ?? DEFAULT_FILE_SYSTEM;
  const expected = createMcpConfig(targetInput, options);
  const diagnosis = createMcpDoctor(targetInput, options, {
    fileSystem,
    ...(dependencies.homeDirectory === undefined ? {} : { homeDirectory: dependencies.homeDirectory }),
    ...(dependencies.environment === undefined ? {} : { environment: dependencies.environment }),
    ...(dependencies.platform === undefined ? {} : { platform: dependencies.platform })
  });
  const plan = buildUninstallPlan(expected, diagnosis, options, fileSystem, dependencies.now ?? (() => new Date()));

  if (options.apply !== true) {
    return renderUninstallResult("preview", plan, false, false, false, false);
  }
  if (plan.action === "blocked" || plan.action === "unchanged") {
    return renderUninstallResult("apply", plan, false, false, true, options.yes === true);
  }

  const changedPlan = blockIfConfigurationChanged(plan, fileSystem);
  if (changedPlan !== null) {
    return renderUninstallResult("apply", changedPlan, false, false, true, options.yes === true);
  }

  const configurationPath = plan.diagnosis.configuration.path;
  const updatedText = plan.updatedText;
  const backupPath = plan.backupPath;
  if (configurationPath === null || updatedText === null || backupPath === null) {
    throw new Error("MCP removal plan is incomplete and cannot be applied.");
  }
  fileSystem.writeBackup(configurationPath, backupPath);
  fileSystem.writeAtomically(configurationPath, updatedText);
  return renderUninstallResult("apply", plan, true, true, true, options.yes === true);
}

function buildUninstallPlan(
  expected: McpConfigResult,
  diagnosis: McpDoctorResult,
  options: McpUninstallOptions,
  fileSystem: McpUninstallFileSystem,
  now: () => Date
): UninstallPlan {
  const configurationPath = diagnosis.configuration.path;
  const status = diagnosis.configuration.status;
  if (configurationPath === null || diagnosis.configuration.format === null) {
    return blockedPlan(expected, diagnosis, [
      "No Agent-specific configuration path is available. generic-json requires --config <path>."
    ]);
  }
  if (status === "invalid" || status === "unreadable") {
    return blockedPlan(expected, diagnosis, [
      "The existing configuration could not be safely parsed or read, so it will not be changed.",
      ...diagnosis.configuration.diagnostics
    ]);
  }
  if (status === "missing" || status === "not-configured" || status === "not-applicable") {
    return {
      expected,
      diagnosis,
      action: "unchanged",
      strategy: strategyForTarget(expected.target),
      originalText: null,
      updatedText: null,
      backupPath: null,
      diagnostics: ["The selected configuration has no SymbolLattice MCP entry to remove."]
    };
  }

  let existingText: string;
  try {
    existingText = fileSystem.readText(configurationPath);
  } catch {
    return blockedPlan(expected, diagnosis, ["The selected configuration could not be read immediately before planning."]);
  }

  try {
    const updatedText = removeOwnedConfiguration(expected, existingText);
    const backupPath = nextBackupPath(configurationPath, expected.target, options, diagnosis.project.path, fileSystem, now());
    return {
      expected,
      diagnosis,
      action: "remove",
      strategy: strategyForTarget(expected.target),
      originalText: existingText,
      updatedText,
      backupPath,
      diagnostics: [
        "Only SymbolLattice's owned MCP entry is removed; sibling Agent configuration and the configuration file remain present.",
        ...(expected.target === "hermes"
          ? ["The Hermes platform toolset is intentionally retained because it can be user-managed."]
          : []),
        "An exact full-file backup is created before the atomic replacement."
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown configuration transformation error.";
    return blockedPlan(expected, diagnosis, [
      "The existing configuration has an unsupported structure and will not be changed.",
      message
    ]);
  }
}

function blockedPlan(
  expected: McpConfigResult,
  diagnosis: McpDoctorResult,
  diagnostics: readonly string[]
): UninstallPlan {
  return {
    expected,
    diagnosis,
    action: "blocked",
    strategy: "not-applicable",
    originalText: null,
    updatedText: null,
    backupPath: null,
    diagnostics
  };
}

/**
 * Atomic replacement prevents torn writes, but it cannot preserve a sibling
 * process's just-saved change unless the plan is checked again immediately
 * before backup and replacement. Refuse rather than applying stale text.
 */
function blockIfConfigurationChanged(
  plan: UninstallPlan,
  fileSystem: McpUninstallFileSystem
): UninstallPlan | null {
  const configurationPath = plan.diagnosis.configuration.path;
  if (configurationPath === null || plan.originalText === null) {
    throw new Error("MCP removal plan is missing the original configuration text.");
  }
  try {
    if (fileSystem.readText(configurationPath) === plan.originalText) {
      return null;
    }
  } catch {
    return blockedPlan(plan.expected, plan.diagnosis, [
      "The selected configuration could not be read again before apply, so it was not changed."
    ]);
  }
  return blockedPlan(plan.expected, plan.diagnosis, [
    "The selected configuration changed after the removal plan was generated, so it was not changed.",
    "Re-run mcp-uninstall to review a fresh plan before applying it."
  ]);
}

function renderUninstallResult(
  mode: McpUninstallMode,
  plan: UninstallPlan,
  didWrite: boolean,
  didBackUp: boolean,
  applyRequested: boolean,
  acknowledgementReceived: boolean
): McpUninstallResult {
  const action = plan.action;
  const status: McpUninstallStatus =
    action === "blocked" ? "blocked" : action === "unchanged" ? "unchanged" : didWrite ? "applied" : "ready";
  const backupState =
    action !== "remove"
      ? "not-needed"
      : didBackUp
        ? "created"
        : mode === "preview"
          ? "planned"
          : "unavailable";
  return {
    schemaVersion: 1,
    mode,
    status,
    target: plan.expected.target,
    location: plan.expected.location,
    confirmation: {
      requiredFlags: ["--apply", "--yes"],
      applyRequested,
      acknowledgementReceived
    },
    configuration: {
      beforeStatus: plan.diagnosis.configuration.status,
      action,
      path: plan.diagnosis.configuration.path,
      format: plan.diagnosis.configuration.format,
      source: plan.diagnosis.configuration.source,
      entry: plan.diagnosis.configuration.entry,
      ...(plan.diagnosis.configuration.selection === undefined
        ? {}
        : { selection: plan.diagnosis.configuration.selection }),
      strategy: plan.strategy,
      backup: {
        state: backupState,
        path: plan.backupPath
      },
      atomicWrite: action === "remove",
      preservesSiblingEntries: action !== "blocked",
      preservesConfigurationFile: true,
      diagnostics: plan.diagnostics
    },
    prerequisites: {
      command: plan.diagnosis.runtime,
      project: plan.diagnosis.project
    },
    lifecycle: plan.expected.lifecycle,
    notes: buildUninstallNotes(mode, plan, didWrite)
  };
}

function buildUninstallNotes(
  mode: McpUninstallMode,
  plan: UninstallPlan,
  didWrite: boolean
): readonly string[] {
  const notes = ["This uninstaller never runs MCP, sync, or an Agent process."];
  if (mode === "preview") {
    notes.push("Preview only: no Agent configuration, backup, or project index has been written.");
    if (plan.action === "remove") {
      notes.push("Re-run the same command with --apply --yes only after reviewing this plan.");
    }
  }
  if (plan.action === "blocked") {
    notes.push("Apply was refused because the existing configuration could not be transformed safely.");
  }
  if (didWrite) {
    notes.push("The selected configuration was atomically updated after its full backup was created.");
  }
  notes.push("This command never deletes the selected configuration file.");
  return notes;
}

function removeOwnedConfiguration(expected: McpConfigResult, text: string): string {
  switch (expected.target) {
    case "claude":
    case "cursor":
    case "gemini":
    case "kiro":
    case "antigravity":
    case "generic-json":
      return removeJsonMcpServers(text, expected.server.name);
    case "opencode":
      return removeOpenCodeJsonc(text, expected.server.name);
    case "hermes":
      return removeHermesYaml(text);
    case "codex":
      return removeCodexToml(text);
  }
}

function strategyForTarget(target: McpConfigTarget): McpUninstallResult["configuration"]["strategy"] {
  switch (target) {
    case "opencode":
      return "jsonc-surgical-remove";
    case "hermes":
      return "yaml-document-remove";
    case "codex":
      return "toml-owned-section-remove";
    case "claude":
    case "cursor":
    case "gemini":
    case "kiro":
    case "antigravity":
    case "generic-json":
      return "json-object-remove";
  }
}

function removeJsonMcpServers(text: string, serverName: string): string {
  const root = requireObject(JSON.parse(text), "JSON root");
  const existingMcpServers = root.mcpServers;
  if (!isObject(existingMcpServers)) {
    throw new Error("mcpServers must be an object before an owned entry can be removed.");
  }
  if (!Object.hasOwn(existingMcpServers, serverName)) {
    throw new Error("The selected mcpServers object has no owned SymbolLattice entry to remove.");
  }
  const mcpServers = { ...existingMcpServers };
  delete mcpServers[serverName];
  return `${JSON.stringify({ ...root, mcpServers }, null, 2)}\n`;
}

function removeOpenCodeJsonc(text: string, serverName: string): string {
  const errors: ParseError[] = [];
  const root = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    throw new Error("OpenCode JSONC contains parse errors.");
  }
  const object = requireObject(root, "OpenCode JSONC root");
  if (!isObject(object.mcp)) {
    throw new Error("OpenCode mcp must be an object before an owned entry can be removed.");
  }
  if (!Object.hasOwn(object.mcp, serverName)) {
    throw new Error("The selected OpenCode mcp object has no owned SymbolLattice entry to remove.");
  }
  return applyEdits(
    text,
    modify(text, ["mcp", serverName], undefined, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" }
    })
  );
}

function removeHermesYaml(text: string): string {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new Error("Hermes YAML contains parse errors.");
  }
  const current = document.toJS();
  const root = requireObject(current, "Hermes YAML root");
  if (!isObject(root.mcp_servers)) {
    throw new Error("Hermes mcp_servers must be an object before an owned entry can be removed.");
  }
  if (!Object.hasOwn(root.mcp_servers, "symbol_lattice")) {
    throw new Error("The selected Hermes mcp_servers object has no owned SymbolLattice entry to remove.");
  }
  document.deleteIn(["mcp_servers", "symbol_lattice"]);
  return ensureTrailingNewline(document.toString());
}

function removeCodexToml(text: string): string {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\r|\n/u);
  const ranges = findTomlSectionRanges(lines, "mcp_servers.symbol_lattice");
  if (ranges.length !== 1) {
    throw new Error(
      ranges.length === 0
        ? "Codex TOML has no conventional mcp_servers.symbol_lattice section to remove."
        : "Codex TOML contains duplicate mcp_servers.symbol_lattice sections."
    );
  }
  assertUnambiguousCodexMcpShape(lines);
  const range = ranges[0];
  if (range === undefined) {
    throw new Error("Codex TOML section range was unavailable.");
  }
  lines.splice(range.start, range.end - range.start);
  return ensureTrailingNewline(lines.join(lineEnding), lineEnding);
}

/**
 * The uninstaller owns only the conventional `[mcp_servers.symbol_lattice]`
 * table. Equivalent-looking inline, quoted, dotted-key, and array forms are
 * refused so a removal never has to guess which user-owned TOML to edit.
 */
function assertUnambiguousCodexMcpShape(lines: readonly string[]): void {
  let inMcpServersTable = false;
  for (const line of lines) {
    const withoutComment = stripTomlComment(line).trim();
    if (withoutComment.length === 0) {
      continue;
    }
    const header = /^\[([^\]]+)\]$/u.exec(withoutComment)?.[1]?.trim();
    const arrayHeader = /^\[\[([^\]]+)\]\]$/u.exec(withoutComment)?.[1]?.trim();
    if (arrayHeader !== undefined) {
      if (looksLikeSymbolLatticeMcpPath(arrayHeader)) {
        throw new Error("Codex TOML uses an array-table SymbolLattice MCP entry that cannot be safely removed.");
      }
      inMcpServersTable = false;
      continue;
    }
    if (header !== undefined) {
      if (looksLikeSymbolLatticeMcpPath(header) && header !== "mcp_servers.symbol_lattice") {
        throw new Error("Codex TOML uses a non-conventional SymbolLattice MCP table that cannot be safely removed.");
      }
      inMcpServersTable = header === "mcp_servers";
      continue;
    }
    if (
      /^mcp_servers\s*(?:\.\s*(?:symbol_lattice|["']symbol_lattice["']))?\s*=/u.test(withoutComment) ||
      (inMcpServersTable && /^symbol_lattice\s*=/u.test(withoutComment))
    ) {
      throw new Error("Codex TOML uses an inline or dotted SymbolLattice MCP entry that cannot be safely removed.");
    }
  }
}

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === undefined) {
      continue;
    }
    if (quote === '"' && character === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) {
      quote = null;
      continue;
    }
    if (quote === null && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }
    if (quote === null && character === "#") {
      return line.slice(0, index);
    }
    escaped = false;
  }
  return line;
}

function looksLikeSymbolLatticeMcpPath(value: string): boolean {
  return /\bmcp_servers\s*\.\s*(?:symbol_lattice|["']symbol_lattice["'])(?=$|[^A-Za-z0-9_])/u.test(value);
}

function findTomlSectionRanges(
  lines: readonly string[],
  name: string
): readonly { readonly start: number; readonly end: number }[] {
  const headers = lines.flatMap((line, index) => {
    const match = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
    return match?.[1]?.trim() === name ? [index] : [];
  });
  return headers.map((start) => {
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/u.test(lines[index] ?? "")) {
        end = index;
        break;
      }
    }
    return { start, end };
  });
}

function nextBackupPath(
  configurationPath: string,
  target: McpConfigTarget,
  options: McpUninstallOptions,
  projectPath: string,
  fileSystem: McpUninstallFileSystem,
  now: Date
): string {
  const directory = resolveBackupDirectory(options.backupDirectory, projectPath);
  const timestamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const prefix = `${timestamp}-${target}-${basename(configurationPath)}`;
  for (let suffix = 0; ; suffix += 1) {
    const candidate = join(directory, `${prefix}${suffix === 0 ? "" : `-${suffix}`}.bak`);
    if (!fileSystem.exists(candidate)) {
      return candidate;
    }
  }
}

function resolveBackupDirectory(value: string | undefined, projectPath: string): string {
  if (value === undefined) {
    return join(resolve(projectPath), ".symbol-lattice", "mcp-backups");
  }
  if (value.trim().length === 0) {
    throw new Error("Expected a non-empty --backup-dir path.");
  }
  return resolve(value);
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
  const temporaryPath = `${path}.symbol-lattice-${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporaryPath,
      text,
      existingMode === null ? "utf8" : { encoding: "utf8", mode: existingMode }
    );
    if (existingMode !== null) {
      chmodSync(temporaryPath, existingMode);
    }
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write failure; cleanup is best effort only.
    }
    throw error;
  }
}

function ensureTrailingNewline(text: string, lineEnding = "\n"): string {
  return text.endsWith("\n") || text.endsWith("\r") ? text : `${text}${lineEnding}`;
}

function requireObject(value: unknown, description: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`${description} must be an object before it can be safely changed.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

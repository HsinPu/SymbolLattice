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

/** Options for a preview-first MCP configuration installation. */
export interface McpInstallOptions extends McpDoctorOptions {
  /** Writes only when both `apply` and `yes` are true. Preview is the default. */
  readonly apply?: boolean;
  /** Explicit acknowledgement required together with `apply`. */
  readonly yes?: boolean;
  /** Directory for full-file backups before an existing configuration is updated. */
  readonly backupDirectory?: string;
}

/** The minimal write capability granted only to the explicit apply path. */
export interface McpInstallFileSystem extends McpDoctorFileSystem {
  readonly writeAtomically: (path: string, text: string) => void;
  readonly writeBackup: (sourcePath: string, backupPath: string) => void;
}

/** Injectable time, environment, and filesystem seams for safe deterministic verification. */
export interface McpInstallDependencies extends Omit<McpDoctorDependencies, "fileSystem"> {
  readonly fileSystem?: McpInstallFileSystem;
  readonly now?: () => Date;
}

export type McpInstallMode = "preview" | "apply";
export type McpInstallStatus = "ready" | "applied" | "unchanged" | "blocked";
export type McpInstallAction = "create" | "update" | "unchanged" | "blocked";

/** Stable, side-effect-transparent result for a planned or applied configuration update. */
export interface McpInstallResult {
  readonly schemaVersion: 1;
  readonly mode: McpInstallMode;
  readonly status: McpInstallStatus;
  readonly target: McpConfigTarget;
  readonly location: McpConfigResult["location"];
  readonly confirmation: {
    readonly requiredFlags: readonly ["--apply", "--yes"];
    readonly applyRequested: boolean;
    readonly acknowledgementReceived: boolean;
  };
  readonly configuration: {
    readonly beforeStatus: McpDoctorResult["configuration"]["status"];
    readonly action: McpInstallAction;
    readonly path: string | null;
    readonly format: McpDoctorResult["configuration"]["format"];
    readonly source: McpDoctorResult["configuration"]["source"];
    readonly entry: string;
    readonly selection?: string;
    readonly strategy:
      | "new-target-snippet"
      | "json-object-upsert"
      | "jsonc-surgical-edit"
      | "yaml-document-upsert"
      | "toml-owned-section-upsert"
      | "not-applicable";
    readonly backup: {
      readonly state: "not-needed" | "planned" | "created" | "unavailable";
      readonly path: string | null;
    };
    readonly atomicWrite: boolean;
    readonly preservesSiblingEntries: boolean;
    readonly diagnostics: readonly string[];
  };
  readonly prerequisites: {
    readonly command: McpDoctorResult["runtime"];
    readonly project: McpDoctorResult["project"];
  };
  readonly lifecycle: McpConfigResult["lifecycle"];
  readonly notes: readonly string[];
}

interface InstallPlan {
  readonly expected: McpConfigResult;
  readonly diagnosis: McpDoctorResult;
  readonly action: McpInstallAction;
  readonly strategy: McpInstallResult["configuration"]["strategy"];
  readonly updatedText: string | null;
  readonly backupPath: string | null;
  readonly diagnostics: readonly string[];
}

const DEFAULT_FILE_SYSTEM: McpInstallFileSystem = {
  exists: existsSync,
  readText: (path) => readFileSync(path, "utf8"),
  writeAtomically: writeAtomically,
  writeBackup: writeBackup
};

/**
 * Builds a non-mutating plan by default. Passing both `apply: true` and
 * `yes: true` performs exactly the planned backup and atomic write.
 */
export function createMcpInstall(
  targetInput: string,
  options: McpInstallOptions,
  dependencies: McpInstallDependencies = {}
): McpInstallResult {
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
  const plan = buildInstallPlan(expected, diagnosis, options, fileSystem, dependencies.now ?? (() => new Date()));

  if (options.apply !== true) {
    return renderInstallResult("preview", plan, false, false, false, false);
  }
  if (plan.action === "blocked") {
    return renderInstallResult("apply", plan, false, false, true, options.yes === true);
  }
  if (plan.action === "unchanged") {
    return renderInstallResult("apply", plan, false, false, true, options.yes === true);
  }

  const configurationPath = plan.diagnosis.configuration.path;
  const updatedText = plan.updatedText;
  if (configurationPath === null || updatedText === null) {
    throw new Error("MCP installation plan is incomplete and cannot be applied.");
  }
  if (plan.action === "update") {
    if (plan.backupPath === null) {
      throw new Error("MCP installation plan has no backup destination for an existing configuration.");
    }
    fileSystem.writeBackup(configurationPath, plan.backupPath);
  }
  fileSystem.writeAtomically(configurationPath, updatedText);
  return renderInstallResult("apply", plan, true, plan.action === "update", true, options.yes === true);
}

function buildInstallPlan(
  expected: McpConfigResult,
  diagnosis: McpDoctorResult,
  options: McpInstallOptions,
  fileSystem: McpInstallFileSystem,
  now: () => Date
): InstallPlan {
  const configurationPath = diagnosis.configuration.path;
  const status = diagnosis.configuration.status;
  if (configurationPath === null || diagnosis.configuration.format === null) {
    return blockedPlan(expected, diagnosis, [
      "No Agent-specific configuration path is available. generic-json requires --config <path>."
    ]);
  }
  if (status === "invalid" || status === "unreadable") {
    return blockedPlan(expected, diagnosis, [
      "The existing configuration could not be safely parsed or read, so it will not be overwritten.",
      ...diagnosis.configuration.diagnostics
    ]);
  }
  if (status === "matches") {
    return {
      expected,
      diagnosis,
      action: "unchanged",
      strategy: strategyForTarget(expected.target, "new-target-snippet"),
      updatedText: null,
      backupPath: null,
      diagnostics: ["The selected configuration already has the expected SymbolLattice entry."]
    };
  }
  if (status === "missing") {
    return {
      expected,
      diagnosis,
      action: "create",
      strategy: "new-target-snippet",
      updatedText: ensureTrailingNewline(expected.snippet),
      backupPath: null,
      diagnostics: ["Preview creates only the selected Agent configuration file."]
    };
  }

  let existingText: string;
  try {
    existingText = fileSystem.readText(configurationPath);
  } catch {
    return blockedPlan(expected, diagnosis, ["The selected configuration could not be read immediately before planning."]);
  }

  try {
    const updatedText = updateExistingConfiguration(expected, existingText);
    const backupPath = nextBackupPath(configurationPath, expected.target, options, diagnosis.project.path, fileSystem, now());
    return {
      expected,
      diagnosis,
      action: "update",
      strategy: strategyForTarget(expected.target, "json-object-upsert"),
      updatedText,
      backupPath,
      diagnostics: [
        "Only SymbolLattice's owned MCP entry is changed; sibling Agent configuration remains present.",
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
): InstallPlan {
  return {
    expected,
    diagnosis,
    action: "blocked",
    strategy: "not-applicable",
    updatedText: null,
    backupPath: null,
    diagnostics
  };
}

function renderInstallResult(
  mode: McpInstallMode,
  plan: InstallPlan,
  didWrite: boolean,
  didBackUp: boolean,
  applyRequested: boolean,
  acknowledgementReceived: boolean
): McpInstallResult {
  const action = plan.action;
  const status: McpInstallStatus =
    action === "blocked" ? "blocked" : action === "unchanged" ? "unchanged" : didWrite ? "applied" : "ready";
  const backupState =
    action !== "update"
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
      atomicWrite: action === "create" || action === "update",
      preservesSiblingEntries: action !== "blocked",
      diagnostics: plan.diagnostics
    },
    prerequisites: {
      command: plan.diagnosis.runtime,
      project: plan.diagnosis.project
    },
    lifecycle: plan.expected.lifecycle,
    notes: buildInstallNotes(mode, plan, didWrite)
  };
}

function buildInstallNotes(mode: McpInstallMode, plan: InstallPlan, didWrite: boolean): readonly string[] {
  const notes = [
    "This installer never runs MCP, sync, or an Agent process."
  ];
  if (mode === "preview") {
    notes.push("Preview only: no Agent configuration, backup, or project index has been written.");
    if (plan.action === "create" || plan.action === "update") {
      notes.push("Re-run the same command with --apply --yes only after reviewing this plan.");
    }
  }
  if (plan.action === "blocked") {
    notes.push("Apply was refused because the existing configuration could not be transformed safely.");
  }
  if (didWrite) {
    notes.push("The selected configuration was atomically updated after its backup was created when required.");
  }
  if (plan.diagnosis.runtime.status === "missing") {
    notes.push("The configuration can be installed, but the configured MCP command is not currently available through its explicit path or PATH.");
  }
  if (plan.diagnosis.project.indexStatus === "missing") {
    notes.push("The MCP entry is independent of graph creation; run init or sync explicitly before querying this project.");
  }
  return notes;
}

function updateExistingConfiguration(expected: McpConfigResult, text: string): string {
  switch (expected.target) {
    case "claude":
    case "cursor":
    case "gemini":
    case "kiro":
      return updateJsonMcpServers(text, expected.server, true);
    case "antigravity":
    case "generic-json":
      return updateJsonMcpServers(text, expected.server, false);
    case "opencode":
      return updateOpenCodeJsonc(text, expected.server);
    case "hermes":
      return updateHermesYaml(text, expected.server);
    case "codex":
      return updateCodexToml(text, expected.snippet);
  }
}

function strategyForTarget(
  target: McpConfigTarget,
  fallback: McpInstallResult["configuration"]["strategy"]
): McpInstallResult["configuration"]["strategy"] {
  switch (target) {
    case "opencode":
      return "jsonc-surgical-edit";
    case "hermes":
      return "yaml-document-upsert";
    case "codex":
      return "toml-owned-section-upsert";
    case "claude":
    case "cursor":
    case "gemini":
    case "kiro":
    case "antigravity":
    case "generic-json":
      return fallback;
  }
}

function updateJsonMcpServers(
  text: string,
  expected: McpConfigResult["server"],
  requireStdioType: boolean
): string {
  const root = requireObject(JSON.parse(text), "JSON root");
  const existingMcpServers = root.mcpServers;
  if (existingMcpServers !== undefined && !isObject(existingMcpServers)) {
    throw new Error("mcpServers must be an object before it can be safely updated.");
  }
  const mcpServers = existingMcpServers === undefined ? {} : { ...existingMcpServers };
  mcpServers[expected.name] = {
    ...(requireStdioType ? { type: "stdio" } : {}),
    command: expected.command,
    args: [...expected.args]
  };
  return `${JSON.stringify({ ...root, mcpServers }, null, 2)}\n`;
}

function updateOpenCodeJsonc(text: string, expected: McpConfigResult["server"]): string {
  const errors: ParseError[] = [];
  const root = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    throw new Error("OpenCode JSONC contains parse errors.");
  }
  const object = requireObject(root, "OpenCode JSONC root");
  if (object.mcp !== undefined && !isObject(object.mcp)) {
    throw new Error("OpenCode mcp must be an object before it can be safely updated.");
  }
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
  let updated = text;
  if (object.$schema === undefined) {
    updated = applyEdits(
      updated,
      modify(updated, ["$schema"], "https://opencode.ai/config.json", { formattingOptions })
    );
  }
  return applyEdits(
    updated,
    modify(
      updated,
      ["mcp", expected.name],
      {
        type: "local",
        command: [expected.command, ...expected.args],
        enabled: true
      },
      { formattingOptions }
    )
  );
}

function updateHermesYaml(text: string, expected: McpConfigResult["server"]): string {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new Error("Hermes YAML contains parse errors.");
  }
  const current = document.toJS();
  if (current !== null && !isObject(current)) {
    throw new Error("Hermes YAML root must be an object before it can be safely updated.");
  }
  const root = current === null ? {} : current;
  if (root.mcp_servers !== undefined && !isObject(root.mcp_servers)) {
    throw new Error("Hermes mcp_servers must be an object before it can be safely updated.");
  }
  if (root.platform_toolsets !== undefined && !isObject(root.platform_toolsets)) {
    throw new Error("Hermes platform_toolsets must be an object before it can be safely updated.");
  }
  const existingCli = isObject(root.platform_toolsets) ? root.platform_toolsets.cli : undefined;
  if (existingCli !== undefined && (!Array.isArray(existingCli) || !existingCli.every((item) => typeof item === "string"))) {
    throw new Error("Hermes platform_toolsets.cli must be a string list before it can be safely updated.");
  }
  const cliToolset = existingCli === undefined ? ["hermes-cli", "mcp-symbol-lattice"] : [...existingCli];
  if (!cliToolset.includes("mcp-symbol-lattice")) {
    cliToolset.push("mcp-symbol-lattice");
  }
  document.setIn(["mcp_servers", "symbol_lattice"], {
    command: expected.command,
    args: [...expected.args],
    timeout: 120,
    connect_timeout: 60,
    enabled: true
  });
  document.setIn(["platform_toolsets", "cli"], cliToolset);
  return ensureTrailingNewline(document.toString());
}

function updateCodexToml(text: string, snippet: string): string {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\r|\n/u);
  const ranges = findTomlSectionRanges(lines, "mcp_servers.symbol_lattice");
  if (ranges.length > 1) {
    throw new Error("Codex TOML contains duplicate mcp_servers.symbol_lattice sections.");
  }
  assertUnambiguousCodexMcpShape(lines);
  const replacement = snippet.split("\n");
  if (ranges.length === 1) {
    const range = ranges[0];
    if (range === undefined) {
      throw new Error("Codex TOML section range was unavailable.");
    }
    lines.splice(range.start, range.end - range.start, ...replacement);
    return ensureTrailingNewline(lines.join(lineEnding), lineEnding);
  }
  const body = text.trimEnd();
  return body.length === 0
    ? ensureTrailingNewline(snippet, lineEnding)
    : ensureTrailingNewline(`${body}${lineEnding}${lineEnding}${snippet}`, lineEnding);
}

/**
 * The installer owns only the conventional `[mcp_servers.symbol_lattice]`
 * table. TOML has equivalent-looking inline, quoted, dotted-key, and array
 * forms that cannot be safely merged by this intentionally narrow updater.
 * Refuse those forms instead of risking a conflicting second declaration.
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
        throw new Error("Codex TOML uses an array-table SymbolLattice MCP entry that cannot be safely merged.");
      }
      inMcpServersTable = false;
      continue;
    }
    if (header !== undefined) {
      if (looksLikeSymbolLatticeMcpPath(header) && header !== "mcp_servers.symbol_lattice") {
        throw new Error("Codex TOML uses a non-conventional SymbolLattice MCP table that cannot be safely merged.");
      }
      inMcpServersTable = header === "mcp_servers";
      continue;
    }
    if (
      /^mcp_servers\s*(?:\.\s*(?:symbol_lattice|["']symbol_lattice["']))?\s*=/u.test(withoutComment) ||
      (inMcpServersTable && /^symbol_lattice\s*=/u.test(withoutComment))
    ) {
      throw new Error("Codex TOML uses an inline or dotted SymbolLattice MCP entry that cannot be safely merged.");
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
  options: McpInstallOptions,
  projectPath: string,
  fileSystem: McpInstallFileSystem,
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
    throw new Error(`${description} must be an object before it can be safely updated.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

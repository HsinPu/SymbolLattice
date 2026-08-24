import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  createMcpConfig,
  type McpConfigOptions,
  type McpConfigResult,
  type McpConfigTarget
} from "./mcp-config.js";

/** The result categories exposed by the read-only MCP configuration doctor. */
export type McpDoctorConfigurationStatus =
  | "matches"
  | "missing"
  | "invalid"
  | "unreadable"
  | "not-configured"
  | "different"
  | "not-applicable";

export type McpDoctorRuntimeStatus = "available" | "missing";
export type McpDoctorIndexStatus = "present" | "missing";
export type McpDoctorOverallStatus = "healthy" | "action-required";

/** Options accepted by the doctor in addition to the configuration generator controls. */
export interface McpDoctorOptions extends McpConfigOptions {
  /** Explicit configuration file to inspect instead of the target's conventional destination. */
  readonly configPath?: string;
}

/** Read-only filesystem seam for deterministic tests and for keeping the doctor capability-bounded. */
export interface McpDoctorFileSystem {
  readonly exists: (path: string) => boolean;
  readonly readText: (path: string) => string;
}

/** Injectable environment seam. Neither production nor tests receive write methods. */
export interface McpDoctorDependencies {
  readonly fileSystem?: McpDoctorFileSystem;
  readonly homeDirectory?: string;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly platform?: NodeJS.Platform;
}

/** A non-mutating diagnosis of one Agent MCP configuration and its local prerequisites. */
export interface McpDoctorResult {
  readonly schemaVersion: 1;
  readonly mode: "read-only";
  readonly target: McpConfigTarget;
  readonly location: McpConfigResult["location"];
  readonly expected: Pick<McpConfigResult, "server" | "lifecycle">;
  readonly configuration: {
    readonly status: McpDoctorConfigurationStatus;
    readonly path: string | null;
    readonly format: McpConfigResult["destination"]["format"] | null;
    readonly source: "target-default" | "override" | "not-applicable";
    readonly entry: string;
    readonly selection?: string;
    readonly diagnostics: readonly string[];
  };
  readonly runtime: {
    readonly command: string;
    readonly status: McpDoctorRuntimeStatus;
    readonly resolvedPath: string | null;
    readonly sourceEntrypoint?: {
      readonly path: string;
      readonly status: "present" | "missing";
    };
  };
  readonly project: {
    readonly path: string;
    readonly indexDatabasePath: string;
    readonly indexStatus: McpDoctorIndexStatus;
  };
  readonly overall: McpDoctorOverallStatus;
  readonly notes: readonly string[];
}

type McpDoctorConfigFormat = NonNullable<McpDoctorResult["configuration"]["format"]>;

interface SelectedConfiguration {
  readonly path: string | null;
  readonly format: McpDoctorConfigFormat | null;
  readonly source: McpDoctorResult["configuration"]["source"];
  readonly selection?: string;
}

interface ConfigurationInspection {
  readonly status: McpDoctorConfigurationStatus;
  readonly diagnostics: readonly string[];
}

const DEFAULT_FILE_SYSTEM: McpDoctorFileSystem = {
  exists: existsSync,
  readText: (path) => readFileSync(path, "utf8")
};

/**
 * Diagnoses one target without executing its command or changing any Agent,
 * project, or index file. `mcp-config` remains the matching output-only writer aid.
 */
export function createMcpDoctor(
  targetInput: string,
  options: McpDoctorOptions,
  dependencies: McpDoctorDependencies = {}
): McpDoctorResult {
  const expected = createMcpConfig(targetInput, options);
  const fileSystem = dependencies.fileSystem ?? DEFAULT_FILE_SYSTEM;
  const homeDirectory = dependencies.homeDirectory ?? homedir();
  const environment = dependencies.environment ?? process.env;
  const platform = dependencies.platform ?? process.platform;
  const projectPath = resolve(options.projectPath);
  const selected = selectConfiguration(expected, options, fileSystem, homeDirectory, environment);
  const configuration = inspectConfiguration(expected, selected, fileSystem);
  const runtime = inspectRuntime(expected.server, options.commandArgs, fileSystem, environment, platform);
  const indexDatabasePath = join(projectPath, ".SymbolLattice", "index.sqlite");
  const indexStatus: McpDoctorIndexStatus = fileSystem.exists(indexDatabasePath) ? "present" : "missing";
  const overall =
    configuration.status === "matches" &&
    runtime.status === "available" &&
    (runtime.sourceEntrypoint === undefined || runtime.sourceEntrypoint.status === "present") &&
    indexStatus === "present"
      ? "healthy"
      : "action-required";

  return {
    schemaVersion: 1,
    mode: "read-only",
    target: expected.target,
    location: expected.location,
    expected: {
      server: expected.server,
      lifecycle: expected.lifecycle
    },
    configuration: {
      status: configuration.status,
      path: selected.path,
      format: selected.format,
      source: selected.source,
      entry: expected.destination.entry,
      ...(selected.selection === undefined ? {} : { selection: selected.selection }),
      diagnostics: configuration.diagnostics
    },
    runtime,
    project: {
      path: projectPath,
      indexDatabasePath,
      indexStatus
    },
    overall,
    notes: buildNotes(configuration.status, runtime, indexStatus)
  };
}

function selectConfiguration(
  expected: McpConfigResult,
  options: McpDoctorOptions,
  fileSystem: McpDoctorFileSystem,
  homeDirectory: string,
  environment: Readonly<NodeJS.ProcessEnv>
): SelectedConfiguration {
  if (options.configPath !== undefined) {
    const configPath = options.configPath.trim();
    if (configPath.length === 0) {
      throw new Error("Expected a non-empty --config path.");
    }
    return {
      path: resolve(configPath),
      format: formatForConfigurationPath(expected.destination.format, configPath),
      source: "override"
    };
  }

  if (expected.target === "generic-json") {
    return {
      path: null,
      format: null,
      source: "not-applicable",
      selection: "Provide --config <path> to inspect a generic MCP-compatible JSON file."
    };
  }

  if (expected.target === "opencode" && expected.location === "global") {
    const configHome = nonEmptyEnvironment(environment, "XDG_CONFIG_HOME") ?? join(homeDirectory, ".config");
    const jsoncPath = join(configHome, "opencode", "opencode.jsonc");
    const jsonPath = join(configHome, "opencode", "opencode.json");
    if (fileSystem.exists(jsoncPath)) {
      return {
        path: jsoncPath,
        format: "jsonc",
        source: "target-default",
        selection: "Selected the existing opencode.jsonc configuration."
      };
    }
    if (fileSystem.exists(jsonPath)) {
      return {
        path: jsonPath,
        format: "json",
        source: "target-default",
        selection: "Selected the existing opencode.json configuration."
      };
    }
    return {
      path: jsoncPath,
      format: "jsonc",
      source: "target-default",
      selection: "No OpenCode configuration exists; the conventional new-file destination is opencode.jsonc."
    };
  }

  if (expected.target === "antigravity") {
    const unifiedPath = join(homeDirectory, ".gemini", "config", "mcp_config.json");
    const migrationMarker = join(homeDirectory, ".gemini", "config", ".migrated");
    const legacyPath = join(homeDirectory, ".gemini", "antigravity", "mcp_config.json");
    if (fileSystem.exists(migrationMarker) || fileSystem.exists(unifiedPath)) {
      return {
        path: unifiedPath,
        format: "json",
        source: "target-default",
        selection: "Selected the unified Antigravity configuration because its migration marker or unified config exists."
      };
    }
    return {
      path: legacyPath,
      format: "json",
      source: "target-default",
      selection: "Selected the legacy Antigravity configuration because no unified migration marker or config exists."
    };
  }

  return {
    path: conventionalConfigurationPath(expected, homeDirectory, environment),
    format: expected.destination.format,
    source: "target-default"
  };
}

function formatForConfigurationPath(
  fallback: McpDoctorConfigFormat,
  configurationPath: string
): McpDoctorConfigFormat {
  return fallback === "jsonc" && configurationPath.toLowerCase().endsWith(".json") ? "json" : fallback;
}

function conventionalConfigurationPath(
  expected: McpConfigResult,
  homeDirectory: string,
  environment: Readonly<NodeJS.ProcessEnv>
): string {
  switch (expected.target) {
    case "codex":
      return join(homeDirectory, ".codex", "config.toml");
    case "claude":
      return expected.location === "global" ? join(homeDirectory, ".claude.json") : expected.destination.path;
    case "cursor":
      return expected.location === "global"
        ? join(homeDirectory, ".cursor", "mcp.json")
        : expected.destination.path;
    case "opencode":
      return expected.location === "global"
        ? join(nonEmptyEnvironment(environment, "XDG_CONFIG_HOME") ?? join(homeDirectory, ".config"), "opencode", "opencode.jsonc")
        : expected.destination.path;
    case "gemini":
      return expected.location === "global"
        ? join(homeDirectory, ".gemini", "settings.json")
        : expected.destination.path;
    case "kiro":
      return expected.location === "global"
        ? join(homeDirectory, ".kiro", "settings", "mcp.json")
        : expected.destination.path;
    case "hermes":
      return join(nonEmptyEnvironment(environment, "HERMES_HOME") ?? join(homeDirectory, ".hermes"), "config.yaml");
    case "antigravity":
    case "generic-json":
      throw new Error(`No conventional fixed configuration path is available for target "${expected.target}".`);
  }
}

function inspectConfiguration(
  expected: McpConfigResult,
  selected: SelectedConfiguration,
  fileSystem: McpDoctorFileSystem
): ConfigurationInspection {
  if (selected.path === null || selected.format === null) {
    return {
      status: "not-applicable",
      diagnostics: ["No Agent-specific configuration path is known for this target."]
    };
  }
  if (!fileSystem.exists(selected.path)) {
    return {
      status: "missing",
      diagnostics: [`No configuration file exists at the selected path.`]
    };
  }

  let text: string;
  try {
    text = fileSystem.readText(selected.path);
  } catch {
    return {
      status: "unreadable",
      diagnostics: ["The selected configuration file exists but could not be read."]
    };
  }

  try {
    switch (expected.target) {
      case "codex":
        return inspectCodexToml(text, expected.server);
      case "opencode":
        return inspectOpenCodeJsonc(text, expected.server);
      case "hermes":
        return inspectHermesYaml(text, expected.server);
      case "claude":
      case "cursor":
      case "gemini":
      case "kiro":
        return inspectStandardJson(text, expected.server);
      case "antigravity":
      case "generic-json":
        return inspectCommandArgsJson(text, expected.server);
    }
  } catch {
    return {
      status: "invalid",
      diagnostics: [`The selected configuration file could not be parsed as ${selected.format.toUpperCase()}.`]
    };
  }
}

function inspectStandardJson(text: string, expected: McpConfigResult["server"]): ConfigurationInspection {
  const root = requireRecord(JSON.parse(text));
  const mcpServers = root.mcpServers;
  if (!isRecord(mcpServers)) {
    return notConfigured("mcpServers");
  }
  const server = mcpServers[expected.name];
  if (!isRecord(server)) {
    return notConfigured(`mcpServers.${expected.name}`);
  }
  return compareServer(server, expected, { type: "stdio" });
}

function inspectCommandArgsJson(text: string, expected: McpConfigResult["server"]): ConfigurationInspection {
  const root = requireRecord(JSON.parse(text));
  const mcpServers = root.mcpServers;
  if (!isRecord(mcpServers)) {
    return notConfigured("mcpServers");
  }
  const server = mcpServers[expected.name];
  if (!isRecord(server)) {
    return notConfigured(`mcpServers.${expected.name}`);
  }
  return compareServer(server, expected);
}

function inspectOpenCodeJsonc(text: string, expected: McpConfigResult["server"]): ConfigurationInspection {
  const root = requireRecord(JSON.parse(stripJsonc(text)));
  const mcp = root.mcp;
  if (!isRecord(mcp)) {
    return notConfigured("mcp");
  }
  const server = mcp[expected.name];
  if (!isRecord(server)) {
    return notConfigured(`mcp.${expected.name}`);
  }
  const expectedCommand = [expected.command, ...expected.args];
  const mismatches = [
    ...(server.type === "local" ? [] : ["type"]),
    ...(sameStringArray(server.command, expectedCommand) ? [] : ["command"]),
    ...(server.enabled === true ? [] : ["enabled"])
  ];
  return mismatches.length === 0 ? matches() : different(mismatches);
}

function inspectHermesYaml(text: string, expected: McpConfigResult["server"]): ConfigurationInspection {
  const root = requireRecord(parseYaml(text));
  const mcpServers = root.mcp_servers;
  if (!isRecord(mcpServers)) {
    return notConfigured("mcp_servers");
  }
  const server = mcpServers.SymbolLattice;
  if (!isRecord(server)) {
    return notConfigured("mcp_servers.SymbolLattice");
  }
  const toolsets = isRecord(root.platform_toolsets) ? root.platform_toolsets.cli : undefined;
  const mismatches = [
    ...(server.command === expected.command ? [] : ["command"]),
    ...(sameStringArray(server.args, expected.args) ? [] : ["args"]),
    ...(server.timeout === 120 ? [] : ["timeout"]),
    ...(server.connect_timeout === 60 ? [] : ["connect_timeout"]),
    ...(server.enabled === true ? [] : ["enabled"]),
    ...(Array.isArray(toolsets) && toolsets.includes("mcp-SymbolLattice") ? [] : ["platform_toolsets.cli"])
  ];
  return mismatches.length === 0 ? matches() : different(mismatches);
}

function inspectCodexToml(text: string, expected: McpConfigResult["server"]): ConfigurationInspection {
  const section = extractTomlSection(text, "mcp_servers.SymbolLattice");
  if (section === null) {
    return notConfigured("mcp_servers.SymbolLattice");
  }
  const command = readTomlAssignment(section, "command");
  const args = readTomlAssignment(section, "args");
  if (command === undefined || args === undefined) {
    return different(["command", "args"]);
  }
  const parsedCommand = parseTomlString(command);
  const parsedArgs = parseTomlStringArray(args);
  const mismatches = [
    ...(parsedCommand === expected.command ? [] : ["command"]),
    ...(sameStringArray(parsedArgs, expected.args) ? [] : ["args"])
  ];
  return mismatches.length === 0 ? matches() : different(mismatches);
}

function compareServer(
  server: Record<string, unknown>,
  expected: McpConfigResult["server"],
  required: { readonly type?: string } = {}
): ConfigurationInspection {
  const mismatches = [
    ...(required.type === undefined || server.type === required.type ? [] : ["type"]),
    ...(server.command === expected.command ? [] : ["command"]),
    ...(sameStringArray(server.args, expected.args) ? [] : ["args"])
  ];
  return mismatches.length === 0 ? matches() : different(mismatches);
}

function extractTomlSection(text: string, sectionName: string): readonly string[] | null {
  const lines = text.split(/\r\n|\r|\n/u);
  const linesInSection: string[] = [];
  let active = false;
  for (const line of lines) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
    if (header?.[1] !== undefined) {
      if (active) {
        break;
      }
      active = header[1].trim() === sectionName;
      continue;
    }
    if (active) {
      linesInSection.push(line);
    }
  }
  return active || linesInSection.length > 0 ? linesInSection : null;
}

function readTomlAssignment(lines: readonly string[], name: "command" | "args"): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = removeTomlComment(lines[index] ?? "");
    const match = new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "u").exec(line);
    if (match?.[1] === undefined) {
      continue;
    }
    let value = match[1];
    if (name === "command" || tomlArrayIsComplete(value)) {
      return value;
    }
    for (index += 1; index < lines.length; index += 1) {
      value += `\n${removeTomlComment(lines[index] ?? "")}`;
      if (tomlArrayIsComplete(value)) {
        return value;
      }
    }
    return value;
  }
  return undefined;
}

function tomlArrayIsComplete(value: string): boolean {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let opened = false;
  for (const character of value) {
    if (quote !== null) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[") {
      depth += 1;
      opened = true;
    } else if (character === "]") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return opened && depth === 0 && quote === null;
}

function parseTomlString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "string") {
      throw new Error("Expected a TOML string.");
    }
    return parsed;
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  throw new Error("Expected a TOML basic or literal string.");
}

function parseTomlStringArray(value: string): readonly string[] {
  let index = 0;
  const items: string[] = [];
  const skipWhitespace = (): void => {
    while (/\s/u.test(value[index] ?? "")) {
      index += 1;
    }
  };
  skipWhitespace();
  if (value[index] !== "[") {
    throw new Error("Expected a TOML array.");
  }
  index += 1;
  while (true) {
    skipWhitespace();
    if (value[index] === "]") {
      return items;
    }
    const quote = value[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error("Expected a TOML string array item.");
    }
    const start = index;
    index += 1;
    let escaped = false;
    while (index < value.length) {
      const character = value[index];
      if (character === undefined) {
        break;
      }
      index += 1;
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === "\\") {
        escaped = true;
      } else if (character === quote) {
        break;
      }
    }
    const token = value.slice(start, index);
    if (!token.endsWith(quote)) {
      throw new Error("Unterminated TOML string array item.");
    }
    items.push(quote === '"' ? parseTomlString(token) : token.slice(1, -1));
    skipWhitespace();
    if (value[index] === ",") {
      index += 1;
      continue;
    }
    if (value[index] === "]") {
      return items;
    }
    throw new Error("Expected a comma or closing bracket in the TOML array.");
  }
}

function removeTomlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === undefined) {
      continue;
    }
    if (quote !== null) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function stripJsonc(text: string): string {
  const withoutComments: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === undefined) {
      continue;
    }
    if (inString) {
      withoutComments.push(character);
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      withoutComments.push(character);
      continue;
    }
    if (character === "/" && next === "/") {
      index += 1;
      while (index + 1 < text.length && text[index + 1] !== "\n" && text[index + 1] !== "\r") {
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      index += 1;
      let closed = false;
      while (index + 1 < text.length) {
        index += 1;
        const commentCharacter = text[index];
        const commentNext = text[index + 1];
        if (commentCharacter === "\n" || commentCharacter === "\r") {
          withoutComments.push(commentCharacter);
        }
        if (commentCharacter === "*" && commentNext === "/") {
          index += 1;
          closed = true;
          break;
        }
      }
      if (!closed) {
        throw new Error("Unterminated JSONC block comment.");
      }
      continue;
    }
    withoutComments.push(character);
  }

  const result: string[] = [];
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (character === undefined) {
      continue;
    }
    if (inString) {
      result.push(character);
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result.push(character);
      continue;
    }
    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/u.test(withoutComments[nextIndex] ?? "")) {
        nextIndex += 1;
      }
      if (withoutComments[nextIndex] === "}" || withoutComments[nextIndex] === "]") {
        continue;
      }
    }
    result.push(character);
  }
  return result.join("");
}

function inspectRuntime(
  server: McpConfigResult["server"],
  commandArgs: readonly string[] | undefined,
  fileSystem: McpDoctorFileSystem,
  environment: Readonly<NodeJS.ProcessEnv>,
  platform: NodeJS.Platform
): McpDoctorResult["runtime"] {
  const resolvedPath = findExecutable(server.command, fileSystem, environment, platform);
  const sourceEntrypoint = commandArgs?.[0];
  return {
    command: server.command,
    status: resolvedPath === null ? "missing" : "available",
    resolvedPath,
    ...(sourceEntrypoint === undefined
      ? {}
      : {
          sourceEntrypoint: {
            path: sourceEntrypoint,
            status: fileSystem.exists(sourceEntrypoint) ? "present" : "missing"
          }
        })
  };
}

function findExecutable(
  command: string,
  fileSystem: McpDoctorFileSystem,
  environment: Readonly<NodeJS.ProcessEnv>,
  platform: NodeJS.Platform
): string | null {
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    const candidate = resolve(command);
    return fileSystem.exists(candidate) ? candidate : null;
  }

  const pathValue = nonEmptyEnvironment(environment, "PATH") ?? nonEmptyEnvironment(environment, "Path");
  if (pathValue === undefined) {
    return null;
  }
  const suffixes = executableSuffixes(environment, platform);
  for (const directory of pathValue.split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    for (const suffix of suffixes) {
      const candidate = join(directory, `${command}${suffix}`);
      if (fileSystem.exists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function executableSuffixes(environment: Readonly<NodeJS.ProcessEnv>, platform: NodeJS.Platform): readonly string[] {
  if (platform !== "win32") {
    return [""];
  }
  const configured = nonEmptyEnvironment(environment, "PATHEXT")?.split(";").filter((value) => value.length > 0) ?? [
    ".COM",
    ".EXE",
    ".BAT",
    ".CMD"
  ];
  return ["", ...configured];
}

function nonEmptyEnvironment(environment: Readonly<NodeJS.ProcessEnv>, name: string): string | undefined {
  const value = environment[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected a configuration object.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => typeof item === "string" && item === expected[index])
  );
}

function matches(): ConfigurationInspection {
  return { status: "matches", diagnostics: ["The selected configuration contains the expected SymbolLattice entry."] };
}

function notConfigured(entry: string): ConfigurationInspection {
  return {
    status: "not-configured",
    diagnostics: [`The selected configuration does not contain the expected ${entry} entry.`]
  };
}

function different(fields: readonly string[]): ConfigurationInspection {
  return {
    status: "different",
    diagnostics: [`The SymbolLattice entry differs in: ${fields.join(", ")}.`]
  };
}

function buildNotes(
  configurationStatus: McpDoctorConfigurationStatus,
  runtime: McpDoctorResult["runtime"],
  indexStatus: McpDoctorIndexStatus
): readonly string[] {
  const notes = ["This diagnosis is read-only: it never executes the MCP command or writes an Agent configuration or index."];
  if (configurationStatus !== "matches") {
    notes.push("Run mcp-config for the target to generate the expected entry, then update the Agent configuration yourself.");
  }
  if (runtime.status === "missing") {
    notes.push("The configured MCP command was not found through its explicit path or the current PATH.");
  }
  if (runtime.sourceEntrypoint?.status === "missing") {
    notes.push("The source-built CLI entrypoint recorded by --source no longer exists.");
  }
  if (indexStatus === "missing") {
    notes.push(
      "No project index database exists yet; installed agent guidance directs code-capable agents to run init automatically when they begin code work in this recognized software repository."
    );
  }
  return notes;
}

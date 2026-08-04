import { isAbsolute, join } from "node:path";

/** Agent-specific MCP configuration formats that SymbolLattice can render without writing a file. */
export const MCP_CONFIG_TARGETS = [
  "codex",
  "claude",
  "cursor",
  "opencode",
  "gemini",
  "kiro",
  "hermes",
  "antigravity",
  "generic-json"
] as const;

export const MCP_CONFIG_LOCATIONS = ["global", "local"] as const;

export type McpConfigTarget = (typeof MCP_CONFIG_TARGETS)[number];
export type McpConfigLocation = (typeof MCP_CONFIG_LOCATIONS)[number];
type McpConfigScope = McpConfigLocation | "not-applicable";
type McpConfigFormat = "toml" | "json" | "jsonc" | "yaml";

/** Options mirrored from `serve --mcp` so generated configuration is executable as-is. */
export interface McpConfigOptions {
  readonly projectPath: string;
  /** Target configuration scope. When omitted, each target chooses its safest supported default. */
  readonly location?: string;
  /** Overrides the PATH-based `symbol-lattice` executable for a source checkout. */
  readonly command?: string;
  /** Prepended after `command`, before the generated `serve --mcp` arguments. */
  readonly commandArgs?: readonly string[];
  readonly force?: boolean;
  readonly autoSync?: boolean;
  readonly diagnosticJournal?: boolean;
  readonly syncIntervalMs?: number;
  readonly poll?: boolean;
  /** Explicit absolute module paths forwarded to `serve --mcp`; no discovery occurs. */
  readonly pluginModulePaths?: readonly string[];
  readonly allowExternalPluginModules?: boolean;
}

export interface McpConfigResult {
  readonly target: McpConfigTarget;
  readonly location: McpConfigScope;
  readonly destination: {
    readonly path: string;
    readonly format: McpConfigFormat;
    readonly entry: string;
    readonly scope: McpConfigScope;
    /** Other valid locations when the Agent chooses between migrated configuration files. */
    readonly alternativePaths?: readonly string[];
    /** Deterministic manual selection guidance when this output intentionally does not inspect disk. */
    readonly selection?: string;
  };
  readonly server: {
    readonly name: "symbol-lattice";
    readonly command: string;
    readonly args: readonly string[];
  };
  readonly lifecycle: {
    readonly mcpRequestHandlers: "read-only";
    readonly autoSync: {
      readonly enabled: boolean;
      readonly projectIndexMayBeWritten: boolean;
      readonly diagnosticJournalMayBeWritten: boolean;
      readonly disableFlag: "--no-auto-sync";
    };
    readonly plugins: {
      readonly modulePaths: readonly string[];
      readonly executesTrustedCode: boolean;
      readonly externalModulesAllowed: boolean;
    };
  };
  readonly snippet: string;
  readonly notes: readonly string[];
}

type McpServer = McpConfigResult["server"];

interface McpConfigRenderContext {
  readonly target: McpConfigTarget;
  readonly location: McpConfigScope;
  readonly projectPath: string;
  readonly projectArgument: string;
  readonly server: McpServer;
}

interface McpConfigTargetDefinition {
  readonly defaultLocation: McpConfigScope;
  readonly locations: readonly McpConfigLocation[];
  readonly destination: (context: McpConfigRenderContext) => McpConfigResult["destination"];
  readonly render: (context: McpConfigRenderContext) => string;
  readonly notes?: (context: McpConfigRenderContext) => readonly string[];
  readonly projectArgument?: (location: McpConfigScope, projectPath: string) => string;
}

const JSON_SERVER_KEY = "symbol-lattice";
const TOML_SERVER_KEY = "symbol_lattice";
const YAML_SERVER_KEY = "symbol_lattice";
const MAX_PLUGIN_MODULES = 16;

/**
 * Data-only target registry. Adding a target is confined to one entry: supported
 * scopes, the destination the user must edit, and its format-specific renderer.
 * None of these entries detect, read, or write Agent configuration files.
 */
const MCP_CONFIG_TARGET_REGISTRY: Readonly<Record<McpConfigTarget, McpConfigTargetDefinition>> = Object.freeze({
  codex: {
    defaultLocation: "global",
    locations: ["global"],
    destination: () => destination("~/.codex/config.toml", "toml", `mcp_servers.${TOML_SERVER_KEY}`, "global"),
    render: ({ server }) => renderCodexToml(server)
  },
  claude: {
    defaultLocation: "local",
    locations: ["global", "local"],
    destination: ({ location, projectPath }) =>
      destination(
        location === "global" ? "~/.claude.json" : join(projectPath, ".mcp.json"),
        "json",
        `mcpServers.${JSON_SERVER_KEY}`,
        location
      ),
    render: ({ server }) => renderStandardJson(server)
  },
  cursor: {
    defaultLocation: "local",
    locations: ["global", "local"],
    destination: ({ location, projectPath }) =>
      destination(
        location === "global" ? "~/.cursor/mcp.json" : join(projectPath, ".cursor", "mcp.json"),
        "json",
        `mcpServers.${JSON_SERVER_KEY}`,
        location
      ),
    projectArgument: (location, projectPath) =>
      location === "global" ? "${workspaceFolder}" : projectPath,
    render: ({ server }) => renderStandardJson(server),
    notes: ({ location }) =>
      location === "global"
        ? ["Cursor global configuration uses ${workspaceFolder} for --project so one entry follows the opened workspace."]
        : ["Restart Cursor after adding the MCP server."]
  },
  opencode: {
    defaultLocation: "local",
    locations: ["global", "local"],
    destination: ({ location, projectPath }) =>
      destination(
        location === "global"
          ? "~/.config/opencode/opencode.jsonc"
          : join(projectPath, "opencode.jsonc"),
        "jsonc",
        `mcp.${JSON_SERVER_KEY}`,
        location,
        location === "global"
          ? {
              alternativePaths: ["~/.config/opencode/opencode.json"],
              selection: "Use opencode.jsonc when it exists or for a new configuration; use opencode.json when it is the existing configuration file."
            }
          : undefined
      ),
    render: ({ server }) => renderOpencodeJsonc(server),
    notes: ({ location }) =>
      location === "global"
        ? ["If XDG_CONFIG_HOME is set, use $XDG_CONFIG_HOME/opencode/opencode.jsonc instead of ~/.config/opencode/opencode.jsonc."]
        : []
  },
  gemini: {
    defaultLocation: "local",
    locations: ["global", "local"],
    destination: ({ location, projectPath }) =>
      destination(
        location === "global" ? "~/.gemini/settings.json" : join(projectPath, ".gemini", "settings.json"),
        "json",
        `mcpServers.${JSON_SERVER_KEY}`,
        location
      ),
    render: ({ server }) => renderStandardJson(server)
  },
  kiro: {
    defaultLocation: "local",
    locations: ["global", "local"],
    destination: ({ location, projectPath }) =>
      destination(
        location === "global" ? "~/.kiro/settings/mcp.json" : join(projectPath, ".kiro", "settings", "mcp.json"),
        "json",
        `mcpServers.${JSON_SERVER_KEY}`,
        location
      ),
    render: ({ server }) => renderStandardJson(server),
    notes: () => ["Restart Kiro after adding the MCP server. Kiro IDE users must also enable MCP in Settings."]
  },
  hermes: {
    defaultLocation: "global",
    locations: ["global"],
    destination: () =>
      destination("$HERMES_HOME/config.yaml", "yaml", `mcp_servers.${YAML_SERVER_KEY}`, "global"),
    render: ({ server }) => renderHermesYaml(server),
    notes: () => [
      "$HERMES_HOME defaults to ~/.hermes when it is not set.",
      "Start a new Hermes session after adding the MCP server."
    ]
  },
  antigravity: {
    defaultLocation: "global",
    locations: ["global"],
    destination: () =>
      destination("~/.gemini/config/mcp_config.json", "json", `mcpServers.${JSON_SERVER_KEY}`, "global", {
        alternativePaths: ["~/.gemini/antigravity/mcp_config.json"],
        selection: "Use the unified path when ~/.gemini/config/.migrated or the unified config exists; otherwise use the legacy path."
      }),
    render: ({ server }) => renderAntigravityJson(server),
    notes: () => [
      "Antigravity selects its active config through its migration state; inspect destination.selection before editing either listed path.",
      "Restart Antigravity after adding the MCP server."
    ]
  },
  "generic-json": {
    defaultLocation: "not-applicable",
    locations: [],
    destination: () =>
      destination("your MCP-compatible JSON configuration", "json", `mcpServers.${JSON_SERVER_KEY}`, "not-applicable"),
    render: ({ server }) => renderGenericJson(server)
  }
});

/** Parses one supported output target without reading or writing an Agent configuration. */
export function parseMcpConfigTarget(value: string): McpConfigTarget {
  if (!MCP_CONFIG_TARGETS.includes(value as McpConfigTarget)) {
    throw new Error(`Expected one of: ${MCP_CONFIG_TARGETS.join(", ")}; received "${value}".`);
  }
  return value as McpConfigTarget;
}

/** Parses a supported Agent configuration scope. */
export function parseMcpConfigLocation(value: string): McpConfigLocation {
  if (!MCP_CONFIG_LOCATIONS.includes(value as McpConfigLocation)) {
    throw new Error(`Expected one of: ${MCP_CONFIG_LOCATIONS.join(", ")}; received "${value}".`);
  }
  return value as McpConfigLocation;
}

/**
 * Produces a copy-and-paste MCP entry. This deliberately never detects, edits,
 * or otherwise touches a target Agent's configuration file.
 */
export function createMcpConfig(targetInput: string, options: McpConfigOptions): McpConfigResult {
  const target = parseMcpConfigTarget(targetInput);
  const definition = MCP_CONFIG_TARGET_REGISTRY[target];
  const location = resolveTargetLocation(target, definition, options.location);
  const projectPath = requireProjectPath(options.projectPath);
  const autoSync = options.autoSync ?? true;
  const diagnosticJournal = options.diagnosticJournal ?? true;
  const command = requireCommand(options.command ?? "symbol-lattice");
  const commandArgs = options.commandArgs ?? [];
  const pluginModulePaths = normalizePluginModulePaths(options);
  const projectArgument = definition.projectArgument?.(location, projectPath) ?? projectPath;
  const server = {
    name: "symbol-lattice" as const,
    command,
    args: [
      ...commandArgs,
      ...buildServeArgs({
        ...options,
        projectPath: projectArgument,
        autoSync,
        diagnosticJournal,
        pluginModulePaths
      })
    ]
  };
  const context: McpConfigRenderContext = {
    target,
    location,
    projectPath,
    projectArgument,
    server
  };

  return {
    target,
    location,
    destination: definition.destination(context),
    server,
    lifecycle: {
      mcpRequestHandlers: "read-only",
      autoSync: {
        enabled: autoSync,
        projectIndexMayBeWritten: autoSync,
        diagnosticJournalMayBeWritten: autoSync && diagnosticJournal,
        disableFlag: "--no-auto-sync"
      },
      plugins: {
        modulePaths: pluginModulePaths,
        executesTrustedCode: autoSync && pluginModulePaths.length > 0,
        externalModulesAllowed: options.allowExternalPluginModules ?? false
      }
    },
    snippet: definition.render(context),
    notes: [
      ...configurationNotes(
        autoSync,
        diagnosticJournal,
        options.force ?? false,
        commandArgs.length > 0,
        pluginModulePaths.length
      ),
      ...(definition.notes?.(context) ?? [])
    ]
  };
}

function destination(
  path: string,
  format: McpConfigFormat,
  entry: string,
  scope: McpConfigScope,
  options?: Pick<McpConfigResult["destination"], "alternativePaths" | "selection">
): McpConfigResult["destination"] {
  return { path, format, entry, scope, ...options };
}

function resolveTargetLocation(
  target: McpConfigTarget,
  definition: McpConfigTargetDefinition,
  requested: string | undefined
): McpConfigScope {
  if (definition.locations.length === 0) {
    if (requested !== undefined) {
      throw new Error(`Target "${target}" does not use an Agent configuration location.`);
    }
    return "not-applicable";
  }

  const location = requested === undefined ? definition.defaultLocation : parseMcpConfigLocation(requested);
  if (location === "not-applicable" || !definition.locations.includes(location)) {
    const supported = definition.locations.join(" or ");
    throw new Error(`Target "${target}" does not support "${String(location)}" configuration; use --location ${supported}.`);
  }
  return location;
}

function requireProjectPath(value: string): string {
  if (value.trim().length === 0) {
    throw new Error("Expected a non-empty project path for the generated MCP server.");
  }
  return value;
}

function requireCommand(value: string): string {
  if (value.trim().length === 0) {
    throw new Error("Expected a non-empty MCP server command.");
  }
  return value;
}

function normalizePluginModulePaths(options: McpConfigOptions): readonly string[] {
  const modulePaths = options.pluginModulePaths ?? [];
  if (!Array.isArray(modulePaths) || modulePaths.length > MAX_PLUGIN_MODULES) {
    throw new Error(`Expected at most ${MAX_PLUGIN_MODULES} explicit plugin module paths.`);
  }
  const normalized = modulePaths.map((modulePath) => {
    if (typeof modulePath !== "string" || modulePath.trim().length === 0 || !isAbsolute(modulePath)) {
      throw new Error("Generated MCP plugin module paths must be non-empty absolute paths.");
    }
    return modulePath;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Generated MCP plugin module paths must not contain duplicates.");
  }
  if (options.allowExternalPluginModules === true && normalized.length === 0) {
    throw new Error("External plugin permission requires at least one explicit plugin module path.");
  }
  return Object.freeze(normalized);
}

function buildServeArgs(options: Required<Pick<McpConfigOptions, "projectPath">> & McpConfigOptions): string[] {
  const args = ["serve", "--mcp", "--project", options.projectPath];
  if (options.force === true) {
    args.push("--force");
  }
  if (options.autoSync === false) {
    args.push("--no-auto-sync");
  }
  if (options.diagnosticJournal === false) {
    args.push("--no-diagnostic-journal");
  }
  if (options.syncIntervalMs !== undefined) {
    args.push("--sync-interval", String(options.syncIntervalMs));
  }
  if (options.poll === true) {
    args.push("--poll");
  }
  for (const modulePath of options.pluginModulePaths ?? []) {
    args.push("--plugin", modulePath);
  }
  if (options.allowExternalPluginModules === true) {
    args.push("--allow-external-plugin");
  }
  return args;
}

function renderCodexToml(server: McpServer): string {
  const args = server.args.map((argument) => JSON.stringify(argument)).join(", ");
  return [
    `[mcp_servers.${TOML_SERVER_KEY}]`,
    `command = ${JSON.stringify(server.command)}`,
    `args = [${args}]`
  ].join("\n");
}

function renderStandardJson(server: McpServer): string {
  return JSON.stringify(
    {
      mcpServers: {
        [JSON_SERVER_KEY]: {
          type: "stdio",
          command: server.command,
          args: server.args
        }
      }
    },
    null,
    2
  );
}

function renderOpencodeJsonc(server: McpServer): string {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        [JSON_SERVER_KEY]: {
          type: "local",
          command: [server.command, ...server.args],
          enabled: true
        }
      }
    },
    null,
    2
  );
}

function renderAntigravityJson(server: McpServer): string {
  return JSON.stringify(
    {
      mcpServers: {
        [JSON_SERVER_KEY]: {
          command: server.command,
          args: server.args
        }
      }
    },
    null,
    2
  );
}

function renderGenericJson(server: McpServer): string {
  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: {
          command: server.command,
          args: server.args
        }
      }
    },
    null,
    2
  );
}

function renderHermesYaml(server: McpServer): string {
  const command = yamlString(server.command);
  const args = server.args.map((argument) => `      - ${yamlString(argument)}`);
  return [
    "mcp_servers:",
    `  ${YAML_SERVER_KEY}:`,
    `    command: ${command}`,
    "    args:",
    ...args,
    "    timeout: 120",
    "    connect_timeout: 60",
    "    enabled: true",
    "",
    "platform_toolsets:",
    "  cli:",
    "    - hermes-cli",
    "    - mcp-symbol-lattice"
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function configurationNotes(
  autoSync: boolean,
  diagnosticJournal: boolean,
  force: boolean,
  sourceEntrypointIncluded: boolean,
  pluginModuleCount: number
): readonly string[] {
  const notes = [
    "This command only generates configuration; it does not modify an Agent configuration file.",
    "MCP request handlers are read-only."
  ];
  if (autoSync) {
    notes.push(
      "A separate local watcher can update the project-local .symbol-lattice index; add --no-auto-sync to opt out."
    );
  } else {
    notes.push("Auto-sync is disabled; run symbol-lattice sync explicitly when the graph needs refreshing.");
  }
  if (autoSync && diagnosticJournal) {
    notes.push("Auto-sync diagnostic receipts can be stored in the project-local index.");
  }
  if (force) {
    notes.push("The generated --force flag permits background sync for a filesystem root or home-directory project.");
  }
  if (sourceEntrypointIncluded) {
    notes.push("This configuration invokes a fixed local entrypoint; regenerate it after moving the checkout or changing the Node runtime.");
  }
  if (pluginModuleCount > 0) {
    notes.push(
      autoSync
        ? "Explicit plugin modules execute trusted JavaScript in the MCP host for indexing; inspect every path before installing."
        : "Plugin modules are configured but are not executed while MCP auto-sync is disabled."
    );
  }
  return notes;
}

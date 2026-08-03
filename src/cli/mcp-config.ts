/** Supported non-mutating MCP configuration output formats. */
export const MCP_CONFIG_TARGETS = ["codex", "generic-json"] as const;

export type McpConfigTarget = (typeof MCP_CONFIG_TARGETS)[number];

/** Options mirrored from `serve --mcp` so generated configuration is executable as-is. */
export interface McpConfigOptions {
  readonly projectPath: string;
  /** Overrides the PATH-based `symbol-lattice` executable for a source checkout. */
  readonly command?: string;
  /** Prepended after `command`, before the generated `serve --mcp` arguments. */
  readonly commandArgs?: readonly string[];
  readonly force?: boolean;
  readonly autoSync?: boolean;
  readonly diagnosticJournal?: boolean;
  readonly syncIntervalMs?: number;
  readonly poll?: boolean;
}

export interface McpConfigResult {
  readonly target: McpConfigTarget;
  readonly destination: {
    readonly path: string;
    readonly format: "toml" | "json";
    readonly entry: string;
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
  };
  readonly snippet: string;
  readonly notes: readonly string[];
}

/** Parses one supported output target without reading or writing an agent configuration. */
export function parseMcpConfigTarget(value: string): McpConfigTarget {
  if (!MCP_CONFIG_TARGETS.includes(value as McpConfigTarget)) {
    throw new Error(`Expected one of: ${MCP_CONFIG_TARGETS.join(", ")}; received "${value}".`);
  }
  return value as McpConfigTarget;
}

/**
 * Produces a copy-and-paste MCP entry. This deliberately never detects, edits,
 * or otherwise touches a target agent's configuration file.
 */
export function createMcpConfig(targetInput: string, options: McpConfigOptions): McpConfigResult {
  const target = parseMcpConfigTarget(targetInput);
  const projectPath = requireProjectPath(options.projectPath);
  const autoSync = options.autoSync ?? true;
  const diagnosticJournal = options.diagnosticJournal ?? true;
  const command = requireCommand(options.command ?? "symbol-lattice");
  const commandArgs = options.commandArgs ?? [];
  const args = [
    ...commandArgs,
    ...buildServeArgs({ ...options, projectPath, autoSync, diagnosticJournal })
  ];
  const server = {
    name: "symbol-lattice" as const,
    command,
    args
  };
  const destination = target === "codex"
    ? {
        path: "~/.codex/config.toml",
        format: "toml" as const,
        entry: "mcp_servers.symbol_lattice"
      }
    : {
        path: "your MCP-compatible JSON configuration",
        format: "json" as const,
        entry: "mcpServers.symbol-lattice"
      };

  return {
    target,
    destination,
    server,
    lifecycle: {
      mcpRequestHandlers: "read-only",
      autoSync: {
        enabled: autoSync,
        projectIndexMayBeWritten: autoSync,
        diagnosticJournalMayBeWritten: autoSync && diagnosticJournal,
        disableFlag: "--no-auto-sync"
      }
    },
    snippet: target === "codex" ? renderCodexToml(server) : renderGenericJson(server),
    notes: configurationNotes(
      autoSync,
      diagnosticJournal,
      options.force ?? false,
      commandArgs.length > 0
    )
  };
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
  return args;
}

function renderCodexToml(server: McpConfigResult["server"]): string {
  const args = server.args.map((argument) => JSON.stringify(argument)).join(", ");
  return [
    "[mcp_servers.symbol_lattice]",
    `command = ${JSON.stringify(server.command)}`,
    `args = [${args}]`
  ].join("\n");
}

function renderGenericJson(server: McpConfigResult["server"]): string {
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

function configurationNotes(
  autoSync: boolean,
  diagnosticJournal: boolean,
  force: boolean,
  sourceEntrypointIncluded: boolean
): readonly string[] {
  const notes = [
    "This command only generates configuration; it does not modify an agent configuration file.",
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
  return notes;
}

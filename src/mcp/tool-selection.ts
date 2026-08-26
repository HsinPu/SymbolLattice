export const SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE = "SYMBOL_LATTICE_MCP_TOOLS" as const;

export const ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES = [
  "explore",
  "query_pool_status",
  "auto_sync_status",
  "auto_sync_diagnostics",
  "auto_sync_journal",
  "diagnostics",
  "node",
  "context",
  "affected",
  "affected_git",
  "git_hunks",
  "search",
  "investigate",
  "impact",
  "files",
  "file",
  "routes",
  "entrypoints",
  "hierarchy",
  "history",
  "diff",
  "explain_edge"
] as const;

export type SymbolLatticeMcpToolName = (typeof ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES)[number];

const supportedToolNames = new Set<string>(ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES);

export function resolveMcpToolSelection(value: string | undefined): ReadonlySet<SymbolLatticeMcpToolName> {
  if (value === undefined || value.trim().length === 0) {
    return new Set<SymbolLatticeMcpToolName>(["explore"]);
  }

  const requested = value
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  if (requested.includes("all")) {
    if (requested.length !== 1) {
      throw new Error(
        `${SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE}=all cannot be combined with other tools.`
      );
    }
    return new Set(ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES);
  }

  const unsupported = [...new Set(requested.filter((name) => !supportedToolNames.has(name)))].sort();
  if (unsupported.length > 0) {
    throw new Error(
      `${SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE} contains unsupported tools: ${unsupported.join(", ")}.`
    );
  }

  const selected = new Set<string>(["explore", ...requested]);
  return new Set(
    ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES.filter((name) => selected.has(name))
  );
}

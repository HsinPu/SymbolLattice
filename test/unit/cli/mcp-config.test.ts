import { describe, expect, it } from "vitest";

import {
  createMcpConfig,
  parseMcpConfigTarget
} from "../../../src/cli/mcp-config.js";

describe("MCP configuration generator", () => {
  it("renders a Codex TOML entry with an explicit project and the default auto-sync boundary", () => {
    const result = createMcpConfig("codex", { projectPath: "C:/projects/example" });

    expect(result).toMatchObject({
      target: "codex",
      destination: {
        path: "~/.codex/config.toml",
        format: "toml",
        entry: "mcp_servers.symbol_lattice"
      },
      server: {
        name: "symbol-lattice",
        command: "symbol-lattice",
        args: ["serve", "--mcp", "--project", "C:/projects/example"]
      },
      lifecycle: {
        mcpRequestHandlers: "read-only",
        autoSync: {
          enabled: true,
          projectIndexMayBeWritten: true,
          diagnosticJournalMayBeWritten: true,
          disableFlag: "--no-auto-sync"
        }
      }
    });
    expect(result.snippet).toBe(
      '[mcp_servers.symbol_lattice]\ncommand = "symbol-lattice"\nargs = ["serve", "--mcp", "--project", "C:/projects/example"]'
    );
    expect(result.notes).toContain(
      "A separate local watcher can update the project-local .symbol-lattice index; add --no-auto-sync to opt out."
    );
  });

  it("renders generic JSON with every explicit serve control and no write-capable auto-sync", () => {
    const result = createMcpConfig("generic-json", {
      projectPath: "/workspace/example",
      force: true,
      autoSync: false,
      diagnosticJournal: false,
      syncIntervalMs: 750,
      poll: true
    });

    expect(JSON.parse(result.snippet)).toEqual({
      mcpServers: {
        "symbol-lattice": {
          command: "symbol-lattice",
          args: [
            "serve",
            "--mcp",
            "--project",
            "/workspace/example",
            "--force",
            "--no-auto-sync",
            "--no-diagnostic-journal",
            "--sync-interval",
            "750",
            "--poll"
          ]
        }
      }
    });
    expect(result.lifecycle.autoSync).toEqual({
      enabled: false,
      projectIndexMayBeWritten: false,
      diagnosticJournalMayBeWritten: false,
      disableFlag: "--no-auto-sync"
    });
    expect(result.notes).toContain(
      "Auto-sync is disabled; run symbol-lattice sync explicitly when the graph needs refreshing."
    );
  });

  it("can pin a source-built CLI entrypoint instead of relying on a PATH command", () => {
    const result = createMcpConfig("codex", {
      projectPath: "/workspace/example",
      command: "node",
      commandArgs: ["/tools/symbol-lattice/dist/cli/main.js"]
    });

    expect(result.server).toEqual({
      name: "symbol-lattice",
      command: "node",
      args: [
        "/tools/symbol-lattice/dist/cli/main.js",
        "serve",
        "--mcp",
        "--project",
        "/workspace/example"
      ]
    });
    expect(result.notes).toContain(
      "This configuration invokes a fixed local entrypoint; regenerate it after moving the checkout or changing the Node runtime."
    );
  });

  it("rejects unknown configuration targets and blank project paths", () => {
    expect(() => parseMcpConfigTarget("cursor")).toThrow(
      'Expected one of: codex, generic-json; received "cursor".'
    );
    expect(() => createMcpConfig("codex", { projectPath: "   " })).toThrow(
      "Expected a non-empty project path for the generated MCP server."
    );
    expect(() => createMcpConfig("codex", { projectPath: "/workspace", command: "   " })).toThrow(
      "Expected a non-empty MCP server command."
    );
  });
});

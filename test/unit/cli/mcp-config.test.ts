import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  createMcpConfig,
  parseMcpConfigLocation,
  parseMcpConfigTarget
} from "../../../src/cli/mcp-config.js";

describe("MCP configuration generator", () => {
  it("renders a global Codex entry that follows the MCP process working directory", () => {
    const result = createMcpConfig("codex", {
      projectPath: "C:/projects/installer-preview",
      projectBinding: "runtime-working-directory"
    });

    expect(result.server).toEqual({
      name: "SymbolLattice",
      command: "SymbolLattice",
      args: ["serve", "--mcp"]
    });
    expect(result.snippet).toBe(
      '[mcp_servers.SymbolLattice]\ncommand = "SymbolLattice"\nargs = ["serve", "--mcp"]'
    );
    expect(result.notes).toContain(
      "The Codex entry stores no fixed --project path; SymbolLattice resolves the project from the MCP process working directory."
    );
  });

  it("limits runtime working-directory project binding to global Codex configuration", () => {
    expect(() =>
      createMcpConfig("claude", {
        projectPath: "C:/projects/example",
        projectBinding: "runtime-working-directory"
      })
    ).toThrow('Project binding "runtime-working-directory" is only supported for global Codex configuration.');
  });

  it("renders a Codex TOML entry with an explicit project and the default auto-sync boundary", () => {
    const result = createMcpConfig("codex", { projectPath: "C:/projects/example" });

    expect(result).toMatchObject({
      target: "codex",
      location: "global",
      destination: {
        path: "~/.codex/config.toml",
        format: "toml",
        entry: "mcp_servers.SymbolLattice",
        scope: "global"
      },
      server: {
        name: "SymbolLattice",
        command: "SymbolLattice",
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
      '[mcp_servers.SymbolLattice]\ncommand = "SymbolLattice"\nargs = ["serve", "--mcp", "--project", "C:/projects/example"]'
    );
    expect(result.notes).toContain(
      "A separate local watcher can update the project-local .SymbolLattice index; add --no-auto-sync to opt out."
    );
  });

  it("uses project-local standard JSON by default for Claude and includes the stdio transport", () => {
    const result = createMcpConfig("claude", { projectPath: "C:/projects/example" });

    expect(result).toMatchObject({
      target: "claude",
      location: "local",
      destination: {
        path: join("C:/projects/example", ".mcp.json"),
        format: "json",
        entry: "mcpServers.SymbolLattice",
        scope: "local"
      }
    });
    expect(JSON.parse(result.snippet)).toEqual({
      mcpServers: {
        "SymbolLattice": {
          type: "stdio",
          command: "SymbolLattice",
          args: ["serve", "--mcp", "--project", "C:/projects/example"]
        }
      }
    });
  });

  it("uses Cursor's workspace variable for an explicitly global configuration", () => {
    const result = createMcpConfig("cursor", {
      projectPath: "C:/projects/example",
      location: "global"
    });

    expect(result).toMatchObject({
      target: "cursor",
      location: "global",
      destination: {
        path: "~/.cursor/mcp.json",
        format: "json",
        scope: "global"
      },
      server: {
        args: ["serve", "--mcp", "--project", "${workspaceFolder}"]
      }
    });
    expect(result.notes).toContain(
      "Cursor global configuration uses ${workspaceFolder} for --project so one entry follows the opened workspace."
    );
  });

  it("renders OpenCode's local JSONC entry with a local command array", () => {
    const result = createMcpConfig("opencode", { projectPath: "/workspace/example" });

    expect(result).toMatchObject({
      target: "opencode",
      location: "local",
      destination: {
        path: join("/workspace/example", "opencode.jsonc"),
        format: "jsonc",
        entry: "mcp.SymbolLattice",
        scope: "local"
      }
    });
    expect(JSON.parse(result.snippet)).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: {
        "SymbolLattice": {
          type: "local",
          command: ["SymbolLattice", "serve", "--mcp", "--project", "/workspace/example"],
          enabled: true
        }
      }
    });
  });

  it("reports migration-sensitive global destination alternatives without inspecting Agent files", () => {
    const opencode = createMcpConfig("opencode", { projectPath: "/workspace/example", location: "global" });
    const antigravity = createMcpConfig("antigravity", { projectPath: "/workspace/example" });

    expect(opencode.destination).toMatchObject({
      path: "~/.config/opencode/opencode.jsonc",
      alternativePaths: ["~/.config/opencode/opencode.json"],
      selection: "Use opencode.jsonc when it exists or for a new configuration; use opencode.json when it is the existing configuration file."
    });
    expect(antigravity.destination).toMatchObject({
      path: "~/.gemini/config/mcp_config.json",
      alternativePaths: ["~/.gemini/antigravity/mcp_config.json"],
      selection: "Use the unified path when ~/.gemini/config/.migrated or the unified config exists; otherwise use the legacy path."
    });
    expect(antigravity.notes).toContain(
      "Antigravity selects its active config through its migration state; inspect destination.selection before editing either listed path."
    );
  });

  it("renders the remaining verified Agent-specific formats", () => {
    const gemini = createMcpConfig("gemini", { projectPath: "/workspace/example", location: "global" });
    const kiro = createMcpConfig("kiro", { projectPath: "/workspace/example" });
    const hermes = createMcpConfig("hermes", { projectPath: "/workspace/example" });
    const antigravity = createMcpConfig("antigravity", { projectPath: "/workspace/example" });

    expect(gemini.destination).toMatchObject({
      path: "~/.gemini/settings.json",
      format: "json",
      scope: "global"
    });
    expect(JSON.parse(gemini.snippet).mcpServers["SymbolLattice"]).toMatchObject({ type: "stdio" });

    expect(kiro.destination).toMatchObject({
      path: join("/workspace/example", ".kiro", "settings", "mcp.json"),
      format: "json",
      scope: "local"
    });
    expect(kiro.notes).toContain(
      "Restart Kiro after adding the MCP server. Kiro IDE users must also enable MCP in Settings."
    );

    expect(hermes.destination).toMatchObject({
      path: "$HERMES_HOME/config.yaml",
      format: "yaml",
      entry: "mcp_servers.SymbolLattice",
      scope: "global"
    });
    expect(hermes.snippet).toContain("mcp_servers:\n  SymbolLattice:");
    expect(hermes.snippet).toContain("    - mcp-SymbolLattice");
    expect(hermes.notes).toContain("$HERMES_HOME defaults to ~/.hermes when it is not set.");
    expect(parseYaml(hermes.snippet)).toMatchObject({
      mcp_servers: {
        SymbolLattice: {
          command: "SymbolLattice",
          args: ["serve", "--mcp", "--project", "/workspace/example"],
          timeout: 120,
          connect_timeout: 60,
          enabled: true
        }
      },
      platform_toolsets: {
        cli: ["hermes-cli", "mcp-SymbolLattice"]
      }
    });

    expect(antigravity.destination).toMatchObject({
      path: "~/.gemini/config/mcp_config.json",
      format: "json",
      scope: "global"
    });
    expect(JSON.parse(antigravity.snippet).mcpServers["SymbolLattice"]).toEqual({
      command: "SymbolLattice",
      args: ["serve", "--mcp", "--project", "/workspace/example"]
    });
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
        "SymbolLattice": {
          command: "SymbolLattice",
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
    expect(result.location).toBe("not-applicable");
    expect(result.lifecycle.autoSync).toEqual({
      enabled: false,
      projectIndexMayBeWritten: false,
      diagnosticJournalMayBeWritten: false,
      disableFlag: "--no-auto-sync"
    });
    expect(result.notes).toContain(
      "Auto-sync is disabled; run SymbolLattice sync explicitly when the graph needs refreshing."
    );
  });

  it("can pin a source-built CLI entrypoint instead of relying on a PATH command", () => {
    const result = createMcpConfig("codex", {
      projectPath: "/workspace/example",
      command: "node",
      commandArgs: ["/tools/SymbolLattice/dist/cli/main.js"]
    });

    expect(result.server).toEqual({
      name: "SymbolLattice",
      command: "node",
      args: [
        "/tools/SymbolLattice/dist/cli/main.js",
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

  it("forwards bounded absolute plugin paths and reports whether the host will execute them", () => {
    const pluginPath = resolve("C:/projects/example/plugins/framework.mjs");
    const result = createMcpConfig("codex", {
      projectPath: "C:/projects/example",
      autoSync: false,
      pluginModulePaths: [pluginPath],
      allowExternalPluginModules: true
    });

    expect(result.server.args).toEqual([
      "serve",
      "--mcp",
      "--project",
      "C:/projects/example",
      "--no-auto-sync",
      "--plugin",
      pluginPath,
      "--allow-external-plugin"
    ]);
    expect(result.lifecycle.plugins).toEqual({
      modulePaths: [pluginPath],
      executesTrustedCode: false,
      externalModulesAllowed: true
    });
    expect(result.notes).toContain(
      "Plugin modules are configured but are not executed while MCP auto-sync is disabled."
    );
  });

  it("rejects unsafe or ambiguous generated plugin arguments", () => {
    const pluginPath = resolve("C:/projects/example/plugins/framework.mjs");
    expect(() =>
      createMcpConfig("codex", {
        projectPath: "C:/projects/example",
        pluginModulePaths: ["plugins/framework.mjs"]
      })
    ).toThrow("must be non-empty absolute paths");
    expect(() =>
      createMcpConfig("codex", {
        projectPath: "C:/projects/example",
        pluginModulePaths: [pluginPath, pluginPath]
      })
    ).toThrow("must not contain duplicates");
    expect(() =>
      createMcpConfig("codex", {
        projectPath: "C:/projects/example",
        allowExternalPluginModules: true
      })
    ).toThrow("requires at least one explicit plugin module path");
    expect(() =>
      createMcpConfig("codex", {
        projectPath: "C:/projects/example",
        pluginModulePaths: Array.from({ length: 17 }, (_, index) => resolve(`C:/p${index}.mjs`))
      })
    ).toThrow("at most 16 explicit plugin module paths");
  });

  it("rejects unknown targets, invalid locations, unsupported target scopes, and blank command inputs", () => {
    expect(() => parseMcpConfigTarget("unknown-agent")).toThrow(
      'Expected one of: codex, claude, cursor, opencode, gemini, kiro, hermes, antigravity, generic-json; received "unknown-agent".'
    );
    expect(() => parseMcpConfigLocation("workspace")).toThrow(
      'Expected one of: global, local; received "workspace".'
    );
    expect(() => createMcpConfig("codex", { projectPath: "/workspace", location: "local" })).toThrow(
      'Target "codex" does not support "local" configuration; use --location global.'
    );
    expect(() => createMcpConfig("generic-json", { projectPath: "/workspace", location: "global" })).toThrow(
      'Target "generic-json" does not use an Agent configuration location.'
    );
    expect(() => createMcpConfig("codex", { projectPath: "   " })).toThrow(
      "Expected a non-empty project path for the generated MCP server."
    );
    expect(() => createMcpConfig("codex", { projectPath: "/workspace", command: "   " })).toThrow(
      "Expected a non-empty MCP server command."
    );
  });
});

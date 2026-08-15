import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join as pathJoin, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  createMcpUninstall,
  type McpUninstallDependencies,
  type McpUninstallFileSystem
} from "../../../src/cli/mcp-uninstall.js";
import { createMcpDoctor } from "../../../src/cli/mcp-doctor.js";

const VIRTUAL_ROOT = resolve(".test-virtual-mcp-uninstall");

function join(first: string, ...rest: string[]): string {
  return pathJoin(first === "C:" ? VIRTUAL_ROOT : first, ...rest);
}

interface VirtualFiles {
  readonly files: Record<string, string>;
  readonly fileSystem: McpUninstallFileSystem & {
    readonly exists: ReturnType<typeof vi.fn>;
    readonly readText: ReturnType<typeof vi.fn>;
    readonly writeAtomically: ReturnType<typeof vi.fn>;
    readonly writeBackup: ReturnType<typeof vi.fn>;
  };
}

function createVirtualFiles(files: Record<string, string>): VirtualFiles {
  const exists = vi.fn((path: string) => Object.prototype.hasOwnProperty.call(files, path));
  const readText = vi.fn((path: string) => {
    const text = files[path];
    if (text === undefined) {
      throw new Error(`No virtual file at ${path}.`);
    }
    return text;
  });
  const writeAtomically = vi.fn((path: string, text: string) => {
    files[path] = text;
  });
  const writeBackup = vi.fn((sourcePath: string, backupPath: string) => {
    if (Object.hasOwn(files, backupPath)) {
      throw new Error(`Virtual backup already exists at ${backupPath}.`);
    }
    const text = files[sourcePath];
    if (text === undefined) {
      throw new Error(`No virtual source file at ${sourcePath}.`);
    }
    files[backupPath] = text;
  });
  return { files, fileSystem: { exists, readText, writeAtomically, writeBackup } };
}

function uninstallDependencies(
  fileSystem: McpUninstallFileSystem,
  homeDirectory: string,
  now = () => new Date("2026-08-03T10:20:30.456Z")
): McpUninstallDependencies {
  return {
    fileSystem,
    homeDirectory,
    environment: {
      PATH: join("C:", "tools"),
      PATHEXT: ".CMD"
    },
    platform: "win32",
    now
  };
}

function healthyRuntimeFiles(projectPath: string): Record<string, string> {
  return {
    [join(projectPath, ".SymbolLattice", "index.sqlite")]: "SQLite format 3\u0000",
    [join("C:", "tools", "SymbolLattice.CMD")]: "@echo off"
  };
}

function standardJson(projectPath: string): string {
  return JSON.stringify({
    mcpServers: {
      "SymbolLattice": {
        type: "stdio",
        command: "SymbolLattice",
        args: ["serve", "--mcp", "--project", projectPath]
      }
    }
  });
}

describe("MCP preview-first uninstaller", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("previews a Claude removal without reading unrelated values into its result or writing files", () => {
    const projectPath = join("C:", "workspace", "preview");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = JSON.stringify({
      mcpServers: {
        "SymbolLattice": {
          type: "stdio",
          command: "SymbolLattice",
          args: ["serve", "--mcp", "--project", projectPath],
          token: "must-not-appear"
        },
        other: { command: "other" }
      }
    });
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "preview",
      status: "ready",
      confirmation: { applyRequested: false, acknowledgementReceived: false },
      configuration: {
        beforeStatus: "matches",
        action: "remove",
        strategy: "json-object-remove",
        backup: { state: "planned" },
        atomicWrite: true,
        preservesSiblingEntries: true,
        preservesConfigurationFile: true
      }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("must-not-appear");
  });

  it("refuses an apply request that lacks the explicit acknowledgement", () => {
    const projectPath = join("C:", "workspace", "no-ack");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = standardJson(projectPath);
    const virtual = createVirtualFiles(files);

    expect(() =>
      createMcpUninstall(
        "claude",
        { projectPath, apply: true },
        uninstallDependencies(virtual.fileSystem, homeDirectory)
      )
    ).toThrow("--apply and --yes");
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("backs up and atomically removes only a stale SymbolLattice Claude entry after explicit confirmation", () => {
    const projectPath = join("C:", "workspace", "apply");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    const original = JSON.stringify({
      mcpServers: {
        other: { command: "other", args: ["serve"] },
        "SymbolLattice": { type: "stdio", command: "older-SymbolLattice", args: ["serve"] }
      },
      retained: true
    });
    files[configPath] = original;
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "applied",
      confirmation: { applyRequested: true, acknowledgementReceived: true },
      configuration: {
        beforeStatus: "different",
        action: "remove",
        backup: { state: "created" },
        preservesConfigurationFile: true
      }
    });
    expect(result.configuration.backup.path).not.toBeNull();
    expect(virtual.files[result.configuration.backup.path ?? ""]).toBe(original);
    expect(virtual.fileSystem.writeBackup).toHaveBeenCalledTimes(1);
    expect(virtual.fileSystem.writeAtomically).toHaveBeenCalledTimes(1);
    expect(virtual.fileSystem.exists(configPath)).toBe(true);
    expect(JSON.parse(virtual.files[configPath] ?? "")).toEqual({
      mcpServers: {
        other: { command: "other", args: ["serve"] }
      },
      retained: true
    });
  });

  it("retains a configuration file that contains only the owned MCP entry", () => {
    const projectPath = join("C:", "workspace", "only-owned-entry");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = standardJson(projectPath);
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      action: "remove",
      preservesConfigurationFile: true
    });
    expect(virtual.fileSystem.exists(configPath)).toBe(true);
    expect(JSON.parse(virtual.files[configPath] ?? "")).toEqual({ mcpServers: {} });
  });

  it("refuses an apply when the selected configuration changes after planning", () => {
    const projectPath = join("C:", "workspace", "changed-before-apply");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = standardJson(projectPath);
    const virtual = createVirtualFiles(files);
    const concurrentText = JSON.stringify({
      mcpServers: {
        "SymbolLattice": { command: "newer-SymbolLattice", args: ["serve"] },
        other: { command: "concurrent-agent" }
      }
    });
    let reads = 0;
    virtual.fileSystem.readText.mockImplementation((path: string) => {
      reads += 1;
      if (reads === 3) {
        files[configPath] = concurrentText;
      }
      const text = files[path];
      if (text === undefined) {
        throw new Error(`No virtual file at ${path}.`);
      }
      return text;
    });

    const result = createMcpUninstall(
      "claude",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "blocked",
      configuration: { action: "blocked", atomicWrite: false }
    });
    expect(result.configuration.diagnostics).toContain(
      "The selected configuration changed after the removal plan was generated, so it was not changed."
    );
    expect(files[configPath]).toBe(concurrentText);
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("does not create a backup or rewrite a configuration without a SymbolLattice entry", () => {
    const projectPath = join("C:", "workspace", "unchanged");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    const original = JSON.stringify({ mcpServers: { other: { command: "other" } }, retained: true });
    files[configPath] = original;
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "unchanged",
      configuration: { action: "unchanged", backup: { state: "not-needed" } }
    });
    expect(virtual.files[configPath]).toBe(original);
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("blocks invalid JSON without writing even when apply is explicitly confirmed", () => {
    const projectPath = join("C:", "workspace", "invalid");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = '{ "mcpServers":';
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "blocked",
      configuration: { action: "blocked", atomicWrite: false }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("uses surgical JSONC edits for OpenCode and preserves its comments and sibling server", () => {
    const projectPath = join("C:", "workspace", "opencode");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, "opencode.jsonc");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = `{
  // Keep this comment and this server.
  "mcp": {
    "SymbolLattice": {
      "type": "local",
      "command": ["SymbolLattice", "serve", "--mcp", "--project", ${JSON.stringify(projectPath)}],
      "enabled": true,
    },
    "other": {
      "type": "local",
      "command": ["other"],
      "enabled": true,
    },
  },
}`;
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "opencode",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      action: "remove",
      strategy: "jsonc-surgical-remove",
      backup: { state: "created" }
    });
    expect(virtual.files[configPath]).toContain("// Keep this comment and this server.");
    expect(virtual.files[configPath]).toContain('"other"');
    expect(virtual.files[configPath]).not.toContain('"SymbolLattice"');
    expect(
      createMcpDoctor(
        "opencode",
        { projectPath },
        uninstallDependencies(virtual.fileSystem, homeDirectory)
      ).configuration.status
    ).toBe("not-configured");
  });

  it("removes only Codex's owned TOML section and preserves unrelated sections", () => {
    const projectPath = join("C:", "workspace", "codex");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".codex", "config.toml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "[mcp_servers.other]",
      'command = "other"',
      "",
      "[mcp_servers.SymbolLattice]",
      'command = "SymbolLattice"',
      `args = ["serve", "--mcp", "--project", ${JSON.stringify(projectPath)}]`,
      "",
      "[features]",
      "enabled = true"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "codex",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      action: "remove",
      strategy: "toml-owned-section-remove"
    });
    expect(virtual.files[configPath]).toContain("[mcp_servers.other]");
    expect(virtual.files[configPath]).toContain("[features]");
    expect(virtual.files[configPath]).not.toContain("[mcp_servers.SymbolLattice]");
    expect(
      createMcpDoctor(
        "codex",
        { projectPath },
        uninstallDependencies(virtual.fileSystem, homeDirectory)
      ).configuration.status
    ).toBe("not-configured");
  });

  it("refuses a Codex configuration with an ambiguous additional inline entry", () => {
    const projectPath = join("C:", "workspace", "codex-ambiguous");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".codex", "config.toml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "[mcp_servers.SymbolLattice]",
      'command = "SymbolLattice"',
      `args = ["serve", "--mcp", "--project", ${JSON.stringify(projectPath)}]`,
      "",
      "[mcp_servers]",
      'SymbolLattice = { command = "other", args = ["serve"] }'
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "codex",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "blocked",
      configuration: { action: "blocked", strategy: "not-applicable" }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("removes the Hermes MCP entry but deliberately keeps the user-manageable toolset", () => {
    const projectPath = join("C:", "workspace", "hermes");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".hermes", "config.yaml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "mcp_servers:",
      "  SymbolLattice:",
      "    command: SymbolLattice",
      "    args:",
      "      - serve",
      "      - --mcp",
      "      - --project",
      `      - ${JSON.stringify(projectPath)}`,
      "    timeout: 120",
      "    connect_timeout: 60",
      "    enabled: true",
      "  other:",
      "    command: other",
      "platform_toolsets:",
      "  cli:",
      "    - hermes-cli",
      "    - mcp-SymbolLattice"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "hermes",
      { projectPath, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );
    const written = parseYaml(virtual.files[configPath] ?? "") as {
      readonly mcp_servers: Record<string, unknown>;
      readonly platform_toolsets: { readonly cli: readonly string[] };
    };

    expect(result.configuration).toMatchObject({
      action: "remove",
      strategy: "yaml-document-remove"
    });
    expect(written.mcp_servers.other).toEqual({ command: "other" });
    expect(written.mcp_servers.SymbolLattice).toBeUndefined();
    expect(written.platform_toolsets.cli).toEqual(["hermes-cli", "mcp-SymbolLattice"]);
  });

  it("requires an explicit generic JSON configuration path and never writes without one", () => {
    const projectPath = join("C:", "workspace", "generic");
    const homeDirectory = join("C:", "home", "user");
    const virtual = createVirtualFiles(healthyRuntimeFiles(projectPath));

    const result = createMcpUninstall(
      "generic-json",
      { projectPath },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "preview",
      status: "blocked",
      configuration: { action: "blocked", path: null, strategy: "not-applicable" }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("chooses a non-colliding backup name when a same-second backup already exists", () => {
    const projectPath = join("C:", "workspace", "backup-collision");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const backupDirectory = join(projectPath, "backups");
    const files = healthyRuntimeFiles(projectPath);
    const original = standardJson(projectPath);
    files[configPath] = original;
    files[join(backupDirectory, "2026-08-03T10-20-30-456Z-claude-.mcp.json.bak")] = "older backup";
    const virtual = createVirtualFiles(files);

    const result = createMcpUninstall(
      "claude",
      { projectPath, backupDirectory, apply: true, yes: true },
      uninstallDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration.backup.path).toBe(
      join(backupDirectory, "2026-08-03T10-20-30-456Z-claude-.mcp.json-1.bak")
    );
    expect(virtual.files[result.configuration.backup.path ?? ""]).toBe(original);
  });

  it.runIf(process.platform !== "win32")(
    "preserves a private POSIX mode on both an existing configuration and its backup",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "SymbolLattice-mcp-uninstall-"));
      temporaryDirectories.push(directory);
      const projectPath = join(directory, "project");
      const configPath = join(directory, "agent", "mcp.json");
      const backupDirectory = join(directory, "backups");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, standardJson(projectPath), "utf8");
      chmodSync(configPath, 0o600);

      const result = createMcpUninstall("generic-json", {
        projectPath,
        configPath,
        backupDirectory,
        apply: true,
        yes: true
      });

      expect(statSync(configPath).mode & 0o777).toBe(0o600);
      expect(result.configuration.backup.path).not.toBeNull();
      expect(statSync(result.configuration.backup.path ?? "").mode & 0o777).toBe(0o600);
    }
  );
});

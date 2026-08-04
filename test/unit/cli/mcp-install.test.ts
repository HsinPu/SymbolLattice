import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join as pathJoin, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  createMcpInstall,
  type McpInstallDependencies,
  type McpInstallFileSystem
} from "../../../src/cli/mcp-install.js";
import { createMcpDoctor } from "../../../src/cli/mcp-doctor.js";

const VIRTUAL_ROOT = resolve(".test-virtual-mcp-install");

function join(first: string, ...rest: string[]): string {
  return pathJoin(first === "C:" ? VIRTUAL_ROOT : first, ...rest);
}

interface VirtualFiles {
  readonly files: Record<string, string>;
  readonly fileSystem: McpInstallFileSystem & {
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

function installDependencies(
  fileSystem: McpInstallFileSystem,
  homeDirectory: string,
  now = () => new Date("2026-08-03T10:20:30.456Z")
): McpInstallDependencies {
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
    [join(projectPath, ".symbol-lattice", "index.sqlite")]: "SQLite format 3\u0000",
    [join("C:", "tools", "symbol-lattice.CMD")]: "@echo off"
  };
}

function standardJson(projectPath: string): string {
  return JSON.stringify({
    mcpServers: {
      "symbol-lattice": {
        type: "stdio",
        command: "symbol-lattice",
        args: ["serve", "--mcp", "--project", projectPath]
      }
    }
  });
}

describe("MCP preview-first installer", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("previews a Claude update without reading unrelated values into its result or writing files", () => {
    const projectPath = join("C:", "workspace", "preview");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = JSON.stringify({
      mcpServers: {
        other: { command: "other", token: "must-not-appear" }
      }
    });
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "claude",
      { projectPath },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "preview",
      status: "ready",
      confirmation: { applyRequested: false, acknowledgementReceived: false },
      configuration: {
        beforeStatus: "not-configured",
        action: "update",
        strategy: "json-object-upsert",
        backup: { state: "planned" },
        atomicWrite: true,
        preservesSiblingEntries: true
      }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("must-not-appear");
  });

  it("refuses an apply request that lacks the explicit acknowledgement", () => {
    const projectPath = join("C:", "workspace", "no-ack");
    const homeDirectory = join("C:", "home", "user");
    const virtual = createVirtualFiles(healthyRuntimeFiles(projectPath));

    expect(() =>
      createMcpInstall(
        "claude",
        { projectPath, apply: true },
        installDependencies(virtual.fileSystem, homeDirectory)
      )
    ).toThrow("--apply and --yes");
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("backs up and atomically updates only SymbolLattice's Claude entry after explicit confirmation", () => {
    const projectPath = join("C:", "workspace", "apply");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    const original = JSON.stringify({
      mcpServers: {
        other: { command: "other", args: ["serve"] }
      },
      retained: true
    });
    files[configPath] = original;
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "claude",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "applied",
      confirmation: { applyRequested: true, acknowledgementReceived: true },
      configuration: { action: "update", backup: { state: "created" } }
    });
    expect(result.configuration.backup.path).not.toBeNull();
    expect(virtual.files[result.configuration.backup.path ?? ""]).toBe(original);
    expect(virtual.fileSystem.writeBackup).toHaveBeenCalledTimes(1);
    expect(virtual.fileSystem.writeAtomically).toHaveBeenCalledTimes(1);
    expect(JSON.parse(virtual.files[configPath] ?? "")).toEqual({
      mcpServers: {
        other: { command: "other", args: ["serve"] },
        "symbol-lattice": {
          type: "stdio",
          command: "symbol-lattice",
          args: ["serve", "--mcp", "--project", projectPath]
        }
      },
      retained: true
    });
  });

  it("does not create a backup or rewrite an already matching configuration", () => {
    const projectPath = join("C:", "workspace", "unchanged");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(projectPath, ".mcp.json");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = standardJson(projectPath);
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "claude",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "unchanged",
      configuration: { action: "unchanged", backup: { state: "not-needed" } }
    });
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

    const result = createMcpInstall(
      "claude",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
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
    "other": {
      "type": "local",
      "command": ["other"],
      "enabled": true,
    },
  },
}`;
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "opencode",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      action: "update",
      strategy: "jsonc-surgical-edit",
      backup: { state: "created" }
    });
    expect(virtual.files[configPath]).toContain("// Keep this comment and this server.");
    expect(virtual.files[configPath]).toContain('"other"');
    expect(
      createMcpDoctor(
        "opencode",
        { projectPath },
        installDependencies(virtual.fileSystem, homeDirectory)
      ).configuration.status
    ).toBe("matches");
  });

  it("replaces only Codex's owned TOML section and keeps unrelated sections", () => {
    const projectPath = join("C:", "workspace", "codex");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".codex", "config.toml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "[mcp_servers.other]",
      'command = "other"',
      "",
      "[mcp_servers.symbol_lattice]",
      'command = "old"',
      'args = ["serve"]',
      "",
      "[features]",
      "enabled = true"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "codex",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      action: "update",
      strategy: "toml-owned-section-upsert"
    });
    expect(virtual.files[configPath]).toContain("[mcp_servers.other]");
    expect(virtual.files[configPath]).toContain("[features]");
    expect(
      createMcpDoctor(
        "codex",
        { projectPath },
        installDependencies(virtual.fileSystem, homeDirectory)
      ).configuration.status
    ).toBe("matches");
  });

  it("refuses an inline Codex MCP entry that cannot be safely merged", () => {
    const projectPath = join("C:", "workspace", "codex-inline");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".codex", "config.toml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "[mcp_servers]",
      'symbol_lattice = { command = "old", args = ["serve"] }'
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "codex",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "blocked",
      configuration: { action: "blocked", strategy: "not-applicable" }
    });
    expect(virtual.fileSystem.writeBackup).not.toHaveBeenCalled();
    expect(virtual.fileSystem.writeAtomically).not.toHaveBeenCalled();
  });

  it("upserts Hermes YAML entries and its required platform toolset without removing siblings", () => {
    const projectPath = join("C:", "workspace", "hermes");
    const homeDirectory = join("C:", "home", "user");
    const configPath = join(homeDirectory, ".hermes", "config.yaml");
    const files = healthyRuntimeFiles(projectPath);
    files[configPath] = [
      "mcp_servers:",
      "  other:",
      "    command: other",
      "platform_toolsets:",
      "  cli:",
      "    - hermes-cli"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "hermes",
      { projectPath, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );
    const written = parseYaml(virtual.files[configPath] ?? "") as {
      readonly mcp_servers: Record<string, unknown>;
      readonly platform_toolsets: { readonly cli: readonly string[] };
    };

    expect(result.configuration).toMatchObject({
      action: "update",
      strategy: "yaml-document-upsert"
    });
    expect(written.mcp_servers.other).toEqual({ command: "other" });
    expect(written.mcp_servers.symbol_lattice).toMatchObject({ command: "symbol-lattice", enabled: true });
    expect(written.platform_toolsets.cli).toEqual(["hermes-cli", "mcp-symbol-lattice"]);
    expect(
      createMcpDoctor(
        "hermes",
        { projectPath },
        installDependencies(virtual.fileSystem, homeDirectory)
      ).configuration.status
    ).toBe("matches");
  });

  it("requires an explicit generic JSON configuration path and never writes without one", () => {
    const projectPath = join("C:", "workspace", "generic");
    const homeDirectory = join("C:", "home", "user");
    const virtual = createVirtualFiles(healthyRuntimeFiles(projectPath));

    const result = createMcpInstall(
      "generic-json",
      { projectPath },
      installDependencies(virtual.fileSystem, homeDirectory)
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
    const original = JSON.stringify({ mcpServers: {} });
    files[configPath] = original;
    files[join(backupDirectory, "2026-08-03T10-20-30-456Z-claude-.mcp.json.bak")] = "older backup";
    const virtual = createVirtualFiles(files);

    const result = createMcpInstall(
      "claude",
      { projectPath, backupDirectory, apply: true, yes: true },
      installDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration.backup.path).toBe(
      join(backupDirectory, "2026-08-03T10-20-30-456Z-claude-.mcp.json-1.bak")
    );
    expect(virtual.files[result.configuration.backup.path ?? ""]).toBe(original);
  });

  it.runIf(process.platform !== "win32")(
    "preserves a private POSIX mode on both an existing configuration and its backup",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "symbol-lattice-mcp-install-"));
      temporaryDirectories.push(directory);
      const projectPath = join(directory, "project");
      const configPath = join(directory, "agent", "mcp.json");
      const backupDirectory = join(directory, "backups");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: "other" } } }), "utf8");
      chmodSync(configPath, 0o600);

      const result = createMcpInstall("generic-json", {
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

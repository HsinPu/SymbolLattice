import { join as pathJoin, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createMcpDoctor,
  type McpDoctorDependencies,
  type McpDoctorFileSystem
} from "../../../src/cli/mcp-doctor.js";

const VIRTUAL_ROOT = resolve(".test-virtual-mcp-doctor");

function join(first: string, ...rest: string[]): string {
  return pathJoin(first === "C:" ? VIRTUAL_ROOT : first, ...rest);
}

interface VirtualFiles {
  readonly files: Record<string, string>;
  readonly fileSystem: McpDoctorFileSystem & {
    readonly exists: ReturnType<typeof vi.fn>;
    readonly readText: ReturnType<typeof vi.fn>;
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
  return { files, fileSystem: { exists, readText } };
}

function doctorDependencies(
  fileSystem: McpDoctorFileSystem,
  homeDirectory: string,
  executableDirectory = join("C:", "tools")
): McpDoctorDependencies {
  return {
    fileSystem,
    homeDirectory,
    environment: {
      PATH: executableDirectory,
      PATHEXT: ".CMD"
    },
    platform: "win32"
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

function commandArgsJson(projectPath: string): string {
  return JSON.stringify({
    mcpServers: {
      "symbol-lattice": {
        command: "symbol-lattice",
        args: ["serve", "--mcp", "--project", projectPath]
      }
    }
  });
}

function healthyRuntimeFiles(projectPath: string, homeDirectory: string): Record<string, string> {
  return {
    [join(projectPath, ".symbol-lattice", "index.sqlite")]: "SQLite format 3\u0000",
    [join("C:", "tools", "symbol-lattice.CMD")]: "@echo off"
  };
}

describe("MCP doctor", () => {
  it("reports a healthy Claude project configuration without exposing unrelated entries", () => {
    const projectPath = join("C:", "workspace", "sample");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    files[join(projectPath, ".mcp.json")] = JSON.stringify({
      otherServer: { token: "must-not-appear" },
      ...JSON.parse(standardJson(projectPath))
    });
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "claude",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      schemaVersion: 1,
      mode: "read-only",
      target: "claude",
      location: "local",
      configuration: {
        status: "matches",
        path: join(projectPath, ".mcp.json"),
        source: "target-default",
        entry: "mcpServers.symbol-lattice"
      },
      runtime: {
        command: "symbol-lattice",
        status: "available",
        resolvedPath: join("C:", "tools", "symbol-lattice.CMD")
      },
      project: {
        path: projectPath,
        indexStatus: "present"
      },
      overall: "healthy"
    });
    expect(JSON.stringify(result)).not.toContain("must-not-appear");
  });

  it("does not read or create a missing configuration file", () => {
    const projectPath = join("C:", "workspace", "missing-config");
    const homeDirectory = join("C:", "home", "user");
    const virtual = createVirtualFiles(healthyRuntimeFiles(projectPath, homeDirectory));

    const result = createMcpDoctor(
      "claude",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration.status).toBe("missing");
    expect(result.overall).toBe("action-required");
    expect(virtual.fileSystem.readText).not.toHaveBeenCalled();
    expect(Object.hasOwn(virtual.files, join(projectPath, ".mcp.json"))).toBe(false);
  });

  it("distinguishes invalid JSON from a parsed but different server entry", () => {
    const projectPath = join("C:", "workspace", "invalid-json");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    const configPath = join(projectPath, ".mcp.json");
    files[configPath] = "{ \"mcpServers\":";
    const virtual = createVirtualFiles(files);

    expect(
      createMcpDoctor("claude", { projectPath }, doctorDependencies(virtual.fileSystem, homeDirectory)).configuration.status
    ).toBe("invalid");

    files[configPath] = JSON.stringify({
      mcpServers: {
        "symbol-lattice": {
          type: "stdio",
          command: "symbol-lattice",
          args: ["serve"]
        }
      }
    });

    expect(
      createMcpDoctor("claude", { projectPath }, doctorDependencies(virtual.fileSystem, homeDirectory)).configuration
    ).toMatchObject({
      status: "different",
      diagnostics: ["The SymbolLattice entry differs in: args."]
    });
  });

  it("accepts OpenCode JSONC comments and trailing commas at the project-local destination", () => {
    const projectPath = join("C:", "workspace", "opencode");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    files[join(projectPath, "opencode.jsonc")] = `{
      // OpenCode allows comments and trailing commas.
      "mcp": {
        "symbol-lattice": {
          "type": "local",
          "command": ["symbol-lattice", "serve", "--mcp", "--project", ${JSON.stringify(projectPath)}],
          "enabled": true,
        },
      },
    }`;
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "opencode",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({ status: "matches", format: "jsonc" });
    expect(result.overall).toBe("healthy");
  });

  it("selects an existing OpenCode global JSON file before creating a JSONC destination", () => {
    const projectPath = join("C:", "workspace", "opencode-global");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    const configPath = join(homeDirectory, ".config", "opencode", "opencode.json");
    files[configPath] = JSON.stringify({
      mcp: {
        "symbol-lattice": {
          type: "local",
          command: ["symbol-lattice", "serve", "--mcp", "--project", projectPath],
          enabled: true
        }
      }
    });
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "opencode",
      { projectPath, location: "global" },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      status: "matches",
      path: configPath,
      format: "json",
      selection: "Selected the existing opencode.json configuration."
    });
  });

  it("checks a multiline Codex TOML entry with comments and literal strings without invoking Codex", () => {
    const projectPath = join("C:", "workspace", "codex");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    files[join(homeDirectory, ".codex", "config.toml")] = [
      "[mcp_servers.symbol_lattice]",
      "command = 'symbol-lattice' # local executable",
      "args = [",
      '  "serve",',
      '  "--mcp", # transport',
      '  "--project",',
      `  ${JSON.stringify(projectPath)}`,
      "]"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "codex",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration.status).toBe("matches");
    expect(result.overall).toBe("healthy");
  });

  it("checks Hermes YAML and its required platform toolset", () => {
    const projectPath = join("C:", "workspace", "hermes");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    files[join(homeDirectory, ".hermes", "config.yaml")] = [
      "mcp_servers:",
      "  symbol_lattice:",
      '    command: "symbol-lattice"',
      "    args:",
      '      - "serve"',
      '      - "--mcp"',
      '      - "--project"',
      `      - ${JSON.stringify(projectPath)}`,
      "    timeout: 120",
      "    connect_timeout: 60",
      "    enabled: true",
      "platform_toolsets:",
      "  cli:",
      "    - hermes-cli",
      "    - mcp-symbol-lattice"
    ].join("\n");
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "hermes",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      status: "matches",
      path: join(homeDirectory, ".hermes", "config.yaml"),
      format: "yaml"
    });
    expect(result.overall).toBe("healthy");
  });

  it("selects Antigravity's legacy path until its unified migration state exists", () => {
    const projectPath = join("C:", "workspace", "antigravity");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    const legacyPath = join(homeDirectory, ".gemini", "antigravity", "mcp_config.json");
    files[legacyPath] = commandArgsJson(projectPath);
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "antigravity",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      status: "matches",
      path: legacyPath,
      selection: "Selected the legacy Antigravity configuration because no unified migration marker or config exists."
    });
  });

  it("selects Antigravity's unified path after its migration marker appears", () => {
    const projectPath = join("C:", "workspace", "antigravity-unified");
    const homeDirectory = join("C:", "home", "user");
    const files = healthyRuntimeFiles(projectPath, homeDirectory);
    const unifiedDirectory = join(homeDirectory, ".gemini", "config");
    const unifiedPath = join(unifiedDirectory, "mcp_config.json");
    files[join(unifiedDirectory, ".migrated")] = "migrated";
    files[unifiedPath] = commandArgsJson(projectPath);
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "antigravity",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      status: "matches",
      path: unifiedPath,
      selection: "Selected the unified Antigravity configuration because its migration marker or unified config exists."
    });
  });

  it("uses an explicit generic JSON file and verifies a source-built entrypoint without running it", () => {
    const projectPath = join("C:", "workspace", "generic");
    const homeDirectory = join("C:", "home", "user");
    const nodePath = join("C:", "node", "node.exe");
    const entrypoint = join("C:", "checkout", "dist", "cli", "main.js");
    const configPath = join("C:", "configs", "mcp.json");
    const files = {
      [join(projectPath, ".symbol-lattice", "index.sqlite")]: "SQLite format 3\u0000",
      [nodePath]: "node executable",
      [entrypoint]: "built cli",
      [configPath]: JSON.stringify({
        mcpServers: {
          "symbol-lattice": {
            command: nodePath,
            args: [entrypoint, "serve", "--mcp", "--project", projectPath]
          }
        }
      })
    };
    const virtual = createVirtualFiles(files);

    const result = createMcpDoctor(
      "generic-json",
      {
        projectPath,
        configPath,
        command: nodePath,
        commandArgs: [entrypoint]
      },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result).toMatchObject({
      configuration: { status: "matches", path: configPath, source: "override" },
      runtime: {
        status: "available",
        resolvedPath: nodePath,
        sourceEntrypoint: { path: entrypoint, status: "present" }
      },
      overall: "healthy"
    });
  });

  it("requires an explicit file before generic JSON can be diagnosed", () => {
    const projectPath = join("C:", "workspace", "generic-no-file");
    const homeDirectory = join("C:", "home", "user");
    const virtual = createVirtualFiles(healthyRuntimeFiles(projectPath, homeDirectory));

    const result = createMcpDoctor(
      "generic-json",
      { projectPath },
      doctorDependencies(virtual.fileSystem, homeDirectory)
    );

    expect(result.configuration).toMatchObject({
      status: "not-applicable",
      path: null,
      source: "not-applicable"
    });
    expect(result.overall).toBe("action-required");
  });
});

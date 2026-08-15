import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createCodexDoctor,
  createCodexInstall,
  createCodexUninstall,
  type CodexSetupFileSystem
} from "../../../src/cli/codex-setup.js";

const PROJECT = resolve("C:/projects/example");
const CONFIG = resolve("C:/users/example/.codex/config.toml");
const INSTRUCTIONS = resolve("C:/users/example/.codex/AGENTS.md");
const BACKUPS = resolve("C:/backups/symbol-lattice");
const NOW = new Date("2026-08-15T11:00:00.000Z");

class MemoryFileSystem implements CodexSetupFileSystem {
  public readonly files = new Map<string, string>();
  public readonly backups: Array<{ source: string; target: string }> = [];
  public readonly writes: string[] = [];
  public failNextWritePath: string | null = null;

  public exists = (path: string): boolean => this.files.has(path);

  public readText = (path: string): string => {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`Missing fixture: ${path}`);
    return value;
  };

  public writeBackup = (sourcePath: string, backupPath: string): void => {
    const source = this.readText(sourcePath);
    if (this.files.has(backupPath)) throw new Error(`Backup exists: ${backupPath}`);
    this.files.set(backupPath, source);
    this.backups.push({ source: sourcePath, target: backupPath });
  };

  public writeAtomically = (path: string, text: string): void => {
    this.writes.push(path);
    if (this.failNextWritePath === path) {
      this.failNextWritePath = null;
      throw new Error(`Injected write failure: ${path}`);
    }
    this.files.set(path, text);
  };

  public removeFile = (path: string): void => {
    this.files.delete(path);
  };
}

function options(fileSystem: MemoryFileSystem, apply = false) {
  return {
    projectPath: PROJECT,
    projectBinding: "runtime-working-directory" as const,
    configPath: CONFIG,
    instructionsPath: INSTRUCTIONS,
    backupDirectory: BACKUPS,
    apply,
    yes: apply,
    now: NOW,
    fileSystem,
    homeDirectory: resolve("C:/users/example"),
    environment: { PATH: "" },
    platform: "win32" as const
  };
}

describe("Codex two-file setup", () => {
  it("previews both missing files without writing", () => {
    const fs = new MemoryFileSystem();
    const result = createCodexInstall(options(fs));

    expect(result).toMatchObject({
      mode: "preview",
      status: "ready",
      configuration: { action: "create", path: CONFIG },
      instructions: { action: "create", path: INSTRUCTIONS },
      transaction: { preflight: "passed", backups: "not-needed", writes: "not-attempted", consistent: true }
    });
    expect(fs.files.size).toBe(0);
  });

  it("applies, backs up, preserves sibling content, and is idempotent", () => {
    const fs = new MemoryFileSystem();
    fs.files.set(CONFIG, '[mcp_servers.other]\ncommand = "other"\nargs = []\n');
    fs.files.set(INSTRUCTIONS, "# Personal instructions\n\nKeep this.\n");

    const applied = createCodexInstall(options(fs, true));
    expect(applied).toMatchObject({
      mode: "apply",
      status: "applied",
      configuration: { action: "update", backup: { state: "created" } },
      instructions: { action: "update", backup: { state: "created" } },
      transaction: { backups: "created", writes: "completed", rollback: "not-needed", consistent: true }
    });
    expect(fs.files.get(CONFIG)).toContain("[mcp_servers.other]");
    expect(fs.files.get(CONFIG)).toContain("[mcp_servers.symbol_lattice]");
    expect(fs.files.get(CONFIG)).toContain('args = ["serve", "--mcp"]');
    expect(fs.files.get(INSTRUCTIONS)).toContain("# Personal instructions");
    expect(fs.files.get(INSTRUCTIONS)).toContain("<!-- SYMBOL_LATTICE_START -->");
    expect(fs.backups).toHaveLength(2);
    expect(applied.notes).not.toContain(
      "Preview only: no Agent configuration, backup, or project index has been written."
    );
    expect(applied.notes).toContain(
      "The selected configuration was atomically updated after its backup was created when required."
    );

    const repeated = createCodexInstall(options(fs, true));
    expect(repeated).toMatchObject({
      mode: "apply",
      status: "unchanged",
      configuration: { action: "unchanged" },
      instructions: { action: "unchanged" },
      transaction: {
        writes: "not-attempted",
        diagnostics: ["Both Codex-managed files already match the reviewed plan; no write was needed."]
      }
    });
    expect(repeated.notes).not.toContain(
      "Preview only: no Agent configuration, backup, or project index has been written."
    );
    expect(fs.backups).toHaveLength(2);
  });

  it("blocks both files when instruction ownership markers are malformed", () => {
    const fs = new MemoryFileSystem();
    const config = '[mcp_servers.other]\ncommand = "other"\nargs = []\n';
    fs.files.set(CONFIG, config);
    fs.files.set(INSTRUCTIONS, "<!-- SYMBOL_LATTICE_START -->\nmissing end\n");

    const result = createCodexInstall(options(fs, true));
    expect(result).toMatchObject({
      status: "blocked",
      instructions: { action: "blocked", status: "invalid" },
      transaction: { preflight: "blocked", writes: "not-attempted", consistent: true }
    });
    expect(fs.files.get(CONFIG)).toBe(config);
    expect(fs.backups).toHaveLength(0);
  });

  it("rolls the first file back when the second atomic write fails", () => {
    const fs = new MemoryFileSystem();
    const config = '[mcp_servers.other]\ncommand = "other"\nargs = []\n';
    const instructions = "# Personal instructions\n";
    fs.files.set(CONFIG, config);
    fs.files.set(INSTRUCTIONS, instructions);
    fs.failNextWritePath = INSTRUCTIONS;

    const result = createCodexInstall(options(fs, true));
    expect(result).toMatchObject({
      status: "blocked",
      transaction: { writes: "failed", rollback: "completed", consistent: true }
    });
    expect(fs.files.get(CONFIG)).toBe(config);
    expect(fs.files.get(INSTRUCTIONS)).toBe(instructions);
    expect(fs.backups).toHaveLength(2);
  });

  it("removes only owned sections and leaves both files present", () => {
    const fs = new MemoryFileSystem();
    fs.files.set(
      CONFIG,
      '[mcp_servers.other]\ncommand = "other"\nargs = []\n\n[mcp_servers.symbol_lattice]\ncommand = "symbol-lattice"\nargs = ["serve", "--mcp"]\n'
    );
    fs.files.set(
      INSTRUCTIONS,
      "before\n<!-- SYMBOL_LATTICE_START -->\n## SymbolLattice\nold\n<!-- SYMBOL_LATTICE_END -->\nafter\n"
    );

    const result = createCodexUninstall(options(fs, true));
    expect(result).toMatchObject({
      operation: "uninstall",
      status: "applied",
      configuration: { action: "remove" },
      instructions: { action: "remove" },
      transaction: { writes: "completed", consistent: true }
    });
    expect(fs.exists(CONFIG)).toBe(true);
    expect(fs.exists(INSTRUCTIONS)).toBe(true);
    expect(fs.files.get(CONFIG)).toContain("[mcp_servers.other]");
    expect(fs.files.get(CONFIG)).not.toContain("mcp_servers.symbol_lattice");
    expect(fs.files.get(INSTRUCTIONS)).toBe("before\n\nafter\n");
    expect(result.notes).not.toContain(
      "Preview only: no Agent configuration, backup, or project index has been written."
    );
    expect(result.notes).toContain(
      "The selected configuration was atomically updated after its full backup was created."
    );
  });

  it("diagnoses MCP configuration and owned instructions without writing", () => {
    const fs = new MemoryFileSystem();
    createCodexInstall(options(fs, true));
    fs.writes.length = 0;

    const result = createCodexDoctor(options(fs));
    expect(result).toMatchObject({
      mode: "read-only",
      target: "codex",
      configuration: { status: "matches" },
      instructions: { status: "matches", action: "unchanged" }
    });
    expect(fs.writes).toHaveLength(0);
  });
});

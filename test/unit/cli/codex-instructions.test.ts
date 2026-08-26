import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CODEX_INSTRUCTIONS_BLOCK,
  CODEX_INSTRUCTIONS_START,
  planCodexInstructions
} from "../../../src/cli/codex-instructions.js";
import { SYMBOL_LATTICE_VERSION } from "../../../src/version.js";

const PROJECT = resolve("C:/projects/example");
const INSTRUCTIONS = resolve("C:/users/example/.codex/AGENTS.md");
const NOW = new Date("2026-08-15T10:00:00.000Z");

function fileSystem(files: Readonly<Record<string, string>>) {
  return {
    exists: (path: string) => Object.hasOwn(files, path),
    readText: (path: string) => {
      const value = files[path];
      if (value === undefined) throw new Error(`Missing fixture: ${path}`);
      return value;
    }
  };
}

describe("Codex instruction ownership", () => {
  it("generates one complete versioned operational guidance block", () => {
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain(`Guidance version: \`${SYMBOL_LATTICE_VERSION}\``);
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("### Activation and indexing");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("`.SymbolLattice/index.sqlite`");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("run `SymbolLattice status . --json`");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("run `SymbolLattice init .` automatically");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("one outer `.git` repository as one monorepo");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("workspace container");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("every relevant repository separately with its own `projectPath`");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("without claiming cross-repository edges");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("Desktop root");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("Never run `index` or rebuild an existing index");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("Live MCP graph reads enforce strict freshness internally");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("`FRESH_INDEX_REQUIRED`/`PROJECT_NOT_STABLE`");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("`SymbolLattice_explore`");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("before Read, Grep, or broad file reads");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("Treat source returned by explore as already read");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("Use optional specialist tools only when the client lists them");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain(
      "do not conclude that SymbolLattice is uninstalled from that symptom alone"
    );
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("retry the same command once");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain(
      "exact command and project scope were already authorized"
    );
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain(
      "Do not replace it with `init`, `index`, `sync`, install, upgrade"
    );
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain(
      "escalation is unavailable, denied, or the retry still fails"
    );
    expect(CODEX_INSTRUCTIONS_BLOCK).not.toContain("Prefer narrower SymbolLattice tools");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("fall back to targeted `rg` and direct file reads");
    expect(CODEX_INSTRUCTIONS_BLOCK).toContain("pending, unresolved, ambiguous, truncated, or low-confidence");
    expect(CODEX_INSTRUCTIONS_BLOCK).not.toContain("CodeGraph");
    expect(CODEX_INSTRUCTIONS_BLOCK.length).toBeLessThan(4_000);
    expect(CODEX_INSTRUCTIONS_BLOCK).not.toContain("SYMBOL_LATTICE_PERSONAL");
  });

  it("plans a new marked block without writing or changing unrelated content", () => {
    const existing = "# My global instructions\r\n\r\nKeep this text.\r\n";
    const plan = planCodexInstructions("install", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: existing })
    });

    expect(plan).toMatchObject({
      status: "different",
      action: "update",
      path: INSTRUCTIONS,
      originalExists: true,
      originalText: existing,
      backup: { state: "planned" }
    });
    expect(plan.updatedText?.startsWith(existing)).toBe(true);
    expect(plan.updatedText).toContain(CODEX_INSTRUCTIONS_BLOCK.replaceAll("\n", "\r\n"));
  });

  it("updates one existing owned block idempotently and preserves content outside it", () => {
    const existing = `before\n\n<!-- SYMBOL_LATTICE_START -->\nold\n<!-- SYMBOL_LATTICE_END -->\n\nafter\n`;
    const first = planCodexInstructions("install", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: existing })
    });
    expect(first.updatedText).toBe(`before\n\n${CODEX_INSTRUCTIONS_BLOCK}\n\nafter\n`);

    const second = planCodexInstructions("install", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: first.updatedText ?? "" })
    });
    expect(second).toMatchObject({ status: "matches", action: "unchanged", updatedText: null });
  });

  it("blocks malformed or duplicate ownership markers", () => {
    for (const text of [
      "<!-- SYMBOL_LATTICE_START -->\nmissing end\n",
      "<!-- SYMBOL_LATTICE_END -->\n",
      "<!-- SYMBOL_LATTICE_START -->\na\n<!-- SYMBOL_LATTICE_END -->\n<!-- SYMBOL_LATTICE_START -->\nb\n<!-- SYMBOL_LATTICE_END -->\n"
    ]) {
      const plan = planCodexInstructions("install", {
        projectPath: PROJECT,
        instructionsPath: INSTRUCTIONS,
        now: NOW,
        fileSystem: fileSystem({ [INSTRUCTIONS]: text })
      });
      expect(plan).toMatchObject({ status: "invalid", action: "blocked", updatedText: null });
    }
  });

  it("does not treat marker text embedded in user prose as an owned section", () => {
    const existing = `Explain \`${CODEX_INSTRUCTIONS_START}\` without creating ownership.\n`;
    const install = planCodexInstructions("install", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: existing })
    });
    expect(install).toMatchObject({ status: "different", action: "update" });
    expect(install.updatedText).toContain(existing.trimEnd());
    expect(install.updatedText).toContain(`\n${CODEX_INSTRUCTIONS_START}\n`);

    const uninstall = planCodexInstructions("uninstall", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: existing })
    });
    expect(uninstall).toMatchObject({ status: "matches", action: "unchanged" });
    expect(uninstall.updatedText).toBeNull();
  });

  it("removes only the owned block and leaves a configuration file in place", () => {
    const existing = `before\n${CODEX_INSTRUCTIONS_BLOCK}\nafter\n`;
    const plan = planCodexInstructions("uninstall", {
      projectPath: PROJECT,
      instructionsPath: INSTRUCTIONS,
      now: NOW,
      fileSystem: fileSystem({ [INSTRUCTIONS]: existing })
    });

    expect(plan).toMatchObject({ status: "different", action: "remove", originalExists: true });
    expect(plan.updatedText).toBe("before\n\nafter\n");
    expect(plan.updatedText).not.toContain("SYMBOL_LATTICE");
  });
});

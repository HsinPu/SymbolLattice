import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export const CODEX_INSTRUCTIONS_START = "<!-- SYMBOL_LATTICE_START -->";
export const CODEX_INSTRUCTIONS_END = "<!-- SYMBOL_LATTICE_END -->";
export const CODEX_INSTRUCTIONS_BLOCK = `${CODEX_INSTRUCTIONS_START}
## SymbolLattice

When a repository root contains a \`.SymbolLattice\` directory:

- Use the \`SymbolLattice_explore\` MCP tool before grep, find, or broad file reads when locating or understanding code.
- If MCP is unavailable, use \`SymbolLattice explore "<question>"\` from the repository root.
- If \`.SymbolLattice\` is absent, do not create an index automatically; indexing remains the user's decision.
${CODEX_INSTRUCTIONS_END}`;

export type CodexInstructionsOperation = "install" | "uninstall";
export type CodexInstructionsStatus = "missing" | "matches" | "different" | "invalid" | "unreadable";
export type CodexInstructionsAction = "create" | "update" | "remove" | "unchanged" | "blocked";

export interface CodexInstructionsFileSystem {
  readonly exists: (path: string) => boolean;
  readonly readText: (path: string) => string;
}

export interface CodexInstructionsPlanOptions {
  readonly projectPath: string;
  readonly instructionsPath?: string;
  readonly backupDirectory?: string;
  readonly homeDirectory?: string;
  readonly now?: Date;
  readonly fileSystem: CodexInstructionsFileSystem;
}

export interface CodexInstructionsPlan {
  readonly status: CodexInstructionsStatus;
  readonly action: CodexInstructionsAction;
  readonly path: string;
  readonly strategy: "marked-section-upsert" | "marked-section-remove" | "not-applicable";
  readonly originalExists: boolean;
  readonly originalText: string | null;
  readonly updatedText: string | null;
  readonly backup: {
    readonly state: "not-needed" | "planned";
    readonly path: string | null;
  };
  readonly preservesOutsideOwnedSection: boolean;
  readonly diagnostics: readonly string[];
}

export function planCodexInstructions(
  operation: CodexInstructionsOperation,
  options: CodexInstructionsPlanOptions
): CodexInstructionsPlan {
  const path = resolve(
    options.instructionsPath ?? join(options.homeDirectory ?? homedir(), ".codex", "AGENTS.md")
  );
  const exists = options.fileSystem.exists(path);
  if (!exists) {
    if (operation === "uninstall") {
      return unchangedPlan(path, false, null, "missing", "No Codex instruction file exists.");
    }
    return {
      status: "missing",
      action: "create",
      path,
      strategy: "marked-section-upsert",
      originalExists: false,
      originalText: null,
      updatedText: `${CODEX_INSTRUCTIONS_BLOCK}\n`,
      backup: { state: "not-needed", path: null },
      preservesOutsideOwnedSection: true,
      diagnostics: ["A new Codex instruction file will contain only SymbolLattice's marked section."]
    };
  }

  let text: string;
  try {
    text = options.fileSystem.readText(path);
  } catch {
    return blockedPlan(path, true, null, "unreadable", "The Codex instruction file could not be read safely.");
  }

  const range = ownedRange(text);
  if (range === "invalid") {
    return blockedPlan(
      path,
      true,
      text,
      "invalid",
      "Codex instructions contain missing, reversed, or duplicate SymbolLattice ownership markers."
    );
  }

  if (operation === "uninstall") {
    if (range === null) {
      return unchangedPlan(path, true, text, "matches", "No SymbolLattice instruction section is present.");
    }
    return changedPlan(
      path,
      text,
      `${text.slice(0, range.start)}${text.slice(range.end)}`,
      "remove",
      "marked-section-remove",
      options
    );
  }

  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const block = CODEX_INSTRUCTIONS_BLOCK.replaceAll("\n", lineEnding);
  if (range !== null) {
    const updatedText = `${text.slice(0, range.start)}${block}${text.slice(range.end)}`;
    if (updatedText === text) {
      return unchangedPlan(path, true, text, "matches", "The SymbolLattice instruction section already matches.");
    }
    return changedPlan(path, text, updatedText, "update", "marked-section-upsert", options);
  }

  const separator =
    text.length === 0
      ? ""
      : text.endsWith(`${lineEnding}${lineEnding}`)
        ? ""
        : text.endsWith(lineEnding)
          ? lineEnding
          : `${lineEnding}${lineEnding}`;
  return changedPlan(
    path,
    text,
    `${text}${separator}${block}${lineEnding}`,
    "update",
    "marked-section-upsert",
    options
  );
}

function changedPlan(
  path: string,
  originalText: string,
  updatedText: string,
  action: "update" | "remove",
  strategy: "marked-section-upsert" | "marked-section-remove",
  options: CodexInstructionsPlanOptions
): CodexInstructionsPlan {
  return {
    status: "different",
    action,
    path,
    strategy,
    originalExists: true,
    originalText,
    updatedText,
    backup: {
      state: "planned",
      path: nextBackupPath(path, options)
    },
    preservesOutsideOwnedSection: true,
    diagnostics: [
      action === "remove"
        ? "Only SymbolLattice's marked Codex instruction section will be removed."
        : "Only SymbolLattice's marked Codex instruction section will be added or updated."
    ]
  };
}

function unchangedPlan(
  path: string,
  originalExists: boolean,
  originalText: string | null,
  status: "missing" | "matches",
  diagnostic: string
): CodexInstructionsPlan {
  return {
    status,
    action: "unchanged",
    path,
    strategy: "not-applicable",
    originalExists,
    originalText,
    updatedText: null,
    backup: { state: "not-needed", path: null },
    preservesOutsideOwnedSection: true,
    diagnostics: [diagnostic]
  };
}

function blockedPlan(
  path: string,
  originalExists: boolean,
  originalText: string | null,
  status: "invalid" | "unreadable",
  diagnostic: string
): CodexInstructionsPlan {
  return {
    status,
    action: "blocked",
    path,
    strategy: "not-applicable",
    originalExists,
    originalText,
    updatedText: null,
    backup: { state: "not-needed", path: null },
    preservesOutsideOwnedSection: false,
    diagnostics: [diagnostic]
  };
}

function ownedRange(text: string): { readonly start: number; readonly end: number } | null | "invalid" {
  const starts = standaloneLineOccurrences(text, CODEX_INSTRUCTIONS_START);
  const ends = standaloneLineOccurrences(text, CODEX_INSTRUCTIONS_END);
  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0] === undefined || ends[0] === undefined) {
    return "invalid";
  }
  if (starts[0] >= ends[0]) return "invalid";
  return { start: starts[0], end: ends[0] + CODEX_INSTRUCTIONS_END.length };
}

function standaloneLineOccurrences(text: string, value: string): number[] {
  const indexes: number[] = [];
  for (let offset = 0; ; ) {
    const index = text.indexOf(value, offset);
    if (index < 0) return indexes;
    const beforeIsLineBoundary = index === 0 || text[index - 1] === "\n";
    const after = index + value.length;
    const afterIsLineBoundary =
      after === text.length || text[after] === "\n" || (text[after] === "\r" && text[after + 1] === "\n");
    if (beforeIsLineBoundary && afterIsLineBoundary) indexes.push(index);
    offset = index + value.length;
  }
}

function nextBackupPath(path: string, options: CodexInstructionsPlanOptions): string {
  const directory =
    options.backupDirectory === undefined
      ? join(resolve(options.projectPath), ".SymbolLattice", "mcp-backups")
      : resolve(requireNonEmpty(options.backupDirectory, "backup directory"));
  const timestamp = (options.now ?? new Date()).toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const prefix = `${timestamp}-codex-${basename(path)}`;
  for (let suffix = 0; ; suffix += 1) {
    const candidate = join(directory, `${prefix}${suffix === 0 ? "" : `-${suffix}`}.bak`);
    if (!options.fileSystem.exists(candidate)) return candidate;
  }
}

function requireNonEmpty(value: string, description: string): string {
  if (value.trim().length === 0) throw new Error(`Expected a non-empty ${description}.`);
  return value;
}

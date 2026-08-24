import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { AUTOMATIC_PROJECT_INDEX_GUIDANCE } from "../agent-guidance.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";

export const CODEX_INSTRUCTIONS_START = "<!-- SYMBOL_LATTICE_START -->";
export const CODEX_INSTRUCTIONS_END = "<!-- SYMBOL_LATTICE_END -->";
export const CODEX_INSTRUCTIONS_BLOCK = `${CODEX_INSTRUCTIONS_START}
## SymbolLattice

Guidance version: \`${SYMBOL_LATTICE_VERSION}\`

### Version and activation

- This installer-managed guidance was generated for SymbolLattice \`${SYMBOL_LATTICE_VERSION}\`. Before relying on version-sensitive behavior, run \`SymbolLattice --version\`; the runtime result is authoritative. If it differs, report the mismatch and refresh the Codex installation.
- Treat a repository as queryable only when its root contains \`.SymbolLattice/index.sqlite\`. A \`.SymbolLattice\` directory by itself may contain only backups or diagnostics and does not prove that an index exists.
${AUTOMATIC_PROJECT_INDEX_GUIDANCE}

### Query routing

- Use the \`SymbolLattice_explore\` MCP tool before grep, find, or broad file reads when locating or understanding code.
- Use the narrowest follow-up tool that fits the question: \`SymbolLattice_node\`, \`SymbolLattice_file\`, or \`SymbolLattice_context\` for exact source context; \`SymbolLattice_impact\`, \`SymbolLattice_affected\`, or \`SymbolLattice_git_hunks\` for change impact; and \`SymbolLattice_history\` or \`SymbolLattice_diff\` for generation history.
- If MCP is unavailable, use the equivalent \`SymbolLattice\` CLI command from the repository root.
- If an existing index is stale, incompatible, or the query returns no relevant evidence, say so briefly and fall back to targeted \`rg\` and direct file reads. A missing index follows the automatic initialization policy above.

### Evidence and safety

- Treat exact symbols, source ranges, and edges as evidence. Treat pending, unresolved, ambiguous, truncated, or low-confidence results as incomplete rather than established facts.
- When graph evidence conflicts with the current working tree, verify the current files directly and state the mismatch.
- Do not edit files inside \`.SymbolLattice\` manually. Treat the directory as generated local state and do not commit it unless repository policy explicitly requires it.
- Avoid repeated graph queries after a clear miss; switch to the smallest targeted filesystem check needed to continue.
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

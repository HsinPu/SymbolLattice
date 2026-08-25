import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE,
  ProjectPathUnreadableError,
  type ProjectPathUnreadableEvidence
} from "../../domain/project-path-access.js";

export { MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE } from "../../domain/project-path-access.js";

/** Directories that are never traversed, regardless of scope or ignore rules. */
export const HARD_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  ".SymbolLattice",
  "node_modules",
  "dist",
  "coverage"
]);

/** Bounded default generated/cache directories. Explicit scopes may opt in. */
export const DEFAULT_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".tmp",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  "pytest-history",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".hypothesis",
  ".ipynb_checkpoints",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vite",
  ".parcel-cache",
  ".gradle",
  ".dart_tool",
  ".build",
  "build",
  "out",
  ".output",
  "target"
]);

export type ProjectFilesystemEntryKind = "file" | "directory" | "other";

export interface ProjectFilesystemEntry {
  readonly name: string;
  readonly kind: ProjectFilesystemEntryKind;
}

export interface ProjectFilesystemStat {
  readonly kind: ProjectFilesystemEntryKind;
}

/**
 * Minimal filesystem boundary used by discovery. Keeping this seam small lets
 * tests model permission, missing-path, and ordering behavior without touching
 * the host filesystem.
 */
export interface ProjectFilesystemReader {
  readdir(directoryPath: string): Promise<readonly ProjectFilesystemEntry[]>;
  readFile(filePath: string): Promise<Uint8Array>;
  stat(filePath: string): Promise<ProjectFilesystemStat>;
}

export const nativeProjectFilesystemReader: ProjectFilesystemReader = Object.freeze({
  async readdir(directoryPath: string): Promise<readonly ProjectFilesystemEntry[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"
    }));
  },
  async readFile(filePath: string): Promise<Uint8Array> {
    return readFile(filePath);
  },
  async stat(filePath: string): Promise<ProjectFilesystemStat> {
    const metadata = await stat(filePath);
    return { kind: metadata.isDirectory() ? "directory" : metadata.isFile() ? "file" : "other" };
  }
});

export async function readProjectFilesystemText(
  reader: ProjectFilesystemReader,
  filePath: string
): Promise<string> {
  return new TextDecoder("utf-8").decode(await reader.readFile(filePath));
}

export function projectFilesystemAccessCode(error: unknown): "EACCES" | "EPERM" | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = error.code;
  return code === "EACCES" || code === "EPERM" ? code : null;
}

export function projectFilesystemMissingCode(error: unknown): "ENOENT" | "ENOTDIR" | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = error.code;
  return code === "ENOENT" || code === "ENOTDIR" ? code : null;
}

/**
 * Collects access failures from sibling reads. One path contributes at most
 * one bounded evidence item; a repeated retry cannot consume the evidence
 * budget. Other filesystem errors remain the caller's responsibility.
 */
export class ProjectPathAccessCollector {
  private readonly projectPath: string;
  private readonly byPath = new Map<string, "EACCES" | "EPERM">();

  public constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  public add(path: string, error: unknown): boolean {
    const code = projectFilesystemAccessCode(error);
    if (code === null) {
      return false;
    }

    const relativePath = projectRelativeAccessPath(this.projectPath, path);
    const previous = this.byPath.get(relativePath);
    if (previous === undefined || code < previous) {
      this.byPath.set(relativePath, code);
    }
    return true;
  }

  public get hasErrors(): boolean {
    return this.byPath.size > 0;
  }

  public get evidence(): readonly ProjectPathUnreadableEvidence[] {
    return [...this.byPath.entries()]
      .sort(([leftPath, leftCode], [rightPath, rightCode]) =>
        leftPath < rightPath || (leftPath === rightPath && leftCode < rightCode) ? -1 : 1
      )
      .slice(0, MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE)
      .map(([path, code]) => ({ path, code }));
  }

  public toError(): ProjectPathUnreadableError | null {
    return this.hasErrors ? new ProjectPathUnreadableError(this.evidence, this.byPath.size) : null;
  }

  public throwIfAny(): void {
    const error = this.toError();
    if (error !== null) {
      throw error;
    }
  }
}

function projectRelativeAccessPath(projectPath: string, path: string): string {
  const normalizedPath = isAbsolute(path) ? resolve(path) : resolve(projectPath, path);
  const value = relative(projectPath, normalizedPath);
  if (value === "") {
    return ".";
  }
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    return "<outside-project>";
  }
  return value.split(sep).join("/");
}

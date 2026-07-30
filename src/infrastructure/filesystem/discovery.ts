import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

import ignore, { type Ignore } from "ignore";

import type { ArtifactLanguage } from "../../domain/index.js";

export type SupportedLanguage = ArtifactLanguage;

export const SUPPORTED_EXTENSIONS: ReadonlyMap<string, SupportedLanguage> = new Map([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".java", "java"],
  [".php", "php"],
  [".cpp", "cpp"],
  [".cc", "cpp"],
  [".cxx", "cpp"],
  [".hpp", "cpp"],
  [".hh", "cpp"],
  [".hxx", "cpp"],
  [".cs", "csharp"],
  [".rb", "ruby"],
  [".kt", "kotlin"],
  [".swift", "swift"],
  [".dart", "dart"]
] as const);

/**
 * These directories contain neither user source nor SymbolLattice input. They
 * are deliberately outside `.gitignore` semantics, so a negated rule can
 * never pull one back into an index.
 */
export const HARD_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  ".symbol-lattice",
  "coverage",
  "dist",
  "node_modules"
]);

export interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly sourceText: string;
  readonly contentHash: string;
}

export interface SourceDiscoveryOptions {
  /** Source directories relative to the project root. Defaults to the project root. */
  readonly scopeRoots?: readonly string[];
}

/**
 * A stable byte-wise comparison avoids host locale settings affecting graph
 * input order. All paths passed here are normalized POSIX project-relative
 * strings.
 */
export function compareProjectPaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function toProjectRelativePath(projectPath: string, targetPath: string): string {
  const normalizedProjectPath = resolve(projectPath);
  const normalizedTargetPath = isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolve(normalizedProjectPath, targetPath);
  const value = relative(normalizedProjectPath, normalizedTargetPath);

  if (
    value === "" ||
    value === ".." ||
    value.startsWith(`..${sep}`) ||
    isAbsolute(value)
  ) {
    throw new Error(`Path is outside the project: ${targetPath}`);
  }

  return value.split(sep).join("/");
}

/**
 * Canonicalize directory scopes once, before walking any files. An empty list
 * has the same meaning as an omitted list: index the project root.
 */
export async function canonicalizeScopeRoots(
  projectPath: string,
  scopeRoots?: readonly string[]
): Promise<readonly string[]> {
  const normalizedProjectPath = resolve(projectPath);
  const requestedRoots = scopeRoots === undefined || scopeRoots.length === 0 ? ["."] : scopeRoots;
  const canonicalRoots = new Set<string>();

  for (const scopeRoot of requestedRoots) {
    if (isAbsolute(scopeRoot)) {
      throw new Error(`Scope root must be project-relative: ${scopeRoot}`);
    }

    const absoluteScopeRoot = resolve(normalizedProjectPath, scopeRoot);
    const relativeScopeRoot = toProjectRelativeDirectoryPath(
      normalizedProjectPath,
      absoluteScopeRoot,
      scopeRoot
    );
    const metadata = await stat(absoluteScopeRoot);

    if (!metadata.isDirectory()) {
      throw new Error(`Scope root is not a directory: ${scopeRoot}`);
    }

    canonicalRoots.add(relativeScopeRoot);
  }

  const sortedRoots = [...canonicalRoots].sort(compareProjectPaths);
  return sortedRoots.filter(
    (candidate, index) =>
      !sortedRoots.slice(0, index).some((ancestor) => isScopeAncestor(ancestor, candidate))
  );
}

export function getSourceLanguage(filePath: string): SupportedLanguage | null {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.get(extension) ?? null;
}

export function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function isUnsafeProjectPath(projectPath: string): boolean {
  const normalizedPath = resolve(projectPath);
  return normalizedPath === parse(normalizedPath).root || normalizedPath === resolve(homedir());
}

export async function discoverSourceFiles(
  projectPath: string,
  options?: SourceDiscoveryOptions
): Promise<readonly SourceFile[]> {
  const normalizedProjectPath = resolve(projectPath);
  const scopeRoots = await canonicalizeScopeRoots(normalizedProjectPath, options?.scopeRoots);
  const ignoreMatcher = await loadRootGitignore(normalizedProjectPath);
  const paths = (
    await Promise.all(
      scopeRoots.map(async (scopeRoot) => {
        if (containsHardExcludedDirectory(scopeRoot)) {
          return [];
        }

        return collectSourcePaths(
          resolve(normalizedProjectPath, scopeRoot),
          scopeRoot,
          ignoreMatcher
        );
      })
    )
  ).flat();
  const sourceFiles = await Promise.all(
    paths.map(async (absolutePath) => {
      const sourceText = await readFile(absolutePath, "utf8");
      const language = getSourceLanguage(absolutePath);

      if (language === null) {
        throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
      }

      return {
        absolutePath,
        relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
        language,
        sourceText,
        contentHash: hashSource(sourceText)
      };
    })
  );

  return sourceFiles.sort((left, right) => compareProjectPaths(left.relativePath, right.relativePath));
}

async function collectSourcePaths(
  directoryPath: string,
  directoryRelativePath: string,
  ignoreMatcher: Ignore
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sourcePaths: string[] = [];

  for (const entry of entries.sort((left, right) => compareProjectPaths(left.name, right.name))) {
    const entryPath = resolve(directoryPath, entry.name);
    const entryRelativePath = joinProjectRelativePath(directoryRelativePath, entry.name);

    if (entry.isDirectory()) {
      if (!HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        // Never prune an ordinary ignored directory here. Gitignore negation
        // rules can re-include descendants, so every non-hard-excluded branch
        // must still be inspected.
        sourcePaths.push(
          ...(await collectSourcePaths(entryPath, entryRelativePath, ignoreMatcher))
        );
      }
      continue;
    }

    if (
      entry.isFile() &&
      getSourceLanguage(entry.name) !== null &&
      !ignoreMatcher.ignores(entryRelativePath)
    ) {
      sourcePaths.push(entryPath);
    }
  }

  return sourcePaths;
}

async function loadRootGitignore(projectPath: string): Promise<Ignore> {
  const matcher = ignore({ ignoreCase: false });
  const gitignorePath = resolve(projectPath, ".gitignore");

  try {
    matcher.add(await readFile(gitignorePath, "utf8"));
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  return matcher;
}

function toProjectRelativeDirectoryPath(
  projectPath: string,
  targetPath: string,
  originalScopeRoot: string
): string {
  const value = relative(projectPath, targetPath);

  if (value === "") {
    return ".";
  }

  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error(`Scope root is outside the project: ${originalScopeRoot}`);
  }

  return value.split(sep).join("/");
}

function isScopeAncestor(ancestor: string, candidate: string): boolean {
  return ancestor === "." || candidate.startsWith(`${ancestor}/`);
}

function containsHardExcludedDirectory(relativePath: string): boolean {
  return relativePath !== "." && relativePath.split("/").some((name) => HARD_EXCLUDED_DIRECTORY_NAMES.has(name));
}

function joinProjectRelativePath(directoryPath: string, entryName: string): string {
  return directoryPath === "." ? entryName : `${directoryPath}/${entryName}`;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

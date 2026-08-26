import { isAbsolute, relative, resolve, sep } from "node:path";

import ignore, { type Ignore } from "ignore";

import {
  HARD_EXCLUDED_DIRECTORY_NAMES,
  containsHardExcludedDirectory,
  isDefaultExcludedDirectoryName,
  nativeProjectFilesystemReader,
  ProjectPathAccessCollector,
  projectFilesystemMissingCode,
  readProjectFilesystemText,
  type ProjectFilesystemEntry,
  type ProjectFilesystemReader
} from "./project-filesystem.js";

export interface ScopedProjectWalkOptions {
  readonly scopeRoots?: readonly string[];
  readonly reader?: ProjectFilesystemReader;
  readonly isSourceCandidate?: (
    relativePath: string,
    absolutePath: string
  ) => boolean | Promise<boolean>;
  readonly isConfigurationCandidateFileName?: (fileName: string) => boolean;
}

export interface ScopedProjectWalkResult {
  readonly scopeRoots: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly configurationPaths: readonly string[];
}

interface IgnoreFrame {
  readonly basePath: string;
  readonly matcher: Ignore;
}

interface IgnoreDecision {
  readonly ignored: boolean;
  readonly unignored: boolean;
}

interface SourcePathEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
}

/** Stable byte-wise ordering for normalized project-relative paths. */
export function compareScopedProjectPaths(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Canonicalize directory scopes before walking. Access failures across
 * multiple explicit roots are aggregated; hard-excluded roots are never read.
 */
export async function canonicalizeScopedProjectRoots(
  projectPath: string,
  scopeRoots?: readonly string[],
  reader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<readonly string[]> {
  const normalizedProjectPath = resolve(projectPath);
  const requestedRoots = scopeRoots === undefined || scopeRoots.length === 0 ? ["."] : scopeRoots;
  const canonicalRoots = new Set<string>();
  const access = new ProjectPathAccessCollector(normalizedProjectPath);

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
    if (containsHardExcludedDirectory(relativeScopeRoot)) {
      canonicalRoots.add(relativeScopeRoot);
      continue;
    }

    try {
      const metadata = await reader.stat(absoluteScopeRoot);
      if (!metadata.isDirectory()) {
        throw new Error(`Scope root is not a directory: ${scopeRoot}`);
      }
      canonicalRoots.add(relativeScopeRoot);
    } catch (error) {
      if (projectFilesystemMissingCode(error) !== null) continue;
      if (access.add(absoluteScopeRoot, error)) {
        continue;
      }
      throw error;
    }
  }

  access.throwIfAny();
  const sortedRoots = [...canonicalRoots].sort(compareScopedProjectPaths);
  return sortedRoots.filter(
    (candidate, index) =>
      !sortedRoots.slice(0, index).some((ancestor) => isScopeAncestor(ancestor, candidate))
  );
}

/**
 * One deterministic traversal shared by source, freshness, and configuration
 * discovery. Nested ignore files are evaluated relative to their directory.
 */
export async function walkScopedProject(
  projectPath: string,
  options: ScopedProjectWalkOptions = {}
): Promise<ScopedProjectWalkResult> {
  const normalizedProjectPath = resolve(projectPath);
  const reader = options.reader ?? nativeProjectFilesystemReader;
  const canonicalScopeRoots = await canonicalizeScopedProjectRoots(
    normalizedProjectPath,
    options.scopeRoots,
    reader
  );
  const sourceScopeRoots = canonicalScopeRoots.filter(
    (scopeRoot) => !containsHardExcludedDirectory(scopeRoot)
  );
  const explicitlySelectedScopeRoots =
    options.scopeRoots === undefined || options.scopeRoots.length === 0
      ? []
      : sourceScopeRoots.filter((scopeRoot) => scopeRoot !== ".");
  const access = new ProjectPathAccessCollector(normalizedProjectPath);
  const sources: SourcePathEntry[] = [];
  const configurationPaths = new Set<string>();
  const collectsConfiguration = options.isConfigurationCandidateFileName !== undefined;

  async function visit(
    directoryPath: string,
    directoryRelativePath: string,
    inheritedFrames: readonly IgnoreFrame[]
  ): Promise<void> {
    let entries: readonly ProjectFilesystemEntry[];
    try {
      entries = await reader.readdir(directoryPath);
    } catch (error) {
      if (projectFilesystemMissingCode(error) !== null) return;
      if (access.add(directoryPath, error)) return;
      throw error;
    }

    const sortedEntries = [...entries].sort((left, right) =>
      compareScopedProjectPaths(left.name, right.name)
    );
    const localIgnore = sortedEntries.find(
      (entry) => entry.isFile() && entry.name === ".gitignore"
    );
    let frames = inheritedFrames;
    if (localIgnore !== undefined) {
      const ignorePath = resolve(directoryPath, localIgnore.name);
      const ignoreRelativePath = joinProjectRelativePath(directoryRelativePath, localIgnore.name);
      try {
        const contents = await readProjectFilesystemText(reader, ignorePath);
        frames = [
          ...inheritedFrames,
          {
            basePath: directoryRelativePath,
            matcher: ignore({ ignoreCase: false }).add(contents)
          }
        ];
        if (collectsConfiguration) configurationPaths.add(ignoreRelativePath);
      } catch (error) {
        if (projectFilesystemMissingCode(error) === null && !access.add(ignorePath, error)) {
          throw error;
        }
      }
    }

    for (const entry of sortedEntries) {
      if (entry.name === ".gitignore" && entry.isFile()) continue;
      const entryPath = resolve(directoryPath, entry.name);
      const entryRelativePath = joinProjectRelativePath(directoryRelativePath, entry.name);

      if (entry.isDirectory()) {
        if (HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
        const ignoreDecision = testIgnoreFrames(frames, entryRelativePath, true);
        if (ignoreDecision.ignored) continue;
        if (
          isDefaultExcludedDirectoryName(entry.name) &&
          !ignoreDecision.unignored &&
          !explicitScopeOverridesDefault(entryRelativePath, explicitlySelectedScopeRoots)
        ) {
          continue;
        }
        if (
          !collectsConfiguration &&
          options.isSourceCandidate !== undefined &&
          !overlapsAnyScope(entryRelativePath, sourceScopeRoots)
        ) {
          continue;
        }
        await visit(entryPath, entryRelativePath, frames);
        continue;
      }

      if (!entry.isFile()) continue;
      if (testIgnoreFrames(frames, entryRelativePath, false).ignored) continue;
      if (options.isConfigurationCandidateFileName?.(entry.name) === true) {
        configurationPaths.add(entryRelativePath);
      }
      if (
        options.isSourceCandidate === undefined ||
        !insideAnyScope(entryRelativePath, sourceScopeRoots)
      ) {
        continue;
      }
      try {
        if (await options.isSourceCandidate(entryRelativePath, entryPath)) {
          sources.push({ absolutePath: entryPath, relativePath: entryRelativePath });
        }
      } catch (error) {
        if (projectFilesystemMissingCode(error) !== null) continue;
        if (access.add(entryPath, error)) continue;
        throw error;
      }
    }
  }

  if (collectsConfiguration || (options.isSourceCandidate !== undefined && sourceScopeRoots.length > 0)) {
    await visit(normalizedProjectPath, ".", []);
  }
  access.throwIfAny();

  return {
    scopeRoots: sourceScopeRoots,
    sourcePaths: sources
      .sort((left, right) => compareScopedProjectPaths(left.relativePath, right.relativePath))
      .map((entry) => entry.absolutePath),
    configurationPaths: [...configurationPaths].sort(compareScopedProjectPaths)
  };
}

function testIgnoreFrames(
  frames: readonly IgnoreFrame[],
  relativePath: string,
  directory: boolean
): IgnoreDecision {
  let decision: IgnoreDecision = { ignored: false, unignored: false };
  for (const frame of frames) {
    const path = pathRelativeToFrame(frame.basePath, relativePath);
    if (path === null || path.length === 0) continue;
    const result = frame.matcher.test(directory ? `${path}/` : path);
    if (result.ignored) decision = { ignored: true, unignored: false };
    else if (result.unignored) decision = { ignored: false, unignored: true };
  }
  return decision;
}

function pathRelativeToFrame(basePath: string, path: string): string | null {
  if (basePath === ".") return path;
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length + 1) : null;
}

function insideAnyScope(path: string, scopeRoots: readonly string[]): boolean {
  return scopeRoots.some((scopeRoot) => scopeRoot === "." || path.startsWith(`${scopeRoot}/`));
}

function overlapsAnyScope(path: string, scopeRoots: readonly string[]): boolean {
  return scopeRoots.some(
    (scopeRoot) =>
      scopeRoot === "." ||
      path === scopeRoot ||
      path.startsWith(`${scopeRoot}/`) ||
      scopeRoot.startsWith(`${path}/`)
  );
}

function explicitScopeOverridesDefault(
  path: string,
  explicitScopeRoots: readonly string[]
): boolean {
  return overlapsAnyScope(path, explicitScopeRoots);
}

function toProjectRelativeDirectoryPath(
  projectPath: string,
  targetPath: string,
  originalScopeRoot: string
): string {
  const value = relative(projectPath, targetPath);
  if (value === "") return ".";
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error(`Scope root is outside the project: ${originalScopeRoot}`);
  }
  return value.split(sep).join("/");
}

function isScopeAncestor(ancestor: string, candidate: string): boolean {
  return ancestor === "." || candidate.startsWith(`${ancestor}/`);
}

function joinProjectRelativePath(directoryPath: string, entryName: string): string {
  return directoryPath === "." ? entryName : `${directoryPath}/${entryName}`;
}

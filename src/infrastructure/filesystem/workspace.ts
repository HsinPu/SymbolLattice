import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  compareStableText,
  ProjectConfigurationError,
  type ProjectConfigurationInput
} from "../../domain/index.js";
import type {
  ProjectModuleResolver,
  ResolvedModule,
  SourceDocument
} from "../../ports/source-catalog.js";
import {
  HARD_EXCLUDED_DIRECTORY_NAMES
} from "./discovery.js";
import { readProjectConfigurationInput } from "./project-inputs.js";

const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"] as const;
const PACKAGE_NAME_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

interface WorkspacePattern {
  readonly excludes: boolean;
  readonly segments: readonly string[];
}

interface ExportMapping {
  readonly subpathPattern: string;
  readonly targetPatterns: readonly string[];
}

interface PackageExports {
  readonly rootTargetPatterns: readonly string[];
  readonly mappings: readonly ExportMapping[];
}

interface WorkspacePackage {
  readonly name: string;
  readonly manifestPath: string;
  readonly manifestInput: ProjectConfigurationInput;
  readonly packageRootPath: string;
  readonly exports: PackageExports | null;
  readonly fallbackTargetPatterns: readonly string[];
}

interface LoadedManifest {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly input: ProjectConfigurationInput;
  readonly value: Record<string, unknown>;
}

interface ParsedPackageSpecifier {
  readonly packageName: string;
  readonly subpath: string;
}

export interface WorkspaceProjectModuleResolver {
  readonly moduleResolver: ProjectModuleResolver;
  /** Root and selected workspace manifests persisted with the graph generation. */
  readonly configurationInputs: readonly ProjectConfigurationInput[];
}

function configurationError(path: string, message: string): ProjectConfigurationError {
  return new ProjectConfigurationError(`Invalid workspace configuration at ${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectRelativePath(projectPath: string, absolutePath: string): string | null {
  const value = relative(projectPath, absolutePath);
  if (value === "" || value === ".") {
    return null;
  }

  if (
    isAbsolute(value) ||
    value === ".." ||
    value.startsWith(`..${sep}`)
  ) {
    return null;
  }

  return value.replaceAll("\\", "/");
}

function isWithinDirectory(directoryPath: string, candidatePath: string): boolean {
  const value = relative(directoryPath, candidatePath);
  return (
    value === "" ||
    (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`))
  );
}

function parseManifest(sourceText: string, relativePath: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw configurationError(relativePath, `cannot parse JSON (${reason})`);
  }

  if (!isRecord(parsed)) {
    throw configurationError(relativePath, "the manifest root must be an object");
  }

  return parsed;
}

async function loadPresentManifest(
  projectPath: string,
  relativePath: string,
  kind: "workspace-root-manifest" | "workspace-package-manifest"
): Promise<LoadedManifest> {
  const input = await readProjectConfigurationInput(projectPath, kind, relativePath);
  if (input.state !== "present") {
    throw configurationError(relativePath, "the manifest disappeared while the workspace was scanned");
  }

  const absolutePath = resolve(projectPath, ...input.path.split("/"));
  let sourceText: string;
  try {
    sourceText = await readFile(absolutePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw configurationError(input.path, reason);
  }

  return {
    absolutePath,
    relativePath: input.path,
    input,
    value: parseManifest(sourceText, input.path)
  };
}

function normalizeWorkspacePattern(value: unknown, manifestPath: string): WorkspacePattern {
  if (typeof value !== "string") {
    throw configurationError(manifestPath, 'every "workspaces" pattern must be a string');
  }

  let rawPattern = value;
  const excludes = rawPattern.startsWith("!");
  if (excludes) {
    rawPattern = rawPattern.slice(1);
  }

  if (
    rawPattern === "" ||
    rawPattern.includes("\\") ||
    rawPattern.includes("\u0000") ||
    isAbsolute(rawPattern) ||
    rawPattern.startsWith("/")
  ) {
    throw configurationError(manifestPath, `workspace pattern must be project-relative: ${value}`);
  }

  const segments = rawPattern.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        HARD_EXCLUDED_DIRECTORY_NAMES.has(segment)
    )
  ) {
    throw configurationError(manifestPath, `workspace pattern is unsafe: ${value}`);
  }

  return { excludes, segments };
}

function parseWorkspacePatterns(manifest: LoadedManifest): readonly WorkspacePattern[] {
  const workspaces = manifest.value.workspaces;
  if (workspaces === undefined) {
    return [];
  }

  let patterns: unknown;
  if (Array.isArray(workspaces)) {
    patterns = workspaces;
  } else if (isRecord(workspaces)) {
    patterns = workspaces.packages;
  } else {
    throw configurationError(
      manifest.relativePath,
      'the "workspaces" field must be an array or an object with a "packages" array'
    );
  }

  if (!Array.isArray(patterns)) {
    throw configurationError(
      manifest.relativePath,
      'the "workspaces.packages" field must be an array'
    );
  }

  return patterns.map((pattern) => normalizeWorkspacePattern(pattern, manifest.relativePath));
}

function segmentMatches(pattern: string, value: string): boolean {
  let patternIndex = 0;
  let valueIndex = 0;
  let wildcardIndex = -1;
  let wildcardValueIndex = -1;

  while (valueIndex < value.length) {
    const patternCharacter = pattern[patternIndex];
    if (patternCharacter === value[valueIndex]) {
      patternIndex += 1;
      valueIndex += 1;
      continue;
    }

    if (patternCharacter === "*") {
      wildcardIndex = patternIndex;
      patternIndex += 1;
      wildcardValueIndex = valueIndex;
      continue;
    }

    if (wildcardIndex !== -1) {
      patternIndex = wildcardIndex + 1;
      wildcardValueIndex += 1;
      valueIndex = wildcardValueIndex;
      continue;
    }

    return false;
  }

  while (pattern[patternIndex] === "*") {
    patternIndex += 1;
  }

  return patternIndex === pattern.length;
}

function workspacePathMatches(
  patternSegments: readonly string[],
  pathSegments: readonly string[],
  patternIndex = 0,
  pathIndex = 0
): boolean {
  const patternSegment = patternSegments[patternIndex];
  if (patternSegment === undefined) {
    return pathIndex === pathSegments.length;
  }

  if (patternSegment === "**") {
    if (patternIndex === patternSegments.length - 1) {
      return true;
    }

    for (let candidateIndex = pathIndex; candidateIndex <= pathSegments.length; candidateIndex += 1) {
      if (workspacePathMatches(patternSegments, pathSegments, patternIndex + 1, candidateIndex)) {
        return true;
      }
    }

    return false;
  }

  const pathSegment = pathSegments[pathIndex];
  return (
    pathSegment !== undefined &&
    segmentMatches(patternSegment, pathSegment) &&
    workspacePathMatches(patternSegments, pathSegments, patternIndex + 1, pathIndex + 1)
  );
}

function matchesWorkspacePatterns(
  packageDirectoryPath: string,
  patterns: readonly WorkspacePattern[]
): boolean {
  const pathSegments = packageDirectoryPath.split("/");
  const includes = patterns.filter((pattern) => !pattern.excludes);

  return (
    includes.some((pattern) => workspacePathMatches(pattern.segments, pathSegments)) &&
    !patterns.some(
      (pattern) =>
        pattern.excludes && workspacePathMatches(pattern.segments, pathSegments)
    )
  );
}

function discoverWorkspaceManifestPaths(
  configurationCandidatePaths: readonly string[],
  patterns: readonly WorkspacePattern[]
): readonly string[] {
  if (!patterns.some((pattern) => !pattern.excludes)) return [];
  const manifestSuffix = "/package.json";
  return configurationCandidatePaths
    .filter((path) => path.endsWith(manifestSuffix))
    .filter((path) => matchesWorkspacePatterns(
      path.slice(0, -manifestSuffix.length),
      patterns
    ))
    .sort(compareStableText);
}

function validatePackageName(value: unknown, manifestPath: string): string {
  if (typeof value !== "string" || value === "" || /\s/u.test(value) || value.includes("\\")) {
    throw configurationError(manifestPath, 'the workspace package "name" must be a non-empty package specifier');
  }

  if (value.startsWith("@")) {
    const parts = value.split("/");
    const scope = parts[0]?.slice(1);
    const packageSegment = parts[1];
    if (
      parts.length !== 2 ||
      scope === undefined ||
      packageSegment === undefined ||
      !PACKAGE_NAME_SEGMENT.test(scope) ||
      !PACKAGE_NAME_SEGMENT.test(packageSegment)
    ) {
      throw configurationError(manifestPath, `invalid workspace package name: ${value}`);
    }
    return value;
  }

  if (value.includes("/") || !PACKAGE_NAME_SEGMENT.test(value)) {
    throw configurationError(manifestPath, `invalid workspace package name: ${value}`);
  }

  return value;
}

function orderedConditionKeys(value: Record<string, unknown>): readonly string[] {
  const preferred = ["types", "source", "import", "module", "default", "require"];
  const remaining = Object.keys(value)
    .filter((key) => !preferred.includes(key))
    .sort(compareStableText);

  return [
    ...preferred.filter((key) => Object.hasOwn(value, key)),
    ...remaining
  ];
}

function parseEntryTargetPatterns(
  value: unknown,
  manifestPath: string,
  fieldPath: string
): readonly string[] {
  if (value === null) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      parseEntryTargetPatterns(entry, manifestPath, `${fieldPath}[${index}]`)
    );
  }

  if (!isRecord(value)) {
    throw configurationError(manifestPath, `${fieldPath} must be a string, array, object, or null`);
  }

  return orderedConditionKeys(value).flatMap((key) =>
    parseEntryTargetPatterns(value[key], manifestPath, `${fieldPath}.${key}`)
  );
}

function validateExportSubpath(value: string, manifestPath: string): string {
  if (value === ".") {
    return value;
  }

  if (!value.startsWith("./")) {
    throw configurationError(manifestPath, `export subpath must start with "./": ${value}`);
  }

  const segments = value.slice(2).split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        HARD_EXCLUDED_DIRECTORY_NAMES.has(segment)
    )
  ) {
    throw configurationError(manifestPath, `export subpath is unsafe: ${value}`);
  }

  if (value.split("*").length > 2) {
    throw configurationError(manifestPath, `export subpath supports at most one wildcard: ${value}`);
  }

  return value;
}

function parsePackageExports(value: unknown, manifestPath: string): PackageExports {
  if (!isRecord(value)) {
    return {
      rootTargetPatterns: parseEntryTargetPatterns(value, manifestPath, "exports"),
      mappings: []
    };
  }

  const keys = Object.keys(value).sort(compareStableText);
  const hasSubpathKeys = keys.some((key) => key.startsWith("."));
  if (hasSubpathKeys && keys.some((key) => !key.startsWith("."))) {
    throw configurationError(manifestPath, 'the "exports" field cannot mix subpaths and conditions');
  }

  if (!hasSubpathKeys) {
    return {
      rootTargetPatterns: parseEntryTargetPatterns(value, manifestPath, "exports"),
      mappings: []
    };
  }

  const mappings: ExportMapping[] = [];
  let rootTargetPatterns: readonly string[] = [];
  for (const key of keys) {
    const subpathPattern = validateExportSubpath(key, manifestPath);
    const targetPatterns = parseEntryTargetPatterns(value[key], manifestPath, `exports.${key}`);
    if (subpathPattern === ".") {
      rootTargetPatterns = targetPatterns;
    } else {
      mappings.push({ subpathPattern, targetPatterns });
    }
  }

  return { rootTargetPatterns, mappings };
}

function fallbackTargetPatterns(manifest: LoadedManifest): readonly string[] {
  const entries: string[] = [];
  for (const fieldName of ["source", "types", "module", "main"] as const) {
    const value = manifest.value[fieldName];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      throw configurationError(manifest.relativePath, `the "${fieldName}" field must be a string`);
    }
    entries.push(value);
  }

  return [...entries, "src/index", "index"];
}

function parseWorkspacePackage(manifest: LoadedManifest): WorkspacePackage {
  const packageRootPath = dirname(manifest.absolutePath);
  const exportsValue = manifest.value.exports;
  const workspacePackage: WorkspacePackage = {
    name: validatePackageName(manifest.value.name, manifest.relativePath),
    manifestPath: manifest.relativePath,
    manifestInput: manifest.input,
    packageRootPath,
    exports: exportsValue === undefined ? null : parsePackageExports(exportsValue, manifest.relativePath),
    fallbackTargetPatterns: fallbackTargetPatterns(manifest)
  };

  const exportTargetPatterns = workspacePackage.exports === null
    ? []
    : [
        ...workspacePackage.exports.rootTargetPatterns,
        ...workspacePackage.exports.mappings.flatMap((mapping) => mapping.targetPatterns)
      ];
  for (const targetPattern of exportTargetPatterns) {
    normalizePackageTarget(workspacePackage, targetPattern, true);
  }
  for (const targetPattern of workspacePackage.fallbackTargetPatterns) {
    normalizePackageTarget(workspacePackage, targetPattern, false);
  }

  return workspacePackage;
}

function parsePackageSpecifier(moduleSpecifier: string): ParsedPackageSpecifier | null {
  if (moduleSpecifier === "" || moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return null;
  }

  const segments = moduleSpecifier.split("/");
  let packageName: string;
  let subpathSegments: readonly string[];

  if (moduleSpecifier.startsWith("@")) {
    if (segments.length < 2 || segments[0] === "@" || segments[1] === undefined || segments[1] === "") {
      return null;
    }
    packageName = `${segments[0]}/${segments[1]}`;
    subpathSegments = segments.slice(2);
  } else {
    const packageSegment = segments[0];
    if (packageSegment === undefined || packageSegment === "") {
      return null;
    }
    packageName = packageSegment;
    subpathSegments = segments.slice(1);
  }

  if (
    subpathSegments.some(
      (segment) => segment === "" || segment === "." || segment === ".." || HARD_EXCLUDED_DIRECTORY_NAMES.has(segment)
    )
  ) {
    return null;
  }

  return {
    packageName,
    subpath: subpathSegments.length === 0 ? "." : `./${subpathSegments.join("/")}`
  };
}

function matchExportSubpath(pattern: string, requestedSubpath: string): string | null {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex === -1) {
    return pattern === requestedSubpath ? "" : null;
  }

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  if (
    !requestedSubpath.startsWith(prefix) ||
    !requestedSubpath.endsWith(suffix) ||
    requestedSubpath.length < prefix.length + suffix.length
  ) {
    return null;
  }

  return requestedSubpath.slice(prefix.length, requestedSubpath.length - suffix.length);
}

function targetPatternsForSubpath(
  workspacePackage: WorkspacePackage,
  requestedSubpath: string
): readonly string[] {
  if (workspacePackage.exports === null) {
    return requestedSubpath === "." ? workspacePackage.fallbackTargetPatterns : [];
  }

  if (requestedSubpath === ".") {
    return workspacePackage.exports.rootTargetPatterns;
  }

  const exactMapping = workspacePackage.exports.mappings.find(
    (mapping) => mapping.subpathPattern === requestedSubpath
  );
  if (exactMapping !== undefined) {
    return exactMapping.targetPatterns;
  }

  const wildcardMatches: Array<{ readonly mapping: ExportMapping; readonly wildcardValue: string }> = [];
  for (const mapping of workspacePackage.exports.mappings) {
    const wildcardValue = matchExportSubpath(mapping.subpathPattern, requestedSubpath);
    if (wildcardValue === null || !mapping.subpathPattern.includes("*")) {
      continue;
    }

    wildcardMatches.push({ mapping, wildcardValue });
  }

  wildcardMatches.sort((left, right) => {
    const leftSpecificity = left.mapping.subpathPattern.length - 1;
    const rightSpecificity = right.mapping.subpathPattern.length - 1;
    return rightSpecificity - leftSpecificity || compareStableText(
      left.mapping.subpathPattern,
      right.mapping.subpathPattern
    );
  });

  const selectedMatch = wildcardMatches[0];
  if (selectedMatch === undefined) {
    return [];
  }

  return selectedMatch.mapping.targetPatterns.map((targetPattern) =>
    targetPattern.replaceAll("*", selectedMatch.wildcardValue)
  );
}

function normalizePackageTarget(
  workspacePackage: WorkspacePackage,
  targetPattern: string,
  requiresDotPrefix: boolean
): string | null {
  if (
    targetPattern === "" ||
    targetPattern.includes("\\") ||
    targetPattern.includes("\u0000") ||
    isAbsolute(targetPattern)
  ) {
    throw configurationError(workspacePackage.manifestPath, `package entry is unsafe: ${targetPattern}`);
  }

  if (requiresDotPrefix && !targetPattern.startsWith("./")) {
    throw configurationError(
      workspacePackage.manifestPath,
      `exports target must start with "./": ${targetPattern}`
    );
  }

  const packageRelativePath = targetPattern.startsWith("./")
    ? targetPattern.slice(2)
    : targetPattern;
  const absoluteTargetPath = resolve(workspacePackage.packageRootPath, packageRelativePath);
  if (!isWithinDirectory(workspacePackage.packageRootPath, absoluteTargetPath)) {
    throw configurationError(workspacePackage.manifestPath, `package entry escapes the package root: ${targetPattern}`);
  }

  const targetRelativeToPackage = relative(workspacePackage.packageRootPath, absoluteTargetPath).replaceAll("\\", "/");
  if (targetRelativeToPackage.split("/").some((segment) => HARD_EXCLUDED_DIRECTORY_NAMES.has(segment))) {
    return null;
  }

  return absoluteTargetPath;
}

function sourcePathCandidates(
  projectPath: string,
  workspacePackage: WorkspacePackage,
  targetPattern: string,
  requiresDotPrefix: boolean
): readonly string[] {
  const absoluteTargetPath = normalizePackageTarget(
    workspacePackage,
    targetPattern,
    requiresDotPrefix
  );
  if (absoluteTargetPath === null) {
    return [];
  }
  const targetFilePath = projectRelativePath(projectPath, absoluteTargetPath);
  if (targetFilePath === null) {
    throw configurationError(workspacePackage.manifestPath, `package entry escapes the project root: ${targetPattern}`);
  }

  const extensionMatch = /\.(?:[cm]?[jt]sx?)$/iu.exec(targetFilePath);
  const withoutExtension = extensionMatch === null
    ? targetFilePath
    : targetFilePath.slice(0, -extensionMatch[0].length);
  const candidates = new Set<string>([targetFilePath]);

  for (const extension of SOURCE_FILE_EXTENSIONS) {
    candidates.add(`${withoutExtension}${extension}`);
    candidates.add(`${targetFilePath}/index${extension}`);
  }

  return [...candidates].sort(compareStableText);
}

function unresolved(configurationPaths: readonly string[]): ResolvedModule {
  return {
    targetFilePath: null,
    strategy: "unresolved",
    configurationPaths
  };
}

function resolveWorkspaceTarget(input: {
  readonly projectPath: string;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly workspacePackage: WorkspacePackage;
  readonly subpath: string;
}): string | null {
  const targetPatterns = targetPatternsForSubpath(input.workspacePackage, input.subpath);
  const requiresDotPrefix = input.workspacePackage.exports !== null;

  for (const targetPattern of targetPatterns) {
    const matchingFilePaths = new Set<string>();
    for (const candidate of sourcePathCandidates(
      input.projectPath,
      input.workspacePackage,
      targetPattern,
      requiresDotPrefix
    )) {
      if (input.knownFilePaths.has(candidate)) {
        matchingFilePaths.add(candidate);
      }
    }

    if (matchingFilePaths.size === 1) {
      return [...matchingFilePaths][0] ?? null;
    }

    if (matchingFilePaths.size > 1) {
      return null;
    }
  }

  return null;
}

/**
 * Discovers package-manager workspaces declared in the root manifest without
 * walking node_modules or broadening the source scan. Resolution only returns
 * a target when that exact source file is already present in `sourceDocuments`.
 */
export async function createWorkspaceProjectModuleResolver(input: {
  readonly projectPath: string;
  readonly sourceDocuments: readonly SourceDocument[];
  readonly configurationCandidatePaths: readonly string[];
}): Promise<WorkspaceProjectModuleResolver> {
  const projectPath = resolve(input.projectPath);
  const rootInput = await readProjectConfigurationInput(
    projectPath,
    "workspace-root-manifest",
    "package.json"
  );
  const knownFilePaths = new Set(input.sourceDocuments.map((document) => document.relativePath));

  if (rootInput.state === "absent") {
    return {
      moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([]) },
      configurationInputs: [rootInput]
    };
  }

  const rootManifest = await loadPresentManifest(
    projectPath,
    rootInput.path,
    "workspace-root-manifest"
  );
  const patterns = parseWorkspacePatterns(rootManifest);
  const manifestPaths = discoverWorkspaceManifestPaths(
    input.configurationCandidatePaths,
    patterns
  );
  const workspacePackages = (await Promise.all(
    manifestPaths.map(async (manifestPath) =>
      parseWorkspacePackage(
        await loadPresentManifest(projectPath, manifestPath, "workspace-package-manifest")
      )
    )
  )).sort((left, right) => compareStableText(left.manifestPath, right.manifestPath));
  const packageByName = new Map<string, WorkspacePackage>();

  for (const workspacePackage of workspacePackages) {
    const existing = packageByName.get(workspacePackage.name);
    if (existing !== undefined) {
      throw configurationError(
        workspacePackage.manifestPath,
        `duplicate workspace package name "${workspacePackage.name}" also appears in ${existing.manifestPath}`
      );
    }
    packageByName.set(workspacePackage.name, workspacePackage);
  }

  return {
    moduleResolver: {
      resolve(_fromFilePath, moduleSpecifier) {
        const parsedSpecifier = parsePackageSpecifier(moduleSpecifier);
        if (parsedSpecifier === null) {
          return unresolved([]);
        }

        const workspacePackage = packageByName.get(parsedSpecifier.packageName);
        if (workspacePackage === undefined) {
          return unresolved([rootInput.path]);
        }

        const configurationPaths = [rootInput.path, workspacePackage.manifestPath];
        const targetFilePath = resolveWorkspaceTarget({
          projectPath,
          knownFilePaths,
          workspacePackage,
          subpath: parsedSpecifier.subpath
        });
        if (targetFilePath === null) {
          return unresolved(configurationPaths);
        }

        return {
          targetFilePath,
          strategy: "workspace-package",
          configurationPaths
        };
      }
    },
    configurationInputs: [
      rootInput,
      ...workspacePackages.map((workspacePackage) => workspacePackage.manifestInput)
    ]
  };
}

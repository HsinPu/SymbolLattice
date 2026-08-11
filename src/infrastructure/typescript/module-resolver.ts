import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import ts from "typescript";

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

const SOURCE_FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".svelte",
  ".astro",
  ".ets"
] as const;

export interface TypeScriptProjectModuleResolver {
  readonly moduleResolver: ProjectModuleResolver;
  /**
   * Root config candidates and the selected config's project-local extends
   * chain. Consumers persist these inputs with the graph generation.
   */
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  /**
   * Indicates that a non-relative specifier was claimed by the selected
   * TypeScript configuration, even when its target is outside the current
   * source scan. Callers use this to avoid silently falling through to a
   * lower-priority resolver such as a workspace package catalog.
   */
  readonly hasProjectConfigurationResolution: (
    fromFilePath: string,
    moduleSpecifier: string
  ) => boolean;
}

interface LoadedConfiguration {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sourceText: string;
  readonly kind: ProjectConfigurationInput["kind"];
}

interface LoadedConfigurationChain {
  readonly configurations: readonly LoadedConfiguration[];
  readonly missingConfigurationInputs: readonly ProjectConfigurationInput[];
  /** An external or not-yet-generated extends is intentionally not trusted by the indexer. */
  readonly hasUnavailableExtends: boolean;
}

interface LocalExtendsResolution {
  readonly targetPath: string | null;
  readonly missingRelativePath: string | null;
}

function sourceHash(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

function fileSystemKey(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

/** TypeScript's config parser requires one consistent path separator convention. */
function typeScriptPath(path: string): string {
  return resolve(path).replaceAll("\\", "/");
}

function projectRelativePath(projectPath: string, absolutePath: string): string | null {
  const value = relative(projectPath, absolutePath);
  if (value === "" || value === ".") {
    return null;
  }

  if (isAbsolute(value) || value === ".." || value.startsWith(`..${"/"}`) || value.startsWith(`..${"\\"}`)) {
    return null;
  }

  return value.replaceAll("\\", "/");
}

function configurationError(path: string, message: string): ProjectConfigurationError {
  return new ProjectConfigurationError(`Invalid project configuration at ${path}: ${message}`);
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  return `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modulePathCandidates(fromFilePath: string, moduleSpecifier: string): readonly string[] {
  if (!moduleSpecifier.startsWith(".")) {
    return [];
  }

  const parts = fromFilePath.split("/").slice(0, -1);
  for (const part of moduleSpecifier.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return [];
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const rawPath = parts.join("/");
  const extensionMatch = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|ets)$/i.exec(rawPath);
  const withoutExtension = extensionMatch === null ? rawPath : rawPath.slice(0, -extensionMatch[0].length);
  const candidates = new Set<string>([rawPath]);

  for (const extension of SOURCE_FILE_EXTENSIONS) {
    candidates.add(`${withoutExtension}${extension}`);
    candidates.add(`${rawPath}/index${extension}`);
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

function exactRelativeTarget(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): ResolvedModule {
  const candidates = modulePathCandidates(fromFilePath, moduleSpecifier).filter((candidate) =>
    knownFilePaths.has(candidate)
  );

  if (candidates.length !== 1 || candidates[0] === undefined) {
    return unresolved([]);
  }

  return {
    targetFilePath: candidates[0],
    strategy: "relative",
    configurationPaths: []
  };
}

function rootConfigurationInput<TKind extends "tsconfig" | "jsconfig">(
  projectPath: string,
  fileName: "tsconfig.json" | "jsconfig.json",
  kind: TKind
): ProjectConfigurationInput & { readonly kind: TKind } {
  const absolutePath = resolve(projectPath, fileName);
  if (!existsSync(absolutePath)) {
    return { kind, path: fileName, state: "absent", contentHash: null };
  }

  let sourceText: string;
  try {
    sourceText = readFileSync(absolutePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw configurationError(fileName, reason);
  }

  return { kind, path: fileName, state: "present", contentHash: sourceHash(sourceText) };
}

function resolveLocalExtendsPath(
  projectPath: string,
  parentPath: string,
  specifier: string
): LocalExtendsResolution {
  const isRelativeSpecifier = specifier.startsWith(".") || isAbsolute(specifier);
  if (!isRelativeSpecifier) {
    throw configurationError(
      projectRelativePath(projectPath, parentPath) ?? parentPath,
      `external extends "${specifier}" is not supported; use a project-local relative path instead`
    );
  }

  const rawCandidate = isAbsolute(specifier)
    ? resolve(specifier)
    : resolve(dirname(parentPath), specifier);
  const candidates = rawCandidate.endsWith(".json")
    ? [rawCandidate]
    : [rawCandidate, `${rawCandidate}.json`];
  const candidateRelativePaths = candidates.map((candidate) =>
    projectRelativePath(projectPath, candidate)
  );
  if (candidateRelativePaths.some((candidate) => candidate === null)) {
    throw configurationError(
      projectRelativePath(projectPath, parentPath) ?? parentPath,
      `extends "${specifier}" resolves outside the project root`
    );
  }
  const targetPath = candidates.find((candidate) => existsSync(candidate));

  if (targetPath === undefined) {
    return {
      targetPath: null,
      missingRelativePath: candidateRelativePaths[0] ?? null
    };
  }

  return { targetPath, missingRelativePath: null };
}

function loadConfigurationChain(
  projectPath: string,
  selectedPath: string,
  selectedKind: "tsconfig" | "jsconfig"
): LoadedConfigurationChain {
  const chain: LoadedConfiguration[] = [];
  const missingConfigurationInputs: ProjectConfigurationInput[] = [];
  const seenPaths = new Set<string>();
  let hasUnavailableExtends = false;

  function load(absolutePath: string, kind: ProjectConfigurationInput["kind"]): void {
    const key = fileSystemKey(absolutePath);
    const relativePath = projectRelativePath(projectPath, absolutePath);
    if (relativePath === null) {
      throw configurationError(absolutePath, "configuration file is outside the project root");
    }
    if (seenPaths.has(key)) {
      throw configurationError(relativePath, "local extends cycle detected");
    }
    seenPaths.add(key);

    let sourceText: string;
    try {
      sourceText = readFileSync(absolutePath, "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw configurationError(relativePath, reason);
    }

    let parsedText: ReturnType<typeof ts.parseConfigFileTextToJson>;
    try {
      parsedText = ts.parseConfigFileTextToJson(typeScriptPath(absolutePath), sourceText);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw configurationError(relativePath, reason);
    }
    if (parsedText.error !== undefined) {
      throw configurationError(relativePath, diagnosticMessage(parsedText.error));
    }
    if (!isRecord(parsedText.config)) {
      throw configurationError(relativePath, "the config root must be an object");
    }

    chain.push({ absolutePath, relativePath, sourceText, kind });
    const extendsValue = parsedText.config.extends;
    if (extendsValue === undefined) {
      return;
    }
    if (typeof extendsValue !== "string") {
      throw configurationError(relativePath, 'the "extends" property must be a string');
    }

    if (!extendsValue.startsWith(".") && !isAbsolute(extendsValue)) {
      hasUnavailableExtends = true;
      return;
    }

    const resolution = resolveLocalExtendsPath(projectPath, absolutePath, extendsValue);
    if (resolution.targetPath === null) {
      if (resolution.missingRelativePath === null) {
        throw configurationError(relativePath, `cannot track project-local extends "${extendsValue}"`);
      }
      if (resolution.missingRelativePath !== ".svelte-kit/tsconfig.json") {
        throw configurationError(relativePath, `cannot read project-local extends "${extendsValue}"`);
      }
      hasUnavailableExtends = true;
      missingConfigurationInputs.push({
        kind: "extends",
        path: resolution.missingRelativePath,
        state: "absent",
        contentHash: null
      });
      return;
    }
    load(resolution.targetPath, "extends");
  }

  load(selectedPath, selectedKind);
  return { configurations: chain, missingConfigurationInputs, hasUnavailableExtends };
}

function parseCompilerOptions(
  projectPath: string,
  selectedPath: string,
  selectedRelativePath: string
): ts.CompilerOptions {
  const unrecoverableDiagnostics: ts.Diagnostic[] = [];
  const host: ts.ParseConfigFileHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: ts.sys.readDirectory,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getCurrentDirectory: () => typeScriptPath(projectPath),
    getDirectories: ts.sys.getDirectories,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      unrecoverableDiagnostics.push(diagnostic);
    }
  };
  if (ts.sys.realpath !== undefined) {
    host.realpath = ts.sys.realpath;
  }
  let parsed: ts.ParsedCommandLine | undefined;
  try {
    parsed = ts.getParsedCommandLineOfConfigFile(typeScriptPath(selectedPath), {}, host);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw configurationError(selectedRelativePath, reason);
  }
  const diagnostics = [
    ...unrecoverableDiagnostics,
    ...(parsed?.errors ?? [])
  ].filter((diagnostic) => diagnostic.code !== 18003);

  if (parsed === undefined || diagnostics.length > 0) {
    const message = diagnostics.length === 0
      ? "TypeScript could not parse the configuration"
      : diagnostics.map(diagnosticMessage).join("; ");
    throw configurationError(selectedRelativePath, message);
  }

  return parsed.options;
}

function matchesPathPattern(moduleSpecifier: string, patterns: Readonly<Record<string, readonly string[]>>): boolean {
  return Object.keys(patterns).some((pattern) => {
    const starIndex = pattern.indexOf("*");
    if (starIndex === -1) {
      return pattern === moduleSpecifier;
    }
    if (pattern.indexOf("*", starIndex + 1) !== -1) {
      return false;
    }
    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    return (
      moduleSpecifier.startsWith(prefix) &&
      moduleSpecifier.endsWith(suffix) &&
      moduleSpecifier.length >= prefix.length + suffix.length
    );
  });
}

function pathPatternSubstitution(pattern: string, moduleSpecifier: string): string | null {
  const starIndex = pattern.indexOf("*");
  if (starIndex === -1) {
    return pattern === moduleSpecifier ? "" : null;
  }
  if (pattern.indexOf("*", starIndex + 1) !== -1) {
    return null;
  }
  const prefix = pattern.slice(0, starIndex);
  const suffix = pattern.slice(starIndex + 1);
  if (
    !moduleSpecifier.startsWith(prefix) ||
    !moduleSpecifier.endsWith(suffix) ||
    moduleSpecifier.length < prefix.length + suffix.length
  ) {
    return null;
  }
  return moduleSpecifier.slice(prefix.length, moduleSpecifier.length - suffix.length);
}

function hasCompatiblePathReplacementStar(pattern: string, replacement: string): boolean {
  const replacementStarIndex = replacement.indexOf("*");
  if (replacementStarIndex === -1) {
    return true;
  }
  return pattern.indexOf("*") !== -1 && replacement.indexOf("*", replacementStarIndex + 1) === -1;
}

function configurationDeclaresPaths(configuration: LoadedConfiguration): boolean {
  const parsed = ts.parseConfigFileTextToJson(configuration.absolutePath, configuration.sourceText).config;
  if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) {
    return false;
  }
  return Object.hasOwn(parsed.compilerOptions, "paths") && isRecord(parsed.compilerOptions.paths);
}

function compilerPathsBasePath(compilerOptions: ts.CompilerOptions): string | null {
  const value = (compilerOptions as ts.CompilerOptions & { readonly pathsBasePath?: unknown }).pathsBasePath;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function explicitSfcPathsTarget(input: {
  readonly projectPath: string;
  readonly moduleSpecifier: string;
  readonly compilerOptions: ts.CompilerOptions;
  readonly knownRelativePathByAbsolutePath: ReadonlyMap<string, string>;
  readonly requiresPathsBasePath: boolean;
}): string | null {
  if (
    input.compilerOptions.allowArbitraryExtensions !== true ||
    !/\.(?:vue|svelte|astro)$/iu.test(input.moduleSpecifier) ||
    input.compilerOptions.paths === undefined
  ) {
    return null;
  }

  const matchingPatterns = Object.entries(input.compilerOptions.paths)
    .map(([pattern, replacements]) => ({ pattern, replacements, substitution: pathPatternSubstitution(pattern, input.moduleSpecifier) }))
    .filter((candidate) => candidate.substitution !== null);
  if (matchingPatterns.length !== 1) {
    return null;
  }

  const match = matchingPatterns[0];
  if (match === undefined || match.substitution === null) {
    return null;
  }
  const pathsBasePath = compilerPathsBasePath(input.compilerOptions);
  if (input.compilerOptions.baseUrl === undefined && input.requiresPathsBasePath && pathsBasePath === null) {
    return null;
  }
  const basePath = input.compilerOptions.baseUrl ?? pathsBasePath ?? input.projectPath;
  const targetKeys = new Set(
    match.replacements.map((replacement) =>
      fileSystemKey(resolve(basePath, replacement.replaceAll("*", match.substitution!)))
    )
  );
  if (targetKeys.size !== 1) {
    return null;
  }
  const targetKey = targetKeys.values().next().value as string | undefined;
  return targetKey === undefined ? null : input.knownRelativePathByAbsolutePath.get(targetKey) ?? null;
}

function rootAstroSfcPathsTarget(input: {
  readonly projectPath: string;
  readonly fromFilePath: string;
  readonly moduleSpecifier: string;
  readonly rootConfiguration: LoadedConfiguration;
  readonly astroConfigurationPath: string | undefined;
  readonly knownRelativePathByAbsolutePath: ReadonlyMap<string, string>;
}): string | null {
  if (
    input.astroConfigurationPath === undefined ||
    !input.fromFilePath.endsWith(".astro") ||
    input.moduleSpecifier.startsWith(".") ||
    !input.moduleSpecifier.endsWith(".astro")
  ) {
    return null;
  }

  const parsed = ts.parseConfigFileTextToJson(
    input.rootConfiguration.absolutePath,
    input.rootConfiguration.sourceText
  ).config;
  if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) {
    return null;
  }
  const compilerOptions = parsed.compilerOptions;
  if (
    !Object.hasOwn(compilerOptions, "baseUrl") ||
    typeof compilerOptions.baseUrl !== "string" ||
    !Object.hasOwn(compilerOptions, "paths") ||
    !isRecord(compilerOptions.paths)
  ) {
    return null;
  }

  const matchingPatterns = Object.entries(compilerOptions.paths)
    .map(([pattern, replacements]) => ({
      pattern,
      replacements,
      substitution: pathPatternSubstitution(pattern, input.moduleSpecifier)
    }))
    .filter((candidate) => candidate.substitution !== null && Array.isArray(candidate.replacements));
  if (matchingPatterns.length !== 1) {
    return null;
  }

  const match = matchingPatterns[0];
  const replacements = match?.replacements;
  if (
    match === undefined ||
    match.substitution === null ||
    !Array.isArray(replacements) ||
    replacements.length !== 1 ||
    typeof replacements[0] !== "string" ||
    !hasCompatiblePathReplacementStar(match.pattern, replacements[0])
  ) {
    return null;
  }
  const targetPath = resolve(
    input.projectPath,
    compilerOptions.baseUrl,
    replacements[0].replaceAll("*", match.substitution)
  );
  if (!targetPath.endsWith(".astro") || !isWithinDirectory(input.projectPath, targetPath)) {
    return null;
  }

  return input.knownRelativePathByAbsolutePath.get(fileSystemKey(targetPath)) ?? null;
}

function isWithinDirectory(directory: string, candidate: string): boolean {
  const value = relative(directory, candidate);
  return value === "" || (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${"/"}`) && !value.startsWith(`..${"\\"}`));
}

function resolvedModulePath(
  moduleSpecifier: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions
): string | null {
  const result = ts.resolveModuleName(
    moduleSpecifier,
    typeScriptPath(containingFile),
    compilerOptions,
    ts.sys
  );
  return result.resolvedModule?.resolvedFileName ?? null;
}

function withoutCompilerOptions(
  compilerOptions: ts.CompilerOptions,
  keys: readonly ("baseUrl" | "paths")[]
): ts.CompilerOptions {
  const copy = { ...compilerOptions };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

function sameResolvedModule(left: string | null, right: string): boolean {
  return left !== null && fileSystemKey(left) === fileSystemKey(right);
}

function nonRelativeStrategy(
  moduleSpecifier: string,
  containingFile: string,
  targetPath: string,
  compilerOptions: ts.CompilerOptions
): Exclude<ResolvedModule["strategy"], "relative" | "unresolved"> | null {
  const paths = compilerOptions.paths;
  const withoutPaths = resolvedModulePath(
    moduleSpecifier,
    containingFile,
    withoutCompilerOptions(compilerOptions, ["paths"])
  );
  if (
    paths !== undefined &&
    matchesPathPattern(moduleSpecifier, paths) &&
    !sameResolvedModule(withoutPaths, targetPath)
  ) {
    return "tsconfig-paths";
  }

  const withoutPathsOrBaseUrl = resolvedModulePath(
    moduleSpecifier,
    containingFile,
    withoutCompilerOptions(compilerOptions, ["paths", "baseUrl"])
  );
  if (
    compilerOptions.baseUrl !== undefined &&
    isWithinDirectory(resolve(compilerOptions.baseUrl), targetPath) &&
    sameResolvedModule(withoutPaths, targetPath) &&
    !sameResolvedModule(withoutPathsOrBaseUrl, targetPath)
  ) {
    return "tsconfig-base-url";
  }

  return null;
}

/**
 * Builds a deterministic resolver from the root TypeScript or JavaScript
 * project configuration. Source discovery remains independent: TypeScript
 * `files`, `include`, and `exclude` never expand the graph input set here.
 */
export function createTypeScriptProjectModuleResolver(input: {
  readonly projectPath: string;
  readonly sourceDocuments: readonly SourceDocument[];
  /** A unique root Astro config observed by the source catalog. */
  readonly astroConfigurationPath?: string;
}): TypeScriptProjectModuleResolver {
  const projectPath = resolve(input.projectPath);
  const tsconfigInput = rootConfigurationInput(projectPath, "tsconfig.json", "tsconfig");
  const jsconfigInput = rootConfigurationInput(projectPath, "jsconfig.json", "jsconfig");
  const selectedInput = tsconfigInput.state === "present"
    ? tsconfigInput
    : jsconfigInput.state === "present"
      ? jsconfigInput
      : undefined;
  const knownFilePaths = new Set(input.sourceDocuments.map((document) => document.relativePath));
  const knownRelativePathByAbsolutePath = new Map(
    input.sourceDocuments.map((document) => [fileSystemKey(document.absolutePath), document.relativePath])
  );

  if (selectedInput === undefined) {
    return {
      moduleResolver: {
        resolve(fromFilePath, moduleSpecifier) {
          return exactRelativeTarget(knownFilePaths, fromFilePath, moduleSpecifier);
        }
      },
      configurationInputs: [jsconfigInput, tsconfigInput].sort((left, right) =>
        compareStableText(left.path, right.path)
      ),
      hasProjectConfigurationResolution() {
        return false;
      }
    };
  }

  const selectedPath = resolve(projectPath, selectedInput.path);
  const loadedChain = loadConfigurationChain(projectPath, selectedPath, selectedInput.kind);
  const chain = loadedChain.configurations;
  const configurationPaths = [
    ...chain.map((configuration) => configuration.relativePath),
    ...loadedChain.missingConfigurationInputs.map((configuration) => configuration.path)
  ];
  const chainInputs = chain.map<ProjectConfigurationInput>((configuration) => ({
    kind: configuration.kind,
    path: configuration.relativePath,
    state: "present",
    contentHash: sourceHash(configuration.sourceText)
  }));
  const configurationInputs = [
    ...chainInputs,
    ...loadedChain.missingConfigurationInputs,
    ...(selectedInput.kind === "jsconfig" ? [tsconfigInput] : [])
  ]
    .filter(
      (inputValue, index, values) =>
        values.findIndex(
          (candidate) => candidate.kind === inputValue.kind && candidate.path === inputValue.path
        ) === index
    )
    .sort((left, right) => {
      const byPath = compareStableText(left.path, right.path);
      return byPath === 0 ? compareStableText(left.kind, right.kind) : byPath;
    });

  if (loadedChain.hasUnavailableExtends) {
    const astroConfigurationPaths = input.astroConfigurationPath === undefined
      ? configurationPaths
      : [...configurationPaths, input.astroConfigurationPath];
    function astroFallbackTarget(fromFilePath: string, moduleSpecifier: string): string | null {
      return rootAstroSfcPathsTarget({
        projectPath,
        fromFilePath,
        moduleSpecifier,
        rootConfiguration: chain[0]!,
        astroConfigurationPath: input.astroConfigurationPath,
        knownRelativePathByAbsolutePath
      });
    }
    return {
      moduleResolver: {
        resolve(fromFilePath, moduleSpecifier) {
          if (moduleSpecifier.startsWith(".")) {
            return exactRelativeTarget(knownFilePaths, fromFilePath, moduleSpecifier);
          }
          const targetFilePath = astroFallbackTarget(fromFilePath, moduleSpecifier);
          return targetFilePath === null
            ? unresolved(configurationPaths)
            : {
                targetFilePath,
                strategy: "tsconfig-paths",
                configurationPaths: astroConfigurationPaths
              };
        }
      },
      configurationInputs,
      hasProjectConfigurationResolution(fromFilePath, moduleSpecifier) {
        return astroFallbackTarget(fromFilePath, moduleSpecifier) !== null;
      }
    };
  }

  const compilerOptions = parseCompilerOptions(projectPath, selectedPath, selectedInput.path);
  const requiresPathsBasePath =
    compilerOptions.baseUrl === undefined &&
    !configurationDeclaresPaths(chain[0]!) &&
    chain.slice(1).some(configurationDeclaresPaths);

  function containingFilePath(fromFilePath: string): string {
    const sourceDocument = input.sourceDocuments.find(
      (document) => document.relativePath === fromFilePath
    );

    return sourceDocument?.absolutePath ?? resolve(projectPath, fromFilePath);
  }

  function hasProjectConfigurationResolution(
    fromFilePath: string,
    moduleSpecifier: string
  ): boolean {
    if (moduleSpecifier.startsWith(".")) {
      return false;
    }

    if (
      compilerOptions.paths !== undefined &&
      matchesPathPattern(moduleSpecifier, compilerOptions.paths)
    ) {
      return true;
    }

    const containingFile = containingFilePath(fromFilePath);
    const targetPath = resolvedModulePath(moduleSpecifier, containingFile, compilerOptions);

    return (
      (targetPath !== null &&
        nonRelativeStrategy(moduleSpecifier, containingFile, targetPath, compilerOptions) !== null) ||
      explicitSfcPathsTarget({
        projectPath,
        moduleSpecifier,
        compilerOptions,
        knownRelativePathByAbsolutePath,
        requiresPathsBasePath
      }) !== null
    );
  }

  return {
    moduleResolver: {
      resolve(fromFilePath, moduleSpecifier) {
        if (moduleSpecifier.startsWith(".")) {
          return exactRelativeTarget(knownFilePaths, fromFilePath, moduleSpecifier);
        }

        const containingFile = containingFilePath(fromFilePath);
        const targetPath = resolvedModulePath(moduleSpecifier, containingFile, compilerOptions);
        if (targetPath === null) {
          const fallbackTargetFilePath = explicitSfcPathsTarget({
            projectPath,
            moduleSpecifier,
            compilerOptions,
            knownRelativePathByAbsolutePath,
            requiresPathsBasePath
          });
          return fallbackTargetFilePath === null
            ? unresolved(configurationPaths)
            : { targetFilePath: fallbackTargetFilePath, strategy: "tsconfig-paths", configurationPaths };
        }

        const targetFilePath = knownRelativePathByAbsolutePath.get(fileSystemKey(targetPath));
        const strategy = nonRelativeStrategy(
          moduleSpecifier,
          containingFile,
          targetPath,
          compilerOptions
        );
        if (targetFilePath === undefined || strategy === null) {
          return unresolved(configurationPaths);
        }

        return { targetFilePath, strategy, configurationPaths };
      }
    },
    configurationInputs,
    hasProjectConfigurationResolution
  };
}

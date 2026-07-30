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

const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".astro"] as const;

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
  const extensionMatch = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i.exec(rawPath);
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
): string {
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
  const targetPath = candidates.find((candidate) => existsSync(candidate));
  const parentRelativePath = projectRelativePath(projectPath, parentPath) ?? parentPath;

  if (targetPath === undefined) {
    throw configurationError(
      parentRelativePath,
      `cannot read project-local extends "${specifier}"`
    );
  }

  if (projectRelativePath(projectPath, targetPath) === null) {
    throw configurationError(
      parentRelativePath,
      `extends "${specifier}" resolves outside the project root`
    );
  }

  return targetPath;
}

function loadConfigurationChain(
  projectPath: string,
  selectedPath: string,
  selectedKind: "tsconfig" | "jsconfig"
): readonly LoadedConfiguration[] {
  const chain: LoadedConfiguration[] = [];
  const seenPaths = new Set<string>();

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

    load(resolveLocalExtendsPath(projectPath, absolutePath, extendsValue), "extends");
  }

  load(selectedPath, selectedKind);
  return chain;
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
  const chain = loadConfigurationChain(projectPath, selectedPath, selectedInput.kind);
  const compilerOptions = parseCompilerOptions(projectPath, selectedPath, selectedInput.path);
  const configurationPaths = chain.map((configuration) => configuration.relativePath);
  const chainInputs = chain.map<ProjectConfigurationInput>((configuration) => ({
    kind: configuration.kind,
    path: configuration.relativePath,
    state: "present",
    contentHash: sourceHash(configuration.sourceText)
  }));
  const configurationInputs = [
    ...chainInputs,
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
      targetPath !== null &&
      nonRelativeStrategy(moduleSpecifier, containingFile, targetPath, compilerOptions) !== null
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
          return unresolved(configurationPaths);
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

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

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
import { readProjectConfigurationInput } from "./project-inputs.js";

interface LoadedCargoManifest {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly input: ProjectConfigurationInput;
  readonly sections: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

interface CargoPathDependency {
  /** Exact Cargo dependency key used to prove workspace-dependency inheritance. */
  readonly dependencyName: string;
  /** Rust import spelling from the dependency key, with Cargo hyphens normalized. */
  readonly crateName: string;
  /** Package name Cargo must find at the explicit local path. */
  readonly packageName: string;
  readonly absoluteTargetPath: string;
}

interface CargoWorkspacePackage {
  readonly packageName: string;
  readonly crateName: string;
  readonly manifestPath: string;
  readonly manifestInput: ProjectConfigurationInput;
  readonly absoluteRootPath: string;
  readonly relativeRootPath: string;
  readonly pathDependencies: readonly CargoPathDependency[];
}

export interface CargoWorkspaceProjectModuleResolver {
  readonly moduleResolver: ProjectModuleResolver;
  /** Root and explicit member manifests persisted with the graph generation. */
  readonly configurationInputs: readonly ProjectConfigurationInput[];
}

const RUST_CRATE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const CARGO_WORKSPACE_INHERITANCE_FIELDS = new Set(["workspace", "optional", "features"]);

function configurationError(path: string, message: string): ProjectConfigurationError {
  return new ProjectConfigurationError(`Invalid Cargo workspace configuration at ${path}: ${message}`);
}

function unresolved(configurationPaths: readonly string[]): ResolvedModule {
  return {
    targetFilePath: null,
    strategy: "unresolved",
    configurationPaths
  };
}

function projectRelativePath(projectPath: string, absolutePath: string): string | null {
  const value = relative(projectPath, absolutePath);
  if (value === "" || value === ".") {
    return "";
  }
  if (isAbsolute(value) || value === ".." || value.startsWith(`..${sep}`)) {
    return null;
  }
  return value.replaceAll("\\", "/");
}

function dedupePaths(paths: readonly string[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

function normalizeCrateName(value: string): string | null {
  const normalized = value.replaceAll("-", "_");
  return RUST_CRATE_NAME.test(normalized) ? normalized : null;
}

function stripTomlComment(value: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) {
      continue;
    }
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === null ? character : quote === character ? null : quote;
      continue;
    }
    if (character === "#" && quote === null) {
      return value.slice(0, index);
    }
  }
  return value;
}

function tomlDelimiterDelta(value: string): number | null {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) {
      continue;
    }
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === null ? character : quote === character ? null : quote;
      continue;
    }
    if (quote !== null) {
      continue;
    }
    if (character === "[" || character === "{") {
      depth += 1;
    }
    if (character === "]" || character === "}") {
      depth -= 1;
    }
  }
  return quote === null && !escaped ? depth : null;
}

/**
 * Reads only the small TOML subset required for explicit workspace membership
 * and direct inline-table path dependencies. Unsupported TOML is deliberately
 * left unresolved instead of guessed.
 */
function parseTomlSections(sourceText: string, relativePath: string): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let currentSection: Map<string, string> | undefined;
  let pendingKey: string | undefined;
  let pendingValue = "";
  let pendingDepth = 0;

  function store(key: string, value: string): void {
    if (currentSection === undefined) {
      return;
    }
    if (currentSection.has(key)) {
      throw configurationError(relativePath, `duplicate ${key} assignment`);
    }
    currentSection.set(key, value.trim());
  }

  for (const rawLine of sourceText.split(/\r?\n/u)) {
    const line = stripTomlComment(rawLine).trim();
    if (pendingKey !== undefined) {
      const delta = tomlDelimiterDelta(line);
      if (delta === null) {
        throw configurationError(relativePath, `cannot parse multiline ${pendingKey} value`);
      }
      pendingValue = `${pendingValue}\n${line}`;
      pendingDepth += delta;
      if (pendingDepth < 0) {
        throw configurationError(relativePath, `cannot parse multiline ${pendingKey} value`);
      }
      if (pendingDepth === 0) {
        store(pendingKey, pendingValue);
        pendingKey = undefined;
        pendingValue = "";
      }
      continue;
    }

    if (line === "") {
      continue;
    }
    const sectionMatch = /^\[([^\[\]]+)\]$/u.exec(line);
    if (sectionMatch?.[1] !== undefined) {
      const sectionName = sectionMatch[1].trim();
      currentSection = sections.get(sectionName);
      if (currentSection === undefined) {
        currentSection = new Map<string, string>();
        sections.set(sectionName, currentSection);
      }
      continue;
    }
    if (currentSection === undefined) {
      continue;
    }
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
    if (assignment?.[1] === undefined || assignment[2] === undefined) {
      continue;
    }
    const key = assignment[1];
    const value = assignment[2];
    const delta = tomlDelimiterDelta(value);
    if (delta === null || delta < 0) {
      throw configurationError(relativePath, `cannot parse ${key} value`);
    }
    if (delta === 0) {
      store(key, value);
      continue;
    }
    pendingKey = key;
    pendingValue = value;
    pendingDepth = delta;
  }

  if (pendingKey !== undefined) {
    throw configurationError(relativePath, `unterminated ${pendingKey} value`);
  }
  return sections;
}

function parseTomlString(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (character === undefined) {
        return null;
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character !== '"') {
        continue;
      }
      if (trimmed.slice(index + 1).trim() !== "") {
        return null;
      }
      try {
        const parsed: unknown = JSON.parse(trimmed.slice(0, index + 1));
        return typeof parsed === "string" ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  if (!trimmed.startsWith("'")) {
    return null;
  }
  const closingIndex = trimmed.indexOf("'", 1);
  if (closingIndex < 0 || trimmed.slice(closingIndex + 1).trim() !== "") {
    return null;
  }
  return trimmed.slice(1, closingIndex);
}

function splitTomlTopLevel(value: string): readonly string[] | null {
  const fields: string[] = [];
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) {
      return null;
    }
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === null ? character : quote === character ? null : quote;
      continue;
    }
    if (quote !== null) {
      continue;
    }
    if (character === "[" || character === "{") {
      depth += 1;
      continue;
    }
    if (character === "]" || character === "}") {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
      continue;
    }
    if (character === "," && depth === 0) {
      fields.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote !== null || escaped || depth !== 0) {
    return null;
  }
  fields.push(value.slice(start).trim());
  return fields;
}

function parseTomlStringArray(value: string): readonly string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const contents = trimmed.slice(1, -1).trim();
  if (contents === "") {
    return [];
  }
  const fields = splitTomlTopLevel(contents);
  const values = fields?.at(-1) === "" ? fields.slice(0, -1) : fields;
  if (values === null || values.length === 0 || values.some((field) => field === "")) {
    return null;
  }
  const strings = values.map((field) => parseTomlString(field));
  return strings.some((field) => field === null)
    ? null
    : strings.filter((field): field is string => field !== null);
}

function parseTomlBoolean(value: string): boolean | null {
  const trimmed = value.trim();
  return trimmed === "true" ? true : trimmed === "false" ? false : null;
}

function parseTomlInlineTable(value: string): ReadonlyMap<string, string> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  const fields = splitTomlTopLevel(trimmed.slice(1, -1));
  if (fields === null || fields.some((field) => field === "")) {
    return null;
  }
  const values = new Map<string, string>();
  for (const field of fields) {
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*([\s\S]+)$/u.exec(field);
    if (assignment?.[1] === undefined || assignment[2] === undefined || values.has(assignment[1])) {
      return null;
    }
    values.set(assignment[1], assignment[2].trim());
  }
  return values;
}

async function loadPresentCargoManifest(
  projectPath: string,
  relativePath: string,
  kind: "cargo-workspace-root-manifest" | "cargo-workspace-package-manifest"
): Promise<LoadedCargoManifest> {
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
    sections: parseTomlSections(sourceText, input.path)
  };
}

function parsePathDependencies(
  manifest: LoadedCargoManifest,
  sectionName = "dependencies",
  options?: { readonly rejectOptional: boolean }
): readonly CargoPathDependency[] {
  const dependencies = manifest.sections.get(sectionName);
  if (dependencies === undefined) {
    return [];
  }
  const result: CargoPathDependency[] = [];
  for (const [dependencyName, rawValue] of dependencies) {
    const inlineTable = parseTomlInlineTable(rawValue);
    if (inlineTable === null) {
      continue;
    }
    if (options?.rejectOptional === true && inlineTable.has("optional")) {
      continue;
    }
    const rawPath = inlineTable.get("path");
    const path = rawPath === undefined ? null : parseTomlString(rawPath);
    if (path === null) {
      continue;
    }
    const rawPackage = inlineTable.get("package");
    const packageName = rawPackage === undefined ? dependencyName : parseTomlString(rawPackage);
    if (packageName === null) {
      continue;
    }
    const crateName = normalizeCrateName(dependencyName);
    if (crateName === null) {
      continue;
    }
    const absoluteTargetPath = resolve(manifest.absolutePath, "..", path);
    result.push({ dependencyName, crateName, packageName, absoluteTargetPath });
  }
  return result.sort(
    (left, right) =>
      compareStableText(left.crateName, right.crateName) ||
      compareStableText(left.absoluteTargetPath, right.absoluteTargetPath)
  );
}

/**
 * Cargo members can inherit a dependency only by repeating its exact
 * workspace-dependency key with `{ workspace = true }`. Cargo permits only
 * `optional` and additive `features` alongside that key, so every other
 * member-side field deliberately remains unresolved.
 */
function parseWorkspaceInheritedPathDependencies(
  manifest: LoadedCargoManifest,
  workspacePathDependencies: readonly CargoPathDependency[]
): readonly CargoPathDependency[] {
  const dependencies = manifest.sections.get("dependencies");
  if (dependencies === undefined || workspacePathDependencies.length === 0) {
    return [];
  }
  const workspaceDependencyByName = new Map(
    workspacePathDependencies.map((dependency) => [dependency.dependencyName, dependency])
  );
  const result: CargoPathDependency[] = [];
  for (const [dependencyName, rawValue] of dependencies) {
    const inlineTable = parseTomlInlineTable(rawValue);
    const optional = inlineTable?.get("optional");
    const features = inlineTable?.get("features");
    if (
      inlineTable === null ||
      inlineTable.get("workspace")?.trim() !== "true" ||
      [...inlineTable.keys()].some((field) => !CARGO_WORKSPACE_INHERITANCE_FIELDS.has(field)) ||
      (optional !== undefined && parseTomlBoolean(optional) === null) ||
      (features !== undefined && parseTomlStringArray(features) === null)
    ) {
      continue;
    }
    const workspaceDependency = workspaceDependencyByName.get(dependencyName);
    const crateName = normalizeCrateName(dependencyName);
    if (workspaceDependency === undefined || crateName === null) {
      continue;
    }
    result.push({
      dependencyName,
      crateName,
      packageName: workspaceDependency.packageName,
      absoluteTargetPath: workspaceDependency.absoluteTargetPath
    });
  }
  return result.sort(
    (left, right) =>
      compareStableText(left.crateName, right.crateName) ||
      compareStableText(left.absoluteTargetPath, right.absoluteTargetPath)
  );
}

function memberRootPath(projectPath: string, member: string): string | null {
  if (member === "" || /[*?{}!]/u.test(member)) {
    return null;
  }
  const absolutePath = resolve(projectPath, member);
  return projectRelativePath(projectPath, absolutePath);
}

function packageForFile(
  packages: readonly CargoWorkspacePackage[],
  filePath: string
): CargoWorkspacePackage | undefined {
  return [...packages]
    .sort((left, right) => right.relativeRootPath.length - left.relativeRootPath.length)
    .find((workspacePackage) =>
      workspacePackage.relativeRootPath === ""
        ? true
        : filePath.startsWith(`${workspacePackage.relativeRootPath}/`)
    );
}

/**
 * Resolves a Rust crate only when the importing source belongs to an explicit
 * Cargo workspace member and that member declares either one direct inline-table
 * path dependency or an explicit `{ workspace = true }` inheritance from a
 * root `[workspace.dependencies]` local path. It deliberately does not infer
 * registry, glob, or transitive dependencies.
 */
export async function createCargoWorkspaceProjectModuleResolver(input: {
  readonly projectPath: string;
  readonly sourceDocuments: readonly SourceDocument[];
}): Promise<CargoWorkspaceProjectModuleResolver> {
  const projectPath = resolve(input.projectPath);
  const rootInput = await readProjectConfigurationInput(
    projectPath,
    "cargo-workspace-root-manifest",
    "Cargo.toml"
  );
  const knownFilePaths = new Set(input.sourceDocuments.map((document) => document.relativePath));
  if (rootInput.state === "absent") {
    return {
      moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([]) },
      configurationInputs: [rootInput]
    };
  }

  const rootManifest = await loadPresentCargoManifest(
    projectPath,
    rootInput.path,
    "cargo-workspace-root-manifest"
  );
  const workspacePathDependencies = parsePathDependencies(rootManifest, "workspace.dependencies", {
    rejectOptional: true
  });
  const rawMemberValues = rootManifest.sections.get("workspace")?.get("members");
  const memberValues = rawMemberValues === undefined ? [] : parseTomlStringArray(rawMemberValues);
  if (memberValues === null) {
    return {
      moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([rootInput.path]) },
      configurationInputs: [rootInput]
    };
  }

  const memberRoots = new Set<string>();
  for (const member of memberValues) {
    const relativeRootPath = memberRootPath(projectPath, member);
    if (relativeRootPath === null) {
      return {
        moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([rootInput.path]) },
        configurationInputs: [rootInput]
      };
    }
    if (memberRoots.has(relativeRootPath)) {
      throw configurationError(rootInput.path, `duplicate workspace member "${member}"`);
    }
    memberRoots.add(relativeRootPath);
  }
  const rootPackageName = parseTomlString(rootManifest.sections.get("package")?.get("name") ?? "");
  if (rootPackageName !== null && normalizeCrateName(rootPackageName) !== null) {
    // Cargo treats a package declared in the workspace root as a workspace
    // member even when it is not repeated in the literal members array.
    memberRoots.add("");
  }

  const memberManifestPaths = [...memberRoots]
    .map((relativeRootPath) =>
      relativeRootPath === "" ? "Cargo.toml" : `${relativeRootPath}/Cargo.toml`
    )
    .sort(compareStableText);
  const memberManifests = await Promise.all(
    memberManifestPaths.map((manifestPath) =>
      loadPresentCargoManifest(projectPath, manifestPath, "cargo-workspace-package-manifest")
    )
  );
  const workspacePackages = memberManifests
    .map((manifest) => {
      const packageName = parseTomlString(manifest.sections.get("package")?.get("name") ?? "");
      const crateName = packageName === null ? null : normalizeCrateName(packageName);
      if (packageName === null || crateName === null) {
        return null;
      }
      const absoluteRootPath = resolve(manifest.absolutePath, "..");
      const relativeRootPath = projectRelativePath(projectPath, absoluteRootPath);
      if (relativeRootPath === null) {
        throw configurationError(manifest.relativePath, "the member is outside the project root");
      }
      return {
        packageName,
        crateName,
        manifestPath: manifest.relativePath,
        manifestInput: manifest.input,
        absoluteRootPath,
        relativeRootPath,
        pathDependencies: [
          ...parsePathDependencies(manifest),
          ...parseWorkspaceInheritedPathDependencies(manifest, workspacePathDependencies)
        ] as readonly CargoPathDependency[]
      } satisfies CargoWorkspacePackage;
    })
    .filter((workspacePackage): workspacePackage is CargoWorkspacePackage => workspacePackage !== null)
    .sort((left, right) => compareStableText(left.manifestPath, right.manifestPath));

  const packageByRootPath = new Map<string, CargoWorkspacePackage>();
  for (const workspacePackage of workspacePackages) {
    if (packageByRootPath.has(workspacePackage.absoluteRootPath)) {
      throw configurationError(workspacePackage.manifestPath, "duplicate package root");
    }
    packageByRootPath.set(workspacePackage.absoluteRootPath, workspacePackage);
  }

  return {
    moduleResolver: {
      resolve(fromFilePath, moduleSpecifier) {
        if (!fromFilePath.endsWith(".rs") || !RUST_CRATE_NAME.test(moduleSpecifier)) {
          return unresolved([]);
        }
        const importingPackage = packageForFile(workspacePackages, fromFilePath);
        if (importingPackage === undefined) {
          return unresolved([rootInput.path]);
        }
        const targetPackages = importingPackage.pathDependencies
          .filter((dependency) => dependency.crateName === moduleSpecifier)
          .map((dependency) => {
            const targetPackage = packageByRootPath.get(dependency.absoluteTargetPath);
            return targetPackage?.packageName === dependency.packageName ? targetPackage : undefined;
          })
          .filter((workspacePackage): workspacePackage is CargoWorkspacePackage => workspacePackage !== undefined);
        if (targetPackages.length !== 1 || targetPackages[0] === undefined) {
          return unresolved([rootInput.path, importingPackage.manifestPath]);
        }
        const targetPackage = targetPackages[0];
        const targetFilePath =
          targetPackage.relativeRootPath === ""
            ? "src/lib.rs"
            : `${targetPackage.relativeRootPath}/src/lib.rs`;
        const configurationPaths = dedupePaths([
          rootInput.path,
          importingPackage.manifestPath,
          targetPackage.manifestPath
        ]);
        if (!knownFilePaths.has(targetFilePath)) {
          return unresolved(configurationPaths);
        }
        return {
          targetFilePath,
          strategy: "cargo-workspace-crate",
          configurationPaths
        };
      }
    },
    configurationInputs: [rootInput, ...memberManifests.map((manifest) => manifest.input)]
  };
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SaxesParser } from "saxes";

import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import type {
  JvmModuleDependency,
  JvmModuleMembership,
  JvmModuleSourceSet,
  JvmProjectModuleEvidence,
  SourceDocument
} from "../../ports/source-catalog.js";
import { compareProjectPaths } from "./discovery.js";
import { readProjectConfigurationInput } from "./project-inputs.js";

const CONVENTIONAL_JVM_SOURCE_ROOTS: readonly {
  readonly suffix: string;
  readonly sourceSet: JvmModuleSourceSet;
}[] = [
  { suffix: "src/main/java", sourceSet: "main" },
  { suffix: "src/main/kotlin", sourceSet: "main" },
  { suffix: "src/test/java", sourceSet: "test" },
  { suffix: "src/test/kotlin", sourceSet: "test" }
];

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/u;
const GRADLE_PROJECT_SEGMENT = /^[A-Za-z0-9_.-]+$/u;
const MAVEN_COORDINATE_PART = /^[A-Za-z0-9_.-]+$/u;

interface MavenProjectModule {
  readonly manifestPath: string;
  readonly configurationPaths: readonly string[];
}

interface MavenModuleCoordinate {
  readonly groupId: string;
  readonly artifactId: string;
}

interface MavenModuleDependencyRequest {
  readonly groupId: string;
  readonly artifactId: string;
  readonly consumerSourceSet: JvmModuleSourceSet;
}

interface MavenPomMetadata {
  readonly coordinate: MavenModuleCoordinate | null;
  readonly dependencies: readonly MavenModuleDependencyRequest[];
}

interface OpenMavenPomElement {
  readonly name: string;
  text: string;
}

interface MutableMavenDependencyDeclaration {
  groupId: string | null | undefined;
  artifactId: string | null | undefined;
  scope: string | null | undefined;
  type: string | null | undefined;
  classifier: string | null | undefined;
}

interface GradleProjectModule {
  readonly buildPath: string;
  /** Canonical Gradle project path, such as `:api:client`. */
  readonly projectPath: string;
  readonly configurationPaths: readonly string[];
}

interface MavenProjectDetection {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly modules: readonly MavenProjectModule[];
  readonly dependencies: readonly JvmModuleDependency[];
  readonly detected: boolean;
}

interface GradleProjectDetection {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly modules: readonly GradleProjectModule[];
  readonly dependencies: readonly JvmModuleDependency[];
  readonly detected: boolean;
}

export interface DetectedJvmProjectModuleEvidence {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  /** Omitted when no Maven or Gradle root configuration was found. */
  readonly projectEvidence?: JvmProjectModuleEvidence;
}

function projectPathInDirectory(directory: string, fileName: string): string {
  return directory.length === 0 ? fileName : `${directory}/${fileName}`;
}

function directoryForProjectPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

function uniqueConfigurationPaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)].sort(compareProjectPaths);
}

function uniqueConfigurationInputs(
  inputs: readonly ProjectConfigurationInput[]
): readonly ProjectConfigurationInput[] {
  const byKey = new Map<string, ProjectConfigurationInput>();
  for (const input of inputs) {
    byKey.set(`${input.kind}\u0000${input.path}`, input);
  }
  return [...byKey.values()].sort((left, right) => {
    const leftKey = `${left.kind}\u0000${left.path}`;
    const rightKey = `${right.kind}\u0000${right.path}`;
    return compareProjectPaths(leftKey, rightKey);
  });
}

function safeRelativeDirectory(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        !SAFE_PATH_SEGMENT.test(segment)
    )
  ) {
    return null;
  }

  return segments.join("/");
}

function mavenModuleDirectories(sourceText: string): readonly string[] {
  const withoutComments = sourceText.replace(/<!--[\s\S]*?-->/gu, "");
  const directories = new Set<string>();
  for (const match of withoutComments.matchAll(/<module\b[^>]*>([^<]+)<\/module\s*>/giu)) {
    const directory = safeRelativeDirectory(match[1] ?? "");
    if (directory !== null) {
      directories.add(directory);
    }
  }
  return [...directories].sort(compareProjectPaths);
}

function staticMavenCoordinatePart(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && MAVEN_COORDINATE_PART.test(normalized) ? normalized : null;
}

function staticMavenScalar(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueMavenValue(
  existing: string | null | undefined,
  next: string | null
): string | null {
  return existing === undefined ? next : null;
}

function mavenDependencySourceSet(
  dependency: MutableMavenDependencyDeclaration
): JvmModuleSourceSet | null {
  if (
    typeof dependency.groupId !== "string" ||
    typeof dependency.artifactId !== "string" ||
    (dependency.type !== undefined && dependency.type !== "jar") ||
    dependency.classifier !== undefined
  ) {
    return null;
  }
  switch (dependency.scope ?? "compile") {
    case "compile":
    case "provided":
      return "main";
    case "test":
      return "test";
    default:
      return null;
  }
}

/**
 * Parses only literal coordinates and root-level Maven dependencies from a
 * well-formed POM. Property interpolation, dependency management, plugins,
 * profiles, classifiers, and non-jar types remain intentionally unmodeled.
 */
function staticMavenPomMetadata(sourceText: string): MavenPomMetadata {
  const parser = new SaxesParser();
  const openElements: OpenMavenPomElement[] = [];
  const dependencyRequests = new Map<string, MavenModuleDependencyRequest>();
  let rootSeen = false;
  let valid = true;
  let projectGroupId: string | null | undefined;
  let projectArtifactId: string | null | undefined;
  let parentGroupId: string | null | undefined;
  let activeDependency: MutableMavenDependencyDeclaration | null = null;

  parser.on("error", () => {
    valid = false;
  });
  parser.on("doctype", () => {
    valid = false;
  });
  parser.on("opentag", (tag) => {
    if (openElements.length === 0) {
      rootSeen = true;
      if (tag.name !== "project") {
        valid = false;
      }
    }
    const parentPath = openElements.map((element) => element.name).join("/");
    if (tag.name === "dependency" && parentPath === "project/dependencies") {
      if (activeDependency !== null) {
        valid = false;
      }
      activeDependency = {
        groupId: undefined,
        artifactId: undefined,
        scope: undefined,
        type: undefined,
        classifier: undefined
      };
    }
    openElements.push({ name: tag.name, text: "" });
  });
  parser.on("text", (text) => {
    const element = openElements.at(-1);
    if (element !== undefined) {
      element.text += text;
    }
  });
  parser.on("cdata", (text) => {
    const element = openElements.at(-1);
    if (element !== undefined) {
      element.text += text;
    }
  });
  parser.on("closetag", () => {
    const element = openElements.pop();
    if (element === undefined) {
      valid = false;
      return;
    }
    const parentPath = openElements.map((parent) => parent.name).join("/");
    if (parentPath === "project" && element.name === "groupId") {
      projectGroupId = uniqueMavenValue(projectGroupId, staticMavenCoordinatePart(element.text));
    } else if (parentPath === "project" && element.name === "artifactId") {
      projectArtifactId = uniqueMavenValue(projectArtifactId, staticMavenCoordinatePart(element.text));
    } else if (parentPath === "project/parent" && element.name === "groupId") {
      parentGroupId = uniqueMavenValue(parentGroupId, staticMavenCoordinatePart(element.text));
    } else if (activeDependency !== null && parentPath === "project/dependencies/dependency") {
      if (element.name === "groupId") {
        activeDependency.groupId = uniqueMavenValue(
          activeDependency.groupId,
          staticMavenCoordinatePart(element.text)
        );
      } else if (element.name === "artifactId") {
        activeDependency.artifactId = uniqueMavenValue(
          activeDependency.artifactId,
          staticMavenCoordinatePart(element.text)
        );
      } else if (element.name === "scope") {
        activeDependency.scope = uniqueMavenValue(activeDependency.scope, staticMavenScalar(element.text));
      } else if (element.name === "type") {
        activeDependency.type = uniqueMavenValue(activeDependency.type, staticMavenScalar(element.text));
      } else if (element.name === "classifier") {
        activeDependency.classifier = uniqueMavenValue(
          activeDependency.classifier,
          staticMavenScalar(element.text)
        );
      }
    }
    if (parentPath === "project/dependencies" && element.name === "dependency") {
      const dependency = activeDependency;
      activeDependency = null;
      const consumerSourceSet = dependency === null ? null : mavenDependencySourceSet(dependency);
      if (
        consumerSourceSet !== null &&
        typeof dependency?.groupId === "string" &&
        typeof dependency.artifactId === "string"
      ) {
        const request: MavenModuleDependencyRequest = {
          groupId: dependency.groupId,
          artifactId: dependency.artifactId,
          consumerSourceSet
        };
        dependencyRequests.set(
          `${request.groupId}\u0000${request.artifactId}\u0000${request.consumerSourceSet}`,
          request
        );
      }
    }
  });

  try {
    parser.write(sourceText).close();
  } catch {
    valid = false;
  }

  const groupId = projectGroupId === undefined ? parentGroupId : projectGroupId;
  const coordinate =
    valid &&
    rootSeen &&
    openElements.length === 0 &&
    typeof groupId === "string" &&
    typeof projectArtifactId === "string"
      ? { groupId, artifactId: projectArtifactId }
      : null;
  return {
    coordinate,
    dependencies:
      valid && rootSeen && openElements.length === 0
        ? [...dependencyRequests.values()].sort((left, right) =>
            compareProjectPaths(
              `${left.groupId}\u0000${left.artifactId}\u0000${left.consumerSourceSet}`,
              `${right.groupId}\u0000${right.artifactId}\u0000${right.consumerSourceSet}`
            )
          )
        : []
  };
}

function staticMavenModuleDependencyEvidence(input: {
  readonly modules: readonly MavenProjectModule[];
  readonly metadataByManifestPath: ReadonlyMap<string, MavenPomMetadata>;
}): readonly JvmModuleDependency[] {
  const modulesByCoordinate = new Map<string, MavenProjectModule[]>();
  for (const module of input.modules) {
    const coordinate = input.metadataByManifestPath.get(module.manifestPath)?.coordinate;
    if (coordinate === null || coordinate === undefined) {
      continue;
    }
    const key = `${coordinate.groupId}\u0000${coordinate.artifactId}`;
    const candidates = modulesByCoordinate.get(key) ?? [];
    candidates.push(module);
    modulesByCoordinate.set(key, candidates);
  }

  const dependenciesByKey = new Map<string, JvmModuleDependency>();
  for (const sourceModule of input.modules) {
    const metadata = input.metadataByManifestPath.get(sourceModule.manifestPath);
    if (metadata === undefined) {
      continue;
    }
    for (const request of metadata.dependencies) {
      const targetModules = modulesByCoordinate.get(`${request.groupId}\u0000${request.artifactId}`) ?? [];
      if (targetModules.length !== 1 || targetModules[0] === undefined) {
        continue;
      }
      const targetModule = targetModules[0];
      if (sourceModule.manifestPath === targetModule.manifestPath) {
        continue;
      }
      const dependency: JvmModuleDependency = {
        sourceModuleId: `maven:${sourceModule.manifestPath}`,
        targetModuleId: `maven:${targetModule.manifestPath}`,
        consumerSourceSet: request.consumerSourceSet,
        kind: "maven-module",
        configurationPaths: uniqueConfigurationPaths([
          ...sourceModule.configurationPaths,
          ...targetModule.configurationPaths
        ])
      };
      dependenciesByKey.set(
        `${dependency.sourceModuleId}\u0000${dependency.targetModuleId}\u0000${dependency.consumerSourceSet}`,
        dependency
      );
    }
  }
  return [...dependenciesByKey.values()].sort((left, right) =>
    compareProjectPaths(
      `${left.sourceModuleId}\u0000${left.targetModuleId}\u0000${left.consumerSourceSet}`,
      `${right.sourceModuleId}\u0000${right.targetModuleId}\u0000${right.consumerSourceSet}`
    )
  );
}

type GradleStringDelimiter = '"' | "'" | '"""' | "'''";

function gradleStringDelimiterAt(sourceText: string, index: number): GradleStringDelimiter | null {
  if (sourceText.startsWith('"""', index)) {
    return '"""';
  }
  if (sourceText.startsWith("'''", index)) {
    return "'''";
  }
  const character = sourceText[index];
  return character === '"' || character === "'" ? character : null;
}

/** Removes comments without treating comment markers inside Gradle strings as comments. */
function withoutGradleComments(sourceText: string): string {
  const characters = sourceText.split("");
  let quote: GradleStringDelimiter | null = null;

  for (let index = 0; index < sourceText.length; ) {
    if (quote !== null) {
      if (quote.length === 3 && sourceText.startsWith(quote, index)) {
        index += quote.length;
        quote = null;
        continue;
      }
      if (quote.length === 1 && sourceText[index] === "\\") {
        index += 2;
        continue;
      }
      if (quote.length === 1 && sourceText[index] === quote) {
        index += 1;
        quote = null;
        continue;
      }
      index += 1;
      continue;
    }

    const delimiter = gradleStringDelimiterAt(sourceText, index);
    if (delimiter !== null) {
      quote = delimiter;
      index += delimiter.length;
      continue;
    }
    if (sourceText.startsWith("//", index)) {
      while (index < sourceText.length && sourceText[index] !== "\r" && sourceText[index] !== "\n") {
        characters[index] = " ";
        index += 1;
      }
      continue;
    }
    if (sourceText.startsWith("/*", index)) {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 2;
      while (index < sourceText.length) {
        if (sourceText.startsWith("*/", index)) {
          characters[index] = " ";
          characters[index + 1] = " ";
          index += 2;
          break;
        }
        if (sourceText[index] !== "\r" && sourceText[index] !== "\n") {
          characters[index] = " ";
        }
        index += 1;
      }
      continue;
    }
    index += 1;
  }

  return characters.join("");
}

/** Marks characters that are code rather than quoted Gradle script text. */
function gradleCodeMask(sourceText: string): readonly boolean[] {
  const codeMask = Array<boolean>(sourceText.length).fill(true);
  let quote: GradleStringDelimiter | null = null;

  for (let index = 0; index < sourceText.length; ) {
    if (quote !== null) {
      if (quote.length === 3 && sourceText.startsWith(quote, index)) {
        for (let offset = 0; offset < quote.length; offset += 1) {
          codeMask[index + offset] = false;
        }
        index += quote.length;
        quote = null;
        continue;
      }
      codeMask[index] = false;
      if (quote.length === 1 && sourceText[index] === "\\") {
        if (index + 1 < sourceText.length) {
          codeMask[index + 1] = false;
        }
        index += 2;
        continue;
      }
      if (quote.length === 1 && sourceText[index] === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    const delimiter = gradleStringDelimiterAt(sourceText, index);
    if (delimiter === null) {
      index += 1;
      continue;
    }
    for (let offset = 0; offset < delimiter.length; offset += 1) {
      codeMask[index + offset] = false;
    }
    quote = delimiter;
    index += delimiter.length;
  }

  return codeMask;
}

function isGradleCodeRange(codeMask: readonly boolean[], start: number, end: number): boolean {
  if (start < 0 || end > codeMask.length) {
    return false;
  }
  for (let index = start; index < end; index += 1) {
    if (codeMask[index] !== true) {
      return false;
    }
  }
  return true;
}

function normalizeGradleProjectPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === ":") {
    return ":";
  }
  const segments = (trimmed.startsWith(":") ? trimmed.slice(1) : trimmed).split(":");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        !GRADLE_PROJECT_SEGMENT.test(segment)
    )
  ) {
    return null;
  }
  return `:${segments.join(":")}`;
}

function gradleProjectPathForDirectory(directory: string): string {
  return directory.length === 0 ? ":" : `:${directory.replaceAll("/", ":")}`;
}

function gradleModuleDirectories(sourceText: string): readonly string[] {
  const withoutComments = withoutGradleComments(sourceText);
  const codeMask = gradleCodeMask(withoutComments);
  const directories = new Set<string>();
  const quotedPath = /(["'])((?::)?[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)*)\1/gu;

  for (const lineMatch of withoutComments.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)) {
    const rawLine = (lineMatch[0] ?? "").replace(/(?:\r\n|\r|\n)$/u, "");
    if (rawLine.length === 0) {
      continue;
    }
    const include = /^\s*include\s*(?:\((.*)\)|(.*))\s*;?\s*$/u.exec(rawLine);
    if (include === null) {
      continue;
    }
    const includeStart = (lineMatch.index ?? 0) + rawLine.indexOf("include");
    if (!isGradleCodeRange(codeMask, includeStart, includeStart + "include".length)) {
      continue;
    }
    const argumentsText = (include[1] ?? include[2] ?? "").trim();
    const matches = [...argumentsText.matchAll(quotedPath)];
    const remaining = argumentsText
      .replace(quotedPath, "")
      .replace(/[\s,]/gu, "");
    if (matches.length === 0 || remaining.length !== 0) {
      continue;
    }

    for (const match of matches) {
      const projectPath = normalizeGradleProjectPath(match[2] ?? "");
      if (projectPath === null || projectPath === ":") {
        continue;
      }
      directories.add(projectPath.slice(1).replaceAll(":", "/"));
    }
  }

  return [...directories].sort(compareProjectPaths);
}

async function readPresentProjectInput(
  projectPath: string,
  input: ProjectConfigurationInput
): Promise<string> {
  return readFile(resolve(projectPath, ...input.path.split("/")), "utf8");
}

async function detectMavenProjectModules(projectPath: string): Promise<MavenProjectDetection> {
  const rootInput = await readProjectConfigurationInput(projectPath, "maven-project", "pom.xml");
  if (rootInput.state === "absent") {
    return { configurationInputs: [rootInput], modules: [], dependencies: [], detected: false };
  }

  const configurationInputs = new Map<string, ProjectConfigurationInput>([[rootInput.path, rootInput]]);
  const modules = new Map<string, MavenProjectModule>();
  const metadataByManifestPath = new Map<string, MavenPomMetadata>();
  const rootModule: MavenProjectModule = {
    manifestPath: rootInput.path,
    configurationPaths: [rootInput.path]
  };
  modules.set(rootModule.manifestPath, rootModule);
  const pending = [rootModule];

  for (let index = 0; index < pending.length; index += 1) {
    const module = pending[index];
    if (module === undefined) {
      continue;
    }
    const sourceText = await readPresentProjectInput(projectPath, configurationInputs.get(module.manifestPath)!);
    metadataByManifestPath.set(module.manifestPath, staticMavenPomMetadata(sourceText));
    for (const directory of mavenModuleDirectories(sourceText)) {
      const manifestPath = projectPathInDirectory(
        projectPathInDirectory(directoryForProjectPath(module.manifestPath), directory),
        "pom.xml"
      );
      let childInput = configurationInputs.get(manifestPath);
      if (childInput === undefined) {
        childInput = await readProjectConfigurationInput(projectPath, "maven-project", manifestPath);
        configurationInputs.set(manifestPath, childInput);
      }
      if (childInput.state === "absent" || modules.has(manifestPath)) {
        continue;
      }
      const childModule: MavenProjectModule = {
        manifestPath,
        configurationPaths: uniqueConfigurationPaths([...module.configurationPaths, manifestPath])
      };
      modules.set(manifestPath, childModule);
      pending.push(childModule);
    }
  }

  const orderedModules = [...modules.values()].sort((left, right) =>
    compareProjectPaths(left.manifestPath, right.manifestPath)
  );
  return {
    configurationInputs: [...configurationInputs.values()].sort((left, right) =>
      compareProjectPaths(left.path, right.path)
    ),
    modules: orderedModules,
    dependencies: staticMavenModuleDependencyEvidence({
      modules: orderedModules,
      metadataByManifestPath
    }),
    detected: true
  };
}

async function readGradleBuildInputs(
  projectPath: string,
  directory: string
): Promise<readonly ProjectConfigurationInput[]> {
  const moduleName = directory.split("/").at(-1);
  const fileNames = [
    "build.gradle",
    "build.gradle.kts",
    ...(directory.length === 0 || moduleName === undefined
      ? []
      : [`${moduleName}.gradle`, `${moduleName}.gradle.kts`])
  ];
  return Promise.all(
    fileNames.map((fileName) =>
      readProjectConfigurationInput(projectPath, "gradle-build", projectPathInDirectory(directory, fileName))
    )
  );
}

function selectedConfigurationInput(
  inputs: readonly ProjectConfigurationInput[]
): ProjectConfigurationInput | undefined {
  const present = inputs.filter((input) => input.state === "present");
  return present.length === 1 ? present[0] : undefined;
}

const GRADLE_PROJECT_DEPENDENCY_SOURCE_SETS: ReadonlyMap<string, JvmModuleSourceSet> = new Map([
  ["api", "main"],
  ["implementation", "main"],
  ["compileOnly", "main"],
  ["testApi", "test"],
  ["testImplementation", "test"],
  ["testCompileOnly", "test"]
]);

interface GradleProjectDependencyRequest {
  readonly consumerSourceSet: JvmModuleSourceSet;
  readonly targetProjectPath: string;
}

/** Extracts balanced `dependencies { ... }` bodies without executing a build script. */
function gradleDependencyBlocks(sourceText: string): readonly string[] {
  const source = withoutGradleComments(sourceText);
  const codeMask = gradleCodeMask(source);
  const blocks: string[] = [];
  for (const match of source.matchAll(/\bdependencies\s*\{/gu)) {
    const start = match.index ?? 0;
    const openingBrace = start + match[0].lastIndexOf("{");
    if (!isGradleCodeRange(codeMask, start, openingBrace + 1)) {
      continue;
    }
    let depth = 1;
    let quote: "\"" | "'" | null = null;
    for (let index = openingBrace + 1; index < source.length; index += 1) {
      if (codeMask[index] !== true) {
        continue;
      }
      const character = source[index];
      if (character === undefined) {
        continue;
      }
      if (quote !== null) {
        if (character === "\\") {
          index += 1;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          blocks.push(source.slice(openingBrace + 1, index));
          break;
        }
      }
    }
  }
  return blocks;
}

function staticGradleProjectDependencies(sourceText: string): readonly GradleProjectDependencyRequest[] {
  const dependenciesByKey = new Map<string, GradleProjectDependencyRequest>();
  const parenthesizedDeclaration =
    /\b(api|implementation|compileOnly|testApi|testImplementation|testCompileOnly)\s*\(\s*project\s*\(\s*(["'])([^"'\r\n]+)\2\s*\)\s*\)/gu;
  const groovyDeclaration =
    /\b(api|implementation|compileOnly|testApi|testImplementation|testCompileOnly)\s+project\s*\(\s*(["'])([^"'\r\n]+)\2\s*\)/gu;
  const addMatches = (expression: RegExp, body: string): void => {
    const codeMask = gradleCodeMask(body);
    for (const match of body.matchAll(expression)) {
      const start = match.index ?? 0;
      const firstQuoteOffset = match[0].indexOf(match[2] ?? "");
      if (
        firstQuoteOffset <= 0 ||
        !isGradleCodeRange(codeMask, start, start + firstQuoteOffset)
      ) {
        continue;
      }
      const consumerSourceSet = GRADLE_PROJECT_DEPENDENCY_SOURCE_SETS.get(match[1] ?? "");
      const targetProjectPath = normalizeGradleProjectPath(match[3] ?? "");
      if (consumerSourceSet === undefined || targetProjectPath === null) {
        continue;
      }
      const request = { consumerSourceSet, targetProjectPath };
      dependenciesByKey.set(`${consumerSourceSet}\u0000${targetProjectPath}`, request);
    }
  };

  for (const body of gradleDependencyBlocks(sourceText)) {
    addMatches(parenthesizedDeclaration, body);
    addMatches(groovyDeclaration, body);
  }
  return [...dependenciesByKey.values()].sort((left, right) =>
    compareProjectPaths(
      `${left.consumerSourceSet}\u0000${left.targetProjectPath}`,
      `${right.consumerSourceSet}\u0000${right.targetProjectPath}`
    )
  );
}

async function staticGradleProjectDependencyEvidence(input: {
  readonly projectPath: string;
  readonly modules: readonly GradleProjectModule[];
}): Promise<readonly JvmModuleDependency[]> {
  const modulesByProjectPath = new Map<string, GradleProjectModule[]>();
  for (const module of input.modules) {
    const candidates = modulesByProjectPath.get(module.projectPath) ?? [];
    candidates.push(module);
    modulesByProjectPath.set(module.projectPath, candidates);
  }

  const dependenciesByKey = new Map<string, JvmModuleDependency>();
  for (const sourceModule of input.modules) {
    const sourceText = await readFile(
      resolve(input.projectPath, ...sourceModule.buildPath.split("/")),
      "utf8"
    );
    for (const request of staticGradleProjectDependencies(sourceText)) {
      const targetModules = modulesByProjectPath.get(request.targetProjectPath) ?? [];
      if (targetModules.length !== 1 || targetModules[0] === undefined) {
        continue;
      }
      const targetModule = targetModules[0];
      const dependency: JvmModuleDependency = {
        sourceModuleId: `gradle:${sourceModule.buildPath}`,
        targetModuleId: `gradle:${targetModule.buildPath}`,
        consumerSourceSet: request.consumerSourceSet,
        kind: "gradle-project",
        configurationPaths: uniqueConfigurationPaths([
          ...sourceModule.configurationPaths,
          ...targetModule.configurationPaths
        ])
      };
      const key = `${dependency.sourceModuleId}\u0000${dependency.targetModuleId}\u0000${dependency.consumerSourceSet}`;
      dependenciesByKey.set(key, dependency);
    }
  }
  return [...dependenciesByKey.values()].sort((left, right) =>
    compareProjectPaths(
      `${left.sourceModuleId}\u0000${left.targetModuleId}\u0000${left.consumerSourceSet}`,
      `${right.sourceModuleId}\u0000${right.targetModuleId}\u0000${right.consumerSourceSet}`
    )
  );
}

async function detectGradleProjectModules(projectPath: string): Promise<GradleProjectDetection> {
  const settingsInputs = await Promise.all(
    ["settings.gradle", "settings.gradle.kts"].map((fileName) =>
      readProjectConfigurationInput(projectPath, "gradle-settings", fileName)
    )
  );
  const rootBuildInputs = await readGradleBuildInputs(projectPath, "");
  const selectedSettings = selectedConfigurationInput(settingsInputs);
  const selectedRootBuild = selectedConfigurationInput(rootBuildInputs);
  const configurationInputs: ProjectConfigurationInput[] = [...settingsInputs, ...rootBuildInputs];
  const modules: GradleProjectModule[] = [];

  if (selectedRootBuild !== undefined) {
    modules.push({
      buildPath: selectedRootBuild.path,
      projectPath: ":",
      configurationPaths: uniqueConfigurationPaths(
        selectedSettings === undefined ? [selectedRootBuild.path] : [selectedSettings.path, selectedRootBuild.path]
      )
    });
  }

  if (selectedSettings !== undefined) {
    const sourceText = await readPresentProjectInput(projectPath, selectedSettings);
    for (const directory of gradleModuleDirectories(sourceText)) {
      const buildInputs = await readGradleBuildInputs(projectPath, directory);
      configurationInputs.push(...buildInputs);
      const selectedBuild = selectedConfigurationInput(buildInputs);
      if (selectedBuild === undefined) {
        continue;
      }
      modules.push({
        buildPath: selectedBuild.path,
        projectPath: gradleProjectPathForDirectory(directory),
        configurationPaths: uniqueConfigurationPaths([selectedSettings.path, selectedBuild.path])
      });
    }
  }

  const orderedModules = modules.sort((left, right) => compareProjectPaths(left.buildPath, right.buildPath));
  return {
    configurationInputs: uniqueConfigurationInputs(configurationInputs),
    modules: orderedModules,
    dependencies: await staticGradleProjectDependencyEvidence({ projectPath, modules: orderedModules }),
    detected:
      settingsInputs.some((input) => input.state === "present") ||
      rootBuildInputs.some((input) => input.state === "present")
  };
}

function membershipSourceSet(
  filePath: string,
  moduleDirectory: string
): JvmModuleSourceSet | null {
  for (const sourceRoot of CONVENTIONAL_JVM_SOURCE_ROOTS) {
    const prefix = `${projectPathInDirectory(moduleDirectory, sourceRoot.suffix)}/`;
    if (filePath.startsWith(prefix)) {
      return sourceRoot.sourceSet;
    }
  }
  return null;
}

function membershipsForMavenModules(
  modules: readonly MavenProjectModule[],
  sourceDocuments: readonly SourceDocument[]
): readonly JvmModuleMembership[] {
  const memberships: JvmModuleMembership[] = [];
  for (const module of modules) {
    const moduleDirectory = directoryForProjectPath(module.manifestPath);
    for (const sourceDocument of sourceDocuments) {
      if (sourceDocument.language !== "java" && sourceDocument.language !== "kotlin") {
        continue;
      }
      const sourceSet = membershipSourceSet(sourceDocument.relativePath, moduleDirectory);
      if (sourceSet !== null) {
        memberships.push({
          filePath: sourceDocument.relativePath,
          moduleId: `maven:${module.manifestPath}`,
          sourceSet,
          configurationPaths: module.configurationPaths
        });
      }
    }
  }
  return memberships;
}

function membershipsForGradleModules(
  modules: readonly GradleProjectModule[],
  sourceDocuments: readonly SourceDocument[]
): readonly JvmModuleMembership[] {
  const memberships: JvmModuleMembership[] = [];
  for (const module of modules) {
    const moduleDirectory = directoryForProjectPath(module.buildPath);
    for (const sourceDocument of sourceDocuments) {
      if (sourceDocument.language !== "java" && sourceDocument.language !== "kotlin") {
        continue;
      }
      const sourceSet = membershipSourceSet(sourceDocument.relativePath, moduleDirectory);
      if (sourceSet !== null) {
        memberships.push({
          filePath: sourceDocument.relativePath,
          moduleId: `gradle:${module.buildPath}`,
          sourceSet,
          configurationPaths: module.configurationPaths
        });
      }
    }
  }
  return memberships;
}

function sortedMemberships(memberships: readonly JvmModuleMembership[]): readonly JvmModuleMembership[] {
  const byKey = new Map<string, JvmModuleMembership>();
  for (const membership of memberships) {
    const key = `${membership.filePath}\u0000${membership.moduleId}\u0000${membership.sourceSet}`;
    byKey.set(key, membership);
  }
  return [...byKey.values()].sort((left, right) =>
    compareProjectPaths(
      `${left.filePath}\u0000${left.moduleId}\u0000${left.sourceSet}`,
      `${right.filePath}\u0000${right.moduleId}\u0000${right.sourceSet}`
    )
  );
}

/**
 * Detects conventional Maven and Gradle source-module layouts plus a narrow,
 * literal Gradle `project(...)` dependency form. Neither source roots nor
 * declarations claim a compiler classpath. Dynamic Maven/Gradle project
 * configuration is retained as index input but deliberately does not create
 * guessed memberships or dependency evidence.
 */
export async function detectJvmProjectModuleEvidence(
  projectPath: string,
  sourceDocuments: readonly SourceDocument[]
): Promise<DetectedJvmProjectModuleEvidence> {
  const normalizedProjectPath = resolve(projectPath);
  const [maven, gradle] = await Promise.all([
    detectMavenProjectModules(normalizedProjectPath),
    detectGradleProjectModules(normalizedProjectPath)
  ]);
  const configurationInputs = uniqueConfigurationInputs([
    ...maven.configurationInputs,
    ...gradle.configurationInputs
  ]);
  if (!maven.detected && !gradle.detected) {
    return { configurationInputs };
  }

  return {
    configurationInputs,
    projectEvidence: {
      memberships: sortedMemberships([
        ...membershipsForMavenModules(maven.modules, sourceDocuments),
        ...membershipsForGradleModules(gradle.modules, sourceDocuments)
      ]),
      dependencies: [...maven.dependencies, ...gradle.dependencies].sort((left, right) =>
        compareProjectPaths(
          `${left.sourceModuleId}\u0000${left.targetModuleId}\u0000${left.consumerSourceSet}`,
          `${right.sourceModuleId}\u0000${right.targetModuleId}\u0000${right.consumerSourceSet}`
        )
      )
    }
  };
}

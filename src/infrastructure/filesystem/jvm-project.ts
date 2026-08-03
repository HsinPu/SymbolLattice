import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import type {
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

interface MavenProjectModule {
  readonly manifestPath: string;
  readonly configurationPaths: readonly string[];
}

interface GradleProjectModule {
  readonly buildPath: string;
  readonly configurationPaths: readonly string[];
}

interface MavenProjectDetection {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly modules: readonly MavenProjectModule[];
  readonly detected: boolean;
}

interface GradleProjectDetection {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly modules: readonly GradleProjectModule[];
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

function gradleModuleDirectories(sourceText: string): readonly string[] {
  const withoutComments = sourceText
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/[^\r\n]*/gu, "");
  const directories = new Set<string>();
  const quotedPath = /(["'])((?::)?[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)*)\1/gu;

  for (const rawLine of withoutComments.split(/\r?\n/u)) {
    const include = /^\s*include\s*(?:\((.*)\)|(.*))\s*;?\s*$/u.exec(rawLine);
    if (include === null) {
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
      const value = match[2] ?? "";
      const segments = (value.startsWith(":") ? value.slice(1) : value).split(":");
      if (
        segments.length === 0 ||
        segments.some(
          (segment) =>
            segment === "." ||
            segment === ".." ||
            !GRADLE_PROJECT_SEGMENT.test(segment)
        )
      ) {
        continue;
      }
      directories.add(segments.join("/"));
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
    return { configurationInputs: [rootInput], modules: [], detected: false };
  }

  const configurationInputs = new Map<string, ProjectConfigurationInput>([[rootInput.path, rootInput]]);
  const modules = new Map<string, MavenProjectModule>();
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

  return {
    configurationInputs: [...configurationInputs.values()].sort((left, right) =>
      compareProjectPaths(left.path, right.path)
    ),
    modules: [...modules.values()].sort((left, right) =>
      compareProjectPaths(left.manifestPath, right.manifestPath)
    ),
    detected: true
  };
}

async function readGradleBuildInputs(
  projectPath: string,
  directory: string
): Promise<readonly ProjectConfigurationInput[]> {
  return Promise.all(
    ["build.gradle", "build.gradle.kts"].map((fileName) =>
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
        configurationPaths: uniqueConfigurationPaths([selectedSettings.path, selectedBuild.path])
      });
    }
  }

  return {
    configurationInputs: uniqueConfigurationInputs(configurationInputs),
    modules: modules.sort((left, right) => compareProjectPaths(left.buildPath, right.buildPath)),
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
 * Detects only conventional Maven and Gradle source-module layouts. A build
 * file proves a source root's membership, not a dependency declaration or a
 * compiler classpath. Dynamic Maven/Gradle project configuration is retained
 * as index input but deliberately does not create guessed memberships.
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
      ])
    }
  };
}

import { resolve } from "node:path";

import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import {
  compareProjectPaths,
  hashSource,
  hashUtf8File
} from "./discovery.js";
import {
  nativeProjectFilesystemReader,
  ProjectPathAccessCollector,
  projectFilesystemMissingCode,
  readProjectFilesystemText,
  type ProjectFilesystemReader
} from "./project-filesystem.js";
import { walkScopedProject } from "./scoped-walker.js";

export const CONFIGURATION_DISCOVERY_INPUT_PATH =
  ".SymbolLattice/configuration-candidates.json";
export const CONFIGURATION_DISCOVERY_POLICY = "configuration-candidates-v3" as const;

const CONFIGURATION_CANDIDATE_NAMES: ReadonlySet<string> = new Set([
  ".gitignore",
  "Cargo.toml",
  "astro.config.cjs",
  "astro.config.cts",
  "astro.config.js",
  "astro.config.mjs",
  "astro.config.mts",
  "astro.config.ts",
  "build.gradle",
  "build.gradle.kts",
  "go.mod",
  "jsconfig.json",
  "package.json",
  "pom.xml",
  "project.pbxproj",
  "settings.gradle",
  "settings.gradle.kts",
  "tsconfig.json"
]);

const TYPESCRIPT_PROJECT_CONFIGURATION_NAME = /^(?:ts|js)config(?:\.[A-Za-z0-9_-]+)+\.json$/u;

export function isConfigurationCandidateFileName(fileName: string): boolean {
  return (
    CONFIGURATION_CANDIDATE_NAMES.has(fileName) ||
    TYPESCRIPT_PROJECT_CONFIGURATION_NAME.test(fileName)
  );
}

interface ConfigurationCandidateIdentity {
  readonly path: string;
  readonly state: "present" | "absent";
  readonly contentHash: string | null;
}

export interface ConfigurationCandidateSnapshot {
  readonly input: ProjectConfigurationInput;
  readonly candidatesChecked: number;
}

function isVirtualConfigurationInput(input: ProjectConfigurationInput): boolean {
  return (
    input.kind === "cargo-workspace-member-glob" ||
    input.kind === "configuration-discovery"
  );
}

async function discoverPresentCandidatePaths(
  projectPath: string,
  filesystemReader: ProjectFilesystemReader
): Promise<readonly string[]> {
  return (await walkScopedProject(projectPath, {
    reader: filesystemReader,
    isConfigurationCandidateFileName
  })).configurationPaths;
}

async function readCandidateIdentity(
  projectPath: string,
  path: string,
  filesystemReader: ProjectFilesystemReader,
  access: ProjectPathAccessCollector
): Promise<ConfigurationCandidateIdentity | null> {
  const absolutePath = resolve(projectPath, ...path.split("/"));
  try {
    return {
      path,
      state: "present",
      contentHash: filesystemReader === nativeProjectFilesystemReader
        ? await hashUtf8File(absolutePath)
        : hashSource(await readProjectFilesystemText(filesystemReader, absolutePath))
    };
  } catch (error) {
    if (projectFilesystemMissingCode(error) !== null) {
      return { path, state: "absent", contentHash: null };
    }
    if (access.add(absolutePath, error)) return null;
    throw error;
  }
}

/**
 * Creates a bounded, content-addressed snapshot of every configuration filename
 * understood by project resolvers plus their explicitly tracked local inputs.
 * Extra candidates may conservatively trigger a rebuild; missing candidates can
 * never silently preserve a stale resolver projection.
 */
export async function discoverConfigurationCandidateInput(
  projectPath: string,
  trackedInputs: readonly ProjectConfigurationInput[],
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader,
  presentCandidatePaths?: readonly string[]
): Promise<ProjectConfigurationInput> {
  return (await discoverConfigurationCandidateSnapshot(
    projectPath,
    trackedInputs,
    presentCandidatePaths,
    filesystemReader
  )).input;
}

export async function discoverConfigurationCandidateSnapshot(
  projectPath: string,
  trackedInputs: readonly ProjectConfigurationInput[],
  presentCandidatePaths?: readonly string[],
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<ConfigurationCandidateSnapshot> {
  const candidatePaths = new Set(
    presentCandidatePaths ?? await discoverPresentCandidatePaths(projectPath, filesystemReader)
  );
  candidatePaths.add(".gitignore");
  for (const input of trackedInputs) {
    if (!isVirtualConfigurationInput(input)) {
      candidatePaths.add(input.path);
    }
  }

  const sortedPaths = [...candidatePaths].sort(compareProjectPaths);
  const candidates: ConfigurationCandidateIdentity[] = [];
  const access = new ProjectPathAccessCollector(projectPath);
  const maximumConcurrentReads = 8;
  for (let offset = 0; offset < sortedPaths.length; offset += maximumConcurrentReads) {
    const batch = await Promise.all(
      sortedPaths
        .slice(offset, offset + maximumConcurrentReads)
        .map((path) => readCandidateIdentity(projectPath, path, filesystemReader, access))
    );
    candidates.push(...batch.filter((candidate): candidate is ConfigurationCandidateIdentity => candidate !== null));
  }
  access.throwIfAny();

  return {
    candidatesChecked: candidates.length,
    input: {
      kind: "configuration-discovery",
      path: CONFIGURATION_DISCOVERY_INPUT_PATH,
      state: "present",
      contentHash: hashSource(JSON.stringify({
        policy: CONFIGURATION_DISCOVERY_POLICY,
        candidates
      }))
    }
  };
}

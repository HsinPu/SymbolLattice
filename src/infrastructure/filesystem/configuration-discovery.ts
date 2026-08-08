import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import {
  HARD_EXCLUDED_DIRECTORY_NAMES,
  compareProjectPaths,
  hashSource,
  toProjectRelativePath
} from "./discovery.js";

export const CONFIGURATION_DISCOVERY_INPUT_PATH =
  ".symbol-lattice/configuration-candidates.json";
export const CONFIGURATION_DISCOVERY_POLICY = "configuration-candidates-v1" as const;

const CONFIGURATION_CANDIDATE_NAMES: ReadonlySet<string> = new Set([
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

async function discoverPresentCandidatePaths(projectPath: string): Promise<readonly string[]> {
  const paths: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareProjectPaths(left.name, right.name))) {
      const entryPath = resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (!HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }
      if (entry.isFile() && CONFIGURATION_CANDIDATE_NAMES.has(entry.name)) {
        paths.push(toProjectRelativePath(projectPath, entryPath));
      }
    }
  }

  await visit(resolve(projectPath));
  return paths.sort(compareProjectPaths);
}

async function readCandidateIdentity(
  projectPath: string,
  path: string
): Promise<ConfigurationCandidateIdentity> {
  try {
    const contents = await readFile(resolve(projectPath, ...path.split("/")), "utf8");
    return { path, state: "present", contentHash: hashSource(contents) };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { path, state: "absent", contentHash: null };
    }
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
  trackedInputs: readonly ProjectConfigurationInput[]
): Promise<ProjectConfigurationInput> {
  return (await discoverConfigurationCandidateSnapshot(projectPath, trackedInputs)).input;
}

export async function discoverConfigurationCandidateSnapshot(
  projectPath: string,
  trackedInputs: readonly ProjectConfigurationInput[]
): Promise<ConfigurationCandidateSnapshot> {
  const candidatePaths = new Set(await discoverPresentCandidatePaths(projectPath));
  candidatePaths.add(".gitignore");
  for (const input of trackedInputs) {
    if (!isVirtualConfigurationInput(input)) {
      candidatePaths.add(input.path);
    }
  }

  const sortedPaths = [...candidatePaths].sort(compareProjectPaths);
  const candidates: ConfigurationCandidateIdentity[] = [];
  const maximumConcurrentReads = 8;
  for (let offset = 0; offset < sortedPaths.length; offset += maximumConcurrentReads) {
    candidates.push(
      ...(await Promise.all(
        sortedPaths
          .slice(offset, offset + maximumConcurrentReads)
          .map((path) => readCandidateIdentity(projectPath, path))
      ))
    );
  }

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

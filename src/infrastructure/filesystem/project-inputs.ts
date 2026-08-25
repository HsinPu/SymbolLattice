import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  PROJECT_INDEX_INPUTS_FORMAT_VERSION,
  type ProjectConfigurationInput,
  type ProjectConfigurationInputKind,
  type ProjectIndexInputs
} from "../../domain/index-inputs.js";
import { canonicalizeScopeRoots, compareProjectPaths, hashSource } from "./discovery.js";
import { discoverConfigurationCandidateInput } from "./configuration-discovery.js";
import {
  nativeProjectFilesystemReader,
  ProjectPathAccessCollector,
  projectFilesystemMissingCode,
  readProjectFilesystemText,
  type ProjectFilesystemReader
} from "./project-filesystem.js";

export interface BuildProjectIndexInputsOptions {
  /** Source directories relative to the project root. Defaults to the project root. */
  readonly scopeRoots?: readonly string[];
  /**
   * Resolver-specific inputs such as tsconfig, jsconfig, and local `extends`
   * files. The builder sorts and deduplicates them with the root gitignore.
   */
  readonly additionalConfigurationInputs?: readonly ProjectConfigurationInput[];
  /** Reuse a shared walk instead of recursively discovering candidates again. */
  readonly presentConfigurationCandidatePaths?: readonly string[];
  readonly filesystemReader?: ProjectFilesystemReader;
}

/**
 * Builds the persisted identity for one scan without choosing a TypeScript
 * configuration itself. That selection belongs to the module resolver, which
 * supplies its complete configuration chain through `additionalConfigurationInputs`.
 */
export async function buildProjectIndexInputs(
  projectPath: string,
  options?: BuildProjectIndexInputsOptions
): Promise<ProjectIndexInputs> {
  const normalizedProjectPath = resolve(projectPath);
  const filesystemReader = options?.filesystemReader ?? nativeProjectFilesystemReader;
  const scopeRoots = await canonicalizeScopeRoots(
    normalizedProjectPath,
    options?.scopeRoots,
    filesystemReader
  );
  const rootGitignore = await readProjectConfigurationInput(
    normalizedProjectPath,
    "root-gitignore",
    ".gitignore",
    filesystemReader
  );
  const trackedConfigurationInputs = canonicalizeConfigurationInputs([
    rootGitignore,
    ...(options?.additionalConfigurationInputs ?? []).filter(
      (input) => input.kind !== "configuration-discovery"
    )
  ]);
  const configurationDiscoveryInput = await discoverConfigurationCandidateInput(
    normalizedProjectPath,
    trackedConfigurationInputs,
    filesystemReader,
    options?.presentConfigurationCandidatePaths
  );
  const configurationInputs = canonicalizeConfigurationInputs([
    ...trackedConfigurationInputs,
    configurationDiscoveryInput
  ]);

  return createProjectIndexInputs(scopeRoots, configurationInputs);
}

/**
 * Reads one project-relative configuration file into the common persistence
 * shape. It is exported for resolver implementations that need to add local
 * `extends` files to a scan identity.
 */
export async function readProjectConfigurationInput(
  projectPath: string,
  kind: ProjectConfigurationInputKind,
  relativePath: string,
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<ProjectConfigurationInput> {
  const normalizedProjectPath = resolve(projectPath);
  const canonicalPath = canonicalizeConfigurationPath(normalizedProjectPath, relativePath);
  const absolutePath = resolve(normalizedProjectPath, canonicalPath);
  const access = new ProjectPathAccessCollector(normalizedProjectPath);

  try {
    const contents = await readProjectFilesystemText(filesystemReader, absolutePath);

    return {
      kind,
      path: canonicalPath,
      state: "present",
      contentHash: hashSource(contents)
    };
  } catch (error) {
    if (projectFilesystemMissingCode(error) === null) {
      if (!access.add(absolutePath, error)) throw error;
      access.throwIfAny();
    }

    return {
      kind,
      path: canonicalPath,
      state: "absent",
      contentHash: null
    };
  }
}

/**
 * Makes user- and resolver-provided configuration records stable before they
 * become part of a graph generation. Identical records collapse; conflicting
 * records for the same kind/path are rejected instead of being order-dependent.
 */
export function canonicalizeConfigurationInputs(
  inputs: readonly ProjectConfigurationInput[]
): readonly ProjectConfigurationInput[] {
  const canonicalInputs = inputs.map(validateConfigurationInput);
  canonicalInputs.sort(compareConfigurationInputs);

  const result: ProjectConfigurationInput[] = [];

  for (const input of canonicalInputs) {
    const previous = result.at(-1);

    if (previous === undefined || configurationInputKey(previous) !== configurationInputKey(input)) {
      result.push(input);
      continue;
    }

    if (
      previous.state !== input.state ||
      previous.contentHash !== input.contentHash
    ) {
      throw new Error(
        `Conflicting configuration inputs for ${input.kind}:${input.path}`
      );
    }
  }

  return result;
}

/** Create a canonical input object and its deterministic SHA-256 fingerprint. */
export function createProjectIndexInputs(
  scopeRoots: readonly string[],
  configurationInputs: readonly ProjectConfigurationInput[]
): ProjectIndexInputs {
  const canonicalScopeRoots = [...scopeRoots].sort(compareProjectPaths);
  const canonicalConfigurationInputs = canonicalizeConfigurationInputs(configurationInputs);
  const fingerprintPayload: Omit<ProjectIndexInputs, "fingerprint"> = {
    formatVersion: PROJECT_INDEX_INPUTS_FORMAT_VERSION,
    scopeRoots: canonicalScopeRoots,
    configurationInputs: canonicalConfigurationInputs
  };

  return {
    ...fingerprintPayload,
    fingerprint: createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex")
  };
}

export function canonicalizeConfigurationPath(projectPath: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Configuration path must be project-relative: ${relativePath}`);
  }

  const normalizedProjectPath = resolve(projectPath);
  const normalizedTargetPath = resolve(normalizedProjectPath, relativePath);
  const value = relative(normalizedProjectPath, normalizedTargetPath);

  if (
    value === "" ||
    value === ".." ||
    value.startsWith(`..${sep}`) ||
    isAbsolute(value)
  ) {
    throw new Error(`Configuration path is outside the project: ${relativePath}`);
  }

  return value.split(sep).join("/");
}

function validateConfigurationInput(input: ProjectConfigurationInput): ProjectConfigurationInput {
  const normalizedPath = normalizeProjectRelativePath(input.path);

  if (input.state === "present" && input.contentHash === null) {
    throw new Error(`Present configuration input must have a content hash: ${input.kind}:${input.path}`);
  }

  if (input.state === "absent" && input.contentHash !== null) {
    throw new Error(`Absent configuration input cannot have a content hash: ${input.kind}:${input.path}`);
  }

  return {
    ...input,
    path: normalizedPath
  };
}

function normalizeProjectRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");

  if (
    isAbsolute(normalized) ||
    normalized === "" ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Configuration input path must be project-relative: ${value}`);
  }

  const parts: string[] = [];

  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length === 0) {
        throw new Error(`Configuration input path must be project-relative: ${value}`);
      }

      parts.pop();
      continue;
    }

    parts.push(part);
  }

  if (parts.length === 0) {
    throw new Error(`Configuration input path must be project-relative: ${value}`);
  }

  return parts.join("/");
}

function compareConfigurationInputs(
  left: ProjectConfigurationInput,
  right: ProjectConfigurationInput
): number {
  const kindDifference = configurationInputKindOrder(left.kind) - configurationInputKindOrder(right.kind);

  return kindDifference === 0 ? compareProjectPaths(left.path, right.path) : kindDifference;
}

function configurationInputKindOrder(kind: ProjectConfigurationInputKind): number {
  switch (kind) {
    case "root-gitignore":
      return 0;
    case "tsconfig":
      return 1;
    case "jsconfig":
      return 2;
    case "extends":
      return 3;
    case "workspace-root-manifest":
      return 4;
    case "workspace-package-manifest":
      return 5;
    case "cargo-workspace-root-manifest":
      return 6;
    case "cargo-workspace-package-manifest":
      return 7;
    case "cargo-workspace-member-glob":
      return 8;
    case "go-module":
      return 9;
    case "astro-config":
      return 10;
    case "xcode-project":
      return 11;
    case "maven-project":
      return 12;
    case "gradle-settings":
      return 13;
    case "gradle-build":
      return 14;
    case "configuration-discovery":
      return 15;
  }
}

function configurationInputKey(input: ProjectConfigurationInput): string {
  return `${input.kind}\u0000${input.path}`;
}

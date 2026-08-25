import { resolve } from "node:path";

import type {
  IndexPerformanceSubphase,
  IndexPerformanceSubphaseName
} from "../../domain/index-work.js";

import type {
  ProjectFreshnessVerification,
  ProjectFreshnessVerificationInput,
  ProjectFreshnessVerificationOptions,
  ProjectScan,
  ProjectScanOptions,
  SourceCatalog,
  SourceDocument
} from "../../ports/source-catalog.js";
import { createTypeScriptProjectModuleResolver } from "../typescript/index.js";
import {
  discoverFreshnessProjectPaths,
  fingerprintSourcePaths,
  FRESHNESS_PATH_DISCOVERY_POLICY,
  isUnsafeProjectPath,
  MAXIMUM_FRESHNESS_CONCURRENT_READS,
  SOURCE_FINGERPRINT_READ_POLICY,
  STREAMING_UTF8_HASH_POLICY,
  loadSourcePaths,
  toProjectRelativePath
} from "./discovery.js";
import { createCargoWorkspaceProjectModuleResolver } from "./cargo-workspace.js";
import { createGoModuleProjectModuleResolver } from "./go-module.js";
import { buildProjectIndexInputs } from "./project-inputs.js";
import { createWorkspaceProjectModuleResolver } from "./workspace.js";
import { detectAstroProject } from "./astro-project.js";
import { detectJvmProjectModuleEvidence } from "./jvm-project.js";
import { detectXcodeProjectEvidence } from "./xcode-project.js";
import {
  CONFIGURATION_DISCOVERY_POLICY,
  discoverConfigurationCandidateSnapshot,
  isConfigurationCandidateFileName
} from "./configuration-discovery.js";
import {
  nativeProjectFilesystemReader,
  readProjectFilesystemText,
  toProjectPathUnreadableError,
  type ProjectFilesystemReader
} from "./project-filesystem.js";

function mergeConfigurationPaths(
  ...configurationPathGroups: readonly (readonly string[])[]
): readonly string[] {
  const seenPaths = new Set<string>();
  const result: string[] = [];

  for (const configurationPaths of configurationPathGroups) {
    for (const configurationPath of configurationPaths) {
      if (!seenPaths.has(configurationPath)) {
        seenPaths.add(configurationPath);
        result.push(configurationPath);
      }
    }
  }

  return result;
}

function freshnessFilesMatch(
  fingerprints: readonly {
    readonly relativePath: string;
    readonly language: SourceDocument["language"];
    readonly contentHash: string;
  }[],
  indexedFiles: ProjectFreshnessVerificationInput["files"]
): boolean {
  if (fingerprints.length !== indexedFiles.length) {
    return false;
  }
  const expectedByPath = new Map(indexedFiles.map((file) => [file.path, file]));
  return fingerprints.every((fingerprint) => {
    const expected = expectedByPath.get(fingerprint.relativePath);
    return expected !== undefined &&
      expected.language === fingerprint.language &&
      expected.contentHash === fingerprint.contentHash;
  });
}

const MAXIMUM_FRESHNESS_PRIORITY_PATHS = 25;

function indexedPriorityFiles(
  input: ProjectFreshnessVerificationInput,
  options: ProjectFreshnessVerificationOptions | undefined
): ProjectFreshnessVerificationInput["files"] | null {
  if (
    options?.allowEarlySourceExit !== true ||
    options.priorityPaths === undefined ||
    options.priorityPaths.length < 1 ||
    options.priorityPaths.length > MAXIMUM_FRESHNESS_PRIORITY_PATHS
  ) {
    return null;
  }
  const indexedByPath = new Map(input.files.map((file) => [file.path, file]));
  const paths = [...new Set(options.priorityPaths)].sort();
  const files = paths.map((path) => indexedByPath.get(path));
  return files.every((file) => file !== undefined)
    ? files as ProjectFreshnessVerificationInput["files"]
    : null;
}

interface FreshnessPerformanceToken {
  readonly startedAt: number;
  readonly rssStartBytes: number;
}

function startFreshnessPerformance(): FreshnessPerformanceToken {
  return {
    startedAt: Number(process.hrtime.bigint()) / 1_000_000,
    rssStartBytes: Math.max(0, process.memoryUsage().rss)
  };
}

function endFreshnessPerformance(
  name: IndexPerformanceSubphaseName,
  token: FreshnessPerformanceToken
): IndexPerformanceSubphase {
  const rssEndBytes = Math.max(0, process.memoryUsage().rss);
  return {
    name,
    durationMs: Math.round(Math.max(
      0,
      Number(process.hrtime.bigint()) / 1_000_000 - token.startedAt
    ) * 1_000) / 1_000,
    residentSetSize: {
      unit: "bytes",
      samplingPolicy: "phase-boundary-v1",
      startBytes: token.rssStartBytes,
      endBytes: rssEndBytes,
      observedPeakBytes: Math.max(token.rssStartBytes, rssEndBytes)
    }
  };
}

export class FileSystemSourceCatalog implements SourceCatalog {
  public constructor(
    private readonly filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
  ) {}

  public async scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan> {
    try {
      return await this.scanProject(projectPath, options);
    } catch (error) {
      const unreadable = toProjectPathUnreadableError(projectPath, error);
      if (unreadable !== null) throw unreadable;
      throw error;
    }
  }

  private async scanProject(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan> {
    const normalizedProjectPath = resolve(projectPath);
    const paths = await discoverFreshnessProjectPaths(normalizedProjectPath, {
      ...(options?.scopeRoots === undefined ? {} : { scopeRoots: options.scopeRoots }),
      filesystemReader: this.filesystemReader,
      isConfigurationCandidateFileName
    });
    const sourceDocuments = await loadSourcePaths(
      normalizedProjectPath,
      paths.sourcePaths,
      undefined,
      this.filesystemReader
    );
    const astroProject = await detectAstroProject(normalizedProjectPath);
    const astroConfigurationPath = astroProject.enabled
      ? astroProject.configurationInputs.find((input) => input.state === "present")?.path
      : undefined;
    const typeScriptResolver = createTypeScriptProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments,
      ...(astroConfigurationPath === undefined ? {} : { astroConfigurationPath })
    });
    const workspaceResolver = await createWorkspaceProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments
    });
    const cargoWorkspaceResolver = await createCargoWorkspaceProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments
    });
    const goModuleResolver = await createGoModuleProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments
    });
    const xcodeProject = await detectXcodeProjectEvidence(normalizedProjectPath, sourceDocuments);
    const jvmProject = await detectJvmProjectModuleEvidence(normalizedProjectPath, sourceDocuments);
    const inputOptions =
      options?.scopeRoots === undefined
        ? {
            filesystemReader: this.filesystemReader,
            presentConfigurationCandidatePaths: paths.configurationPaths,
            additionalConfigurationInputs: [
              ...typeScriptResolver.configurationInputs,
              ...workspaceResolver.configurationInputs,
              ...cargoWorkspaceResolver.configurationInputs,
              ...goModuleResolver.configurationInputs,
              ...astroProject.configurationInputs,
              ...xcodeProject.configurationInputs,
              ...jvmProject.configurationInputs
            ]
          }
        : {
            scopeRoots: options.scopeRoots,
            filesystemReader: this.filesystemReader,
            presentConfigurationCandidatePaths: paths.configurationPaths,
            additionalConfigurationInputs: [
              ...typeScriptResolver.configurationInputs,
              ...workspaceResolver.configurationInputs,
              ...cargoWorkspaceResolver.configurationInputs,
              ...goModuleResolver.configurationInputs,
              ...astroProject.configurationInputs,
              ...xcodeProject.configurationInputs,
              ...jvmProject.configurationInputs
            ]
          };
    const indexInputs = await buildProjectIndexInputs(normalizedProjectPath, inputOptions);

    return {
      sourceDocuments,
      indexInputs,
      frameworkEvidence: { astro: astroProject.enabled },
      xcodeTargetMemberships: xcodeProject.targetMemberships,
      ...(jvmProject.projectEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: jvmProject.projectEvidence }),
      moduleResolver: {
        resolve(fromFilePath, moduleSpecifier) {
          if (fromFilePath.endsWith(".go")) {
            return goModuleResolver.moduleResolver.resolve(fromFilePath, moduleSpecifier);
          }

          const typeScriptResolution = typeScriptResolver.moduleResolver.resolve(
            fromFilePath,
            moduleSpecifier
          );
          if (typeScriptResolution.strategy !== "unresolved") {
            return typeScriptResolution;
          }

          if (
            moduleSpecifier.startsWith(".") ||
            typeScriptResolver.hasProjectConfigurationResolution(fromFilePath, moduleSpecifier)
          ) {
            return typeScriptResolution;
          }

          const cargoWorkspaceResolution = cargoWorkspaceResolver.moduleResolver.resolve(
            fromFilePath,
            moduleSpecifier
          );
          if (cargoWorkspaceResolution.strategy !== "unresolved") {
            return {
              ...cargoWorkspaceResolution,
              configurationPaths: mergeConfigurationPaths(
                typeScriptResolution.configurationPaths,
                cargoWorkspaceResolution.configurationPaths
              )
            };
          }

          if (fromFilePath.endsWith(".rs")) {
            return {
              targetFilePath: null,
              strategy: "unresolved",
              configurationPaths: mergeConfigurationPaths(
                typeScriptResolution.configurationPaths,
                cargoWorkspaceResolution.configurationPaths
              )
            };
          }

          const workspaceResolution = workspaceResolver.moduleResolver.resolve(
            fromFilePath,
            moduleSpecifier
          );
          if (workspaceResolution.strategy !== "unresolved") {
            return {
              ...workspaceResolution,
              configurationPaths: mergeConfigurationPaths(
                typeScriptResolution.configurationPaths,
                cargoWorkspaceResolution.configurationPaths,
                workspaceResolution.configurationPaths
              )
            };
          }

          return {
            targetFilePath: null,
            strategy: "unresolved",
            configurationPaths: mergeConfigurationPaths(
              typeScriptResolution.configurationPaths,
              cargoWorkspaceResolution.configurationPaths,
              workspaceResolution.configurationPaths
            )
          };
        }
      }
    };
  }

  public async verifyFreshness(
    projectPath: string,
    input: ProjectFreshnessVerificationInput,
    options?: ProjectFreshnessVerificationOptions
  ): Promise<ProjectFreshnessVerification> {
    const normalizedProjectPath = resolve(projectPath);
    const performancePhases: IndexPerformanceSubphase[] = [];
    const priorityFiles = indexedPriorityFiles(input, options);
    if (priorityFiles !== null) {
      const priorityHashStartedAt = startFreshnessPerformance();
      const priorityFingerprints = await fingerprintSourcePaths(
        normalizedProjectPath,
        priorityFiles.map((file) => resolve(normalizedProjectPath, ...file.path.split("/"))),
        this.filesystemReader
      );
      performancePhases.push(endFreshnessPerformance(
        "freshness-source-hash",
        priorityHashStartedAt
      ));
      if (!freshnessFilesMatch(priorityFingerprints, priorityFiles)) {
        return {
          policy: "streaming-full-content-configuration-candidates-v5",
          outcome: "source-files-changed",
          sourceFilesChanged: true,
          projectInputsChanged: false,
          complete: false,
          priorityDetection: "priority-paths",
          filesChecked: priorityFingerprints.length,
          sourceHash: "sha256",
          retainedSourceText: false,
          configurationPolicy: CONFIGURATION_DISCOVERY_POLICY,
          configurationCandidatesChecked: 0,
          sourceReadPolicy: SOURCE_FINGERPRINT_READ_POLICY,
          configurationReadPolicy: STREAMING_UTF8_HASH_POLICY,
          discoveryPolicy: FRESHNESS_PATH_DISCOVERY_POLICY,
          maximumConcurrentReads: MAXIMUM_FRESHNESS_CONCURRENT_READS,
          performance: {
            policy: "freshness-performance-v1",
            phases: performancePhases
          }
        };
      }
    }
    const discoveryStartedAt = startFreshnessPerformance();
    const paths = await discoverFreshnessProjectPaths(normalizedProjectPath, {
      scopeRoots: input.indexInputs.scopeRoots,
      filesystemReader: this.filesystemReader,
      isConfigurationCandidateFileName
    });
    performancePhases.push(endFreshnessPerformance("freshness-discovery", discoveryStartedAt));
    const sourceHashStartedAt = startFreshnessPerformance();
    const fingerprints = await fingerprintSourcePaths(
      normalizedProjectPath,
      paths.sourcePaths,
      this.filesystemReader
    );
    performancePhases.push(endFreshnessPerformance("freshness-source-hash", sourceHashStartedAt));
    const receiptBase = {
      policy: "streaming-full-content-configuration-candidates-v5" as const,
      filesChecked: fingerprints.length,
      sourceHash: "sha256" as const,
      retainedSourceText: false as const,
      configurationPolicy: CONFIGURATION_DISCOVERY_POLICY,
      sourceReadPolicy: SOURCE_FINGERPRINT_READ_POLICY,
      configurationReadPolicy: STREAMING_UTF8_HASH_POLICY,
      discoveryPolicy: FRESHNESS_PATH_DISCOVERY_POLICY,
      maximumConcurrentReads: MAXIMUM_FRESHNESS_CONCURRENT_READS,
      performance: {
        policy: "freshness-performance-v1" as const,
        phases: performancePhases
      }
    };
    const sourceFilesChanged = !freshnessFilesMatch(fingerprints, input.files);

    const expectedConfigurationDiscovery = input.indexInputs.configurationInputs.find(
      (configurationInput) => configurationInput.kind === "configuration-discovery"
    );
    let configurationCandidatesChecked = 0;
    let projectInputsChanged = expectedConfigurationDiscovery === undefined;
    if (expectedConfigurationDiscovery !== undefined) {
      const configurationSnapshotStartedAt = startFreshnessPerformance();
      const configurationSnapshot = await discoverConfigurationCandidateSnapshot(
        normalizedProjectPath,
        input.indexInputs.configurationInputs,
        paths.configurationPaths,
        this.filesystemReader
      );
      performancePhases.push(endFreshnessPerformance(
        "freshness-configuration-snapshot",
        configurationSnapshotStartedAt
      ));
      configurationCandidatesChecked = configurationSnapshot.candidatesChecked;
      projectInputsChanged = configurationSnapshot.input.contentHash !== expectedConfigurationDiscovery.contentHash;
    }

    const outcome = sourceFilesChanged
      ? "source-files-changed"
      : projectInputsChanged
        ? "project-inputs-changed"
        : "proven-unchanged";

    return {
      ...receiptBase,
      configurationCandidatesChecked,
      outcome,
      sourceFilesChanged,
      projectInputsChanged,
      complete: true,
      priorityDetection: "full-verification"
    };
  }

  public async read(projectPath: string, relativePath: string): Promise<string> {
    const absolutePath = resolve(projectPath, relativePath);
    toProjectRelativePath(projectPath, absolutePath);
    return readProjectFilesystemText(this.filesystemReader, absolutePath);
  }

  public isUnsafeProjectPath(projectPath: string): boolean {
    return isUnsafeProjectPath(projectPath);
  }
}

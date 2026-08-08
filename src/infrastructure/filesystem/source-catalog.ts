import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ProjectFreshnessVerification,
  ProjectFreshnessVerificationInput,
  ProjectScan,
  ProjectScanOptions,
  SourceCatalog,
  SourceDocument
} from "../../ports/source-catalog.js";
import { createTypeScriptProjectModuleResolver } from "../typescript/index.js";
import {
  discoverSourceFileFingerprints,
  discoverSourceFiles,
  isUnsafeProjectPath,
  toProjectRelativePath
} from "./discovery.js";
import { createCargoWorkspaceProjectModuleResolver } from "./cargo-workspace.js";
import { createGoModuleProjectModuleResolver } from "./go-module.js";
import { buildProjectIndexInputs } from "./project-inputs.js";
import { createWorkspaceProjectModuleResolver } from "./workspace.js";
import { detectAstroProject } from "./astro-project.js";
import { detectJvmProjectModuleEvidence } from "./jvm-project.js";
import { detectXcodeProjectEvidence } from "./xcode-project.js";

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

export class FileSystemSourceCatalog implements SourceCatalog {
  public async scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan> {
    const normalizedProjectPath = resolve(projectPath);
    const sourceDocuments = await discoverSourceFiles(normalizedProjectPath, options);
    const typeScriptResolver = createTypeScriptProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments
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
    const astroProject = await detectAstroProject(normalizedProjectPath);
    const xcodeProject = await detectXcodeProjectEvidence(normalizedProjectPath, sourceDocuments);
    const jvmProject = await detectJvmProjectModuleEvidence(normalizedProjectPath, sourceDocuments);
    const inputOptions =
      options?.scopeRoots === undefined
        ? {
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
    input: ProjectFreshnessVerificationInput
  ): Promise<ProjectFreshnessVerification> {
    const normalizedProjectPath = resolve(projectPath);
    const fingerprints = await discoverSourceFileFingerprints(normalizedProjectPath, {
      scopeRoots: input.indexInputs.scopeRoots
    });
    const receipt = {
      policy: "full-content-project-inputs-v1" as const,
      filesChecked: fingerprints.length,
      sourceHash: "sha256" as const,
      retainedSourceText: false as const
    };
    if (!freshnessFilesMatch(fingerprints, input.files)) {
      return { ...receipt, outcome: "source-files-changed" };
    }

    // The project/configuration resolvers consume source identity and paths,
    // not source text. Reconstruct their complete configuration input set from
    // compact fingerprints so new workspace/module/build files are detected
    // without retaining the project's source contents.
    const lightweightDocuments: SourceDocument[] = fingerprints.map((fingerprint) => ({
      absolutePath: resolve(normalizedProjectPath, ...fingerprint.relativePath.split("/")),
      relativePath: fingerprint.relativePath,
      language: fingerprint.language,
      sourceText: "",
      contentHash: fingerprint.contentHash
    }));
    const typeScriptResolver = createTypeScriptProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments: lightweightDocuments
    });
    const workspaceResolver = await createWorkspaceProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments: lightweightDocuments
    });
    const cargoWorkspaceResolver = await createCargoWorkspaceProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments: lightweightDocuments
    });
    const goModuleResolver = await createGoModuleProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments: lightweightDocuments
    });
    const astroProject = await detectAstroProject(normalizedProjectPath);
    const xcodeProject = await detectXcodeProjectEvidence(
      normalizedProjectPath,
      lightweightDocuments
    );
    const jvmProject = await detectJvmProjectModuleEvidence(
      normalizedProjectPath,
      lightweightDocuments
    );
    const currentInputs = await buildProjectIndexInputs(normalizedProjectPath, {
      scopeRoots: input.indexInputs.scopeRoots,
      additionalConfigurationInputs: [
        ...typeScriptResolver.configurationInputs,
        ...workspaceResolver.configurationInputs,
        ...cargoWorkspaceResolver.configurationInputs,
        ...goModuleResolver.configurationInputs,
        ...astroProject.configurationInputs,
        ...xcodeProject.configurationInputs,
        ...jvmProject.configurationInputs
      ]
    });

    return {
      ...receipt,
      outcome: currentInputs.fingerprint === input.indexInputs.fingerprint
        ? "proven-unchanged"
        : "project-inputs-changed"
    };
  }

  public async read(projectPath: string, relativePath: string): Promise<string> {
    const absolutePath = resolve(projectPath, relativePath);
    toProjectRelativePath(projectPath, absolutePath);
    return readFile(absolutePath, "utf8");
  }

  public isUnsafeProjectPath(projectPath: string): boolean {
    return isUnsafeProjectPath(projectPath);
  }
}

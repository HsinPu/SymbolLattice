import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ProjectScan,
  ProjectScanOptions,
  SourceCatalog,
  SourceDocument
} from "../../ports/source-catalog.js";
import { createTypeScriptProjectModuleResolver } from "../typescript/index.js";
import {
  discoverSourceFiles,
  isUnsafeProjectPath,
  toProjectRelativePath
} from "./discovery.js";
import { createCargoWorkspaceProjectModuleResolver } from "./cargo-workspace.js";
import { buildProjectIndexInputs } from "./project-inputs.js";
import { createWorkspaceProjectModuleResolver } from "./workspace.js";

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
    const inputOptions =
      options?.scopeRoots === undefined
        ? {
            additionalConfigurationInputs: [
              ...typeScriptResolver.configurationInputs,
              ...workspaceResolver.configurationInputs,
              ...cargoWorkspaceResolver.configurationInputs
            ]
          }
        : {
            scopeRoots: options.scopeRoots,
            additionalConfigurationInputs: [
              ...typeScriptResolver.configurationInputs,
              ...workspaceResolver.configurationInputs,
              ...cargoWorkspaceResolver.configurationInputs
            ]
          };
    const indexInputs = await buildProjectIndexInputs(normalizedProjectPath, inputOptions);

    return {
      sourceDocuments,
      indexInputs,
      moduleResolver: {
        resolve(fromFilePath, moduleSpecifier) {
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

  public async read(projectPath: string, relativePath: string): Promise<string> {
    const absolutePath = resolve(projectPath, relativePath);
    toProjectRelativePath(projectPath, absolutePath);
    return readFile(absolutePath, "utf8");
  }

  public isUnsafeProjectPath(projectPath: string): boolean {
    return isUnsafeProjectPath(projectPath);
  }
}

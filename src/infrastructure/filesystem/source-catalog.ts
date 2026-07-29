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
import { buildProjectIndexInputs } from "./project-inputs.js";

export class FileSystemSourceCatalog implements SourceCatalog {
  public async scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan> {
    const normalizedProjectPath = resolve(projectPath);
    const sourceDocuments = await discoverSourceFiles(normalizedProjectPath, options);
    const typeScriptResolver = createTypeScriptProjectModuleResolver({
      projectPath: normalizedProjectPath,
      sourceDocuments
    });
    const inputOptions =
      options?.scopeRoots === undefined
        ? { additionalConfigurationInputs: typeScriptResolver.configurationInputs }
        : {
            scopeRoots: options.scopeRoots,
            additionalConfigurationInputs: typeScriptResolver.configurationInputs
          };
    const indexInputs = await buildProjectIndexInputs(normalizedProjectPath, inputOptions);

    return {
      sourceDocuments,
      indexInputs,
      moduleResolver: typeScriptResolver.moduleResolver
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

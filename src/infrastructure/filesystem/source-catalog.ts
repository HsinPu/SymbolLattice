import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { SourceCatalog, SourceDocument } from "../../ports/source-catalog.js";
import {
  discoverSourceFiles,
  isUnsafeProjectPath,
  toProjectRelativePath
} from "./discovery.js";

export class FileSystemSourceCatalog implements SourceCatalog {
  public discover(projectPath: string): Promise<readonly SourceDocument[]> {
    return discoverSourceFiles(projectPath);
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

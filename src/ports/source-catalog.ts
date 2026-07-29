import type { IndexedFile } from "../domain/types.js";

export interface SourceDocument {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: IndexedFile["language"];
  readonly sourceText: string;
  readonly contentHash: string;
}

export interface SourceCatalog {
  discover(projectPath: string): Promise<readonly SourceDocument[]>;
  read(projectPath: string, relativePath: string): Promise<string>;
  isUnsafeProjectPath(projectPath: string): boolean;
}

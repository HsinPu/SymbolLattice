import type { IndexedFile } from "../domain/types.js";
import type { ProjectIndexInputs } from "../domain/index-inputs.js";

export interface SourceDocument {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: IndexedFile["language"];
  readonly sourceText: string;
  readonly contentHash: string;
}

export interface ProjectScanOptions {
  /** Source directories relative to the project root. Defaults to the project root. */
  readonly scopeRoots?: readonly string[];
}

export type ModuleResolutionStrategy =
  | "relative"
  | "tsconfig-paths"
  | "tsconfig-base-url"
  | "workspace-package"
  | "unresolved";

export interface ResolvedModule {
  readonly targetFilePath: string | null;
  readonly strategy: ModuleResolutionStrategy;
  /** Config files consulted by this resolution, in project-relative path order. */
  readonly configurationPaths: readonly string[];
}

export interface ProjectModuleResolver {
  resolve(fromFilePath: string, moduleSpecifier: string): ResolvedModule;
}

export interface ProjectScan {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly indexInputs: ProjectIndexInputs;
  readonly moduleResolver: ProjectModuleResolver;
}

export interface SourceCatalog {
  scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan>;
  read(projectPath: string, relativePath: string): Promise<string>;
  isUnsafeProjectPath(projectPath: string): boolean;
}

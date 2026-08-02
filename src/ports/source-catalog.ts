import type { IndexedFile, ProjectFrameworkEvidence } from "../domain/types.js";
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
  | "cargo-workspace-crate"
  | "go-module-package"
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

/**
 * One source file membership recovered from an Xcode native target's
 * `PBXSourcesBuildPhase`. It is evidence for project-level iOS relations, not
 * a claim that the target is otherwise buildable on the current machine.
 */
export interface XcodeTargetMembership {
  readonly filePath: string;
  /** Stable within one `.pbxproj` revision; includes its configuration path. */
  readonly targetId: string;
  readonly configurationPath: string;
}

export interface ProjectScan {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly indexInputs: ProjectIndexInputs;
  readonly moduleResolver: ProjectModuleResolver;
  /** Optional for compatibility with custom source catalogs from earlier releases. */
  readonly frameworkEvidence?: ProjectFrameworkEvidence;
  /** Optional for compatibility with custom source catalogs from earlier releases. */
  readonly xcodeTargetMemberships?: readonly XcodeTargetMembership[];
}

export interface SourceCatalog {
  scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan>;
  read(projectPath: string, relativePath: string): Promise<string>;
  isUnsafeProjectPath(projectPath: string): boolean;
}

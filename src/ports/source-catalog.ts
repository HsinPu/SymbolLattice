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

/** Conventional JVM source set retained from a Maven or Gradle project layout. */
export type JvmModuleSourceSet = "main" | "test";

/**
 * One JVM source file membership recovered from a conventional Maven or Gradle
 * module source root. It is conservative project-layout evidence only; it does
 * not claim that dependency declarations or a compiler classpath were parsed.
 */
export interface JvmModuleMembership {
  readonly filePath: string;
  /** Stable project-local identifier derived from the selected build file. */
  readonly moduleId: string;
  readonly sourceSet: JvmModuleSourceSet;
  /** Build files that established this membership, in project-relative order. */
  readonly configurationPaths: readonly string[];
}

/** One direct, statically declared dependency between indexed JVM modules. */
export interface JvmModuleDependency {
  readonly sourceModuleId: string;
  readonly targetModuleId: string;
  /** The Gradle source-set configuration that makes the target available. */
  readonly consumerSourceSet: JvmModuleSourceSet;
  /** The build-system syntax that supplied this bounded evidence. */
  readonly kind: "gradle-project";
  /** Build files that established this declaration, in project-relative order. */
  readonly configurationPaths: readonly string[];
}

/**
 * Optional JVM layout evidence. Its presence means a Maven or Gradle root was
 * found, so same-package cross-file heritage must not cross an unproven module
 * or source-set boundary.
 */
export interface JvmProjectModuleEvidence {
  readonly memberships: readonly JvmModuleMembership[];
  /** Optional so pre-v0.218 custom catalogs remain compatible. */
  readonly dependencies?: readonly JvmModuleDependency[];
}

export interface ProjectScan {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly indexInputs: ProjectIndexInputs;
  readonly moduleResolver: ProjectModuleResolver;
  /** Optional for compatibility with custom source catalogs from earlier releases. */
  readonly frameworkEvidence?: ProjectFrameworkEvidence;
  /** Optional for compatibility with custom source catalogs from earlier releases. */
  readonly xcodeTargetMemberships?: readonly XcodeTargetMembership[];
  /** Optional for compatibility with custom source catalogs from earlier releases. */
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}

export interface SourceCatalog {
  scan(projectPath: string, options?: ProjectScanOptions): Promise<ProjectScan>;
  read(projectPath: string, relativePath: string): Promise<string>;
  isUnsafeProjectPath(projectPath: string): boolean;
}

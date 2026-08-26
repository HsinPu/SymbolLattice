import type { IndexedFile, ProjectFrameworkEvidence } from "../domain/types.js";
import type { ProjectIndexInputs } from "../domain/index-inputs.js";
import type { IndexPerformanceSubphase } from "../domain/index-work.js";

export interface SourceDocument {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: IndexedFile["language"];
  readonly sourceText: string;
  /** Optional original bytes for extractors whose exact contract is byte-sensitive. */
  readonly sourceBytes?: Uint8Array;
  readonly contentHash: string;
}

export interface ProjectScanOptions {
  /** Source directories relative to the project root. Defaults to the project root. */
  readonly scopeRoots?: readonly string[];
}

export interface ProjectFreshnessVerificationInput {
  readonly files: readonly IndexedFile[];
  readonly indexInputs: ProjectIndexInputs;
}

/**
 * Optional hints for a freshness check. The full verification implementation
 * may ignore these hints; they are additive so custom catalogs can continue to
 * implement the existing two-argument method.
 */
export interface ProjectFreshnessVerificationOptions {
  /** Exact project-relative paths that may be checked before a full walk. */
  readonly priorityPaths?: readonly string[];
  /** Permit a future implementation to return after proving a source change. */
  readonly allowEarlySourceExit?: boolean;
}

/**
 * Common fields for a non-mutating freshness verdict. It deliberately carries
 * no source text or resolver so a proven no-op remains memory-bounded.
 */
interface ProjectFreshnessVerificationBase {
  readonly outcome: "proven-unchanged" | "source-files-changed" | "project-inputs-changed";
  readonly filesChecked: number;
  readonly sourceHash: "sha256";
  readonly retainedSourceText: false;
  readonly configurationPolicy: "configuration-candidates-v1" | "configuration-candidates-v2";
  readonly configurationCandidatesChecked: number;
  readonly sourceReadPolicy:
    | "streaming-utf8-with-objective-c-header-classification-v1"
    | "streaming-utf8-with-shell-raw-bytes-and-objective-c-header-classification-v2"
    | "streaming-raw-bytes-for-shell-and-lua-with-objective-c-header-classification-v3"
    | "streaming-raw-bytes-for-shell-and-lua-with-objective-c-header-classification-v4";
  readonly configurationReadPolicy: "streaming-utf8-v1";
  readonly discoveryPolicy:
    | "single-project-walk-v1"
    | "single-project-walk-v2"
    | "single-project-walk-v3";
  readonly maximumConcurrentReads: 8;
  readonly performance: {
    readonly policy: "freshness-performance-v1";
    /** Non-overlapping steps included in the caller's freshness parent phase. */
    readonly phases: readonly IndexPerformanceSubphase[];
  };
}

/** Receipt emitted by the v0.441 freshness contract. */
export interface ProjectFreshnessVerificationV4 extends ProjectFreshnessVerificationBase {
  readonly policy: "streaming-full-content-configuration-candidates-v4";
}

/**
 * Complete v0.442 freshness evidence. Both stale reasons are retained even
 * when source fingerprints and configuration candidates changed together.
 */
export interface ProjectFreshnessVerificationV5 extends ProjectFreshnessVerificationBase {
  readonly policy: "streaming-full-content-configuration-candidates-v5";
  readonly sourceFilesChanged: boolean;
  readonly projectInputsChanged: boolean;
  /** False only for a future bounded early-exit receipt. */
  readonly complete: boolean;
  readonly priorityDetection: "full-verification" | "priority-paths";
}

/** Freshness receipts accepted by services and custom source catalogs. */
export type ProjectFreshnessVerification =
  | ProjectFreshnessVerificationV4
  | ProjectFreshnessVerificationV5;

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
  /** The declared source-set visibility that makes the target available. */
  readonly consumerSourceSet: JvmModuleSourceSet;
  /** The build-system syntax that supplied this bounded evidence. */
  readonly kind: "gradle-project" | "maven-module";
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
  /** Optional additive fast path; older/custom catalogs continue through `scan`. */
  verifyFreshness?(
    projectPath: string,
    input: ProjectFreshnessVerificationInput,
    options?: ProjectFreshnessVerificationOptions
  ): Promise<ProjectFreshnessVerification>;
  read(projectPath: string, relativePath: string): Promise<string>;
  isUnsafeProjectPath(projectPath: string): boolean;
}

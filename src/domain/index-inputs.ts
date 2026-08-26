/**
 * Inputs that can change which files are indexed or how module specifiers are
 * resolved. Persisting this compact identity lets a read-only status request
 * detect configuration-only drift without reconstructing a graph first.
 */
export const PROJECT_INDEX_INPUTS_FORMAT_VERSION = "project-inputs-v11";

export const PROJECT_CONFIGURATION_INPUT_KINDS = [
  "root-gitignore",
  "tsconfig",
  "jsconfig",
  "extends",
  "workspace-root-manifest",
  "workspace-package-manifest",
  "cargo-workspace-root-manifest",
  "cargo-workspace-package-manifest",
  "cargo-workspace-member-glob",
  "go-module",
  "astro-config",
  "xcode-project",
  "maven-project",
  "gradle-settings",
  "gradle-build",
  "configuration-discovery"
] as const;

export type ProjectConfigurationInputKind = (typeof PROJECT_CONFIGURATION_INPUT_KINDS)[number];

export interface ProjectConfigurationInput {
  readonly kind: ProjectConfigurationInputKind;
  /** Project-relative, POSIX-style path. */
  readonly path: string;
  readonly state: "present" | "absent";
  /** SHA-256 of UTF-8 contents or a resolver-specific snapshot when present; null when absent. */
  readonly contentHash: string | null;
}

/**
 * The reproducibility identity for one graph generation. `scopeRoots` and
 * `configurationInputs` are sorted and canonicalized before persistence.
 */
export interface ProjectIndexInputs {
  readonly formatVersion: typeof PROJECT_INDEX_INPUTS_FORMAT_VERSION;
  readonly scopeRoots: readonly string[];
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly fingerprint: string;
}

export const INDEX_STALENESS_REASONS = [
  "source-files-changed",
  "project-inputs-changed",
  "indexer-version-changed",
  "configuration-invalid",
  "configuration-untracked",
  "project-path-unreadable"
] as const;

export type IndexStalenessReason = (typeof INDEX_STALENESS_REASONS)[number];

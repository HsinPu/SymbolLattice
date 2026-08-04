import { createHash } from "node:crypto";

import {
  ARTIFACT_LANGUAGES,
  PROJECT_RESOLVER_VERSION,
  type ArtifactLanguage,
  type PendingReference,
  type SymbolNode
} from "../domain/index.js";

export type ReferenceResolverPluginRelation = PendingReference["relationKind"];

export interface ReferenceResolverPluginCandidate {
  readonly symbol: SymbolNode;
  readonly resolutionPath: readonly string[];
  readonly configurationPaths: readonly string[];
}

export interface ReferenceResolverPluginInput {
  readonly reference: PendingReference;
  readonly source: SymbolNode;
  readonly language: ArtifactLanguage;
  readonly lexicalCandidates: readonly ReferenceResolverPluginCandidate[];
  readonly moduleCandidates: readonly ReferenceResolverPluginCandidate[];
  readonly projectCandidates: readonly ReferenceResolverPluginCandidate[];
  readonly projectCandidatesTruncated: boolean;
}

export interface ReferenceResolverPluginResult {
  readonly targetSymbolId: string | null;
  readonly candidateSymbolIds: readonly string[];
  readonly ruleName: string;
}

export interface ReferenceResolverPlugin {
  /** Lowercase vendor/plugin namespace, for example `acme/service-convention`. */
  readonly id: string;
  /** Stable semantic or content version controlled by the plugin author. */
  readonly version: string;
  readonly languages: readonly ArtifactLanguage[];
  readonly relations: readonly ReferenceResolverPluginRelation[];
  /** Called only after all built-in resolvers leave the reference unresolved. */
  readonly resolve: (input: ReferenceResolverPluginInput) => ReferenceResolverPluginResult | null;
}

export interface ReferenceResolverPluginRegistry {
  readonly plugins: readonly ReferenceResolverPlugin[];
  readonly fingerprint: string;
}

export class ReferenceResolverPluginConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReferenceResolverPluginConfigurationError";
  }
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,119}$/u;
export const REFERENCE_RESOLVER_PLUGIN_RULE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,79}$/u;
const MAX_PLUGIN_COUNT = 32;
const VALIDATED_REGISTRIES = new WeakSet<ReferenceResolverPluginRegistry>();
const SUPPORTED_RELATIONS = new Set<ReferenceResolverPluginRelation>([
  "references",
  "calls",
  "instantiates",
  "overrides",
  "routes",
  "handles",
  "extends",
  "implements"
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function configurationError(message: string): never {
  throw new ReferenceResolverPluginConfigurationError(message);
}

function normalizedPlugin(value: unknown, index: number): ReferenceResolverPlugin {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    configurationError(`Reference resolver plugin at index ${index} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || !PLUGIN_ID_PATTERN.test(id)) {
    configurationError(`Reference resolver plugin ${index}.id must use lowercase vendor/plugin form.`);
  }
  const version = record.version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    configurationError(`Reference resolver plugin ${id}.version must be stable non-empty ASCII text.`);
  }
  if (!Array.isArray(record.languages) || record.languages.length === 0) {
    configurationError(`Reference resolver plugin ${id}.languages must not be empty.`);
  }
  const languages = record.languages.map((language) => {
    if (
      typeof language !== "string" ||
      !ARTIFACT_LANGUAGES.includes(language as ArtifactLanguage)
    ) {
      configurationError(`Reference resolver plugin ${id}.languages contains an unsupported language.`);
    }
    return language as ArtifactLanguage;
  });
  if (new Set(languages).size !== languages.length) {
    configurationError(`Reference resolver plugin ${id}.languages must not contain duplicates.`);
  }
  if (!Array.isArray(record.relations) || record.relations.length === 0) {
    configurationError(`Reference resolver plugin ${id}.relations must not be empty.`);
  }
  const relations = record.relations.map((relation) => {
    if (
      typeof relation !== "string" ||
      !SUPPORTED_RELATIONS.has(relation as ReferenceResolverPluginRelation)
    ) {
      configurationError(`Reference resolver plugin ${id}.relations contains an unsupported relation.`);
    }
    return relation as ReferenceResolverPluginRelation;
  });
  if (new Set(relations).size !== relations.length) {
    configurationError(`Reference resolver plugin ${id}.relations must not contain duplicates.`);
  }
  if (typeof record.resolve !== "function") {
    configurationError(`Reference resolver plugin ${id}.resolve must be a function.`);
  }
  return Object.freeze({
    id,
    version,
    languages: Object.freeze([...languages].sort(compareText)),
    relations: Object.freeze([...relations].sort(compareText)),
    resolve: record.resolve as ReferenceResolverPlugin["resolve"]
  });
}

/** Validates, canonicalizes, and fingerprints one project-scoped resolver extension set. */
export function createReferenceResolverPluginRegistry(
  plugins: readonly ReferenceResolverPlugin[]
): ReferenceResolverPluginRegistry {
  if (!Array.isArray(plugins) || plugins.length > MAX_PLUGIN_COUNT) {
    configurationError(`Reference resolver plugins must be an array of at most ${MAX_PLUGIN_COUNT} entries.`);
  }
  const normalized = plugins
    .map((plugin, index) => normalizedPlugin(plugin, index))
    .sort((left, right) => compareText(left.id, right.id));
  const ids = normalized.map((plugin) => plugin.id);
  if (new Set(ids).size !== ids.length) {
    configurationError("Reference resolver plugin ids must be unique.");
  }
  const fingerprintInput = normalized.map(({ id, version, languages, relations }) => ({
    id,
    version,
    languages,
    relations
  }));
  const registry = Object.freeze({
    plugins: Object.freeze([...normalized]),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(fingerprintInput))
      .digest("hex")
      .slice(0, 16)
  });
  VALIDATED_REGISTRIES.add(registry);
  return registry;
}

export function requireReferenceResolverPluginRegistry(
  registry: ReferenceResolverPluginRegistry | undefined
): readonly ReferenceResolverPlugin[] {
  if (registry === undefined) {
    return [];
  }
  if (!VALIDATED_REGISTRIES.has(registry)) {
    configurationError(
      "Reference resolver plugin registries must be created with createReferenceResolverPluginRegistry()."
    );
  }
  return registry.plugins;
}

/** Binds extension semantics into generation freshness without forcing source re-extraction. */
export function referenceResolverPluginProjectVersion(
  registry: ReferenceResolverPluginRegistry | undefined
): string {
  const plugins = requireReferenceResolverPluginRegistry(registry);
  return plugins.length === 0
    ? PROJECT_RESOLVER_VERSION
    : `${PROJECT_RESOLVER_VERSION}+reference-plugins-${registry?.fingerprint}`;
}

import { createHash } from "node:crypto";

import {
  ARTIFACT_LANGUAGES,
  createEdgeId,
  type ArtifactFacts,
  type ArtifactLanguage,
  type PendingReference,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import type { SourceDocument } from "../ports/index.js";

export type FrameworkProjectPluginRelation = Extract<
  PendingReference["relationKind"],
  "references" | "calls" | "instantiates" | "overrides" | "routes" | "handles" | "extends" | "implements"
>;

export interface FrameworkProjectPluginFile {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  /** Defensive, deeply frozen copy of the persisted per-file facts. */
  readonly facts: ArtifactFacts;
}

export interface FrameworkProjectPluginInput {
  /** Stable file-path order. Source text is deliberately excluded. */
  readonly files: readonly FrameworkProjectPluginFile[];
}

export interface FrameworkProjectPluginReference {
  /** Stable diagnostic identity within this plugin result. */
  readonly key: string;
  /** Existing host-owned symbol that emits the relationship. */
  readonly sourceSymbolId: string;
  readonly referenceName: string;
  readonly relationKind: FrameworkProjectPluginRelation;
  readonly range: SourceRange;
}

export interface FrameworkProjectPluginResult {
  readonly references?: readonly FrameworkProjectPluginReference[];
}

export interface FrameworkProjectPlugin {
  readonly id: string;
  readonly version: string;
  /** The plugin runs when the project contains at least one of these languages. */
  readonly languages: readonly ArtifactLanguage[];
  /** Pure synchronous cross-file pass over frozen, already-extracted facts. */
  readonly finalize: (input: FrameworkProjectPluginInput) => FrameworkProjectPluginResult | null;
}

export interface FrameworkProjectPluginRegistry {
  readonly plugins: readonly FrameworkProjectPlugin[];
  readonly fingerprint: string;
}

export class FrameworkProjectPluginConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FrameworkProjectPluginConfigurationError";
  }
}

export class FrameworkProjectPluginOutputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FrameworkProjectPluginOutputError";
  }
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,119}$/u;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const MAX_PLUGIN_COUNT = 32;
const MAX_PROJECT_FILES = 20_000;
const MAX_PROJECT_SYMBOLS = 250_000;
const MAX_PROJECT_REFERENCES = 500_000;
const MAX_REFERENCES_PER_PLUGIN = 4_096;
const MAX_TEXT_LENGTH = 512;
const VALIDATED_REGISTRIES = new WeakSet<FrameworkProjectPluginRegistry>();
const SUPPORTED_RELATIONS = new Set<FrameworkProjectPluginRelation>([
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
  throw new FrameworkProjectPluginConfigurationError(message);
}

function outputError(plugin: FrameworkProjectPlugin, message: string): never {
  throw new FrameworkProjectPluginOutputError(
    `Framework project plugin ${plugin.id}@${plugin.version}: ${message}`
  );
}

function normalizedPlugin(value: unknown, index: number): FrameworkProjectPlugin {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    configurationError(`Framework project plugin at index ${index} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !PLUGIN_ID_PATTERN.test(record.id)) {
    configurationError(`Framework project plugin ${index}.id must use lowercase vendor/plugin form.`);
  }
  if (typeof record.version !== "string" || !VERSION_PATTERN.test(record.version)) {
    configurationError(`Framework project plugin ${record.id}.version must be stable non-empty ASCII text.`);
  }
  if (!Array.isArray(record.languages) || record.languages.length === 0) {
    configurationError(`Framework project plugin ${record.id}.languages must not be empty.`);
  }
  const languages = record.languages.map((language) => {
    if (typeof language !== "string" || !ARTIFACT_LANGUAGES.includes(language as ArtifactLanguage)) {
      configurationError(`Framework project plugin ${record.id}.languages contains an unsupported language.`);
    }
    return language as ArtifactLanguage;
  });
  if (new Set(languages).size !== languages.length) {
    configurationError(`Framework project plugin ${record.id}.languages must not contain duplicates.`);
  }
  if (typeof record.finalize !== "function") {
    configurationError(`Framework project plugin ${record.id}.finalize must be a function.`);
  }
  return Object.freeze({
    id: record.id,
    version: record.version,
    languages: Object.freeze([...languages].sort(compareText)),
    finalize: record.finalize as FrameworkProjectPlugin["finalize"]
  });
}

/** Validates, canonicalizes, and fingerprints one project-scoped finalizer set. */
export function createFrameworkProjectPluginRegistry(
  plugins: readonly FrameworkProjectPlugin[]
): FrameworkProjectPluginRegistry {
  if (!Array.isArray(plugins) || plugins.length > MAX_PLUGIN_COUNT) {
    configurationError(`Framework project plugins must be an array of at most ${MAX_PLUGIN_COUNT} entries.`);
  }
  const normalized = plugins
    .map((plugin, index) => normalizedPlugin(plugin, index))
    .sort((left, right) => compareText(left.id, right.id));
  const ids = normalized.map((plugin) => plugin.id);
  if (new Set(ids).size !== ids.length) {
    configurationError("Framework project plugin ids must be unique.");
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized.map(({ id, version, languages }) => ({ id, version, languages }))))
    .digest("hex")
    .slice(0, 16);
  const registry = Object.freeze({ plugins: Object.freeze([...normalized]), fingerprint });
  VALIDATED_REGISTRIES.add(registry);
  return registry;
}

export function requireFrameworkProjectPluginRegistry(
  registry: FrameworkProjectPluginRegistry | undefined
): readonly FrameworkProjectPlugin[] {
  if (registry === undefined) {
    return [];
  }
  if (!VALIDATED_REGISTRIES.has(registry)) {
    configurationError(
      "Framework project plugin registries must be created with createFrameworkProjectPluginRegistry()."
    );
  }
  return registry.plugins;
}

/** Binds project-finalizer semantics into generation freshness without re-extracting files. */
export function frameworkProjectPluginProjectVersion(
  baseVersion: string,
  registry: FrameworkProjectPluginRegistry | undefined
): string {
  const plugins = requireFrameworkProjectPluginRegistry(registry);
  return plugins.length === 0 ? baseVersion : `${baseVersion}+framework-project-${registry?.fingerprint}`;
}

function deepFreeze(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value as object)) {
    return;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  Object.freeze(value);
}

function requireText(value: unknown, plugin: FrameworkProjectPlugin, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TEXT_LENGTH ||
    value.trim() !== value ||
    /\p{C}/u.test(value)
  ) {
    outputError(plugin, `${label} must be trimmed readable text of at most ${MAX_TEXT_LENGTH} characters.`);
  }
  return value;
}

function requireRange(
  range: SourceRange,
  sourceLines: readonly string[],
  plugin: FrameworkProjectPlugin,
  label: string
): SourceRange {
  if (range === null || typeof range !== "object") {
    outputError(plugin, `${label} must be a source range.`);
  }
  for (const [positionLabel, position] of [["start", range.start], ["end", range.end]] as const) {
    if (
      position === null ||
      typeof position !== "object" ||
      !Number.isSafeInteger(position.line) ||
      !Number.isSafeInteger(position.column) ||
      position.line < 1 ||
      position.line > sourceLines.length ||
      position.column < 1 ||
      position.column > (sourceLines[position.line - 1]?.length ?? 0) + 1
    ) {
      outputError(plugin, `${label}.${positionLabel} must be inside the source document.`);
    }
  }
  if (
    range.start.line > range.end.line ||
    (range.start.line === range.end.line && range.start.column > range.end.column)
  ) {
    outputError(plugin, `${label} must not end before it starts.`);
  }
  return {
    start: { line: range.start.line, column: range.start.column },
    end: { line: range.end.line, column: range.end.column }
  };
}

function validateSourceRelation(
  plugin: FrameworkProjectPlugin,
  source: SymbolNode,
  relationKind: FrameworkProjectPluginRelation,
  key: string
): void {
  if (relationKind === "routes" && source.kind !== "route") {
    outputError(plugin, `reference ${key} with routes relation must start at a route symbol.`);
  }
  if (relationKind === "handles" && source.kind !== "entrypoint") {
    outputError(plugin, `reference ${key} with handles relation must start at an entrypoint symbol.`);
  }
}

/**
 * Executes validated project finalizers and turns their descriptors into
 * host-owned pending references. Plugins cannot mutate symbols or claim exact targets.
 */
export function projectFrameworkPluginReferences(input: {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly extractedFiles: readonly ArtifactFacts[];
  readonly registry?: FrameworkProjectPluginRegistry;
}): readonly PendingReference[] {
  const plugins = requireFrameworkProjectPluginRegistry(input.registry);
  if (plugins.length === 0) {
    return [];
  }
  const symbolCount = input.extractedFiles.reduce((count, facts) => count + facts.symbols.length, 0);
  const referenceCount = input.extractedFiles.reduce(
    (count, facts) => count + facts.pendingReferences.length,
    0
  );
  if (
    input.extractedFiles.length > MAX_PROJECT_FILES ||
    symbolCount > MAX_PROJECT_SYMBOLS ||
    referenceCount > MAX_PROJECT_REFERENCES
  ) {
    throw new FrameworkProjectPluginOutputError(
      `Project finalizer input exceeds the safe limit (${MAX_PROJECT_FILES} files, ${MAX_PROJECT_SYMBOLS} symbols, ${MAX_PROJECT_REFERENCES} references).`
    );
  }

  const documentsByPath = new Map(input.sourceDocuments.map((document) => [document.relativePath, document]));
  const symbols = input.extractedFiles.flatMap((facts) => facts.symbols);
  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const occupiedIds = new Set(
    input.extractedFiles.flatMap((facts) => [
      ...facts.edges.map((edge) => edge.id),
      ...facts.pendingReferences.map((reference) => reference.id)
    ])
  );
  const files = input.extractedFiles
    .map((facts) => {
      const fileSymbol = facts.symbols.find((symbol) => symbol.kind === "file");
      if (fileSymbol === undefined) {
        return null;
      }
      const document = documentsByPath.get(fileSymbol.filePath);
      if (document === undefined) {
        return null;
      }
      return {
        filePath: fileSymbol.filePath,
        language: document.language,
        facts: structuredClone(facts)
      } satisfies FrameworkProjectPluginFile;
    })
    .filter((file): file is FrameworkProjectPluginFile => file !== null)
    .sort((left, right) => compareText(left.filePath, right.filePath));
  deepFreeze(files);
  const projectLanguages = new Set(files.map((file) => file.language));
  const references: PendingReference[] = [];

  for (const plugin of plugins) {
    if (!plugin.languages.some((language) => projectLanguages.has(language))) {
      continue;
    }
    let result: FrameworkProjectPluginResult | null;
    try {
      result = plugin.finalize(Object.freeze({ files }));
    } catch (error) {
      outputError(plugin, `finalize failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (result === null) {
      continue;
    }
    if (result === undefined || typeof result !== "object" || Array.isArray(result)) {
      outputError(plugin, "finalize must return null or an object.");
    }
    if (!Array.isArray(result.references) && result.references !== undefined) {
      outputError(plugin, "references must be an array.");
    }
    const descriptors = result.references ?? [];
    if (descriptors.length > MAX_REFERENCES_PER_PLUGIN) {
      outputError(plugin, `references must contain at most ${MAX_REFERENCES_PER_PLUGIN} entries.`);
    }
    const keys = new Set<string>();
    for (const [index, descriptor] of descriptors.entries()) {
      if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
        outputError(plugin, `references[${index}] must be an object.`);
      }
      if (typeof descriptor.key !== "string" || !KEY_PATTERN.test(descriptor.key)) {
        outputError(plugin, `references[${index}].key must be stable ASCII text.`);
      }
      if (keys.has(descriptor.key)) {
        outputError(plugin, "reference keys must be unique within one project result.");
      }
      keys.add(descriptor.key);
      const source = symbolsById.get(descriptor.sourceSymbolId);
      if (source === undefined || source.kind === "file") {
        outputError(plugin, `reference ${descriptor.key}.sourceSymbolId must identify an existing non-file symbol.`);
      }
      if (!SUPPORTED_RELATIONS.has(descriptor.relationKind)) {
        outputError(plugin, `reference ${descriptor.key}.relationKind is unsupported.`);
      }
      validateSourceRelation(plugin, source, descriptor.relationKind, descriptor.key);
      const document = documentsByPath.get(source.filePath);
      if (document === undefined) {
        outputError(plugin, `reference ${descriptor.key} source file is unavailable.`);
      }
      const range = requireRange(
        descriptor.range,
        document.sourceText.split(/\r?\n/u),
        plugin,
        `reference ${descriptor.key}.range`
      );
      if (
        range.start.line < source.range.start.line ||
        (range.start.line === source.range.start.line &&
          range.start.column < source.range.start.column) ||
        range.end.line > source.range.end.line ||
        (range.end.line === source.range.end.line && range.end.column > source.range.end.column)
      ) {
        outputError(plugin, `reference ${descriptor.key}.range must stay inside its source symbol.`);
      }
      const referenceName = requireText(
        descriptor.referenceName,
        plugin,
        `reference ${descriptor.key}.referenceName`
      );
      const id = createEdgeId({
        sourceId: source.id,
        targetId: null,
        kind: descriptor.relationKind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      });
      if (occupiedIds.has(id)) {
        outputError(plugin, `reference ${descriptor.key} creates a duplicate graph identity.`);
      }
      occupiedIds.add(id);
      references.push({
        id,
        sourceId: source.id,
        filePath: source.filePath,
        referenceName,
        relationKind: descriptor.relationKind,
        range,
        projectPlugin: { pluginId: plugin.id, pluginVersion: plugin.version }
      });
    }
  }
  return references.sort((left, right) => compareText(left.id, right.id));
}

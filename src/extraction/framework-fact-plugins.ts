import { createHash } from "node:crypto";

import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  ARTIFACT_LANGUAGES,
  ENTRYPOINT_OPERATIONS,
  ENTRYPOINT_TRANSPORTS,
  ROUTE_METHODS,
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ArtifactLanguage,
  type EdgeKind,
  type EntryPointOperation,
  type EntryPointTransport,
  type PendingReference,
  type ProjectFrameworkEvidence,
  type RouteMethod,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface FrameworkFactPluginInput {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  readonly sourceText: string;
  /** Defensive, deeply frozen copy of the built-in extractor output. */
  readonly coreFacts: ArtifactFacts;
}

export type FrameworkFactPluginSymbolSource =
  | { readonly kind: "plugin-symbol"; readonly key: string }
  | { readonly kind: "core-symbol"; readonly symbolId: string };

interface FrameworkFactPluginSymbolBase {
  /** Stable per-plugin, per-file identity. */
  readonly key: string;
  readonly range: SourceRange;
  readonly parent?: FrameworkFactPluginSymbolSource;
  readonly isExported?: boolean;
}

export interface FrameworkFactPluginNamedSymbol extends FrameworkFactPluginSymbolBase {
  readonly kind: Exclude<SymbolKind, "file" | "route" | "entrypoint">;
  readonly name: string;
}

export interface FrameworkFactPluginRouteSymbol extends FrameworkFactPluginSymbolBase {
  readonly kind: "route";
  readonly method: RouteMethod;
  readonly path: string;
}

export interface FrameworkFactPluginEntrypointSymbol extends FrameworkFactPluginSymbolBase {
  readonly kind: "entrypoint";
  readonly transport: EntryPointTransport;
  readonly operation: EntryPointOperation;
  readonly name: string;
}

export type FrameworkFactPluginSymbol =
  | FrameworkFactPluginNamedSymbol
  | FrameworkFactPluginRouteSymbol
  | FrameworkFactPluginEntrypointSymbol;

export type FrameworkFactPluginRelation = Extract<
  EdgeKind,
  | "references"
  | "calls"
  | "instantiates"
  | "overrides"
  | "routes"
  | "handles"
  | "extends"
  | "implements"
>;

export interface FrameworkFactPluginReference {
  /** Stable diagnostic identity within this plugin result. */
  readonly key: string;
  readonly source: FrameworkFactPluginSymbolSource;
  readonly referenceName: string;
  readonly relationKind: FrameworkFactPluginRelation;
  readonly range: SourceRange;
}

export interface FrameworkFactPluginResult {
  readonly symbols?: readonly FrameworkFactPluginSymbol[];
  readonly references?: readonly FrameworkFactPluginReference[];
}

export interface FrameworkFactPlugin {
  /** Lowercase vendor/plugin namespace, for example `acme/framework-facts`. */
  readonly id: string;
  /** Stable semantic or content version controlled by the plugin author. */
  readonly version: string;
  readonly languages: readonly ArtifactLanguage[];
  /** Pure, synchronous extraction callback; graph identities remain host-owned. */
  readonly extract: (input: FrameworkFactPluginInput) => FrameworkFactPluginResult | null;
}

export interface FrameworkFactPluginRegistry {
  readonly plugins: readonly FrameworkFactPlugin[];
  readonly fingerprint: string;
}

export interface FrameworkFactPluginBaseExtractor {
  (input: {
    readonly filePath: string;
    readonly sourceText: string;
    readonly language: ArtifactLanguage;
    readonly frameworkEvidence?: ProjectFrameworkEvidence;
  }): ArtifactFacts;
  readonly version?: string;
}

export type FrameworkFactPluginExtractor = FrameworkFactPluginBaseExtractor & {
  readonly version: string;
};

export class FrameworkFactPluginConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FrameworkFactPluginConfigurationError";
  }
}

export class FrameworkFactPluginOutputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FrameworkFactPluginOutputError";
  }
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,119}$/u;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const MAX_PLUGIN_COUNT = 32;
const MAX_SYMBOLS_PER_PLUGIN_FILE = 256;
const MAX_REFERENCES_PER_PLUGIN_FILE = 512;
const MAX_TEXT_LENGTH = 512;
const VALIDATED_REGISTRIES = new WeakSet<FrameworkFactPluginRegistry>();
const SUPPORTED_RELATIONS = new Set<FrameworkFactPluginRelation>([
  "references",
  "calls",
  "instantiates",
  "overrides",
  "routes",
  "handles",
  "extends",
  "implements"
]);
const SUPPORTED_NAMED_SYMBOL_KINDS = new Set<FrameworkFactPluginNamedSymbol["kind"]>([
  "class",
  "function",
  "method",
  "interface",
  "type",
  "variable",
  "resource",
  "module"
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function configurationError(message: string): never {
  throw new FrameworkFactPluginConfigurationError(message);
}

function outputError(plugin: FrameworkFactPlugin, message: string): never {
  throw new FrameworkFactPluginOutputError(`Framework fact plugin ${plugin.id}@${plugin.version}: ${message}`);
}

function normalizePlugin(value: unknown, index: number): FrameworkFactPlugin {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    configurationError(`Framework fact plugin at index ${index} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !PLUGIN_ID_PATTERN.test(record.id)) {
    configurationError(`Framework fact plugin ${index}.id must use lowercase vendor/plugin form.`);
  }
  if (typeof record.version !== "string" || !VERSION_PATTERN.test(record.version)) {
    configurationError(`Framework fact plugin ${record.id}.version must be stable non-empty ASCII text.`);
  }
  if (!Array.isArray(record.languages) || record.languages.length === 0) {
    configurationError(`Framework fact plugin ${record.id}.languages must not be empty.`);
  }
  const languages = record.languages.map((language) => {
    if (typeof language !== "string" || !ARTIFACT_LANGUAGES.includes(language as ArtifactLanguage)) {
      configurationError(`Framework fact plugin ${record.id}.languages contains an unsupported language.`);
    }
    return language as ArtifactLanguage;
  });
  if (new Set(languages).size !== languages.length) {
    configurationError(`Framework fact plugin ${record.id}.languages must not contain duplicates.`);
  }
  if (typeof record.extract !== "function") {
    configurationError(`Framework fact plugin ${record.id}.extract must be a function.`);
  }
  return Object.freeze({
    id: record.id,
    version: record.version,
    languages: Object.freeze([...languages].sort(compareText)),
    extract: record.extract as FrameworkFactPlugin["extract"]
  });
}

/** Creates an immutable project-scoped registry and a deterministic semantic fingerprint. */
export function createFrameworkFactPluginRegistry(
  plugins: readonly FrameworkFactPlugin[]
): FrameworkFactPluginRegistry {
  if (!Array.isArray(plugins) || plugins.length > MAX_PLUGIN_COUNT) {
    configurationError(`Framework fact plugins must be an array of at most ${MAX_PLUGIN_COUNT} entries.`);
  }
  const normalized = plugins
    .map((plugin, index) => normalizePlugin(plugin, index))
    .sort((left, right) => compareText(left.id, right.id));
  const ids = normalized.map((plugin) => plugin.id);
  if (new Set(ids).size !== ids.length) {
    configurationError("Framework fact plugin ids must be unique.");
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized.map(({ id, version, languages }) => ({ id, version, languages }))))
    .digest("hex")
    .slice(0, 16);
  const registry = Object.freeze({ plugins: Object.freeze([...normalized]), fingerprint });
  VALIDATED_REGISTRIES.add(registry);
  return registry;
}

function requireRegistry(registry: FrameworkFactPluginRegistry): readonly FrameworkFactPlugin[] {
  if (!VALIDATED_REGISTRIES.has(registry)) {
    configurationError(
      "Framework fact plugin registries must be created with createFrameworkFactPluginRegistry()."
    );
  }
  return registry.plugins;
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

function frozenCoreFacts(facts: ArtifactFacts): ArtifactFacts {
  const copy = structuredClone(facts);
  deepFreeze(copy);
  return copy;
}

function requireArray<T>(
  value: readonly T[] | undefined,
  maximum: number,
  plugin: FrameworkFactPlugin,
  label: string
): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > maximum) {
    outputError(plugin, `${label} must be an array of at most ${maximum} entries.`);
  }
  return value;
}

function requireKey(value: unknown, plugin: FrameworkFactPlugin, label: string): string {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    outputError(plugin, `${label} must be stable ASCII text matching ${KEY_PATTERN.source}.`);
  }
  return value;
}

function requireText(value: unknown, plugin: FrameworkFactPlugin, label: string): string {
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
  value: SourceRange,
  sourceLines: readonly string[],
  plugin: FrameworkFactPlugin,
  label: string
): SourceRange {
  if (value === null || typeof value !== "object") {
    outputError(plugin, `${label} must be a source range.`);
  }
  const positions = [value.start, value.end];
  for (const [index, position] of positions.entries()) {
    const positionLabel = index === 0 ? "start" : "end";
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
    value.start.line > value.end.line ||
    (value.start.line === value.end.line && value.start.column > value.end.column)
  ) {
    outputError(plugin, `${label} must not end before it starts.`);
  }
  return {
    start: { line: value.start.line, column: value.start.column },
    end: { line: value.end.line, column: value.end.column }
  };
}

function pluginSymbolName(symbol: FrameworkFactPluginSymbol, plugin: FrameworkFactPlugin): string {
  if (symbol.kind === "route") {
    if (!ROUTE_METHODS.includes(symbol.method)) {
      outputError(plugin, `symbol ${symbol.key}.method is unsupported.`);
    }
    const path = requireText(symbol.path, plugin, `symbol ${symbol.key}.path`);
    return `${symbol.method} ${path}`;
  }
  if (symbol.kind === "entrypoint") {
    if (!ENTRYPOINT_TRANSPORTS.includes(symbol.transport)) {
      outputError(plugin, `symbol ${symbol.key}.transport is unsupported.`);
    }
    if (!ENTRYPOINT_OPERATIONS.includes(symbol.operation)) {
      outputError(plugin, `symbol ${symbol.key}.operation is unsupported.`);
    }
    return `${symbol.transport} ${symbol.operation} ${requireText(symbol.name, plugin, `symbol ${symbol.key}.name`)}`;
  }
  if (!SUPPORTED_NAMED_SYMBOL_KINDS.has(symbol.kind)) {
    outputError(plugin, `symbol ${symbol.key}.kind is unsupported.`);
  }
  return requireText(symbol.name, plugin, `symbol ${symbol.key}.name`);
}

function normalizeSource(
  source: FrameworkFactPluginSymbolSource | undefined,
  plugin: FrameworkFactPlugin,
  label: string
): FrameworkFactPluginSymbolSource | undefined {
  if (source === undefined) {
    return undefined;
  }
  if (source === null || typeof source !== "object") {
    outputError(plugin, `${label} must identify a plugin or core symbol.`);
  }
  if (source.kind === "plugin-symbol") {
    return { kind: "plugin-symbol", key: requireKey(source.key, plugin, `${label}.key`) };
  }
  if (source.kind === "core-symbol") {
    return { kind: "core-symbol", symbolId: requireText(source.symbolId, plugin, `${label}.symbolId`) };
  }
  outputError(plugin, `${label}.kind is unsupported.`);
}

function pluginExtractorVersion(
  baseExtractor: FrameworkFactPluginBaseExtractor,
  registry: FrameworkFactPluginRegistry
): string {
  requireRegistry(registry);
  const baseVersion = baseExtractor.version ?? ARTIFACT_FACTS_EXTRACTOR_VERSION;
  if (!VERSION_PATTERN.test(baseVersion) && !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,239}$/u.test(baseVersion)) {
    configurationError("Base extractor version must be stable non-empty ASCII text.");
  }
  return registry.plugins.length === 0
    ? baseVersion
    : `${baseVersion}+framework-facts-${registry.fingerprint}`;
}

function applyPlugin(
  plugin: FrameworkFactPlugin,
  input: Parameters<FrameworkFactPluginBaseExtractor>[0],
  facts: ArtifactFacts
): ArtifactFacts {
  if (!plugin.languages.includes(input.language)) {
    return facts;
  }
  const rawResult = plugin.extract(Object.freeze({
    filePath: input.filePath,
    language: input.language,
    sourceText: input.sourceText,
    coreFacts: frozenCoreFacts(facts)
  }));
  if (rawResult === null) {
    return facts;
  }
  if (rawResult === undefined || typeof rawResult !== "object" || Array.isArray(rawResult)) {
    outputError(plugin, "extract must return null or an object.");
  }

  const descriptors = requireArray(
    rawResult.symbols,
    MAX_SYMBOLS_PER_PLUGIN_FILE,
    plugin,
    "symbols"
  );
  const referenceDescriptors = requireArray(
    rawResult.references,
    MAX_REFERENCES_PER_PLUGIN_FILE,
    plugin,
    "references"
  );
  const sourceLines = input.sourceText.split(/\r?\n/u);
  const coreSymbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
  const fileSymbol = facts.symbols.find(
    (symbol) => symbol.kind === "file" && symbol.filePath === input.filePath
  );
  if (fileSymbol === undefined) {
    outputError(plugin, "the base extractor did not produce a file symbol.");
  }
  const rootFileSymbol = fileSymbol;

  const normalizedDescriptors = descriptors.map((descriptor, index) => {
    if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      outputError(plugin, `symbols[${index}] must be an object.`);
    }
    const key = requireKey(descriptor.key, plugin, `symbols[${index}].key`);
    const range = requireRange(descriptor.range, sourceLines, plugin, `symbol ${key}.range`);
    const parent = normalizeSource(descriptor.parent, plugin, `symbol ${key}.parent`);
    return {
      descriptor,
      key,
      range,
      parent,
      name: pluginSymbolName(descriptor, plugin)
    };
  });
  const keys = normalizedDescriptors.map(({ key }) => key);
  if (new Set(keys).size !== keys.length) {
    outputError(plugin, "symbol keys must be unique within one file result.");
  }

  const symbolsByKey = new Map<string, SymbolNode>();
  const newSymbols: SymbolNode[] = [];
  for (const normalized of normalizedDescriptors) {
    const qualifiedName = `${input.filePath}#extension:${plugin.id}:${normalized.key}`;
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: normalized.descriptor.kind,
        declarationOrdinal: 0
      }),
      name: normalized.name,
      qualifiedName,
      kind: normalized.descriptor.kind,
      filePath: input.filePath,
      range: normalized.range,
      isExported: normalized.descriptor.isExported === true,
      declarationOrdinal: 0
    };
    if (coreSymbolsById.has(symbol.id)) {
      outputError(plugin, `symbol ${normalized.key} collides with a core symbol identity.`);
    }
    symbolsByKey.set(normalized.key, symbol);
    newSymbols.push(symbol);
  }

  function resolveSource(
    source: FrameworkFactPluginSymbolSource | undefined,
    label: string
  ): SymbolNode {
    if (source === undefined) {
      return rootFileSymbol;
    }
    if (source.kind === "plugin-symbol") {
      const symbol = symbolsByKey.get(source.key);
      if (symbol === undefined) {
        outputError(plugin, `${label} refers to unknown plugin symbol ${source.key}.`);
      }
      return symbol;
    }
    const symbol = coreSymbolsById.get(source.symbolId);
    if (symbol === undefined || symbol.filePath !== input.filePath) {
      outputError(plugin, `${label} must identify a same-file core symbol.`);
    }
    return symbol;
  }

  const parentBySymbolId = new Map<string, string>();
  const newEdges = [...facts.edges];
  const occupiedEdgeIds = new Set([
    ...facts.edges.map((edge) => edge.id),
    ...facts.pendingReferences.map((reference) => reference.id)
  ]);
  for (const normalized of normalizedDescriptors) {
    const symbol = symbolsByKey.get(normalized.key)!;
    const parent = resolveSource(normalized.parent, `symbol ${normalized.key}.parent`);
    if (parent.id === symbol.id) {
      outputError(plugin, `symbol ${normalized.key} cannot contain itself.`);
    }
    parentBySymbolId.set(symbol.id, parent.id);
    const edgeId = createEdgeId({
      sourceId: parent.id,
      targetId: symbol.id,
      kind: "contains",
      line: normalized.range.start.line,
      column: normalized.range.start.column,
      referenceName: normalized.name
    });
    if (occupiedEdgeIds.has(edgeId)) {
      outputError(plugin, `symbol ${normalized.key} creates a duplicate containment edge identity.`);
    }
    occupiedEdgeIds.add(edgeId);
    newEdges.push({
      id: edgeId,
      sourceId: parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: normalized.range,
      resolution: "exact",
      confidence: 1,
      referenceName: normalized.name,
      evidence: {
        ruleId: `extension.framework-fact.${plugin.id}@${plugin.version}.containment`,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  for (const symbol of newSymbols) {
    const visited = new Set<string>();
    let current: string | undefined = symbol.id;
    while (current !== undefined && symbolsByKey.size > 0) {
      if (visited.has(current)) {
        outputError(plugin, "plugin symbol parents must be acyclic.");
      }
      visited.add(current);
      current = parentBySymbolId.get(current);
    }
  }

  const referenceKeys = new Set<string>();
  const newPendingReferences = [...facts.pendingReferences];
  const newReferenceScopes = [...facts.referenceScopes];
  for (const [index, descriptor] of referenceDescriptors.entries()) {
    if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      outputError(plugin, `references[${index}] must be an object.`);
    }
    const key = requireKey(descriptor.key, plugin, `references[${index}].key`);
    if (referenceKeys.has(key)) {
      outputError(plugin, "reference keys must be unique within one file result.");
    }
    referenceKeys.add(key);
    const sourceDescriptor = normalizeSource(descriptor.source, plugin, `reference ${key}.source`);
    if (sourceDescriptor === undefined) {
      outputError(plugin, `reference ${key}.source is required.`);
    }
    const source = resolveSource(sourceDescriptor, `reference ${key}.source`);
    if (
      typeof descriptor.relationKind !== "string" ||
      !SUPPORTED_RELATIONS.has(descriptor.relationKind as FrameworkFactPluginRelation)
    ) {
      outputError(plugin, `reference ${key}.relationKind is unsupported.`);
    }
    const relationKind = descriptor.relationKind as FrameworkFactPluginRelation;
    if (relationKind === "routes" && source.kind !== "route") {
      outputError(plugin, `reference ${key} with routes relation must start at a route symbol.`);
    }
    if (relationKind === "handles" && source.kind !== "entrypoint") {
      outputError(plugin, `reference ${key} with handles relation must start at an entrypoint symbol.`);
    }
    const range = requireRange(descriptor.range, sourceLines, plugin, `reference ${key}.range`);
    const referenceName = requireText(descriptor.referenceName, plugin, `reference ${key}.referenceName`);
    const id = createEdgeId({
      sourceId: source.id,
      targetId: null,
      kind: relationKind,
      line: range.start.line,
      column: range.start.column,
      referenceName
    });
    if (occupiedEdgeIds.has(id)) {
      outputError(plugin, `reference ${key} creates a duplicate graph identity.`);
    }
    occupiedEdgeIds.add(id);
    const reference: PendingReference = {
      id,
      sourceId: source.id,
      filePath: input.filePath,
      referenceName,
      relationKind,
      range,
      extractionPlugin: { pluginId: plugin.id, pluginVersion: plugin.version }
    };
    newPendingReferences.push(reference);
    newReferenceScopes.push({ referenceId: id, scopeIds: [] });
  }

  return {
    ...facts,
    symbols: [...facts.symbols, ...newSymbols],
    edges: newEdges,
    pendingReferences: newPendingReferences,
    referenceScopes: newReferenceScopes
  };
}

/**
 * Composes validated framework fact plugins around any synchronous base extractor.
 * Each plugin sees the facts accepted from earlier plugins, but only through a frozen copy.
 */
export function createFrameworkFactPluginExtractor(
  baseExtractor: FrameworkFactPluginBaseExtractor,
  registry: FrameworkFactPluginRegistry
): FrameworkFactPluginExtractor {
  const plugins = requireRegistry(registry);
  const version = pluginExtractorVersion(baseExtractor, registry);
  return Object.assign(
    (input: Parameters<FrameworkFactPluginBaseExtractor>[0]): ArtifactFacts => {
      let facts = baseExtractor(input);
      for (const plugin of plugins) {
        facts = applyPlugin(plugin, input, facts);
      }
      return facts;
    },
    { version }
  );
}

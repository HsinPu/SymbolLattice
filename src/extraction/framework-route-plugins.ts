import { createHash } from "node:crypto";

import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  ROUTE_METHODS,
  type ArtifactLanguage,
  type RouteMethod
} from "../domain/index.js";

/** Languages supported by the first public, declarative framework-route extension surface. */
export const FRAMEWORK_ROUTE_PLUGIN_LANGUAGES = ["typescript", "javascript"] as const;

export type FrameworkRoutePluginLanguage = (typeof FRAMEWORK_ROUTE_PLUGIN_LANGUAGES)[number];

/** A route plugin may describe HTTP registration methods, but not client-navigation routes. */
export type FrameworkRoutePluginHttpMethod = Exclude<RouteMethod, "NAVIGATE">;

/** Maps one literal receiver method to the HTTP method represented in the graph. */
export interface FrameworkRoutePluginMethod {
  readonly methodName: string;
  readonly routeMethod: FrameworkRoutePluginHttpMethod;
}

/** Maps one exact imported method decorator to the HTTP method represented in the graph. */
export interface FrameworkRoutePluginDecoratorRoute {
  /** One named export, or "default" for a default decorator import. */
  readonly decoratorExport: string;
  readonly routeMethod: FrameworkRoutePluginHttpMethod;
}

/**
 * Names one receiver method that may mount a same-file child receiver below a
 * fixed literal prefix. Projection is limited to one exact, acyclic, bounded
 * chain of two-argument non-root mounts; all other forms emit no child route
 * fact.
 */
export interface FrameworkRoutePluginMountMethod {
  readonly methodName: string;
}

/**
 * A narrowly declarative, syntax-proven extension for a TypeScript or JavaScript
 * router or TypeScript method decorator constructed directly from one exact ESM
 * import. SymbolLattice owns all AST inspection and graph writes; the plugin
 * never emits raw graph facts.
 */
export interface FrameworkRoutePlugin {
  /** Lowercase vendor/framework namespace, for example "acme/lattice-router". */
  readonly id: string;
  readonly languages: readonly FrameworkRoutePluginLanguage[];
  /** Exact ESM module specifier that exports the receiver constructor or method decorator. */
  readonly moduleSpecifier: string;
  /** Required when `routeMethods` is declared: one named export, or "default" for a default import. */
  readonly factoryExport?: string;
  /** Optional literal receiver methods accepted by the framework. */
  readonly routeMethods?: readonly FrameworkRoutePluginMethod[];
  /** Optional TypeScript method decorators accepted by the framework. */
  readonly decoratorRoutes?: readonly FrameworkRoutePluginDecoratorRoute[];
  /** Optional literal receiver methods that mount a child receiver below a fixed prefix. */
  readonly mountMethods?: readonly FrameworkRoutePluginMountMethod[];
  /** Human-readable, bounded syntax surface exposed through the public registry. */
  readonly surfaces: readonly string[];
}

/** An immutable, validated plugin collection safe to bind to one indexing service. */
export interface FrameworkRoutePluginRegistry {
  readonly plugins: readonly FrameworkRoutePlugin[];
  /** Stable descriptor fingerprint used to invalidate persisted raw facts. */
  readonly fingerprint: string;
}

/** Raised before indexing when a public framework-route descriptor is ambiguous or unsafe. */
export class FrameworkRoutePluginConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FrameworkRoutePluginConfigurationError";
  }
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const MAX_DESCRIPTOR_TEXT_LENGTH = 240;
const MAX_SURFACE_COUNT = 16;
const MAX_ROUTE_METHOD_COUNT = 16;
const ROUTE_PLUGIN_HTTP_METHODS = new Set<FrameworkRoutePluginHttpMethod>(
  ROUTE_METHODS.filter((method): method is FrameworkRoutePluginHttpMethod => method !== "NAVIGATE")
);
const EMPTY_FRAMEWORK_ROUTE_PLUGINS: readonly FrameworkRoutePlugin[] = Object.freeze([]);
const EMPTY_ROUTE_METHODS: readonly FrameworkRoutePluginMethod[] = Object.freeze([]);
const EMPTY_DECORATOR_ROUTES: readonly FrameworkRoutePluginDecoratorRoute[] = Object.freeze([]);
const EMPTY_MOUNT_METHODS: readonly FrameworkRoutePluginMountMethod[] = Object.freeze([]);
const VALIDATED_REGISTRIES = new WeakSet<FrameworkRoutePluginRegistry>();

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function configurationError(message: string): never {
  throw new FrameworkRoutePluginConfigurationError(message);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    configurationError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string, maxLength = MAX_DESCRIPTOR_TEXT_LENGTH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    configurationError(`${label} must be non-empty trimmed text of at most ${maxLength} characters.`);
  }
  if (/\p{C}|\s/gu.test(value)) {
    configurationError(`${label} must not contain whitespace or control characters.`);
  }
  return value;
}

function normalizedLanguages(value: unknown, label: string): readonly FrameworkRoutePluginLanguage[] {
  if (!Array.isArray(value) || value.length === 0) {
    configurationError(`${label} must declare at least one supported language.`);
  }
  const languages = value.map((language) => {
    if (
      typeof language !== "string" ||
      !FRAMEWORK_ROUTE_PLUGIN_LANGUAGES.includes(language as FrameworkRoutePluginLanguage)
    ) {
      configurationError(`${label} may contain only TypeScript or JavaScript.`);
    }
    return language as FrameworkRoutePluginLanguage;
  });
  if (new Set(languages).size !== languages.length) {
    configurationError(`${label} must not contain duplicate languages.`);
  }
  return Object.freeze([...languages].sort(compareText));
}

function normalizedSurfaces(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SURFACE_COUNT) {
    configurationError(`${label} must contain between 1 and ${MAX_SURFACE_COUNT} entries.`);
  }
  const surfaces = value.map((surface, index) => {
    if (
      typeof surface !== "string" ||
      surface.length === 0 ||
      surface.length > MAX_DESCRIPTOR_TEXT_LENGTH ||
      surface.trim() !== surface ||
      /\p{C}/u.test(surface)
    ) {
      configurationError(`${label}[${index}] must be readable text of at most ${MAX_DESCRIPTOR_TEXT_LENGTH} characters.`);
    }
    return surface;
  });
  if (new Set(surfaces).size !== surfaces.length) {
    configurationError(`${label} must not contain duplicate entries.`);
  }
  return Object.freeze([...surfaces].sort(compareText));
}

function normalizedRouteMethods(value: unknown, label: string): readonly FrameworkRoutePluginMethod[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUTE_METHOD_COUNT) {
    configurationError(`${label} must contain between 1 and ${MAX_ROUTE_METHOD_COUNT} entries.`);
  }
  const routeMethods = value.map((candidate, index) => {
    const record = requireRecord(candidate, `${label}[${index}]`);
    const methodName = requireText(record.methodName, `${label}[${index}].methodName`);
    if (!IDENTIFIER_PATTERN.test(methodName)) {
      configurationError(`${label}[${index}].methodName must be an identifier.`);
    }
    const routeMethod = record.routeMethod;
    if (typeof routeMethod !== "string" || !ROUTE_PLUGIN_HTTP_METHODS.has(routeMethod as FrameworkRoutePluginHttpMethod)) {
      configurationError(`${label}[${index}].routeMethod must be a supported HTTP method.`);
    }
    return Object.freeze({ methodName, routeMethod: routeMethod as FrameworkRoutePluginHttpMethod });
  });
  const methodNames = routeMethods.map((method) => method.methodName);
  if (new Set(methodNames).size !== methodNames.length) {
    configurationError(`${label} must not declare the same receiver method twice.`);
  }
  return Object.freeze([...routeMethods].sort((left, right) => compareText(left.methodName, right.methodName)));
}

function normalizedOptionalRouteMethods(
  value: unknown,
  label: string
): readonly FrameworkRoutePluginMethod[] {
  return value === undefined ? EMPTY_ROUTE_METHODS : normalizedRouteMethods(value, label);
}

function normalizedDecoratorRoutes(
  value: unknown,
  label: string
): readonly FrameworkRoutePluginDecoratorRoute[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUTE_METHOD_COUNT) {
    configurationError(`${label} must contain between 1 and ${MAX_ROUTE_METHOD_COUNT} entries.`);
  }
  const decoratorRoutes = value.map((candidate, index) => {
    const record = requireRecord(candidate, `${label}[${index}]`);
    const decoratorExport = requireText(record.decoratorExport, `${label}[${index}].decoratorExport`);
    if (decoratorExport !== "default" && !IDENTIFIER_PATTERN.test(decoratorExport)) {
      configurationError(`${label}[${index}].decoratorExport must be "default" or an identifier.`);
    }
    const routeMethod = record.routeMethod;
    if (typeof routeMethod !== "string" || !ROUTE_PLUGIN_HTTP_METHODS.has(routeMethod as FrameworkRoutePluginHttpMethod)) {
      configurationError(`${label}[${index}].routeMethod must be a supported HTTP method.`);
    }
    return Object.freeze({
      decoratorExport,
      routeMethod: routeMethod as FrameworkRoutePluginHttpMethod
    });
  });
  const decoratorExports = decoratorRoutes.map((route) => route.decoratorExport);
  if (new Set(decoratorExports).size !== decoratorExports.length) {
    configurationError(`${label} must not declare the same decorator export twice.`);
  }
  return Object.freeze(
    [...decoratorRoutes].sort((left, right) => compareText(left.decoratorExport, right.decoratorExport))
  );
}

function normalizedOptionalDecoratorRoutes(
  value: unknown,
  label: string
): readonly FrameworkRoutePluginDecoratorRoute[] {
  return value === undefined ? EMPTY_DECORATOR_ROUTES : normalizedDecoratorRoutes(value, label);
}

function normalizedMountMethods(
  value: unknown,
  label: string
): readonly FrameworkRoutePluginMountMethod[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUTE_METHOD_COUNT) {
    configurationError(`${label} must contain between 1 and ${MAX_ROUTE_METHOD_COUNT} entries.`);
  }
  const mountMethods = value.map((candidate, index) => {
    const record = requireRecord(candidate, `${label}[${index}]`);
    const methodName = requireText(record.methodName, `${label}[${index}].methodName`);
    if (!IDENTIFIER_PATTERN.test(methodName)) {
      configurationError(`${label}[${index}].methodName must be an identifier.`);
    }
    return Object.freeze({ methodName });
  });
  const methodNames = mountMethods.map((method) => method.methodName);
  if (new Set(methodNames).size !== methodNames.length) {
    configurationError(`${label} must not declare the same mount method twice.`);
  }
  return Object.freeze([...mountMethods].sort((left, right) => compareText(left.methodName, right.methodName)));
}

function normalizedOptionalMountMethods(
  value: unknown,
  label: string
): readonly FrameworkRoutePluginMountMethod[] {
  return value === undefined ? EMPTY_MOUNT_METHODS : normalizedMountMethods(value, label);
}

function normalizedPlugin(value: unknown, index: number): FrameworkRoutePlugin {
  const record = requireRecord(value, `framework route plugin at index ${index}`);
  const id = requireText(record.id, `framework route plugin ${index}.id`);
  if (!PLUGIN_ID_PATTERN.test(id)) {
    configurationError(`framework route plugin ${index}.id must use lowercase vendor/framework form.`);
  }
  const moduleSpecifier = requireText(
    record.moduleSpecifier,
    `framework route plugin ${id}.moduleSpecifier`
  );
  const languages = normalizedLanguages(record.languages, `framework route plugin ${id}.languages`);
  const routeMethods = normalizedOptionalRouteMethods(
    record.routeMethods,
    `framework route plugin ${id}.routeMethods`
  );
  const decoratorRoutes = normalizedOptionalDecoratorRoutes(
    record.decoratorRoutes,
    `framework route plugin ${id}.decoratorRoutes`
  );
  const mountMethods = normalizedOptionalMountMethods(
    record.mountMethods,
    `framework route plugin ${id}.mountMethods`
  );
  if (routeMethods.length === 0 && decoratorRoutes.length === 0) {
    configurationError(`framework route plugin ${id} must declare at least one route surface.`);
  }
  if (mountMethods.length > 0 && routeMethods.length === 0) {
    configurationError(`framework route plugin ${id}.mountMethods require routeMethods.`);
  }
  if (routeMethods.length === 0 && record.factoryExport !== undefined) {
    configurationError(`framework route plugin ${id}.factoryExport requires routeMethods.`);
  }
  const factoryExport =
    routeMethods.length === 0
      ? undefined
      : requireText(record.factoryExport, `framework route plugin ${id}.factoryExport`);
  if (factoryExport !== undefined) {
    if (factoryExport !== "default" && !IDENTIFIER_PATTERN.test(factoryExport)) {
      configurationError(`framework route plugin ${id}.factoryExport must be "default" or an identifier.`);
    }
  }
  if (decoratorRoutes.length > 0 && !languages.includes("typescript")) {
    configurationError(`framework route plugin ${id}.decoratorRoutes require TypeScript support.`);
  }
  const normalized = {
    id,
    languages,
    moduleSpecifier,
    routeMethods,
    decoratorRoutes,
    mountMethods,
    surfaces: normalizedSurfaces(record.surfaces, `framework route plugin ${id}.surfaces`)
  };
  return factoryExport === undefined
    ? Object.freeze(normalized)
    : Object.freeze({ ...normalized, factoryExport });
}

/**
 * Validates and freezes the declared route surface. The registry is intentionally
 * scoped rather than process-global, so separate projects cannot alter one
 * another's graph semantics.
 */
export function createFrameworkRoutePluginRegistry(
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePluginRegistry {
  if (!Array.isArray(plugins)) {
    configurationError("Framework route plugins must be an array.");
  }
  const normalized = plugins.map((plugin, index) => normalizedPlugin(plugin, index)).sort((left, right) =>
    compareText(left.id, right.id)
  );
  const ids = normalized.map((plugin) => plugin.id);
  if (new Set(ids).size !== ids.length) {
    configurationError("Framework route plugin ids must be unique.");
  }
  const claimedExports = normalized.flatMap((plugin) => [
    ...(plugin.factoryExport === undefined ? [] : [`${plugin.moduleSpecifier}\u0000${plugin.factoryExport}`]),
    ...(plugin.decoratorRoutes ?? []).map(
      (decoratorRoute) => `${plugin.moduleSpecifier}\u0000${decoratorRoute.decoratorExport}`
    )
  ]);
  if (new Set(claimedExports).size !== claimedExports.length) {
    configurationError("Framework route plugins must not claim the same module export twice across route surfaces.");
  }
  const frozenPlugins = Object.freeze([...normalized]);
  const fingerprint = createHash("sha256").update(JSON.stringify(frozenPlugins)).digest("hex").slice(0, 16);
  const registry = Object.freeze({ plugins: frozenPlugins, fingerprint });
  VALIDATED_REGISTRIES.add(registry);
  return registry;
}

function requireValidatedRegistry(registry: FrameworkRoutePluginRegistry): void {
  if (!VALIDATED_REGISTRIES.has(registry)) {
    configurationError("Framework route plugin registries must be created with createFrameworkRoutePluginRegistry().");
  }
}

/** Selects extensions that can prove facts for the source language currently being parsed. */
export function frameworkRoutePluginsForLanguage(
  registry: FrameworkRoutePluginRegistry | undefined,
  language: ArtifactLanguage
): readonly FrameworkRoutePlugin[] {
  if (registry === undefined) {
    return EMPTY_FRAMEWORK_ROUTE_PLUGINS;
  }
  requireValidatedRegistry(registry);
  return registry.plugins.filter((plugin) => plugin.languages.includes(language as FrameworkRoutePluginLanguage));
}

/**
 * Binds the immutable descriptor fingerprint into persisted fact reuse. An empty
 * registry retains the normal extractor version because it changes no behavior.
 */
export function frameworkRoutePluginExtractorVersion(registry: FrameworkRoutePluginRegistry): string {
  requireValidatedRegistry(registry);
  return registry.plugins.length === 0
    ? ARTIFACT_FACTS_EXTRACTOR_VERSION
    : `${ARTIFACT_FACTS_EXTRACTOR_VERSION}+framework-routes-${registry.fingerprint}`;
}

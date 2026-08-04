import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createFrameworkFactPluginRegistry,
  type FrameworkFactPlugin
} from "../extraction/framework-fact-plugins.js";
import {
  createFrameworkProjectPluginRegistry,
  type FrameworkProjectPlugin
} from "./framework-project-plugins.js";
import {
  createReferenceResolverPluginRegistry,
  type ReferenceResolverPlugin
} from "./reference-resolver-plugins.js";
import { SymbolLatticeError } from "./errors.js";
import type { SymbolLatticeServiceExtensions } from "./service.js";

export const SYMBOL_LATTICE_PLUGIN_SCHEMA_VERSION = 1 as const;
export const MAX_SYMBOL_LATTICE_PLUGIN_MODULES = 16;

const SUPPORTED_PLUGIN_MODULE_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "frameworkFactPlugins",
  "frameworkProjectPlugins",
  "referenceResolverPlugins"
]);

/** Explicit contract exported by one trusted local JavaScript module. */
export interface SymbolLatticePluginManifest {
  readonly schemaVersion: typeof SYMBOL_LATTICE_PLUGIN_SCHEMA_VERSION;
  readonly frameworkFactPlugins?: readonly FrameworkFactPlugin[];
  readonly frameworkProjectPlugins?: readonly FrameworkProjectPlugin[];
  readonly referenceResolverPlugins?: readonly ReferenceResolverPlugin[];
}

export interface LoadSymbolLatticePluginModulesOptions {
  readonly projectPath: string;
  readonly modulePaths: readonly string[];
  /** Required when a module's resolved real path is outside the project root. */
  readonly allowExternalModules?: boolean;
}

export interface LoadedSymbolLatticePluginModules {
  readonly modulePaths: readonly string[];
  readonly extensions: SymbolLatticeServiceExtensions;
}

function pluginModuleError(message: string, cause?: unknown): SymbolLatticeError {
  const error = new SymbolLatticeError("INVALID_PLUGIN_MODULE", message);
  if (cause !== undefined) {
    Object.defineProperty(error, "cause", { value: cause, enumerable: false });
  }
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const pathFromRoot = relative(rootPath, candidatePath);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
}

function pluginArray<T>(
  manifest: Record<string, unknown>,
  key: keyof Omit<SymbolLatticePluginManifest, "schemaVersion">,
  modulePath: string
): readonly T[] {
  const value = manifest[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw pluginModuleError(`Plugin module ${modulePath} field ${key} must be an array.`);
  }
  return value as readonly T[];
}

function manifestFromNamespace(namespace: unknown, modulePath: string): SymbolLatticePluginManifest {
  if (!isRecord(namespace)) {
    throw pluginModuleError(`Plugin module ${modulePath} did not expose a module namespace.`);
  }

  const namedManifest = namespace.symbolLatticePlugin;
  const defaultExport = namespace.default;
  const defaultManifest =
    isRecord(defaultExport) && "symbolLatticePlugin" in defaultExport
      ? defaultExport.symbolLatticePlugin
      : defaultExport;
  const manifest = namedManifest ?? defaultManifest;
  if (!isRecord(manifest)) {
    throw pluginModuleError(
      `Plugin module ${modulePath} must export symbolLatticePlugin or a default manifest.`
    );
  }

  const unknownKeys = Object.keys(manifest).filter((key) => !MANIFEST_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw pluginModuleError(
      `Plugin module ${modulePath} manifest contains unknown field(s): ${unknownKeys.sort().join(", ")}.`
    );
  }
  if (manifest.schemaVersion !== SYMBOL_LATTICE_PLUGIN_SCHEMA_VERSION) {
    throw pluginModuleError(
      `Plugin module ${modulePath} schemaVersion must be ${SYMBOL_LATTICE_PLUGIN_SCHEMA_VERSION}.`
    );
  }

  const frameworkFactPlugins = pluginArray<FrameworkFactPlugin>(
    manifest,
    "frameworkFactPlugins",
    modulePath
  );
  const frameworkProjectPlugins = pluginArray<FrameworkProjectPlugin>(
    manifest,
    "frameworkProjectPlugins",
    modulePath
  );
  const referenceResolverPlugins = pluginArray<ReferenceResolverPlugin>(
    manifest,
    "referenceResolverPlugins",
    modulePath
  );
  if (
    frameworkFactPlugins.length === 0 &&
    frameworkProjectPlugins.length === 0 &&
    referenceResolverPlugins.length === 0
  ) {
    throw pluginModuleError(`Plugin module ${modulePath} manifest must declare at least one plugin.`);
  }

  return {
    schemaVersion: SYMBOL_LATTICE_PLUGIN_SCHEMA_VERSION,
    ...(frameworkFactPlugins.length === 0 ? {} : { frameworkFactPlugins }),
    ...(frameworkProjectPlugins.length === 0 ? {} : { frameworkProjectPlugins }),
    ...(referenceResolverPlugins.length === 0 ? {} : { referenceResolverPlugins })
  };
}

async function resolvePluginModulePaths(
  options: LoadSymbolLatticePluginModulesOptions
): Promise<readonly string[]> {
  if (!Array.isArray(options.modulePaths) || options.modulePaths.length === 0) {
    return [];
  }
  if (options.modulePaths.length > MAX_SYMBOL_LATTICE_PLUGIN_MODULES) {
    throw pluginModuleError(
      `At most ${MAX_SYMBOL_LATTICE_PLUGIN_MODULES} plugin modules may be loaded at once.`
    );
  }

  let projectRoot: string;
  try {
    projectRoot = await realpath(resolve(options.projectPath));
  } catch (error) {
    throw pluginModuleError(`Cannot resolve plugin project root ${resolve(options.projectPath)}.`, error);
  }

  const modulePaths: string[] = [];
  const seen = new Set<string>();
  for (const requestedPath of options.modulePaths) {
    if (typeof requestedPath !== "string" || requestedPath.trim().length === 0) {
      throw pluginModuleError("Plugin module paths must be non-empty strings.");
    }
    const unresolvedPath = resolve(projectRoot, requestedPath);
    let modulePath: string;
    try {
      modulePath = await realpath(unresolvedPath);
      if (!(await stat(modulePath)).isFile()) {
        throw new Error("not a regular file");
      }
    } catch (error) {
      throw pluginModuleError(`Cannot load plugin module file ${unresolvedPath}.`, error);
    }
    if (!SUPPORTED_PLUGIN_MODULE_EXTENSIONS.has(extname(modulePath).toLowerCase())) {
      throw pluginModuleError(
        `Plugin module ${modulePath} must use a .js, .mjs, or .cjs extension; raw TypeScript is not executed.`
      );
    }
    if (!isWithinRoot(projectRoot, modulePath) && options.allowExternalModules !== true) {
      throw pluginModuleError(
        `Plugin module ${modulePath} resolves outside project root ${projectRoot}; pass --allow-external-plugin to trust it explicitly.`
      );
    }
    if (seen.has(modulePath)) {
      throw pluginModuleError(`Plugin module ${modulePath} was provided more than once.`);
    }
    seen.add(modulePath);
    modulePaths.push(modulePath);
  }
  return modulePaths;
}

/**
 * Imports only explicitly named modules, then validates and fingerprints every
 * plugin through the existing host-owned registries. Importing executes trusted
 * JavaScript in-process; this function never discovers modules from a project.
 */
export async function loadSymbolLatticePluginModules(
  options: LoadSymbolLatticePluginModulesOptions
): Promise<LoadedSymbolLatticePluginModules> {
  const modulePaths = await resolvePluginModulePaths(options);
  const frameworkFactPlugins: FrameworkFactPlugin[] = [];
  const frameworkProjectPlugins: FrameworkProjectPlugin[] = [];
  const referenceResolverPlugins: ReferenceResolverPlugin[] = [];

  for (const modulePath of modulePaths) {
    let namespace: unknown;
    try {
      namespace = await import(pathToFileURL(modulePath).href);
    } catch (error) {
      throw pluginModuleError(`Plugin module ${modulePath} could not be imported.`, error);
    }
    const manifest = manifestFromNamespace(namespace, modulePath);
    frameworkFactPlugins.push(...(manifest.frameworkFactPlugins ?? []));
    frameworkProjectPlugins.push(...(manifest.frameworkProjectPlugins ?? []));
    referenceResolverPlugins.push(...(manifest.referenceResolverPlugins ?? []));
  }

  try {
    return {
      modulePaths: Object.freeze([...modulePaths]),
      extensions: Object.freeze({
        ...(frameworkFactPlugins.length === 0
          ? {}
          : { frameworkFactPlugins: createFrameworkFactPluginRegistry(frameworkFactPlugins) }),
        ...(frameworkProjectPlugins.length === 0
          ? {}
          : { frameworkProjectPlugins: createFrameworkProjectPluginRegistry(frameworkProjectPlugins) }),
        ...(referenceResolverPlugins.length === 0
          ? {}
          : { referenceResolverPlugins: createReferenceResolverPluginRegistry(referenceResolverPlugins) })
      })
    };
  } catch (error) {
    if (error instanceof SymbolLatticeError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown plugin registry error.";
    throw pluginModuleError(`Plugin registry validation failed: ${message}`, error);
  }
}

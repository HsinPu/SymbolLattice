import { isRustDirectExternalModuleName } from "./rust-project-resolver.js";
import { compareStableText, createEdgeId, createSymbolId, type GraphEdge, type RustActixImportedServiceConfigMountFact, type RustActixServiceConfigDeclarationFact, type RustActixServiceConfigRouteFact, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { ProjectModuleResolver } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function isStaticActixServiceConfigPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    (value === "/" || !value.endsWith("/"))
  );
}

function mountedActixServiceConfigRoutePath(prefix: string, routePath: string): string | null {
  if (!isStaticActixServiceConfigPath(prefix) || !isStaticActixServiceConfigPath(routePath)) {
    return null;
  }
  return prefix === "/" ? routePath : `${prefix}${routePath}`;
}

function isRustCrateRootFile(filePath: string): boolean {
  const fileName = filePath.split("/").at(-1);
  return fileName === "main.rs" || fileName === "lib.rs";
}

/** Returns the directory where one external child module of `filePath` lives. */
function rustExternalModuleChildDirectory(filePath: string): string | null {
  const normalizedFilePath = filePath.replace(/\\/gu, "/");
  const parts = normalizedFilePath.split("/");
  const fileName = parts.at(-1);
  if (fileName === undefined) {
    return null;
  }
  const directory = parts.slice(0, -1).join("/");
  if (isRustCrateRootFile(normalizedFilePath) || fileName === "mod.rs") {
    return directory;
  }
  if (!fileName.endsWith(".rs")) {
    return null;
  }
  const moduleName = fileName.slice(0, -".rs".length);
  if (!isRustDirectExternalModuleName(moduleName)) {
    return null;
  }
  return directory === "" ? moduleName : `${directory}/${moduleName}`;
}

/** Resolves one syntax-proven Rust external module from its declaring file. */
function resolveRustDirectExternalModule(
  knownFilePaths: ReadonlySet<string>,
  declaringFilePath: string,
  moduleName: string
): string | null {
  if (!isRustDirectExternalModuleName(moduleName)) {
    return null;
  }
  const normalizedDeclaringPath = declaringFilePath.replace(/\\/gu, "/");
  const directory = rustExternalModuleChildDirectory(normalizedDeclaringPath);
  if (directory === null) {
    return null;
  }
  const moduleBase = directory === "" ? moduleName : `${directory}/${moduleName}`;
  const candidates = [`${moduleBase}.rs`, `${moduleBase}/mod.rs`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (
    candidates.length !== 1 ||
    candidates[0] === undefined ||
    candidates[0] === normalizedDeclaringPath
  ) {
    return null;
  }
  return candidates[0];
}

/**
 * Normalizes persisted v0.118 direct-module facts and accepts v0.119's one
 * nested direct module path. Any malformed persisted shape remains unresolved.
 */
function rustActixImportedServiceConfigModulePath(
  mount: RustActixImportedServiceConfigMountFact
): readonly string[] | null {
  const modulePath = mount.modulePath ?? [mount.moduleName];
  if (
    !Array.isArray(modulePath) ||
    (modulePath.length !== 1 && modulePath.length !== 2) ||
    modulePath[0] !== mount.moduleName ||
    modulePath.some((moduleName) => !isRustDirectExternalModuleName(moduleName))
  ) {
    return null;
  }
  return [...modulePath];
}

/**
 * Resolves every segment of a one- or two-module Actix configuration import.
 * Each hop needs both a direct `mod name;` fact and one physical Rust module
 * candidate, so re-exports and implicit filesystem matches cannot project a
 * route.
 */
function resolveRustDirectExternalModulePath(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly rootFilePath: string;
  readonly modulePath: readonly string[];
}): readonly string[] | null {
  const rootFilePath = input.rootFilePath.replace(/\\/gu, "/");
  if (!isRustCrateRootFile(rootFilePath)) {
    return null;
  }
  const resolutionPath = [rootFilePath];
  let declaringFilePath = rootFilePath;
  for (const moduleName of input.modulePath) {
    const declaringFacts = input.factsByFile.get(declaringFilePath)?.rustActixServiceConfigFacts;
    const directModuleFacts = declaringFacts?.externalModules.filter((module) => module.name === moduleName) ?? [];
    if (directModuleFacts.length !== 1) {
      return null;
    }
    const resolvedFilePath = resolveRustDirectExternalModule(
      input.knownFilePaths,
      declaringFilePath,
      moduleName
    );
    if (resolvedFilePath === null || resolutionPath.includes(resolvedFilePath)) {
      return null;
    }
    resolutionPath.push(resolvedFilePath);
    declaringFilePath = resolvedFilePath;
  }
  return resolutionPath;
}

interface ProjectedRustActixImportedServiceConfigRoute {
  readonly mountFilePath: string;
  readonly configurationFilePath: string;
  readonly mount: RustActixImportedServiceConfigMountFact;
  readonly modulePath: readonly string[];
  readonly importResolutionKind: "local-module" | "cargo-workspace-module";
  readonly configurationPaths: readonly string[];
  readonly resolutionPath: readonly string[];
  readonly configuration: RustActixServiceConfigDeclarationFact;
  readonly route: RustActixServiceConfigRouteFact;
  readonly callback: SymbolNode;
  readonly handler: SymbolNode;
  readonly path: string;
}

function compareProjectedRustActixImportedServiceConfigRoute(
  left: ProjectedRustActixImportedServiceConfigRoute,
  right: ProjectedRustActixImportedServiceConfigRoute
): number {
  return (
    compareStableText(left.mountFilePath, right.mountFilePath) ||
    left.mount.range.start.line - right.mount.range.start.line ||
    left.mount.range.start.column - right.mount.range.start.column ||
    compareStableText(left.configurationFilePath, right.configurationFilePath) ||
    left.configuration.range.start.line - right.configuration.range.start.line ||
    left.configuration.range.start.column - right.configuration.range.start.column ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

function rustActixImportedServiceConfigRoot(input: {
  readonly mount: RustActixImportedServiceConfigMountFact;
  readonly mountFilePath: string;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}): {
  readonly rootFilePath: string;
  readonly configurationPaths: readonly string[];
  readonly importResolutionKind: "local-module" | "cargo-workspace-module";
} | null {
  if (
    input.mount.importRoot === undefined ||
    input.mount.importRoot === "crate" ||
    input.mount.importRoot === "self"
  ) {
    return input.mount.workspaceCrateName === undefined
      ? {
          rootFilePath: input.mountFilePath,
          configurationPaths: [],
          importResolutionKind: "local-module"
        }
      : null;
  }
  if (
    input.mount.importRoot !== "workspace" ||
    input.mount.workspaceCrateName === undefined ||
    !isRustDirectExternalModuleName(input.mount.workspaceCrateName) ||
    input.moduleResolver === undefined
  ) {
    return null;
  }
  const resolution = input.moduleResolver.resolve(input.mountFilePath, input.mount.workspaceCrateName);
  if (
    resolution.strategy !== "cargo-workspace-crate" ||
    resolution.targetFilePath === null ||
    !input.knownFilePaths.has(resolution.targetFilePath) ||
    !(
      resolution.targetFilePath === "src/lib.rs" ||
      resolution.targetFilePath.endsWith("/src/lib.rs")
    )
  ) {
    return null;
  }
  return {
    rootFilePath: resolution.targetFilePath,
    configurationPaths: resolution.configurationPaths,
    importResolutionKind: "cargo-workspace-module"
  };
}

function rustActixImportedServiceConfigRouteRuleId(
  kind: RustActixImportedServiceConfigMountFact["kind"],
  modulePath: readonly string[],
  importResolutionKind: "local-module" | "cargo-workspace-module"
): string {
  const moduleRule =
    importResolutionKind === "cargo-workspace-module"
      ? "cargo-workspace-module"
      : modulePath.length === 1
        ? "direct-module"
        : "direct-module-path";
  return kind === "app"
    ? `framework.actix-web.imported-service-config.app.configure.${moduleRule}.local-function`
    : `framework.actix-web.imported-service-config.web-scope.configure.${moduleRule}.local-function`;
}

interface RustActixImportedServiceConfigRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  /** Raw attribute route symbols replaced by one proven ServiceConfig projection. */
  readonly suppressedRawRouteIds: readonly string[];
}

/**
 * Projects literal routes through an imported Actix Web `ServiceConfig` only
 * when every module hop is directly declared from a Rust crate root. Workspace
 * imports additionally require one Cargo workspace direct-path-dependency
 * proof. Callback and handler must resolve uniquely in the final module.
 */
export function projectRustActixImportedServiceConfigRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly structuralEdges: readonly GraphEdge[];
  readonly moduleResolver: ProjectModuleResolver | undefined;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): RustActixImportedServiceConfigRouteProjection {
  const candidates: ProjectedRustActixImportedServiceConfigRoute[] = [];

  for (const [mountFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const mountFacts = facts.rustActixServiceConfigFacts;
    if (mountFacts === undefined || !isRustCrateRootFile(mountFilePath)) {
      continue;
    }
    for (const mount of [...mountFacts.importedMounts].sort((left, right) => {
      return (
        left.range.start.line - right.range.start.line ||
        left.range.start.column - right.range.start.column ||
        compareStableText(left.moduleName, right.moduleName) ||
        compareStableText(left.configurationName, right.configurationName) ||
        compareStableText(left.prefix, right.prefix) ||
        compareStableText(left.kind, right.kind)
      );
    })) {
      const modulePath = rustActixImportedServiceConfigModulePath(mount);
      if (modulePath === null) {
        continue;
      }
      const importRoot = rustActixImportedServiceConfigRoot({
        mount,
        mountFilePath,
        knownFilePaths: input.knownFilePaths,
        moduleResolver: input.moduleResolver
      });
      if (importRoot === null) {
        continue;
      }
      const moduleResolutionPath = resolveRustDirectExternalModulePath({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        rootFilePath: importRoot.rootFilePath,
        modulePath
      });
      if (moduleResolutionPath === null) {
        continue;
      }
      const resolutionPath =
        importRoot.importResolutionKind === "cargo-workspace-module"
          ? [mountFilePath, ...moduleResolutionPath]
          : moduleResolutionPath;
      const configurationFilePath = resolutionPath.at(-1);
      if (configurationFilePath === undefined) {
        continue;
      }
      const configurationFileFacts = input.factsByFile.get(configurationFilePath);
      const configurationFacts = configurationFileFacts?.rustActixServiceConfigFacts;
      if (configurationFileFacts === undefined || configurationFacts === undefined) {
        continue;
      }
      const matchingConfigurations = configurationFacts.configurations.filter(
        (configuration) => configuration.name === mount.configurationName
      );
      if (matchingConfigurations.length !== 1 || matchingConfigurations[0] === undefined) {
        continue;
      }
      const configuration = matchingConfigurations[0];
      const callbacks = configurationFileFacts.symbols.filter(
        (symbol) =>
          symbol.kind === "function" &&
          symbol.filePath === configurationFilePath &&
          symbol.name === configuration.name &&
          symbol.isExported
      );
      if (callbacks.length !== 1 || callbacks[0] === undefined) {
        continue;
      }
      const callback = callbacks[0];
      if (
        callback.range.start.line !== configuration.range.start.line ||
        callback.range.start.column !== configuration.range.start.column ||
        callback.range.end.line !== configuration.range.end.line ||
        callback.range.end.column !== configuration.range.end.column
      ) {
        continue;
      }

      for (const route of configuration.routes) {
        const handlers = configurationFileFacts.symbols.filter(
          (symbol) =>
            symbol.kind === "function" &&
            symbol.filePath === configurationFilePath &&
            symbol.name === route.handlerName
        );
        if (handlers.length !== 1 || handlers[0] === undefined) {
          continue;
        }
        const path = mountedActixServiceConfigRoutePath(mount.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          mountFilePath,
          configurationFilePath,
          mount,
          modulePath,
          importResolutionKind: importRoot.importResolutionKind,
          configurationPaths: importRoot.configurationPaths,
          resolutionPath,
          configuration,
          route,
          callback,
          handler: handlers[0],
          path
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const suppressedRawRouteIds = new Set<string>();
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedRustActixImportedServiceConfigRoute)) {
    const dedupeKey = [
      candidate.mountFilePath,
      candidate.mount.range.start.line,
      candidate.mount.range.start.column,
      candidate.configurationFilePath,
      candidate.configuration.range.start.line,
      candidate.configuration.range.start.column,
      candidate.route.method,
      candidate.route.path,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.configurationFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.configurationFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.configurationFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.configurationFilePath,
      range: candidate.route.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    structuralEdges.push({
      id: createEdgeId({
        sourceId: file.id,
        targetId: route.id,
        kind: "contains",
        line: candidate.route.range.start.line,
        column: candidate.route.range.start.column,
        referenceName: route.name
      }),
      sourceId: file.id,
      targetId: route.id,
      kind: "contains",
      filePath: candidate.configurationFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: route.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [route.id]
      }
    });
    structuralEdges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: candidate.handler.id,
        kind: "routes",
        line: candidate.route.range.start.line,
        column: candidate.route.range.start.column,
        referenceName: candidate.handler.name
      }),
      sourceId: route.id,
      targetId: candidate.handler.id,
      kind: "routes",
      filePath: candidate.configurationFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        rustActixImportedServiceConfigRouteRuleId(
          candidate.mount.kind,
          candidate.modulePath,
          candidate.importResolutionKind
        ),
        "module",
        [candidate.handler.id, candidate.callback.id],
        candidate.configurationPaths,
        candidate.resolutionPath
      )
    });

    if (!candidate.configuration.mountedAttributeHandlers.includes(candidate.route.handlerName)) {
      continue;
    }
    const rawRouteName = `${candidate.route.method} ${candidate.route.path}`;
    for (const edge of input.structuralEdges) {
      if (
        edge.kind !== "routes" ||
        edge.targetId !== candidate.handler.id ||
        edge.filePath !== candidate.configurationFilePath ||
        edge.evidence?.ruleId !== "framework.actix-web.attribute-route.literal-path.local-function"
      ) {
        continue;
      }
      const rawRoute = input.symbolsById.get(edge.sourceId);
      if (
        rawRoute?.kind === "route" &&
        rawRoute.filePath === candidate.configurationFilePath &&
        rawRoute.name === rawRouteName
      ) {
        suppressedRawRouteIds.add(rawRoute.id);
      }
    }
  }

  return {
    symbols,
    structuralEdges,
    suppressedRawRouteIds: [...suppressedRawRouteIds].sort(compareStableText)
  };
}

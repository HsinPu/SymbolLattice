import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type BindingSpace,
  type FastifyPluginSymbolReference,
  type FrameworkRoutePluginFacts,
  type GraphEdge,
  type NestSymbolReference,
  type PendingReference,
  type RoutePrefixSegment,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  FrameworkProjectPluginOutputError,
  type ValidatedFrameworkProjectRouteProjection
} from "../framework-project-plugins.js";

/** The part of an export candidate required by the exact framework resolvers. */
export interface FrameworkRouteExportCandidate {
  readonly symbol: SymbolNode;
  readonly path: readonly string[];
  readonly configurationPaths: readonly string[];
  readonly isTypeOnly: boolean;
}

export type FrameworkRouteExportSurfaceEntry<
  TExportCandidate extends FrameworkRouteExportCandidate
> = {
  readonly candidates: readonly TExportCandidate[];
  readonly ambiguous: boolean;
};

export type FrameworkRouteExportSurface<
  TExportCandidate extends FrameworkRouteExportCandidate
> = ReadonlyMap<string, FrameworkRouteExportSurfaceEntry<TExportCandidate>>;

export interface FrameworkRouteScopedBindingResolution {
  readonly hasBinding: boolean;
  readonly candidates: readonly SymbolNode[];
}

/**
 * Host-owned operations for lexical and export-surface resolution. Keeping
 * these callbacks injected means this leaf does not copy the host's
 * re-export canonicalization or export-surface implementation.
 */
export interface FrameworkRouteResolverDependencies<
  TExportCandidate extends FrameworkRouteExportCandidate = FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate> = FrameworkRouteExportSurface<TExportCandidate>
> {
  readonly moduleKey: (filePath: string, moduleSpecifier: string) => string;
  readonly resolveScopedBinding: (
    referenceName: string,
    scopeIds: readonly string[],
    localBindings: ExtractedFileFacts["localBindings"],
    symbolsById: ReadonlyMap<string, SymbolNode>,
    expectedSpace?: BindingSpace
  ) => FrameworkRouteScopedBindingResolution;
  readonly canonicalExportCandidates: (
    candidates: readonly TExportCandidate[]
  ) => readonly TExportCandidate[];
  readonly candidatesForExport: (
    exportSurfaces: ReadonlyMap<string, TExportSurface>,
    targetPath: string,
    exportedName: string
  ) => readonly TExportCandidate[];
}

type FrameworkRouteResolverInput<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
> = {
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, TExportSurface>;
  readonly dependencies: FrameworkRouteResolverDependencies<TExportCandidate, TExportSurface>;
};

/** Resolves a static Nest module/controller identifier without project-wide name fallback. */
export function resolveExactNestClassReference<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
>(input: {
  readonly filePath: string;
  readonly reference: NestSymbolReference;
  readonly localBindings: ExtractedFileFacts["localBindings"];
  readonly importBindings: ExtractedFileFacts["importBindings"];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
} & FrameworkRouteResolverInput<TExportCandidate, TExportSurface>): SymbolNode | null {
  const local = input.dependencies.resolveScopedBinding(
    input.reference.name,
    input.reference.scopeIds,
    input.localBindings,
    input.symbolsById,
    "value"
  );
  const localClasses = local.candidates.filter((candidate) => candidate.kind === "class");
  if (local.hasBinding) {
    return localClasses.length === 1 ? localClasses[0] ?? null : null;
  }

  const imports = input.importBindings.filter((binding) => binding.localName === input.reference.name);
  if (imports.length !== 1) {
    return null;
  }

  const binding = imports[0];
  if (binding === undefined || binding.isTypeOnly === true) {
    return null;
  }

  const targetPath = input.moduleTargetPathByKey.get(
    input.dependencies.moduleKey(input.filePath, binding.moduleSpecifier)
  );
  if (targetPath === undefined || input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true) {
    return null;
  }

  const candidates = input.dependencies.canonicalExportCandidates(
    input.dependencies.candidatesForExport(
      input.exportSurfaces,
      targetPath,
      binding.importedName
    ).filter(
      (candidate) => !candidate.isTypeOnly && candidate.symbol.kind === "class"
    )
  );
  return candidates.length === 1 ? candidates[0]?.symbol ?? null : null;
}

export function isFastifyPluginSymbol(symbol: SymbolNode): boolean {
  return symbol.kind === "function" || symbol.kind === "variable";
}

/** Resolves a static Fastify plugin callback through exact lexical/module proof. */
export function resolveExactFastifyPluginReference<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
>(input: {
  readonly filePath: string;
  readonly reference: FastifyPluginSymbolReference;
  readonly localBindings: ExtractedFileFacts["localBindings"];
  readonly importBindings: ExtractedFileFacts["importBindings"];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
} & FrameworkRouteResolverInput<TExportCandidate, TExportSurface>): SymbolNode | null {
  const local = input.dependencies.resolveScopedBinding(
    input.reference.name,
    input.reference.scopeIds,
    input.localBindings,
    input.symbolsById,
    "value"
  );
  const localPlugins = local.candidates.filter(isFastifyPluginSymbol);
  if (local.hasBinding) {
    return localPlugins.length === 1 ? localPlugins[0] ?? null : null;
  }

  const imports = input.importBindings.filter((binding) => binding.localName === input.reference.name);
  if (imports.length !== 1) {
    return null;
  }

  const binding = imports[0];
  if (binding === undefined || binding.isTypeOnly === true) {
    return null;
  }

  const targetPath = input.moduleTargetPathByKey.get(
    input.dependencies.moduleKey(input.filePath, binding.moduleSpecifier)
  );
  if (
    targetPath === undefined ||
    input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true
  ) {
    return null;
  }

  const candidates = input.dependencies.canonicalExportCandidates(
    input.dependencies.candidatesForExport(
      input.exportSurfaces,
      targetPath,
      binding.importedName
    ).filter(
      (candidate) => !candidate.isTypeOnly && isFastifyPluginSymbol(candidate.symbol)
    )
  );
  return candidates.length === 1 ? candidates[0]?.symbol ?? null : null;
}

export interface ResolvedFrameworkRoutePluginReceiver {
  readonly symbol: SymbolNode;
  readonly resolutionPath: readonly string[];
  readonly configurationPaths: readonly string[];
}

export function resolveExactFrameworkRoutePluginReceiver<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
>(input: {
  readonly filePath: string;
  readonly reference: FastifyPluginSymbolReference;
  readonly frameworkId: string;
  readonly facts: ExtractedFileFacts;
  readonly receiverFrameworkById: ReadonlyMap<string, string>;
} & FrameworkRouteResolverInput<TExportCandidate, TExportSurface>): ResolvedFrameworkRoutePluginReceiver | null {
  const imports = input.facts.importBindings.filter(
    (binding) => binding.localName === input.reference.name && binding.isTypeOnly !== true
  );
  if (imports.length !== 1 || imports[0] === undefined) {
    return null;
  }
  const binding = imports[0];
  const targetPath = input.moduleTargetPathByKey.get(
    input.dependencies.moduleKey(input.filePath, binding.moduleSpecifier)
  );
  if (
    targetPath === undefined ||
    input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true
  ) {
    return null;
  }
  const candidates = input.dependencies.canonicalExportCandidates(
    input.dependencies.candidatesForExport(
      input.exportSurfaces,
      targetPath,
      binding.importedName
    ).filter(
      (candidate) =>
        !candidate.isTypeOnly &&
        input.receiverFrameworkById.get(candidate.symbol.id) === input.frameworkId
    )
  );
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  return candidate === undefined
    ? null
    : {
        symbol: candidate.symbol,
        resolutionPath: [input.filePath, ...candidate.path],
        configurationPaths: candidate.configurationPaths
      };
}

interface FrameworkRoutePluginMountObservation {
  readonly fact: FrameworkRoutePluginFacts["importedMounts"][number];
  readonly resolutionPath: readonly string[];
  readonly configurationPaths: readonly string[];
}

export interface FrameworkRoutePluginProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly references: readonly PendingReference[];
  readonly referenceScopes: ReadonlyMap<string, readonly string[]>;
  readonly suppressedRawRouteIds: readonly string[];
  readonly suppressedRawReferenceIds: readonly string[];
}

export function projectFrameworkRoutePluginImportedMounts<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
>(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referencesById: ReadonlyMap<string, PendingReference>;
  readonly referenceScopeIdsByReferenceId: ReadonlyMap<string, readonly string[]>;
} & FrameworkRouteResolverInput<TExportCandidate, TExportSurface>): FrameworkRoutePluginProjection {
  const receiverFrameworkById = new Map<string, string>();
  for (const facts of input.factsByFile.values()) {
    for (const receiver of facts.frameworkRoutePluginFacts?.receivers ?? []) {
      receiverFrameworkById.set(receiver.receiverId, receiver.frameworkId);
    }
  }

  const mountsByChildReceiverId = new Map<string, FrameworkRoutePluginMountObservation[]>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const mount of facts.frameworkRoutePluginFacts?.importedMounts ?? []) {
      const target = resolveExactFrameworkRoutePluginReceiver<TExportCandidate, TExportSurface>({
        filePath,
        reference: mount.child,
        frameworkId: mount.frameworkId,
        facts,
        receiverFrameworkById,
        moduleTargetPathByKey: input.moduleTargetPathByKey,
        exportSurfaces: input.exportSurfaces,
        dependencies: input.dependencies
      });
      if (target === null) {
        continue;
      }
      const observations = mountsByChildReceiverId.get(target.symbol.id) ?? [];
      observations.push({
        fact: mount,
        resolutionPath: target.resolutionPath,
        configurationPaths: target.configurationPaths
      });
      mountsByChildReceiverId.set(target.symbol.id, observations);
    }
  }

  interface ResolvedMountChain {
    readonly segments: readonly RoutePrefixSegment[];
    readonly resolutionPath: readonly string[];
  }
  const chainByReceiverId = new Map<string, ResolvedMountChain | null>();
  const resolveChain = (receiverId: string, seen = new Set<string>()): ResolvedMountChain | null => {
    if (chainByReceiverId.has(receiverId)) {
      return chainByReceiverId.get(receiverId) ?? null;
    }
    if (seen.has(receiverId)) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    const observations = mountsByChildReceiverId.get(receiverId);
    if (observations === undefined) {
      return { segments: [], resolutionPath: [] };
    }
    const observation = observations.length === 1 ? observations[0] : undefined;
    if (observation === undefined || observation.fact.segment === null) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    // An imported mount's local parent is a root for this project-level chain.
    // A receiver may itself be mounted elsewhere; that outer proof is followed first.
    const outer =
      receiverFrameworkById.get(observation.fact.parentReceiverId) !== observation.fact.frameworkId
        ? null
        : resolveChain(observation.fact.parentReceiverId, new Set([...seen, receiverId]));
    if (outer === null || outer.segments.length >= 16) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    const resolved = {
      segments: [...outer.segments, observation.fact.segment],
      resolutionPath: [...outer.resolutionPath, ...observation.resolutionPath]
    };
    chainByReceiverId.set(receiverId, resolved);
    return resolved;
  };

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const references: PendingReference[] = [];
  const referenceScopes = new Map<string, readonly string[]>();
  const suppressedRawRouteIds = new Set<string>();
  const suppressedRawReferenceIds = new Set<string>();

  for (const facts of input.factsByFile.values()) {
    for (const route of facts.frameworkRoutePluginFacts?.routes ?? []) {
      if (!mountsByChildReceiverId.has(route.receiverId)) {
        continue;
      }
      suppressedRawRouteIds.add(route.routeId);
      suppressedRawReferenceIds.add(route.referenceId);
      const chain = resolveChain(route.receiverId);
      if (
        chain === null ||
        chain.segments.length + route.routePrefixChain.length > 16 ||
        route.path === "/"
      ) {
        continue;
      }
      const rawRoute = input.symbolsById.get(route.routeId);
      const rawReference = input.referencesById.get(route.referenceId);
      const file = rawRoute === undefined ? undefined : input.fileSymbols.get(rawRoute.filePath);
      if (rawRoute === undefined || rawReference === undefined || file === undefined) {
        continue;
      }
      const segments = [...chain.segments, ...route.routePrefixChain];
      const path = `${chain.segments.map((segment) => segment.prefix).join("")}${route.path}`;
      const name = `${route.method} ${path}`;
      const qualifiedName = `${rawRoute.filePath}#route:${name}`;
      const projected: SymbolNode = {
        ...rawRoute,
        id: createSymbolId({
          filePath: rawRoute.filePath,
          qualifiedName,
          kind: "route",
          declarationOrdinal: rawRoute.declarationOrdinal
        }),
        name,
        qualifiedName
      };
      symbols.push(projected);
      structuralEdges.push({
        id: createEdgeId({
          sourceId: file.id,
          targetId: projected.id,
          kind: "contains",
          line: projected.range.start.line,
          column: projected.range.start.column,
          referenceName: projected.name
        }),
        sourceId: file.id,
        targetId: projected.id,
        kind: "contains",
        filePath: projected.filePath,
        range: projected.range,
        resolution: "exact",
        confidence: 1,
        referenceName: projected.name,
        evidence: { ruleId: "syntax.containment", stage: "syntax", candidateSymbolIds: [projected.id] }
      });
      const reference: PendingReference = {
        ...rawReference,
        id: createEdgeId({
          sourceId: projected.id,
          targetId: null,
          kind: rawReference.relationKind,
          line: rawReference.range.start.line,
          column: rawReference.range.start.column,
          referenceName: rawReference.referenceName
        }),
        sourceId: projected.id,
        routeRegistration:
          segments.length === 1
            ? "plugin-imported-literal-prefix-mount"
            : "plugin-imported-literal-prefix-chain",
        routePrefixChain: segments,
        routeResolutionPath: chain.resolutionPath
      };
      references.push(reference);
      referenceScopes.set(
        reference.id,
        input.referenceScopeIdsByReferenceId.get(rawReference.id) ?? []
      );
    }
  }

  return {
    symbols,
    structuralEdges,
    references,
    referenceScopes,
    suppressedRawRouteIds: [...suppressedRawRouteIds],
    suppressedRawReferenceIds: [...suppressedRawReferenceIds]
  };
}

function routePathFromSymbol(route: SymbolNode): string | null {
  const separator = route.name.indexOf(" ");
  if (separator <= 0) {
    return null;
  }

  const path = route.name.slice(separator + 1);
  return path.startsWith("/") ? path : null;
}

function nestPathPart(path: string): string {
  return path.replace(/^\/+|\/+$/gu, "");
}

function joinNestRouterPath(prefix: string, routePath: string): string {
  const parts = [nestPathPart(prefix), nestPathPart(routePath)].filter((part) => part.length > 0);
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

interface ProjectedNestRoute {
  readonly sourceRoute: SymbolNode;
  readonly route: SymbolNode;
  readonly controllerIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly prefixApplied: boolean;
  readonly projectPlugin?: ValidatedFrameworkProjectRouteProjection["projectPlugin"];
  readonly routePrefixChain?: readonly RoutePrefixSegment[];
}

export interface NestRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>;
}

function projectedRouteSort(left: ProjectedNestRoute, right: ProjectedNestRoute): number {
  return (
    compareStableText(left.sourceRoute.filePath, right.sourceRoute.filePath) ||
    left.sourceRoute.range.start.line - right.sourceRoute.range.start.line ||
    left.sourceRoute.range.start.column - right.sourceRoute.range.start.column ||
    compareStableText(left.route.name, right.route.name) ||
    Number(left.prefixApplied) - Number(right.prefixApplied) ||
    compareStableText(left.sourceRoute.id, right.sourceRoute.id) ||
    compareStableText(left.moduleIds.join("\u0001"), right.moduleIds.join("\u0001"))
  );
}

function projectedRouteSymbol(route: SymbolNode, path: string, declarationOrdinal: number): SymbolNode {
  const methodSeparator = route.name.indexOf(" ");
  const method = route.name.slice(0, methodSeparator);
  const name = `${method} ${path}`;
  const routeQualifiedNamePrefix = `${route.filePath}#route:${route.name}`;
  const routeIdentitySuffix = route.qualifiedName.startsWith(routeQualifiedNamePrefix)
    ? route.qualifiedName.slice(routeQualifiedNamePrefix.length)
    : "";
  const qualifiedName = `${route.filePath}#route:${name}${routeIdentitySuffix}`;
  return {
    ...route,
    id: createSymbolId({
      filePath: route.filePath,
      qualifiedName,
      kind: "route",
      declarationOrdinal
    }),
    name,
    qualifiedName,
    declarationOrdinal
  };
}

function projectedRouteEdge(
  edge: GraphEdge,
  source: ProjectedNestRoute | undefined,
  target: ProjectedNestRoute | undefined
): GraphEdge {
  const sourceId = source?.route.id ?? edge.sourceId;
  const targetId = target?.route.id ?? edge.targetId;
  const referenceName =
    edge.kind === "contains" && target !== undefined ? target.route.name : edge.referenceName;
  const evidence =
    edge.kind === "contains" && target !== undefined
      ? edge.evidence?.ruleId ===
        "language.ruby.v1_6_1.rails.direct-routes-draw.literal-registration.containment"
        ? {
            ruleId: edge.evidence.ruleId,
            stage: edge.evidence.stage,
            candidateSymbolIds: [target.route.id]
          }
        : {
            ruleId: "syntax.containment",
            stage: "syntax" as const,
            candidateSymbolIds: [target.route.id]
          }
      : edge.kind === "routes" && source?.prefixApplied === true
      ? {
          ruleId:
            source.projectPlugin === undefined
              ? "framework.nestjs.router-module.exact-prefix"
              : `framework.project-plugin.${source.projectPlugin.pluginId}.exact-route-prefix`,
          stage: "module" as const,
          candidateSymbolIds: [
            ...(edge.targetId === null ? [] : [edge.targetId]),
            ...source.controllerIds,
            ...source.moduleIds
          ].sort(compareStableText),
          ...(edge.evidence?.routeDomain === undefined
            ? {}
            : { routeDomain: edge.evidence.routeDomain }),
          ...(source.projectPlugin === undefined ? {} : { projectPlugin: source.projectPlugin }),
          ...(source.routePrefixChain === undefined
            ? {}
            : { routePrefixChain: source.routePrefixChain })
        }
      : edge.evidence;

  return {
    ...edge,
    id: createEdgeId({
      sourceId,
      targetId,
      kind: edge.kind,
      line: edge.range.start.line,
      column: edge.range.start.column,
      referenceName
    }),
    sourceId,
    targetId,
    referenceName,
    ...(evidence === undefined ? {} : { evidence })
  };
}

export function projectEdgesThroughRoutes(
  edges: readonly GraphEdge[],
  projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>
): readonly GraphEdge[] {
  return edges.flatMap((edge) => {
    const sources = projectionsBySourceRouteId.get(edge.sourceId) ?? [undefined];
    const targets =
      edge.targetId === null
        ? [undefined]
        : projectionsBySourceRouteId.get(edge.targetId) ?? [undefined];
    return sources.flatMap((source) =>
      targets.map((target) => projectedRouteEdge(edge, source, target))
    );
  });
}

export function projectPendingReferencesThroughRoutes(
  references: readonly PendingReference[],
  projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>
): readonly PendingReference[] {
  return references.flatMap((reference) => {
    const sources = projectionsBySourceRouteId.get(reference.sourceId) ?? [undefined];
    return sources.map((source) => {
      if (source === undefined) {
        return reference;
      }
      const sourceId = source.route.id;
      return {
        ...reference,
        id: createEdgeId({
          sourceId,
          targetId: null,
          kind: reference.relationKind,
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId
      };
    });
  });
}

export function projectNestRouterRoutes<
  TExportCandidate extends FrameworkRouteExportCandidate,
  TExportSurface extends FrameworkRouteExportSurface<TExportCandidate>
>(input: {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly localBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["localBindings"]>;
  readonly importBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["importBindings"]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly frameworkRouteProjections: readonly ValidatedFrameworkProjectRouteProjection[];
} & FrameworkRouteResolverInput<TExportCandidate, TExportSurface>): NestRouteProjection {
  const routeControllerIds = new Map<string, Set<string>>();
  const controllerModuleIds = new Map<string, Set<string>>();
  const modulePrefixes = new Map<string, Set<string>>();
  const nestReference = (filePath: string, reference: NestSymbolReference): SymbolNode | null =>
    resolveExactNestClassReference<TExportCandidate, TExportSurface>({
      filePath,
      reference,
      localBindings: input.localBindingsByFile.get(filePath) ?? [],
      importBindings: input.importBindingsByFile.get(filePath) ?? [],
      symbolsById: input.symbolsById,
      moduleTargetPathByKey: input.moduleTargetPathByKey,
      exportSurfaces: input.exportSurfaces,
      dependencies: input.dependencies
    });
  const frameworkProjectionsByRouteId = new Map<string, ValidatedFrameworkProjectRouteProjection[]>();
  for (const projection of input.frameworkRouteProjections) {
    const entries = frameworkProjectionsByRouteId.get(projection.sourceRouteSymbolId) ?? [];
    entries.push(projection);
    frameworkProjectionsByRouteId.set(projection.sourceRouteSymbolId, entries);
  }

  for (const [filePath, facts] of input.factsByFile) {
    const nestFacts = facts.nestRouteFacts;
    if (nestFacts === undefined) {
      continue;
    }

    for (const binding of nestFacts.routeControllers) {
      const controller = input.symbolsById.get(binding.controllerId);
      if (controller?.kind !== "class" || !input.symbolsById.has(binding.routeId)) {
        continue;
      }
      const controllers = routeControllerIds.get(binding.routeId) ?? new Set<string>();
      controllers.add(controller.id);
      routeControllerIds.set(binding.routeId, controllers);
    }

    for (const binding of nestFacts.moduleControllers) {
      const module = input.symbolsById.get(binding.moduleId);
      const controller = nestReference(filePath, binding.controller);
      if (module?.kind !== "class" || controller?.kind !== "class") {
        continue;
      }
      const modules = controllerModuleIds.get(controller.id) ?? new Set<string>();
      modules.add(module.id);
      controllerModuleIds.set(controller.id, modules);
    }

    for (const binding of nestFacts.routerModulePrefixes) {
      const module = nestReference(filePath, binding.module);
      if (module?.kind !== "class") {
        continue;
      }
      const prefixes = modulePrefixes.get(module.id) ?? new Set<string>();
      prefixes.add(binding.prefix);
      modulePrefixes.set(module.id, prefixes);
    }
  }

  const projections: ProjectedNestRoute[] = [];
  for (const sourceRoute of input.symbols.filter((symbol) => symbol.kind === "route")) {
    const localPath = routePathFromSymbol(sourceRoute);
    const controllerIds = [...(routeControllerIds.get(sourceRoute.id) ?? [])].sort(compareStableText);
    const frameworkProjections = frameworkProjectionsByRouteId.get(sourceRoute.id) ?? [];
    if (frameworkProjections.length > 0) {
      const hasNestProjection = controllerIds.some((controllerId) =>
        [...(controllerModuleIds.get(controllerId) ?? [])].some(
          (moduleId) => (modulePrefixes.get(moduleId)?.size ?? 0) > 0
        )
      );
      if (hasNestProjection) {
        const owner = frameworkProjections[0]?.projectPlugin;
        throw new FrameworkProjectPluginOutputError(
          `Framework project plugin ${owner?.pluginId}@${owner?.pluginVersion}: route projection conflicts with the built-in NestJS RouterModule projection for ${sourceRoute.id}.`
        );
      }
      if (localPath === null) {
        const owner = frameworkProjections[0]?.projectPlugin;
        throw new FrameworkProjectPluginOutputError(
          `Framework project plugin ${owner?.pluginId}@${owner?.pluginVersion}: route projection source ${sourceRoute.id} has no canonical route path.`
        );
      }
      const projectedPaths = new Set<string>();
      for (const frameworkProjection of frameworkProjections) {
        const path: string = frameworkProjection.prefixChain.reduceRight<string>(
          (projectedPath, segment) => joinNestRouterPath(segment.prefix, projectedPath),
          localPath
        );
        if (path === localPath || projectedPaths.has(path)) {
          throw new FrameworkProjectPluginOutputError(
            `Framework project plugin ${frameworkProjection.projectPlugin.pluginId}@${frameworkProjection.projectPlugin.pluginVersion}: route projection for ${sourceRoute.id} must produce a unique changed path.`
          );
        }
        projectedPaths.add(path);
        projections.push({
          sourceRoute,
          route: projectedRouteSymbol(sourceRoute, path, sourceRoute.declarationOrdinal),
          controllerIds: [],
          moduleIds: [],
          prefixApplied: true,
          projectPlugin: frameworkProjection.projectPlugin,
          routePrefixChain: frameworkProjection.prefixChain
        });
      }
      continue;
    }
    if (localPath === null || controllerIds.length === 0) {
      projections.push({
        sourceRoute,
        route: sourceRoute,
        controllerIds: [],
        moduleIds: [],
        prefixApplied: false
      });
      continue;
    }

    const modules = [...new Set(controllerIds.flatMap((controllerId) => [...(controllerModuleIds.get(controllerId) ?? [])]))]
      .sort(compareStableText);
    const prefixedByPath = new Map<string, Set<string>>();
    let preserveLocalRoute = modules.length === 0;
    for (const moduleId of modules) {
      const prefixes = modulePrefixes.get(moduleId);
      if (prefixes === undefined || prefixes.size === 0) {
        preserveLocalRoute = true;
        continue;
      }
      for (const prefix of prefixes) {
        const path = joinNestRouterPath(prefix, localPath);
        const routeModules = prefixedByPath.get(path) ?? new Set<string>();
        routeModules.add(moduleId);
        prefixedByPath.set(path, routeModules);
      }
    }

    if (preserveLocalRoute) {
      projections.push({
        sourceRoute,
        route: sourceRoute,
        controllerIds,
        moduleIds: [],
        prefixApplied: false
      });
    }
    for (const [path, moduleIds] of [...prefixedByPath.entries()].sort(([left], [right]) =>
      compareStableText(left, right)
    )) {
      projections.push({
        sourceRoute,
        route: projectedRouteSymbol(sourceRoute, path, sourceRoute.declarationOrdinal),
        controllerIds,
        moduleIds: [...moduleIds].sort(compareStableText),
        prefixApplied: true
      });
    }
  }

  const ordinalByQualifiedName = new Map<string, number>();
  const normalizedProjections = projections
    .sort(projectedRouteSort)
    .map((projection) => {
      const ordinalKey = `${projection.route.filePath}\u0000${projection.route.qualifiedName}`;
      const declarationOrdinal = ordinalByQualifiedName.get(ordinalKey) ?? 0;
      ordinalByQualifiedName.set(ordinalKey, declarationOrdinal + 1);
      return {
        ...projection,
        route: projectedRouteSymbol(
          projection.sourceRoute,
          routePathFromSymbol(projection.route) ?? routePathFromSymbol(projection.sourceRoute) ?? "/",
          declarationOrdinal
        )
      };
    });
  const projectionsBySourceRouteId = new Map<string, ProjectedNestRoute[]>();
  for (const projection of normalizedProjections) {
    const entries = projectionsBySourceRouteId.get(projection.sourceRoute.id) ?? [];
    entries.push(projection);
    projectionsBySourceRouteId.set(projection.sourceRoute.id, entries);
  }

  const structuralEdges = projectEdgesThroughRoutes(input.structuralEdges, projectionsBySourceRouteId);
  return {
    symbols: [
      ...input.symbols.filter((symbol) => symbol.kind !== "route"),
      ...normalizedProjections.map((projection) => projection.route)
    ],
    structuralEdges,
    projectionsBySourceRouteId
  };
}

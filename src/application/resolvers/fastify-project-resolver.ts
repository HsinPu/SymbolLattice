import { compareStableText, createEdgeId, createSymbolId, type FastifyPluginRouteFact, type FastifyPluginSymbolReference, type GraphEdge, type PendingReference, type SourceRange, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

function fastifyImportedPluginPath(prefix: string, routePath: string): string | null {
  if (
    !prefix.startsWith("/") ||
    prefix.length <= 1 ||
    prefix.endsWith("/") ||
    !routePath.startsWith("/") ||
    routePath === "/"
  ) {
    return null;
  }
  return `${prefix}${routePath}`;
}

interface ResolvedFastifyPluginRegistration {
  readonly filePath: string;
  readonly pluginId: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

interface ProjectedFastifyPluginRoute {
  readonly filePath: string;
  readonly pluginId: string;
  readonly route: FastifyPluginRouteFact;
  readonly path: string;
}

function compareFastifyPluginRegistration(
  left: ResolvedFastifyPluginRegistration,
  right: ResolvedFastifyPluginRegistration
): number {
  return (
    compareStableText(left.filePath, right.filePath) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.column - right.range.start.column ||
    compareStableText(left.pluginId, right.pluginId) ||
    compareStableText(left.prefix, right.prefix)
  );
}

function compareProjectedFastifyPluginRoute(
  left: ProjectedFastifyPluginRoute,
  right: ProjectedFastifyPluginRoute
): number {
  return (
    compareStableText(left.filePath, right.filePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.route.handler.name, right.route.handler.name) ||
    compareStableText(left.pluginId, right.pluginId)
  );
}

interface FastifyImportedPluginRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly references: readonly PendingReference[];
  readonly referenceScopes: ReadonlyMap<string, readonly string[]>;
}

/**
 * Projects literal routes declared in another Fastify plugin module through
 * direct root and nested static registrations. Each plugin identifier and
 * handler is resolved through lexical/module facts; a recursive plugin edge
 * is simply not expanded again, so a cyclic source graph cannot manufacture
 * an unbounded set of synthetic routes.
 */
export function projectFastifyImportedPluginRoutes<TExportSurface>(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly localBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["localBindings"]>;
  readonly importBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["importBindings"]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, TExportSurface>;
}, resolveExactFastifyPluginReference: (input: {
  readonly filePath: string;
  readonly reference: FastifyPluginSymbolReference;
  readonly localBindings: ExtractedFileFacts["localBindings"];
  readonly importBindings: ExtractedFileFacts["importBindings"];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, TExportSurface>;
}) => SymbolNode | null, isFastifyPluginSymbol: (symbol: SymbolNode) => boolean): FastifyImportedPluginRouteProjection {
  const routesByPluginId = new Map<string, { readonly filePath: string; readonly route: FastifyPluginRouteFact }[]>();
  const childrenByPluginId = new Map<string, ResolvedFastifyPluginRegistration[]>();
  const rootRegistrations: ResolvedFastifyPluginRegistration[] = [];
  const pluginReference = (
    filePath: string,
    reference: FastifyPluginSymbolReference
  ): SymbolNode | null =>
    resolveExactFastifyPluginReference({
      filePath,
      reference,
      localBindings: input.localBindingsByFile.get(filePath) ?? [],
      importBindings: input.importBindingsByFile.get(filePath) ?? [],
      symbolsById: input.symbolsById,
      moduleTargetPathByKey: input.moduleTargetPathByKey,
      exportSurfaces: input.exportSurfaces
    });

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const pluginFacts = facts.fastifyPluginFacts;
    if (pluginFacts === undefined) {
      continue;
    }

    for (const route of pluginFacts.routes) {
      const plugin = input.symbolsById.get(route.pluginId);
      if (plugin === undefined || !isFastifyPluginSymbol(plugin)) {
        continue;
      }
      const routes = routesByPluginId.get(plugin.id) ?? [];
      routes.push({ filePath, route });
      routesByPluginId.set(plugin.id, routes);
    }

    for (const registration of pluginFacts.childRegistrations) {
      const child = pluginReference(filePath, registration.plugin);
      const parent = input.symbolsById.get(registration.parentPluginId);
      if (child === null || parent === undefined || !isFastifyPluginSymbol(parent)) {
        continue;
      }
      const children = childrenByPluginId.get(parent.id) ?? [];
      children.push({
        filePath,
        pluginId: child.id,
        prefix: registration.prefix,
        range: registration.plugin.range
      });
      childrenByPluginId.set(parent.id, children);
    }

    for (const registration of pluginFacts.rootRegistrations) {
      const plugin = pluginReference(filePath, registration.plugin);
      if (plugin === null) {
        continue;
      }
      rootRegistrations.push({
        filePath,
        pluginId: plugin.id,
        prefix: registration.prefix,
        range: registration.plugin.range
      });
    }
  }

  const candidates: ProjectedFastifyPluginRoute[] = [];
  const visitPlugin = (pluginId: string, prefix: string, ancestry: ReadonlySet<string>): void => {
    if (ancestry.has(pluginId)) {
      return;
    }
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(pluginId);

    for (const entry of routesByPluginId.get(pluginId) ?? []) {
      const path = fastifyImportedPluginPath(prefix, entry.route.path);
      if (path !== null) {
        candidates.push({ filePath: entry.filePath, pluginId, route: entry.route, path });
      }
    }

    for (const child of [...(childrenByPluginId.get(pluginId) ?? [])].sort(compareFastifyPluginRegistration)) {
      const childPrefix = `${prefix}${child.prefix}`;
      visitPlugin(child.pluginId, childPrefix, nextAncestry);
    }
  };

  for (const registration of [...rootRegistrations].sort(compareFastifyPluginRegistration)) {
    visitPlugin(registration.pluginId, registration.prefix, new Set());
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const references: PendingReference[] = [];
  const referenceScopes = new Map<string, readonly string[]>();
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedFastifyPluginRoute)) {
    const dedupeKey = [
      candidate.pluginId,
      candidate.filePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.route.method,
      candidate.path,
      candidate.route.handler.name
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.filePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.filePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.filePath,
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
      filePath: candidate.filePath,
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

    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: candidate.route.handler.range.start.line,
        column: candidate.route.handler.range.start.column,
        referenceName: candidate.route.handler.name
      }),
      sourceId: route.id,
      filePath: candidate.filePath,
      referenceName: candidate.route.handler.name,
      relationKind: "routes",
      routeFramework: "fastify",
      routeRegistration: "fastify-imported-plugin-prefix",
      range: candidate.route.handler.range
    };
    references.push(reference);
    referenceScopes.set(reference.id, candidate.route.handler.scopeIds);
  }

  return { symbols, structuralEdges, references, referenceScopes };
}

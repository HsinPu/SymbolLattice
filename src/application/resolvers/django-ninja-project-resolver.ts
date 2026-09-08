import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type DjangoNinjaImportedRouterInclusionFact,
  type DjangoNinjaRouterDeclarationFact,
  type DjangoNinjaRouterReExportFact,
  type DjangoNinjaRouterRouteFact,
  type EdgeEvidence,
  type GraphEdge,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  compactPythonModuleResolutionPath,
  mountedPythonRoutePathParts,
  resolvePythonAbsoluteModule,
  resolvePythonRelativeModule
} from "./python-route-projector-helpers.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ResolvedDjangoNinjaRouterTarget {
  readonly filePath: string;
  readonly router: DjangoNinjaRouterDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directDjangoNinjaRouterTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedDjangoNinjaRouterTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.djangoNinjaRouterFacts;
  if (facts === undefined) {
    return [];
  }
  return facts.routers
    .filter((router) => router.name === input.name)
    .map((router) => ({
      filePath: input.filePath,
      router,
      resolutionPath: [input.filePath],
      reExported: false,
      absoluteReExported: false
    }));
}

/**
 * Resolves a direct Django Ninja Router or one final `__init__.py` re-export
 * chain. Every hop is a persisted single-name relative or project-absolute
 * import, and a cycle or competing local/exported binding remains unresolved.
 */
function resolveExactDjangoNinjaRouterTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedDjangoNinjaRouterTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.djangoNinjaRouterFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directDjangoNinjaRouterTargets(input);
  const reExports = (facts.reExports ?? []).filter((reExport) => reExport.exportedName === input.name);
  if (directTargets.length + reExports.length !== 1) {
    return null;
  }
  if (directTargets[0] !== undefined) {
    return directTargets[0];
  }
  const reExport: DjangoNinjaRouterReExportFact | undefined = reExports[0];
  if (reExport === undefined) {
    return null;
  }
  const targetFilePath = resolveDjangoNinjaRouterModule({
    knownFilePaths: input.knownFilePaths,
    fromFilePath: input.filePath,
    moduleSpecifier: reExport.moduleSpecifier,
    moduleSpecifierKind: reExport.moduleSpecifierKind
  });
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactDjangoNinjaRouterTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedRouterName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([
          input.filePath,
          ...target.resolutionPath
        ]),
        reExported: true,
        absoluteReExported:
          target.absoluteReExported || reExport.moduleSpecifierKind === "absolute"
      };
}

interface ProjectedDjangoNinjaImportedRouterRoute {
  readonly inclusionFilePath: string;
  readonly routerFilePath: string;
  readonly inclusion: DjangoNinjaImportedRouterInclusionFact;
  readonly route: DjangoNinjaRouterRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedDjangoNinjaImportedRouterRoute(
  left: ProjectedDjangoNinjaImportedRouterRoute,
  right: ProjectedDjangoNinjaImportedRouterRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.routerFilePath, right.routerFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.source, right.route.source) ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface DjangoNinjaImportedRouterRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Resolves the deliberately narrow Django Ninja Router module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveDjangoNinjaRouterModule(input: {
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fromFilePath: string;
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute" | undefined;
}): string | null {
  switch (input.moduleSpecifierKind) {
    case undefined:
    case "relative":
      return resolvePythonRelativeModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    case "absolute":
      return resolvePythonAbsoluteModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    default:
      return null;
  }
}

function djangoNinjaImportedRouterRulePrefix(input: {
  readonly inclusion: DjangoNinjaImportedRouterInclusionFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.inclusion.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.django-ninja.project-absolute-reexported-router"
      : "framework.django-ninja.project-absolute-router";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.django-ninja.reexported-absolute-router"
      : "framework.django-ninja.reexported-router";
  }
  return "framework.django-ninja.imported-router";
}

/**
 * Projects literal handler routes declared on a statically imported Django
 * Ninja Router. The resolver accepts only a unique, final Router declaration
 * inside a regular package, so every projected path has an auditable module hop.
 */
export function projectDjangoNinjaImportedRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): DjangoNinjaImportedRouterRouteProjection {
  const { referenceEvidence } = input;
  const candidates: ProjectedDjangoNinjaImportedRouterRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.djangoNinjaRouterFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    for (const inclusion of inclusionFacts.importedRouterInclusions) {
      const importedRouterFilePath = resolveDjangoNinjaRouterModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: inclusionFilePath,
        moduleSpecifier: inclusion.moduleSpecifier,
        moduleSpecifierKind: inclusion.moduleSpecifierKind
      });
      if (importedRouterFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoNinjaRouterTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedRouterFilePath,
        name: inclusion.importedRouterName
      });
      if (target === null) {
        continue;
      }
      const routerFacts = input.factsByFile.get(target.filePath)?.djangoNinjaRouterFacts;
      if (routerFacts === undefined) {
        continue;
      }

      for (const route of routerFacts.routes) {
        if (route.routerName !== target.router.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== target.filePath) {
          continue;
        }
        const path = mountedPythonRoutePathParts([inclusion.prefix, route.path]);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          routerFilePath: target.filePath,
          inclusion,
          route,
          handler,
          path,
          resolutionPath: target.resolutionPath,
          reExported: target.reExported,
          absoluteReExported: target.absoluteReExported
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedDjangoNinjaImportedRouterRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.routerFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.route.source,
      candidate.route.method,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.routerFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.routerFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.routerFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        `${djangoNinjaImportedRouterRulePrefix(candidate)}.add-router.${
          candidate.route.source === "api-operation" ? "api-operation" : "decorator"
        }.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

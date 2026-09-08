import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type DjangoImportedUrlconfInclusionFact,
  type DjangoLiteralUrlconfInclusionFact,
  type DjangoUrlconfInclusionFactory,
  type DjangoUrlPatternHandlerKind,
  type DjangoUrlPatternRouteFact,
  type EdgeEvidence,
  type GraphEdge,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  compactPythonModuleResolutionPath,
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

function isStaticDjangoUrlPatternPath(value: string): boolean {
  return value.startsWith("/") && !value.includes("\\") && !value.includes("//");
}

interface ResolvedDjangoUrlconfTarget {
  readonly filePath: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

function directDjangoUrlconfTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedDjangoUrlconfTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.djangoUrlFacts;
  if (
    facts === undefined ||
    facts.hasUrlpatterns !== true ||
    (input.name !== "urls" && input.name !== "urlpatterns")
  ) {
    return [];
  }
  return [
    {
      filePath: input.filePath,
      resolutionPath: [input.filePath],
      reExported: false
    }
  ];
}

/**
 * Resolves a direct Django URLConf or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative import, and a cycle or any
 * competing direct/exported binding remains unresolved.
 */
function resolveExactDjangoUrlconfTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedDjangoUrlconfTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.djangoUrlFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directDjangoUrlconfTargets(input);
  const reExports = (facts.reExports ?? []).filter((reExport) => reExport.exportedName === input.name);
  if (directTargets.length + reExports.length !== 1) {
    return null;
  }
  if (directTargets[0] !== undefined) {
    return directTargets[0];
  }
  const reExport = reExports[0];
  if (reExport === undefined) {
    return null;
  }
  const targetFilePath = resolvePythonRelativeModule(
    input.knownFilePaths,
    input.filePath,
    reExport.moduleSpecifier
  );
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactDjangoUrlconfTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedUrlconfName,
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
        reExported: true
      };
}

function mountedDjangoUrlconfRoutePath(prefix: string, routePath: string): string | null {
  if (!isStaticDjangoUrlPatternPath(prefix) || !isStaticDjangoUrlPatternPath(routePath)) {
    return null;
  }
  const normalizedPrefix = prefix === "/" ? "" : prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${normalizedPrefix}${routePath}`;
}

type DjangoUrlconfInclusionFact =
  | DjangoImportedUrlconfInclusionFact
  | DjangoLiteralUrlconfInclusionFact;

function djangoUrlconfInclusionFactory(
  inclusion: DjangoUrlconfInclusionFact
): DjangoUrlconfInclusionFactory {
  return inclusion.factory ?? "path";
}

function djangoUrlPatternHandlerKind(
  route: DjangoUrlPatternRouteFact
): DjangoUrlPatternHandlerKind {
  return route.handlerKind ?? "function";
}

function djangoUrlconfInclusionRuleId(
  inclusion: DjangoUrlconfInclusionFact,
  reExported: boolean,
  handlerKind: DjangoUrlPatternHandlerKind
): EdgeEvidence["ruleId"] {
  const factory = djangoUrlconfInclusionFactory(inclusion);
  const factorySegment = factory === "re_path" ? "re-path" : factory;
  const handlerSegment = handlerKind === "class-as-view" ? "local-class-as-view" : "local-function";
  if ("urlconfName" in inclusion) {
    const source = reExported ? "reexported-urlconf" : "imported-urlconf";
    return `framework.django.${source}.${factorySegment}.include.${handlerSegment}`;
  }
  const source = reExported ? `reexported-${factorySegment}` : factorySegment;
  return `framework.django.literal-urlconf.${source}.include.${handlerSegment}`;
}

interface ResolvedDjangoUrlconfInclusion {
  readonly inclusion: DjangoUrlconfInclusionFact;
  readonly urlconfFilePath: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

interface ProjectedDjangoUrlconfRoute {
  readonly inclusionFilePath: string;
  readonly urlconfFilePath: string;
  readonly inclusion: DjangoUrlconfInclusionFact;
  readonly route: DjangoUrlPatternRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly ruleId: EdgeEvidence["ruleId"];
}

function compareProjectedDjangoUrlconfRoute(
  left: ProjectedDjangoUrlconfRoute,
  right: ProjectedDjangoUrlconfRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.urlconfFilePath, right.urlconfFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface DjangoUrlconfRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Projects literal child URL patterns through directly imported URLConfs and
 * static dotted URLConf module names. A final package initializer re-export
 * chain is accepted only when every hop has exact persisted evidence.
 */
export function projectDjangoUrlconfRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): DjangoUrlconfRouteProjection {
  const { referenceEvidence } = input;
  const candidates: ProjectedDjangoUrlconfRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.djangoUrlFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    const resolvedInclusions: ResolvedDjangoUrlconfInclusion[] = [];
    for (const inclusion of inclusionFacts.importedUrlconfInclusions) {
      const importedUrlconfFilePath = resolvePythonRelativeModule(
        input.knownFilePaths,
        inclusionFilePath,
        inclusion.moduleSpecifier
      );
      if (importedUrlconfFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoUrlconfTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedUrlconfFilePath,
        name: inclusion.importedUrlconfName
      });
      if (target === null) {
        continue;
      }
      resolvedInclusions.push({
        inclusion,
        urlconfFilePath: target.filePath,
        resolutionPath: target.resolutionPath,
        reExported: target.reExported
      });
    }

    for (const inclusion of inclusionFacts.literalUrlconfInclusions ?? []) {
      const literalUrlconfFilePath = resolvePythonAbsoluteModule(
        input.knownFilePaths,
        inclusionFilePath,
        inclusion.moduleSpecifier
      );
      if (literalUrlconfFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoUrlconfTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: literalUrlconfFilePath,
        name: "urlpatterns"
      });
      if (target === null) {
        continue;
      }
      resolvedInclusions.push({
        inclusion,
        urlconfFilePath: target.filePath,
        resolutionPath: target.resolutionPath,
        reExported: target.reExported
      });
    }

    for (const resolvedInclusion of resolvedInclusions) {
      const urlconfFacts = input.factsByFile.get(resolvedInclusion.urlconfFilePath)?.djangoUrlFacts;
      if (urlconfFacts === undefined) {
        continue;
      }

      for (const route of urlconfFacts.routes) {
        const handlerKind = djangoUrlPatternHandlerKind(route);
        const handler = input.symbolsById.get(route.handlerId);
        if (
          handler === undefined ||
          handler.filePath !== resolvedInclusion.urlconfFilePath ||
          (handlerKind === "function" ? handler.kind !== "function" : handler.kind !== "class")
        ) {
          continue;
        }
        const path = mountedDjangoUrlconfRoutePath(resolvedInclusion.inclusion.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          urlconfFilePath: resolvedInclusion.urlconfFilePath,
          inclusion: resolvedInclusion.inclusion,
          route,
          handler,
          path,
          resolutionPath: resolvedInclusion.resolutionPath,
          ruleId: djangoUrlconfInclusionRuleId(
            resolvedInclusion.inclusion,
            resolvedInclusion.reExported,
            handlerKind
          )
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedDjangoUrlconfRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.urlconfFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.urlconfFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `ALL ${candidate.path}`;
    const qualifiedName = `${candidate.urlconfFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.urlconfFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.urlconfFilePath,
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
      filePath: candidate.urlconfFilePath,
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
      filePath: candidate.urlconfFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        candidate.ruleId,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

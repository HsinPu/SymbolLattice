import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type EdgeEvidence,
  type FastApiImportedRouterInclusionFact,
  type FastApiRouterDeclarationFact,
  type FastApiRouterRouteFact,
  type GraphEdge,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  compactPythonModuleResolutionPath,
  mountedPythonRoutePath,
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

interface ResolvedFastApiRouterTarget {
  readonly filePath: string;
  readonly router: FastApiRouterDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directFastApiRouterTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedFastApiRouterTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.fastApiRouterFacts;
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
 * Resolves a direct FastAPI router or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative or project-absolute import,
 * and a cycle or any competing local/exported binding remains unresolved.
 */
function resolveExactFastApiRouterTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedFastApiRouterTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.fastApiRouterFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directFastApiRouterTargets(input);
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
  const targetFilePath = resolveFastApiRouterModule({
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
  const target = resolveExactFastApiRouterTarget({
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

/**
 * Resolves the deliberately narrow FastAPI APIRouter module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveFastApiRouterModule(input: {
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

function fastApiImportedRouterRulePrefix(input: {
  readonly inclusion: FastApiImportedRouterInclusionFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.inclusion.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.fastapi.project-absolute-reexported-router"
      : "framework.fastapi.project-absolute-router";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.fastapi.reexported-absolute-router"
      : "framework.fastapi.reexported-router";
  }
  return "framework.fastapi.imported-router";
}

interface ProjectedFastApiImportedRouterRoute {
  readonly inclusionFilePath: string;
  readonly routerFilePath: string;
  readonly inclusion: FastApiImportedRouterInclusionFact;
  readonly route: FastApiRouterRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedFastApiImportedRouterRoute(
  left: ProjectedFastApiImportedRouterRoute,
  right: ProjectedFastApiImportedRouterRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.routerFilePath, right.routerFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface FastApiImportedRouterRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Projects literal handler routes declared on an imported FastAPI router.
 * A final package initializer re-export chain is accepted only when every hop
 * has exact persisted evidence. Stored route evidence names every resolved
 * module so a route remains auditable after indexing.
 */
export function projectFastApiImportedRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): FastApiImportedRouterRouteProjection {
  const { referenceEvidence } = input;
  const candidates: ProjectedFastApiImportedRouterRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.fastApiRouterFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    for (const inclusion of inclusionFacts.importedRouterInclusions) {
      const importedRouterFilePath = resolveFastApiRouterModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: inclusionFilePath,
        moduleSpecifier: inclusion.moduleSpecifier,
        moduleSpecifierKind: inclusion.moduleSpecifierKind
      });
      if (importedRouterFilePath === null) {
        continue;
      }
      const target = resolveExactFastApiRouterTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedRouterFilePath,
        name: inclusion.importedRouterName
      });
      if (target === null) {
        continue;
      }
      const routerFilePath = target.filePath;
      const routerFacts = input.factsByFile.get(routerFilePath)?.fastApiRouterFacts;
      if (routerFacts === undefined) {
        continue;
      }
      const router = target.router;

      for (const route of routerFacts.routes) {
        if (route.routerName !== router.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== routerFilePath) {
          continue;
        }
        const path = mountedPythonRoutePath(inclusion.prefix, router.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          routerFilePath,
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
  for (const candidate of [...candidates].sort(compareProjectedFastApiImportedRouterRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.routerFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
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
        `${fastApiImportedRouterRulePrefix({
          inclusion: candidate.inclusion,
          reExported: candidate.reExported,
          absoluteReExported: candidate.absoluteReExported
        })}.include-router.decorator.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

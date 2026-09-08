import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type EdgeEvidence,
  type FlaskBlueprintDeclarationFact,
  type FlaskBlueprintRouteFact,
  type FlaskImportedBlueprintRegistrationFact,
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

interface ResolvedFlaskBlueprintTarget {
  readonly filePath: string;
  readonly blueprint: FlaskBlueprintDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directFlaskBlueprintTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedFlaskBlueprintTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.flaskBlueprintFacts;
  if (facts === undefined) {
    return [];
  }
  return facts.blueprints
    .filter((blueprint) => blueprint.name === input.name)
    .map((blueprint) => ({
      filePath: input.filePath,
      blueprint,
      resolutionPath: [input.filePath],
      reExported: false,
      absoluteReExported: false
    }));
}

/**
 * Resolves a direct Flask Blueprint or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative or project-root absolute
 * import, and a cycle or any competing local/exported binding remains unresolved.
 */
function resolveExactFlaskBlueprintTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedFlaskBlueprintTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.flaskBlueprintFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directFlaskBlueprintTargets(input);
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
  const targetFilePath = resolveFlaskBlueprintModule({
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
  const target = resolveExactFlaskBlueprintTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedBlueprintName,
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

interface ProjectedFlaskImportedBlueprintRoute {
  readonly registrationFilePath: string;
  readonly blueprintFilePath: string;
  readonly registration: FlaskImportedBlueprintRegistrationFact;
  readonly route: FlaskBlueprintRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedFlaskImportedBlueprintRoute(
  left: ProjectedFlaskImportedBlueprintRoute,
  right: ProjectedFlaskImportedBlueprintRoute
): number {
  return (
    compareStableText(left.registrationFilePath, right.registrationFilePath) ||
    left.registration.range.start.line - right.registration.range.start.line ||
    left.registration.range.start.column - right.registration.range.start.column ||
    compareStableText(left.blueprintFilePath, right.blueprintFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface FlaskImportedBlueprintRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Resolves the deliberately narrow Flask Blueprint module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveFlaskBlueprintModule(input: {
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

function flaskImportedBlueprintRulePrefix(input: {
  readonly registration: FlaskImportedBlueprintRegistrationFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.registration.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.flask.project-absolute-reexported-blueprint"
      : "framework.flask.project-absolute-blueprint";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.flask.reexported-absolute-blueprint"
      : "framework.flask.reexported-blueprint";
  }
  return "framework.flask.imported-blueprint";
}

/**
 * Projects literal handler routes declared on an imported Flask Blueprint.
 * A final package initializer re-export chain is accepted only when every hop
 * has exact persisted evidence. Stored route evidence names every resolved
 * module so a route remains auditable after indexing.
 */
export function projectFlaskImportedBlueprintRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): FlaskImportedBlueprintRouteProjection {
  const { referenceEvidence } = input;
  const candidates: ProjectedFlaskImportedBlueprintRoute[] = [];

  for (const [registrationFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const registrationFacts = facts.flaskBlueprintFacts;
    if (registrationFacts === undefined) {
      continue;
    }

    for (const registration of registrationFacts.importedBlueprintRegistrations) {
      const importedBlueprintFilePath = resolveFlaskBlueprintModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: registrationFilePath,
        moduleSpecifier: registration.moduleSpecifier,
        moduleSpecifierKind: registration.moduleSpecifierKind
      });
      if (importedBlueprintFilePath === null) {
        continue;
      }
      const target = resolveExactFlaskBlueprintTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedBlueprintFilePath,
        name: registration.importedBlueprintName
      });
      if (target === null) {
        continue;
      }
      const blueprintFilePath = target.filePath;
      const blueprintFacts = input.factsByFile.get(blueprintFilePath)?.flaskBlueprintFacts;
      if (blueprintFacts === undefined) {
        continue;
      }
      const blueprint = target.blueprint;

      for (const route of blueprintFacts.routes) {
        if (route.blueprintName !== blueprint.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== blueprintFilePath) {
          continue;
        }
        const path = mountedPythonRoutePath(registration.prefix, blueprint.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          registrationFilePath,
          blueprintFilePath,
          registration,
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
  for (const candidate of [...candidates].sort(compareProjectedFlaskImportedBlueprintRoute)) {
    const dedupeKey = [
      candidate.registrationFilePath,
      candidate.registration.range.start.line,
      candidate.registration.range.start.column,
      candidate.blueprintFilePath,
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

    const file = input.fileSymbols.get(candidate.blueprintFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.blueprintFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.blueprintFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.blueprintFilePath,
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
      filePath: candidate.blueprintFilePath,
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
      filePath: candidate.blueprintFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        `${flaskImportedBlueprintRulePrefix({
          registration: candidate.registration,
          reExported: candidate.reExported,
          absoluteReExported: candidate.absoluteReExported
        })}.register-blueprint.decorator.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.registrationFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

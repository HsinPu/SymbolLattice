import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode, type EdgeEvidence, type PendingReference } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface PlayRouteHandlerResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly methodCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

function parsePlayControllerAction(reference: PendingReference): {
  readonly packageName: string;
  readonly controllerName: string;
  readonly actionName: string;
} | null {
  if (reference.routeFramework !== "play") {
    return null;
  }
  const parts = reference.referenceName.split(".");
  if (
    parts.length < 2 ||
    !parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))
  ) {
    return null;
  }
  const actionName = parts.at(-1);
  const controllerName = parts.at(-2);
  if (actionName === undefined || controllerName === undefined) {
    return null;
  }
  return {
    packageName: parts.slice(0, -2).join("."),
    controllerName,
    actionName
  };
}

function playClassCandidates(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly packageName: string;
  readonly className: string;
}): readonly SymbolNode[] {
  const candidatesById = new Map<string, SymbolNode>();
  for (const facts of input.factsByFile.values()) {
    const classFacts = [
      ...(facts.scalaFacts?.classes ?? []),
      ...(facts.javaFacts?.classes ?? [])
    ];
    for (const fact of classFacts) {
      if (fact.packageName !== input.packageName) {
        continue;
      }
      const symbol = input.symbolsById.get(fact.symbolId);
      if (
        symbol?.kind === "class" &&
        symbol.name === input.className
      ) {
        candidatesById.set(symbol.id, symbol);
      }
    }
  }
  return [...candidatesById.values()].sort((left, right) => compareStableText(left.id, right.id));
}

/**
 * Play's conf/routes references name controller actions rather than lexical
 * bindings. A route is exact only when its package, Scala-or-Java class, and
 * direct method each have one syntax-proven candidate in the indexed project.
 */
export function resolveExactPlayRouteHandler(input: {
  readonly reference: PendingReference;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): PlayRouteHandlerResolution | null {
  const action = parsePlayControllerAction(input.reference);
  if (action === null) {
    return null;
  }
  const classCandidates = playClassCandidates({
    factsByFile: input.factsByFile,
    symbolsById: input.symbolsById,
    packageName: action.packageName,
    className: action.controllerName
  });
  const controller = classCandidates.length === 1 ? classCandidates[0] : undefined;
  const methodCandidates =
    controller === undefined
      ? []
      : [...input.symbolsById.values()]
          .filter(
            (symbol) =>
              symbol.kind === "method" &&
              symbol.qualifiedName === controller.qualifiedName + "." + action.actionName
          )
          .sort((left, right) => compareStableText(left.id, right.id));

  return {
    classCandidates,
    methodCandidates,
    target:
      classCandidates.length === 1 && methodCandidates.length === 1
        ? methodCandidates[0] ?? null
        : null
  };
}

interface PlayRouterMountResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

function parsePlayRouterName(routerName: string): {
  readonly packageName: string;
  readonly className: string;
} | null {
  const parts = routerName.split(".");
  if (
    parts.length < 2 ||
    !parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))
  ) {
    return null;
  }
  const className = parts.at(-1);
  if (className === undefined) {
    return null;
  }
  return {
    packageName: parts.slice(0, -1).join("."),
    className
  };
}

function resolveExactPlayRouterMount(input: {
  readonly routerName: string;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): PlayRouterMountResolution {
  const router = parsePlayRouterName(input.routerName);
  if (router === null) {
    return { classCandidates: [], target: null };
  }
  const classCandidates = playClassCandidates({
    factsByFile: input.factsByFile,
    symbolsById: input.symbolsById,
    packageName: router.packageName,
    className: router.className
  });
  return {
    classCandidates,
    target: classCandidates.length === 1 ? classCandidates[0] ?? null : null
  };
}

/**
 * A Play `->` line mounts a Router class under a prefix; it is not itself a
 * concrete HTTP handler route. Keep it as a dedicated route-kind node with a
 * `handles` edge so `routes` remains an inventory of only concrete HTTP
 * routes while impact and node inspection retain the mounting relationship.
 */
export function projectPlayRouterMountEdges(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const mounts = facts.scalaFacts?.routerMounts ?? [];
    for (const mount of mounts) {
      const source = input.symbolsById.get(mount.symbolId);
      if (source?.kind !== "route" || source.filePath !== filePath) {
        continue;
      }
      const resolution = resolveExactPlayRouterMount({
        routerName: mount.routerName,
        factsByFile: input.factsByFile,
        symbolsById: input.symbolsById
      });
      const candidateIds = candidateSymbolIds(resolution.classCandidates);
      const target = resolution.target;
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target?.id ?? null,
          kind: "handles",
          line: mount.range.start.line,
          column: mount.range.start.column,
          referenceName: mount.routerName
        }),
        sourceId: source.id,
        targetId: target?.id ?? null,
        kind: "handles",
        filePath,
        range: mount.range,
        resolution: target === null ? "unresolved" : "exact",
        confidence: target === null ? 0 : 1,
        referenceName: mount.routerName,
        evidence: referenceEvidence(
          target === null
            ? "framework.play.conf-routes.literal-router-mount.unresolved-router"
            : "framework.play.conf-routes.literal-router-mount.package-class",
          target === null ? "unresolved" : "module",
          candidateIds
        )
      });
    }
  }
  return edges;
}

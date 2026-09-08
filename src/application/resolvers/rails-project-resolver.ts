import { compareStableText, type PendingReference, type SymbolNode } from "../../domain/index.js";

interface RailsRouteHandlerResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly methodCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

function parseRailsControllerAction(reference: PendingReference): {
  readonly controller: string;
  readonly controllerName: string;
  readonly actionName: string;
} | null {
  if (reference.routeFramework !== "rails") {
    return null;
  }
  const match = /^([a-z_][a-z0-9_]*)#([a-z_][a-zA-Z0-9_]*)$/u.exec(reference.referenceName);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return {
    controller: match[1],
    controllerName:
      match[1]
        .split("_")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join("") + "Controller",
    actionName: match[2]
  };
}

/**
 * Rails routes name a controller action but do not lexically import it. A route
 * is exact only when the conventional controller file, its class, and its
 * action method each provide one independent syntax-proven candidate.
 */
export function resolveExactRailsRouteHandler(input: {
  readonly reference: PendingReference;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): RailsRouteHandlerResolution | null {
  const action = parseRailsControllerAction(input.reference);
  if (action === null) {
    return null;
  }
  const controllerPath = `app/controllers/${action.controller}_controller.rb`;
  const classCandidates = [...input.symbolsById.values()]
    .filter(
      (symbol) =>
        symbol.kind === "class" &&
        symbol.filePath === controllerPath &&
        symbol.name === action.controllerName
    )
    .sort((left, right) => compareStableText(left.id, right.id));
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

export function railsRouteHandlerRuleId(
  reference: PendingReference,
  suffix: "conventional-file-class-method" | "unresolved-controller-method"
): string {
  if (reference.routeRegistration === "rails-resources") {
    return `framework.rails.resources.direct-routes-draw.literal-resource.${suffix}`;
  }
  if (reference.routeRegistration === "rails-resource") {
    return `framework.rails.resource.direct-routes-draw.literal-resource.${suffix}`;
  }
  return `framework.rails.direct-routes-draw.literal-controller-action.${suffix}`;
}

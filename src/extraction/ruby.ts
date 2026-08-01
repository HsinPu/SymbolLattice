import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type PendingReference,
  type RouteRegistration,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

/** Ruby uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface RubyExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "ruby";
}

type RubySyntaxNode = SgNode;

interface StaticRubyClass {
  readonly name: string;
  readonly node: RubySyntaxNode;
  readonly body: RubySyntaxNode;
}

interface StaticRubyMethod {
  readonly name: string;
  readonly node: RubySyntaxNode;
}

interface StaticRailsControllerAction {
  readonly controller: string;
  /** A bare controller can be proven only when its class and method are in this file. */
  readonly localControllerName: string | null;
  readonly action: string;
}

interface StaticRailsRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly action: StaticRailsControllerAction;
  readonly node: RubySyntaxNode;
  readonly routeRegistration?: Extract<RouteRegistration, "rails-resources" | "rails-resource">;
}

interface StaticRubyMemberCall {
  readonly receiver: RubySyntaxNode;
  readonly name: string;
  readonly block: RubySyntaxNode | null;
}

const RAILS_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS"
};

const RAILS_PLURAL_RESOURCE_ACTIONS = [
  "index",
  "create",
  "new",
  "show",
  "edit",
  "update",
  "destroy"
] as const;

const RAILS_SINGULAR_RESOURCE_ACTIONS = [
  "create",
  "new",
  "show",
  "edit",
  "update",
  "destroy"
] as const;

function directChildren(node: RubySyntaxNode): readonly RubySyntaxNode[] {
  return node.children();
}

function nodeText(node: RubySyntaxNode): string {
  return node.text();
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (character === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let lower = 0;
  let upper = lineStarts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle];
    if (start === undefined || start > offset) {
      upper = middle;
    } else {
      lower = middle;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeForNode(node: RubySyntaxNode): SourceRange {
  const range = node.range();
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 }
  };
}

function rangeForSpan(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function hasSyntaxError(node: RubySyntaxNode): boolean {
  // tree-sitter-ruby represents a missing terminal (for example a missing
  // `end`) as an empty token node instead of an ERROR node. Treat either form
  // as invalid so a partially recovered route block never becomes a result.
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "program" && nodeText(node).length === 0) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function identifierText(node: RubySyntaxNode): string | null {
  const value = nodeText(node);
  return /^[a-z_][a-zA-Z0-9_]*[!?=]?$/u.test(value) ? value : null;
}

function constantText(node: RubySyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Z][a-zA-Z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainRubyString(node: RubySyntaxNode): string | null {
  if (node.kind() !== "string") {
    return null;
  }
  const value = nodeText(node);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value[1] === "\"" ||
    value.at(-2) === "\"" ||
    value.includes("\\") ||
    value.includes("#{") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticRailsPath(node: RubySyntaxNode): string | null {
  const path = staticPlainRubyString(node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticRubyClass(node: RubySyntaxNode): StaticRubyClass | null {
  if (node.kind() !== "class") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.kind() === "constant");
  const body = children.find((child) => child.kind() === "body_statement");
  const name = nameNode === undefined ? null : constantText(nameNode);
  return name === null || body === undefined ? null : { name, node, body };
}

function staticRubyMethod(node: RubySyntaxNode): StaticRubyMethod | null {
  if (node.kind() !== "method") {
    return null;
  }
  const nameNode = directChildren(node).find((child) => child.kind() === "identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null ? null : { name, node };
}

function staticMemberCall(node: RubySyntaxNode): StaticRubyMemberCall | null {
  if (node.kind() !== "call") {
    return null;
  }
  const children = directChildren(node);
  const receiver = children[0];
  const nameNode = children[2];
  const tail = children.slice(3);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const block = tail.find((child) => child.kind() === "do_block");
  return (
    receiver === undefined ||
    name === null ||
    children[1]?.kind() !== "." ||
    tail.filter((child) => child.kind() !== "do_block").length !== 0 ||
    tail.filter((child) => child.kind() === "do_block").length > 1
  )
    ? null
    : { receiver, name, block: block ?? null };
}

function isRailsApplication(node: RubySyntaxNode): boolean {
  const call = staticMemberCall(node);
  return (
    call !== null &&
    call.name === "application" &&
    call.block === null &&
    call.receiver.kind() === "constant" &&
    nodeText(call.receiver) === "Rails"
  );
}

function isRailsRoutes(node: RubySyntaxNode): boolean {
  const call = staticMemberCall(node);
  return call !== null && call.name === "routes" && call.block === null && isRailsApplication(call.receiver);
}

function staticRailsRoutesDraw(node: RubySyntaxNode): RubySyntaxNode | null {
  const call = staticMemberCall(node);
  if (call === null || call.name !== "draw" || call.block === null || !isRailsRoutes(call.receiver)) {
    return null;
  }
  const bodies = directChildren(call.block).filter((child) => child.kind() === "body_statement");
  return bodies.length === 1 && bodies[0] !== undefined ? bodies[0] : null;
}

function staticRailsToAction(node: RubySyntaxNode): StaticRailsControllerAction | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const key = children.find((child) => child.kind() === "hash_key_symbol");
  const value = children.find((child) => child.kind() === "string");
  if (
    key === undefined ||
    value === undefined ||
    children.length !== 3 ||
    nodeText(key) !== "to"
  ) {
    return null;
  }
  const actionValue = staticPlainRubyString(value);
  const match =
    actionValue === null
      ? null
      : /^([a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)*)#([a-z_][a-zA-Z0-9_]*)$/u.exec(
          actionValue
        );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return staticRailsControllerAction(match[1], match[2]);
}

function staticRailsControllerAction(
  controller: string,
  action: string
): StaticRailsControllerAction | null {
  if (
    !/^([a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)*)$/u.test(controller) ||
    !/^[a-z_][a-zA-Z0-9_]*$/u.test(action)
  ) {
    return null;
  }
  const localControllerName = controller.includes("/")
    ? null
    : controller
        .split("_")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join("") + "Controller";
  return { controller, localControllerName, action };
}

function staticRailsRoute(node: RubySyntaxNode): StaticRailsRoute | null {
  if (node.kind() !== "call") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children[0];
  const argumentList = children[1];
  const methodName = nameNode === undefined ? null : identifierText(nameNode);
  const method = methodName === null ? undefined : RAILS_ROUTE_METHODS[methodName];
  if (
    method === undefined ||
    argumentList?.kind() !== "argument_list" ||
    children.length !== 2
  ) {
    return null;
  }
  const arguments_ = directChildren(argumentList).filter(
    (child) => child.kind() === "string" || child.kind() === "pair"
  );
  if (arguments_.length !== 2 || arguments_[0] === undefined || arguments_[1] === undefined) {
    return null;
  }
  const path = staticRailsPath(arguments_[0]);
  const action = staticRailsToAction(arguments_[1]);
  return path === null || action === null ? null : { method, path, action, node };
}

function staticRailsSimpleSymbol(node: RubySyntaxNode): string | null {
  if (node.kind() !== "simple_symbol") {
    return null;
  }
  const match = /^:([a-z_][a-z0-9_]*)$/u.exec(nodeText(node));
  return match?.[1] ?? null;
}

function staticRailsResourceFilter(
  node: RubySyntaxNode,
  allowedActions: readonly string[]
): readonly string[] | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const key = children[0];
  const separator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    key?.kind() !== "hash_key_symbol" ||
    nodeText(key) !== "only" && nodeText(key) !== "except" ||
    separator?.kind() !== ":" ||
    value?.kind() !== "array"
  ) {
    return null;
  }
  const entries = directChildren(value);
  if (
    entries.length < 2 ||
    entries[0]?.kind() !== "[" ||
    entries.at(-1)?.kind() !== "]" ||
    entries.some(
      (entry, index) =>
        index !== 0 &&
        index !== entries.length - 1 &&
        entry.kind() !== "simple_symbol" &&
        entry.kind() !== ","
    )
  ) {
    return null;
  }
  const selected = entries
    .filter((entry) => entry.kind() === "simple_symbol")
    .map(staticRailsSimpleSymbol);
  if (
    selected.some((entry) => entry === null) ||
    new Set(selected).size !== selected.length ||
    selected.some((entry) => entry === null || !allowedActions.includes(entry))
  ) {
    return null;
  }
  const selectedActions = new Set(selected.filter((entry): entry is string => entry !== null));
  return nodeText(key) === "only"
    ? allowedActions.filter((action) => selectedActions.has(action))
    : allowedActions.filter((action) => !selectedActions.has(action));
}

function pluralizeRailsResource(resource: string): string {
  if (/[^aeiou]y$/u.test(resource)) {
    return resource.slice(0, -1) + "ies";
  }
  if (/(s|x|z|ch|sh)$/u.test(resource)) {
    return resource + "es";
  }
  return resource + "s";
}

function staticRailsResourceRoutes(node: RubySyntaxNode): readonly StaticRailsRoute[] {
  if (node.kind() !== "call") {
    return [];
  }
  const children = directChildren(node);
  const nameNode = children[0];
  const argumentList = children[1];
  const methodName = nameNode === undefined ? null : identifierText(nameNode);
  const plural = methodName === "resources";
  if (
    (methodName !== "resources" && methodName !== "resource") ||
    argumentList?.kind() !== "argument_list" ||
    children.length !== 2
  ) {
    return [];
  }
  const arguments_ = directChildren(argumentList);
  const resourceNode = arguments_[0];
  const filterNode = arguments_[2];
  const allowedActions = plural ? RAILS_PLURAL_RESOURCE_ACTIONS : RAILS_SINGULAR_RESOURCE_ACTIONS;
  if (
    resourceNode === undefined ||
    staticRailsSimpleSymbol(resourceNode) === null ||
    !(
      arguments_.length === 1 ||
      (arguments_.length === 3 && arguments_[1]?.kind() === "," && filterNode !== undefined)
    )
  ) {
    return [];
  }
  const resource = staticRailsSimpleSymbol(resourceNode);
  if (resource === null) {
    return [];
  }
  const selectedActions =
    filterNode === undefined ? allowedActions : staticRailsResourceFilter(filterNode, allowedActions);
  if (selectedActions === null) {
    return [];
  }
  const controller = plural ? resource : pluralizeRailsResource(resource);
  const routeRegistration = plural ? "rails-resources" : "rails-resource";
  const basePath = "/" + resource;
  const itemPath = plural ? basePath + "/:id" : basePath;
  return selectedActions.flatMap((actionName): readonly StaticRailsRoute[] => {
    const action = staticRailsControllerAction(controller, actionName);
    if (action === null) {
      return [];
    }
    const route = (method: RouteMethod, path: string): StaticRailsRoute => ({
      method,
      path,
      action,
      node,
      routeRegistration
    });
    switch (actionName) {
      case "index":
        return [route("GET", basePath)];
      case "create":
        return [route("POST", basePath)];
      case "new":
        return [route("GET", basePath + "/new")];
      case "show":
        return [route("GET", itemPath)];
      case "edit":
        return [route("GET", itemPath + "/edit")];
      case "update":
        return [route("PATCH", itemPath), route("PUT", itemPath)];
      case "destroy":
        return [route("DELETE", itemPath)];
      default:
        return [];
    }
  });
}

export function extractRubyFileFacts(input: RubyExtractFileFactsInput): ArtifactFacts {
  const railsCapability = frameworkCapability("rails");
  if (!railsCapability.languages.includes(input.language)) {
    throw new Error("Rails framework extraction was invoked for an unsupported source language.");
  }

  const root = parse("ruby", input.sourceText).root();
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const declarationOrdinals = new Map<string, number>();
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileNode: SymbolNode = {
    id: createSymbolId({
      filePath: input.filePath,
      qualifiedName: input.filePath,
      kind: "file",
      declarationOrdinal: 0
    }),
    name: fileName,
    qualifiedName: input.filePath,
    kind: "file",
    filePath: input.filePath,
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: RubySyntaxNode): void {
    const range = rangeForNode(node);
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: child.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: child.name
      }),
      sourceId: parent.id,
      targetId: child.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: child.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addClass(declaration: StaticRubyClass): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticRubyMethod): SymbolNode {
    const qualifiedName = parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    return symbol;
  }

  function addFunction(declaration: StaticRubyMethod): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addRailsRoute(routeFact: StaticRailsRoute, handler: SymbolNode | null): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = input.filePath + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeForNode(routeFact.node);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name: routeName,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    addContainment(fileNode, route, routeFact.node);
    const referenceName = routeFact.action.controller + "#" + routeFact.action.action;
    const edgeId = createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName
      });
    edges.push({
      id: edgeId,
      sourceId: route.id,
      targetId: handler?.id ?? null,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: handler === null ? "unresolved" : "exact",
      confidence: handler === null ? 0 : 1,
      referenceName,
      evidence: {
        ruleId:
          routeFact.routeRegistration === "rails-resources"
            ? handler === null
              ? "framework.rails.resources.direct-routes-draw.literal-resource.unresolved-controller-method"
              : "framework.rails.resources.direct-routes-draw.literal-resource.local-method"
            : routeFact.routeRegistration === "rails-resource"
              ? handler === null
                ? "framework.rails.resource.direct-routes-draw.literal-resource.unresolved-controller-method"
                : "framework.rails.resource.direct-routes-draw.literal-resource.local-method"
              : handler === null
                ? "framework.rails.direct-routes-draw.literal-controller-action.unresolved-controller-method"
                : "framework.rails.direct-routes-draw.literal-controller-action.local-method",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
    if (handler === null && routeFact.action.localControllerName !== null) {
      if (routeFact.routeRegistration === undefined) {
        pendingReferences.push({
          id: edgeId,
          sourceId: route.id,
          filePath: input.filePath,
          referenceName,
          relationKind: "routes",
          routeFramework: "rails",
          range
        });
      } else {
        pendingReferences.push({
          id: edgeId,
          sourceId: route.id,
          filePath: input.filePath,
          referenceName,
          relationKind: "routes",
          routeFramework: "rails",
          routeRegistration: routeFact.routeRegistration,
          range
        });
      }
    }
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const localMethodsByClassName = new Map<string, SymbolNode[]>();
    for (const classDeclaration of topLevel
      .map((node) => staticRubyClass(node))
      .filter((candidate): candidate is StaticRubyClass => candidate !== null)) {
      const classSymbol = addClass(classDeclaration);
      for (const methodDeclaration of directChildren(classDeclaration.body)
        .map((node) => staticRubyMethod(node))
        .filter((candidate): candidate is StaticRubyMethod => candidate !== null)) {
        const methodSymbol = addMethod(classSymbol, methodDeclaration);
        const identity = classDeclaration.name + "\u0000" + methodDeclaration.name;
        localMethodsByClassName.set(identity, [
          ...(localMethodsByClassName.get(identity) ?? []),
          methodSymbol
        ]);
      }
    }

    for (const functionDeclaration of topLevel
      .map((node) => staticRubyMethod(node))
      .filter((candidate): candidate is StaticRubyMethod => candidate !== null)) {
      addFunction(functionDeclaration);
    }

    for (const topLevelCall of topLevel) {
      const body = staticRailsRoutesDraw(topLevelCall);
      if (body === null) {
        continue;
      }
      for (const routeDeclaration of directChildren(body).flatMap((node) => {
        const directRoute = staticRailsRoute(node);
        return directRoute === null ? staticRailsResourceRoutes(node) : [directRoute];
      })) {
        const localHandlerCandidates =
          routeDeclaration.action.localControllerName === null
            ? []
            : localMethodsByClassName.get(
                routeDeclaration.action.localControllerName +
                  "\u0000" +
                  routeDeclaration.action.action
              ) ?? [];
        const handler =
          localHandlerCandidates.length === 1 ? localHandlerCandidates[0] ?? null : null;
        addRailsRoute(routeDeclaration, handler);
      }
    }
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    nestRouteFacts: {
      routeControllers: [],
      moduleControllers: [],
      routerModulePrefixes: []
    },
    fastifyPluginFacts: {
      routes: [],
      childRegistrations: [],
      rootRegistrations: []
    },
    fastApiRouterFacts: {
      routers: [],
      routes: [],
      importedRouterInclusions: []
    }
  };
}

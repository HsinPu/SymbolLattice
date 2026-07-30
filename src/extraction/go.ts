import { parser } from "@lezer/go";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface GoExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "go";
}

type GoSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticGoFunction {
  readonly name: string;
  readonly node: GoSyntaxNode;
  readonly body: GoSyntaxNode;
  readonly parameterNames: readonly string[];
}

interface GinReceiver {
  readonly kind: "engine" | "group";
  readonly prefix: string;
}

interface StaticGinBinding {
  readonly name: string;
  readonly receiver: GinReceiver;
}

interface StaticGinRoute {
  readonly receiver: GinReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: GoSyntaxNode;
}

const GIN_PACKAGE_PATH = "github.com/gin-gonic/gin";

const GIN_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  Any: "ALL"
};

function directChildren(node: GoSyntaxNode): readonly GoSyntaxNode[] {
  const children: GoSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: GoExtractFileFactsInput, node: GoSyntaxNode): string {
  return input.sourceText.slice(node.from, node.to);
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

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function hasSyntaxError(node: GoSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainGoString(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  if (node.name !== "String") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticGinPath(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  const path = staticPlainGoString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticGinGroupPrefix(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  const prefix = staticGinPath(input, node);
  return prefix === null || prefix === "/" || prefix.endsWith("/") ? null : prefix;
}

function descendantsNamed(node: GoSyntaxNode, name: string): readonly GoSyntaxNode[] {
  const matches: GoSyntaxNode[] = [];
  const visit = (candidate: GoSyntaxNode): void => {
    if (candidate.name === name) {
      matches.push(candidate);
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  };
  visit(node);
  return matches;
}

function staticGinImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  const counts = new Map<string, number>();
  for (const declaration of directChildren(root).filter((node) => node.name === "ImportDecl")) {
    for (const specifier of descendantsNamed(declaration, "ImportSpec")) {
      const children = directChildren(specifier);
      const stringNode = children.find((child) => child.name === "String");
      if (stringNode === undefined || staticPlainGoString(input, stringNode) !== GIN_PACKAGE_PATH) {
        continue;
      }
      const aliasNode = children.find(
        (child) => child.name === "DefName" || child.name === "."
      );
      if (aliasNode?.name === ".") {
        continue;
      }
      const alias = aliasNode === undefined ? "gin" : identifierText(input, aliasNode);
      if (alias === null || alias === "_") {
        continue;
      }
      counts.set(alias, (counts.get(alias) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count === 1)
    .map(([alias]) => alias)
    .sort();
}

function staticGoFunction(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticGoFunction | null {
  if (node.name !== "FunctionDecl") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "DefName");
  const parameters = children.find((child) => child.name === "Parameters");
  const body = children.find((child) => child.name === "Block");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (name === null || parameters === undefined || body === undefined) {
    return null;
  }
  const parameterNames = descendantsNamed(parameters, "DefName")
    .map((parameter) => identifierText(input, parameter))
    .filter((parameter): parameter is string => parameter !== null);
  return { name, node, body, parameterNames };
}

function staticArgumentEntries(argumentList: GoSyntaxNode): readonly GoSyntaxNode[] {
  return directChildren(argumentList).filter(
    (child) => child.name !== "(" && child.name !== ")" && child.name !== ","
  );
}

interface StaticSelectorCall {
  readonly receiverName: string;
  readonly methodName: string;
  readonly arguments_: readonly GoSyntaxNode[];
}

function staticSelectorCall(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticSelectorCall | null {
  if (node.name !== "CallExpr") {
    return null;
  }
  const children = directChildren(node);
  const selector = children[0];
  const argumentList = children[1];
  if (
    children.length !== 2 ||
    selector?.name !== "SelectorExpr" ||
    argumentList?.name !== "Arguments"
  ) {
    return null;
  }
  const selectorChildren = directChildren(selector);
  const receiverNode = selectorChildren[0];
  const methodNode = selectorChildren[2];
  if (
    selectorChildren.length !== 3 ||
    receiverNode?.name !== "VariableName" ||
    methodNode?.name !== "FieldName"
  ) {
    return null;
  }
  const receiverName = identifierText(input, receiverNode);
  const methodName = identifierText(input, methodNode);
  return receiverName === null || methodName === null
    ? null
    : { receiverName, methodName, arguments_: staticArgumentEntries(argumentList) };
}

interface StaticShortVariableCall extends StaticSelectorCall {
  readonly name: string;
}

function staticShortVariableCall(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticShortVariableCall | null {
  if (node.name !== "VarDecl") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const call = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "DefName" ||
    operator === undefined ||
    nodeText(input, operator) !== ":=" ||
    call === undefined
  ) {
    return null;
  }
  const name = identifierText(input, target);
  const selectorCall = staticSelectorCall(input, call);
  return name === null || selectorCall === null ? null : { name, ...selectorCall };
}

function staticGinEngineBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  ginAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticGinBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !ginAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    !["Default", "New"].includes(declaration.methodName) ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name, receiver: { kind: "engine", prefix: "" } };
}

function staticGinGroupBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GinReceiver>
): StaticGinBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    declaration.methodName !== "Group" ||
    declaration.arguments_.length !== 1
  ) {
    return null;
  }
  const parent = receivers.get(declaration.receiverName);
  const pathNode = declaration.arguments_[0];
  const prefix = pathNode === undefined ? null : staticGinGroupPrefix(input, pathNode);
  if (parent === undefined || prefix === null) {
    return null;
  }
  return {
    name: declaration.name,
    receiver: { kind: "group", prefix: combinedRoutePath(parent.prefix, prefix) }
  };
}

function staticGinRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GinReceiver>
): StaticGinRoute | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.arguments_.length !== 2) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const method = GIN_ROUTE_METHODS[call.methodName];
  const pathNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const path = pathNode === undefined ? null : staticGinPath(input, pathNode);
  const handlerName =
    handlerNode?.name === "VariableName" ? identifierText(input, handlerNode) : null;
  if (
    receiver === undefined ||
    method === undefined ||
    path === null ||
    handlerName === null
  ) {
    return null;
  }
  return { receiver, method, path, handlerName, node };
}

function directBoundNames(input: GoExtractFileFactsInput, node: GoSyntaxNode): readonly string[] {
  if (node.name === "Assignment") {
    const target = directChildren(node)[0];
    const name = target?.name === "VariableName" ? identifierText(input, target) : null;
    return name === null ? [] : [name];
  }
  if (node.name !== "VarDecl") {
    return [];
  }
  const children = directChildren(node);
  const directNames = children
    .filter((child) => child.name === "DefName")
    .map((child) => identifierText(input, child))
    .filter((name): name is string => name !== null);
  if (directNames.length > 0) {
    return directNames;
  }
  return children
    .filter((child) => child.name === "VarSpec")
    .flatMap((specification) =>
      directChildren(specification)
        .filter((child) => child.name === "DefName")
        .map((child) => identifierText(input, child))
        .filter((name): name is string => name !== null)
    );
}

function combinedRoutePath(...parts: readonly string[]): string {
  const path = parts.join("");
  return path === "" ? "/" : path;
}

/**
 * Extracts conservative Go file facts. The first Go slice deliberately proves
 * only direct Gin engine/group registrations with literal paths and one named
 * package-level handler, never runtime discovery or dynamic dispatch.
 */
export function extractGoFileFacts(input: GoExtractFileFactsInput): ArtifactFacts {
  const ginCapability = frameworkCapability("gin");
  if (!ginCapability.languages.includes(input.language)) {
    throw new Error("Go framework extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
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
    range: rangeFor(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  function addContainment(child: SymbolNode, node: GoSyntaxNode): void {
    const range = rangeFor(lineStarts, node.from, node.to);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: child.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: child.name
      }),
      sourceId: fileNode.id,
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

  function addFunction(functionDeclaration: StaticGoFunction): SymbolNode {
    const qualifiedName = `${input.filePath}#${functionDeclaration.name}`;
    const identity = `${qualifiedName}\u0000function`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: functionDeclaration.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, functionDeclaration.node.from, functionDeclaration.node.to),
      isExported: /^[A-Z]/u.test(functionDeclaration.name),
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, functionDeclaration.node);
    return symbol;
  }

  function addRoute(routeFact: StaticGinRoute, handler: SymbolNode): void {
    const path = combinedRoutePath(routeFact.receiver.prefix, routeFact.path);
    const routeName = `${routeFact.method} ${path}`;
    const qualifiedName = `${input.filePath}#route:${routeName}`;
    const identity = `${qualifiedName}\u0000route`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, routeFact.node.from, routeFact.node.to);
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
    addContainment(route, routeFact.node);
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler.id,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: handler.name
      }),
      sourceId: route.id,
      targetId: handler.id,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: handler.name,
      evidence: {
        ruleId:
          routeFact.receiver.kind === "engine"
            ? "framework.gin.direct-engine.method.local-function"
            : "framework.gin.direct-group.method.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const functions = directChildren(root)
      .map((node) => staticGoFunction(input, node))
      .filter((candidate): candidate is StaticGoFunction => candidate !== null);
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      const sameName = functionsByName.get(functionDeclaration.name) ?? [];
      sameName.push(symbol);
      functionsByName.set(functionDeclaration.name, sameName);
    }

    const ginAliases = staticGinImportAliases(input, root);
    for (const functionDeclaration of functions) {
      const visibleGinAliases = new Set(
        ginAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const receivers = new Map<string, GinReceiver>();
      const shadowedNames = new Set(functionDeclaration.parameterNames);
      for (const statement of directChildren(functionDeclaration.body)) {
        const engineBinding = staticGinEngineBinding(
          input,
          statement,
          visibleGinAliases,
          shadowedNames
        );
        if (engineBinding !== null) {
          receivers.set(engineBinding.name, engineBinding.receiver);
        }
        const groupBinding = staticGinGroupBinding(input, statement, receivers);
        if (groupBinding !== null) {
          receivers.set(groupBinding.name, groupBinding.receiver);
        }
        const routeFact = staticGinRoute(input, statement, receivers);
        if (routeFact !== null && !shadowedNames.has(routeFact.handlerName)) {
          const candidates = functionsByName.get(routeFact.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addRoute(routeFact, handler);
            }
          }
        }

        const retainedBindings = new Set(
          [engineBinding?.name, groupBinding?.name].filter(
            (name): name is string => name !== undefined
          )
        );
        for (const name of directBoundNames(input, statement)) {
          if (!retainedBindings.has(name)) {
            receivers.delete(name);
          }
          shadowedNames.add(name);
        }
      }
    }
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
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

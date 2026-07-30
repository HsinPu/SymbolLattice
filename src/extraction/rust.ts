import { parser } from "@lezer/rust";

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

export interface RustExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "rust";
}

type RustSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticRustFunction {
  readonly name: string;
  readonly node: RustSyntaxNode;
  readonly body: RustSyntaxNode;
  readonly parameterNames: readonly string[];
}

interface StaticRustUseImport {
  readonly path: string;
  readonly localName: string;
}

interface StaticAxumRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: RustSyntaxNode;
}

const AXUM_ROUTER_PATH = "axum::Router";

const AXUM_ROUTING_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE"
};

function directChildren(node: RustSyntaxNode): readonly RustSyntaxNode[] {
  const children: RustSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: RustExtractFileFactsInput, node: RustSyntaxNode): string {
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

function hasSyntaxError(node: RustSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: RustExtractFileFactsInput, node: RustSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPathSegments(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): readonly string[] | null {
  const value = nodeText(input, node);
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/u.test(value)) {
    return null;
  }
  return value.split("::");
}

function staticPlainRustString(input: RustExtractFileFactsInput, node: RustSyntaxNode): string | null {
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

function staticLiteralSlashPath(input: RustExtractFileFactsInput, node: RustSyntaxNode): string | null {
  const path = staticPlainRustString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function directUseImportTarget(node: RustSyntaxNode): RustSyntaxNode | null {
  const target = directChildren(node).find(
    (child) => child.name !== "use" && child.name !== ";"
  );
  return target ?? null;
}

function staticUseImports(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  prefix: readonly string[] = []
): readonly StaticRustUseImport[] {
  if (node.name === "BoundIdentifier" || node.name === "Identifier" || node.name === "ScopedIdentifier") {
    const segments = staticPathSegments(input, node);
    if (segments === null || segments.length === 0) {
      return [];
    }
    const localName = segments.at(-1);
    return localName === undefined
      ? []
      : [{ path: [...prefix, ...segments].join("::"), localName }];
  }

  if (node.name === "UseAsClause") {
    const children = directChildren(node);
    const source = children.find((child) => child.name !== "as" && child.name !== "BoundIdentifier");
    const alias = children.find((child) => child.name === "BoundIdentifier");
    const sourceSegments = source === undefined ? null : staticPathSegments(input, source);
    const localName = alias === undefined ? null : identifierText(input, alias);
    return sourceSegments === null || localName === null
      ? []
      : [{ path: [...prefix, ...sourceSegments].join("::"), localName }];
  }

  if (node.name === "UseList") {
    return directChildren(node).flatMap((child) => {
      if (["{", "}", ","].includes(child.name)) {
        return [];
      }
      return staticUseImports(input, child, prefix);
    });
  }

  if (node.name === "ScopedUseList") {
    const children = directChildren(node);
    const tailIndex = children.findIndex(
      (child) => child.name === "UseList" || child.name === "UseAsClause"
    );
    const tail = tailIndex < 0 ? undefined : children[tailIndex];
    if (tailIndex < 0 || tail === undefined) {
      return [];
    }
    const segmentGroups = children
      .slice(0, tailIndex)
      .filter((child) => child.name !== "::")
      .map((child) => staticPathSegments(input, child));
    if (segmentGroups.some((segments) => segments === null)) {
      return [];
    }
    const headSegments = segmentGroups.flatMap((segments) => segments ?? []);
    return headSegments.length === 0
      ? []
      : staticUseImports(input, tail, [...prefix, ...headSegments]);
  }

  return [];
}

function staticAxumImportAliases(input: RustExtractFileFactsInput, root: RustSyntaxNode): {
  readonly routerAliases: ReadonlySet<string>;
  readonly methodAliases: ReadonlyMap<string, RouteMethod>;
} {
  const imports = directChildren(root)
    .filter((node) => node.name === "UseDeclaration")
    .flatMap((node) => {
      const target = directUseImportTarget(node);
      return target === null ? [] : staticUseImports(input, target);
    });
  const pathsByLocalName = new Map<string, string[]>();
  for (const imported of imports) {
    const paths = pathsByLocalName.get(imported.localName) ?? [];
    paths.push(imported.path);
    pathsByLocalName.set(imported.localName, paths);
  }
  const isUnambiguous = (imported: StaticRustUseImport): boolean => {
    const paths = pathsByLocalName.get(imported.localName) ?? [];
    return paths.length === 1 && paths[0] === imported.path;
  };
  const routerAliases = new Set(
    imports
      .filter((imported) => imported.path === AXUM_ROUTER_PATH && isUnambiguous(imported))
      .map((imported) => imported.localName)
  );
  const methodAliases = new Map<string, RouteMethod>();
  for (const imported of imports) {
    const methodName = imported.path.split("::").at(-1);
    const method =
      methodName === undefined || !imported.path.startsWith("axum::routing::")
        ? undefined
        : AXUM_ROUTING_METHODS[methodName];
    if (method !== undefined && isUnambiguous(imported)) {
      methodAliases.set(imported.localName, method);
    }
  }
  return { routerAliases, methodAliases };
}

function boundIdentifierNames(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): readonly string[] {
  const names = new Set<string>();
  function collect(candidate: RustSyntaxNode): void {
    if (candidate.name === "BoundIdentifier") {
      const name = identifierText(input, candidate);
      if (name !== null) {
        names.add(name);
      }
      return;
    }
    for (const child of directChildren(candidate)) {
      collect(child);
    }
  }
  collect(node);
  return [...names];
}

function staticRustFunction(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): StaticRustFunction | null {
  if (node.name !== "FunctionItem") {
    return null;
  }
  const children = directChildren(node);
  const fnIndex = children.findIndex((child) => child.name === "fn");
  const name = children.slice(fnIndex + 1).find((child) => child.name === "BoundIdentifier");
  const parameters = children.find((child) => child.name === "ParamList");
  const body = children.find((child) => child.name === "Block");
  const nameText = name === undefined ? null : identifierText(input, name);
  if (fnIndex < 0 || nameText === null || body === undefined) {
    return null;
  }
  return {
    name: nameText,
    node,
    body,
    parameterNames:
      parameters === undefined
        ? []
        : directChildren(parameters).flatMap((parameter) => {
            return parameter.name === "Parameter" ? boundIdentifierNames(input, parameter) : [];
          })
  };
}

function directBoundNames(input: RustExtractFileFactsInput, statement: RustSyntaxNode): readonly string[] {
  if (statement.name !== "LetDeclaration") {
    return [];
  }
  const assignment = directChildren(statement).find((child) => child.name === "=");
  if (assignment === undefined) {
    return [];
  }
  const assignmentStart = assignment.from;
  const names = new Set<string>();
  function collectPatternBindings(node: RustSyntaxNode): void {
    if (node.from >= assignmentStart) {
      return;
    }
    if (node.name === "BoundIdentifier") {
      const name = identifierText(input, node);
      if (name !== null) {
        names.add(name);
      }
      return;
    }
    for (const child of directChildren(node)) {
      collectPatternBindings(child);
    }
  }
  for (const child of directChildren(statement)) {
    collectPatternBindings(child);
  }
  return [...names];
}

function staticCall(
  node: RustSyntaxNode
): { readonly callee: RustSyntaxNode; readonly arguments_: RustSyntaxNode } | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children[0];
  const arguments_ = children.find((child) => child.name === "ArgList");
  if (callee === undefined || arguments_ === undefined || children.length !== 2) {
    return null;
  }
  return { callee, arguments_ };
}

function staticArguments(arguments_: RustSyntaxNode): readonly RustSyntaxNode[] | null {
  if (arguments_.name !== "ArgList") {
    return null;
  }
  return directChildren(arguments_).filter((child) => !["(", ")", ","].includes(child.name));
}

function staticFieldCall(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): {
  readonly receiver: RustSyntaxNode;
  readonly methodName: string;
  readonly arguments_: readonly RustSyntaxNode[];
} | null {
  const call = staticCall(node);
  if (call === null || call.callee.name !== "FieldExpression") {
    return null;
  }
  const fieldChildren = directChildren(call.callee);
  const receiver = fieldChildren[0];
  const field = fieldChildren[1];
  const methodName = field === undefined ? null : identifierText(input, field);
  const arguments_ = staticArguments(call.arguments_);
  if (
    receiver === undefined ||
    field === undefined ||
    fieldChildren.length !== 2 ||
    methodName === null ||
    arguments_ === null
  ) {
    return null;
  }
  return { receiver, methodName, arguments_ };
}

function staticRouterNew(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  routerAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): boolean {
  const call = staticCall(node);
  const arguments_ = call === null ? null : staticArguments(call.arguments_);
  const segments = call === null ? null : staticPathSegments(input, call.callee);
  if (arguments_ === null || segments === null || arguments_.length !== 0 || segments.length !== 2) {
    return false;
  }
  const routerName = segments[0];
  return routerName !== undefined && routerAliases.has(routerName) && !shadowedNames.has(routerName) && segments[1] === "new";
}

function staticAxumMethodRoute(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  methodAliases: ReadonlyMap<string, RouteMethod>,
  shadowedNames: ReadonlySet<string>
): { readonly method: RouteMethod; readonly handlerName: string } | null {
  const call = staticCall(node);
  if (call === null || call.callee.name !== "Identifier") {
    return null;
  }
  const methodName = identifierText(input, call.callee);
  const arguments_ = staticArguments(call.arguments_);
  const handler = arguments_?.[0];
  const handlerName = handler === undefined ? null : identifierText(input, handler);
  const method = methodName === null || shadowedNames.has(methodName) ? undefined : methodAliases.get(methodName);
  if (method === undefined || arguments_ === null || arguments_.length !== 1 || handlerName === null) {
    return null;
  }
  return { method, handlerName };
}

/**
 * Proves only a contiguous `Router::new().route(...).route(...)` chain.
 * Each route is retained only when its receiver ultimately resolves to the
 * direct imported constructor; arbitrary builders and trailing wrappers stay
 * out of the graph until their evidence rules are deliberately implemented.
 */
function staticAxumRouteChain(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  routerAliases: ReadonlySet<string>,
  methodAliases: ReadonlyMap<string, RouteMethod>,
  shadowedNames: ReadonlySet<string>
): readonly StaticAxumRoute[] | null {
  if (staticRouterNew(input, node, routerAliases, shadowedNames)) {
    return [];
  }
  const call = staticFieldCall(input, node);
  if (call === null || call.methodName !== "route" || call.arguments_.length !== 2) {
    return null;
  }
  const pathNode = call.arguments_[0];
  const methodRouterNode = call.arguments_[1];
  if (pathNode === undefined || methodRouterNode === undefined) {
    return null;
  }
  const path = staticLiteralSlashPath(input, pathNode);
  const methodRoute = staticAxumMethodRoute(input, methodRouterNode, methodAliases, shadowedNames);
  const precedingRoutes = staticAxumRouteChain(
    input,
    call.receiver,
    routerAliases,
    methodAliases,
    shadowedNames
  );
  if (path === null || methodRoute === null || precedingRoutes === null) {
    return null;
  }
  return [
    ...precedingRoutes,
    { method: methodRoute.method, path, handlerName: methodRoute.handlerName, node }
  ];
}

function staticStatementExpression(statement: RustSyntaxNode): RustSyntaxNode | null {
  if (statement.name === "CallExpression") {
    return statement;
  }
  if (statement.name !== "LetDeclaration") {
    return null;
  }
  const expressions = directChildren(statement).filter((child) => child.name === "CallExpression");
  return expressions.length === 1 ? expressions[0] ?? null : null;
}

/**
 * Extracts conservative Rust file facts. The first Axum surface intentionally
 * requires a direct import, a contiguous literal route builder chain, and one
 * unshadowed named top-level function handler. No type checking or runtime
 * router composition is inferred from this syntax-only adapter.
 */
export function extractRustFileFacts(input: RustExtractFileFactsInput): ArtifactFacts {
  const axumCapability = frameworkCapability("axum");
  if (!axumCapability.languages.includes(input.language)) {
    throw new Error("Rust framework extraction was invoked for an unsupported source language.");
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

  function addContainment(child: SymbolNode, node: RustSyntaxNode): void {
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

  function addFunction(functionDeclaration: StaticRustFunction): SymbolNode {
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
      isExported: /^pub(?:\s|\()/u.test(nodeText(input, functionDeclaration.node)),
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, functionDeclaration.node);
    return symbol;
  }

  function addAxumRoute(routeFact: StaticAxumRoute, handler: SymbolNode): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
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
        ruleId: "framework.axum.direct-router.route.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const functions = directChildren(root)
      .map((node) => staticRustFunction(input, node))
      .filter((candidate): candidate is StaticRustFunction => candidate !== null);
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      const sameName = functionsByName.get(functionDeclaration.name) ?? [];
      sameName.push(symbol);
      functionsByName.set(functionDeclaration.name, sameName);
    }

    const { routerAliases, methodAliases } = staticAxumImportAliases(input, root);
    for (const functionDeclaration of functions) {
      const visibleRouterAliases = new Set(
        [...routerAliases].filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleMethodAliases = new Map(
        [...methodAliases].filter(([alias]) => !functionDeclaration.parameterNames.includes(alias))
      );
      const shadowedNames = new Set(functionDeclaration.parameterNames);
      for (const statement of directChildren(functionDeclaration.body)) {
        const expression = staticStatementExpression(statement);
        const routes =
          expression === null
            ? null
            : staticAxumRouteChain(
                input,
                expression,
                visibleRouterAliases,
                visibleMethodAliases,
                shadowedNames
              );
        if (routes !== null) {
          for (const route of routes) {
            if (shadowedNames.has(route.handlerName)) {
              continue;
            }
            const candidates = functionsByName.get(route.handlerName) ?? [];
            if (candidates.length === 1) {
              const handler = candidates[0];
              if (handler !== undefined) {
                addAxumRoute(route, handler);
              }
            }
          }
        }
        for (const name of directBoundNames(input, statement)) {
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

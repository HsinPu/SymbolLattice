import { parser } from "@lezer/php";

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

export interface PhpExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "php";
}

type PhpSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticPhpClass {
  readonly name: string;
  readonly node: PhpSyntaxNode;
  readonly body: PhpSyntaxNode;
}

interface StaticPhpMethod {
  readonly name: string;
  readonly node: PhpSyntaxNode;
}

interface StaticPhpFunction {
  readonly name: string;
  readonly node: PhpSyntaxNode;
  readonly body: PhpSyntaxNode;
}

interface StaticLaravelControllerAction {
  /** Canonical source spelling without a leading namespace separator. */
  readonly controllerName: string;
  /** Only a bare local class name may be resolved within this file. */
  readonly localControllerName: string | null;
  readonly action: string;
  readonly node: PhpSyntaxNode;
}

interface StaticLaravelRoute {
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly action: StaticLaravelControllerAction;
  readonly node: PhpSyntaxNode;
}

const LARAVEL_ROUTE_FACADE = "Illuminate\\Support\\Facades\\Route";

const LARAVEL_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  options: "OPTIONS",
  any: "ALL"
};

function directChildren(node: PhpSyntaxNode): readonly PhpSyntaxNode[] {
  const children: PhpSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): string {
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

function hasSyntaxError(node: PhpSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function canonicalClassName(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): string | null {
  if (node.name !== "Name" && node.name !== "QualifiedName") {
    return null;
  }
  const value = nodeText(input, node).replace(/^\\+/u, "");
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/u.test(value) ? value : null;
}

function staticPlainPhpString(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): string | null {
  if (node.name !== "String") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    (value[0] !== "'" && value[0] !== '"') ||
    value.at(-1) !== value[0] ||
    value.includes("\\") ||
    value.includes("$") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticLaravelPath(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): string | null {
  const value = staticPlainPhpString(input, node);
  if (value === null) {
    return null;
  }
  const path = value === "" ? "/" : value.startsWith("/") ? value : `/${value}`;
  return path.includes("//") ? null : path;
}

function staticPhpClass(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): StaticPhpClass | null {
  if (node.name !== "ClassDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const name = children
    .filter((child) => child.name === "Name")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const bodies = children.filter((child) => child.name === "DeclarationList");
  return name.length === 1 && bodies.length === 1 && name[0] !== undefined && bodies[0] !== undefined
    ? { name: name[0], node, body: bodies[0] }
    : null;
}

function staticPhpMethod(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): StaticPhpMethod | null {
  if (node.name !== "MethodDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const hasFunctionKeyword = children.some(
    (child) => child.name === "function" && nodeText(input, child) === "function"
  );
  const names = children
    .filter((child) => child.name === "Name")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return hasFunctionKeyword && names.length === 1 && names[0] !== undefined
    ? { name: names[0], node }
    : null;
}

function staticPhpFunction(input: PhpExtractFileFactsInput, node: PhpSyntaxNode): StaticPhpFunction | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const children = directChildren(node);
  const hasFunctionKeyword = children.some(
    (child) => child.name === "function" && nodeText(input, child) === "function"
  );
  const names = children
    .filter((child) => child.name === "Name")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const bodies = children.filter((child) => child.name === "Block");
  return hasFunctionKeyword && names.length === 1 && bodies.length === 1 && names[0] !== undefined && bodies[0] !== undefined
    ? { name: names[0], node, body: bodies[0] }
    : null;
}

function staticPhpDirectCall(
  input: PhpExtractFileFactsInput,
  node: PhpSyntaxNode
): { readonly name: string; readonly node: PhpSyntaxNode } | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children[0];
  const arguments_ = children[1];
  const name = callee === undefined ? null : identifierText(input, callee);
  return (
    name === null ||
    name.toLowerCase() === "call_user_func" ||
    callee?.name !== "Name" ||
    arguments_?.name !== "ArgList" ||
    children.length !== 2 ||
    directChildren(arguments_).some((child) => child.name === "SpreadArgument")
  )
    ? null
    : { name, node };
}

/**
 * Traverses exactly one eligible caller body. Nested declarations and closures
 * deliberately remain out of scope because their runtime binding differs from
 * the enclosing top-level function.
 */
function directPhpCalls(
  input: PhpExtractFileFactsInput,
  body: PhpSyntaxNode
): readonly { readonly name: string; readonly node: PhpSyntaxNode }[] {
  const calls: { readonly name: string; readonly node: PhpSyntaxNode }[] = [];
  function visit(node: PhpSyntaxNode): void {
    if (
      node !== body &&
      (node.name === "FunctionDefinition" ||
        node.name === "FunctionExpression" ||
        node.name === "ArrowFunction" ||
        node.name === "MethodDeclaration" ||
        node.name === "ClassDeclaration")
    ) {
      return;
    }
    const call = staticPhpDirectCall(input, node);
    if (call !== null) {
      calls.push(call);
      return;
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }
  visit(body);
  return calls;
}

function staticLaravelFacadeAliases(
  input: PhpExtractFileFactsInput,
  root: PhpSyntaxNode
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const declaration of directChildren(root)) {
    if (declaration.name !== "NamespaceUseDeclaration") {
      continue;
    }
    const children = directChildren(declaration);
    const unaliased =
      children.length === 3 &&
      children[0]?.name === "use" &&
      children[1]?.name === "QualifiedName" &&
      children[2]?.name === ";";
    const aliased =
      children.length === 5 &&
      children[0]?.name === "use" &&
      children[1]?.name === "QualifiedName" &&
      children[2]?.name === "as" &&
      children[3]?.name === "Name" &&
      children[4]?.name === ";";
    if (!unaliased && !aliased) {
      continue;
    }
    const imported = children[1] === undefined ? null : canonicalClassName(input, children[1]);
    if (imported !== LARAVEL_ROUTE_FACADE) {
      continue;
    }
    const localName = aliased
      ? children[3] === undefined
        ? null
        : identifierText(input, children[3])
      : "Route";
    if (localName !== null) {
      counts.set(localName, (counts.get(localName) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count === 1)
      .map(([name]) => name)
  );
}

function staticScopedFacadeCall(
  input: PhpExtractFileFactsInput,
  node: PhpSyntaxNode,
  facadeAliases: ReadonlySet<string>
): {
  readonly methodName: string;
  readonly arguments_: readonly PhpSyntaxNode[];
} | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children[0];
  const argumentList = children[1];
  if (
    children.length !== 2 ||
    callee?.name !== "ScopedExpression" ||
    argumentList?.name !== "ArgList"
  ) {
    return null;
  }
  const scopedChildren = directChildren(callee);
  const receiver = scopedChildren[0];
  const member = scopedChildren[2];
  if (
    scopedChildren.length !== 3 ||
    receiver === undefined ||
    member?.name !== "ClassMemberName" ||
    scopedChildren[1]?.name !== "::"
  ) {
    return null;
  }
  const memberChildren = directChildren(member);
  const methodName =
    memberChildren.length === 1 && memberChildren[0] !== undefined
      ? identifierText(input, memberChildren[0])
      : null;
  const receiverName = canonicalClassName(input, receiver);
  const isFacade =
    receiver.name === "QualifiedName"
      ? receiverName === LARAVEL_ROUTE_FACADE
      : receiver.name === "Name" && receiverName !== null && facadeAliases.has(receiverName);
  if (!isFacade || methodName === null) {
    return null;
  }
  const arguments_ = directChildren(argumentList).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  return { methodName: methodName.toLowerCase(), arguments_ };
}

function staticLaravelControllerAction(
  input: PhpExtractFileFactsInput,
  node: PhpSyntaxNode
): StaticLaravelControllerAction | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const values = directChildren(node).filter(
    (child) => !["[", "]", ","].includes(child.name)
  );
  const classExpression = values[0];
  const actionNode = values[1];
  if (values.length !== 2 || classExpression?.name !== "ScopedExpression" || actionNode === undefined) {
    return null;
  }
  const classChildren = directChildren(classExpression);
  const classNameNode = classChildren[0];
  const member = classChildren[2];
  const className =
    classNameNode === undefined ? null : canonicalClassName(input, classNameNode);
  const memberChildren = member === undefined ? [] : directChildren(member);
  const classKeyword =
    member?.name === "ClassMemberName" &&
    memberChildren.length === 1 &&
    memberChildren[0] !== undefined &&
    nodeText(input, memberChildren[0]) === "class";
  const action = staticPlainPhpString(input, actionNode);
  if (
    classChildren.length !== 3 ||
    classChildren[1]?.name !== "::" ||
    className === null ||
    !classKeyword ||
    action === null ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(action)
  ) {
    return null;
  }
  return {
    controllerName: className,
    localControllerName: className.includes("\\") ? null : className,
    action,
    node
  };
}

function staticLaravelRoute(
  input: PhpExtractFileFactsInput,
  node: PhpSyntaxNode,
  facadeAliases: ReadonlySet<string>
): StaticLaravelRoute | null {
  const call = staticScopedFacadeCall(input, node, facadeAliases);
  if (call === null) {
    return null;
  }
  const method = LARAVEL_ROUTE_METHODS[call.methodName];
  const pathNode = call.arguments_[0];
  const actionNode = call.arguments_[1];
  const path = pathNode === undefined ? null : staticLaravelPath(input, pathNode);
  const action = actionNode === undefined ? null : staticLaravelControllerAction(input, actionNode);
  return method !== undefined && call.arguments_.length === 2 && path !== null && action !== null
    ? { methods: [method], path, action, node }
    : null;
}

export function extractPhpFileFacts(input: PhpExtractFileFactsInput): ArtifactFacts {
  const laravelCapability = frameworkCapability("laravel");
  if (!laravelCapability.languages.includes(input.language)) {
    throw new Error("PHP framework extraction was invoked for an unsupported source language.");
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

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: PhpSyntaxNode): void {
    const range = rangeFor(lineStarts, node.from, node.to);
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

  function addClass(declaration: StaticPhpClass): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticPhpMethod): SymbolNode {
    const qualifiedName = `${parent.qualifiedName}.${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    return symbol;
  }

  function addFunction(declaration: StaticPhpFunction): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addLaravelRoute(routeFact: StaticLaravelRoute, handler: SymbolNode | null, method: RouteMethod): void {
    const routeName = `${method} ${routeFact.path}`;
    const qualifiedName = `${input.filePath}#route:${routeName}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
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
    addContainment(fileNode, route, routeFact.node);
    const referenceName = `${routeFact.action.controllerName}@${routeFact.action.action}`;
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
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
          handler === null
            ? "framework.laravel.direct-facade.literal-controller-action.unresolved-controller-method"
            : "framework.laravel.direct-facade.literal-controller-action.local-method",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const classes = topLevel
      .map((node) => staticPhpClass(input, node))
      .filter((candidate): candidate is StaticPhpClass => candidate !== null);
    const localMethodsByClassName = new Map<string, SymbolNode[]>();

    for (const classDeclaration of classes) {
      const classSymbol = addClass(classDeclaration);
      const methods = directChildren(classDeclaration.body)
        .map((node) => staticPhpMethod(input, node))
        .filter((candidate): candidate is StaticPhpMethod => candidate !== null);
      for (const methodDeclaration of methods) {
        const method = addMethod(classSymbol, methodDeclaration);
        const key = `${classDeclaration.name}\u0000${method.name}`;
        localMethodsByClassName.set(key, [...(localMethodsByClassName.get(key) ?? []), method]);
      }
    }

    const localFunctionsByName = new Map<string, SymbolNode[]>();
    const localFunctions: Array<{ readonly declaration: StaticPhpFunction; readonly symbol: SymbolNode }> = [];
    for (const functionDeclaration of topLevel
      .map((node) => staticPhpFunction(input, node))
      .filter((candidate): candidate is StaticPhpFunction => candidate !== null)) {
      const symbol = addFunction(functionDeclaration);
      localFunctions.push({ declaration: functionDeclaration, symbol });
      localFunctionsByName.set(functionDeclaration.name, [
        ...(localFunctionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
    }

    const hasFunctionScopeAmbiguity = topLevel.some(
      (node) => node.name === "NamespaceDefinition" || node.name === "NamespaceUseDeclaration"
    );
    if (!hasFunctionScopeAmbiguity) {
      for (const caller of localFunctions) {
        for (const call of directPhpCalls(input, caller.declaration.body)) {
          const candidates = localFunctionsByName.get(call.name) ?? [];
          const target = candidates.length === 1 ? candidates[0] : undefined;
          if (target === undefined) {
            continue;
          }
          const range = rangeFor(lineStarts, call.node.from, call.node.to);
          edges.push({
            id: createEdgeId({
              sourceId: caller.symbol.id,
              targetId: target.id,
              kind: "calls",
              line: range.start.line,
              column: range.start.column,
              referenceName: call.name
            }),
            sourceId: caller.symbol.id,
            targetId: target.id,
            kind: "calls",
            filePath: input.filePath,
            range,
            resolution: "exact",
            confidence: 1,
            referenceName: call.name,
            evidence: {
              ruleId: "syntax.php.same-file.unique-top-level-function-call",
              stage: "syntax",
              candidateSymbolIds: [target.id]
            }
          });
        }
      }
    }

    const facadeAliases = staticLaravelFacadeAliases(input, root);
    for (const statement of topLevel) {
      if (statement.name !== "ExpressionStatement") {
        continue;
      }
      const expression = directChildren(statement)[0];
      const route = expression === undefined ? null : staticLaravelRoute(input, expression, facadeAliases);
      if (route === null) {
        continue;
      }
      const localHandlerCandidates =
        route.action.localControllerName === null
          ? []
          : localMethodsByClassName.get(
              `${route.action.localControllerName}\u0000${route.action.action}`
            ) ?? [];
      const handler = localHandlerCandidates.length === 1 ? localHandlerCandidates[0] ?? null : null;
      for (const method of route.methods) {
        addLaravelRoute(route, handler, method);
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

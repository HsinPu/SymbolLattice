import { parser } from "@lezer/cpp";

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

export interface CppExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "cpp";
}

type CppSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticCppFunction {
  readonly name: string;
  readonly node: CppSyntaxNode;
  readonly body: CppSyntaxNode;
  readonly parameterList: CppSyntaxNode;
}

interface StaticCppFunctionDeclaration {
  readonly name: string;
}

interface StaticCppClass {
  readonly name: string;
  readonly node: CppSyntaxNode;
  readonly body: CppSyntaxNode;
}

interface StaticCppMethod {
  readonly name: string;
  readonly node: CppSyntaxNode;
}

interface StaticCppServer {
  readonly name: string;
  readonly node: CppSyntaxNode;
}

interface StaticCppHttplibRoute {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: CppSyntaxNode;
}

const CPP_HTTPLIB_SERVER_TYPES = new Set(["httplib::Server", "httplib::SSLServer"]);

const CPP_HTTPLIB_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS"
};

function directChildren(node: CppSyntaxNode): readonly CppSyntaxNode[] {
  const children: CppSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: CppExtractFileFactsInput, node: CppSyntaxNode): string {
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

function hasSyntaxError(node: CppSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainCppString(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  if (node.name !== "String") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    value[0] !== '"' ||
    value.at(-1) !== '"' ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticCppPath(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  const path = staticPlainCppString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function functionName(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode,
  identifierKind: "Identifier" | "FieldIdentifier"
): string | null {
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const names = directChildren(declarators[0])
    .filter((child) => child.name === identifierKind)
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return names.length === 1 && names[0] !== undefined ? names[0] : null;
}

function staticCppFunction(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppFunction | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const name = functionName(input, node, "Identifier");
  const bodies = directChildren(node).filter((child) => child.name === "CompoundStatement");
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const parameterLists =
    declarators.length === 1 && declarators[0] !== undefined
      ? directChildren(declarators[0]).filter((child) => child.name === "ParameterList")
      : [];
  return name !== null && bodies.length === 1 && bodies[0] !== undefined && parameterLists.length === 1 && parameterLists[0] !== undefined
    ? { name, node, body: bodies[0], parameterList: parameterLists[0] }
    : null;
}

function staticCppFunctionDeclaration(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode
): StaticCppFunctionDeclaration | null {
  const declaration =
    node.name === "TemplateDeclaration"
      ? directChildren(node).find(
          (child) => child.name === "Declaration" || child.name === "FunctionDefinition"
        )
      : node.name === "Declaration"
        ? node
        : undefined;
  if (declaration === undefined) {
    return null;
  }
  if (declaration.name === "FunctionDefinition") {
    const name = functionName(input, declaration, "Identifier");
    return name === null ? null : { name };
  }
  const declarators = directChildren(declaration).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const names = directChildren(declarators[0])
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return names.length === 1 && names[0] !== undefined ? { name: names[0] } : null;
}

function macroNames(input: CppExtractFileFactsInput, root: CppSyntaxNode): ReadonlySet<string> {
  const names = new Set<string>();
  function visit(node: CppSyntaxNode): void {
    if (node.name === "PreprocDirective") {
      const text = nodeText(input, node);
      const match = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/u.exec(text);
      if (match?.[1] !== undefined) {
        names.add(match[1]);
      } else if (/^\s*#\s*define\b/u.test(text)) {
        for (const name of identifierNames(input, node)) {
          names.add(name);
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }
  visit(root);
  return names;
}

function directBareCall(
  input: CppExtractFileFactsInput,
  statement: CppSyntaxNode
): { readonly name: string; readonly node: CppSyntaxNode } | null {
  if (statement.name !== "ExpressionStatement" && statement.name !== "ReturnStatement") {
    return null;
  }
  const calls = directChildren(statement).filter((child) => child.name === "CallExpression");
  if (calls.length !== 1 || calls[0] === undefined) {
    return null;
  }
  const children = directChildren(calls[0]);
  const callee = children[0];
  const arguments_ = children[1];
  const name = callee === undefined ? null : identifierText(input, callee);
  return (
    children.length === 2 &&
    callee?.name === "Identifier" &&
    arguments_?.name === "ArgumentList" &&
    name !== null
  )
    ? { name, node: calls[0] }
    : null;
}

function identifierNames(input: CppExtractFileFactsInput, node: CppSyntaxNode): readonly string[] {
  const name = node.name === "Identifier" ? identifierText(input, node) : null;
  return [
    ...(name === null ? [] : [name]),
    ...directChildren(node).flatMap((child) => identifierNames(input, child))
  ];
}

function declaratorBindingNames(input: CppExtractFileFactsInput, node: CppSyntaxNode): readonly string[] {
  if (node.name === "ParameterList") {
    return [];
  }
  if (node.name === "TypeIdentifier") {
    const name = identifierText(input, node);
    return name === null ? [] : [name];
  }
  return directChildren(node).flatMap((child) => declaratorBindingNames(input, child));
}

function localBindingNames(input: CppExtractFileFactsInput, statement: CppSyntaxNode): readonly string[] {
  if (statement.name === "AliasDeclaration") {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  if (statement.name === "TypeDefinition") {
    const declarators = directChildren(statement).filter((child) => child.name.endsWith("Declarator"));
    if (declarators.length > 0) {
      return declarators.flatMap((declarator) => declaratorBindingNames(input, declarator));
    }
    const names = directChildren(statement)
      .filter((child) => child.name === "TypeIdentifier")
      .map((child) => identifierText(input, child))
      .filter((value): value is string => value !== null);
    const name = names.at(-1);
    return name === undefined ? [] : [name];
  }
  if (["StructSpecifier", "ClassSpecifier", "EnumSpecifier"].includes(statement.name)) {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  return identifierNames(input, statement);
}

function directCallerCalls(
  input: CppExtractFileFactsInput,
  declaration: StaticCppFunction
): readonly { readonly name: string; readonly node: CppSyntaxNode }[] {
  const shadowedNames = new Set(identifierNames(input, declaration.parameterList));
  const calls: Array<{ readonly name: string; readonly node: CppSyntaxNode }> = [];
  for (const statement of directChildren(declaration.body)) {
    if (
      ["Declaration", "AliasDeclaration", "TypeDefinition", "StructSpecifier", "ClassSpecifier", "EnumSpecifier"].includes(
        statement.name
      )
    ) {
      for (const name of localBindingNames(input, statement)) {
        shadowedNames.add(name);
      }
      continue;
    }
    const call = directBareCall(input, statement);
    if (call !== null) {
      calls.push(call);
    }
  }
  return calls.filter((call) => !shadowedNames.has(call.name));
}

function staticCppClass(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppClass | null {
  if (node.name !== "ClassSpecifier") {
    return null;
  }
  const names = directChildren(node)
    .filter((child) => child.name === "TypeIdentifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const bodies = directChildren(node).filter((child) => child.name === "FieldDeclarationList");
  return names.length === 1 && bodies.length === 1 && names[0] !== undefined && bodies[0] !== undefined
    ? { name: names[0], node, body: bodies[0] }
    : null;
}

function staticCppMethod(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppMethod | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const name = functionName(input, node, "FieldIdentifier");
  return name === null ? null : { name, node };
}

function includesHttplib(input: CppExtractFileFactsInput, root: CppSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.name !== "PreprocDirective") {
      return false;
    }
    const header = directChildren(node).find(
      (child) => child.name === "SystemLibString" || child.name === "String"
    );
    return header !== undefined && ["<httplib.h>", '"httplib.h"'].includes(nodeText(input, header));
  });
}

function staticCppServer(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppServer | null {
  if (node.name !== "Declaration") {
    return null;
  }
  const children = directChildren(node);
  const type = children.find((child) => child.name === "ScopedTypeIdentifier");
  const names = children
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return (
    type !== undefined &&
    CPP_HTTPLIB_SERVER_TYPES.has(nodeText(input, type)) &&
    names.length === 1 &&
    names[0] !== undefined
  )
    ? { name: names[0], node }
    : null;
}

function assignmentReceiver(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const assignment = directChildren(node).find((child) => child.name === "AssignmentExpression");
  const receiver = assignment === undefined ? undefined : directChildren(assignment)[0];
  return receiver === undefined ? null : identifierText(input, receiver);
}

function staticCppHttplibRoute(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode
): StaticCppHttplibRoute | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const calls = directChildren(node).filter((child) => child.name === "CallExpression");
  if (calls.length !== 1 || calls[0] === undefined) {
    return null;
  }
  const children = directChildren(calls[0]);
  const callee = children[0];
  const arguments_ = children[1];
  if (
    children.length !== 2 ||
    callee?.name !== "FieldExpression" ||
    arguments_?.name !== "ArgumentList"
  ) {
    return null;
  }
  const fieldChildren = directChildren(callee);
  const receiver = fieldChildren[0] === undefined ? null : identifierText(input, fieldChildren[0]);
  const methodName = fieldChildren[1] === undefined ? null : identifierText(input, fieldChildren[1]);
  const method = methodName === null ? undefined : CPP_HTTPLIB_ROUTE_METHODS[methodName];
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  const path = values[0] === undefined ? null : staticCppPath(input, values[0]);
  const handlerName = values[1] === undefined ? null : identifierText(input, values[1]);
  return (
    fieldChildren.length === 2 &&
    receiver !== null &&
    method !== undefined &&
    values.length === 2 &&
    path !== null &&
    handlerName !== null
  )
    ? { receiver, method, path, handlerName, node }
    : null;
}

export function extractCppFileFacts(input: CppExtractFileFactsInput): ArtifactFacts {
  const cppHttplibCapability = frameworkCapability("cpp-httplib");
  if (!cppHttplibCapability.languages.includes(input.language)) {
    throw new Error("C++ framework extraction was invoked for an unsupported source language.");
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: CppSyntaxNode): void {
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

  function addFunction(declaration: StaticCppFunction): SymbolNode {
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

  function addClass(declaration: StaticCppClass): SymbolNode {
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

  function addMethod(parent: SymbolNode, declaration: StaticCppMethod): SymbolNode {
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

  function addHttplibRoute(
    parent: SymbolNode,
    routeFact: StaticCppHttplibRoute,
    handler: SymbolNode
  ): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${parent.qualifiedName}#route:${routeName}`;
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
    addContainment(parent, route, routeFact.node);
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
        ruleId: "framework.cpp-httplib.direct-server.literal-route.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addCall(caller: SymbolNode, callee: SymbolNode, node: CppSyntaxNode): void {
    const range = rangeFor(lineStarts, node.from, node.to);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: callee.name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: callee.name,
      evidence: {
        ruleId: "syntax.cpp.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const functions = topLevel
      .map((node) => staticCppFunction(input, node))
      .filter((candidate): candidate is StaticCppFunction => candidate !== null);
    const declarations = topLevel
      .map((node) => staticCppFunctionDeclaration(input, node))
      .filter((candidate): candidate is StaticCppFunctionDeclaration => candidate !== null);
    const functionSymbols = new Map<StaticCppFunction, SymbolNode>();
    const functionsByName = new Map<string, SymbolNode[]>();
    const declarationCountsByName = new Map<string, number>();
    for (const declaration of declarations) {
      declarationCountsByName.set(
        declaration.name,
        (declarationCountsByName.get(declaration.name) ?? 0) + 1
      );
    }
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      functionSymbols.set(functionDeclaration, symbol);
      functionsByName.set(functionDeclaration.name, [
        ...(functionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
    }

    const definedMacros = macroNames(input, root);
    for (const functionDeclaration of functions) {
      const caller = functionSymbols.get(functionDeclaration);
      if (caller === undefined) {
        continue;
      }
      for (const call of directCallerCalls(input, functionDeclaration)) {
        if (definedMacros.has(call.name)) {
          continue;
        }
        const candidates = functionsByName.get(call.name) ?? [];
        if (
          candidates.length === 1 &&
          candidates[0] !== undefined &&
          (declarationCountsByName.get(call.name) ?? 0) === 0
        ) {
          addCall(caller, candidates[0], call.node);
        }
      }
    }

    for (const classDeclaration of topLevel
      .map((node) => staticCppClass(input, node))
      .filter((candidate): candidate is StaticCppClass => candidate !== null)) {
      const classSymbol = addClass(classDeclaration);
      for (const methodDeclaration of directChildren(classDeclaration.body)
        .map((node) => staticCppMethod(input, node))
        .filter((candidate): candidate is StaticCppMethod => candidate !== null)) {
        addMethod(classSymbol, methodDeclaration);
      }
    }

    if (includesHttplib(input, root)) {
      for (const functionDeclaration of functions) {
        const parent = functionSymbols.get(functionDeclaration);
        if (parent === undefined) {
          continue;
        }
        const servers = new Map<string, StaticCppServer>();
        for (const statement of directChildren(functionDeclaration.body)) {
          const server = staticCppServer(input, statement);
          if (server !== null) {
            servers.set(server.name, server);
            continue;
          }
          const reboundName = assignmentReceiver(input, statement);
          if (reboundName !== null) {
            servers.delete(reboundName);
            continue;
          }
          const route = staticCppHttplibRoute(input, statement);
          if (route === null || !servers.has(route.receiver)) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          const handler = handlerCandidates.length === 1 ? handlerCandidates[0] : undefined;
          if (handler !== undefined) {
            addHttplibRoute(parent, route, handler);
          }
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

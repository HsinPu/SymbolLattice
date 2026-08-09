import { parser } from "@lezer/cpp";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface CExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "c";
}

/**
 * The bundled Lezer C++ parser accepts the common C declaration and expression
 * subset used here. This extractor deliberately interprets only C-shaped
 * top-level functions and CivetWeb's C API; C++ files continue through their
 * separate extractor and capability.
 */
type CSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticCFunction {
  readonly name: string;
  readonly node: CSyntaxNode;
  readonly body: CSyntaxNode;
  readonly parameterList: CSyntaxNode;
}

interface StaticCFunctionDeclaration {
  readonly name: string;
  readonly node: CSyntaxNode;
  readonly parameterList: CSyntaxNode;
}

interface StaticCivetWebRoute {
  readonly path: string;
  readonly handlerName: string;
  readonly node: CSyntaxNode;
}

function directChildren(node: CSyntaxNode): readonly CSyntaxNode[] {
  const children: CSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: CExtractFileFactsInput, node: CSyntaxNode): string {
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

function hasSyntaxError(node: CSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainCString(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
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

function staticCivetWebPath(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  const path = staticPlainCString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticCFunction(input: CExtractFileFactsInput, node: CSyntaxNode): StaticCFunction | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const bodies = directChildren(node).filter((child) => child.name === "CompoundStatement");
  const declarator = declarators.length === 1 ? declarators[0] : undefined;
  const body = bodies.length === 1 ? bodies[0] : undefined;
  if (declarator === undefined || body === undefined) {
    return null;
  }
  const nameNode = directChildren(declarator).find((child) => child.name === "Identifier");
  const parameterList = directChildren(declarator).find((child) => child.name === "ParameterList");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  return name === null || parameterList === undefined ? null : { name, node, body, parameterList };
}

function staticCFunctionDeclaration(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): StaticCFunctionDeclaration | null {
  if (node.name !== "Declaration") {
    return null;
  }
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const children = directChildren(declarators[0]);
  const names = children
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const parameterLists = children.filter((child) => child.name === "ParameterList");
  return names.length === 1 && names[0] !== undefined && parameterLists.length === 1 && parameterLists[0] !== undefined
    ? { name: names[0], node, parameterList: parameterLists[0] }
    : null;
}

function cParameterSignature(input: CExtractFileFactsInput, parameterList: CSyntaxNode): string {
  const characters = nodeText(input, parameterList).split("");
  function maskParameterNames(node: CSyntaxNode): void {
    if (node.name === "Identifier") {
      characters.fill(" ", node.from - parameterList.from, node.to - parameterList.from);
      return;
    }
    for (const child of directChildren(node)) {
      maskParameterNames(child);
    }
  }
  maskParameterNames(parameterList);
  return characters.join("").replace(/\s+/gu, "");
}

function cFunctionSignature(
  input: CExtractFileFactsInput,
  node: CSyntaxNode,
  parameterList: CSyntaxNode
): string | null {
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const declarator = declarators.length === 1 ? declarators[0] : undefined;
  if (declarator === undefined) {
    return null;
  }
  const returnType = input.sourceText.slice(node.from, declarator.from).replace(/\s+/gu, "");
  return returnType.length === 0 ? null : `${returnType}\u0000${cParameterSignature(input, parameterList)}`;
}

function includesCivetWeb(input: CExtractFileFactsInput, root: CSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.name !== "PreprocDirective") {
      return false;
    }
    const header = directChildren(node).find(
      (child) => child.name === "SystemLibString" || child.name === "String"
    );
    return header !== undefined && ["<civetweb.h>", '"civetweb.h"'].includes(nodeText(input, header));
  });
}

function staticCivetWebRoute(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): StaticCivetWebRoute | null {
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
    callee?.name !== "Identifier" ||
    identifierText(input, callee) !== "mg_set_request_handler" ||
    arguments_?.name !== "ArgumentList"
  ) {
    return null;
  }
  const values = directChildren(arguments_).filter((child) => !["(", ")", ","].includes(child.name));
  const contextName = values[0] === undefined ? null : identifierText(input, values[0]);
  const path = values[1] === undefined ? null : staticCivetWebPath(input, values[1]);
  const handlerName = values[2] === undefined ? null : identifierText(input, values[2]);
  return values.length === 4 && contextName !== null && path !== null && handlerName !== null
    ? { path, handlerName, node }
    : null;
}

function containsIdentifier(input: CExtractFileFactsInput, node: CSyntaxNode, name: string): boolean {
  return (
    (node.name === "Identifier" && identifierText(input, node) === name) ||
    directChildren(node).some((child) => containsIdentifier(input, child, name))
  );
}

/**
 * A same-name function cannot prove a handler if a direct parameter or direct
 * declaration in the registration function could shadow the handler name.
 * This deliberately rejects plausible C code rather than emitting a false edge.
 */
function hasPotentialHandlerShadow(
  input: CExtractFileFactsInput,
  declaration: StaticCFunction,
  handlerName: string
): boolean {
  if (containsIdentifier(input, declaration.parameterList, handlerName)) {
    return true;
  }
  return directChildren(declaration.body).some(
    (statement) =>
      statement.name === "Declaration" && containsIdentifier(input, statement, handlerName)
  );
}

function macroNames(input: CExtractFileFactsInput, root: CSyntaxNode): ReadonlySet<string> {
  const names = new Set<string>();
  function visit(node: CSyntaxNode): void {
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
  input: CExtractFileFactsInput,
  statement: CSyntaxNode
): { readonly name: string; readonly node: CSyntaxNode } | null {
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

function identifierNames(input: CExtractFileFactsInput, node: CSyntaxNode): readonly string[] {
  const name = node.name === "Identifier" ? identifierText(input, node) : null;
  return [
    ...(name === null ? [] : [name]),
    ...directChildren(node).flatMap((child) => identifierNames(input, child))
  ];
}

function localBindingNames(input: CExtractFileFactsInput, statement: CSyntaxNode): readonly string[] {
  if (statement.name === "AliasDeclaration") {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  if (statement.name === "TypeDefinition") {
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
  input: CExtractFileFactsInput,
  declaration: StaticCFunction
): readonly { readonly name: string; readonly node: CSyntaxNode }[] {
  const shadowedNames = new Set(identifierNames(input, declaration.parameterList));
  const calls: Array<{ readonly name: string; readonly node: CSyntaxNode }> = [];
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

/**
 * Extracts C file/function symbols plus one intentionally narrow CivetWeb C
 * API surface. A route requires a direct civetweb.h include, a direct literal
 * `mg_set_request_handler` call in a top-level function body, and one unique
 * unshadowed top-level named handler function. CivetWeb does not bind a method
 * at registration time, so accepted registrations use the route method `ALL`.
 */
export function extractCFileFacts(input: CExtractFileFactsInput): ArtifactFacts {
  const civetWebCapability = frameworkCapability("civetweb");
  if (!civetWebCapability.languages.includes(input.language)) {
    throw new Error("CivetWeb extraction was invoked for an unsupported source language.");
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: CSyntaxNode): void {
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

  function addFunction(declaration: StaticCFunction): SymbolNode {
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

  function addCivetWebRoute(
    parent: SymbolNode,
    routeFact: StaticCivetWebRoute,
    handler: SymbolNode
  ): void {
    const routeName = `ALL ${routeFact.path}`;
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
        ruleId: "framework.civetweb.direct-request-handler.literal-uri.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addCall(caller: SymbolNode, callee: SymbolNode, node: CSyntaxNode): void {
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
        ruleId: "syntax.c.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const functions = directChildren(root)
      .map((node) => staticCFunction(input, node))
      .filter((candidate): candidate is StaticCFunction => candidate !== null);
    const declarations = directChildren(root)
      .map((node) => staticCFunctionDeclaration(input, node))
      .filter((candidate): candidate is StaticCFunctionDeclaration => candidate !== null);
    const symbolsByFunction = new Map<StaticCFunction, SymbolNode>();
    const functionsByName = new Map<string, SymbolNode[]>();
    const functionSignaturesBySymbolId = new Map<string, string | null>();
    const declarationSignaturesByName = new Map<string, Array<string | null>>();
    for (const declaration of declarations) {
      declarationSignaturesByName.set(declaration.name, [
        ...(declarationSignaturesByName.get(declaration.name) ?? []),
        cFunctionSignature(input, declaration.node, declaration.parameterList)
      ]);
    }
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      symbolsByFunction.set(functionDeclaration, symbol);
      functionSignaturesBySymbolId.set(
        symbol.id,
        cFunctionSignature(input, functionDeclaration.node, functionDeclaration.parameterList)
      );
      functionsByName.set(functionDeclaration.name, [
        ...(functionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
    }

    const definedMacros = macroNames(input, root);
    for (const functionDeclaration of functions) {
      const caller = symbolsByFunction.get(functionDeclaration);
      if (caller === undefined) {
        continue;
      }
      for (const call of directCallerCalls(input, functionDeclaration)) {
        if (definedMacros.has(call.name)) {
          continue;
        }
        const candidates = functionsByName.get(call.name) ?? [];
        const candidate = candidates.length === 1 ? candidates[0] : undefined;
        const candidateSignature =
          candidate === undefined ? undefined : functionSignaturesBySymbolId.get(candidate.id);
        if (
          candidate !== undefined &&
          candidateSignature !== undefined &&
          candidateSignature !== null &&
          declarationSignaturesByName
            .get(call.name)
            ?.every((signature) => signature === candidateSignature) !== false
        ) {
          addCall(caller, candidate, call.node);
        }
      }
    }

    if (includesCivetWeb(input, root)) {
      for (const functionDeclaration of functions) {
        const parent = symbolsByFunction.get(functionDeclaration);
        if (parent === undefined) {
          continue;
        }
        for (const statement of directChildren(functionDeclaration.body)) {
          const route = staticCivetWebRoute(input, statement);
          if (route === null || hasPotentialHandlerShadow(input, functionDeclaration, route.handlerName)) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          const handler = handlerCandidates.length === 1 ? handlerCandidates[0] : undefined;
          if (handler !== undefined) {
            addCivetWebRoute(parent, route, handler);
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

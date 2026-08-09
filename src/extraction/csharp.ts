import { parse, type SgNode } from "./ast-grep-languages.js";

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

/**
 * C# is parsed through the shared prebuilt ast-grep Tree-sitter registry,
 * keeping extraction synchronous without a host C/C++ build.
 */

export interface CsharpExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "csharp";
}

type CsharpSyntaxNode = SgNode;

interface StaticCsharpType {
  readonly kind: "class" | "interface";
  readonly isPartial: boolean;
  readonly isStatic: boolean;
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly body: CsharpSyntaxNode;
}

interface StaticCsharpMethod {
  readonly body: CsharpSyntaxNode | null;
  readonly isStatic: boolean;
  readonly name: string;
  readonly node: CsharpSyntaxNode;
}

interface StaticCsharpFunction {
  readonly name: string;
  readonly node: CsharpSyntaxNode;
}

interface StaticCsharpAttribute {
  readonly name: string;
  readonly shortName: string;
  /** Null only for a directly argument-free attribute such as HttpGet. */
  readonly argument: string | null;
}

interface StaticAspNetMinimalApplication {
  readonly name: string;
  readonly node: CsharpSyntaxNode;
}

interface StaticAspNetMinimalRoute {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: CsharpSyntaxNode;
}

interface StaticAspNetControllerRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: CsharpSyntaxNode;
}

interface StaticCsharpVariableDeclaration {
  readonly name: string;
  readonly initializer: CsharpSyntaxNode;
  readonly node: CsharpSyntaxNode;
}

interface StaticMemberInvocation {
  readonly receiver: CsharpSyntaxNode;
  readonly name: string;
  readonly argumentList: CsharpSyntaxNode;
}

const ASPNET_MVC_NAMESPACE = "Microsoft.AspNetCore.Mvc";

const ASPNET_MINIMAL_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  MapGet: "GET",
  MapPost: "POST",
  MapPut: "PUT",
  MapPatch: "PATCH",
  MapDelete: "DELETE"
};

const ASPNET_CONTROLLER_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  HttpGet: "GET",
  HttpPost: "POST",
  HttpPut: "PUT",
  HttpPatch: "PATCH",
  HttpDelete: "DELETE",
  HttpHead: "HEAD",
  HttpOptions: "OPTIONS"
};

function directChildren(node: CsharpSyntaxNode): readonly CsharpSyntaxNode[] {
  return node.children();
}

function nodeText(node: CsharpSyntaxNode): string {
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

function rangeForNode(node: CsharpSyntaxNode): SourceRange {
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

function hasSyntaxError(node: CsharpSyntaxNode): boolean {
  return node.kind() === "ERROR" || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(node: CsharpSyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainCsharpString(node: CsharpSyntaxNode): string | null {
  if (node.kind() !== "string_literal") {
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
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticMinimalPath(node: CsharpSyntaxNode): string | null {
  const path = staticPlainCsharpString(node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function normalizedControllerPath(value: string): string | null {
  if (value.includes("//") || value.includes("[") || value.includes("]")) {
    return null;
  }
  const withoutOuterSlashes = value.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return withoutOuterSlashes.length === 0 ? "/" : "/" + withoutOuterSlashes;
}

function joinControllerPaths(prefix: string, path: string): string {
  if (prefix === "/") {
    return path;
  }
  if (path === "/") {
    return prefix;
  }
  return prefix + path;
}

function staticAttributeArgument(node: CsharpSyntaxNode): string | null | undefined {
  const argumentLists = directChildren(node).filter(
    (child) => child.kind() === "attribute_argument_list"
  );
  if (argumentLists.length === 0) {
    return null;
  }
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return undefined;
  }
  const arguments_ = directChildren(argumentLists[0]).filter(
    (child) => child.kind() === "attribute_argument"
  );
  if (arguments_.length !== 1 || arguments_[0] === undefined) {
    return undefined;
  }
  const children = directChildren(arguments_[0]);
  if (children.length !== 1 || children[0]?.kind() !== "string_literal") {
    return undefined;
  }
  return staticPlainCsharpString(children[0]);
}

function staticCsharpAttribute(node: CsharpSyntaxNode): StaticCsharpAttribute | null {
  if (node.kind() !== "attribute") {
    return null;
  }
  const nameNode = directChildren(node).find(
    (child) => child.kind() === "identifier" || child.kind() === "qualified_name"
  );
  const argument = staticAttributeArgument(node);
  if (nameNode === undefined || argument === undefined) {
    return null;
  }
  const name = nodeText(nameNode);
  const lastSegment = name.split(".").at(-1);
  if (lastSegment === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(lastSegment)) {
    return null;
  }
  const shortName = lastSegment.endsWith("Attribute")
    ? lastSegment.slice(0, -"Attribute".length)
    : lastSegment;
  return { name, shortName, argument };
}

function staticRouteAttributes(node: CsharpSyntaxNode): readonly StaticCsharpAttribute[] {
  const attributes: StaticCsharpAttribute[] = [];
  for (const list of directChildren(node).filter((child) => child.kind() === "attribute_list")) {
    for (const attributeNode of directChildren(list).filter((child) => child.kind() === "attribute")) {
      const attribute = staticCsharpAttribute(attributeNode);
      if (attribute !== null) {
        attributes.push(attribute);
      }
    }
  }
  return attributes;
}

function isMvcAttribute(
  attribute: StaticCsharpAttribute,
  shortName: string,
  hasMvcImport: boolean
): boolean {
  return (
    attribute.shortName === shortName &&
    (hasMvcImport ||
      attribute.name === ASPNET_MVC_NAMESPACE + "." + shortName ||
      attribute.name === ASPNET_MVC_NAMESPACE + "." + shortName + "Attribute")
  );
}

function hasDirectMvcImport(root: CsharpSyntaxNode): boolean {
  return (
    directChildren(root).filter((node) => {
      const text = nodeText(node).trim();
      return (
        (node.kind() === "using_directive" && text === "using " + ASPNET_MVC_NAMESPACE + ";") ||
        (node.kind() === "global_using_directive" &&
          text === "global using " + ASPNET_MVC_NAMESPACE + ";")
      );
    }).length === 1
  );
}

function staticCsharpType(node: CsharpSyntaxNode): StaticCsharpType | null {
  const kind =
    node.kind() === "class_declaration"
      ? "class"
      : node.kind() === "interface_declaration"
        ? "interface"
        : null;
  if (kind === null) {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.kind() === "identifier");
  const body = children.find((child) => child.kind() === "declaration_list");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const isStatic = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "static"
  );
  const isPartial = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "partial"
  );
  return name === null || body === undefined ? null : { kind, isPartial, isStatic, name, node, body };
}

function directTopLevelTypeNodes(root: CsharpSyntaxNode): readonly CsharpSyntaxNode[] {
  const nodes: CsharpSyntaxNode[] = [];
  for (const child of directChildren(root)) {
    if (child.kind() === "class_declaration" || child.kind() === "interface_declaration") {
      nodes.push(child);
      continue;
    }
    if (child.kind() !== "namespace_declaration") {
      continue;
    }
    const declarationList = directChildren(child).find(
      (candidate) => candidate.kind() === "declaration_list"
    );
    if (declarationList === undefined) {
      continue;
    }
    for (const declaration of directChildren(declarationList)) {
      if (
        declaration.kind() === "class_declaration" ||
        declaration.kind() === "interface_declaration"
      ) {
        nodes.push(declaration);
      }
    }
  }
  return nodes;
}

function staticCsharpMethod(node: CsharpSyntaxNode): StaticCsharpMethod | null {
  if (node.kind() !== "method_declaration") {
    return null;
  }
  const children = directChildren(node);
  const parametersIndex = children.findIndex((child) => child.kind() === "parameter_list");
  if (parametersIndex <= 0) {
    return null;
  }
  const nameNode = children
    .slice(0, parametersIndex)
    .filter((child) => child.kind() === "identifier")
    .at(-1);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const body = children.find(
    (child) => child.kind() === "block" || child.kind() === "arrow_expression_clause"
  );
  const isStatic = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "static"
  );
  return name === null ? null : { body: body ?? null, isStatic, name, node };
}

function hasAmbiguousCsharpUsing(root: CsharpSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.kind() !== "using_directive" && node.kind() !== "global_using_directive") {
      return false;
    }
    const text = nodeText(node);
    return /\busing\s+static\b/u.test(text) || /=/u.test(text);
  });
}

function hasCsharpMethodParameterNamed(method: StaticCsharpMethod, name: string): boolean {
  const parameterList = directChildren(method.node).find((child) => child.kind() === "parameter_list");
  return parameterList !== undefined && new RegExp(`\\b${name}\\b`, "u").test(nodeText(parameterList));
}

function csharpDirectCalls(body: CsharpSyntaxNode): {
  readonly calls: readonly { readonly name: string; readonly node: CsharpSyntaxNode }[];
  readonly boundNames: ReadonlySet<string>;
  readonly unsafe: boolean;
} {
  const calls: Array<{ readonly name: string; readonly node: CsharpSyntaxNode }> = [];
  const boundNames = new Set<string>();
  let unsafe = false;
  const bindingKinds: ReadonlySet<string> = new Set([
    "local_declaration_statement",
    "declaration_pattern",
    "catch_declaration",
    "for_each_statement",
    "for_statement",
    "using_statement",
    "fixed_statement"
  ]);
  const collectIdentifiers = (node: CsharpSyntaxNode): void => {
    const name = identifierText(node);
    if (name !== null) {
      boundNames.add(name);
    }
    for (const child of directChildren(node)) {
      collectIdentifiers(child);
    }
  };
  const visit = (node: CsharpSyntaxNode): void => {
    if (
      node.kind() === "local_function_statement" ||
      node.kind() === "lambda_expression" ||
      node.kind() === "anonymous_method_expression"
    ) {
      unsafe = true;
      return;
    }
    if (bindingKinds.has(node.kind() as string)) {
      collectIdentifiers(node);
    }
    if (node.kind() === "invocation_expression") {
      const children = directChildren(node);
      const callee = children[0];
      const arguments_ = children[1];
      const name = callee === undefined ? null : identifierText(callee);
      if (name !== null && arguments_?.kind() === "argument_list" && children.length === 2) {
        calls.push({ name, node });
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  };
  visit(body);
  return { calls, boundNames, unsafe };
}

function staticCsharpFunction(node: CsharpSyntaxNode): StaticCsharpFunction | null {
  if (node.kind() !== "global_statement") {
    return null;
  }
  const functionNode = directChildren(node).find(
    (child) => child.kind() === "local_function_statement"
  );
  if (functionNode === undefined) {
    return null;
  }
  const children = directChildren(functionNode);
  const parametersIndex = children.findIndex((child) => child.kind() === "parameter_list");
  if (parametersIndex <= 0) {
    return null;
  }
  const nameNode = children
    .slice(0, parametersIndex)
    .filter((child) => child.kind() === "identifier")
    .at(-1);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null ? null : { name, node: functionNode };
}

function staticVariableDeclaration(node: CsharpSyntaxNode): StaticCsharpVariableDeclaration | null {
  if (node.kind() !== "global_statement") {
    return null;
  }
  const statement = directChildren(node).find(
    (child) => child.kind() === "local_declaration_statement"
  );
  if (statement === undefined) {
    return null;
  }
  const declarations = directChildren(statement).filter(
    (child) => child.kind() === "variable_declaration"
  );
  if (declarations.length !== 1 || declarations[0] === undefined) {
    return null;
  }
  const declarators = directChildren(declarations[0]).filter(
    (child) => child.kind() === "variable_declarator"
  );
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const children = directChildren(declarators[0]);
  const nameNode = children.find((child) => child.kind() === "identifier");
  const initializer = children.find((child) => child.kind() === "invocation_expression");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null || initializer === undefined
    ? null
    : { name, initializer, node };
}

function staticMemberInvocation(node: CsharpSyntaxNode): StaticMemberInvocation | null {
  if (node.kind() !== "invocation_expression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children.find((child) => child.kind() === "member_access_expression");
  const argumentList = children.find((child) => child.kind() === "argument_list");
  if (callee === undefined || argumentList === undefined || children.length !== 2) {
    return null;
  }
  const memberChildren = directChildren(callee);
  const receiver = memberChildren[0];
  const nameNode = memberChildren.at(-1);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return (
    receiver === undefined ||
    name === null ||
    memberChildren.length !== 3 ||
    memberChildren[1]?.kind() !== "."
  )
    ? null
    : { receiver, name, argumentList };
}

function staticArgumentValues(argumentList: CsharpSyntaxNode): readonly CsharpSyntaxNode[] | null {
  const values: CsharpSyntaxNode[] = [];
  for (const argument of directChildren(argumentList).filter(
    (child) => child.kind() === "argument"
  )) {
    const children = directChildren(argument);
    if (children.length !== 1 || children[0] === undefined) {
      return null;
    }
    values.push(children[0]);
  }
  return values;
}

function hasNoArguments(invocation: StaticMemberInvocation): boolean {
  const values = staticArgumentValues(invocation.argumentList);
  return values !== null && values.length === 0;
}

function isWebApplicationBuilderInvocation(node: CsharpSyntaxNode): boolean {
  const invocation = staticMemberInvocation(node);
  if (invocation === null || invocation.name !== "CreateBuilder") {
    return false;
  }
  const receiver = identifierText(invocation.receiver);
  return receiver === "WebApplication" && staticArgumentValues(invocation.argumentList) !== null;
}

function staticMinimalApplication(
  declaration: StaticCsharpVariableDeclaration,
  builderNames: ReadonlySet<string>
): StaticAspNetMinimalApplication | null {
  const build = staticMemberInvocation(declaration.initializer);
  if (build === null || build.name !== "Build" || !hasNoArguments(build)) {
    return null;
  }
  if (isWebApplicationBuilderInvocation(build.receiver)) {
    return { name: declaration.name, node: declaration.node };
  }
  const receiver = identifierText(build.receiver);
  return receiver !== null && builderNames.has(receiver)
    ? { name: declaration.name, node: declaration.node }
    : null;
}

function staticReboundName(node: CsharpSyntaxNode): string | null {
  if (node.kind() !== "global_statement") {
    return null;
  }
  const statement = directChildren(node).find(
    (child) => child.kind() === "expression_statement"
  );
  const assignment =
    statement === undefined
      ? undefined
      : directChildren(statement).find((child) => child.kind() === "assignment_expression");
  const receiver = assignment === undefined ? undefined : directChildren(assignment)[0];
  return receiver === undefined ? null : identifierText(receiver);
}

function staticMinimalRoute(node: CsharpSyntaxNode): StaticAspNetMinimalRoute | null {
  if (node.kind() !== "global_statement") {
    return null;
  }
  const statement = directChildren(node).find(
    (child) => child.kind() === "expression_statement"
  );
  const invocation =
    statement === undefined
      ? null
      : directChildren(statement)
          .map((child) => staticMemberInvocation(child))
          .find((candidate): candidate is StaticMemberInvocation => candidate !== null) ?? null;
  if (invocation === null) {
    return null;
  }
  const receiver = identifierText(invocation.receiver);
  const method = ASPNET_MINIMAL_ROUTE_METHODS[invocation.name];
  const values = staticArgumentValues(invocation.argumentList);
  if (
    receiver === null ||
    method === undefined ||
    values === null ||
    values.length !== 2 ||
    values[0] === undefined ||
    values[1] === undefined
  ) {
    return null;
  }
  const path = staticMinimalPath(values[0]);
  const handlerName = identifierText(values[1]);
  return path === null || handlerName === null
    ? null
    : { receiver, method, path, handlerName, node };
}

function staticControllerPath(
  type: StaticCsharpType,
  hasMvcImport: boolean
): string | null {
  if (type.kind !== "class") {
    return null;
  }
  const attributes = staticRouteAttributes(type.node);
  const apiController = attributes.filter((attribute) =>
    isMvcAttribute(attribute, "ApiController", hasMvcImport)
  );
  const route = attributes.filter((attribute) => isMvcAttribute(attribute, "Route", hasMvcImport));
  if (
    apiController.length !== 1 ||
    route.length !== 1 ||
    route[0] === undefined ||
    route[0].argument === null
  ) {
    return null;
  }
  return normalizedControllerPath(route[0].argument);
}

function staticControllerRoute(
  method: StaticCsharpMethod,
  controllerPath: string,
  hasMvcImport: boolean
): StaticAspNetControllerRoute | null {
  const attributes = staticRouteAttributes(method.node).filter((attribute) =>
    Object.hasOwn(ASPNET_CONTROLLER_ROUTE_METHODS, attribute.shortName) &&
    isMvcAttribute(attribute, attribute.shortName, hasMvcImport)
  );
  if (attributes.length !== 1 || attributes[0] === undefined) {
    return null;
  }
  const routeMethod = ASPNET_CONTROLLER_ROUTE_METHODS[attributes[0].shortName];
  if (routeMethod === undefined) {
    return null;
  }
  if (attributes[0].argument === null) {
    return { method: routeMethod, path: controllerPath, node: method.node };
  }
  const methodPath = normalizedControllerPath(attributes[0].argument);
  return methodPath === null
    ? null
    : {
        method: routeMethod,
        path: joinControllerPaths(controllerPath, methodPath),
        node: method.node
      };
}

export function extractCsharpFileFacts(input: CsharpExtractFileFactsInput): ArtifactFacts {
  const aspNetCapability = frameworkCapability("aspnet-core");
  if (!aspNetCapability.languages.includes(input.language)) {
    throw new Error("ASP.NET Core framework extraction was invoked for an unsupported source language.");
  }

  const root = parse("csharp", input.sourceText).root();
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: CsharpSyntaxNode): void {
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

  function addType(declaration: StaticCsharpType): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, declaration.kind);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: declaration.kind,
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: declaration.kind,
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticCsharpMethod): SymbolNode {
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

  function addFunction(declaration: StaticCsharpFunction): SymbolNode {
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

  function addRoute(
    parent: SymbolNode,
    routeFact: StaticAspNetMinimalRoute | StaticAspNetControllerRoute,
    handler: SymbolNode,
    ruleId: string
  ): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = parent.qualifiedName + "#route:" + routeName;
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
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addExactSameStaticClassMethodCall(
    caller: SymbolNode,
    callee: SymbolNode,
    name: string,
    node: CsharpSyntaxNode
  ): void {
    const range = rangeForNode(node);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: name,
      evidence: {
        ruleId: "syntax.csharp.same-file.unique-static-class-method-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const types = directTopLevelTypeNodes(root)
      .map((node) => staticCsharpType(node))
      .filter((candidate): candidate is StaticCsharpType => candidate !== null);
    const hasMvcImport = hasDirectMvcImport(root);
    const staticClassMethods: Array<{
      readonly declaration: StaticCsharpMethod;
      readonly symbol: SymbolNode;
      readonly type: StaticCsharpType;
      readonly typeSymbol: SymbolNode;
    }> = [];

    for (const type of types) {
      const typeSymbol = addType(type);
      const controllerPath = staticControllerPath(type, hasMvcImport);
      const methods = directChildren(type.body)
        .map((node) => staticCsharpMethod(node))
        .filter((candidate): candidate is StaticCsharpMethod => candidate !== null);
      for (const methodDeclaration of methods) {
        const methodSymbol = addMethod(typeSymbol, methodDeclaration);
        staticClassMethods.push({ declaration: methodDeclaration, symbol: methodSymbol, type, typeSymbol });
        if (controllerPath === null) {
          continue;
        }
        const route = staticControllerRoute(methodDeclaration, controllerPath, hasMvcImport);
        if (route !== null) {
          addRoute(
            typeSymbol,
            route,
            methodSymbol,
            "framework.aspnet-core.direct-api-controller.literal-route.method"
          );
        }
      }
    }

    if (!hasAmbiguousCsharpUsing(root)) {
      for (const caller of staticClassMethods) {
        if (
          caller.type.kind !== "class" ||
          caller.type.isPartial ||
          !caller.type.isStatic ||
          !caller.declaration.isStatic ||
          caller.declaration.body === null ||
          types.filter((type) => type.kind === "class" && type.name === caller.type.name).length !== 1
        ) {
          continue;
        }
        const directCalls = csharpDirectCalls(caller.declaration.body);
        if (directCalls.unsafe) {
          continue;
        }
        for (const call of directCalls.calls) {
          if (
            directCalls.boundNames.has(call.name) ||
            hasCsharpMethodParameterNamed(caller.declaration, call.name)
          ) {
            continue;
          }
          const candidates = staticClassMethods.filter(
            (candidate) => candidate.typeSymbol.id === caller.typeSymbol.id && candidate.declaration.name === call.name
          );
          if (
            candidates.length !== 1 ||
            candidates[0] === undefined ||
            !candidates[0].declaration.isStatic
          ) {
            continue;
          }
          addExactSameStaticClassMethodCall(caller.symbol, candidates[0].symbol, call.name, call.node);
        }
      }
    }

    const globalStatements = directChildren(root).filter(
      (node) => node.kind() === "global_statement"
    );
    const functions = globalStatements
      .map((node) => staticCsharpFunction(node))
      .filter((candidate): candidate is StaticCsharpFunction => candidate !== null);
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      functionsByName.set(functionDeclaration.name, [
        ...(functionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
    }

    const builders = new Set<string>();
    const applications = new Map<string, StaticAspNetMinimalApplication>();
    for (const statement of globalStatements) {
      const declaration = staticVariableDeclaration(statement);
      if (declaration !== null) {
        builders.delete(declaration.name);
        applications.delete(declaration.name);
        if (isWebApplicationBuilderInvocation(declaration.initializer)) {
          builders.add(declaration.name);
          continue;
        }
        const application = staticMinimalApplication(declaration, builders);
        if (application !== null) {
          applications.set(application.name, application);
        }
        continue;
      }

      const reboundName = staticReboundName(statement);
      if (reboundName !== null) {
        builders.delete(reboundName);
        applications.delete(reboundName);
        continue;
      }

      const route = staticMinimalRoute(statement);
      if (route === null || !applications.has(route.receiver)) {
        continue;
      }
      const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
      const handler = handlerCandidates.length === 1 ? handlerCandidates[0] : undefined;
      if (handler !== undefined) {
        addRoute(
          fileNode,
          route,
          handler,
          "framework.aspnet-core.direct-web-application.literal-route.local-function"
        );
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

import { parser } from "@lezer/python";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type FastApiImportedRouterInclusionFact,
  type FastApiRouterDeclarationFact,
  type FastApiRouterRouteFact,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface PythonExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "python";
}

type PythonSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

type FrameworkImportedConstructor = "FastAPI" | "APIRouter" | "Flask" | "Blueprint";

interface FrameworkNamedImport {
  readonly importedName: string;
  readonly alias: string;
  readonly node: PythonSyntaxNode;
}

interface FrameworkDirectInstance {
  readonly name: string;
  readonly constructorName: string;
  readonly node: PythonSyntaxNode;
}

interface FastApiApplication extends FrameworkDirectInstance {}

interface FastApiRouter extends FrameworkDirectInstance {
  readonly prefix: string;
}

interface FlaskApplication extends FrameworkDirectInstance {}

interface FlaskBlueprint extends FrameworkDirectInstance {
  readonly prefix: string;
}

interface StaticFastApiDecorator {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

interface StaticFastApiRouterInclusion {
  readonly applicationName: string;
  readonly routerName: string;
  readonly prefix: string;
  readonly node: PythonSyntaxNode;
}

interface StaticFlaskDecorator {
  readonly receiver: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

interface StaticFlaskBlueprintRegistration {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly prefix: string;
  readonly node: PythonSyntaxNode;
}

/** A one-dot, single-name Python relative import that can carry an APIRouter. */
interface StaticFastApiRelativeRouterImport {
  readonly moduleSpecifier: string;
  readonly importedRouterName: string;
  readonly routerName: string;
  readonly node: PythonSyntaxNode;
}

const FASTAPI_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE"
};

const FLASK_SHORTCUT_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE"
};

const FLASK_ROUTE_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE"
]);

function directChildren(node: PythonSyntaxNode): readonly PythonSyntaxNode[] {
  const children: PythonSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: PythonExtractFileFactsInput, node: PythonSyntaxNode): string {
  return input.sourceText.slice(node.from, node.to);
}

function nodeKey(node: PythonSyntaxNode): string {
  return `${node.name}:${node.from}:${node.to}`;
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

function hasSyntaxError(node: PythonSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function declarationName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const name =
    node.name === "VariableName"
      ? node
      : directChildren(node).find((child) => child.name === "VariableName");
  const text = name === undefined ? "" : nodeText(input, name);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(text) ? text : null;
}

function decoratedDefinition(node: PythonSyntaxNode): PythonSyntaxNode | null {
  if (node.name !== "DecoratedStatement") {
    return null;
  }
  const definitions = directChildren(node).filter(
    (child) => child.name === "FunctionDefinition" || child.name === "ClassDefinition"
  );
  return definitions.length === 1 ? definitions[0] ?? null : null;
}

function isDirectClassMethod(node: PythonSyntaxNode): boolean {
  const decorated = node.parent?.name === "DecoratedStatement" ? node.parent : null;
  const body = decorated?.parent ?? node.parent;
  return body?.name === "Body" && body.parent?.name === "ClassDefinition";
}

function isTopLevelFunction(node: PythonSyntaxNode): boolean {
  const statement = node.parent?.name === "DecoratedStatement" ? node.parent : node;
  return statement.parent?.name === "Script";
}

function staticNamedFrameworkImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  packageName: string
): readonly FrameworkNamedImport[] {
  if (node.name !== "ImportStatement") {
    return [];
  }
  const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(
    `^from[ \\t]+${escapedPackageName}[ \\t]+import[ \\t]+(.+?)[ \\t]*$`,
    "u"
  ).exec(nodeText(input, node));
  if (match?.[1] === undefined) {
    return [];
  }

  const namedImports = match[1]
    .split(",")
    .map((entry) => {
      const parsed = /^([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?$/u.exec(
        entry.trim()
      );
      return parsed === null ? null : { importedName: parsed[1] ?? "", alias: parsed[2] };
    });
  if (namedImports.some((entry) => entry === null)) {
    return [];
  }

  return namedImports.flatMap((entry) =>
    entry === null
      ? []
      : [
          {
            importedName: entry.importedName,
            alias: entry.alias ?? entry.importedName,
            node
          }
        ]
  );
}

function staticFastApiImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "fastapi");
}

function staticFlaskImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "flask");
}

/**
 * Retains only the deliberately narrow import form supported by the project
 * resolver: `from .package.module import router [as local_router]`.
 *
 * A single leading dot keeps the package calculation local and testable. Parent
 * imports, wildcard imports, import lists, and package-only imports remain
 * unsupported until they can be modeled with equally strong evidence.
 */
function staticFastApiRelativeRouterImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFastApiRelativeRouterImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+(\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[ \t]+import[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    moduleSpecifier: match[1],
    importedRouterName: match[2],
    routerName: match[3] ?? match[2],
    node
  };
}

function directAssignmentName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const target = directChildren(node)[0];
  return target?.name === "VariableName" ? declarationName(input, target) : null;
}

function staticFrameworkConstructorAssignment(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): (FrameworkDirectInstance & { readonly arguments_: PythonSyntaxNode }) | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const call = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "VariableName" ||
    operator?.name !== "AssignOp" ||
    call?.name !== "CallExpression"
  ) {
    return null;
  }

  const name = declarationName(input, target);
  const callChildren = directChildren(call);
  const constructor = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    name === null ||
    callChildren.length !== 2 ||
    constructor?.name !== "VariableName" ||
    arguments_?.name !== "ArgList"
  ) {
    return null;
  }

  const constructorName = declarationName(input, constructor);
  return constructorName === null || !constructorNames.has(constructorName)
    ? null
    : { name, constructorName, node, arguments_ };
}

function staticFastApiApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FastApiApplication | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  return assignment === null
    ? null
    : { name: assignment.name, constructorName: assignment.constructorName, node: assignment.node };
}

function staticArgumentEntries(argumentList: PythonSyntaxNode): readonly PythonSyntaxNode[] {
  return directChildren(argumentList).filter(
    (child) => child.name !== "(" && child.name !== ")" && child.name !== ","
  );
}

function staticKeywordArguments(
  input: PythonExtractFileFactsInput,
  entries: readonly PythonSyntaxNode[]
): ReadonlyMap<string, PythonSyntaxNode> | null {
  const arguments_ = new Map<string, PythonSyntaxNode>();
  for (let index = 0; index < entries.length; index += 3) {
    const nameNode = entries[index];
    const operator = entries[index + 1];
    const value = entries[index + 2];
    if (nameNode?.name !== "VariableName" || operator?.name !== "AssignOp" || value === undefined) {
      return null;
    }
    const name = declarationName(input, nameNode);
    if (name === null || arguments_.has(name)) {
      return null;
    }
    arguments_.set(name, value);
  }
  return arguments_;
}

/**
 * Reads keyword arguments after a required first positional argument. Flask
 * constructors and decorators use this shape, while every later positional or
 * star expansion would make the supported static interpretation ambiguous.
 */
function staticKeywordArgumentsAfterFirst(
  input: PythonExtractFileFactsInput,
  entries: readonly PythonSyntaxNode[]
): ReadonlyMap<string, PythonSyntaxNode> | null {
  const arguments_ = new Map<string, PythonSyntaxNode>();
  for (let index = 1; index < entries.length; index += 3) {
    const nameNode = entries[index];
    const operator = entries[index + 1];
    const value = entries[index + 2];
    if (nameNode?.name !== "VariableName" || operator?.name !== "AssignOp" || value === undefined) {
      return null;
    }
    const name = declarationName(input, nameNode);
    if (name === null || arguments_.has(name)) {
      return null;
    }
    arguments_.set(name, value);
  }
  return arguments_;
}

/**
 * Flask's Blueprint accepts two required positional arguments. Keep those
 * values opaque, but require every remaining argument to be a direct keyword
 * so a literal `url_prefix` cannot be hidden behind a spread or a duplicate.
 */
function staticKeywordArgumentsAfterPositions(
  input: PythonExtractFileFactsInput,
  entries: readonly PythonSyntaxNode[],
  positionalCount: number
): ReadonlyMap<string, PythonSyntaxNode> | null {
  if (
    entries.length < positionalCount ||
    entries.slice(0, positionalCount).some((entry) =>
      ["*", "**", "AssignOp"].includes(entry.name)
    )
  ) {
    return null;
  }
  const arguments_ = new Map<string, PythonSyntaxNode>();
  for (let index = positionalCount; index < entries.length; index += 3) {
    const nameNode = entries[index];
    const operator = entries[index + 1];
    const value = entries[index + 2];
    if (nameNode?.name !== "VariableName" || operator?.name !== "AssignOp" || value === undefined) {
      return null;
    }
    const name = declarationName(input, nameNode);
    if (name === null || arguments_.has(name)) {
      return null;
    }
    arguments_.set(name, value);
  }
  return arguments_;
}

function staticFastApiPrefix(
  input: PythonExtractFileFactsInput,
  keywordArguments: ReadonlyMap<string, PythonSyntaxNode>
): string | null {
  const prefixNode = keywordArguments.get("prefix");
  if (prefixNode === undefined) {
    return "";
  }
  if (prefixNode.name !== "String") {
    return null;
  }
  const prefix = staticPlainPythonString(input, prefixNode);
  return prefix === null || (prefix !== "" && (!prefix.startsWith("/") || prefix.endsWith("/")))
    ? null
    : prefix;
}

function staticFlaskPrefix(
  input: PythonExtractFileFactsInput,
  keywordArguments: ReadonlyMap<string, PythonSyntaxNode>
): string | null {
  const prefixNode = keywordArguments.get("url_prefix");
  if (prefixNode === undefined) {
    return "";
  }
  if (prefixNode.name !== "String") {
    return null;
  }
  const prefix = staticPlainPythonString(input, prefixNode);
  return prefix === null || (prefix !== "" && (!prefix.startsWith("/") || prefix.endsWith("/")))
    ? null
    : prefix;
}

function staticFastApiRouter(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FastApiRouter | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  if (assignment === null) {
    return null;
  }
  const keywordArguments = staticKeywordArguments(input, staticArgumentEntries(assignment.arguments_));
  if (keywordArguments === null) {
    return null;
  }
  const prefix = staticFastApiPrefix(input, keywordArguments);
  return prefix === null
    ? null
    : {
        name: assignment.name,
        constructorName: assignment.constructorName,
        prefix,
        node: assignment.node
      };
}

function staticFlaskApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FlaskApplication | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  return assignment === null
    ? null
    : { name: assignment.name, constructorName: assignment.constructorName, node: assignment.node };
}

function staticFlaskBlueprint(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FlaskBlueprint | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  if (assignment === null) {
    return null;
  }
  const keywordArguments = staticKeywordArgumentsAfterPositions(
    input,
    staticArgumentEntries(assignment.arguments_),
    2
  );
  if (keywordArguments === null) {
    return null;
  }
  const prefix = staticFlaskPrefix(input, keywordArguments);
  return prefix === null
    ? null
    : {
        name: assignment.name,
        constructorName: assignment.constructorName,
        prefix,
        node: assignment.node
      };
}

function directVariableNames(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly string[] {
  const names: string[] = [];
  const visit = (candidate: PythonSyntaxNode): void => {
    if (candidate.name === "VariableName") {
      const name = declarationName(input, candidate);
      if (name !== null) {
        names.push(name);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  };
  visit(node);
  return names;
}

function targetBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  if (node.name === "VariableName") {
    return declarationName(input, node) === name;
  }
  if (!["TupleExpression", "ListExpression", "ParenthesizedExpression", "StarExpression"].includes(node.name)) {
    return false;
  }
  return directChildren(node).some((child) => targetBindsName(input, child, name));
}

function assignmentBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  const children = directChildren(node);
  return children.some(
    (child, index) => children[index + 1]?.name === "AssignOp" && targetBindsName(input, child, name)
  );
}

function syntaxMayBindName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  const definition = decoratedDefinition(node) ?? node;
  if (definition.name === "FunctionDefinition" || definition.name === "ClassDefinition") {
    return declarationName(input, definition) === name;
  }
  if (node.name === "ImportStatement") {
    return directVariableNames(input, node).includes(name);
  }
  if (node.name === "AssignStatement" || node.name === "NamedExpression") {
    return assignmentBindsName(input, node, name);
  }
  if (node.name === "UpdateStatement" || node.name === "DeleteStatement") {
    return directChildren(node).some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "ForStatement") {
    const children = directChildren(node);
    const inIndex = children.findIndex((child) => child.name === "in");
    return children
      .slice(0, inIndex < 0 ? 0 : inIndex)
      .some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "WithStatement" || node.name === "TryStatement") {
    const children = directChildren(node);
    return children.some(
      (child, index) =>
        child.name === "as" &&
        children[index + 1] !== undefined &&
        targetBindsName(input, children[index + 1] as PythonSyntaxNode, name)
    );
  }
  if (node.name === "CapturePattern") {
    return directChildren(node).some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "LambdaExpression") {
    return false;
  }
  return directChildren(node).some((child) => syntaxMayBindName(input, child, name));
}

function topLevelNodeBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  return syntaxMayBindName(input, node, name);
}

function hasTopLevelRebinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  name: string,
  after: number,
  before: number
): boolean {
  return topLevelNodes.some(
    (candidate) =>
      candidate.from >= after &&
      candidate.to <= before &&
      topLevelNodeBindsName(input, candidate, name)
  );
}

function staticPlainPythonString(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const value = nodeText(input, node);
  const quote = value[0];
  if (
    value.length < 2 ||
    (quote !== "\"" && quote !== "'") ||
    value.at(-1) !== quote ||
    value.startsWith(`${quote}${quote}${quote}`)
  ) {
    return null;
  }
  const inner = value.slice(1, -1);
  return inner.includes("\\") || /[\r\n]/u.test(inner) ? null : inner;
}

function staticFastApiDecorator(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFastApiDecorator | null {
  if (node.name !== "Decorator") {
    return null;
  }
  const children = directChildren(node);
  const members = children.filter(
    (child) => child.name === "VariableName" || child.name === "PropertyName"
  );
  const arguments_ = children.filter((child) => child.name === "ArgList");
  if (members.length !== 2 || arguments_.length !== 1) {
    return null;
  }

  const receiver = declarationName(input, members[0] ?? node);
  const methodName = nodeText(input, members[1] ?? node);
  const method = FASTAPI_DECORATOR_METHODS[methodName];
  const argumentList = arguments_[0];
  const firstArgument = argumentList === undefined
    ? undefined
    : directChildren(argumentList).find(
        (child) => child.name !== "(" && child.name !== ")"
      );
  if (receiver === null || method === undefined || firstArgument?.name !== "String") {
    return null;
  }

  const path = staticPlainPythonString(input, firstArgument);
  return path === null || !path.startsWith("/") ? null : { receiver, method, path, node };
}

function staticFastApiRouterInclusion(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFastApiRouterInclusion | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression?.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(expression);
  const member = callChildren[0];
  const argumentList = callChildren[1];
  if (callChildren.length !== 2 || member?.name !== "MemberExpression" || argumentList?.name !== "ArgList") {
    return null;
  }
  const memberChildren = directChildren(member);
  const applicationNode = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    applicationNode?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "include_router"
  ) {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  const entries = staticArgumentEntries(argumentList);
  const routerNode = entries[0];
  if (applicationName === null || routerNode?.name !== "VariableName") {
    return null;
  }
  const routerName = declarationName(input, routerNode);
  const keywordArguments = staticKeywordArguments(input, entries.slice(1));
  if (routerName === null || keywordArguments === null) {
    return null;
  }
  const prefix = staticFastApiPrefix(input, keywordArguments);
  return prefix === null ? null : { applicationName, routerName, prefix, node };
}

function staticFlaskRouteMethods(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly RouteMethod[] | null {
  if (node.name !== "ArrayExpression" && node.name !== "TupleExpression") {
    return null;
  }
  const entries = directChildren(node).filter(
    (child) => !["[", "]", "(", ")", ","].includes(child.name)
  );
  if (entries.length === 0) {
    return null;
  }
  const methods: RouteMethod[] = [];
  for (const entry of entries) {
    if (entry.name !== "String") {
      return null;
    }
    const method = staticPlainPythonString(input, entry);
    if (method === null || !FLASK_ROUTE_METHODS.has(method as RouteMethod)) {
      return null;
    }
    const normalized = method as RouteMethod;
    if (methods.includes(normalized)) {
      return null;
    }
    methods.push(normalized);
  }
  return methods;
}

function staticFlaskDecorator(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFlaskDecorator | null {
  if (node.name !== "Decorator") {
    return null;
  }
  const children = directChildren(node);
  const members = children.filter(
    (child) => child.name === "VariableName" || child.name === "PropertyName"
  );
  const arguments_ = children.filter((child) => child.name === "ArgList");
  if (members.length !== 2 || arguments_.length !== 1) {
    return null;
  }
  const receiver = declarationName(input, members[0] ?? node);
  const methodName = nodeText(input, members[1] ?? node);
  const argumentList = arguments_[0];
  if (receiver === null || argumentList === undefined) {
    return null;
  }
  const entries = staticArgumentEntries(argumentList);
  const pathNode = entries[0];
  const keywordArguments = staticKeywordArgumentsAfterFirst(input, entries);
  if (pathNode?.name !== "String" || keywordArguments === null) {
    return null;
  }
  const path = staticPlainPythonString(input, pathNode);
  if (path === null || !path.startsWith("/")) {
    return null;
  }

  if (methodName === "route") {
    const methodsNode = keywordArguments.get("methods");
    const methods = methodsNode === undefined ? ["GET" as const] : staticFlaskRouteMethods(input, methodsNode);
    return methods === null ? null : { receiver, methods, path, node };
  }

  const method = FLASK_SHORTCUT_DECORATOR_METHODS[methodName];
  if (method === undefined || keywordArguments.has("methods")) {
    return null;
  }
  return { receiver, methods: [method], path, node };
}

function staticFlaskBlueprintRegistration(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFlaskBlueprintRegistration | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression?.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(expression);
  const member = callChildren[0];
  const argumentList = callChildren[1];
  if (callChildren.length !== 2 || member?.name !== "MemberExpression" || argumentList?.name !== "ArgList") {
    return null;
  }
  const memberChildren = directChildren(member);
  const applicationNode = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    applicationNode?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "register_blueprint"
  ) {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  const entries = staticArgumentEntries(argumentList);
  const blueprintNode = entries[0];
  const keywordArguments = staticKeywordArgumentsAfterFirst(input, entries);
  if (
    applicationName === null ||
    blueprintNode?.name !== "VariableName" ||
    keywordArguments === null
  ) {
    return null;
  }
  const blueprintName = declarationName(input, blueprintNode);
  const prefix = staticFlaskPrefix(input, keywordArguments);
  return blueprintName === null || prefix === null
    ? null
    : { applicationName, blueprintName, prefix, node };
}

function hasUnambiguousFrameworkImportAlias(
  imports: readonly FrameworkNamedImport[],
  candidate: FrameworkNamedImport
): boolean {
  return (
    imports.filter(
      (other) => other.alias === candidate.alias && nodeKey(other.node) === nodeKey(candidate.node)
    ).length === 1
  );
}

function latestProvenFrameworkInstance<T extends FrameworkDirectInstance>(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  instances: readonly T[],
  receiverName: string,
  before: number,
  importedConstructor: FrameworkImportedConstructor
): T | null {
  const candidates = instances
    .filter(
      (instance) =>
        instance.name === receiverName &&
        instance.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          instance.name,
          instance.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);

  for (const instance of candidates) {
    const imported = imports
      .filter(
        (candidate) =>
          candidate.importedName === importedConstructor &&
          candidate.alias === instance.constructorName &&
          hasUnambiguousFrameworkImportAlias(imports, candidate) &&
          candidate.node.to <= instance.node.from &&
          !hasTopLevelRebinding(
            input,
            topLevelNodes,
            candidate.alias,
            candidate.node.to,
            instance.node.from
          )
      )
      .sort((left, right) => right.node.from - left.node.from)
      .at(0);
    if (imported !== undefined) {
      return instance;
    }
  }

  return null;
}

function latestProvenFastApiApplication(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  applications: readonly FastApiApplication[],
  decorator: StaticFastApiDecorator
): FastApiApplication | null {
  return latestProvenFrameworkInstance(
    input,
    topLevelNodes,
    imports,
    applications,
    decorator.receiver,
    decorator.node.from,
    "FastAPI"
  );
}

function latestProvenFlaskApplication(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  applications: readonly FlaskApplication[],
  receiverName: string,
  before: number
): FlaskApplication | null {
  return latestProvenFrameworkInstance(
    input,
    topLevelNodes,
    imports,
    applications,
    receiverName,
    before,
    "Flask"
  );
}

/**
 * Finds the one direct relative import still bound to the router argument at a
 * literal `include_router` call. A later assignment or import shadows an
 * earlier import and therefore removes it from consideration.
 */
function latestProvenFastApiRelativeRouterImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticFastApiRelativeRouterImport[],
  inclusion: StaticFastApiRouterInclusion
): StaticFastApiRelativeRouterImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.routerName === inclusion.routerName &&
        candidate.node.to <= inclusion.node.from &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.routerName,
          candidate.node.to,
          inclusion.node.from
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function combinedRoutePath(...parts: readonly string[]): string {
  return parts.join("");
}

/**
 * Extracts conservative Python file facts. The Python surface records
 * declarations, containment, direct FastAPI/Flask decorators, and direct
 * same-file router or Blueprint composition only when every binding and path
 * is syntax-proven.
 */
export function extractPythonFileFacts(input: PythonExtractFileFactsInput): ArtifactFacts {
  const fastApiCapability = frameworkCapability("fastapi");
  const flaskCapability = frameworkCapability("flask");
  if (
    !fastApiCapability.languages.includes(input.language) ||
    !flaskCapability.languages.includes(input.language)
  ) {
    throw new Error("Python framework extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const symbolsByNodeKey = new Map<string, SymbolNode>();
  const fastApiRouterFacts: {
    readonly routers: FastApiRouterDeclarationFact[];
    readonly routes: FastApiRouterRouteFact[];
    readonly importedRouterInclusions: FastApiImportedRouterInclusionFact[];
  } = {
    routers: [],
    routes: [],
    importedRouterInclusions: []
  };
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: PythonSyntaxNode): void {
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

  function addDeclaration(node: PythonSyntaxNode, owner: SymbolNode): SymbolNode | null {
    const name = declarationName(input, node);
    if (name === null) {
      return null;
    }
    const kind: SymbolKind =
      node.name === "ClassDefinition"
        ? "class"
        : isDirectClassMethod(node)
          ? "method"
          : "function";
    const qualifiedName =
      owner.kind === "file" ? `${input.filePath}#${name}` : `${owner.qualifiedName}.${name}`;
    const identity = `${qualifiedName}\u0000${kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind,
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range: rangeFor(lineStarts, node.from, node.to),
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByNodeKey.set(nodeKey(node), symbol);
    addContainment(owner, symbol, node);
    return symbol;
  }

  function visit(node: PythonSyntaxNode, owner: SymbolNode): void {
    const declaration =
      node.name === "FunctionDefinition" || node.name === "ClassDefinition"
        ? addDeclaration(node, owner)
        : null;
    for (const child of directChildren(node)) {
      visit(child, declaration ?? owner);
    }
  }

  function addPythonRoute(
    method: RouteMethod,
    declarationNode: PythonSyntaxNode,
    handler: SymbolNode,
    path: string,
    ruleId: string
  ): void {
    const routeName = `${method} ${path}`;
    const qualifiedName = `${input.filePath}#route:${routeName}`;
    const identity = `${qualifiedName}\u0000route`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declarationNode.from, declarationNode.to);
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
    addContainment(fileNode, route, declarationNode);
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

  function addFastApiRoute(
    decorator: StaticFastApiDecorator,
    handler: SymbolNode,
    path: string,
    ruleId: string
  ): void {
    addPythonRoute(decorator.method, decorator.node, handler, path, ruleId);
  }

  if (!hasSyntaxError(root)) {
    const topLevelNodes = directChildren(root);
    for (const node of topLevelNodes) {
      visit(node, fileNode);
    }

    const imports = topLevelNodes.flatMap((node) => staticFastApiImports(input, node));
    const relativeRouterImports = topLevelNodes
      .map((node) => staticFastApiRelativeRouterImport(input, node))
      .filter((candidate): candidate is StaticFastApiRelativeRouterImport => candidate !== null);
    const applicationConstructorNames = new Set(
      imports
        .filter((candidate) => candidate.importedName === "FastAPI")
        .map((candidate) => candidate.alias)
    );
    const routerConstructorNames = new Set(
      imports
        .filter((candidate) => candidate.importedName === "APIRouter")
        .map((candidate) => candidate.alias)
    );
    const applications = topLevelNodes
      .map((node) => staticFastApiApplication(input, node, applicationConstructorNames))
      .filter((candidate): candidate is FastApiApplication => candidate !== null);
    const routers = topLevelNodes
      .map((node) => staticFastApiRouter(input, node, routerConstructorNames))
      .filter((candidate): candidate is FastApiRouter => candidate !== null);
    const inclusions = topLevelNodes
      .map((node) => staticFastApiRouterInclusion(input, node))
      .filter((candidate): candidate is StaticFastApiRouterInclusion => candidate !== null);
    const flaskImports = topLevelNodes.flatMap((node) => staticFlaskImports(input, node));
    const flaskApplicationConstructorNames = new Set(
      flaskImports
        .filter((candidate) => candidate.importedName === "Flask")
        .map((candidate) => candidate.alias)
    );
    const flaskBlueprintConstructorNames = new Set(
      flaskImports
        .filter((candidate) => candidate.importedName === "Blueprint")
        .map((candidate) => candidate.alias)
    );
    const flaskApplications = topLevelNodes
      .map((node) => staticFlaskApplication(input, node, flaskApplicationConstructorNames))
      .filter((candidate): candidate is FlaskApplication => candidate !== null);
    const flaskBlueprints = topLevelNodes
      .map((node) => staticFlaskBlueprint(input, node, flaskBlueprintConstructorNames))
      .filter((candidate): candidate is FlaskBlueprint => candidate !== null);
    const flaskBlueprintRegistrations = topLevelNodes
      .map((node) => staticFlaskBlueprintRegistration(input, node))
      .filter((candidate): candidate is StaticFlaskBlueprintRegistration => candidate !== null);
    const finalRouters = routers.filter((router) => {
      const finalRouter = latestProvenFrameworkInstance(
        input,
        topLevelNodes,
        imports,
        routers,
        router.name,
        input.sourceText.length,
        "APIRouter"
      );
      return finalRouter !== null && nodeKey(finalRouter.node) === nodeKey(router.node);
    });
    for (const router of finalRouters) {
      fastApiRouterFacts.routers.push({
        name: router.name,
        prefix: router.prefix,
        range: rangeFor(lineStarts, router.node.from, router.node.to)
      });
    }

    for (const inclusion of inclusions) {
      if (
        latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          imports,
          applications,
          inclusion.applicationName,
          inclusion.node.from,
          "FastAPI"
        ) === null
      ) {
        continue;
      }
      const importedRouter = latestProvenFastApiRelativeRouterImport(
        input,
        topLevelNodes,
        relativeRouterImports,
        inclusion
      );
      if (importedRouter === null) {
        continue;
      }
      fastApiRouterFacts.importedRouterInclusions.push({
        applicationName: inclusion.applicationName,
        routerName: importedRouter.routerName,
        importedRouterName: importedRouter.importedRouterName,
        moduleSpecifier: importedRouter.moduleSpecifier,
        prefix: inclusion.prefix,
        range: rangeFor(lineStarts, inclusion.node.from, inclusion.node.to)
      });
    }

    for (const statement of topLevelNodes) {
      const functionNode = decoratedDefinition(statement);
      if (functionNode === null || functionNode.name !== "FunctionDefinition" || !isTopLevelFunction(functionNode)) {
        continue;
      }
      const handler = symbolsByNodeKey.get(nodeKey(functionNode));
      if (handler?.kind !== "function") {
        continue;
      }
      for (const decoratorNode of directChildren(statement).filter((node) => node.name === "Decorator")) {
        const decorator = staticFastApiDecorator(input, decoratorNode);
        if (decorator !== null) {
          const routerAtDecorator = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            imports,
            routers,
            decorator.receiver,
            decorator.node.from,
            "APIRouter"
          );
          const finalRouter = finalRouters.find(
            (router) => routerAtDecorator !== null && nodeKey(router.node) === nodeKey(routerAtDecorator.node)
          );
          if (finalRouter !== undefined) {
            fastApiRouterFacts.routes.push({
              routerName: finalRouter.name,
              method: decorator.method,
              path: decorator.path,
              handlerId: handler.id,
              range: rangeFor(lineStarts, decorator.node.from, decorator.node.to)
            });
          }
          if (
            latestProvenFastApiApplication(
              input,
              topLevelNodes,
              imports,
              applications,
              decorator
            ) !== null
          ) {
            addFastApiRoute(
              decorator,
              handler,
              decorator.path,
              "framework.fastapi.direct-app.decorator.local-function"
            );
          }

          for (const inclusion of inclusions) {
            if (decorator.receiver !== inclusion.routerName || statement.to > inclusion.node.from) {
              continue;
            }
            const routerAtDecorator = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              imports,
              routers,
              decorator.receiver,
              decorator.node.from,
              "APIRouter"
            );
            const routerAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              imports,
              routers,
              inclusion.routerName,
              inclusion.node.from,
              "APIRouter"
            );
            const applicationAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              imports,
              applications,
              inclusion.applicationName,
              inclusion.node.from,
              "FastAPI"
            );
            if (
              routerAtDecorator === null ||
              routerAtInclusion === null ||
              applicationAtInclusion === null ||
              routerAtDecorator.node.from !== routerAtInclusion.node.from
            ) {
              continue;
            }
            addFastApiRoute(
              decorator,
              handler,
              combinedRoutePath(inclusion.prefix, routerAtInclusion.prefix, decorator.path),
              "framework.fastapi.direct-router.include-router.decorator.local-function"
            );
          }
        }

        const flaskDecorator = staticFlaskDecorator(input, decoratorNode);
        if (flaskDecorator === null) {
          continue;
        }
        if (
          latestProvenFlaskApplication(
            input,
            topLevelNodes,
            flaskImports,
            flaskApplications,
            flaskDecorator.receiver,
            flaskDecorator.node.from
          ) !== null
        ) {
          for (const method of flaskDecorator.methods) {
            addPythonRoute(
              method,
              flaskDecorator.node,
              handler,
              flaskDecorator.path,
              "framework.flask.direct-app.decorator.local-function"
            );
          }
        }

        for (const registration of flaskBlueprintRegistrations) {
          if (
            flaskDecorator.receiver !== registration.blueprintName ||
            statement.to > registration.node.from
          ) {
            continue;
          }
          const blueprintAtDecorator = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            flaskImports,
            flaskBlueprints,
            flaskDecorator.receiver,
            flaskDecorator.node.from,
            "Blueprint"
          );
          const blueprintAtRegistration = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            flaskImports,
            flaskBlueprints,
            registration.blueprintName,
            registration.node.from,
            "Blueprint"
          );
          const applicationAtRegistration = latestProvenFlaskApplication(
            input,
            topLevelNodes,
            flaskImports,
            flaskApplications,
            registration.applicationName,
            registration.node.from
          );
          if (
            blueprintAtDecorator === null ||
            blueprintAtRegistration === null ||
            applicationAtRegistration === null ||
            blueprintAtDecorator.node.from !== blueprintAtRegistration.node.from
          ) {
            continue;
          }
          for (const method of flaskDecorator.methods) {
            addPythonRoute(
              method,
              flaskDecorator.node,
              handler,
              combinedRoutePath(
                registration.prefix,
                blueprintAtRegistration.prefix,
                flaskDecorator.path
              ),
              "framework.flask.direct-blueprint.register-blueprint.decorator.local-function"
            );
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
    fastApiRouterFacts
  };
}

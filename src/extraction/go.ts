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

interface FiberReceiver {
  readonly kind: "app" | "group";
  readonly prefix: string;
}

interface StaticFiberBinding {
  readonly name: string;
  readonly receiver: FiberReceiver;
}

interface StaticFiberRoute {
  readonly receiver: FiberReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: GoSyntaxNode;
}

interface EchoReceiver {
  readonly kind: "app" | "group";
  readonly prefix: string;
}

interface StaticEchoBinding {
  readonly name: string;
  readonly receiver: EchoReceiver;
}

interface StaticEchoRoute {
  readonly receiver: EchoReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: GoSyntaxNode;
}

interface StaticNetHttpMuxBinding {
  readonly name: string;
}

interface StaticNetHttpPattern {
  readonly method: RouteMethod;
  readonly path: string;
}

interface StaticNetHttpRoute extends StaticNetHttpPattern {
  readonly receiver: "default-serve-mux" | "serve-mux";
  readonly handlerName: string;
  readonly node: GoSyntaxNode;
}

interface StaticChiRouterBinding {
  readonly name: string;
}

interface StaticChiRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: GoSyntaxNode;
}

const GIN_PACKAGE_PATH = "github.com/gin-gonic/gin";
const FIBER_PACKAGE_PATHS = [
  "github.com/gofiber/fiber/v2",
  "github.com/gofiber/fiber/v3"
] as const;
const ECHO_PACKAGE_PATHS = [
  "github.com/labstack/echo/v4",
  "github.com/labstack/echo/v5"
] as const;
const NET_HTTP_PACKAGE_PATH = "net/http";
const CHI_PACKAGE_PATHS = ["github.com/go-chi/chi/v5"] as const;

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

const FIBER_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
  Trace: "TRACE",
  Connect: "CONNECT",
  All: "ALL"
};

const ECHO_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  Any: "ALL"
};

const NET_HTTP_PATTERN_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT"
]);

const CHI_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
  Trace: "TRACE",
  Connect: "CONNECT",
  HandleFunc: "ALL"
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

function staticLiteralSlashPath(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  const path = staticPlainGoString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticGinPath(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  return staticLiteralSlashPath(input, node);
}

function staticLiteralGroupPrefix(input: GoExtractFileFactsInput, node: GoSyntaxNode): string | null {
  const prefix = staticGinPath(input, node);
  return prefix === null || prefix === "/" || prefix.endsWith("/") ? null : prefix;
}

/**
 * Exact subset of Go 1.22 `net/http` patterns. A bare slash path represents
 * every method; a supported explicit method preserves the source registration
 * without synthesizing the implicit HEAD behavior of a GET handler.
 */
function staticNetHttpPattern(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticNetHttpPattern | null {
  const barePath = staticLiteralSlashPath(input, node);
  if (barePath !== null) {
    return { method: "ALL", path: barePath };
  }

  const pattern = staticPlainGoString(input, node);
  if (pattern === null) {
    return null;
  }
  const match = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT) (\/\S*)$/u.exec(pattern);
  if (match === null) {
    return null;
  }
  const method = match[1] as RouteMethod;
  const path = match[2] ?? "";
  return NET_HTTP_PATTERN_METHODS.has(method) && !path.includes("//")
    ? { method, path }
    : null;
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

function staticPackageImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode,
  packagePaths: readonly string[],
  defaultAlias: string
): readonly string[] {
  const counts = new Map<string, number>();
  for (const declaration of directChildren(root).filter((node) => node.name === "ImportDecl")) {
    for (const specifier of descendantsNamed(declaration, "ImportSpec")) {
      const children = directChildren(specifier);
      const stringNode = children.find((child) => child.name === "String");
      const packagePath =
        stringNode === undefined ? null : staticPlainGoString(input, stringNode);
      if (packagePath === null || !packagePaths.includes(packagePath)) {
        continue;
      }
      const aliasNode = children.find(
        (child) => child.name === "DefName" || child.name === "."
      );
      if (aliasNode?.name === ".") {
        continue;
      }
      const alias = aliasNode === undefined ? defaultAlias : identifierText(input, aliasNode);
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

function staticGinImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, [GIN_PACKAGE_PATH], "gin");
}

function staticFiberImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, FIBER_PACKAGE_PATHS, "fiber");
}

function staticEchoImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, ECHO_PACKAGE_PATHS, "echo");
}

function staticNetHttpImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, [NET_HTTP_PACKAGE_PATH], "http");
}

function staticChiImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, CHI_PACKAGE_PATHS, "chi");
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
  const prefix = pathNode === undefined ? null : staticLiteralGroupPrefix(input, pathNode);
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

function staticFiberAppBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  fiberAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticFiberBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !fiberAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    declaration.methodName !== "New" ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name, receiver: { kind: "app", prefix: "" } };
}

function staticFiberGroupBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, FiberReceiver>
): StaticFiberBinding | null {
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
  const prefix = pathNode === undefined ? null : staticLiteralGroupPrefix(input, pathNode);
  if (parent === undefined || prefix === null) {
    return null;
  }
  return {
    name: declaration.name,
    receiver: { kind: "group", prefix: combinedRoutePath(parent.prefix, prefix) }
  };
}

function staticFiberRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, FiberReceiver>
): StaticFiberRoute | null {
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
  const method = FIBER_ROUTE_METHODS[call.methodName];
  const pathNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
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

function staticEchoAppBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  echoAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticEchoBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !echoAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    declaration.methodName !== "New" ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name, receiver: { kind: "app", prefix: "" } };
}

function staticEchoGroupBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, EchoReceiver>
): StaticEchoBinding | null {
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
  const prefix = pathNode === undefined ? null : staticLiteralGroupPrefix(input, pathNode);
  if (parent === undefined || prefix === null) {
    return null;
  }
  return {
    name: declaration.name,
    receiver: { kind: "group", prefix: combinedRoutePath(parent.prefix, prefix) }
  };
}

function staticEchoRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, EchoReceiver>
): StaticEchoRoute | null {
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
  const method = ECHO_ROUTE_METHODS[call.methodName];
  const pathNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
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

function staticNetHttpMuxBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  netHttpAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticNetHttpMuxBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !netHttpAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    declaration.methodName !== "NewServeMux" ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name };
}

function staticNetHttpRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  netHttpAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
  muxes: ReadonlySet<string>
): StaticNetHttpRoute | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "HandleFunc" || call.arguments_.length !== 2) {
    return null;
  }
  const patternNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const pattern = patternNode === undefined ? null : staticNetHttpPattern(input, patternNode);
  const handlerName =
    handlerNode?.name === "VariableName" ? identifierText(input, handlerNode) : null;
  const receiver =
    netHttpAliases.has(call.receiverName) && !shadowedNames.has(call.receiverName)
      ? "default-serve-mux"
      : muxes.has(call.receiverName)
        ? "serve-mux"
        : null;
  return receiver === null || pattern === null || handlerName === null
    ? null
    : { ...pattern, receiver, handlerName, node };
}

function staticChiRouterBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  chiAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticChiRouterBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !chiAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    !["NewRouter", "NewMux"].includes(declaration.methodName) ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name };
}

function staticChiRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlySet<string>
): StaticChiRoute | null {
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
  const method = CHI_ROUTE_METHODS[call.methodName];
  const pathNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
  const handlerName =
    handlerNode?.name === "VariableName" ? identifierText(input, handlerNode) : null;
  return !receivers.has(call.receiverName) || method === undefined || path === null || handlerName === null
    ? null
    : { method, path, handlerName, node };
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
 * Extracts conservative Go file facts. Each supported framework surface proves
 * direct local registration, a literal pattern, and one named package-level
 * handler; runtime discovery and dynamic dispatch remain intentionally absent.
 */
export function extractGoFileFacts(input: GoExtractFileFactsInput): ArtifactFacts {
  const ginCapability = frameworkCapability("gin");
  const fiberCapability = frameworkCapability("fiber");
  const echoCapability = frameworkCapability("echo");
  const netHttpCapability = frameworkCapability("net-http");
  const chiCapability = frameworkCapability("chi");
  if (
    !ginCapability.languages.includes(input.language) ||
    !fiberCapability.languages.includes(input.language) ||
    !echoCapability.languages.includes(input.language) ||
    !netHttpCapability.languages.includes(input.language) ||
    !chiCapability.languages.includes(input.language)
  ) {
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

  function addResolvedRoute(
    method: RouteMethod,
    path: string,
    node: GoSyntaxNode,
    handler: SymbolNode,
    ruleId: string
  ): void {
    const routeName = `${method} ${path}`;
    const qualifiedName = `${input.filePath}#route:${routeName}`;
    const identity = `${qualifiedName}\u0000route`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, node.from, node.to);
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
    addContainment(route, node);
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

  function addGinRoute(routeFact: StaticGinRoute, handler: SymbolNode): void {
    addResolvedRoute(
      routeFact.method,
      combinedRoutePath(routeFact.receiver.prefix, routeFact.path),
      routeFact.node,
      handler,
      routeFact.receiver.kind === "engine"
        ? "framework.gin.direct-engine.method.local-function"
        : "framework.gin.direct-group.method.local-function"
    );
  }

  function addFiberRoute(routeFact: StaticFiberRoute, handler: SymbolNode): void {
    addResolvedRoute(
      routeFact.method,
      combinedRoutePath(routeFact.receiver.prefix, routeFact.path),
      routeFact.node,
      handler,
      routeFact.receiver.kind === "app"
        ? "framework.fiber.direct-app.method.local-function"
        : "framework.fiber.direct-group.method.local-function"
    );
  }

  function addEchoRoute(routeFact: StaticEchoRoute, handler: SymbolNode): void {
    addResolvedRoute(
      routeFact.method,
      combinedRoutePath(routeFact.receiver.prefix, routeFact.path),
      routeFact.node,
      handler,
      routeFact.receiver.kind === "app"
        ? "framework.echo.direct-app.method.local-function"
        : "framework.echo.direct-group.method.local-function"
    );
  }

  function addNetHttpRoute(routeFact: StaticNetHttpRoute, handler: SymbolNode): void {
    addResolvedRoute(
      routeFact.method,
      routeFact.path,
      routeFact.node,
      handler,
      routeFact.receiver === "default-serve-mux"
        ? "framework.net-http.default-serve-mux.handle-func.local-function"
        : "framework.net-http.serve-mux.handle-func.local-function"
    );
  }

  function addChiRoute(routeFact: StaticChiRoute, handler: SymbolNode): void {
    addResolvedRoute(
      routeFact.method,
      routeFact.path,
      routeFact.node,
      handler,
      "framework.chi.direct-router.method.local-function"
    );
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
    const fiberAliases = staticFiberImportAliases(input, root);
    const echoAliases = staticEchoImportAliases(input, root);
    const netHttpAliases = staticNetHttpImportAliases(input, root);
    const chiAliases = staticChiImportAliases(input, root);
    for (const functionDeclaration of functions) {
      const visibleGinAliases = new Set(
        ginAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleFiberAliases = new Set(
        fiberAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleEchoAliases = new Set(
        echoAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleNetHttpAliases = new Set(
        netHttpAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleChiAliases = new Set(
        chiAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const ginReceivers = new Map<string, GinReceiver>();
      const fiberReceivers = new Map<string, FiberReceiver>();
      const echoReceivers = new Map<string, EchoReceiver>();
      const netHttpMuxes = new Set<string>();
      const chiReceivers = new Set<string>();
      const shadowedNames = new Set(functionDeclaration.parameterNames);
      for (const statement of directChildren(functionDeclaration.body)) {
        const engineBinding = staticGinEngineBinding(
          input,
          statement,
          visibleGinAliases,
          shadowedNames
        );
        if (engineBinding !== null) {
          ginReceivers.set(engineBinding.name, engineBinding.receiver);
        }
        const groupBinding = staticGinGroupBinding(input, statement, ginReceivers);
        if (groupBinding !== null) {
          ginReceivers.set(groupBinding.name, groupBinding.receiver);
        }
        const ginRoute = staticGinRoute(input, statement, ginReceivers);
        if (ginRoute !== null && !shadowedNames.has(ginRoute.handlerName)) {
          const candidates = functionsByName.get(ginRoute.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addGinRoute(ginRoute, handler);
            }
          }
        }

        const appBinding = staticFiberAppBinding(
          input,
          statement,
          visibleFiberAliases,
          shadowedNames
        );
        if (appBinding !== null) {
          fiberReceivers.set(appBinding.name, appBinding.receiver);
        }
        const fiberGroupBinding = staticFiberGroupBinding(input, statement, fiberReceivers);
        if (fiberGroupBinding !== null) {
          fiberReceivers.set(fiberGroupBinding.name, fiberGroupBinding.receiver);
        }
        const fiberRoute = staticFiberRoute(input, statement, fiberReceivers);
        if (fiberRoute !== null && !shadowedNames.has(fiberRoute.handlerName)) {
          const candidates = functionsByName.get(fiberRoute.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addFiberRoute(fiberRoute, handler);
            }
          }
        }

        const echoAppBinding = staticEchoAppBinding(
          input,
          statement,
          visibleEchoAliases,
          shadowedNames
        );
        if (echoAppBinding !== null) {
          echoReceivers.set(echoAppBinding.name, echoAppBinding.receiver);
        }
        const echoGroupBinding = staticEchoGroupBinding(input, statement, echoReceivers);
        if (echoGroupBinding !== null) {
          echoReceivers.set(echoGroupBinding.name, echoGroupBinding.receiver);
        }
        const echoRoute = staticEchoRoute(input, statement, echoReceivers);
        if (echoRoute !== null && !shadowedNames.has(echoRoute.handlerName)) {
          const candidates = functionsByName.get(echoRoute.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addEchoRoute(echoRoute, handler);
            }
          }
        }

        const muxBinding = staticNetHttpMuxBinding(
          input,
          statement,
          visibleNetHttpAliases,
          shadowedNames
        );
        if (muxBinding !== null) {
          netHttpMuxes.add(muxBinding.name);
        }
        const netHttpRoute = staticNetHttpRoute(
          input,
          statement,
          visibleNetHttpAliases,
          shadowedNames,
          netHttpMuxes
        );
        if (netHttpRoute !== null && !shadowedNames.has(netHttpRoute.handlerName)) {
          const candidates = functionsByName.get(netHttpRoute.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addNetHttpRoute(netHttpRoute, handler);
            }
          }
        }

        const chiBinding = staticChiRouterBinding(
          input,
          statement,
          visibleChiAliases,
          shadowedNames
        );
        if (chiBinding !== null) {
          chiReceivers.add(chiBinding.name);
        }
        const chiRoute = staticChiRoute(input, statement, chiReceivers);
        if (chiRoute !== null && !shadowedNames.has(chiRoute.handlerName)) {
          const candidates = functionsByName.get(chiRoute.handlerName) ?? [];
          if (candidates.length === 1) {
            const handler = candidates[0];
            if (handler !== undefined) {
              addChiRoute(chiRoute, handler);
            }
          }
        }

        const retainedGinBindings = new Set(
          [engineBinding?.name, groupBinding?.name].filter(
            (name): name is string => name !== undefined
          )
        );
        const retainedFiberBindings = new Set(
          [appBinding?.name, fiberGroupBinding?.name].filter(
            (name): name is string => name !== undefined
          )
        );
        const retainedEchoBindings = new Set(
          [echoAppBinding?.name, echoGroupBinding?.name].filter(
            (name): name is string => name !== undefined
          )
        );
        const retainedNetHttpBindings = new Set(
          [muxBinding?.name].filter((name): name is string => name !== undefined)
        );
        const retainedChiBindings = new Set(
          [chiBinding?.name].filter((name): name is string => name !== undefined)
        );
        for (const name of directBoundNames(input, statement)) {
          if (!retainedGinBindings.has(name)) {
            ginReceivers.delete(name);
          }
          if (!retainedFiberBindings.has(name)) {
            fiberReceivers.delete(name);
          }
          if (!retainedEchoBindings.has(name)) {
            echoReceivers.delete(name);
          }
          if (!retainedNetHttpBindings.has(name)) {
            netHttpMuxes.delete(name);
          }
          if (!retainedChiBindings.has(name)) {
            chiReceivers.delete(name);
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

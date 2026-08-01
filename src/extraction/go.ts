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

interface GoFrameReceiver {
  readonly kind: "server" | "group";
  readonly prefix: string;
}

interface StaticGoFrameBinding {
  readonly name: string;
  readonly receiver: GoFrameReceiver;
}

interface StaticGoFrameDirectRoute {
  readonly receiver: GoFrameReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: StaticGoFrameHandler;
  readonly node: GoSyntaxNode;
}

interface StaticGoFrameMapRoute {
  readonly receiver: GoFrameReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: StaticGoFrameHandler;
  readonly node: GoSyntaxNode;
  readonly batchKind: "map" | "all-map";
}

/** A direct Server.BindObjectMethod registration with a fully static object and method. */
interface StaticGoFrameBindObjectMethodRoute {
  readonly receiver: GoFrameReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly controllerName: string;
  readonly methodName: string;
  readonly node: GoSyntaxNode;
}

/** A selected Server.BindObject registration with a statically known object and method list. */
interface StaticGoFrameBindObjectRoute {
  readonly receiver: GoFrameReceiver;
  readonly method: RouteMethod;
  readonly path: string;
  readonly controllerName: string;
  readonly methodNames: readonly string[];
  readonly node: GoSyntaxNode;
}

/** A direct Server.BindObjectRest registration with a statically known object and path. */
interface StaticGoFrameBindObjectRestRoute {
  readonly receiver: GoFrameReceiver;
  readonly path: string;
  readonly controllerName: string;
  readonly node: GoSyntaxNode;
}

type StaticGoFrameRoute = StaticGoFrameDirectRoute | StaticGoFrameMapRoute;

interface StaticGoFrameFunctionHandler {
  readonly kind: "function";
  readonly name: string;
}

interface StaticGoFrameObjectMethodHandler {
  readonly kind: "object-method";
  readonly receiverName: string;
  readonly methodName: string;
}

type StaticGoFrameHandler = StaticGoFrameFunctionHandler | StaticGoFrameObjectMethodHandler;

interface StaticGoFrameObjectBinding {
  readonly name: string;
  readonly controllerName: string;
}

interface StaticGoFrameGroupCallback {
  readonly receiver: GoFrameReceiver;
  readonly parameterName: string;
  readonly body: GoSyntaxNode;
}

interface StaticGoFrameControllerBinding {
  readonly receiver: GoFrameReceiver;
  readonly controllerName: string;
}

interface StaticGoFrameRequest {
  readonly name: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: GoSyntaxNode;
}

interface StaticGoFrameMethod {
  readonly controllerName: string;
  readonly name: string;
  readonly node: GoSyntaxNode;
}

interface StaticGoFrameDeclaredMethod extends StaticGoFrameMethod {
  readonly inputParameters: GoSyntaxNode;
  readonly hasResult: boolean;
}

interface StaticGoFrameControllerMethod extends StaticGoFrameMethod {
  readonly requestType: string;
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
const GOFRAME_G_PACKAGE_PATHS = [
  "github.com/gogf/gf/v2/frame/g",
  "github.com/gogf/gf/frame/g"
] as const;
const GOFRAME_GHTTP_PACKAGE_PATHS = [
  "github.com/gogf/gf/v2/net/ghttp",
  "github.com/gogf/gf/net/ghttp"
] as const;
const CONTEXT_PACKAGE_PATH = "context";

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

const GOFRAME_ROUTE_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
  "ALL"
]);

const GOFRAME_GROUP_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT",
  ALL: "ALL"
};

const GOFRAME_OBJECT_REST_ROUTE_METHODS = new Set<RouteMethod>([
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

/** GoFrame reserves these object methods for per-request lifecycle hooks, not routes. */
const GOFRAME_OBJECT_LIFECYCLE_METHODS = new Set(["Init", "Shut"]);

function directChildren(node: GoSyntaxNode): readonly GoSyntaxNode[] {
  const children: GoSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function isGoComment(node: GoSyntaxNode): boolean {
  return node.name === "LineComment" || node.name === "BlockComment";
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

function staticGoFrameImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, GOFRAME_G_PACKAGE_PATHS, "g");
}

function staticGoFrameHttpImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, GOFRAME_GHTTP_PACKAGE_PATHS, "ghttp");
}

function staticContextImportAliases(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly string[] {
  return staticPackageImportAliases(input, root, [CONTEXT_PACKAGE_PATH], "context");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function staticGoFrameRoutePath(value: string): string | null {
  if (
    value === "" ||
    value.includes("\\") ||
    value.includes("@") ||
    /[\r\n\t ]/u.test(value)
  ) {
    return null;
  }
  const normalized = value.startsWith("/") ? value : "/" + value;
  return normalized.includes("//") ? null : normalized;
}

function staticGoFrameRouteMethod(value: string | undefined): RouteMethod | null {
  const normalized = value === undefined || value === "" ? "ALL" : value.toUpperCase();
  const method = normalized === "ANY" ? "ALL" : normalized;
  return GOFRAME_ROUTE_METHODS.has(method as RouteMethod) ? (method as RouteMethod) : null;
}

function staticGoFrameRequests(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode,
  goFrameAliases: ReadonlySet<string>
): readonly StaticGoFrameRequest[] {
  const requests: StaticGoFrameRequest[] = [];
  if (goFrameAliases.size === 0) {
    return requests;
  }

  const aliasPattern = [...goFrameAliases]
    .sort()
    .map(escapeRegularExpression)
    .join("|");
  const tagDelimiter = String.fromCharCode(96);
  const matcher = new RegExp(
    "^\\s*type\\s+([A-Z][A-Za-z0-9_]*)\\s+struct\\s*\\{\\s*(?:" +
      aliasPattern +
      ")\\.Meta\\s+" +
      tagDelimiter +
      "([^" +
      tagDelimiter +
      "\\r\\n]*)" +
      tagDelimiter,
    "u"
  );

  for (const declaration of directChildren(root)) {
    if (declaration.name !== "TypeDecl") {
      continue;
    }
    const match = matcher.exec(nodeText(input, declaration));
    if (match === null) {
      continue;
    }
    const name = match[1];
    const tag = match[2];
    if (name === undefined || tag === undefined || tag.includes("\\")) {
      continue;
    }
    const pathMatch = /(?:^|\s)path:"([^"\r\n]+)"/u.exec(tag);
    const methodMatch = /(?:^|\s)method:"([^"\r\n]*)"/u.exec(tag);
    const path = pathMatch?.[1] === undefined ? null : staticGoFrameRoutePath(pathMatch[1]);
    const method = staticGoFrameRouteMethod(methodMatch?.[1]);
    if (path === null || method === null) {
      continue;
    }
    requests.push({ name, method, path, node: declaration });
  }

  return requests;
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

function staticGoFrameDeclaredMethods(
  input: GoExtractFileFactsInput,
  root: GoSyntaxNode
): readonly StaticGoFrameDeclaredMethod[] {
  const methods: StaticGoFrameDeclaredMethod[] = [];
  const receiverPattern = /^\(\s*(?:[A-Za-z_][A-Za-z0-9_]*\s+)?\*?([A-Z][A-Za-z0-9_]*)\s*\)$/u;

  for (const declaration of directChildren(root)) {
    if (declaration.name !== "MethodDecl") {
      continue;
    }
    const children = directChildren(declaration);
    const parameterLists = children.filter((child) => child.name === "Parameters");
    const receiverParameters = parameterLists[0];
    const inputParameters = parameterLists[1];
    const nameNode = children.find((child) => child.name === "FieldName");
    const methodName = nameNode === undefined ? null : identifierText(input, nameNode);
    if (
      receiverParameters === undefined ||
      inputParameters === undefined ||
      methodName === null
    ) {
      continue;
    }
    const controllerMatch = receiverPattern.exec(nodeText(input, receiverParameters));
    if (controllerMatch?.[1] === undefined) {
      continue;
    }
    const inputParametersIndex = children.indexOf(inputParameters);
    if (inputParametersIndex === -1) {
      continue;
    }
    methods.push({
      controllerName: controllerMatch[1],
      name: methodName,
      inputParameters,
      hasResult: children
        .slice(inputParametersIndex + 1)
        .some((child) => child.name !== "Block"),
      node: declaration
    });
  }

  return methods;
}

function staticGoFrameControllerMethods(
  input: GoExtractFileFactsInput,
  methods: readonly StaticGoFrameDeclaredMethod[],
  contextAliases: ReadonlySet<string>
): readonly StaticGoFrameControllerMethod[] {
  const controllerMethods: StaticGoFrameControllerMethod[] = [];
  if (contextAliases.size === 0) {
    return controllerMethods;
  }

  const contextAliasPattern = [...contextAliases]
    .sort()
    .map(escapeRegularExpression)
    .join("|");
  const contextParameterPattern = new RegExp(
    "^(?:[A-Za-z_][A-Za-z0-9_]*\\s+)?(?:" + contextAliasPattern + ")\\.Context$",
    "u"
  );
  const requestParameterPattern =
    /^(?:[A-Za-z_][A-Za-z0-9_]*\s+)?\*([A-Z][A-Za-z0-9_]*)$/u;

  for (const method of methods) {
    if (!/^[A-Z]/u.test(method.name)) {
      continue;
    }
    const inputParametersList = directChildren(method.inputParameters).filter(
      (child) => child.name === "Parameter"
    );
    if (inputParametersList.length !== 2) {
      continue;
    }
    const contextParameter = inputParametersList[0];
    const requestParameter = inputParametersList[1];
    if (contextParameter === undefined || requestParameter === undefined) {
      continue;
    }
    const requestMatch = requestParameterPattern.exec(nodeText(input, requestParameter).trim());
    if (
      !contextParameterPattern.test(nodeText(input, contextParameter).trim()) ||
      requestMatch?.[1] === undefined
    ) {
      continue;
    }
    controllerMethods.push({
      controllerName: method.controllerName,
      name: method.name,
      requestType: requestMatch[1],
      node: method.node
    });
  }

  return controllerMethods;
}

/**
 * Exact GoFrame object-route handler subset: one public method receiving one
 * imported `*ghttp.Request`. BindObjectMethod reflects this signature at
 * runtime, so broader method shapes must not become exact route edges.
 */
function staticGoFrameObjectHandlerMethods(
  input: GoExtractFileFactsInput,
  methods: readonly StaticGoFrameDeclaredMethod[],
  goFrameHttpAliases: ReadonlySet<string>
): readonly StaticGoFrameMethod[] {
  if (goFrameHttpAliases.size === 0) {
    return [];
  }
  const aliasPattern = [...goFrameHttpAliases]
    .sort()
    .map(escapeRegularExpression)
    .join("|");
  const requestParameterPattern = new RegExp(
    "^(?:[A-Za-z_][A-Za-z0-9_]*\\s+)?\\*(?:" + aliasPattern + ")\\.Request$",
    "u"
  );
  const handlerMethods: StaticGoFrameMethod[] = [];
  for (const method of methods) {
    if (method.hasResult || !/^[A-Z]/u.test(method.name)) {
      continue;
    }
    const parameters = directChildren(method.inputParameters).filter(
      (child) => child.name === "Parameter"
    );
    const parameter = parameters[0];
    if (
      parameters.length !== 1 ||
      parameter === undefined ||
      !requestParameterPattern.test(nodeText(input, parameter).trim())
    ) {
      continue;
    }
    handlerMethods.push({
      controllerName: method.controllerName,
      name: method.name,
      node: method.node
    });
  }
  return handlerMethods;
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

function staticGoFrameHandler(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticGoFrameHandler | null {
  if (node.name === "VariableName") {
    const name = identifierText(input, node);
    return name === null ? null : { kind: "function", name };
  }
  if (node.name !== "SelectorExpr") {
    return null;
  }
  const children = directChildren(node);
  const receiverNode = children[0];
  const methodNode = children[2];
  if (
    children.length !== 3 ||
    receiverNode?.name !== "VariableName" ||
    methodNode?.name !== "FieldName"
  ) {
    return null;
  }
  const receiverName = identifierText(input, receiverNode);
  const methodName = identifierText(input, methodNode);
  return receiverName === null || methodName === null
    ? null
    : { kind: "object-method", receiverName, methodName };
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

function staticGoFrameServerBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  goFrameAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticGoFrameBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    !goFrameAliases.has(declaration.receiverName) ||
    shadowedNames.has(declaration.receiverName) ||
    declaration.methodName !== "Server" ||
    declaration.arguments_.length !== 0
  ) {
    return null;
  }
  return { name: declaration.name, receiver: { kind: "server", prefix: "" } };
}

function staticGoFrameReceiverAliasBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>
): StaticGoFrameBinding | null {
  if (node.name !== "VarDecl") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "DefName" ||
    operator === undefined ||
    nodeText(input, operator) !== ":=" ||
    value?.name !== "VariableName"
  ) {
    return null;
  }
  const name = identifierText(input, target);
  const sourceName = identifierText(input, value);
  const receiver = sourceName === null ? undefined : receivers.get(sourceName);
  return name === null || receiver === undefined ? null : { name, receiver };
}

function staticGoFrameGroupPrefix(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): string | null {
  const prefix = staticLiteralSlashPath(input, node);
  if (prefix === null || (prefix !== "/" && prefix.endsWith("/"))) {
    return null;
  }
  return prefix === "/" ? "" : prefix;
}

function staticGoFrameGroupBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>
): StaticGoFrameBinding | null {
  const declaration = staticShortVariableCall(input, node);
  if (
    declaration === null ||
    declaration.methodName !== "Group" ||
    declaration.arguments_.length !== 1
  ) {
    return null;
  }
  const parent = receivers.get(declaration.receiverName);
  const prefixNode = declaration.arguments_[0];
  const prefix = prefixNode === undefined ? null : staticGoFrameGroupPrefix(input, prefixNode);
  if (parent === undefined || prefix === null) {
    return null;
  }
  return {
    name: declaration.name,
    receiver: { kind: "group", prefix: combinedRoutePath(parent.prefix, prefix) }
  };
}

function staticGoFrameGroupCallback(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>,
  goFrameHttpAliases: ReadonlySet<string>
): StaticGoFrameGroupCallback | null {
  if (node.name !== "ExprStatement" || goFrameHttpAliases.size === 0) {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "Group" || call.arguments_.length !== 2) {
    return null;
  }
  const parent = receivers.get(call.receiverName);
  const prefixNode = call.arguments_[0];
  const callbackNode = call.arguments_[1];
  const prefix = prefixNode === undefined ? null : staticGoFrameGroupPrefix(input, prefixNode);
  if (parent === undefined || prefix === null || callbackNode?.name !== "FunctionLiteral") {
    return null;
  }
  const callbackChildren = directChildren(callbackNode);
  const callbackKeyword = callbackChildren[0];
  const parameters = callbackChildren[1];
  const body = callbackChildren[2];
  const parameter = parameters === undefined
    ? undefined
    : directChildren(parameters).find((child) => child.name === "Parameter");
  if (
    callbackChildren.length !== 3 ||
    callbackKeyword?.name !== "func" ||
    parameters === undefined ||
    parameters.name !== "Parameters" ||
    body === undefined ||
    body.name !== "Block" ||
    parameter === undefined ||
    directChildren(parameters).filter((child) => child.name === "Parameter").length !== 1
  ) {
    return null;
  }
  const aliasPattern = [...goFrameHttpAliases]
    .sort()
    .map(escapeRegularExpression)
    .join("|");
  const parameterMatch = new RegExp(
    "^([A-Za-z_][A-Za-z0-9_]*)\\s+\\*(?:" + aliasPattern + ")\\.RouterGroup$",
    "u"
  ).exec(nodeText(input, parameter).trim());
  const parameterName = parameterMatch?.[1];
  return parameterName === undefined || goFrameHttpAliases.has(parameterName)
    ? null
    : {
        receiver: { kind: "group", prefix: combinedRoutePath(parent.prefix, prefix) },
        parameterName,
        body
      };
}

function staticGoFrameBindHandlerPattern(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): { readonly method: RouteMethod; readonly path: string } | null {
  const rule = staticPlainGoString(input, node);
  if (rule === null) {
    return null;
  }
  const match = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|ALL|ANY):(.+)$/iu.exec(rule);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    const method = staticGoFrameRouteMethod(match[1]);
    const path = staticGoFrameRoutePath(match[2]);
    return method === null || path === null ? null : { method, path };
  }
  const barePath = staticGoFrameRoutePath(rule);
  return barePath === null ? null : { method: "ALL", path: barePath };
}

function staticGoFrameDirectRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>
): StaticGoFrameDirectRoute | null {
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
  const patternNode = call.arguments_[0];
  const handlerNode = call.arguments_[1];
  const handler = handlerNode === undefined ? null : staticGoFrameHandler(input, handlerNode);
  if (receiver === undefined || handler === null || patternNode === undefined) {
    return null;
  }
  if (receiver.kind === "server") {
    const pattern = call.methodName === "BindHandler"
      ? staticGoFrameBindHandlerPattern(input, patternNode)
      : null;
    return pattern === null ? null : { receiver, ...pattern, handler, node };
  }
  const method = GOFRAME_GROUP_ROUTE_METHODS[call.methodName];
  const literalPath = staticPlainGoString(input, patternNode);
  const path = literalPath === null ? null : staticGoFrameRoutePath(literalPath);
  return method === undefined || path === null ? null : { receiver, method, path, handler, node };
}

interface StaticGoFrameMapEntry {
  readonly key: GoSyntaxNode;
  readonly value: GoSyntaxNode;
  readonly node: GoSyntaxNode;
}

function staticGoFrameMapEntries(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  goFrameAliases: ReadonlySet<string>
): readonly StaticGoFrameMapEntry[] | null {
  if (node.name !== "TypedLiteral") {
    return null;
  }
  const children = directChildren(node);
  const mapType = children[0];
  const literal = children[1];
  if (
    children.length !== 2 ||
    mapType?.name !== "QualifiedType" ||
    literal?.name !== "LiteralValue"
  ) {
    return null;
  }
  const typeChildren = directChildren(mapType);
  const mapAlias = typeChildren[0] === undefined ? null : identifierText(input, typeChildren[0]);
  const mapTypeName = typeChildren[2] === undefined ? null : identifierText(input, typeChildren[2]);
  if (
    typeChildren.length !== 3 ||
    typeChildren[0]?.name !== "VariableName" ||
    typeChildren[2]?.name !== "TypeName" ||
    mapAlias === null ||
    !goFrameAliases.has(mapAlias) ||
    mapTypeName !== "Map"
  ) {
    return null;
  }
  const literalChildren = directChildren(literal).filter((child) => !isGoComment(child));
  if (
    literalChildren.some(
      (child) => child.name !== "{" && child.name !== "}" && child.name !== "," && child.name !== "Element"
    )
  ) {
    return null;
  }
  const entries: StaticGoFrameMapEntry[] = [];
  for (const element of literalChildren.filter((child) => child.name === "Element")) {
    const elementChildren = directChildren(element);
    const keyNode = elementChildren[0];
    const separator = elementChildren[1];
    const value = elementChildren[2];
    const keyChildren = keyNode === undefined ? [] : directChildren(keyNode);
    const key = keyChildren[0];
    if (
      elementChildren.length !== 3 ||
      keyNode?.name !== "Key" ||
      keyChildren.length !== 1 ||
      key === undefined ||
      separator === undefined ||
      nodeText(input, separator) !== ":" ||
      value === undefined
    ) {
      return null;
    }
    entries.push({ key, value, node: element });
  }
  return entries;
}

function staticGoFrameMapPattern(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): { readonly method: RouteMethod; readonly path: string } | null {
  const rule = staticPlainGoString(input, node);
  if (rule === null) {
    return null;
  }
  const match = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|ALL|ANY)\s*:\s*(.+?)\s*$/iu.exec(
    rule
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  const method = staticGoFrameRouteMethod(match[1]);
  const path = staticGoFrameRoutePath(match[2].trim());
  return method === null || path === null ? null : { method, path };
}

function staticGoFrameAllMapPath(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): string | null {
  const path = staticPlainGoString(input, node);
  if (
    path === null ||
    /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|ALL|ANY)\s*:/iu.test(path)
  ) {
    return null;
  }
  return staticGoFrameRoutePath(path);
}

function staticGoFrameMapRoutes(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>,
  goFrameAliases: ReadonlySet<string>
): readonly StaticGoFrameMapRoute[] | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (
    call === null ||
    (call.methodName !== "Map" && call.methodName !== "ALLMap") ||
    call.arguments_.length !== 1
  ) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const mapNode = call.arguments_[0];
  if (receiver?.kind !== "group" || mapNode === undefined) {
    return null;
  }
  const entries = staticGoFrameMapEntries(input, mapNode, goFrameAliases);
  if (entries === null) {
    return null;
  }
  const batchKind = call.methodName === "Map" ? "map" : "all-map";
  const routes: StaticGoFrameMapRoute[] = [];
  for (const entry of entries) {
    const handler = staticGoFrameHandler(input, entry.value);
    const pattern =
      batchKind === "map"
        ? staticGoFrameMapPattern(input, entry.key)
        : (() => {
            const path = staticGoFrameAllMapPath(input, entry.key);
            return path === null ? null : { method: "ALL" as const, path };
          })();
    if (handler === null || pattern === null) {
      return null;
    }
    routes.push({
      receiver,
      method: pattern.method,
      path: pattern.path,
      handler,
      node: entry.node,
      batchKind
    });
  }
  return routes;
}

function staticGoFrameControllerName(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): string | null {
  const source = nodeText(input, node);
  const addressMatch = /^&\s*([A-Z][A-Za-z0-9_]*)\s*\{\s*\}$/u.exec(source);
  if (addressMatch?.[1] !== undefined) {
    return addressMatch[1];
  }
  const constructorMatch = /^new\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*\)$/u.exec(source);
  return constructorMatch?.[1] ?? null;
}

function staticGoFrameBoundObjectControllerName(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  objectBindings: ReadonlyMap<string, string>
): string | null {
  const directControllerName = staticGoFrameControllerName(input, node);
  if (directControllerName !== null) {
    return directControllerName;
  }
  const objectBindingName = node.name === "VariableName" ? identifierText(input, node) : null;
  return objectBindingName === null ? null : (objectBindings.get(objectBindingName) ?? null);
}

function staticGoFrameBindObjectMethodNames(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): readonly string[] | null {
  const value = staticPlainGoString(input, node);
  if (value === null) {
    return null;
  }
  const methodNames = value.split(",").map((methodName) => methodName.trim());
  if (
    methodNames.length === 0 ||
    methodNames.some(
      (methodName) =>
        !/^[A-Z][a-z0-9]*$/u.test(methodName) ||
        GOFRAME_OBJECT_LIFECYCLE_METHODS.has(methodName)
    ) ||
    new Set(methodNames).size !== methodNames.length
  ) {
    return null;
  }
  return methodNames;
}

function staticGoFrameObjectRoutePath(path: string, methodName: string): string {
  const suffix = "/" + methodName.toLowerCase();
  return path === "/" ? suffix : path + suffix;
}

function staticGoFrameObjectPattern(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): { readonly method: RouteMethod; readonly path: string } | null {
  const pattern = staticGoFrameBindHandlerPattern(input, node);
  return pattern === null ||
    /\{\.\w+\}/u.test(pattern.path) ||
    (pattern.path !== "/" && pattern.path.endsWith("/"))
    ? null
    : pattern;
}

function staticGoFrameObjectRestPath(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): string | null {
  const value = staticPlainGoString(input, node);
  if (
    value === null ||
    /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|ALL|ANY):/iu.test(value)
  ) {
    return null;
  }
  const path = staticGoFrameRoutePath(value);
  return path === null || /\{\.\w+\}/u.test(path) ? null : path;
}

function staticGoFrameObjectRestRouteMethod(methodName: string): RouteMethod | null {
  const method = methodName.toUpperCase() as RouteMethod;
  return GOFRAME_OBJECT_REST_ROUTE_METHODS.has(method) ? method : null;
}

function staticGoFrameObjectRouteNameMutation(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>
): GoFrameReceiver | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  const receiver = call === null ? undefined : receivers.get(call.receiverName);
  return call?.methodName === "SetNameToUriType" && receiver?.kind === "server"
    ? receiver
    : null;
}

function staticGoFrameObjectBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode
): StaticGoFrameObjectBinding | null {
  if (node.name !== "VarDecl") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "DefName" ||
    operator === undefined ||
    nodeText(input, operator) !== ":=" ||
    value === undefined
  ) {
    return null;
  }
  const name = identifierText(input, target);
  const controllerName = staticGoFrameControllerName(input, value);
  return name === null || controllerName === null ? null : { name, controllerName };
}

function staticGoFrameControllerBinding(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>
): StaticGoFrameControllerBinding | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "Bind" || call.arguments_.length !== 1) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const controllerNode = call.arguments_[0];
  const controllerName =
    controllerNode === undefined ? null : staticGoFrameControllerName(input, controllerNode);
  return receiver === undefined || controllerName === null
    ? null
    : { receiver, controllerName };
}

function staticGoFrameBindObjectMethodRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>,
  objectBindings: ReadonlyMap<string, string>
): StaticGoFrameBindObjectMethodRoute | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "BindObjectMethod" || call.arguments_.length !== 3) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const patternNode = call.arguments_[0];
  const objectNode = call.arguments_[1];
  const methodNode = call.arguments_[2];
  const pattern = patternNode === undefined ? null : staticGoFrameBindHandlerPattern(input, patternNode);
  const controllerName =
    objectNode === undefined
      ? null
      : staticGoFrameBoundObjectControllerName(input, objectNode, objectBindings);
  const methodName = methodNode === undefined ? null : staticPlainGoString(input, methodNode);
  return receiver?.kind !== "server" ||
    pattern === null ||
    controllerName === null ||
    methodName === null ||
    !/^[A-Z][A-Za-z0-9_]*$/u.test(methodName)
    ? null
    : { receiver, ...pattern, controllerName, methodName, node };
}

function staticGoFrameBindObjectRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>,
  objectBindings: ReadonlyMap<string, string>,
  objectRouteNameMutatedServers: ReadonlySet<GoFrameReceiver>
): StaticGoFrameBindObjectRoute | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "BindObject" || call.arguments_.length !== 3) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const patternNode = call.arguments_[0];
  const objectNode = call.arguments_[1];
  const methodsNode = call.arguments_[2];
  const pattern = patternNode === undefined ? null : staticGoFrameObjectPattern(input, patternNode);
  const controllerName =
    objectNode === undefined
      ? null
      : staticGoFrameBoundObjectControllerName(input, objectNode, objectBindings);
  const methodNames =
    methodsNode === undefined ? null : staticGoFrameBindObjectMethodNames(input, methodsNode);
  return receiver?.kind !== "server" ||
    objectRouteNameMutatedServers.has(receiver) ||
    pattern === null ||
    controllerName === null ||
    methodNames === null
    ? null
    : { receiver, ...pattern, controllerName, methodNames, node };
}

function staticGoFrameBindObjectRestRoute(
  input: GoExtractFileFactsInput,
  node: GoSyntaxNode,
  receivers: ReadonlyMap<string, GoFrameReceiver>,
  objectBindings: ReadonlyMap<string, string>
): StaticGoFrameBindObjectRestRoute | null {
  if (node.name !== "ExprStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression === undefined) {
    return null;
  }
  const call = staticSelectorCall(input, expression);
  if (call === null || call.methodName !== "BindObjectRest" || call.arguments_.length !== 2) {
    return null;
  }
  const receiver = receivers.get(call.receiverName);
  const patternNode = call.arguments_[0];
  const objectNode = call.arguments_[1];
  const path = patternNode === undefined ? null : staticGoFrameObjectRestPath(input, patternNode);
  const controllerName =
    objectNode === undefined
      ? null
      : staticGoFrameBoundObjectControllerName(input, objectNode, objectBindings);
  return receiver?.kind !== "server" || path === null || controllerName === null
    ? null
    : { receiver, path, controllerName, node };
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
 * handler or statically constructed same-file object method; runtime discovery
 * and dynamic dispatch remain intentionally absent.
 */
export function extractGoFileFacts(input: GoExtractFileFactsInput): ArtifactFacts {
  const ginCapability = frameworkCapability("gin");
  const fiberCapability = frameworkCapability("fiber");
  const echoCapability = frameworkCapability("echo");
  const netHttpCapability = frameworkCapability("net-http");
  const chiCapability = frameworkCapability("chi");
  const goFrameCapability = frameworkCapability("goframe");
  if (
    !ginCapability.languages.includes(input.language) ||
    !fiberCapability.languages.includes(input.language) ||
    !echoCapability.languages.includes(input.language) ||
    !netHttpCapability.languages.includes(input.language) ||
    !chiCapability.languages.includes(input.language) ||
    !goFrameCapability.languages.includes(input.language)
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

  const goFrameMethodSymbols = new Map<number, SymbolNode>();

  function goFrameMethodSymbol(method: StaticGoFrameMethod): SymbolNode {
    const existing = goFrameMethodSymbols.get(method.node.from);
    if (existing !== undefined) {
      return existing;
    }
    const qualifiedName = input.filePath + "#" + method.controllerName + "." + method.name;
    const identity = qualifiedName + "\u0000method";
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: method.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeFor(lineStarts, method.node.from, method.node.to),
      isExported: /^[A-Z]/u.test(method.name),
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, method.node);
    goFrameMethodSymbols.set(method.node.from, symbol);
    return symbol;
  }

  function addGoFrameRoute(
    routeFact: StaticGoFrameRoute,
    handler: SymbolNode
  ): void {
    const ruleId = "batchKind" in routeFact
      ? routeFact.batchKind === "map"
        ? routeFact.handler.kind === "function"
          ? "framework.goframe.group.map.local-function"
          : "framework.goframe.group.map.local-object-method"
        : routeFact.handler.kind === "function"
          ? "framework.goframe.group.all-map.local-function"
          : "framework.goframe.group.all-map.local-object-method"
      : routeFact.handler.kind === "function"
        ? routeFact.receiver.kind === "server"
          ? "framework.goframe.direct-server.bind-handler.local-function"
          : "framework.goframe.direct-group.http-method.local-function"
        : routeFact.receiver.kind === "server"
          ? "framework.goframe.direct-server.bind-handler.local-object-method"
          : "framework.goframe.direct-group.http-method.local-object-method";
    addResolvedRoute(
      routeFact.method,
      combinedRoutePath(routeFact.receiver.prefix, routeFact.path),
      routeFact.node,
      handler,
      ruleId
    );
  }

  function addGoFrameBindObjectMethodRoute(
    routeFact: StaticGoFrameBindObjectMethodRoute,
    handler: SymbolNode
  ): void {
    addResolvedRoute(
      routeFact.method,
      combinedRoutePath(routeFact.receiver.prefix, routeFact.path),
      routeFact.node,
      handler,
      "framework.goframe.direct-server.bind-object-method.local-object-method"
    );
  }

  function addGoFrameBindObjectRoute(
    routeFact: StaticGoFrameBindObjectRoute,
    methodName: string,
    handler: SymbolNode
  ): void {
    addResolvedRoute(
      routeFact.method,
      staticGoFrameObjectRoutePath(routeFact.path, methodName),
      routeFact.node,
      handler,
      "framework.goframe.direct-server.bind-object.local-object-method"
    );
    if (methodName === "Index") {
      addResolvedRoute(
        routeFact.method,
        routeFact.path,
        routeFact.node,
        handler,
        "framework.goframe.direct-server.bind-object.local-object-method"
      );
    }
  }

  function addGoFrameBindObjectRestRoute(
    routeFact: StaticGoFrameBindObjectRestRoute,
    method: RouteMethod,
    handler: SymbolNode
  ): void {
    addResolvedRoute(
      method,
      routeFact.path,
      routeFact.node,
      handler,
      "framework.goframe.direct-server.bind-object-rest.local-object-method"
    );
  }

  function addGoFrameStandardRouterRoute(
    binding: StaticGoFrameControllerBinding,
    request: StaticGoFrameRequest,
    method: StaticGoFrameControllerMethod
  ): void {
    addResolvedRoute(
      request.method,
      combinedRoutePath(binding.receiver.prefix, request.path),
      request.node,
      goFrameMethodSymbol(method),
      "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method"
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
    const goFrameAliases = staticGoFrameImportAliases(input, root);
    const goFrameHttpAliases = staticGoFrameHttpImportAliases(input, root);
    const contextAliases = staticContextImportAliases(input, root);
    const goFrameRequests = staticGoFrameRequests(input, root, new Set(goFrameAliases));
    const goFrameDeclaredMethods = staticGoFrameDeclaredMethods(input, root);
    const goFrameControllerMethods = staticGoFrameControllerMethods(
      input,
      goFrameDeclaredMethods,
      new Set(contextAliases)
    );
    const goFrameObjectHandlerMethods = staticGoFrameObjectHandlerMethods(
      input,
      goFrameDeclaredMethods,
      new Set(goFrameHttpAliases)
    );
    const goFrameControllerBindings: StaticGoFrameControllerBinding[] = [];
    const goFrameMethodsByIdentity = new Map<string, StaticGoFrameMethod[]>();
    for (const method of goFrameDeclaredMethods) {
      const identity = method.controllerName + "\u0000" + method.name;
      const sameIdentity = goFrameMethodsByIdentity.get(identity) ?? [];
      sameIdentity.push(method);
      goFrameMethodsByIdentity.set(identity, sameIdentity);
    }
    const goFrameObjectHandlerMethodsByIdentity = new Map<string, StaticGoFrameMethod[]>();
    for (const method of goFrameObjectHandlerMethods) {
      const identity = method.controllerName + "\u0000" + method.name;
      const sameIdentity = goFrameObjectHandlerMethodsByIdentity.get(identity) ?? [];
      sameIdentity.push(method);
      goFrameObjectHandlerMethodsByIdentity.set(identity, sameIdentity);
    }
    const goFrameObjectRestMethodsByIdentity = new Map<string, StaticGoFrameMethod[]>();
    for (const method of goFrameObjectHandlerMethods) {
      const routeMethod = staticGoFrameObjectRestRouteMethod(method.name);
      if (routeMethod === null) {
        continue;
      }
      const identity = method.controllerName + "\u0000" + routeMethod;
      const sameIdentity = goFrameObjectRestMethodsByIdentity.get(identity) ?? [];
      sameIdentity.push(method);
      goFrameObjectRestMethodsByIdentity.set(identity, sameIdentity);
    }

    function addGoFrameRouteHandler(
      routeFact: StaticGoFrameRoute,
      objectBindings: ReadonlyMap<string, string>,
      shadowedNames: ReadonlySet<string>
    ): void {
      if (routeFact.handler.kind === "function") {
        if (shadowedNames.has(routeFact.handler.name)) {
          return;
        }
        const candidates = functionsByName.get(routeFact.handler.name) ?? [];
        if (candidates.length === 1) {
          const handler = candidates[0];
          if (handler !== undefined) {
            addGoFrameRoute(routeFact, handler);
          }
        }
        return;
      }
      const controllerName = objectBindings.get(routeFact.handler.receiverName);
      if (controllerName === undefined) {
        return;
      }
      const candidates = goFrameMethodsByIdentity.get(
        controllerName + "\u0000" + routeFact.handler.methodName
      ) ?? [];
      if (candidates.length === 1) {
        const method = candidates[0];
        if (method !== undefined) {
          addGoFrameRoute(routeFact, goFrameMethodSymbol(method));
        }
      }
    }

    function extractGoFrameDirectStatements(
      statements: readonly GoSyntaxNode[],
      receivers: Map<string, GoFrameReceiver>,
      objectBindings: Map<string, string>,
      shadowedNames: Set<string>,
      objectRouteNameMutatedServers: Set<GoFrameReceiver>,
      visibleGoFrameAliases: ReadonlySet<string>,
      visibleGoFrameHttpAliases: ReadonlySet<string>
    ): void {
      for (const statement of statements) {
        const serverBinding = staticGoFrameServerBinding(
          input,
          statement,
          visibleGoFrameAliases,
          shadowedNames
        );
        if (serverBinding !== null) {
          receivers.set(serverBinding.name, serverBinding.receiver);
        }
        const receiverAliasBinding = staticGoFrameReceiverAliasBinding(
          input,
          statement,
          receivers
        );
        if (receiverAliasBinding !== null) {
          receivers.set(receiverAliasBinding.name, receiverAliasBinding.receiver);
        }
        const groupBinding = staticGoFrameGroupBinding(input, statement, receivers);
        if (groupBinding !== null) {
          receivers.set(groupBinding.name, groupBinding.receiver);
        }
        const objectBinding = staticGoFrameObjectBinding(input, statement);
        if (objectBinding !== null) {
          objectBindings.set(objectBinding.name, objectBinding.controllerName);
        }
        const objectRouteNameMutation = staticGoFrameObjectRouteNameMutation(
          input,
          statement,
          receivers
        );
        if (objectRouteNameMutation !== null) {
          objectRouteNameMutatedServers.add(objectRouteNameMutation);
        }
        const routeFact = staticGoFrameDirectRoute(input, statement, receivers);
        if (routeFact !== null) {
          addGoFrameRouteHandler(routeFact, objectBindings, shadowedNames);
        }
        const mapRoutes = staticGoFrameMapRoutes(
          input,
          statement,
          receivers,
          new Set([...visibleGoFrameAliases].filter((alias) => !shadowedNames.has(alias)))
        );
        if (mapRoutes !== null) {
          for (const mapRoute of mapRoutes) {
            addGoFrameRouteHandler(mapRoute, objectBindings, shadowedNames);
          }
        }
        const bindObjectMethodRoute = staticGoFrameBindObjectMethodRoute(
          input,
          statement,
          receivers,
          objectBindings
        );
        if (bindObjectMethodRoute !== null) {
          const candidates = goFrameObjectHandlerMethodsByIdentity.get(
            bindObjectMethodRoute.controllerName + "\u0000" + bindObjectMethodRoute.methodName
          ) ?? [];
          if (candidates.length === 1) {
            const method = candidates[0];
            if (method !== undefined) {
              addGoFrameBindObjectMethodRoute(bindObjectMethodRoute, goFrameMethodSymbol(method));
            }
          }
        }
        const bindObjectRoute = staticGoFrameBindObjectRoute(
          input,
          statement,
          receivers,
          objectBindings,
          objectRouteNameMutatedServers
        );
        if (bindObjectRoute !== null) {
          const selectedMethods = bindObjectRoute.methodNames.map((methodName) => ({
            methodName,
            candidates:
              goFrameObjectHandlerMethodsByIdentity.get(
                bindObjectRoute.controllerName + "\u0000" + methodName
              ) ?? []
          }));
          if (selectedMethods.every((selection) => selection.candidates.length === 1)) {
            for (const selection of selectedMethods) {
              const method = selection.candidates[0];
              if (method !== undefined) {
                addGoFrameBindObjectRoute(
                  bindObjectRoute,
                  selection.methodName,
                  goFrameMethodSymbol(method)
                );
              }
            }
          }
        }
        const bindObjectRestRoute = staticGoFrameBindObjectRestRoute(
          input,
          statement,
          receivers,
          objectBindings
        );
        if (bindObjectRestRoute !== null) {
          for (const method of GOFRAME_OBJECT_REST_ROUTE_METHODS) {
            const candidates = goFrameObjectRestMethodsByIdentity.get(
              bindObjectRestRoute.controllerName + "\u0000" + method
            ) ?? [];
            if (candidates.length === 1) {
              const handler = candidates[0];
              if (handler !== undefined) {
                addGoFrameBindObjectRestRoute(
                  bindObjectRestRoute,
                  method,
                  goFrameMethodSymbol(handler)
                );
              }
            }
          }
        }
        const controllerBinding = staticGoFrameControllerBinding(input, statement, receivers);
        if (controllerBinding !== null) {
          goFrameControllerBindings.push(controllerBinding);
        }
        const callback = staticGoFrameGroupCallback(
          input,
          statement,
          receivers,
          new Set(
            [...visibleGoFrameHttpAliases].filter((alias) => !shadowedNames.has(alias))
          )
        );
        if (callback !== null) {
          const callbackReceivers = new Map(receivers);
          callbackReceivers.set(callback.parameterName, callback.receiver);
          const callbackObjects = new Map(objectBindings);
          const callbackShadowedNames = new Set(shadowedNames);
          callbackShadowedNames.add(callback.parameterName);
          extractGoFrameDirectStatements(
            directChildren(callback.body),
            callbackReceivers,
            callbackObjects,
            callbackShadowedNames,
            objectRouteNameMutatedServers,
            visibleGoFrameAliases,
            visibleGoFrameHttpAliases
          );
        }

        const retainedReceiverBindings = new Set(
          [serverBinding?.name, receiverAliasBinding?.name, groupBinding?.name].filter(
            (name): name is string => name !== undefined
          )
        );
        const retainedObjectBindings = new Set(
          [objectBinding?.name].filter((name): name is string => name !== undefined)
        );
        for (const name of directBoundNames(input, statement)) {
          if (!retainedReceiverBindings.has(name)) {
            receivers.delete(name);
          }
          if (!retainedObjectBindings.has(name)) {
            objectBindings.delete(name);
          }
          shadowedNames.add(name);
        }
      }
    }

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

    for (const functionDeclaration of functions) {
      const visibleGoFrameAliases = new Set(
        goFrameAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleGoFrameHttpAliases = new Set(
        goFrameHttpAliases.filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      extractGoFrameDirectStatements(
        directChildren(functionDeclaration.body),
        new Map<string, GoFrameReceiver>(),
        new Map<string, string>(),
        new Set(functionDeclaration.parameterNames),
        new Set<GoFrameReceiver>(),
        visibleGoFrameAliases,
        visibleGoFrameHttpAliases
      );
    }

    for (const binding of goFrameControllerBindings) {
      for (const method of goFrameControllerMethods) {
        if (method.controllerName !== binding.controllerName) {
          continue;
        }
        const requestMatches = goFrameRequests.filter(
          (request) => request.name === method.requestType
        );
        if (requestMatches.length !== 1) {
          continue;
        }
        const request = requestMatches[0];
        if (request !== undefined) {
          addGoFrameStandardRouterRoute(binding, request, method);
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

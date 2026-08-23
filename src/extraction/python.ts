import { parser } from "@lezer/python";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type DjangoImportedUrlconfInclusionFact,
  type DjangoNinjaImportedRouterInclusionFact,
  type DjangoNinjaRouterDeclarationFact,
  type DjangoNinjaRouterReExportFact,
  type DjangoNinjaRouterRouteFact,
  type DjangoLiteralUrlconfInclusionFact,
  type DjangoUrlconfReExportFact,
  type DjangoUrlPatternHandlerKind,
  type DjangoUrlPatternRouteFact,
  type FastApiImportedRouterInclusionFact,
  type FastApiRouterDeclarationFact,
  type FastApiRouterReExportFact,
  type FastApiRouterRouteFact,
  type FlaskBlueprintDeclarationFact,
  type FlaskBlueprintReExportFact,
  type FlaskBlueprintRouteFact,
  type FlaskImportedBlueprintRegistrationFact,
  type GraphEdge,
  type PythonImportedClassInheritanceFact,
  type PythonImportedClassInstantiationFact,
  type PythonImportedFunctionCallFact,
  type PythonRelativeNamedImportFact,
  type PythonTopLevelDeclarationFact,
  type RouteMethod,
  type SanicBlueprintDeclarationFact,
  type SanicBlueprintGroupDeclarationFact,
  type SanicBlueprintGroupMemberFact,
  type SanicBlueprintReExportFact,
  type SanicBlueprintRouteFact,
  type SanicImportedBlueprintRegistrationFact,
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
  /** Optional diagnostics hook; invoked exactly once for each direct-call caller body traversal. */
  readonly directCallTraversalObserver?: () => void;
}

type PythonSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

type FrameworkImportedConstructor =
  | "FastAPI"
  | "APIRouter"
  | "NinjaAPI"
  | "Router"
  | "Flask"
  | "Api"
  | "Blueprint"
  | "Starlette"
  | "Sanic";

interface FrameworkNamedImport {
  readonly importedName: string;
  readonly alias: string;
  readonly node: PythonSyntaxNode;
}

interface StaticPythonRelativeNamedImport {
  readonly moduleName: string;
  readonly importedName: string;
  readonly localName: string;
  readonly moduleFrom: number;
  readonly moduleTo: number;
}

function staticPythonRelativeNamedImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly StaticPythonRelativeNamedImport[] {
  if (node.name !== "ImportStatement" || hasSyntaxError(node)) {
    return [];
  }
  const children = directChildren(node);
  const module = children[2];
  if (
    children[0]?.name !== "from" ||
    children[1]?.name !== "." ||
    module === undefined ||
    children[3]?.name !== "import"
  ) {
    return [];
  }
  const moduleName = declarationName(input, module);
  if (moduleName === null) {
    return [];
  }
  const confirmedModuleName = moduleName;
  const moduleFrom = children[1].from;
  const moduleTo = module.to;

  function binding(
    importedNode: PythonSyntaxNode,
    localNode: PythonSyntaxNode
  ): StaticPythonRelativeNamedImport | null {
    const importedName = declarationName(input, importedNode);
    const localName = declarationName(input, localNode);
    return importedName === null || localName === null
      ? null
      : {
          moduleName: confirmedModuleName,
          importedName,
          localName,
          moduleFrom,
          moduleTo
        };
  }

  const firstImported = children[4];
  if (firstImported === undefined) {
    return [];
  }
  if (firstImported.name !== "(") {
    if (firstImported.name !== "VariableName") {
      return [];
    }
    if (children.length === 5) {
      const result = binding(firstImported, firstImported);
      return result === null ? [] : [result];
    }
    if (children.length === 7 && children[5]?.name === "as" && children[6]?.name === "VariableName") {
      const result = binding(firstImported, children[6]);
      return result === null ? [] : [result];
    }
    return [];
  }

  const imports: StaticPythonRelativeNamedImport[] = [];
  let index = 5;
  while (index < children.length) {
    while (children[index]?.name === "Comment") {
      index += 1;
    }
    if (children[index]?.name === ")") {
      return imports.length === 0 || index !== children.length - 1 ? [] : imports;
    }
    const imported = children[index];
    if (imported?.name !== "VariableName") {
      return [];
    }
    index += 1;
    let local = imported;
    if (children[index]?.name === "as") {
      const alias = children[index + 1];
      if (alias?.name !== "VariableName") {
        return [];
      }
      local = alias;
      index += 2;
    }
    const result = binding(imported, local);
    if (result === null) {
      return [];
    }
    imports.push(result);
    while (children[index]?.name === "Comment") {
      index += 1;
    }
    if (children[index]?.name === ")") {
      return index === children.length - 1 ? imports : [];
    }
    if (children[index]?.name !== ",") {
      return [];
    }
    index += 1;
  }
  return [];
}

function hasPythonWildcardImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[]
): boolean {
  return topLevelNodes.some(
    (node) =>
      node.name === "ImportStatement" &&
      /^from[\t ].*[\t ]+import[\t ]+\*[\t ]*$/u.test(nodeText(input, node))
  );
}

interface DjangoUrlImport extends FrameworkNamedImport {
  readonly source: "django.urls" | "django.conf.urls";
}

interface FrameworkDirectInstance {
  readonly name: string;
  readonly constructorName: string;
  readonly node: PythonSyntaxNode;
}

interface FastApiApplication extends FrameworkDirectInstance {}

interface DjangoNinjaApplication extends FrameworkDirectInstance {}

interface DjangoNinjaRouter extends FrameworkDirectInstance {}

interface FastApiRouter extends FrameworkDirectInstance {
  readonly prefix: string;
}

interface FlaskApplication extends FrameworkDirectInstance {}

/** A direct `flask_restful.Api(app)` binding tied to one proven Flask application. */
interface FlaskRestfulApi extends FrameworkDirectInstance {
  readonly applicationName: string;
}

interface FlaskBlueprint extends FrameworkDirectInstance {
  readonly prefix: string;
}

/** A direct, undecorated top-level `Resource` subclass with a stable class binding. */
interface FlaskRestfulResourceClass {
  readonly name: string;
  readonly resourceBaseName: string;
  readonly node: PythonSyntaxNode;
  readonly symbol: SymbolNode;
}

/** One unique direct HTTP method on a proven Flask-RESTful Resource subclass. */
interface FlaskRestfulResourceMethod {
  readonly method: RouteMethod;
  readonly handler: SymbolNode;
}

interface StarletteApplication extends FrameworkDirectInstance {
  readonly routeListName: string | null;
  readonly inlineRoutes: readonly StaticStarletteRoute[] | null;
}

/** A direct `from aiohttp import web` application instance. */
interface AioHttpApplication {
  readonly name: string;
  readonly webModuleName: string;
  readonly node: PythonSyntaxNode;
}

/** A direct `from sanic import Sanic` application instance. */
interface SanicApplication extends FrameworkDirectInstance {}

/** A direct `from sanic import Blueprint` instance with a literal URL prefix. */
interface SanicBlueprint extends FrameworkDirectInstance {
  readonly prefix: string;
}

/** A direct same-file Blueprint.group call with literal variable members and prefix. */
interface SanicBlueprintGroup {
  readonly name: string;
  readonly constructorName: string;
  readonly memberNames: readonly string[];
  readonly prefix: string;
  readonly namePrefix: string | null;
  readonly node: PythonSyntaxNode;
}

interface ResolvedSanicBlueprintGroupMember {
  readonly blueprint: SanicBlueprint;
  readonly prefixes: readonly string[];
  readonly groupDepth: number;
}

interface StaticFastApiDecorator {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

interface StaticDjangoNinjaApiOperationDecorator {
  readonly receiver: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

interface StaticFastApiRouterInclusion {
  readonly applicationName: string;
  readonly routerName: string;
  readonly prefix: string;
  readonly node: PythonSyntaxNode;
}

interface StaticDjangoNinjaRouterInclusion {
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

/** One direct top-level Sanic application decorator attached to a function. */
interface StaticSanicDecorator {
  readonly receiver: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

/** One direct literal `app.blueprint(blueprint, url_prefix="/prefix")` registration. */
interface StaticSanicBlueprintRegistration {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly prefix: string;
  readonly node: PythonSyntaxNode;
}

interface ProvenSanicBlueprintRegistration {
  readonly registration: StaticSanicBlueprintRegistration;
  readonly blueprint: SanicBlueprint;
}

interface ProvenSanicBlueprintGroupRegistration {
  readonly registration: StaticSanicBlueprintRegistration;
  readonly group: SanicBlueprintGroup;
  readonly members: readonly ResolvedSanicBlueprintGroupMember[];
}

interface ResolvedSanicBlueprintGroupMount {
  readonly registration: ProvenSanicBlueprintGroupRegistration;
  readonly member: ResolvedSanicBlueprintGroupMember;
}

interface StaticFlaskBlueprintRegistration {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly prefix: string;
  readonly node: PythonSyntaxNode;
}

/** One direct literal `api.add_resource(Resource, "/path", ...)` registration. */
interface StaticFlaskRestfulResourceRegistration {
  readonly apiName: string;
  readonly resourceClassName: string;
  readonly paths: readonly string[];
  readonly node: PythonSyntaxNode;
}

/** One direct literal `starlette.routing.Route(...)` entry. */
interface StaticStarletteRoute {
  readonly factoryName: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly handlerName: string;
  readonly node: PythonSyntaxNode;
}

/** A direct top-level literal list passed through a Starlette `routes=` option. */
interface StaticStarletteRouteList {
  readonly name: string;
  readonly routes: readonly StaticStarletteRoute[];
  readonly node: PythonSyntaxNode;
}

/** One direct `app.router.add_*` or `add_route` aiohttp registration. */
interface StaticAioHttpRouteRegistration {
  readonly applicationName: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly handlerName: string;
  readonly node: PythonSyntaxNode;
}

/** One direct literal `aiohttp.web.get(...)` or `route(...)` table entry. */
interface StaticAioHttpRouteDefinition {
  readonly webModuleName: string;
  readonly methods: readonly RouteMethod[];
  readonly path: string;
  readonly handlerName: string;
  readonly node: PythonSyntaxNode;
}

/** A top-level literal aiohttp route table passed to `app.router.add_routes`. */
interface StaticAioHttpRouteList {
  readonly name: string;
  readonly routes: readonly StaticAioHttpRouteDefinition[];
  readonly node: PythonSyntaxNode;
}

/** One direct app-router registration of a named or inline literal aiohttp route table. */
interface StaticAioHttpRouteTableRegistration {
  readonly applicationName: string;
  readonly routeListName: string | null;
  readonly inlineRoutes: readonly StaticAioHttpRouteDefinition[] | null;
  readonly node: PythonSyntaxNode;
}

type DjangoUrlPatternFactory = "path" | "re_path" | "url";

/** One direct literal `path(...)`, `re_path(...)`, or legacy `url(...)` entry in final urlpatterns. */
interface StaticDjangoUrlPatternRoute {
  readonly factoryName: string;
  readonly factory: DjangoUrlPatternFactory;
  readonly path: string;
  readonly handlerName: string;
  readonly handlerKind: DjangoUrlPatternHandlerKind;
  readonly node: PythonSyntaxNode;
}

/** A same-file Django handler accepted by the direct URL pattern subset. */
interface StaticDjangoUrlPatternHandler {
  readonly name: string;
  readonly kind: DjangoUrlPatternHandlerKind;
}

/** Shared syntax for one static Django URLConf inclusion entry in urlpatterns. */
interface StaticDjangoUrlconfInclusionBase {
  readonly factoryName: string;
  readonly factory: DjangoUrlPatternFactory;
  readonly includeFactoryName: string;
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

/** One literal `path(prefix, include(imported_urlconf))` entry in final urlpatterns. */
interface StaticDjangoImportedUrlconfInclusion extends StaticDjangoUrlconfInclusionBase {
  readonly kind: "imported";
  readonly urlconfName: string;
}

/** One literal `path(prefix, include("project.urlconf"))` entry in final urlpatterns. */
interface StaticDjangoLiteralUrlconfInclusion extends StaticDjangoUrlconfInclusionBase {
  readonly kind: "literal";
  readonly moduleSpecifier: string;
}

interface StaticDjangoUrlPatternList {
  readonly node: PythonSyntaxNode;
  readonly routes: readonly StaticDjangoUrlPatternRoute[];
  readonly importedUrlconfInclusions: readonly StaticDjangoImportedUrlconfInclusion[];
  readonly literalUrlconfInclusions: readonly StaticDjangoLiteralUrlconfInclusion[];
}

/** One static, single-name Python import that can carry an APIRouter. */
interface StaticFastApiRouterImport {
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute";
  readonly importedRouterName: string;
  readonly routerName: string;
  readonly node: PythonSyntaxNode;
}

/** A one-dot, single-name Python relative import that can carry an APIRouter. */
interface StaticFastApiRelativeRouterImport extends StaticFastApiRouterImport {
  readonly moduleSpecifierKind: "relative";
}

/** A direct, dotted Python import that can carry an APIRouter. */
interface StaticFastApiAbsoluteRouterImport extends StaticFastApiRouterImport {
  readonly moduleSpecifierKind: "absolute";
}

/** One static, single-name Python import that can carry a Django Ninja Router. */
interface StaticDjangoNinjaRouterImport {
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute";
  readonly importedRouterName: string;
  readonly routerName: string;
  readonly node: PythonSyntaxNode;
}

/** A one-dot, single-name Python relative import that can carry a Django Ninja Router. */
interface StaticDjangoNinjaRelativeRouterImport extends StaticDjangoNinjaRouterImport {
  readonly moduleSpecifierKind: "relative";
}

/** A direct, dotted Python import that can carry a Django Ninja Router. */
interface StaticDjangoNinjaAbsoluteRouterImport extends StaticDjangoNinjaRouterImport {
  readonly moduleSpecifierKind: "absolute";
}

/** One static, single-name Python import that can carry a Flask Blueprint. */
interface StaticFlaskBlueprintImport {
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute";
  readonly importedBlueprintName: string;
  readonly blueprintName: string;
  readonly node: PythonSyntaxNode;
}

/** A one-dot, single-name Python relative import that can carry a Flask Blueprint. */
interface StaticFlaskRelativeBlueprintImport extends StaticFlaskBlueprintImport {
  readonly moduleSpecifierKind: "relative";
}

/** A direct, dotted Python import that can carry a Flask Blueprint. */
interface StaticFlaskAbsoluteBlueprintImport extends StaticFlaskBlueprintImport {
  readonly moduleSpecifierKind: "absolute";
}

/** A one-dot, single-name Python relative import that can carry a Sanic Blueprint or group. */
interface StaticSanicRelativeBlueprintImport {
  readonly moduleSpecifier: string;
  readonly importedBlueprintName: string;
  readonly blueprintName: string;
  readonly node: PythonSyntaxNode;
}

/** A package-relative import that can expose a final Django URLConf. */
interface StaticDjangoRelativeUrlconfImport {
  readonly moduleSpecifier: string;
  readonly importedUrlconfName: string;
  readonly urlconfName: string;
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

const DJANGO_NINJA_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE"
};

const DJANGO_NINJA_API_OPERATION_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
]);

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

const FLASK_RESTFUL_RESOURCE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE"
};

const STARLETTE_ROUTE_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE"
]);

const AIOHTTP_ROUTER_SHORTCUT_METHODS: Readonly<Record<string, readonly RouteMethod[]>> = {
  add_get: ["GET", "HEAD"],
  add_post: ["POST"],
  add_put: ["PUT"],
  add_patch: ["PATCH"],
  add_delete: ["DELETE"],
  add_head: ["HEAD"]
};

const AIOHTTP_ROUTE_TABLE_SHORTCUT_METHODS: Readonly<Record<string, readonly RouteMethod[]>> = {
  get: ["GET", "HEAD"],
  post: ["POST"],
  put: ["PUT"],
  patch: ["PATCH"],
  delete: ["DELETE"],
  head: ["HEAD"]
};

const SANIC_SHORTCUT_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS"
};

const AIOHTTP_ROUTE_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
]);

const SANIC_ROUTE_METHODS = new Set<RouteMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
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

function lastPythonCodeTokenEnd(node: PythonSyntaxNode): number | null {
  if (node.name === "Comment" || node.type.isError) {
    return null;
  }
  if (node.name === "String" && !hasSyntaxError(node)) {
    return node.to;
  }
  const children = directChildren(node);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child === undefined) {
      continue;
    }
    const end = lastPythonCodeTokenEnd(child);
    if (end !== null) {
      return end;
    }
  }
  return children.length === 0 && node.to > node.from ? node.to : null;
}

function hasSyntaxError(node: PythonSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function pythonSyntaxErrors(root: PythonSyntaxNode): readonly PythonSyntaxNode[] {
  const errors: PythonSyntaxNode[] = [];
  function collect(node: PythonSyntaxNode): void {
    if (node.type.isError) {
      errors.push(node);
    }
    for (const child of directChildren(node)) {
      collect(child);
    }
  }
  collect(root);
  return errors;
}

interface PythonRecoveryCompatibility {
  readonly mode: "full" | "declarations-only";
  readonly unsafeBindings: readonly {
    readonly name: string;
    readonly from: number;
    readonly to: number;
  }[];
}

function pythonRecoveryCompatibility(
  input: PythonExtractFileFactsInput,
  root: PythonSyntaxNode
): PythonRecoveryCompatibility | null {
  const errors = pythonSyntaxErrors(root);

  if (errors.length === 0) {
    return { mode: "full", unsafeBindings: [] };
  }

  function isClosedBareYield(error: PythonSyntaxNode): boolean {
    if (error.from !== error.to) {
      return false;
    }
    const yieldNode = error.parent;
    if (yieldNode?.name !== "YieldStatement" && yieldNode?.name !== "YieldExpression") {
      return false;
    }
    const children = directChildren(yieldNode);
    const errorIndex = children.findIndex((child) => nodeKey(child) === nodeKey(error));
    const previous = errorIndex > 0 ? children[errorIndex - 1] : undefined;
    if (
      errorIndex !== children.length - 1 ||
      previous?.name !== "yield" ||
      previous.to !== error.from ||
      nodeText(input, yieldNode) !== "yield"
    ) {
      return false;
    }
    const requiredAncestor =
      yieldNode.name === "YieldStatement" ? "FunctionDefinition" : "LambdaExpression";
    for (let ancestor = yieldNode.parent; ancestor !== null; ancestor = ancestor.parent) {
      if (ancestor.name === requiredAncestor) {
        return true;
      }
      if (ancestor.name === "Script" || ancestor.name === "ClassDefinition") {
        return false;
      }
    }
    return false;
  }

  if (errors.every((error) => isClosedBareYield(error))) {
    return { mode: "full", unsafeBindings: [] };
  }

  const typeParameterLists = new Set<PythonSyntaxNode>();
  let defaultMasksAreClosed = errors.length % 2 === 0;
  for (const error of errors) {
    let list: PythonSyntaxNode | null = error.parent;
    while (list !== null && list.name !== "TypeParamList") {
      list = list.parent;
    }
    if (list === null) {
      defaultMasksAreClosed = false;
      break;
    }
    typeParameterLists.add(list);
  }
  if (defaultMasksAreClosed) {
    const acceptedErrorKeys = new Set<string>();
    const isAcceptedDefaultPair = (
      equals: PythonSyntaxNode | undefined,
      defaultName: PythonSyntaxNode | undefined
    ): boolean => {
      if (
        equals === undefined ||
        defaultName === undefined ||
        !equals.type.isError ||
        !defaultName.type.isError ||
        nodeText(input, equals) !== "=" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nodeText(input, defaultName))
      ) {
        return false;
      }
      acceptedErrorKeys.add(nodeKey(equals));
      acceptedErrorKeys.add(nodeKey(defaultName));
      return true;
    };
    for (const list of typeParameterLists) {
      const children = directChildren(list).filter((child) => child.name !== "Comment");
      if (children[0]?.name !== "[" || children.at(-1)?.name !== "]") {
        defaultMasksAreClosed = false;
        break;
      }
      let index = 1;
      let sawDefault = false;
      let sawParameter = false;
      while (index < children.length - 1) {
        const parameter = children[index];
        if (parameter?.name !== "TypeParam") {
          defaultMasksAreClosed = false;
          break;
        }
        sawParameter = true;
        index += 1;
        const parameterChildren = directChildren(parameter).filter(
          (child) => child.name !== "Comment"
        );
        const nestedErrors = parameterChildren.filter((child) => child.type.isError);
        let hasDefault = false;
        if (nestedErrors.length > 0) {
          const equals = nestedErrors[0];
          const defaultName = nestedErrors[1];
          hasDefault =
            nestedErrors.length === 2 &&
            parameterChildren.at(-2) !== undefined &&
            nodeKey(parameterChildren.at(-2)!) === nodeKey(equals!) &&
            parameterChildren.at(-1) !== undefined &&
            nodeKey(parameterChildren.at(-1)!) === nodeKey(defaultName!) &&
            isAcceptedDefaultPair(equals, defaultName);
        } else if (children[index]?.type.isError || children[index + 1]?.type.isError) {
          hasDefault = isAcceptedDefaultPair(children[index], children[index + 1]);
          index += 2;
        }
        if ((nestedErrors.length > 0 && !hasDefault) || (sawDefault && !hasDefault)) {
          defaultMasksAreClosed = false;
          break;
        }
        sawDefault ||= hasDefault;
        if (index >= children.length - 1) {
          break;
        }
        if (children[index]?.name !== ",") {
          defaultMasksAreClosed = false;
          break;
        }
        index += 1;
        if (index >= children.length - 1) {
          break;
        }
      }
      if (!defaultMasksAreClosed || !sawParameter || index !== children.length - 1) {
        defaultMasksAreClosed = false;
        break;
      }
    }
    if (
      defaultMasksAreClosed &&
      (acceptedErrorKeys.size !== errors.length ||
        errors.some((error) => !acceptedErrorKeys.has(nodeKey(error))))
    ) {
      defaultMasksAreClosed = false;
    }
    if (defaultMasksAreClosed) {
      return { mode: "full", unsafeBindings: [] };
    }
  }

  const withStatements = new Set<PythonSyntaxNode>();
  const withStatementByError = new Map<string, PythonSyntaxNode>();
  for (const error of errors) {
    for (let ancestor = error.parent; ancestor !== null; ancestor = ancestor.parent) {
      if (ancestor.name === "WithStatement") {
        withStatements.add(ancestor);
        withStatementByError.set(nodeKey(error), ancestor);
        break;
      }
    }
  }
  const acceptedWithErrorKeys = new Set<string>();
  const recoveredWithBindings: { name: string; from: number; to: number }[] = [];
  for (const withStatement of withStatements) {
    const statementErrors = errors.filter(
      (error) => nodeKey(withStatementByError.get(nodeKey(error)) ?? error) === nodeKey(withStatement)
    );
    if (statementErrors.length !== 3) {
      continue;
    }
    const withChildren = directChildren(withStatement);
    const parenthesized = withChildren[1];
    const tuple = withChildren.find((child) => child.name === "TupleExpression");
    const parenthesizedErrors =
      parenthesized === undefined
        ? []
        : directChildren(parenthesized).filter((child) => child.type.isError);
    const tupleErrors =
      tuple === undefined ? [] : directChildren(tuple).filter((child) => child.type.isError);
    const directErrors = withChildren.filter((child) => child.type.isError);
    const aliases = withChildren.flatMap((child, index) => {
      const alias = child.name === "as" ? withChildren[index + 1] : undefined;
      const name = alias?.name === "VariableName" ? declarationName(input, alias) : null;
      return name === null || alias === undefined
        ? []
        : [{ name, from: alias.from, to: alias.to }];
    });
    const headerEnd = withChildren.find((child) => child.name === "Body")?.from;
    if (
      parenthesized?.name === "ParenthesizedExpression" &&
      directChildren(parenthesized)[0]?.name === "(" &&
      parenthesizedErrors.length === 1 &&
      parenthesizedErrors[0]?.from === parenthesizedErrors[0]?.to &&
      directErrors.length === 1 &&
      /^(?:\r\n|\r|\n)$/u.test(nodeText(input, directErrors[0]!)) &&
      tuple !== undefined &&
      directChildren(tuple).at(-1)?.name === ")" &&
      tupleErrors.length === 1 &&
      tupleErrors[0]?.from === tupleErrors[0]?.to &&
      aliases.length >= 2 &&
      headerEnd !== undefined &&
      /^with[\t ]*\([\s\S]*,[\t \r\n]*\):$/u.test(
        input.sourceText.slice(withStatement.from, headerEnd + 1)
      )
    ) {
      for (const error of statementErrors) {
        acceptedWithErrorKeys.add(nodeKey(error));
      }
      recoveredWithBindings.push(...aliases);
    }
  }
  if (
    acceptedWithErrorKeys.size === errors.length &&
    errors.every((error) => acceptedWithErrorKeys.has(nodeKey(error)))
  ) {
    return { mode: "full", unsafeBindings: recoveredWithBindings };
  }

  if (errors.length === 1) {
    const error = errors[0]!;
    const withStatement = withStatementByError.get(nodeKey(error));
    const headerEnd = withStatement === undefined
      ? undefined
      : directChildren(withStatement).find((child) => child.name === "Body")?.from;
    if (
      withStatement !== undefined &&
      headerEnd !== undefined &&
      error.parent?.name === "WithStatement" &&
      /^\.[A-Za-z_][A-Za-z0-9_]*$/u.test(nodeText(input, error)) &&
      /^with[\s\S]*\bas[\t ]+[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+[\t ]*:$/u.test(
        input.sourceText.slice(withStatement.from, headerEnd + 1)
      )
    ) {
      return { mode: "declarations-only", unsafeBindings: [] };
    }
  }

  const firstError = errors[0];
  const tupleTargetWith = firstError === undefined
    ? undefined
    : withStatementByError.get(nodeKey(firstError));
  const tupleTargetHeader = tupleTargetWith === undefined
    ? undefined
    : input.sourceText.slice(tupleTargetWith.from).match(
        /^with[\s\S]+?\bas[\t ]*\([\t \r\n]*[A-Za-z_][A-Za-z0-9_]*(?:[\t \r\n]*,[\t \r\n]*[A-Za-z_][A-Za-z0-9_]*)+[\t \r\n]*,?[\t \r\n]*\)[\t ]*:(?=\r?\n|$)/u
      )?.[0];
  if (
    tupleTargetWith !== undefined &&
    tupleTargetHeader !== undefined &&
    errors.every((error) => error.from === error.to) &&
    tupleTargetHeader.length > 0
  ) {
    return { mode: "declarations-only", unsafeBindings: [] };
  }

  if (errors.length === 2 && errors.every((error) => error.parent?.name === "Script")) {
    const children = directChildren(root);
    const firstErrorIndex = children.findIndex(
      (child) => nodeKey(child) === nodeKey(errors[0]!)
    );
    const nameStatement = firstErrorIndex > 0 ? children[firstErrorIndex - 1] : undefined;
    const equals = children[firstErrorIndex + 1];
    const arrayStatement = children[firstErrorIndex + 2];
    const nameNode = nameStatement?.name === "ExpressionStatement"
      ? directChildren(nameStatement)[0]
      : undefined;
    const arrayNode = arrayStatement?.name === "ExpressionStatement"
      ? directChildren(arrayStatement)[0]
      : undefined;
    if (
      errors[0]?.from === errors[0]?.to &&
      equals !== undefined &&
      nodeKey(equals) === nodeKey(errors[1]!) &&
      nodeText(input, equals) === "=" &&
      nameNode?.name === "VariableName" &&
      declarationName(input, nameNode) !== null &&
      arrayNode?.name === "ArrayExpression" &&
      nodeText(input, arrayNode) === "[]" &&
      /^[A-Za-z_][A-Za-z0-9_]*[\t ]*=[\t ]*\[\]$/u.test(
        input.sourceText.slice(nameStatement!.from, arrayStatement!.to)
      )
    ) {
      return { mode: "declarations-only", unsafeBindings: [] };
    }
  }
  return null;
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

function isClassScopedFunction(node: PythonSyntaxNode): boolean {
  for (let ancestor = node.parent; ancestor !== null; ancestor = ancestor.parent) {
    if (ancestor.name === "ClassDefinition") {
      return true;
    }
    if (ancestor.name === "FunctionDefinition" || ancestor.name === "Script") {
      return false;
    }
  }
  return false;
}

function isTopLevelFunction(node: PythonSyntaxNode): boolean {
  const statement = node.parent?.name === "DecoratedStatement" ? node.parent : node;
  return statement.parent?.name === "Script";
}

function isTopLevelClass(node: PythonSyntaxNode): boolean {
  return isTopLevelFunction(node);
}

function isAsyncPythonFunction(node: PythonSyntaxNode): boolean {
  return node.name === "FunctionDefinition" && directChildren(node)[0]?.name === "async";
}

function isPythonClassInstantiationEligible(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): boolean {
  const argumentList = directChildren(node).find((child) => child.name === "ArgList");
  return (
    argumentList === undefined ||
    !/(?:^|[(,])[\t ]*metaclass[\t ]*=/u.test(nodeText(input, argumentList))
  );
}

function pythonSingleBareClassBase(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): PythonSyntaxNode | null {
  if (node.name !== "ClassDefinition") {
    return null;
  }
  const children = directChildren(node);
  const typeParameterLists = children.filter((child) => child.name === "TypeParamList");
  if (
    typeParameterLists.length > 1 ||
    typeParameterLists.some((child) => hasSyntaxError(child))
  ) {
    return null;
  }
  const argumentLists = children.filter((child) => child.name === "ArgList");
  const argumentList = argumentLists[0];
  if (argumentLists.length !== 1 || argumentList === undefined || hasSyntaxError(argumentList)) {
    return null;
  }
  const arguments_ = directChildren(argumentList);
  const base = arguments_[1];
  if (
    arguments_.length !== 3 ||
    arguments_[0]?.name !== "(" ||
    base?.name !== "VariableName" ||
    arguments_[2]?.name !== ")"
  ) {
    return null;
  }
  const baseName = declarationName(input, base);
  const typeParameterNames = typeParameterLists.flatMap((list) =>
    directChildren(list)
      .filter((child) => child.name === "TypeParam")
      .flatMap((parameter) => {
        const nameNode = directChildren(parameter).find(
          (child) => child.name === "VariableName"
        );
        const name = nameNode === undefined ? null : declarationName(input, nameNode);
        return name === null ? [] : [name];
      })
  );
  return baseName !== null && !typeParameterNames.includes(baseName)
    ? base
    : null;
}

function isImmediateCompleteSubscriptOf(
  parent: PythonSyntaxNode,
  expression: PythonSyntaxNode
): boolean {
  if (parent.name !== "MemberExpression" || hasSyntaxError(parent)) {
    return false;
  }
  const children = directChildren(parent);
  return (
    children.length >= 4 &&
    children[0] !== undefined &&
    nodeKey(children[0]) === nodeKey(expression) &&
    children[1]?.name === "[" &&
    children.at(-1)?.name === "]"
  );
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

function staticDjangoNinjaImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "ninja");
}

function staticFlaskImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "flask");
}

function staticFlaskRestfulImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "flask_restful");
}

function staticDjangoUrlImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly DjangoUrlImport[] {
  return [
    ...staticNamedFrameworkImports(input, node, "django.urls").map((candidate) => ({
      ...candidate,
      source: "django.urls" as const
    })),
    ...staticNamedFrameworkImports(input, node, "django.conf.urls").map((candidate) => ({
      ...candidate,
      source: "django.conf.urls" as const
    }))
  ];
}

function staticStarletteApplicationImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "starlette.applications");
}

function staticStarletteRoutingImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "starlette.routing");
}

function staticAioHttpImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "aiohttp");
}

function staticSanicImports(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly FrameworkNamedImport[] {
  return staticNamedFrameworkImports(input, node, "sanic");
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
    moduleSpecifierKind: "relative",
    importedRouterName: match[2],
    routerName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains one static absolute import candidate: `from package.module import
 * router [as local_router]`. Project resolution later requires an exact local
 * module target and regular package markers, so external and ambiguous imports
 * cannot project a route.
 */
function staticFastApiAbsoluteRouterImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFastApiAbsoluteRouterImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[ \t]+import[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    moduleSpecifier: match[1],
    moduleSpecifierKind: "absolute",
    importedRouterName: match[2],
    routerName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains one static absolute import candidate: `from package.module import
 * router [as local_router]`. Project resolution later requires an exact local
 * module target and regular package markers, so external and ambiguous imports
 * cannot project a route.
 */
function staticDjangoNinjaAbsoluteRouterImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoNinjaAbsoluteRouterImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[ \t]+import[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    moduleSpecifier: match[1],
    moduleSpecifierKind: "absolute",
    importedRouterName: match[2],
    routerName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains only the deliberately narrow import form supported by the project
 * resolver: `from .package.module import router [as local_router]`.
 *
 * A single leading dot keeps the package calculation local and testable. Parent
 * imports, wildcard imports, import lists, and package-only imports remain
 * unsupported until they can be modeled with equally strong evidence.
 */
function staticDjangoNinjaRelativeRouterImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoNinjaRelativeRouterImport | null {
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
    moduleSpecifierKind: "relative",
    importedRouterName: match[2],
    routerName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains only the deliberately narrow import form supported by the project
 * resolver: `from .package.module import blueprint [as local_blueprint]`.
 *
 * The resolver independently verifies the regular-package boundary and the
 * Blueprint declaration in the imported module before it can project a route.
 */
function staticFlaskRelativeBlueprintImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFlaskRelativeBlueprintImport | null {
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
    moduleSpecifierKind: "relative",
    importedBlueprintName: match[2],
    blueprintName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains one static absolute import candidate: `from package.module import
 * blueprint [as local_blueprint]`. Project resolution later requires an exact
 * local module target and regular package markers, so external and ambiguous
 * imports cannot project a route.
 */
function staticFlaskAbsoluteBlueprintImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFlaskAbsoluteBlueprintImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[ \t]+import[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    moduleSpecifier: match[1],
    moduleSpecifierKind: "absolute",
    importedBlueprintName: match[2],
    blueprintName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains only the direct package-relative import form that can pass a Sanic
 * Blueprint to `app.blueprint`: `from .package.module import blueprint [as local_blueprint]`.
 */
function staticSanicRelativeBlueprintImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticSanicRelativeBlueprintImport | null {
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
    importedBlueprintName: match[2],
    blueprintName: match[3] ?? match[2],
    node
  };
}

/**
 * Retains one-dot, single-name relative imports used as a Django URLConf binding.
 * `urls` retains its direct module meaning; any other name projects only after
 * project resolution proves a final `__init__.py` re-export or `urlpatterns`.
 *
 * The resolver later proves the regular-package boundary and every target hop.
 * Other import shapes can bind arbitrary runtime values and remain unsupported.
 */
function staticDjangoRelativeUrlconfImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoRelativeUrlconfImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+(\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[ \t]+import[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  const importedUrlconfName = match[2];
  const importedModule = match[1];
  if (importedUrlconfName === "urls" && importedModule.endsWith(".urls")) {
    return null;
  }
  const moduleSpecifier =
    importedUrlconfName === "urls" ? `${importedModule}.urls` : importedModule;

  return {
    moduleSpecifier,
    importedUrlconfName,
    urlconfName: match[3] ?? importedUrlconfName,
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

function staticDjangoNinjaApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): DjangoNinjaApplication | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  return assignment === null
    ? null
    : { name: assignment.name, constructorName: assignment.constructorName, node: assignment.node };
}

function staticDjangoNinjaRouter(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): DjangoNinjaRouter | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  return assignment === null
    ? null
    : { name: assignment.name, constructorName: assignment.constructorName, node: assignment.node };
}

function staticSanicApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): SanicApplication | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  return assignment === null
    ? null
    : { name: assignment.name, constructorName: assignment.constructorName, node: assignment.node };
}

function staticSanicBlueprint(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): SanicBlueprint | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  if (assignment === null) {
    return null;
  }
  const entries = staticArgumentEntries(assignment.arguments_);
  const blueprintLabel = entries[0];
  const keywordArguments = staticKeywordArgumentsAfterFirst(input, entries);
  if (
    blueprintLabel?.name !== "String" ||
    staticPlainPythonString(input, blueprintLabel) === null ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some((name) => name !== "url_prefix")
  ) {
    return null;
  }
  const prefix = staticSanicPrefix(input, keywordArguments);
  return prefix === null
    ? null
    : {
        name: assignment.name,
        constructorName: assignment.constructorName,
        prefix,
        node: assignment.node
      };
}

function staticSanicBlueprintGroup(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): SanicBlueprintGroup | null {
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
  const member = callChildren[0];
  const argumentList = callChildren[1];
  if (
    name === null ||
    callChildren.length !== 2 ||
    member?.name !== "MemberExpression" ||
    argumentList?.name !== "ArgList"
  ) {
    return null;
  }
  const memberChildren = directChildren(member);
  const constructor = memberChildren[0];
  const method = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    constructor?.name !== "VariableName" ||
    method?.name !== "PropertyName" ||
    nodeText(input, method) !== "group"
  ) {
    return null;
  }
  const constructorName = declarationName(input, constructor);
  if (constructorName === null || !constructorNames.has(constructorName)) {
    return null;
  }

  const entries = staticArgumentEntries(argumentList);
  const memberNames: string[] = [];
  let index = 0;
  while (index < entries.length) {
    const candidate = entries[index];
    const next = entries[index + 1];
    if (candidate?.name !== "VariableName" || next?.name === "AssignOp") {
      break;
    }
    const memberName = declarationName(input, candidate);
    if (memberName === null || memberNames.includes(memberName)) {
      return null;
    }
    memberNames.push(memberName);
    index += 1;
  }
  const keywordArguments = staticKeywordArguments(input, entries.slice(index));
  if (
    memberNames.length === 0 ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some(
      (argumentName) => argumentName !== "url_prefix" && argumentName !== "name_prefix"
    )
  ) {
    return null;
  }
  const prefix = staticSanicPrefix(input, keywordArguments);
  const namePrefixNode = keywordArguments.get("name_prefix");
  const namePrefix =
    namePrefixNode === undefined ? null : staticSanicGroupNamePrefix(input, namePrefixNode);
  return prefix === null || (namePrefixNode !== undefined && namePrefix === null)
    ? null
    : { name, constructorName, memberNames, prefix, namePrefix, node };
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

function staticDjangoNinjaMountPrefix(
  input: PythonExtractFileFactsInput,
  prefixNode: PythonSyntaxNode
): string | null {
  if (prefixNode.name !== "String") {
    return null;
  }
  const prefix = staticPlainPythonString(input, prefixNode);
  if (prefix === null || prefix.startsWith("//")) {
    return null;
  }
  if (prefix === "" || prefix === "/") {
    return "";
  }
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
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

function staticSanicPrefix(
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

function staticSanicGroupNamePrefix(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  if (node.name !== "String") {
    return null;
  }
  const namePrefix = staticPlainPythonString(input, node);
  return namePrefix === null || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(namePrefix)
    ? null
    : namePrefix;
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

function staticFlaskRestfulApi(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FlaskRestfulApi | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  if (assignment === null) {
    return null;
  }
  const entries = staticArgumentEntries(assignment.arguments_);
  const applicationNode = entries[0];
  if (entries.length !== 1 || applicationNode?.name !== "VariableName") {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  return applicationName === null
    ? null
    : {
        name: assignment.name,
        constructorName: assignment.constructorName,
        applicationName,
        node: assignment.node
      };
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

function pythonImportLocalBindingNames(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly string[] {
  if (node.name !== "ImportStatement" || hasSyntaxError(node)) {
    return [];
  }
  const children = directChildren(node);
  const importIndex = children.findIndex((child) => child.name === "import");
  if (importIndex < 0) {
    return [];
  }
  const names: string[] = [];
  if (children[0]?.name === "from") {
    let index = importIndex + 1;
    while (index < children.length) {
      const imported = children[index];
      if (imported?.name !== "VariableName") {
        index += 1;
        continue;
      }
      const alias = children[index + 1]?.name === "as" ? children[index + 2] : undefined;
      const binding = alias?.name === "VariableName" ? alias : imported;
      const name = declarationName(input, binding);
      if (name !== null) {
        names.push(name);
      }
      index += alias === undefined ? 1 : 3;
    }
    return names;
  }

  let index = importIndex + 1;
  while (index < children.length) {
    while (children[index] !== undefined && children[index]?.name !== "VariableName") {
      index += 1;
    }
    const first = children[index];
    if (first?.name !== "VariableName") {
      break;
    }
    let cursor = index + 1;
    while (children[cursor]?.name === "." && children[cursor + 1]?.name === "VariableName") {
      cursor += 2;
    }
    const alias = children[cursor]?.name === "as" ? children[cursor + 1] : undefined;
    const binding = alias?.name === "VariableName" ? alias : first;
    const name = declarationName(input, binding);
    if (name !== null) {
      names.push(name);
    }
    index = alias === undefined ? cursor + 1 : cursor + 2;
  }
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

function directMemberTargetMatches(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  receiverName: string,
  propertyName: string
): boolean {
  if (node.name !== "MemberExpression") {
    return false;
  }
  const children = directChildren(node);
  const receiver = children[0];
  const property = children[2];
  return (
    children.length === 3 &&
    receiver?.name === "VariableName" &&
    property?.name === "PropertyName" &&
    declarationName(input, receiver) === receiverName &&
    nodeText(input, property) === propertyName
  );
}

function targetBindsMember(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  receiverName: string,
  propertyName: string
): boolean {
  if (directMemberTargetMatches(input, node, receiverName, propertyName)) {
    return true;
  }
  if (!["TupleExpression", "ListExpression", "ParenthesizedExpression", "StarExpression"].includes(node.name)) {
    return false;
  }
  return directChildren(node).some((child) =>
    targetBindsMember(input, child, receiverName, propertyName)
  );
}

function assignmentBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  const children = directChildren(node);
  return children.some(
    (child, index) =>
      (children[index + 1]?.name === "AssignOp" && targetBindsName(input, child, name)) ||
      (child.name === "TypeDef" &&
        children[index + 1]?.name === "AssignOp" &&
        index > 0 &&
        children[index - 1] !== undefined &&
        targetBindsName(input, children[index - 1]!, name))
  );
}

function assignmentBindsMember(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  receiverName: string,
  propertyName: string
): boolean {
  const children = directChildren(node);
  const firstAssignIndex = children.findIndex((child) => child.name === "AssignOp");
  return (
    children.some(
      (child, index) =>
        children[index + 1]?.name === "AssignOp" &&
        targetBindsMember(input, child, receiverName, propertyName)
    ) ||
    (firstAssignIndex > 0 &&
      children
        .slice(0, firstAssignIndex)
        .some((child) => targetBindsMember(input, child, receiverName, propertyName)))
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

function pythonNodeDirectlyBindsName(
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
  if (node.name === "TypeDefinition") {
    const alias = directChildren(node).find((child) => child.name === "VariableName");
    return alias !== undefined && declarationName(input, alias) === name;
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
        targetBindsName(input, children[index + 1]!, name)
    );
  }
  if (node.name === "CapturePattern" || node.name === "AsPattern") {
    return directChildren(node).some((child) => targetBindsName(input, child, name));
  }
  return false;
}

function pythonArtifactCallTaint(
  input: PythonExtractFileFactsInput,
  root: PythonSyntaxNode
): {
  readonly dynamicGlobalHazard: boolean;
  readonly globalTaintedNames: ReadonlySet<string>;
} {
  let dynamicGlobalHazard = false;
  const globalTaintedNames = new Set<string>();

  function scanDynamicCalls(node: PythonSyntaxNode): void {
    if (node.name === "CallExpression") {
      const callee = directChildren(node)[0];
      const name = callee?.name === "VariableName" ? declarationName(input, callee) : null;
      if (name === "globals" || name === "exec") {
        dynamicGlobalHazard = true;
      }
    }
    for (const child of directChildren(node)) {
      scanDynamicCalls(child);
    }
  }

  function analyzeFunction(definition: PythonSyntaxNode): void {
    const body = directChildren(definition).find((child) => child.name === "Body");
    if (body === undefined) {
      return;
    }
    const globalDeclarationEnds = new Map<string, number>();
    function collectGlobalDeclarations(node: PythonSyntaxNode): void {
      if (
        node !== body &&
        ["FunctionDefinition", "ClassDefinition", "LambdaExpression"].includes(node.name)
      ) {
        return;
      }
      if (node.name === "ScopeStatement" && directChildren(node)[0]?.name === "global") {
        for (const name of directVariableNames(input, node)) {
          const current = globalDeclarationEnds.get(name);
          globalDeclarationEnds.set(name, current === undefined ? node.to : Math.min(current, node.to));
        }
      }
      for (const child of directChildren(node)) {
        collectGlobalDeclarations(child);
      }
    }
    collectGlobalDeclarations(body);
    if (globalDeclarationEnds.size === 0) {
      return;
    }

    function collectMutations(node: PythonSyntaxNode): void {
      if (
        node !== body &&
        ["FunctionDefinition", "ClassDefinition", "LambdaExpression"].includes(node.name)
      ) {
        for (const [name, declarationEnd] of globalDeclarationEnds) {
          if (node.from >= declarationEnd && pythonNodeDirectlyBindsName(input, node, name)) {
            globalTaintedNames.add(name);
          }
        }
        return;
      }
      for (const [name, declarationEnd] of globalDeclarationEnds) {
        if (node.from >= declarationEnd && pythonNodeDirectlyBindsName(input, node, name)) {
          globalTaintedNames.add(name);
        }
      }
      for (const child of directChildren(node)) {
        collectMutations(child);
      }
    }
    collectMutations(body);
  }

  function visitDefinitions(node: PythonSyntaxNode): void {
    if (node.name === "FunctionDefinition") {
      analyzeFunction(node);
    }
    for (const child of directChildren(node)) {
      visitDefinitions(child);
    }
  }

  scanDynamicCalls(root);
  visitDefinitions(root);
  return { dynamicGlobalHazard, globalTaintedNames };
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

function topLevelNodeBindsMember(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  receiverName: string,
  propertyName: string
): boolean {
  if (node.name === "AssignStatement" || node.name === "NamedExpression") {
    return assignmentBindsMember(input, node, receiverName, propertyName);
  }
  if (node.name === "UpdateStatement" || node.name === "DeleteStatement") {
    return directChildren(node).some((child) =>
      targetBindsMember(input, child, receiverName, propertyName)
    );
  }
  return false;
}

function hasTopLevelMemberRebinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  receiverName: string,
  propertyName: string,
  after: number,
  before: number
): boolean {
  return topLevelNodes.some(
    (candidate) =>
      candidate.from >= after &&
      candidate.to <= before &&
      topLevelNodeBindsMember(input, candidate, receiverName, propertyName)
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

function isStaticPythonModuleSpecifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(value);
}

function staticDjangoRoutePath(value: string): string | null {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.split("/").includes("..")
  ) {
    return null;
  }
  return "/" + value;
}

/** Retains one unescaped, single-line raw string literal used by Django regex URL factories. */
function staticDjangoRawPythonString(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const value = nodeText(input, node);
  const prefix = value[0];
  const quote = value[1];
  if (
    value.length < 3 ||
    (prefix !== "r" && prefix !== "R") ||
    (quote !== "\"" && quote !== "'") ||
    value.at(-1) !== quote ||
    value.startsWith(`${prefix}${quote}${quote}${quote}`)
  ) {
    return null;
  }
  const inner = value.slice(2, -1);
  return inner.includes(quote) || /[\r\n]/u.test(inner) ? null : inner;
}

function staticDjangoRePathPattern(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const value = nodeText(input, node);
  return value.startsWith("r") || value.startsWith("R")
    ? staticDjangoRawPythonString(input, node)
    : staticPlainPythonString(input, node);
}

const DJANGO_RE_PATH_META_CHARACTERS = new Set([
  "\\",
  ".",
  "^",
  "$",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "*",
  "+",
  "?",
  "|"
]);

/**
 * Projects only a full-match literal `re_path` or legacy `url` pattern to one exact route.
 * Prefix and regex-semantic patterns intentionally remain outside exact evidence.
 */
function staticDjangoRePathRoutePath(value: string): string | null {
  if (!value.startsWith("^") || !value.endsWith("$")) {
    return null;
  }
  const pattern = value.slice(1, -1);
  for (const character of pattern) {
    if (DJANGO_RE_PATH_META_CHARACTERS.has(character)) {
      return null;
    }
  }
  return staticDjangoRoutePath(pattern);
}

/**
 * Projects only a start-anchored, slash-terminated literal `re_path` or legacy `url` prefix
 * used to mount a child URLConf. The terminal `$` form is deliberately not a
 * prefix mount, and a non-slash ending would not preserve child concatenation.
 */
function staticDjangoRePathInclusionPrefix(value: string): string | null {
  if (!value.startsWith("^") || value.endsWith("$")) {
    return null;
  }
  const pattern = value.slice(1);
  if ((pattern.length > 0 && !pattern.endsWith("/")) || [...pattern].some((character) => DJANGO_RE_PATH_META_CHARACTERS.has(character))) {
    return null;
  }
  const path = staticDjangoRoutePath(pattern);
  return path === null || path.includes("//") ? null : path;
}

function staticDjangoUrlPatternPath(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  factory: DjangoUrlPatternFactory
): string | null {
  const rawPath =
    factory === "path"
      ? staticPlainPythonString(input, node)
      : staticDjangoRePathPattern(input, node);
  if (rawPath === null) {
    return null;
  }
  return factory === "path"
    ? staticDjangoRoutePath(rawPath)
    : staticDjangoRePathRoutePath(rawPath);
}

function staticDjangoUrlconfInclusionPath(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  factory: DjangoUrlPatternFactory
): string | null {
  const rawPath =
    factory === "path"
      ? staticPlainPythonString(input, node)
      : staticDjangoRePathPattern(input, node);
  if (rawPath === null) {
    return null;
  }
  return factory === "path"
    ? staticDjangoRoutePath(rawPath)
    : staticDjangoRePathInclusionPrefix(rawPath);
}

function djangoDirectUrlPatternRuleId(
  factory: DjangoUrlPatternFactory,
  handlerKind: DjangoUrlPatternHandlerKind
): string {
  const factorySegment = factory === "re_path" ? "re-path" : factory;
  const handlerSegment = handlerKind === "class-as-view" ? "local-class-as-view" : "local-function";
  return `framework.django.direct-urlpatterns.${factorySegment}.${handlerSegment}`;
}

function staticStarletteRoutePath(value: string): string | null {
  if (
    value === "" ||
    !value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.split("/").includes("..")
  ) {
    return null;
  }
  return value;
}

function staticStarletteRouteMethods(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly RouteMethod[] | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const entries = directChildren(node).filter((child) => !["[", "]", ","].includes(child.name));
  if (entries.length === 0) {
    return null;
  }
  const methods: RouteMethod[] = [];
  for (const entry of entries) {
    if (entry.name !== "String") {
      return null;
    }
    const method = staticPlainPythonString(input, entry);
    if (method === null || !STARLETTE_ROUTE_METHODS.has(method as RouteMethod)) {
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

function staticStarletteRoute(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactoryNames: ReadonlySet<string>
): StaticStarletteRoute | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(node);
  const factoryNode = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    callChildren.length !== 2 ||
    factoryNode?.name !== "VariableName" ||
    arguments_?.name !== "ArgList"
  ) {
    return null;
  }
  const factoryName = declarationName(input, factoryNode);
  if (factoryName === null || !routeFactoryNames.has(factoryName)) {
    return null;
  }

  const entries = staticArgumentEntries(arguments_);
  const pathNode = entries[0];
  const positionalEndpoint =
    entries[1]?.name === "VariableName" && entries[2]?.name !== "AssignOp";
  const keywordArguments = positionalEndpoint
    ? staticKeywordArgumentsAfterPositions(input, entries, 2)
    : staticKeywordArgumentsAfterFirst(input, entries);
  const handlerNode = positionalEndpoint ? entries[1] : keywordArguments?.get("endpoint");
  if (
    pathNode?.name !== "String" ||
    handlerNode?.name !== "VariableName" ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some((name) => !["endpoint", "methods", "name"].includes(name)) ||
    (positionalEndpoint && keywordArguments.has("endpoint"))
  ) {
    return null;
  }
  const nameNode = keywordArguments.get("name");
  if (nameNode !== undefined && (nameNode.name !== "String" || staticPlainPythonString(input, nameNode) === null)) {
    return null;
  }
  const rawPath = staticPlainPythonString(input, pathNode);
  const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
  const handlerName = declarationName(input, handlerNode);
  const methodsNode = keywordArguments.get("methods");
  const methods =
    methodsNode === undefined ? ["GET" as const] : staticStarletteRouteMethods(input, methodsNode);
  return path === null || handlerName === null || methods === null
    ? null
    : { factoryName, methods, path, handlerName, node };
}

function staticStarletteRouteEntries(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactoryNames: ReadonlySet<string>
): readonly StaticStarletteRoute[] | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const entries = directChildren(node).filter((child) => !["[", "]", ","].includes(child.name));
  const routes: StaticStarletteRoute[] = [];
  for (const entry of entries) {
    const route = staticStarletteRoute(input, entry, routeFactoryNames);
    if (route === null) {
      return null;
    }
    routes.push(route);
  }
  return routes;
}

function staticStarletteRouteList(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactoryNames: ReadonlySet<string>
): StaticStarletteRouteList | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "VariableName" ||
    operator?.name !== "AssignOp" ||
    value?.name !== "ArrayExpression"
  ) {
    return null;
  }
  const name = declarationName(input, target);
  const routes = staticStarletteRouteEntries(input, value, routeFactoryNames);
  return name === null || routes === null ? null : { name, routes, node };
}

function staticStarletteApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>,
  routeFactoryNames: ReadonlySet<string>
): StarletteApplication | null {
  const assignment = staticFrameworkConstructorAssignment(input, node, constructorNames);
  if (assignment === null) {
    return null;
  }
  const keywordArguments = staticKeywordArguments(input, staticArgumentEntries(assignment.arguments_));
  const routesNode = keywordArguments?.get("routes");
  if (keywordArguments === null || routesNode === undefined) {
    return null;
  }
  if (routesNode.name === "VariableName") {
    const routeListName = declarationName(input, routesNode);
    return routeListName === null
      ? null
      : {
          name: assignment.name,
          constructorName: assignment.constructorName,
          routeListName,
          inlineRoutes: null,
          node: assignment.node
        };
  }
  const inlineRoutes = staticStarletteRouteEntries(input, routesNode, routeFactoryNames);
  return inlineRoutes === null
    ? null
    : {
        name: assignment.name,
        constructorName: assignment.constructorName,
        routeListName: null,
        inlineRoutes,
        node: assignment.node
      };
}

function staticAioHttpApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  webModuleNames: ReadonlySet<string>
): AioHttpApplication | null {
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
  const applicationName = declarationName(input, target);
  const callChildren = directChildren(call);
  const constructor = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    applicationName === null ||
    callChildren.length !== 2 ||
    constructor?.name !== "MemberExpression" ||
    arguments_?.name !== "ArgList"
  ) {
    return null;
  }
  const constructorChildren = directChildren(constructor);
  const webModule = constructorChildren[0];
  const constructorName = constructorChildren[2];
  if (
    constructorChildren.length !== 3 ||
    webModule?.name !== "VariableName" ||
    constructorName?.name !== "PropertyName" ||
    nodeText(input, constructorName) !== "Application"
  ) {
    return null;
  }
  const webModuleName = declarationName(input, webModule);
  return webModuleName === null || !webModuleNames.has(webModuleName)
    ? null
    : { name: applicationName, webModuleName, node };
}

function staticPythonBoolean(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): boolean | null {
  const value = nodeText(input, node);
  return value === "True" ? true : value === "False" ? false : null;
}

function staticAioHttpRouteRegistration(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticAioHttpRouteRegistration | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression?.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(expression);
  const member = callChildren[0];
  const arguments_ = callChildren[1];
  if (callChildren.length !== 2 || member?.name !== "MemberExpression" || arguments_?.name !== "ArgList") {
    return null;
  }
  const memberChildren = directChildren(member);
  const routerMember = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    routerMember?.name !== "MemberExpression" ||
    methodNode?.name !== "PropertyName"
  ) {
    return null;
  }
  const routerChildren = directChildren(routerMember);
  const applicationNode = routerChildren[0];
  const routerNameNode = routerChildren[2];
  if (
    routerChildren.length !== 3 ||
    applicationNode?.name !== "VariableName" ||
    routerNameNode?.name !== "PropertyName" ||
    nodeText(input, routerNameNode) !== "router"
  ) {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  const methodName = nodeText(input, methodNode);
  const entries = staticArgumentEntries(arguments_);
  if (applicationName === null) {
    return null;
  }

  if (methodName === "add_route") {
    const methodValueNode = entries[0];
    const pathNode = entries[1];
    const handlerNode = entries[2];
    const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 3);
    if (
      methodValueNode?.name !== "String" ||
      pathNode?.name !== "String" ||
      handlerNode?.name !== "VariableName" ||
      keywordArguments === null ||
      [...keywordArguments.keys()].some((name) => name !== "name")
    ) {
      return null;
    }
    const routeNameNode = keywordArguments.get("name");
    if (
      routeNameNode !== undefined &&
      (routeNameNode.name !== "String" || staticPlainPythonString(input, routeNameNode) === null)
    ) {
      return null;
    }
    const rawMethod = staticPlainPythonString(input, methodValueNode);
    const rawPath = staticPlainPythonString(input, pathNode);
    const method =
      rawMethod !== null && rawMethod === rawMethod.toUpperCase() && AIOHTTP_ROUTE_METHODS.has(rawMethod as RouteMethod)
        ? (rawMethod as RouteMethod)
        : null;
    const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
    const handlerName = declarationName(input, handlerNode);
    return method === null || path === null || handlerName === null
      ? null
      : { applicationName, methods: [method], path, handlerName, node };
  }

  const shortcutMethods = AIOHTTP_ROUTER_SHORTCUT_METHODS[methodName];
  const pathNode = entries[0];
  const handlerNode = entries[1];
  const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 2);
  if (
    shortcutMethods === undefined ||
    pathNode?.name !== "String" ||
    handlerNode?.name !== "VariableName" ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some(
      (name) => name !== "name" && !(methodName === "add_get" && name === "allow_head")
    )
  ) {
    return null;
  }
  const routeNameNode = keywordArguments.get("name");
  if (
    routeNameNode !== undefined &&
    (routeNameNode.name !== "String" || staticPlainPythonString(input, routeNameNode) === null)
  ) {
    return null;
  }
  const allowHeadNode = keywordArguments.get("allow_head");
  const allowHead =
    allowHeadNode === undefined ? true : staticPythonBoolean(input, allowHeadNode);
  if (allowHead === null) {
    return null;
  }
  const rawPath = staticPlainPythonString(input, pathNode);
  const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
  const handlerName = declarationName(input, handlerNode);
  const methods =
    methodName === "add_get" && allowHead === false ? ["GET" as const] : shortcutMethods;
  return path === null || handlerName === null
    ? null
    : { applicationName, methods, path, handlerName, node };
}

function staticAioHttpRouteDefinition(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticAioHttpRouteDefinition | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(node);
  const member = callChildren[0];
  const arguments_ = callChildren[1];
  if (callChildren.length !== 2 || member?.name !== "MemberExpression" || arguments_?.name !== "ArgList") {
    return null;
  }
  const memberChildren = directChildren(member);
  const webModule = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    webModule?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName"
  ) {
    return null;
  }
  const webModuleName = declarationName(input, webModule);
  const methodName = nodeText(input, methodNode);
  const entries = staticArgumentEntries(arguments_);
  if (webModuleName === null) {
    return null;
  }

  if (methodName === "route") {
    const methodValueNode = entries[0];
    const pathNode = entries[1];
    const handlerNode = entries[2];
    const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 3);
    if (
      methodValueNode?.name !== "String" ||
      pathNode?.name !== "String" ||
      handlerNode?.name !== "VariableName" ||
      keywordArguments === null ||
      [...keywordArguments.keys()].some((name) => name !== "name")
    ) {
      return null;
    }
    const routeNameNode = keywordArguments.get("name");
    if (
      routeNameNode !== undefined &&
      (routeNameNode.name !== "String" || staticPlainPythonString(input, routeNameNode) === null)
    ) {
      return null;
    }
    const rawMethod = staticPlainPythonString(input, methodValueNode);
    const rawPath = staticPlainPythonString(input, pathNode);
    const method =
      rawMethod !== null && rawMethod === rawMethod.toUpperCase() && AIOHTTP_ROUTE_METHODS.has(rawMethod as RouteMethod)
        ? (rawMethod as RouteMethod)
        : null;
    const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
    const handlerName = declarationName(input, handlerNode);
    return method === null || path === null || handlerName === null
      ? null
      : { webModuleName, methods: [method], path, handlerName, node };
  }

  const shortcutMethods = AIOHTTP_ROUTE_TABLE_SHORTCUT_METHODS[methodName];
  const pathNode = entries[0];
  const handlerNode = entries[1];
  const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 2);
  if (
    shortcutMethods === undefined ||
    pathNode?.name !== "String" ||
    handlerNode?.name !== "VariableName" ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some(
      (name) => name !== "name" && !(methodName === "get" && name === "allow_head")
    )
  ) {
    return null;
  }
  const routeNameNode = keywordArguments.get("name");
  if (
    routeNameNode !== undefined &&
    (routeNameNode.name !== "String" || staticPlainPythonString(input, routeNameNode) === null)
  ) {
    return null;
  }
  const allowHeadNode = keywordArguments.get("allow_head");
  const allowHead =
    allowHeadNode === undefined ? true : staticPythonBoolean(input, allowHeadNode);
  if (allowHead === null) {
    return null;
  }
  const rawPath = staticPlainPythonString(input, pathNode);
  const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
  const handlerName = declarationName(input, handlerNode);
  const methods = methodName === "get" && allowHead === false ? ["GET" as const] : shortcutMethods;
  return path === null || handlerName === null
    ? null
    : { webModuleName, methods, path, handlerName, node };
}

function staticAioHttpRouteEntries(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly StaticAioHttpRouteDefinition[] | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const entries = directChildren(node).filter((child) => !["[", "]", ","].includes(child.name));
  const routes: StaticAioHttpRouteDefinition[] = [];
  for (const entry of entries) {
    const route = staticAioHttpRouteDefinition(input, entry);
    if (route === null) {
      return null;
    }
    routes.push(route);
  }
  return routes;
}

function staticAioHttpRouteList(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticAioHttpRouteList | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "VariableName" ||
    operator?.name !== "AssignOp" ||
    value?.name !== "ArrayExpression"
  ) {
    return null;
  }
  const name = declarationName(input, target);
  const routes = staticAioHttpRouteEntries(input, value);
  return name === null || routes === null ? null : { name, routes, node };
}

function staticAioHttpRouteTableRegistration(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticAioHttpRouteTableRegistration | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const expression = directChildren(node)[0];
  if (expression?.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(expression);
  const member = callChildren[0];
  const arguments_ = callChildren[1];
  if (callChildren.length !== 2 || member?.name !== "MemberExpression" || arguments_?.name !== "ArgList") {
    return null;
  }
  const memberChildren = directChildren(member);
  const routerMember = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    routerMember?.name !== "MemberExpression" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "add_routes"
  ) {
    return null;
  }
  const routerChildren = directChildren(routerMember);
  const applicationNode = routerChildren[0];
  const routerNameNode = routerChildren[2];
  if (
    routerChildren.length !== 3 ||
    applicationNode?.name !== "VariableName" ||
    routerNameNode?.name !== "PropertyName" ||
    nodeText(input, routerNameNode) !== "router"
  ) {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  const entries = staticArgumentEntries(arguments_);
  const routeListNode = entries[0];
  if (applicationName === null || entries.length !== 1 || routeListNode === undefined) {
    return null;
  }
  if (routeListNode.name === "VariableName") {
    const routeListName = declarationName(input, routeListNode);
    return routeListName === null
      ? null
      : { applicationName, routeListName, inlineRoutes: null, node };
  }
  const inlineRoutes = staticAioHttpRouteEntries(input, routeListNode);
  return inlineRoutes === null
    ? null
    : { applicationName, routeListName: null, inlineRoutes, node };
}

/** Accepts only the direct, argument-free `LocalClass.as_view()` handler shape. */
function staticDjangoClassAsViewHandler(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  if (node.name !== "CallExpression") {
    return null;
  }
  const callChildren = directChildren(node);
  const member = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    callChildren.length !== 2 ||
    member?.name !== "MemberExpression" ||
    arguments_?.name !== "ArgList" ||
    staticArgumentEntries(arguments_).length !== 0
  ) {
    return null;
  }
  const memberChildren = directChildren(member);
  const classNode = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    classNode?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "as_view"
  ) {
    return null;
  }
  return declarationName(input, classNode);
}

function staticDjangoUrlPatternHandler(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoUrlPatternHandler | null {
  if (node.name === "VariableName") {
    const name = declarationName(input, node);
    return name === null ? null : { name, kind: "function" };
  }
  const name = staticDjangoClassAsViewHandler(input, node);
  return name === null ? null : { name, kind: "class-as-view" };
}

function staticDjangoUrlPatternRoutes(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactories: ReadonlyMap<string, readonly DjangoUrlPatternFactory[]>
): readonly StaticDjangoUrlPatternRoute[] {
  if (node.name !== "CallExpression") {
    return [];
  }
  const callChildren = directChildren(node);
  const factoryNode = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    callChildren.length !== 2 ||
    factoryNode?.name !== "VariableName" ||
    arguments_?.name !== "ArgList"
  ) {
    return [];
  }
  const factoryName = declarationName(input, factoryNode);
  const factories = factoryName === null ? undefined : routeFactories.get(factoryName);
  if (factoryName === null || factories === undefined) {
    return [];
  }
  const entries = staticArgumentEntries(arguments_);
  const pathNode = entries[0];
  const handlerNode = entries[1];
  const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 2);
  if (
    pathNode?.name !== "String" ||
    handlerNode === undefined ||
    keywordArguments === null ||
    [...keywordArguments.keys()].some((name) => name !== "name")
  ) {
    return [];
  }
  const routeNameNode = keywordArguments.get("name");
  if (routeNameNode !== undefined && (routeNameNode.name !== "String" || staticPlainPythonString(input, routeNameNode) === null)) {
    return [];
  }
  const handler = staticDjangoUrlPatternHandler(input, handlerNode);
  if (handler === null) {
    return [];
  }
  const routes: StaticDjangoUrlPatternRoute[] = [];
  for (const factory of factories) {
    const path = staticDjangoUrlPatternPath(input, pathNode, factory);
    if (path !== null) {
      routes.push({
        factoryName,
        factory,
        path,
        handlerName: handler.name,
        handlerKind: handler.kind,
        node
      });
    }
  }
  return routes;
}

function staticDjangoUrlconfInclusions(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactories: ReadonlyMap<string, readonly DjangoUrlPatternFactory[]>
): readonly (StaticDjangoImportedUrlconfInclusion | StaticDjangoLiteralUrlconfInclusion)[] {
  if (node.name !== "CallExpression") {
    return [];
  }
  const callChildren = directChildren(node);
  const factoryNode = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    callChildren.length !== 2 ||
    factoryNode?.name !== "VariableName" ||
    arguments_?.name !== "ArgList"
  ) {
    return [];
  }
  const factoryName = declarationName(input, factoryNode);
  const factories = factoryName === null ? undefined : routeFactories.get(factoryName);
  if (factoryName === null || factories === undefined) {
    return [];
  }
  const entries = staticArgumentEntries(arguments_);
  const pathNode = entries[0];
  const includeNode = entries[1];
  if (
    pathNode?.name !== "String" ||
    includeNode?.name !== "CallExpression" ||
    staticKeywordArgumentsAfterPositions(input, entries, 2)?.size !== 0
  ) {
    return [];
  }

  const includeChildren = directChildren(includeNode);
  const includeFactoryNode = includeChildren[0];
  const includeArguments = includeChildren[1];
  if (
    includeChildren.length !== 2 ||
    includeFactoryNode?.name !== "VariableName" ||
    includeArguments?.name !== "ArgList"
  ) {
    return [];
  }
  const includeFactoryName = declarationName(input, includeFactoryNode);
  const includeEntries = staticArgumentEntries(includeArguments);
  const urlconfNode = includeEntries[0];
  if (
    includeFactoryName === null ||
    staticKeywordArgumentsAfterPositions(input, includeEntries, 1)?.size !== 0
  ) {
    return [];
  }
  const pathsByFactory = factories.flatMap((factory) => {
    const path = staticDjangoUrlconfInclusionPath(input, pathNode, factory);
    return path === null ? [] : [{ factory, path }];
  });
  if (urlconfNode?.name === "VariableName") {
    const urlconfName = declarationName(input, urlconfNode);
    return urlconfName === null
      ? []
      : pathsByFactory.map(({ factory, path }) => ({
          kind: "imported" as const,
          factoryName,
          factory,
          includeFactoryName,
          path,
          urlconfName,
          node
        }));
  }
  if (urlconfNode?.name !== "String") {
    return [];
  }
  const moduleSpecifier = staticPlainPythonString(input, urlconfNode);
  return moduleSpecifier === null || !isStaticPythonModuleSpecifier(moduleSpecifier)
    ? []
    : pathsByFactory.map(({ factory, path }) => ({
        kind: "literal" as const,
        factoryName,
        factory,
        includeFactoryName,
        path,
        moduleSpecifier,
        node
      }));
}

function staticDjangoUrlPatternList(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  routeFactories: ReadonlyMap<string, readonly DjangoUrlPatternFactory[]>
): StaticDjangoUrlPatternList | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "VariableName" ||
    operator?.name !== "AssignOp" ||
    value?.name !== "ArrayExpression" ||
    declarationName(input, target) !== "urlpatterns"
  ) {
    return null;
  }
  const routes = directChildren(value).flatMap((candidate) =>
    staticDjangoUrlPatternRoutes(input, candidate, routeFactories)
  );
  const urlconfInclusions = directChildren(value).flatMap((candidate) =>
    staticDjangoUrlconfInclusions(input, candidate, routeFactories)
  );
  const importedUrlconfInclusions = urlconfInclusions.filter(
    (candidate): candidate is StaticDjangoImportedUrlconfInclusion => candidate.kind === "imported"
  );
  const literalUrlconfInclusions = urlconfInclusions.filter(
    (candidate): candidate is StaticDjangoLiteralUrlconfInclusion => candidate.kind === "literal"
  );
  return { node, routes, importedUrlconfInclusions, literalUrlconfInclusions };
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

function staticDjangoNinjaDecorator(
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
  const method = DJANGO_NINJA_DECORATOR_METHODS[methodName];
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

function staticDjangoNinjaApiOperationMethods(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly RouteMethod[] | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const methods: RouteMethod[] = [];
  for (const entry of directChildren(node)) {
    if (["[", "]", ","].includes(entry.name)) {
      continue;
    }
    if (entry.name !== "String") {
      return null;
    }
    const method = staticPlainPythonString(input, entry);
    if (
      method === null ||
      !DJANGO_NINJA_API_OPERATION_METHODS.has(method as RouteMethod) ||
      methods.includes(method as RouteMethod)
    ) {
      return null;
    }
    methods.push(method as RouteMethod);
  }
  return methods.length === 0 ? null : methods;
}

function staticDjangoNinjaApiOperationDecorator(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoNinjaApiOperationDecorator | null {
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
  const entries = argumentList === undefined ? [] : staticArgumentEntries(argumentList);
  const methodsNode = entries[0];
  const pathNode = entries[1];
  const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 2);
  if (
    receiver === null ||
    methodName !== "api_operation" ||
    methodsNode === undefined ||
    pathNode?.name !== "String" ||
    keywordArguments === null
  ) {
    return null;
  }
  const methods = staticDjangoNinjaApiOperationMethods(input, methodsNode);
  const path = staticPlainPythonString(input, pathNode);
  return methods === null || path === null || !path.startsWith("/")
    ? null
    : { receiver, methods, path, node };
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

function staticDjangoNinjaRouterInclusion(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticDjangoNinjaRouterInclusion | null {
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
    nodeText(input, methodNode) !== "add_router"
  ) {
    return null;
  }
  const applicationName = declarationName(input, applicationNode);
  const entries = staticArgumentEntries(argumentList);
  const prefixNode = entries[0];
  const routerNode = entries[1];
  const keywordArguments = staticKeywordArgumentsAfterPositions(input, entries, 2);
  if (
    applicationName === null ||
    routerNode?.name !== "VariableName" ||
    keywordArguments === null
  ) {
    return null;
  }
  const routerName = declarationName(input, routerNode);
  const prefix = prefixNode === undefined ? null : staticDjangoNinjaMountPrefix(input, prefixNode);
  return routerName === null || prefix === null ? null : { applicationName, routerName, prefix, node };
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

function staticSanicRouteMethods(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly RouteMethod[] | null {
  if (node.name !== "ArrayExpression") {
    return null;
  }
  const entries = directChildren(node).filter(
    (child) => !["[", "]", ","].includes(child.name)
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
    if (
      method === null ||
      method !== method.toUpperCase() ||
      !SANIC_ROUTE_METHODS.has(method as RouteMethod)
    ) {
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

function staticSanicDecorator(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticSanicDecorator | null {
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
  const rawPath = staticPlainPythonString(input, pathNode);
  const path = rawPath === null ? null : staticStarletteRoutePath(rawPath);
  const nameNode = keywordArguments.get("name");
  if (
    path === null ||
    (nameNode !== undefined &&
      (nameNode.name !== "String" || staticPlainPythonString(input, nameNode) === null))
  ) {
    return null;
  }

  if (methodName === "route") {
    if (
      [...keywordArguments.keys()].some(
        (name) => name !== "methods" && name !== "name"
      )
    ) {
      return null;
    }
    const methodsNode = keywordArguments.get("methods");
    const methods =
      methodsNode === undefined ? ["GET" as const] : staticSanicRouteMethods(input, methodsNode);
    return methods === null ? null : { receiver, methods, path, node };
  }

  const method = SANIC_SHORTCUT_DECORATOR_METHODS[methodName];
  if (
    method === undefined ||
    [...keywordArguments.keys()].some((name) => name !== "name")
  ) {
    return null;
  }
  return { receiver, methods: [method], path, node };
}

function staticSanicBlueprintRegistration(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticSanicBlueprintRegistration | null {
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
  if (
    callChildren.length !== 2 ||
    member?.name !== "MemberExpression" ||
    argumentList?.name !== "ArgList"
  ) {
    return null;
  }
  const memberChildren = directChildren(member);
  const applicationNode = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    applicationNode?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "blueprint"
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
    keywordArguments === null ||
    [...keywordArguments.keys()].some((name) => name !== "url_prefix")
  ) {
    return null;
  }
  const blueprintName = declarationName(input, blueprintNode);
  const prefix = staticSanicPrefix(input, keywordArguments);
  return blueprintName === null || prefix === null
    ? null
    : { applicationName, blueprintName, prefix, node };
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

function staticFlaskRestfulResourceRegistration(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFlaskRestfulResourceRegistration | null {
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
  const apiNode = memberChildren[0];
  const methodNode = memberChildren[2];
  if (
    memberChildren.length !== 3 ||
    apiNode?.name !== "VariableName" ||
    methodNode?.name !== "PropertyName" ||
    nodeText(input, methodNode) !== "add_resource"
  ) {
    return null;
  }
  const apiName = declarationName(input, apiNode);
  const entries = staticArgumentEntries(argumentList);
  const resourceNode = entries[0];
  if (apiName === null || resourceNode?.name !== "VariableName" || entries.length < 2) {
    return null;
  }
  const resourceClassName = declarationName(input, resourceNode);
  const paths = entries.slice(1).map((entry) => {
    const rawPath = entry.name === "String" ? staticPlainPythonString(input, entry) : null;
    return rawPath === null ? null : staticStarletteRoutePath(rawPath);
  });
  if (
    resourceClassName === null ||
    paths.some((path) => path === null) ||
    new Set(paths).size !== paths.length
  ) {
    return null;
  }
  return { apiName, resourceClassName, paths: paths as readonly string[], node };
}

function staticFlaskRestfulResourceClass(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  symbol: SymbolNode
): FlaskRestfulResourceClass | null {
  if (node.name !== "ClassDefinition" || !isTopLevelClass(node)) {
    return null;
  }
  const name = declarationName(input, node);
  const bases = directChildren(node).find((child) => child.name === "ArgList");
  if (name === null || bases === undefined) {
    return null;
  }
  const entries = staticArgumentEntries(bases);
  const resourceBaseNode = entries[0];
  if (entries.length !== 1 || resourceBaseNode?.name !== "VariableName") {
    return null;
  }
  const resourceBaseName = declarationName(input, resourceBaseNode);
  return resourceBaseName === null ? null : { name, resourceBaseName, node, symbol };
}

function directFlaskRestfulResourceMethods(
  input: PythonExtractFileFactsInput,
  resource: FlaskRestfulResourceClass,
  symbolsByNodeKey: ReadonlyMap<string, SymbolNode>
): readonly FlaskRestfulResourceMethod[] {
  const body = directChildren(resource.node).find((child) => child.name === "Body");
  if (body === undefined) {
    return [];
  }
  const candidates = directChildren(body).flatMap((member) => {
    if (member.name !== "FunctionDefinition" || !isDirectClassMethod(member)) {
      return [];
    }
    const name = declarationName(input, member);
    const method = name === null ? undefined : FLASK_RESTFUL_RESOURCE_METHODS[name];
    const handler = symbolsByNodeKey.get(nodeKey(member));
    return method === undefined || handler?.kind !== "method" ? [] : [{ method, handler }];
  });
  return candidates.filter(
    (candidate) => candidates.filter((other) => other.method === candidate.method).length === 1
  );
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

function latestProvenFrameworkNamedImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  importedName: string,
  alias: string,
  before: number
): FrameworkNamedImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.importedName === importedName &&
        candidate.alias === alias &&
        candidate.node.to <= before &&
        hasUnambiguousFrameworkImportAlias(imports, candidate) &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.alias, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates[0] ?? null;
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

function latestProvenSanicBlueprintGroup(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  groups: readonly SanicBlueprintGroup[],
  groupName: string,
  before: number
): SanicBlueprintGroup | null {
  const candidates = groups
    .filter(
      (group) =>
        group.name === groupName &&
        group.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, group.name, group.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);

  for (const group of candidates) {
    const imported = imports
      .filter(
        (candidate) =>
          candidate.importedName === "Blueprint" &&
          candidate.alias === group.constructorName &&
          hasUnambiguousFrameworkImportAlias(imports, candidate) &&
          candidate.node.to <= group.node.from &&
          !hasTopLevelRebinding(
            input,
            topLevelNodes,
            candidate.alias,
            candidate.node.to,
            group.node.from
          )
      )
      .sort((left, right) => right.node.from - left.node.from)
      .at(0);
    if (imported !== undefined) {
      return group;
    }
  }

  return null;
}

function resolveSanicBlueprintGroupMembers(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  blueprints: readonly SanicBlueprint[],
  groups: readonly SanicBlueprintGroup[],
  group: SanicBlueprintGroup,
  visited: ReadonlySet<string> = new Set<string>()
): readonly ResolvedSanicBlueprintGroupMember[] | null {
  const groupKey = nodeKey(group.node);
  if (visited.has(groupKey)) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(groupKey);
  const members: ResolvedSanicBlueprintGroupMember[] = [];

  for (const memberName of group.memberNames) {
    const blueprint = latestProvenFrameworkInstance(
      input,
      topLevelNodes,
      imports,
      blueprints,
      memberName,
      group.node.from,
      "Blueprint"
    );
    if (blueprint !== null) {
      members.push({
        blueprint,
        prefixes: [group.prefix, blueprint.prefix],
        groupDepth: 1
      });
      continue;
    }

    const childGroup = latestProvenSanicBlueprintGroup(
      input,
      topLevelNodes,
      imports,
      groups,
      memberName,
      group.node.from
    );
    if (childGroup === null) {
      return null;
    }
    const childMembers = resolveSanicBlueprintGroupMembers(
      input,
      topLevelNodes,
      imports,
      blueprints,
      groups,
      childGroup,
      nestedVisited
    );
    if (childMembers === null) {
      return null;
    }
    for (const childMember of childMembers) {
      members.push({
        blueprint: childMember.blueprint,
        prefixes: [group.prefix, ...childMember.prefixes],
        groupDepth: childMember.groupDepth + 1
      });
    }
  }

  const blueprintKeys = new Set<string>();
  for (const member of members) {
    const blueprintKey = nodeKey(member.blueprint.node);
    if (blueprintKeys.has(blueprintKey)) {
      return null;
    }
    blueprintKeys.add(blueprintKey);
  }
  return members;
}

function resolvedSanicBlueprintGroupMounts(
  registrations: readonly ProvenSanicBlueprintGroupRegistration[],
  applicationName: string,
  blueprint: SanicBlueprint
): readonly ResolvedSanicBlueprintGroupMount[] {
  const blueprintKey = nodeKey(blueprint.node);
  const mounts: ResolvedSanicBlueprintGroupMount[] = [];
  for (const registration of registrations) {
    if (registration.registration.applicationName !== applicationName) {
      continue;
    }
    for (const member of registration.members) {
      if (nodeKey(member.blueprint.node) === blueprintKey) {
        mounts.push({ registration, member });
      }
    }
  }
  return mounts;
}

function hasDistinctLiteralSanicGroupNamePrefixes(
  mounts: readonly ResolvedSanicBlueprintGroupMount[]
): boolean {
  if (
    mounts.length < 2 ||
    !mounts.every(
      (mount) => mount.member.groupDepth === 1 && mount.registration.group.namePrefix !== null
    )
  ) {
    return false;
  }
  return new Set(mounts.map((mount) => mount.registration.group.namePrefix)).size === mounts.length;
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

function latestProvenSanicApplication(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  applications: readonly SanicApplication[],
  decorator: StaticSanicDecorator
): SanicApplication | null {
  return latestProvenFrameworkInstance(
    input,
    topLevelNodes,
    imports,
    applications,
    decorator.receiver,
    decorator.node.from,
    "Sanic"
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

function latestProvenFlaskRestfulApi(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  flaskImports: readonly FrameworkNamedImport[],
  flaskApplications: readonly FlaskApplication[],
  flaskRestfulImports: readonly FrameworkNamedImport[],
  flaskRestfulApis: readonly FlaskRestfulApi[],
  apiName: string,
  before: number
): FlaskRestfulApi | null {
  const api = latestProvenFrameworkInstance(
    input,
    topLevelNodes,
    flaskRestfulImports,
    flaskRestfulApis,
    apiName,
    before,
    "Api"
  );
  if (api === null) {
    return null;
  }
  return latestProvenFlaskApplication(
    input,
    topLevelNodes,
    flaskImports,
    flaskApplications,
    api.applicationName,
    api.node.from
  ) === null
    ? null
    : api;
}

function latestProvenFlaskRestfulResourceClass(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  flaskRestfulImports: readonly FrameworkNamedImport[],
  resources: readonly FlaskRestfulResourceClass[],
  resourceClassName: string,
  before: number
): FlaskRestfulResourceClass | null {
  const candidates = resources
    .filter(
      (resource) =>
        resource.name === resourceClassName &&
        resource.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, resource.name, resource.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  for (const resource of candidates) {
    if (
      latestProvenFrameworkNamedImport(
        input,
        topLevelNodes,
        flaskRestfulImports,
        "Resource",
        resource.resourceBaseName,
        resource.node.from
      ) !== null
    ) {
      return resource;
    }
  }
  return null;
}

function latestProvenAioHttpApplication(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  applications: readonly AioHttpApplication[],
  applicationName: string,
  before: number
): AioHttpApplication | null {
  const candidates = applications
    .filter(
      (application) =>
        application.name === applicationName &&
        application.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          application.name,
          application.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);

  for (const application of candidates) {
    const imported = imports
      .filter(
        (candidate) =>
          candidate.importedName === "web" &&
          candidate.alias === application.webModuleName &&
          hasUnambiguousFrameworkImportAlias(imports, candidate) &&
          candidate.node.to <= application.node.from &&
          !hasTopLevelRebinding(
            input,
            topLevelNodes,
            candidate.alias,
            candidate.node.to,
            application.node.from
          )
      )
      .sort((left, right) => right.node.from - left.node.from)
      .at(0);
    if (imported !== undefined) {
      return application;
    }
  }

  return null;
}

function latestProvenAioHttpWebImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  webModuleName: string,
  before: number
): FrameworkNamedImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.importedName === "web" &&
        candidate.alias === webModuleName &&
        hasUnambiguousFrameworkImportAlias(imports, candidate) &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.alias, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function latestProvenAioHttpRouteList(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  routeLists: readonly StaticAioHttpRouteList[],
  routeListName: string,
  before: number
): StaticAioHttpRouteList | null {
  const candidates = routeLists
    .filter(
      (candidate) =>
        candidate.name === routeListName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.name, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function latestProvenDjangoRouteImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  factoryName: string,
  importedName: DjangoUrlPatternFactory,
  before: number
): FrameworkNamedImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.importedName === importedName &&
        candidate.alias === factoryName &&
        hasUnambiguousFrameworkImportAlias(imports, candidate) &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.alias, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function latestProvenDjangoIncludeImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  factoryName: string,
  before: number
): FrameworkNamedImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.importedName === "include" &&
        candidate.alias === factoryName &&
        hasUnambiguousFrameworkImportAlias(imports, candidate) &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.alias, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function latestProvenStarletteRouteImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FrameworkNamedImport[],
  factoryName: string,
  before: number
): FrameworkNamedImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.importedName === "Route" &&
        candidate.alias === factoryName &&
        hasUnambiguousFrameworkImportAlias(imports, candidate) &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.alias, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function latestProvenStarletteRouteList(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  routeLists: readonly StaticStarletteRouteList[],
  routeListName: string,
  before: number
): StaticStarletteRouteList | null {
  const candidates = routeLists
    .filter(
      (candidate) =>
        candidate.name === routeListName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(input, topLevelNodes, candidate.name, candidate.node.to, before)
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Finds the one direct package-relative URLConf import still bound to an
 * `include` argument. A later assignment or import makes the binding unsafe.
 */
function latestProvenDjangoRelativeUrlconfImportBinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticDjangoRelativeUrlconfImport[],
  urlconfName: string,
  before: number
): StaticDjangoRelativeUrlconfImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.urlconfName === urlconfName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.urlconfName,
          candidate.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/** Finds the one direct package-relative URLConf import still bound to `include`. */
function latestProvenDjangoRelativeUrlconfImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticDjangoRelativeUrlconfImport[],
  inclusion: StaticDjangoImportedUrlconfInclusion
): StaticDjangoRelativeUrlconfImport | null {
  return latestProvenDjangoRelativeUrlconfImportBinding(
    input,
    topLevelNodes,
    imports,
    inclusion.urlconfName,
    inclusion.node.from
  );
}

/**
 * Finds the one direct static import still bound to a FastAPI router name.
 * A later assignment or import shadows an earlier import and therefore removes
 * it from consideration.
 */
function latestProvenFastApiRouterImportBinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticFastApiRouterImport[],
  routerName: string,
  before: number
): StaticFastApiRouterImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.routerName === routerName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.routerName,
          candidate.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Finds the one direct static import still bound to the router argument at a
 * literal `include_router` call.
 */
function latestProvenFastApiRouterImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticFastApiRouterImport[],
  inclusion: StaticFastApiRouterInclusion
): StaticFastApiRouterImport | null {
  return latestProvenFastApiRouterImportBinding(
    input,
    topLevelNodes,
    imports,
    inclusion.routerName,
    inclusion.node.from
  );
}

/**
 * Finds the one direct static import still bound to a Django Ninja Router name.
 * A later assignment or import shadows an earlier import and therefore removes
 * it from consideration.
 */
function latestProvenDjangoNinjaRouterImportBinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticDjangoNinjaRouterImport[],
  routerName: string,
  before: number
): StaticDjangoNinjaRouterImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.routerName === routerName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.routerName,
          candidate.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Finds the one direct static import still bound to the Router argument at a
 * literal Django Ninja `add_router` call.
 */
function latestProvenDjangoNinjaRouterImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticDjangoNinjaRouterImport[],
  inclusion: StaticDjangoNinjaRouterInclusion
): StaticDjangoNinjaRouterImport | null {
  return latestProvenDjangoNinjaRouterImportBinding(
    input,
    topLevelNodes,
    imports,
    inclusion.routerName,
    inclusion.node.from
  );
}

/**
 * Finds the one direct static import still bound to a Flask Blueprint name.
 * A later assignment or import shadows an earlier import and therefore removes
 * it from consideration.
 */
function latestProvenFlaskBlueprintImportBinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticFlaskBlueprintImport[],
  blueprintName: string,
  before: number
): StaticFlaskBlueprintImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.blueprintName === blueprintName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.blueprintName,
          candidate.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Finds the one direct static import still bound to the Blueprint argument
 * at a literal `register_blueprint` call.
 */
function latestProvenFlaskBlueprintImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticFlaskBlueprintImport[],
  registration: StaticFlaskBlueprintRegistration
): StaticFlaskBlueprintImport | null {
  return latestProvenFlaskBlueprintImportBinding(
    input,
    topLevelNodes,
    imports,
    registration.blueprintName,
    registration.node.from
  );
}

/**
 * Finds the one direct relative import still bound to a Sanic Blueprint
 * argument at a literal `app.blueprint` call. A later assignment or import
 * shadows an earlier import and therefore removes it from consideration.
 */
function latestProvenSanicRelativeBlueprintImportBinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticSanicRelativeBlueprintImport[],
  blueprintName: string,
  before: number
): StaticSanicRelativeBlueprintImport | null {
  const candidates = imports
    .filter(
      (candidate) =>
        candidate.blueprintName === blueprintName &&
        candidate.node.to <= before &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          candidate.blueprintName,
          candidate.node.to,
          before
        )
    )
    .sort((left, right) => right.node.from - left.node.from);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Finds the one direct relative import still bound to a Sanic Blueprint or
 * group argument at a literal `app.blueprint` call.
 */
function latestProvenSanicRelativeBlueprintImport(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly StaticSanicRelativeBlueprintImport[],
  registration: StaticSanicBlueprintRegistration
): StaticSanicRelativeBlueprintImport | null {
  return latestProvenSanicRelativeBlueprintImportBinding(
    input,
    topLevelNodes,
    imports,
    registration.blueprintName,
    registration.node.from
  );
}

/**
 * Persists a group only when every member has an exact binding at group
 * creation time. Imported members preserve their source module so project
 * resolution never infers a target from a local variable name.
 */
function resolvedSanicBlueprintGroupMemberFacts(input: {
  readonly extraction: PythonExtractFileFactsInput;
  readonly topLevelNodes: readonly PythonSyntaxNode[];
  readonly imports: readonly FrameworkNamedImport[];
  readonly relativeImports: readonly StaticSanicRelativeBlueprintImport[];
  readonly blueprints: readonly SanicBlueprint[];
  readonly groups: readonly SanicBlueprintGroup[];
  readonly group: SanicBlueprintGroup;
}): readonly SanicBlueprintGroupMemberFact[] | null {
  const members: SanicBlueprintGroupMemberFact[] = [];
  for (const memberName of input.group.memberNames) {
    const blueprint = latestProvenFrameworkInstance(
      input.extraction,
      input.topLevelNodes,
      input.imports,
      input.blueprints,
      memberName,
      input.group.node.from,
      "Blueprint"
    );
    if (blueprint !== null) {
      members.push({ kind: "blueprint", name: blueprint.name });
      continue;
    }

    const childGroup = latestProvenSanicBlueprintGroup(
      input.extraction,
      input.topLevelNodes,
      input.imports,
      input.groups,
      memberName,
      input.group.node.from
    );
    if (childGroup !== null) {
      members.push({ kind: "group", name: childGroup.name });
      continue;
    }

    const imported = latestProvenSanicRelativeBlueprintImportBinding(
      input.extraction,
      input.topLevelNodes,
      input.relativeImports,
      memberName,
      input.group.node.from
    );
    if (imported === null) {
      return null;
    }
    members.push({
      kind: "imported",
      importedName: imported.importedBlueprintName,
      moduleSpecifier: imported.moduleSpecifier
    });
  }
  return members;
}

function combinedRoutePath(...parts: readonly string[]): string {
  return parts.join("");
}

function isPythonPackageInitializer(filePath: string): boolean {
  return filePath.replaceAll("\\", "/").split("/").at(-1) === "__init__.py";
}

/**
 * Extracts conservative Python file facts. The Python surface records
 * declarations, containment, direct FastAPI/Django Ninja/Flask/Sanic decorators,
 * direct Django URL patterns, and direct same-file or package-relative router,
 * Blueprint, and URLConf composition only when every binding and path is syntax-proven.
 */
export function extractPythonFileFacts(input: PythonExtractFileFactsInput): ArtifactFacts {
  const fastApiCapability = frameworkCapability("fastapi");
  const djangoNinjaCapability = frameworkCapability("django-ninja");
  const flaskCapability = frameworkCapability("flask");
  const djangoCapability = frameworkCapability("django");
  const starletteCapability = frameworkCapability("starlette");
  const aioHttpCapability = frameworkCapability("aiohttp");
  const sanicCapability = frameworkCapability("sanic");
  if (
    !fastApiCapability.languages.includes(input.language) ||
    !djangoNinjaCapability.languages.includes(input.language) ||
    !flaskCapability.languages.includes(input.language) ||
    !djangoCapability.languages.includes(input.language) ||
    !starletteCapability.languages.includes(input.language) ||
    !aioHttpCapability.languages.includes(input.language) ||
    !sanicCapability.languages.includes(input.language)
  ) {
    throw new Error("Python framework extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const normalizedLineEndings = input.sourceText.replace(/\r\n/gu, "\n");
  if (normalizedLineEndings !== input.sourceText && hasSyntaxError(root)) {
    const errors = pythonSyntaxErrors(root);
    const isClosedCrLfRecovery = errors.every((error) => error.parent?.name !== "Script");
    const normalizedRoot = isClosedCrLfRecovery
      ? parser.parse(normalizedLineEndings).topNode
      : null;
    if (normalizedRoot !== null && !hasSyntaxError(normalizedRoot)) {
      return extractPythonFileFacts({ ...input, sourceText: normalizedLineEndings });
    }
  }
  const recoveryCompatibility = pythonRecoveryCompatibility(input, root);
  const artifactCallTaint = pythonArtifactCallTaint(input, root);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const symbolsByNodeKey = new Map<string, SymbolNode>();
  const pythonFacts: {
    topLevelDeclarations: PythonTopLevelDeclarationFact[];
    relativeNamedImports: PythonRelativeNamedImportFact[];
    importedFunctionCalls: PythonImportedFunctionCallFact[];
    importedClassInstantiations: PythonImportedClassInstantiationFact[];
    importedClassInheritances: PythonImportedClassInheritanceFact[];
  } = {
    topLevelDeclarations: [],
    relativeNamedImports: [],
    importedFunctionCalls: [],
    importedClassInstantiations: [],
    importedClassInheritances: []
  };
  const fastApiRouterFacts: {
    readonly routers: FastApiRouterDeclarationFact[];
    readonly routes: FastApiRouterRouteFact[];
    readonly reExports: FastApiRouterReExportFact[];
    readonly importedRouterInclusions: FastApiImportedRouterInclusionFact[];
  } = {
    routers: [],
    routes: [],
    reExports: [],
    importedRouterInclusions: []
  };
  const djangoNinjaRouterFacts: {
    readonly routers: DjangoNinjaRouterDeclarationFact[];
    readonly routes: DjangoNinjaRouterRouteFact[];
    readonly reExports: DjangoNinjaRouterReExportFact[];
    readonly importedRouterInclusions: DjangoNinjaImportedRouterInclusionFact[];
  } = {
    routers: [],
    routes: [],
    reExports: [],
    importedRouterInclusions: []
  };
  const flaskBlueprintFacts: {
    readonly blueprints: FlaskBlueprintDeclarationFact[];
    readonly routes: FlaskBlueprintRouteFact[];
    readonly reExports: FlaskBlueprintReExportFact[];
    readonly importedBlueprintRegistrations: FlaskImportedBlueprintRegistrationFact[];
  } = {
    blueprints: [],
    routes: [],
    reExports: [],
    importedBlueprintRegistrations: []
  };
  const sanicBlueprintFacts: {
    readonly blueprints: SanicBlueprintDeclarationFact[];
    readonly groups: SanicBlueprintGroupDeclarationFact[];
    readonly reExports: SanicBlueprintReExportFact[];
    readonly routes: SanicBlueprintRouteFact[];
    readonly importedBlueprintRegistrations: SanicImportedBlueprintRegistrationFact[];
  } = {
    blueprints: [],
    groups: [],
    reExports: [],
    routes: [],
    importedBlueprintRegistrations: []
  };
  const djangoUrlFacts: {
    readonly routes: DjangoUrlPatternRouteFact[];
    hasUrlpatterns?: true;
    readonly reExports: DjangoUrlconfReExportFact[];
    readonly importedUrlconfInclusions: DjangoImportedUrlconfInclusionFact[];
    readonly literalUrlconfInclusions: DjangoLiteralUrlconfInclusionFact[];
  } = {
    routes: [],
    reExports: [],
    importedUrlconfInclusions: [],
    literalUrlconfInclusions: []
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

  const recoveredClassScopes: {
    readonly node: PythonSyntaxNode;
    readonly classIndent: number;
    readonly bodyIndent: number;
    readonly from: number;
    readonly to: number;
  }[] = [];
  if (recoveryCompatibility?.mode === "declarations-only") {
    function collectRecoveredClassScopes(node: PythonSyntaxNode): void {
      if (node.name === "ClassDefinition") {
        const line = rangeFor(lineStarts, node.from, node.from).start.line - 1;
        const lineStart = lineStarts[line];
        const lineEnd = lineStarts[line + 1] ?? input.sourceText.length;
        const header =
          lineStart === undefined ? "" : input.sourceText.slice(lineStart, lineEnd).replace(/[\r\n]+$/u, "");
        const match = /^( *)class[\t ]+[A-Za-z_][A-Za-z0-9_]*(?:[\t ]*\([^\r\n]*\))?[\t ]*:[\t ]*(?:#.*)?$/u.exec(
          header
        );
        if (match !== null) {
          const classIndent = match[1]!.length;
          let bodyIndent: number | null = null;
          let scopeEnd = input.sourceText.length;
          for (let index = line + 1; index < lineStarts.length; index += 1) {
            const start = lineStarts[index];
            if (start === undefined) {
              continue;
            }
            const end = lineStarts[index + 1] ?? input.sourceText.length;
            const text = input.sourceText.slice(start, end).replace(/[\r\n]+$/u, "");
            if (/^[\t ]*(?:#.*)?$/u.test(text)) {
              continue;
            }
            const indentation = /^( *)/u.exec(text)?.[1]?.length;
            if (indentation === undefined || text.startsWith("\t")) {
              break;
            }
            if (indentation <= classIndent) {
              scopeEnd = start;
              break;
            }
            bodyIndent ??= indentation;
          }
          if (bodyIndent !== null) {
            recoveredClassScopes.push({
              node,
              classIndent,
              bodyIndent,
              from: node.from,
              to: scopeEnd
            });
          }
        }
      }
      for (const child of directChildren(node)) {
        collectRecoveredClassScopes(child);
      }
    }
    collectRecoveredClassScopes(root);
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    node: PythonSyntaxNode,
    range = rangeFor(lineStarts, node.from, node.to)
  ): void {
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

  function recoveredClassOwner(node: PythonSyntaxNode): SymbolNode | null {
    const line = rangeFor(lineStarts, node.from, node.from).start.line - 1;
    const lineStart = lineStarts[line];
    const lineEnd = lineStarts[line + 1] ?? input.sourceText.length;
    const declarationLine =
      lineStart === undefined ? "" : input.sourceText.slice(lineStart, lineEnd).replace(/[\r\n]+$/u, "");
    const indentation = /^( *)/u.exec(declarationLine)?.[1]?.length;
    if (indentation === undefined || declarationLine.startsWith("\t")) {
      return null;
    }
    const candidates = recoveredClassScopes
      .filter(
        (scope) =>
          node.from > scope.from &&
          node.from < scope.to &&
          indentation === scope.bodyIndent
      )
      .sort((left, right) => right.classIndent - left.classIndent);
    const scope = candidates[0];
    return scope === undefined ? null : symbolsByNodeKey.get(nodeKey(scope.node)) ?? null;
  }

  function addDeclaration(node: PythonSyntaxNode, owner: SymbolNode): SymbolNode | null {
    const name = declarationName(input, node);
    if (name === null) {
      return null;
    }
    const kind: SymbolKind =
      node.name === "ClassDefinition"
        ? "class"
        : owner.kind === "class" || isClassScopedFunction(node)
          ? "method"
          : "function";
    const qualifiedName =
      owner.kind === "file" ? `${input.filePath}#${name}` : `${owner.qualifiedName}.${name}`;
    const identity = `${qualifiedName}\u0000${kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const declarationEnd = lastPythonCodeTokenEnd(node);
    if (declarationEnd === null) {
      return null;
    }
    const declarationRange = rangeFor(lineStarts, node.from, declarationEnd);
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
      range: declarationRange,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByNodeKey.set(nodeKey(node), symbol);
    addContainment(owner, symbol, node, declarationRange);
    return symbol;
  }

  function visit(node: PythonSyntaxNode, owner: SymbolNode): void {
    const effectiveOwner =
      node.name === "FunctionDefinition" &&
      owner.kind === "file" &&
      recoveryCompatibility?.mode === "declarations-only"
        ? recoveredClassOwner(node) ?? owner
        : owner;
    const declaration =
      node.name === "FunctionDefinition" || node.name === "ClassDefinition"
        ? addDeclaration(node, effectiveOwner)
        : null;
    for (const child of directChildren(node)) {
      visit(child, declaration ?? effectiveOwner);
    }
  }

  function addSameFileTopLevelFunctionCalls(
    topLevelNodes: readonly PythonSyntaxNode[],
    relativeNamedImports: readonly StaticPythonRelativeNamedImport[]
  ): void {
    if (
      topLevelNodes.some(
        (node) => {
          if (node.name !== "ImportStatement") {
            return false;
          }
          const children = directChildren(node);
          const importIndex = children.findIndex((child) => child.name === "import");
          return (
            children.some((child) => child.name === "from") &&
            importIndex >= 0 &&
            children.slice(importIndex + 1).some((child) => child.name === "*")
          );
        }
      )
    ) {
      return;
    }

    const declarations = topLevelNodes.flatMap((statement) => {
      if (statement.name === "DecoratedStatement") {
        return [];
      }
      const definition = statement;
      if (definition.name !== "FunctionDefinition" || isAsyncPythonFunction(definition)) {
        return [];
      }
      const name = declarationName(input, definition);
      const symbol = symbolsByNodeKey.get(nodeKey(definition));
      return name === null || symbol?.kind !== "function"
        ? []
        : [{ definition, name, symbol }];
    });
    const classDeclarations = topLevelNodes.flatMap((statement) => {
      if (
        statement.name !== "ClassDefinition" ||
        !isPythonClassInstantiationEligible(input, statement)
      ) {
        return [];
      }
      const name = declarationName(input, statement);
      const symbol = symbolsByNodeKey.get(nodeKey(statement));
      return name === null || symbol?.kind !== "class"
        ? []
        : [{ definition: statement, name, symbol }];
    });
    const directClassMethodCandidates = topLevelNodes.flatMap((statement) => {
      if (statement.name !== "ClassDefinition") {
        return [];
      }
      const className = declarationName(input, statement);
      const classSymbol = symbolsByNodeKey.get(nodeKey(statement));
      const bodies = directChildren(statement).filter((child) => child.name === "Body");
      const body = bodies.length === 1 ? bodies[0] : undefined;
      if (className === null || classSymbol?.kind !== "class" || body === undefined) {
        return [];
      }
      const methods = directChildren(body).filter(
        (child) => child.name === "FunctionDefinition" && !isAsyncPythonFunction(child)
      );
      const methodNameCounts = new Map<string, number>();
      for (const method of methods) {
        const name = declarationName(input, method);
        if (name !== null) {
          methodNameCounts.set(name, (methodNameCounts.get(name) ?? 0) + 1);
        }
      }
      return methods.flatMap((definition) => {
        const name = declarationName(input, definition);
        const symbol = symbolsByNodeKey.get(nodeKey(definition));
        return name === null || symbol?.kind !== "method"
          ? []
          : [{ definition, name, symbol, className, methodNameCounts }];
      });
    });
    const declarationsByName = new Map<string, typeof declarations>();
    for (const declaration of declarations) {
      const candidates = declarationsByName.get(declaration.name) ?? [];
      candidates.push(declaration);
      declarationsByName.set(declaration.name, candidates);
    }
    const classDeclarationsByName = new Map<string, typeof classDeclarations>();
    for (const declaration of classDeclarations) {
      const candidates = classDeclarationsByName.get(declaration.name) ?? [];
      candidates.push(declaration);
      classDeclarationsByName.set(declaration.name, candidates);
    }
    const importsByLocalName = new Map<string, readonly StaticPythonRelativeNamedImport[]>();
    for (const imported of relativeNamedImports) {
      const candidates = importsByLocalName.get(imported.localName) ?? [];
      importsByLocalName.set(imported.localName, [...candidates, imported]);
    }

    function addTargetNames(node: PythonSyntaxNode, names: Set<string>): void {
      if (node.name === "VariableName") {
        const name = declarationName(input, node);
        if (name !== null) {
          names.add(name);
        }
        return;
      }
      if (
        ![
          "TupleExpression",
          "ListExpression",
          "ParenthesizedExpression",
          "StarExpression"
        ].includes(node.name)
      ) {
        return;
      }
      for (const child of directChildren(node)) {
        addTargetNames(child, names);
      }
    }

    function addDirectBindingNames(node: PythonSyntaxNode, names: Set<string>): void {
      const children = directChildren(node);
      if (node.name === "ImportStatement") {
        for (const name of pythonImportLocalBindingNames(input, node)) {
          names.add(name);
        }
        return;
      }
      if (node.name === "ScopeStatement") {
        for (const name of directVariableNames(input, node)) {
          names.add(name);
        }
        return;
      }
      // PEP 695 binds the alias name in the enclosing scope. Type parameters
      // have their own scope, so deliberately retain only the direct alias.
      if (node.name === "TypeDefinition") {
        const alias = children.find((child) => child.name === "VariableName");
        if (alias !== undefined) {
          addTargetNames(alias, names);
        }
        return;
      }
      if (node.name === "AssignStatement" || node.name === "NamedExpression") {
        for (let index = 1; index < children.length; index += 1) {
          if (children[index]?.name === "TypeDef" && children[index - 1] !== undefined) {
            addTargetNames(children[index - 1]!, names);
          }
        }
        for (let index = 0; index < children.length - 1; index += 1) {
          if (children[index + 1]?.name !== "AssignOp" || children[index] === undefined) {
            continue;
          }
          const target =
            children[index]?.name === "TypeDef" && index > 0
              ? children[index - 1]
              : children[index];
          if (target !== undefined) {
            addTargetNames(target, names);
          }
        }
        return;
      }
      if (node.name === "UpdateStatement") {
        if (children[0] !== undefined) {
          addTargetNames(children[0], names);
        }
        return;
      }
      if (node.name === "DeleteStatement") {
        for (const child of children.slice(1)) {
          addTargetNames(child, names);
        }
        return;
      }
      if (node.name === "ForStatement") {
        const inIndex = children.findIndex((child) => child.name === "in");
        for (const child of children.slice(0, inIndex < 0 ? 0 : inIndex)) {
          addTargetNames(child, names);
        }
        return;
      }
      if (
        node.name.endsWith("ComprehensionExpression") ||
        node.name === "GeneratorExpression"
      ) {
        for (let index = 0; index < children.length; index += 1) {
          if (children[index]?.name !== "for") {
            continue;
          }
          const inIndex = children.findIndex(
            (child, candidateIndex) => candidateIndex > index && child.name === "in"
          );
          if (inIndex < 0) {
            continue;
          }
          for (const child of children.slice(index + 1, inIndex)) {
            addTargetNames(child, names);
          }
        }
        return;
      }
      if (node.name === "WithStatement" || node.name === "TryStatement") {
        for (let index = 0; index < children.length - 1; index += 1) {
          if (children[index]?.name === "as" && children[index + 1] !== undefined) {
            addTargetNames(children[index + 1]!, names);
          }
        }
        return;
      }
      if (node.name === "CapturePattern") {
        for (const child of children) {
          addTargetNames(child, names);
        }
        return;
      }
      // `case _ as name` binds `name`; omitting it can incorrectly resolve a
      // bare imported call from inside the case body.
      if (node.name === "AsPattern") {
        const asIndex = children.findIndex((child) => child.name === "as");
        const alias = asIndex < 0 ? undefined : children[asIndex + 1];
        if (alias !== undefined) {
          addTargetNames(alias, names);
        }
      }
    }

    function topLevelBindingNames(node: PythonSyntaxNode): readonly string[] {
      const definition = decoratedDefinition(node) ?? node;
      if (definition.name === "FunctionDefinition" || definition.name === "ClassDefinition") {
        const name = declarationName(input, definition);
        return name === null ? [] : [name];
      }
      const names = new Set<string>();
      function visitBinding(candidate: PythonSyntaxNode): void {
        addDirectBindingNames(candidate, names);
        for (const child of directChildren(candidate)) {
          visitBinding(child);
        }
      }
      visitBinding(node);
      return [...names];
    }

    const topLevelBindCounts = new Map<string, number>();
    for (const node of topLevelNodes) {
      for (const name of topLevelBindingNames(node)) {
        topLevelBindCounts.set(name, (topLevelBindCounts.get(name) ?? 0) + 1);
      }
    }
    const directClassMethods = directClassMethodCandidates
      .filter(
        (candidate) =>
          topLevelBindCounts.get(candidate.className) === 1 &&
          candidate.methodNameCounts.get(candidate.name) === 1
      )
      .map(({ definition, name, symbol }) => ({ definition, name, symbol }));
    for (const imported of relativeNamedImports) {
      if (
        topLevelBindCounts.get(imported.localName) !== 1 ||
        (importsByLocalName.get(imported.localName)?.length ?? 0) !== 1
      ) {
        continue;
      }
      pythonFacts.relativeNamedImports.push({
        sourceId: fileNode.id,
        filePath: input.filePath,
        moduleName: imported.moduleName,
        importedName: imported.importedName,
        localName: imported.localName,
        range: rangeFor(lineStarts, imported.moduleFrom, imported.moduleTo)
      });
    }

    for (const statement of topLevelNodes) {
      if (statement.name === "DecoratedStatement") {
        continue;
      }
      if (statement.name !== "FunctionDefinition" && statement.name !== "ClassDefinition") {
        continue;
      }
      const name = declarationName(input, statement);
      const symbol = symbolsByNodeKey.get(nodeKey(statement));
      if (
        name === null ||
        (symbol?.kind !== "function" && symbol?.kind !== "class") ||
        topLevelBindCounts.get(name) !== 1
      ) {
        continue;
      }
      pythonFacts.topLevelDeclarations.push({
        symbolId: symbol.id,
        name,
        kind: symbol.kind,
        ...(symbol.kind === "function" && !isAsyncPythonFunction(statement)
          ? { runtimeCallEligible: true as const }
          : {}),
        ...(symbol.kind === "class" && isPythonClassInstantiationEligible(input, statement)
          ? { instantiationEligible: true as const }
          : {})
      });
      if (symbol.kind !== "class") {
        continue;
      }
      const base = pythonSingleBareClassBase(input, statement);
      const localName = base === null ? null : declarationName(input, base);
      const matchingImports = localName === null ? [] : importsByLocalName.get(localName) ?? [];
      if (
        base === null ||
        localName === null ||
        matchingImports.length !== 1 ||
        topLevelBindCounts.get(localName) !== 1
      ) {
        continue;
      }
      pythonFacts.importedClassInheritances.push({
        sourceId: symbol.id,
        filePath: input.filePath,
        localName,
        range: rangeFor(lineStarts, base.from, base.to)
      });
    }

    function analyzeCaller(definition: PythonSyntaxNode): {
      readonly callsByName: ReadonlyMap<string, readonly PythonSyntaxNode[]>;
      readonly unsafeBindingNames: ReadonlySet<string>;
    } {
      const bodies = directChildren(definition).filter((child) => child.name === "Body");
      const parameterLists = directChildren(definition).filter(
        (child) => child.name === "ParamList"
      );
      if (
        bodies.length !== 1 ||
        bodies[0] === undefined ||
        parameterLists.length !== 1 ||
        parameterLists[0] === undefined
      ) {
        return { callsByName: new Map(), unsafeBindingNames: new Set() };
      }
      input.directCallTraversalObserver?.();
      const unsafeBindingNames = new Set<string>();
      for (const binding of recoveryCompatibility?.unsafeBindings ?? []) {
        if (binding.from >= definition.from && binding.to <= definition.to) {
          unsafeBindingNames.add(binding.name);
        }
      }
      for (const child of directChildren(parameterLists[0])) {
        if (child.name === "VariableName") {
          const name = declarationName(input, child);
          if (name !== null) {
            unsafeBindingNames.add(name);
          }
        }
      }
      function collectTypeParameterNames(candidate: PythonSyntaxNode): void {
        if (candidate.name === "TypeParam") {
          const nameNode = directChildren(candidate).find((child) => child.name === "VariableName");
          const name = nameNode === undefined ? null : declarationName(input, nameNode);
          if (name !== null) {
            unsafeBindingNames.add(name);
          }
          return;
        }
        for (const child of directChildren(candidate)) {
          collectTypeParameterNames(child);
        }
      }
      for (const typeParameterList of directChildren(definition).filter(
        (child) => child.name === "TypeParamList"
      )) {
        collectTypeParameterNames(typeParameterList);
      }
      const callsByName = new Map<string, PythonSyntaxNode[]>();
      function visitCall(candidate: PythonSyntaxNode): void {
        if (
          candidate !== bodies[0] &&
          (candidate.name === "DecoratedStatement" ||
            candidate.name === "FunctionDefinition" ||
            candidate.name === "ClassDefinition" ||
            candidate.name === "LambdaExpression")
        ) {
          const definition = decoratedDefinition(candidate) ?? candidate;
          if (
            definition.name === "FunctionDefinition" ||
            definition.name === "ClassDefinition"
          ) {
            const name = declarationName(input, definition);
            if (name !== null) {
              unsafeBindingNames.add(name);
            }
          }
          return;
        }
        addDirectBindingNames(candidate, unsafeBindingNames);
        if (candidate.name === "CallExpression") {
          const callee = directChildren(candidate)[0];
          const name = callee?.name === "VariableName" ? declarationName(input, callee) : null;
          if (
            name !== null &&
            candidate.parent?.name !== "CallExpression" &&
            (candidate.parent?.name !== "MemberExpression" ||
              isImmediateCompleteSubscriptOf(candidate.parent, candidate))
          ) {
            const calls = callsByName.get(name) ?? [];
            calls.push(callee!);
            callsByName.set(name, calls);
          }
        }
        for (const child of directChildren(candidate)) {
          visitCall(child);
        }
      }
      visitCall(bodies[0]);
      return { callsByName, unsafeBindingNames };
    }

    for (const caller of [...declarations, ...directClassMethods]) {
      const analysis = analyzeCaller(caller.definition);
      for (const [targetName, calls] of analysis.callsByName) {
        const candidates = declarationsByName.get(targetName) ?? [];
        const target = candidates[0];
        const classCandidates = classDeclarationsByName.get(targetName) ?? [];
        const classTarget = classCandidates[0];
        const importedCandidates = importsByLocalName.get(targetName) ?? [];
        if (
          !artifactCallTaint.dynamicGlobalHazard &&
          !artifactCallTaint.globalTaintedNames.has(targetName) &&
          !analysis.unsafeBindingNames.has(targetName) &&
          importedCandidates.length === 1 &&
          topLevelBindCounts.get(targetName) === 1
        ) {
          for (const call of calls) {
            pythonFacts.importedFunctionCalls.push({
              sourceId: caller.symbol.id,
              filePath: input.filePath,
              localName: targetName,
              range: rangeFor(lineStarts, call.from, call.to)
            });
            pythonFacts.importedClassInstantiations.push({
              sourceId: caller.symbol.id,
              filePath: input.filePath,
              localName: targetName,
              range: rangeFor(lineStarts, call.from, call.to)
            });
          }
        }
        if (
          !artifactCallTaint.dynamicGlobalHazard &&
          !artifactCallTaint.globalTaintedNames.has(targetName) &&
          !analysis.unsafeBindingNames.has(targetName) &&
          classCandidates.length === 1 &&
          classTarget !== undefined &&
          topLevelBindCounts.get(targetName) === 1
        ) {
          for (const call of calls) {
            const range = rangeFor(lineStarts, call.from, call.to);
            edges.push({
              id: createEdgeId({
                sourceId: caller.symbol.id,
                targetId: classTarget.symbol.id,
                kind: "instantiates",
                line: range.start.line,
                column: range.start.column,
                referenceName: targetName
              }),
              sourceId: caller.symbol.id,
              targetId: classTarget.symbol.id,
              kind: "instantiates",
              filePath: input.filePath,
              range,
              resolution: "exact",
              confidence: 1,
              referenceName: targetName,
              evidence: {
                ruleId: "syntax.python.same-file.unique-top-level-class-instantiation",
                stage: "syntax",
                candidateSymbolIds: [classTarget.symbol.id]
              }
            });
          }
        }
        if (
          artifactCallTaint.dynamicGlobalHazard ||
          artifactCallTaint.globalTaintedNames.has(targetName) ||
          analysis.unsafeBindingNames.has(targetName) ||
          caller.symbol.kind !== "function" ||
          candidates.length !== 1 ||
          target === undefined ||
          topLevelBindCounts.get(targetName) !== 1
        ) {
          continue;
        }
        for (const call of calls) {
          const range = rangeFor(lineStarts, call.from, call.to);
          edges.push({
            id: createEdgeId({
              sourceId: caller.symbol.id,
              targetId: target.symbol.id,
              kind: "calls",
              line: range.start.line,
              column: range.start.column,
              referenceName: targetName
            }),
            sourceId: caller.symbol.id,
            targetId: target.symbol.id,
            kind: "calls",
            filePath: input.filePath,
            range,
            resolution: "exact",
            confidence: 1,
            referenceName: targetName,
            evidence: {
              ruleId: "syntax.python.same-file.unique-top-level-function-call",
              stage: "syntax",
              candidateSymbolIds: [target.symbol.id]
            }
          });
        }
      }
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

  if (recoveryCompatibility?.mode === "declarations-only") {
    for (const node of directChildren(root)) {
      visit(node, fileNode);
    }
  } else if (recoveryCompatibility?.mode === "full") {
    const topLevelNodes = directChildren(root);
    for (const node of topLevelNodes) {
      visit(node, fileNode);
    }
    const pythonRelativeNamedImports = hasPythonWildcardImport(input, topLevelNodes)
      ? []
      : topLevelNodes.flatMap((node) => staticPythonRelativeNamedImport(input, node));
    addSameFileTopLevelFunctionCalls(topLevelNodes, pythonRelativeNamedImports);

    const imports = topLevelNodes.flatMap((node) => staticFastApiImports(input, node));
    const djangoNinjaImports = topLevelNodes.flatMap((node) => staticDjangoNinjaImports(input, node));
    const relativeRouterImports = topLevelNodes
      .map((node) => staticFastApiRelativeRouterImport(input, node))
      .filter((candidate): candidate is StaticFastApiRelativeRouterImport => candidate !== null);
    const absoluteRouterImports = topLevelNodes
      .map((node) => staticFastApiAbsoluteRouterImport(input, node))
      .filter((candidate): candidate is StaticFastApiAbsoluteRouterImport => candidate !== null);
    const fastApiRouterImports: readonly StaticFastApiRouterImport[] = [
      ...relativeRouterImports,
      ...absoluteRouterImports
    ];
    const relativeDjangoNinjaRouterImports = topLevelNodes
      .map((node) => staticDjangoNinjaRelativeRouterImport(input, node))
      .filter(
        (candidate): candidate is StaticDjangoNinjaRelativeRouterImport => candidate !== null
      );
    const absoluteDjangoNinjaRouterImports = topLevelNodes
      .map((node) => staticDjangoNinjaAbsoluteRouterImport(input, node))
      .filter(
        (candidate): candidate is StaticDjangoNinjaAbsoluteRouterImport => candidate !== null
      );
    const djangoNinjaRouterImports: readonly StaticDjangoNinjaRouterImport[] = [
      ...relativeDjangoNinjaRouterImports,
      ...absoluteDjangoNinjaRouterImports
    ];
    const relativeBlueprintImports = topLevelNodes
      .map((node) => staticFlaskRelativeBlueprintImport(input, node))
      .filter((candidate): candidate is StaticFlaskRelativeBlueprintImport => candidate !== null);
    const absoluteBlueprintImports = topLevelNodes
      .map((node) => staticFlaskAbsoluteBlueprintImport(input, node))
      .filter((candidate): candidate is StaticFlaskAbsoluteBlueprintImport => candidate !== null);
    const flaskBlueprintImports: readonly StaticFlaskBlueprintImport[] = [
      ...relativeBlueprintImports,
      ...absoluteBlueprintImports
    ];
    const relativeSanicBlueprintImports = topLevelNodes
      .map((node) => staticSanicRelativeBlueprintImport(input, node))
      .filter((candidate): candidate is StaticSanicRelativeBlueprintImport => candidate !== null);
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
    const djangoNinjaApplicationConstructorNames = new Set(
      djangoNinjaImports
        .filter((candidate) => candidate.importedName === "NinjaAPI")
        .map((candidate) => candidate.alias)
    );
    const djangoNinjaApplications = topLevelNodes
      .map((node) =>
        staticDjangoNinjaApplication(input, node, djangoNinjaApplicationConstructorNames)
      )
      .filter((candidate): candidate is DjangoNinjaApplication => candidate !== null);
    const djangoNinjaRouterConstructorNames = new Set(
      djangoNinjaImports
        .filter((candidate) => candidate.importedName === "Router")
        .map((candidate) => candidate.alias)
    );
    const djangoNinjaRouters = topLevelNodes
      .map((node) => staticDjangoNinjaRouter(input, node, djangoNinjaRouterConstructorNames))
      .filter((candidate): candidate is DjangoNinjaRouter => candidate !== null);
    const djangoNinjaRouterInclusions = topLevelNodes
      .map((node) => staticDjangoNinjaRouterInclusion(input, node))
      .filter(
        (candidate): candidate is StaticDjangoNinjaRouterInclusion => candidate !== null
      );
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
    const flaskRestfulImports = topLevelNodes.flatMap((node) => staticFlaskRestfulImports(input, node));
    const flaskRestfulApiConstructorNames = new Set(
      flaskRestfulImports
        .filter((candidate) => candidate.importedName === "Api")
        .map((candidate) => candidate.alias)
    );
    const flaskRestfulApis = topLevelNodes
      .map((node) => staticFlaskRestfulApi(input, node, flaskRestfulApiConstructorNames))
      .filter((candidate): candidate is FlaskRestfulApi => candidate !== null);
    const flaskRestfulResourceRegistrations = topLevelNodes
      .map((node) => staticFlaskRestfulResourceRegistration(input, node))
      .filter(
        (candidate): candidate is StaticFlaskRestfulResourceRegistration => candidate !== null
      );
    const djangoUrlImports = topLevelNodes.flatMap((node) => staticDjangoUrlImports(input, node));
    const relativeDjangoUrlconfImports = topLevelNodes
      .map((node) => staticDjangoRelativeUrlconfImport(input, node))
      .filter((candidate): candidate is StaticDjangoRelativeUrlconfImport => candidate !== null);
    const djangoRouteFactories = new Map<string, DjangoUrlPatternFactory[]>();
    for (const candidate of djangoUrlImports) {
      const factory =
        candidate.source === "django.urls" &&
        (candidate.importedName === "path" || candidate.importedName === "re_path")
          ? candidate.importedName
          : candidate.source === "django.conf.urls" && candidate.importedName === "url"
            ? candidate.importedName
            : null;
      if (factory === null) {
        continue;
      }
      const factories = djangoRouteFactories.get(candidate.alias) ?? [];
      if (!factories.includes(factory)) {
        factories.push(factory);
      }
      djangoRouteFactories.set(candidate.alias, factories);
    }
    const djangoUrlPatternLists = topLevelNodes
      .map((node) => staticDjangoUrlPatternList(input, node, djangoRouteFactories))
      .filter((candidate): candidate is StaticDjangoUrlPatternList => candidate !== null);
    const starletteApplicationImports = topLevelNodes.flatMap((node) =>
      staticStarletteApplicationImports(input, node)
    );
    const starletteRoutingImports = topLevelNodes.flatMap((node) =>
      staticStarletteRoutingImports(input, node)
    );
    const starletteApplicationConstructorNames = new Set(
      starletteApplicationImports
        .filter((candidate) => candidate.importedName === "Starlette")
        .map((candidate) => candidate.alias)
    );
    const starletteRouteFactoryNames = new Set(
      starletteRoutingImports
        .filter((candidate) => candidate.importedName === "Route")
        .map((candidate) => candidate.alias)
    );
    const starletteRouteLists = topLevelNodes
      .map((node) => staticStarletteRouteList(input, node, starletteRouteFactoryNames))
      .filter((candidate): candidate is StaticStarletteRouteList => candidate !== null);
    const starletteApplications = topLevelNodes
      .map((node) =>
        staticStarletteApplication(
          input,
          node,
          starletteApplicationConstructorNames,
          starletteRouteFactoryNames
        )
      )
      .filter((candidate): candidate is StarletteApplication => candidate !== null);
    const aioHttpImports = topLevelNodes.flatMap((node) => staticAioHttpImports(input, node));
    const aioHttpWebModuleNames = new Set(
      aioHttpImports
        .filter((candidate) => candidate.importedName === "web")
        .map((candidate) => candidate.alias)
    );
    const aioHttpApplications = topLevelNodes
      .map((node) => staticAioHttpApplication(input, node, aioHttpWebModuleNames))
      .filter((candidate): candidate is AioHttpApplication => candidate !== null);
    const aioHttpRouteRegistrations = topLevelNodes
      .map((node) => staticAioHttpRouteRegistration(input, node))
      .filter((candidate): candidate is StaticAioHttpRouteRegistration => candidate !== null);
    const aioHttpRouteLists = topLevelNodes
      .map((node) => staticAioHttpRouteList(input, node))
      .filter((candidate): candidate is StaticAioHttpRouteList => candidate !== null);
    const aioHttpRouteTableRegistrations = topLevelNodes
      .map((node) => staticAioHttpRouteTableRegistration(input, node))
      .filter((candidate): candidate is StaticAioHttpRouteTableRegistration => candidate !== null);
    const sanicImports = topLevelNodes.flatMap((node) => staticSanicImports(input, node));
    const sanicApplicationConstructorNames = new Set(
      sanicImports
        .filter((candidate) => candidate.importedName === "Sanic")
        .map((candidate) => candidate.alias)
    );
    const sanicBlueprintConstructorNames = new Set(
      sanicImports
        .filter((candidate) => candidate.importedName === "Blueprint")
        .map((candidate) => candidate.alias)
    );
    const sanicApplications = topLevelNodes
      .map((node) => staticSanicApplication(input, node, sanicApplicationConstructorNames))
      .filter((candidate): candidate is SanicApplication => candidate !== null);
    const sanicBlueprints = topLevelNodes
      .map((node) => staticSanicBlueprint(input, node, sanicBlueprintConstructorNames))
      .filter((candidate): candidate is SanicBlueprint => candidate !== null);
    const sanicBlueprintGroups = topLevelNodes
      .map((node) => staticSanicBlueprintGroup(input, node, sanicBlueprintConstructorNames))
      .filter((candidate): candidate is SanicBlueprintGroup => candidate !== null);
    const sanicBlueprintRegistrations = topLevelNodes
      .map((node) => staticSanicBlueprintRegistration(input, node))
      .filter((candidate): candidate is StaticSanicBlueprintRegistration => candidate !== null);
    const topLevelFunctions = topLevelNodes.flatMap((statement) => {
      const functionNode =
        decoratedDefinition(statement) ??
        (statement.name === "FunctionDefinition" ? statement : null);
      if (
        functionNode === null ||
        functionNode.name !== "FunctionDefinition" ||
        !isTopLevelFunction(functionNode)
      ) {
        return [];
      }
      const name = declarationName(input, functionNode);
      const symbol = symbolsByNodeKey.get(nodeKey(functionNode));
      return name === null || symbol?.kind !== "function" ? [] : [{ name, node: functionNode, symbol }];
    });
    const topLevelClasses = topLevelNodes.flatMap((statement) => {
      // A class decorator rebinds the class name to the decorator result. Keep
      // `Class.as_view()` exact only when that name remains a direct class binding.
      const classNode = statement.name === "ClassDefinition" ? statement : null;
      if (
        classNode === null ||
        classNode.name !== "ClassDefinition" ||
        !isTopLevelClass(classNode)
      ) {
        return [];
      }
      const name = declarationName(input, classNode);
      const symbol = symbolsByNodeKey.get(nodeKey(classNode));
      return name === null || symbol?.kind !== "class" ? [] : [{ name, node: classNode, symbol }];
    });
    const flaskRestfulResourceClasses = topLevelClasses
      .map((candidate) => staticFlaskRestfulResourceClass(input, candidate.node, candidate.symbol))
      .filter((candidate): candidate is FlaskRestfulResourceClass => candidate !== null);
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
    const finalDjangoNinjaRouters = djangoNinjaRouters.filter((router) => {
      const finalRouter = latestProvenFrameworkInstance(
        input,
        topLevelNodes,
        djangoNinjaImports,
        djangoNinjaRouters,
        router.name,
        input.sourceText.length,
        "Router"
      );
      return finalRouter !== null && nodeKey(finalRouter.node) === nodeKey(router.node);
    });
    const finalFlaskBlueprints = flaskBlueprints.filter((blueprint) => {
      const finalBlueprint = latestProvenFrameworkInstance(
        input,
        topLevelNodes,
        flaskImports,
        flaskBlueprints,
        blueprint.name,
        input.sourceText.length,
        "Blueprint"
      );
      return finalBlueprint !== null && nodeKey(finalBlueprint.node) === nodeKey(blueprint.node);
    });
    const finalSanicBlueprints = sanicBlueprints.filter((blueprint) => {
      const finalBlueprint = latestProvenFrameworkInstance(
        input,
        topLevelNodes,
        sanicImports,
        sanicBlueprints,
        blueprint.name,
        input.sourceText.length,
        "Blueprint"
      );
      return finalBlueprint !== null && nodeKey(finalBlueprint.node) === nodeKey(blueprint.node);
    });
    const finalSanicBlueprintGroups = sanicBlueprintGroups.filter((group) => {
      const finalGroup = latestProvenSanicBlueprintGroup(
        input,
        topLevelNodes,
        sanicImports,
        sanicBlueprintGroups,
        group.name,
        input.sourceText.length
      );
      return finalGroup !== null && nodeKey(finalGroup.node) === nodeKey(group.node);
    });
    const uniqueSanicBlueprintRegistrations = sanicBlueprintRegistrations.filter(
      (registration) =>
        sanicBlueprintRegistrations.filter(
          (candidate) =>
            candidate.applicationName === registration.applicationName &&
            candidate.blueprintName === registration.blueprintName
        ).length === 1
    );
    const provenSanicBlueprintRegistrations = uniqueSanicBlueprintRegistrations.flatMap(
      (registration): readonly ProvenSanicBlueprintRegistration[] => {
        const application = latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          sanicImports,
          sanicApplications,
          registration.applicationName,
          registration.node.from,
          "Sanic"
        );
        const blueprint = latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          sanicImports,
          sanicBlueprints,
          registration.blueprintName,
          registration.node.from,
          "Blueprint"
        );
        return application === null || blueprint === null ? [] : [{ registration, blueprint }];
      }
    );
    const provenSanicBlueprintGroupRegistrations = uniqueSanicBlueprintRegistrations.flatMap(
      (registration): readonly ProvenSanicBlueprintGroupRegistration[] => {
        const application = latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          sanicImports,
          sanicApplications,
          registration.applicationName,
          registration.node.from,
          "Sanic"
        );
        const group = latestProvenSanicBlueprintGroup(
          input,
          topLevelNodes,
          sanicImports,
          sanicBlueprintGroups,
          registration.blueprintName,
          registration.node.from
        );
        if (application === null || group === null) {
          return [];
        }
        const members = resolveSanicBlueprintGroupMembers(
          input,
          topLevelNodes,
          sanicImports,
          sanicBlueprints,
          sanicBlueprintGroups,
          group
        );
        return members === null ? [] : [{ registration, group, members }];
      }
    );
    for (const router of finalRouters) {
      fastApiRouterFacts.routers.push({
        name: router.name,
        prefix: router.prefix,
        range: rangeFor(lineStarts, router.node.from, router.node.to)
      });
    }
    for (const router of finalDjangoNinjaRouters) {
      djangoNinjaRouterFacts.routers.push({
        name: router.name,
        range: rangeFor(lineStarts, router.node.from, router.node.to)
      });
    }
    for (const blueprint of finalFlaskBlueprints) {
      flaskBlueprintFacts.blueprints.push({
        name: blueprint.name,
        prefix: blueprint.prefix,
        range: rangeFor(lineStarts, blueprint.node.from, blueprint.node.to)
      });
    }
    for (const blueprint of finalSanicBlueprints) {
      sanicBlueprintFacts.blueprints.push({
        name: blueprint.name,
        prefix: blueprint.prefix,
        range: rangeFor(lineStarts, blueprint.node.from, blueprint.node.to)
      });
    }
    for (const group of finalSanicBlueprintGroups) {
      const members = resolvedSanicBlueprintGroupMemberFacts({
        extraction: input,
        topLevelNodes,
        imports: sanicImports,
        relativeImports: relativeSanicBlueprintImports,
        blueprints: sanicBlueprints,
        groups: sanicBlueprintGroups,
        group
      });
      if (members === null) {
        continue;
      }
      sanicBlueprintFacts.groups.push({
        name: group.name,
        prefix: group.prefix,
        namePrefix: group.namePrefix,
        members,
        range: rangeFor(lineStarts, group.node.from, group.node.to)
      });
    }
    if (isPythonPackageInitializer(input.filePath)) {
      for (const imported of relativeDjangoUrlconfImports) {
        const finalImport = latestProvenDjangoRelativeUrlconfImportBinding(
          input,
          topLevelNodes,
          relativeDjangoUrlconfImports,
          imported.urlconfName,
          input.sourceText.length
        );
        if (finalImport === null || nodeKey(finalImport.node) !== nodeKey(imported.node)) {
          continue;
        }
        djangoUrlFacts.reExports.push({
          exportedName: imported.urlconfName,
          importedUrlconfName: imported.importedUrlconfName,
          moduleSpecifier: imported.moduleSpecifier,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to)
        });
      }

      for (const imported of fastApiRouterImports) {
        const finalImport = latestProvenFastApiRouterImportBinding(
          input,
          topLevelNodes,
          fastApiRouterImports,
          imported.routerName,
          input.sourceText.length
        );
        if (finalImport === null || nodeKey(finalImport.node) !== nodeKey(imported.node)) {
          continue;
        }
        fastApiRouterFacts.reExports.push({
          exportedName: imported.routerName,
          importedRouterName: imported.importedRouterName,
          moduleSpecifier: imported.moduleSpecifier,
          moduleSpecifierKind: imported.moduleSpecifierKind,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to)
        });
      }

      for (const imported of djangoNinjaRouterImports) {
        const finalImport = latestProvenDjangoNinjaRouterImportBinding(
          input,
          topLevelNodes,
          djangoNinjaRouterImports,
          imported.routerName,
          input.sourceText.length
        );
        if (finalImport === null || nodeKey(finalImport.node) !== nodeKey(imported.node)) {
          continue;
        }
        djangoNinjaRouterFacts.reExports.push({
          exportedName: imported.routerName,
          importedRouterName: imported.importedRouterName,
          moduleSpecifier: imported.moduleSpecifier,
          moduleSpecifierKind: imported.moduleSpecifierKind,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to)
        });
      }

      for (const imported of flaskBlueprintImports) {
        const finalImport = latestProvenFlaskBlueprintImportBinding(
          input,
          topLevelNodes,
          flaskBlueprintImports,
          imported.blueprintName,
          input.sourceText.length
        );
        if (finalImport === null || nodeKey(finalImport.node) !== nodeKey(imported.node)) {
          continue;
        }
        flaskBlueprintFacts.reExports.push({
          exportedName: imported.blueprintName,
          importedBlueprintName: imported.importedBlueprintName,
          moduleSpecifier: imported.moduleSpecifier,
          moduleSpecifierKind: imported.moduleSpecifierKind,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to)
        });
      }

      for (const imported of relativeSanicBlueprintImports) {
        const finalImport = latestProvenSanicRelativeBlueprintImportBinding(
          input,
          topLevelNodes,
          relativeSanicBlueprintImports,
          imported.blueprintName,
          input.sourceText.length
        );
        if (finalImport === null || nodeKey(finalImport.node) !== nodeKey(imported.node)) {
          continue;
        }
        sanicBlueprintFacts.reExports.push({
          exportedName: imported.blueprintName,
          importedName: imported.importedBlueprintName,
          moduleSpecifier: imported.moduleSpecifier,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to)
        });
      }
    }

    for (const application of starletteApplications) {
      if (
        hasTopLevelRebinding(
          input,
          topLevelNodes,
          application.name,
          application.node.to,
          input.sourceText.length
        )
      ) {
        continue;
      }
      const provenApplication = latestProvenFrameworkInstance(
        input,
        topLevelNodes,
        starletteApplicationImports,
        starletteApplications,
        application.name,
        application.node.to,
        "Starlette"
      );
      if (
        provenApplication === null ||
        nodeKey(provenApplication.node) !== nodeKey(application.node)
      ) {
        continue;
      }
      const routeList =
        application.inlineRoutes === null
          ? application.routeListName === null
            ? null
            : latestProvenStarletteRouteList(
                input,
                topLevelNodes,
                starletteRouteLists,
                application.routeListName,
                application.node.from
              )
          : null;
      const routes = application.inlineRoutes ?? routeList?.routes;
      if (routes === undefined) {
        continue;
      }
      for (const route of routes) {
        if (
          latestProvenStarletteRouteImport(
            input,
            topLevelNodes,
            starletteRoutingImports,
            route.factoryName,
            route.node.from
          ) === null
        ) {
          continue;
        }
        const handlers = topLevelFunctions.filter(
          (candidate) =>
            candidate.name === route.handlerName &&
            candidate.node.to <= route.node.from &&
            !hasTopLevelRebinding(
              input,
              topLevelNodes,
              candidate.name,
              candidate.node.to,
              route.node.from
            )
        );
        if (handlers.length !== 1) {
          continue;
        }
        const handler = handlers[0];
        if (handler === undefined) {
          continue;
        }
        for (const method of route.methods) {
          addPythonRoute(
            method,
            route.node,
            handler.symbol,
            route.path,
            "framework.starlette.direct-application.routes.local-function"
          );
        }
      }
    }

    for (const registration of aioHttpRouteRegistrations) {
      if (
        latestProvenAioHttpApplication(
          input,
          topLevelNodes,
          aioHttpImports,
          aioHttpApplications,
          registration.applicationName,
          registration.node.from
        ) === null
      ) {
        continue;
      }
      const handlers = topLevelFunctions.filter(
        (candidate) =>
          candidate.name === registration.handlerName &&
          candidate.node.to <= registration.node.from &&
          !hasTopLevelRebinding(
            input,
            topLevelNodes,
            candidate.name,
            candidate.node.to,
            registration.node.from
          )
      );
      if (handlers.length !== 1) {
        continue;
      }
      const handler = handlers[0];
      if (handler === undefined) {
        continue;
      }
      for (const method of registration.methods) {
        addPythonRoute(
          method,
          registration.node,
          handler.symbol,
          registration.path,
          "framework.aiohttp.direct-router.local-function"
        );
      }
    }

    for (const registration of aioHttpRouteTableRegistrations) {
      if (
        latestProvenAioHttpApplication(
          input,
          topLevelNodes,
          aioHttpImports,
          aioHttpApplications,
          registration.applicationName,
          registration.node.from
        ) === null
      ) {
        continue;
      }
      const routeList =
        registration.inlineRoutes === null
          ? registration.routeListName === null
            ? null
            : latestProvenAioHttpRouteList(
                input,
                topLevelNodes,
                aioHttpRouteLists,
                registration.routeListName,
                registration.node.from
              )
          : null;
      const routes = registration.inlineRoutes ?? routeList?.routes;
      if (routes === undefined) {
        continue;
      }
      for (const route of routes) {
        if (
          latestProvenAioHttpWebImport(
            input,
            topLevelNodes,
            aioHttpImports,
            route.webModuleName,
            route.node.from
          ) === null
        ) {
          continue;
        }
        const handlers = topLevelFunctions.filter(
          (candidate) =>
            candidate.name === route.handlerName &&
            candidate.node.to <= route.node.from &&
            !hasTopLevelRebinding(
              input,
              topLevelNodes,
              candidate.name,
              candidate.node.to,
              route.node.from
            )
        );
        if (handlers.length !== 1) {
          continue;
        }
        const handler = handlers[0];
        if (handler === undefined) {
          continue;
        }
        for (const method of route.methods) {
          addPythonRoute(
            method,
            route.node,
            handler.symbol,
            route.path,
            "framework.aiohttp.direct-router.add-routes.local-function"
          );
        }
      }
    }

    for (const patterns of djangoUrlPatternLists) {
      if (
        hasTopLevelRebinding(
          input,
          topLevelNodes,
          "urlpatterns",
          patterns.node.to,
          input.sourceText.length
        )
      ) {
        continue;
      }
      djangoUrlFacts.hasUrlpatterns = true;
      for (const route of patterns.routes) {
        if (
          latestProvenDjangoRouteImport(
            input,
            topLevelNodes,
            djangoUrlImports,
            route.factoryName,
            route.factory,
            patterns.node.from
          ) === null
        ) {
          continue;
        }
        const handlerCandidates =
          route.handlerKind === "function" ? topLevelFunctions : topLevelClasses;
        const handlers = handlerCandidates.filter(
          (candidate) =>
            candidate.name === route.handlerName &&
            candidate.node.to <= patterns.node.from &&
            !hasTopLevelRebinding(
              input,
              topLevelNodes,
              candidate.name,
              candidate.node.to,
              patterns.node.from
            )
        );
        if (handlers.length !== 1) {
          continue;
        }
        const handler = handlers[0];
        if (handler === undefined) {
          continue;
        }
        addPythonRoute(
          "ALL",
          route.node,
          handler.symbol,
          route.path,
          djangoDirectUrlPatternRuleId(route.factory, route.handlerKind)
        );
        djangoUrlFacts.routes.push({
          path: route.path,
          handlerId: handler.symbol.id,
          handlerKind: route.handlerKind,
          range: rangeFor(lineStarts, route.node.from, route.node.to)
        });
      }

      for (const inclusion of patterns.importedUrlconfInclusions) {
        if (
          latestProvenDjangoRouteImport(
            input,
            topLevelNodes,
            djangoUrlImports,
            inclusion.factoryName,
            inclusion.factory,
            patterns.node.from
          ) === null ||
          latestProvenDjangoIncludeImport(
            input,
            topLevelNodes,
            djangoUrlImports,
            inclusion.includeFactoryName,
            patterns.node.from
          ) === null
        ) {
          continue;
        }
        const importedUrlconf = latestProvenDjangoRelativeUrlconfImport(
          input,
          topLevelNodes,
          relativeDjangoUrlconfImports,
          inclusion
        );
        if (importedUrlconf === null) {
          continue;
        }
        djangoUrlFacts.importedUrlconfInclusions.push({
          factory: inclusion.factory,
          urlconfName: importedUrlconf.urlconfName,
          importedUrlconfName: importedUrlconf.importedUrlconfName,
          moduleSpecifier: importedUrlconf.moduleSpecifier,
          prefix: inclusion.path,
          range: rangeFor(lineStarts, inclusion.node.from, inclusion.node.to)
        });
      }

      for (const inclusion of patterns.literalUrlconfInclusions) {
        if (
          latestProvenDjangoRouteImport(
            input,
            topLevelNodes,
            djangoUrlImports,
            inclusion.factoryName,
            inclusion.factory,
            patterns.node.from
          ) === null ||
          latestProvenDjangoIncludeImport(
            input,
            topLevelNodes,
            djangoUrlImports,
            inclusion.includeFactoryName,
            patterns.node.from
          ) === null
        ) {
          continue;
        }
        djangoUrlFacts.literalUrlconfInclusions.push({
          factory: inclusion.factory,
          moduleSpecifier: inclusion.moduleSpecifier,
          prefix: inclusion.path,
          range: rangeFor(lineStarts, inclusion.node.from, inclusion.node.to)
        });
      }
    }

    for (const inclusion of djangoNinjaRouterInclusions) {
      if (
        latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          djangoNinjaImports,
          djangoNinjaApplications,
          inclusion.applicationName,
          inclusion.node.from,
          "NinjaAPI"
        ) === null
      ) {
        continue;
      }
      const importedRouter = latestProvenDjangoNinjaRouterImport(
        input,
        topLevelNodes,
        djangoNinjaRouterImports,
        inclusion
      );
      if (importedRouter === null) {
        continue;
      }
      djangoNinjaRouterFacts.importedRouterInclusions.push({
        applicationName: inclusion.applicationName,
        routerName: importedRouter.routerName,
        importedRouterName: importedRouter.importedRouterName,
        moduleSpecifier: importedRouter.moduleSpecifier,
        moduleSpecifierKind: importedRouter.moduleSpecifierKind,
        prefix: inclusion.prefix,
        range: rangeFor(lineStarts, inclusion.node.from, inclusion.node.to)
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
      const importedRouter = latestProvenFastApiRouterImport(
        input,
        topLevelNodes,
        fastApiRouterImports,
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
        moduleSpecifierKind: importedRouter.moduleSpecifierKind,
        prefix: inclusion.prefix,
        range: rangeFor(lineStarts, inclusion.node.from, inclusion.node.to)
      });
    }

    for (const registration of flaskBlueprintRegistrations) {
      if (
        latestProvenFlaskApplication(
          input,
          topLevelNodes,
          flaskImports,
          flaskApplications,
          registration.applicationName,
          registration.node.from
        ) === null
      ) {
        continue;
      }
      const importedBlueprint = latestProvenFlaskBlueprintImport(
        input,
        topLevelNodes,
        flaskBlueprintImports,
        registration
      );
      if (importedBlueprint === null) {
        continue;
      }
      flaskBlueprintFacts.importedBlueprintRegistrations.push({
        applicationName: registration.applicationName,
        blueprintName: importedBlueprint.blueprintName,
        importedBlueprintName: importedBlueprint.importedBlueprintName,
        moduleSpecifier: importedBlueprint.moduleSpecifier,
        moduleSpecifierKind: importedBlueprint.moduleSpecifierKind,
        prefix: registration.prefix,
        range: rangeFor(lineStarts, registration.node.from, registration.node.to)
      });
    }

    for (const registration of sanicBlueprintRegistrations) {
      if (
        latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          sanicImports,
          sanicApplications,
          registration.applicationName,
          registration.node.from,
          "Sanic"
        ) === null
      ) {
        continue;
      }
      const importedBlueprint = latestProvenSanicRelativeBlueprintImport(
        input,
        topLevelNodes,
        relativeSanicBlueprintImports,
        registration
      );
      if (importedBlueprint === null) {
        continue;
      }
      sanicBlueprintFacts.importedBlueprintRegistrations.push({
        applicationName: registration.applicationName,
        blueprintName: importedBlueprint.blueprintName,
        importedBlueprintName: importedBlueprint.importedBlueprintName,
        moduleSpecifier: importedBlueprint.moduleSpecifier,
        prefix: registration.prefix,
        range: rangeFor(lineStarts, registration.node.from, registration.node.to)
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

        const djangoNinjaDecorator = staticDjangoNinjaDecorator(input, decoratorNode);
        if (
          djangoNinjaDecorator !== null &&
          latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            djangoNinjaImports,
            djangoNinjaApplications,
            djangoNinjaDecorator.receiver,
            djangoNinjaDecorator.node.from,
            "NinjaAPI"
          ) !== null
        ) {
          addPythonRoute(
            djangoNinjaDecorator.method,
            djangoNinjaDecorator.node,
            handler,
            djangoNinjaDecorator.path,
            "framework.django-ninja.direct-app.decorator.local-function"
          );
        }
        if (djangoNinjaDecorator !== null) {
          const routerAtDecorator = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            djangoNinjaImports,
            djangoNinjaRouters,
            djangoNinjaDecorator.receiver,
            djangoNinjaDecorator.node.from,
            "Router"
          );
          const finalRouter = finalDjangoNinjaRouters.find(
            (router) => routerAtDecorator !== null && nodeKey(router.node) === nodeKey(routerAtDecorator.node)
          );
          if (finalRouter !== undefined) {
            djangoNinjaRouterFacts.routes.push({
              routerName: finalRouter.name,
              method: djangoNinjaDecorator.method,
              path: djangoNinjaDecorator.path,
              source: "decorator",
              handlerId: handler.id,
              range: rangeFor(lineStarts, djangoNinjaDecorator.node.from, djangoNinjaDecorator.node.to)
            });
          }
          for (const inclusion of djangoNinjaRouterInclusions) {
            if (routerAtDecorator === null || djangoNinjaDecorator.receiver !== inclusion.routerName) {
              continue;
            }
            const routerAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              djangoNinjaImports,
              djangoNinjaRouters,
              inclusion.routerName,
              inclusion.node.from,
              "Router"
            );
            const applicationAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              djangoNinjaImports,
              djangoNinjaApplications,
              inclusion.applicationName,
              inclusion.node.from,
              "NinjaAPI"
            );
            if (
              routerAtInclusion === null ||
              applicationAtInclusion === null ||
              nodeKey(routerAtDecorator.node) !== nodeKey(routerAtInclusion.node)
            ) {
              continue;
            }
            addPythonRoute(
              djangoNinjaDecorator.method,
              djangoNinjaDecorator.node,
              handler,
              combinedRoutePath(inclusion.prefix, djangoNinjaDecorator.path),
              "framework.django-ninja.direct-router.add-router.decorator.local-function"
            );
          }
        }

        const djangoNinjaApiOperation = staticDjangoNinjaApiOperationDecorator(input, decoratorNode);
        if (
          djangoNinjaApiOperation !== null &&
          latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            djangoNinjaImports,
            djangoNinjaApplications,
            djangoNinjaApiOperation.receiver,
            djangoNinjaApiOperation.node.from,
            "NinjaAPI"
          ) !== null
        ) {
          for (const method of djangoNinjaApiOperation.methods) {
            addPythonRoute(
              method,
              djangoNinjaApiOperation.node,
              handler,
              djangoNinjaApiOperation.path,
              "framework.django-ninja.direct-app.api-operation.local-function"
            );
          }
        }
        if (djangoNinjaApiOperation !== null) {
          const routerAtDecorator = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            djangoNinjaImports,
            djangoNinjaRouters,
            djangoNinjaApiOperation.receiver,
            djangoNinjaApiOperation.node.from,
            "Router"
          );
          const finalRouter = finalDjangoNinjaRouters.find(
            (router) => routerAtDecorator !== null && nodeKey(router.node) === nodeKey(routerAtDecorator.node)
          );
          if (finalRouter !== undefined) {
            for (const method of djangoNinjaApiOperation.methods) {
              djangoNinjaRouterFacts.routes.push({
                routerName: finalRouter.name,
                method,
                path: djangoNinjaApiOperation.path,
                source: "api-operation",
                handlerId: handler.id,
                range: rangeFor(lineStarts, djangoNinjaApiOperation.node.from, djangoNinjaApiOperation.node.to)
              });
            }
          }
          for (const inclusion of djangoNinjaRouterInclusions) {
            if (routerAtDecorator === null || djangoNinjaApiOperation.receiver !== inclusion.routerName) {
              continue;
            }
            const routerAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              djangoNinjaImports,
              djangoNinjaRouters,
              inclusion.routerName,
              inclusion.node.from,
              "Router"
            );
            const applicationAtInclusion = latestProvenFrameworkInstance(
              input,
              topLevelNodes,
              djangoNinjaImports,
              djangoNinjaApplications,
              inclusion.applicationName,
              inclusion.node.from,
              "NinjaAPI"
            );
            if (
              routerAtInclusion === null ||
              applicationAtInclusion === null ||
              nodeKey(routerAtDecorator.node) !== nodeKey(routerAtInclusion.node)
            ) {
              continue;
            }
            for (const method of djangoNinjaApiOperation.methods) {
              addPythonRoute(
                method,
                djangoNinjaApiOperation.node,
                handler,
                combinedRoutePath(inclusion.prefix, djangoNinjaApiOperation.path),
                "framework.django-ninja.direct-router.add-router.api-operation.local-function"
              );
            }
          }
        }

        const sanicDecorator = staticSanicDecorator(input, decoratorNode);
        if (
          sanicDecorator !== null &&
          latestProvenSanicApplication(
            input,
            topLevelNodes,
            sanicImports,
            sanicApplications,
            sanicDecorator
          ) !== null
        ) {
          for (const method of sanicDecorator.methods) {
            addPythonRoute(
              method,
              sanicDecorator.node,
              handler,
              sanicDecorator.path,
              "framework.sanic.direct-app.decorator.local-function"
            );
          }
        }
        if (sanicDecorator !== null) {
          const blueprintAtDecorator = latestProvenFrameworkInstance(
            input,
            topLevelNodes,
            sanicImports,
            sanicBlueprints,
            sanicDecorator.receiver,
            sanicDecorator.node.from,
            "Blueprint"
          );
          if (blueprintAtDecorator !== null) {
            const finalBlueprint = finalSanicBlueprints.find(
              (blueprint) => nodeKey(blueprint.node) === nodeKey(blueprintAtDecorator.node)
            );
            if (finalBlueprint !== undefined) {
              for (const method of sanicDecorator.methods) {
                sanicBlueprintFacts.routes.push({
                  blueprintName: finalBlueprint.name,
                  method,
                  path: sanicDecorator.path,
                  handlerId: handler.id,
                  range: rangeFor(lineStarts, sanicDecorator.node.from, sanicDecorator.node.to)
                });
              }
            }
            for (const provenRegistration of provenSanicBlueprintRegistrations) {
              const { registration, blueprint } = provenRegistration;
              if (nodeKey(blueprintAtDecorator.node) !== nodeKey(blueprint.node)) {
                continue;
              }
              const directMounts = provenSanicBlueprintRegistrations.filter(
                (candidate) =>
                  candidate.registration.applicationName === registration.applicationName &&
                  nodeKey(candidate.blueprint.node) === nodeKey(blueprint.node)
              );
              const groupMounts = resolvedSanicBlueprintGroupMounts(
                provenSanicBlueprintGroupRegistrations,
                registration.applicationName,
                blueprint
              );
              if (directMounts.length !== 1 || groupMounts.length !== 0) {
                continue;
              }
              for (const method of sanicDecorator.methods) {
                addPythonRoute(
                  method,
                  sanicDecorator.node,
                  handler,
                  combinedRoutePath(
                    registration.prefix,
                    blueprint.prefix,
                    sanicDecorator.path
                  ),
                  "framework.sanic.direct-blueprint.app-blueprint.decorator.local-function"
                );
              }
            }
            for (const groupRegistration of provenSanicBlueprintGroupRegistrations) {
              const { registration, members } = groupRegistration;
              const groupMember = members.find(
                (member) => nodeKey(member.blueprint.node) === nodeKey(blueprintAtDecorator.node)
              );
              if (groupMember === undefined) {
                continue;
              }
              const directMounts = provenSanicBlueprintRegistrations.filter(
                (candidate) =>
                  candidate.registration.applicationName === registration.applicationName &&
                  nodeKey(candidate.blueprint.node) === nodeKey(blueprintAtDecorator.node)
              );
              const groupMounts = resolvedSanicBlueprintGroupMounts(
                provenSanicBlueprintGroupRegistrations,
                registration.applicationName,
                blueprintAtDecorator
              );
              const repeatedMount = directMounts.length + groupMounts.length > 1;
              if (repeatedMount && !hasDistinctLiteralSanicGroupNamePrefixes(groupMounts)) {
                continue;
              }
              const ruleId =
                repeatedMount
                  ? "framework.sanic.named-blueprint-group.app-blueprint.decorator.local-function"
                  : groupMember.groupDepth === 1
                  ? "framework.sanic.direct-blueprint-group.app-blueprint.decorator.local-function"
                  : "framework.sanic.direct-nested-blueprint-group.app-blueprint.decorator.local-function";
              for (const method of sanicDecorator.methods) {
                addPythonRoute(
                  method,
                  sanicDecorator.node,
                  handler,
                  combinedRoutePath(
                    registration.prefix,
                    ...groupMember.prefixes,
                    sanicDecorator.path
                  ),
                  ruleId
                );
              }
            }
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

        const blueprintAtFlaskDecorator = latestProvenFrameworkInstance(
          input,
          topLevelNodes,
          flaskImports,
          flaskBlueprints,
          flaskDecorator.receiver,
          flaskDecorator.node.from,
          "Blueprint"
        );
        const finalBlueprint = finalFlaskBlueprints.find(
          (blueprint) =>
            blueprintAtFlaskDecorator !== null &&
            nodeKey(blueprint.node) === nodeKey(blueprintAtFlaskDecorator.node)
        );
        if (finalBlueprint !== undefined) {
          for (const method of flaskDecorator.methods) {
            flaskBlueprintFacts.routes.push({
              blueprintName: finalBlueprint.name,
              method,
              path: flaskDecorator.path,
              handlerId: handler.id,
              range: rangeFor(lineStarts, flaskDecorator.node.from, flaskDecorator.node.to)
            });
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

    for (const registration of flaskRestfulResourceRegistrations) {
      if (
        latestProvenFlaskRestfulApi(
          input,
          topLevelNodes,
          flaskImports,
          flaskApplications,
          flaskRestfulImports,
          flaskRestfulApis,
          registration.apiName,
          registration.node.from
        ) === null
      ) {
        continue;
      }
      const resource = latestProvenFlaskRestfulResourceClass(
        input,
        topLevelNodes,
        flaskRestfulImports,
        flaskRestfulResourceClasses,
        registration.resourceClassName,
        registration.node.from
      );
      if (resource === null) {
        continue;
      }
      for (const resourceMethod of directFlaskRestfulResourceMethods(input, resource, symbolsByNodeKey)) {
        if (
          hasTopLevelMemberRebinding(
            input,
            topLevelNodes,
            resource.name,
            resourceMethod.handler.name,
            resource.node.to,
            registration.node.from
          )
        ) {
          continue;
        }
        for (const path of registration.paths) {
          addPythonRoute(
            resourceMethod.method,
            registration.node,
            resourceMethod.handler,
            path,
            "framework.flask-restful.direct-api.add-resource.resource-method"
          );
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
    fastApiRouterFacts,
    djangoNinjaRouterFacts,
    flaskBlueprintFacts,
    sanicBlueprintFacts,
    djangoUrlFacts,
    pythonFacts: {
      ...pythonFacts,
      ...(artifactCallTaint.globalTaintedNames.size === 0
        ? {}
        : { artifactGlobalTaintedNames: [...artifactCallTaint.globalTaintedNames].sort() }),
      ...(artifactCallTaint.dynamicGlobalHazard ? { dynamicGlobalHazard: true as const } : {})
    }
  };
}

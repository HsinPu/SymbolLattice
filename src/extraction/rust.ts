import { parser } from "@lezer/rust";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type RustActixServiceConfigFacts,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface RustExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "rust";
  /** Optional diagnostics hook; invoked exactly once for each direct-call caller body traversal. */
  readonly directCallTraversalObserver?: () => void;
}

type RustSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticRustFunction {
  readonly name: string;
  readonly node: RustSyntaxNode;
  readonly body: RustSyntaxNode;
  readonly parameters: readonly RustSyntaxNode[];
  readonly parameterNames: readonly string[];
  readonly attributes: readonly RustSyntaxNode[];
}

interface StaticRustUseImport {
  readonly path: string;
  readonly localName: string;
}

interface StaticRustRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  /** Whether handler lexical proof belongs to the outer builder or a ServiceConfig callback. */
  readonly handlerScope?: "builder" | "service-config";
  readonly node: RustSyntaxNode;
  readonly ruleId: string;
}

interface StaticRustAttributeRouteImport {
  readonly method: RouteMethod;
  readonly ruleId: string;
}

interface StaticActixWebResourceChain {
  readonly path: string;
  readonly routes: readonly StaticRustRoute[];
}

interface StaticActixWebRouteProjection {
  readonly routes: readonly StaticRustRoute[];
  readonly mountedAttributeHandlers: readonly string[];
}

interface StaticActixWebScopeChain extends StaticActixWebRouteProjection {
  readonly prefix: string;
}

interface StaticActixWebAppChain extends StaticActixWebRouteProjection {}

interface StaticActixWebServiceConfig {
  readonly name: string;
  readonly node: RustSyntaxNode;
  readonly parameterName: string;
  readonly parameterNames: readonly string[];
  readonly body: RustSyntaxNode;
}

interface StaticActixWebRouteContext {
  readonly webAliases: ReadonlySet<string>;
  readonly attributeRoutesByHandler: ReadonlyMap<string, readonly StaticRustRoute[]>;
  readonly serviceConfigsByName: ReadonlyMap<string, StaticActixWebServiceConfig>;
}

interface StaticActixWebAttributeService {
  readonly handlerName: string;
  readonly routes: readonly StaticRustRoute[];
}

interface StaticRustExternalModule {
  readonly name: string;
  readonly node: RustSyntaxNode;
}

interface StaticRustProjectEnum {
  readonly name: string;
  readonly node: RustSyntaxNode;
}

interface StaticRustAttributedItem {
  readonly node: RustSyntaxNode;
  readonly attributes: readonly RustSyntaxNode[];
}

interface StaticActixWebImportedServiceConfig {
  readonly configurationName: string;
  /** The root direct external module, retained for persisted-fact compatibility. */
  readonly moduleName: string;
  readonly modulePath: readonly string[];
  readonly importRoot: "crate" | "self" | "workspace";
  readonly workspaceCrateName?: string;
}

interface StaticActixWebImportedConfigMount {
  readonly configurationName: string;
  readonly moduleName: string;
  readonly modulePath: readonly string[];
  readonly importRoot: "crate" | "self" | "workspace";
  readonly workspaceCrateName?: string;
  readonly prefix: string;
  readonly kind: "app" | "scope";
  readonly node: RustSyntaxNode;
}

interface StaticActixWebImportedConfigScopeChain {
  readonly prefix: string;
  readonly importedMounts: readonly StaticActixWebImportedConfigMount[];
}

const AXUM_ROUTER_PATH = "axum::Router";
const ACTIX_WEB_APP_PATH = "actix_web::App";
const ACTIX_WEB_WEB_PATH = "actix_web::web";
const AXUM_ROUTE_RULE_ID = "framework.axum.direct-router.route.local-function";
const ACTIX_WEB_ATTRIBUTE_ROUTE_RULE_ID =
  "framework.actix-web.attribute-route.literal-path.local-function";
const ACTIX_WEB_APP_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.route.literal-path.local-function";
const ACTIX_WEB_RESOURCE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.web-resource.literal-path.local-function";
const ACTIX_WEB_SCOPE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.web-scope.literal-path.local-function";
const ACTIX_WEB_APP_ATTRIBUTE_SERVICE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.attribute-service.literal-path.local-function";
const ACTIX_WEB_SCOPE_ATTRIBUTE_SERVICE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.web-scope.attribute-service.literal-path.local-function";
const ACTIX_WEB_APP_CONFIGURE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.configure.service-config.literal-path.local-function";
const ACTIX_WEB_SCOPE_CONFIGURE_ROUTE_RULE_ID =
  "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function";
const ACTIX_WEB_SERVICE_CONFIG_DECLARATION_RULE_ID =
  "framework.actix-web.service-config.declaration.literal-path.local-function";
const ROCKET_ATTRIBUTE_ROUTE_RULE_ID =
  "framework.rocket.attribute-route.literal-path.local-function";

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

const RUST_ATTRIBUTE_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS"
};

const ACTIX_WEB_BUILDER_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD"
};

const RUST_ATTRIBUTE_ROUTE_IMPORTS = [
  {
    prefix: "actix_web::",
    ruleId: ACTIX_WEB_ATTRIBUTE_ROUTE_RULE_ID
  },
  {
    prefix: "rocket::",
    ruleId: ROCKET_ATTRIBUTE_ROUTE_RULE_ID
  }
] as const;

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

function staticTopLevelUseImports(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode
): readonly StaticRustUseImport[] {
  return directChildren(root)
    .filter((node) => node.name === "UseDeclaration")
    .flatMap((node) => {
      const target = directUseImportTarget(node);
      return target === null ? [] : staticUseImports(input, target);
    });
}

function hasRustWildcardImport(root: RustSyntaxNode): boolean {
  return root.name === "UseWildcard" || directChildren(root).some(hasRustWildcardImport);
}

function hasRustGlobImport(root: RustSyntaxNode): boolean {
  return directChildren(root)
    .filter((node) => node.name === "UseDeclaration")
    .some(hasRustWildcardImport);
}

function staticRustExternalModules(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode
): readonly StaticRustExternalModule[] {
  return directChildren(root).flatMap((node) => {
    if (node.name !== "ModItem") {
      return [];
    }
    const children = directChildren(node);
    const modIndex = children.findIndex((child) => child.name === "mod");
    const nameNode = modIndex < 0 ? undefined : children[modIndex + 1];
    const name = nameNode === undefined ? null : identifierText(input, nameNode);
    const isExternal = children.some((child) => child.name === ";") &&
      !children.some((child) => child.name === "Block");
    return name === null || !isExternal ? [] : [{ name, node }];
  });
}

function hasRustConditionalAttribute(
  input: RustExtractFileFactsInput,
  attributes: readonly RustSyntaxNode[]
): boolean {
  return attributes.some((attribute) => /^#\[\s*cfg(?:_attr)?\b/u.test(nodeText(input, attribute)));
}

function hasRustConditionalInnerAttribute(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode
): boolean {
  return directChildren(root).some(
    (node) =>
      node.name === "InnerAttribute" &&
      /^#!\[\s*cfg(?:_attr)?\b/u.test(nodeText(input, node))
  );
}

function hasRustProjectFactAttributeAmbiguity(
  input: RustExtractFileFactsInput,
  attributes: readonly RustSyntaxNode[]
): boolean {
  return attributes.some((attribute) =>
    /^#\[\s*(?:cfg(?:_attr)?|path)\b/u.test(nodeText(input, attribute))
  );
}

function hasRustPathAttribute(
  input: RustExtractFileFactsInput,
  attributes: readonly RustSyntaxNode[]
): boolean {
  return attributes.some((attribute) => /^#\[\s*path\b/u.test(nodeText(input, attribute)));
}

function directRustAttributedItem(
  node: RustSyntaxNode,
  itemName: string
): StaticRustAttributedItem | null {
  if (node.name === itemName) {
    return { node, attributes: [] };
  }
  if (node.name !== "AttributeItem") {
    return null;
  }
  const children = directChildren(node);
  const items = children.filter((child) => child.name === itemName);
  const item = items[0];
  return items.length !== 1 || item === undefined
    ? null
    : {
        node: item,
        attributes: children.filter((child) => child.name === "Attribute")
      };
}

function staticRustAttributedItem(
  node: RustSyntaxNode,
  itemName: string
): StaticRustAttributedItem | null {
  const attributed = directRustAttributedItem(node, itemName);
  return attributed === null || hasSyntaxError(node) ? null : attributed;
}

function directRustProjectItemName(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  itemName: "EnumItem" | "FunctionItem" | "ModItem",
  keyword: "enum" | "fn" | "mod",
  identifierName: "TypeIdentifier" | "BoundIdentifier"
): string | null {
  const attributed = directRustAttributedItem(node, itemName);
  if (attributed === null) {
    return null;
  }
  const children = directChildren(attributed.node);
  const keywordIndex = children.findIndex((child) => child.name === keyword);
  const nameNode = children.slice(keywordIndex + 1).find((child) => child.name === identifierName);
  return keywordIndex < 0 || nameNode === undefined ? null : identifierText(input, nameNode);
}

function directRustProjectImportKey(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): string | null {
  const attributed = directRustAttributedItem(node, "UseDeclaration");
  if (attributed === null) {
    return null;
  }
  const match = /^use\s+(crate(?:::[A-Za-z_][A-Za-z0-9_]*){2,})\s*;?$/u.exec(
    nodeText(input, attributed.node)
  );
  return match?.[1] ?? null;
}

function occurrenceCount(values: readonly string[], value: string): number {
  return values.filter((candidate) => candidate === value).length;
}

function isSafeRustProjectModuleCandidate(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): boolean {
  const attributed = directRustAttributedItem(node, "ModItem");
  if (
    attributed === null ||
    hasSyntaxError(node) ||
    hasRustPathAttribute(input, attributed.attributes) ||
    directRustProjectItemName(input, node, "ModItem", "mod", "BoundIdentifier") === null
  ) {
    return false;
  }
  const children = directChildren(attributed.node);
  const isExternal = children.some((child) => child.name === ";") &&
    !children.some((child) => child.name === "DeclarationList");
  const isInline = children.some((child) => child.name === "DeclarationList") &&
    !children.some((child) => child.name === ";");
  return isExternal || isInline;
}

function isSafeRustProjectImportCandidate(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  acceptedLocalNames: readonly string[]
): boolean {
  const attributed = directRustAttributedItem(node, "UseDeclaration");
  if (
    attributed === null ||
    hasSyntaxError(node) ||
    hasRustPathAttribute(input, attributed.attributes)
  ) {
    return false;
  }
  if (staticRustProjectImport(input, node) !== null) {
    return true;
  }
  const text = nodeText(input, attributed.node);
  const target = directUseImportTarget(attributed.node);
  if (target === null) {
    return false;
  }
  if (text.includes("*")) {
    return acceptedLocalNames.length === 0;
  }
  const imports = staticUseImports(input, target);
  if (imports.length === 0 || imports.some((imported) => acceptedLocalNames.includes(imported.localName))) {
    return false;
  }
  if (text.includes("{") || /\bas\b/u.test(text)) {
    return true;
  }
  const simplePath = /^use\s+([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)+)\s*;$/u.exec(text);
  return simplePath?.[1]?.split("::")[0] !== "crate";
}

function hasAmbiguousRustProjectItem(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode
): boolean {
  return directChildren(root).some((node) => {
    if (node.name !== "AttributeItem") {
      return false;
    }
    const children = directChildren(node);
    const isProjectItem = children.some((child) =>
      ["ModItem", "UseDeclaration", "EnumItem"].includes(child.name)
    );
    return (
      isProjectItem &&
      hasRustProjectFactAttributeAmbiguity(
        input,
        children.filter((child) => child.name === "Attribute")
      )
    );
  });
}

function staticRustProjectModule(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): StaticRustExternalModule | null {
  const attributed = staticRustAttributedItem(node, "ModItem");
  if (
    attributed === null ||
    hasRustProjectFactAttributeAmbiguity(input, attributed.attributes)
  ) {
    return null;
  }
  const children = directChildren(attributed.node);
  const modIndex = children.findIndex((child) => child.name === "mod");
  const nameNode = modIndex < 0 ? undefined : children[modIndex + 1];
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  const isExternal = children.some((child) => child.name === ";") &&
    !children.some((child) => child.name === "Block");
  return name === null || !isExternal ? null : { name, node: attributed.node };
}

function staticRustProjectImport(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): { readonly modulePath: readonly string[]; readonly importedName: string; readonly node: RustSyntaxNode } | null {
  const attributed = staticRustAttributedItem(node, "UseDeclaration");
  if (
    attributed === null ||
    hasRustProjectFactAttributeAmbiguity(input, attributed.attributes)
  ) {
    return null;
  }
  const target = directUseImportTarget(attributed.node);
  const segments = target === null ? null : staticPathSegments(input, target);
  if (
    segments === null ||
    segments.length < 3 ||
    segments[0] !== "crate" ||
    !/^use\s+crate(?:::[A-Za-z_][A-Za-z0-9_]*)+\s*;$/u.test(
      nodeText(input, attributed.node)
    )
  ) {
    return null;
  }
  const importedName = segments.at(-1);
  const modulePath = segments.slice(1, -1);
  return importedName === undefined || modulePath.length === 0
    ? null
    : { modulePath, importedName, node: attributed.node };
}

function staticRustProjectEnum(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode
): StaticRustProjectEnum | null {
  const attributed = staticRustAttributedItem(node, "EnumItem");
  if (
    attributed === null ||
    hasRustProjectFactAttributeAmbiguity(input, attributed.attributes)
  ) {
    return null;
  }
  const children = directChildren(attributed.node);
  const enumIndex = children.findIndex((child) => child.name === "enum");
  const nameNode = enumIndex < 0 ? undefined : children[enumIndex + 1];
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  const isPublic = children.some((child) => child.name === "Vis" && nodeText(input, child) === "pub");
  return name === null || !isPublic ? null : { name, node: attributed.node };
}

function isRustProjectSourceFile(filePath: string): boolean {
  const pathSegments = filePath.split(/[\\/]/u).filter((segment) => segment.length > 0);
  return !pathSegments.some(
    (segment) =>
      segment === "test" ||
      segment === "tests" ||
      segment === "target" ||
      segment === "generated" ||
      segment.startsWith("_") ||
      segment.startsWith(".")
  );
}

function isRustCrateRoot(filePath: string): boolean {
  const fileName = filePath.split(/[\\/]/u).at(-1);
  return fileName === "lib.rs" || fileName === "main.rs";
}

function staticActixWebImportedServiceConfigs(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode,
  externalModules: readonly StaticRustExternalModule[]
): ReadonlyMap<string, StaticActixWebImportedServiceConfig> {
  const modulesByName = new Map<string, number>();
  for (const module of externalModules) {
    modulesByName.set(module.name, (modulesByName.get(module.name) ?? 0) + 1);
  }
  const imports = staticTopLevelUseImports(input, root);
  const pathsByLocalName = new Map<string, string[]>();
  for (const imported of imports) {
    const paths = pathsByLocalName.get(imported.localName) ?? [];
    paths.push(imported.path);
    pathsByLocalName.set(imported.localName, paths);
  }
  const importedConfigs = new Map<string, StaticActixWebImportedServiceConfig>();
  for (const imported of imports) {
    const paths = pathsByLocalName.get(imported.localName) ?? [];
    const segments = imported.path.split("::");
    const rootName = segments[0];
    const modulePath = segments.slice(1, -1);
    const moduleName = modulePath[0];
    const configurationName = segments.at(-1);
    const importRoot =
      rootName === "crate" || rootName === "self"
        ? rootName
        : rootName === undefined || rootName === "super" || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(rootName)
          ? null
          : "workspace";
    if (
      paths.length !== 1 ||
      paths[0] !== imported.path ||
      importRoot === null ||
      (modulePath.length !== 1 && modulePath.length !== 2) ||
      moduleName === undefined ||
      configurationName === undefined ||
      modulePath.some((segment) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment)) ||
      (importRoot !== "workspace" && modulesByName.get(moduleName) !== 1)
    ) {
      continue;
    }
    importedConfigs.set(imported.localName, {
      configurationName,
      moduleName,
      modulePath,
      importRoot,
      ...(importRoot === "workspace" ? { workspaceCrateName: rootName } : {})
    });
  }
  return importedConfigs;
}

function staticAxumImportAliases(input: RustExtractFileFactsInput, root: RustSyntaxNode): {
  readonly routerAliases: ReadonlySet<string>;
  readonly methodAliases: ReadonlyMap<string, RouteMethod>;
} {
  const imports = staticTopLevelUseImports(input, root);
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

function staticRustAttributeRouteAliases(
  input: RustExtractFileFactsInput,
  root: RustSyntaxNode
): ReadonlyMap<string, StaticRustAttributeRouteImport> {
  const imports = staticTopLevelUseImports(input, root);
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
  const aliases = new Map<string, StaticRustAttributeRouteImport>();
  for (const imported of imports) {
    const methodName = imported.path.split("::").at(-1);
    const method = methodName === undefined ? undefined : RUST_ATTRIBUTE_ROUTE_METHODS[methodName];
    const framework = RUST_ATTRIBUTE_ROUTE_IMPORTS.find(
      (candidate) => methodName !== undefined && imported.path === `${candidate.prefix}${methodName}`
    );
    if (method !== undefined && framework !== undefined && isUnambiguous(imported)) {
      aliases.set(imported.localName, { method, ruleId: framework.ruleId });
    }
  }
  return aliases;
}

function staticActixWebImportAliases(input: RustExtractFileFactsInput, root: RustSyntaxNode): {
  readonly appAliases: ReadonlySet<string>;
  readonly webAliases: ReadonlySet<string>;
  readonly serviceConfigAliases: ReadonlySet<string>;
} {
  const imports = staticTopLevelUseImports(input, root);
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
  return {
    appAliases: new Set(
      imports
        .filter((imported) => imported.path === ACTIX_WEB_APP_PATH && isUnambiguous(imported))
        .map((imported) => imported.localName)
    ),
    webAliases: new Set(
      imports
        .filter((imported) => imported.path === ACTIX_WEB_WEB_PATH && isUnambiguous(imported))
        .map((imported) => imported.localName)
    ),
    serviceConfigAliases: new Set(
      imports
        .filter(
          (imported) =>
            imported.path === "actix_web::web::ServiceConfig" && isUnambiguous(imported)
        )
        .map((imported) => imported.localName)
    )
  };
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
  const functionNode =
    node.name === "FunctionItem"
      ? node
      : node.name === "AttributeItem"
        ? directChildren(node).find((child) => child.name === "FunctionItem")
        : undefined;
  if (functionNode === undefined) {
    return null;
  }
  const children = directChildren(functionNode);
  const fnIndex = children.findIndex((child) => child.name === "fn");
  const name = children.slice(fnIndex + 1).find((child) => child.name === "BoundIdentifier");
  const parameterList = children.find((child) => child.name === "ParamList");
  const body = children.find((child) => child.name === "Block");
  const nameText = name === undefined ? null : identifierText(input, name);
  if (fnIndex < 0 || nameText === null || body === undefined) {
    return null;
  }
  const parameters =
    parameterList === undefined
      ? []
      : directChildren(parameterList).filter((parameter) => parameter.name === "Parameter");
  return {
    name: nameText,
    node: functionNode,
    body,
    parameters,
    attributes: node.name === "AttributeItem"
      ? directChildren(node).filter((child) => child.name === "Attribute")
      : [],
    parameterNames: parameters.flatMap((parameter) => boundIdentifierNames(input, parameter))
  };
}

function staticRustDirectCalls(
  input: RustExtractFileFactsInput,
  functionDeclaration: StaticRustFunction
): {
  readonly callsByName: ReadonlyMap<string, readonly RustSyntaxNode[]>;
  readonly unsafeBindingNames: ReadonlySet<string>;
  readonly hasGlobImport: boolean;
} {
  input.directCallTraversalObserver?.();
  const unsafeBindingNames = new Set(functionDeclaration.parameterNames);
  const callsByName = new Map<string, RustSyntaxNode[]>();
  let hasGlobImport = false;

  function visit(candidate: RustSyntaxNode): void {
    if (candidate !== functionDeclaration.body && candidate.name === "FunctionItem") {
      const localFunction = staticRustFunction(input, candidate);
      if (localFunction !== null) {
        unsafeBindingNames.add(localFunction.name);
      }
      return;
    }
    if (candidate !== functionDeclaration.body && candidate.name === "ClosureExpression") {
      return;
    }
    for (const name of directBoundNames(input, candidate)) {
      unsafeBindingNames.add(name);
    }
    if (candidate.name === "BoundIdentifier") {
      const name = identifierText(input, candidate);
      if (name !== null) {
        unsafeBindingNames.add(name);
      }
    }
    if (candidate.name === "UseDeclaration" && hasRustWildcardImport(candidate)) {
      hasGlobImport = true;
    }
    if (candidate.name === "CallExpression") {
      const callee = directChildren(candidate)[0];
      const name = callee?.name === "Identifier" ? identifierText(input, callee) : null;
      if (name !== null && candidate.parent?.name !== "CallExpression") {
        const calls = callsByName.get(name) ?? [];
        calls.push(callee!);
        callsByName.set(name, calls);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }

  visit(functionDeclaration.body);
  return { callsByName, unsafeBindingNames, hasGlobImport };
}

function staticActixWebServiceConfig(
  input: RustExtractFileFactsInput,
  functionDeclaration: StaticRustFunction,
  webAliases: ReadonlySet<string>,
  serviceConfigAliases: ReadonlySet<string>
): StaticActixWebServiceConfig | null {
  if (functionDeclaration.parameters.length !== 1) {
    return null;
  }
  const parameter = functionDeclaration.parameters[0];
  if (parameter === undefined) {
    return null;
  }
  const parameterNameNodes = directChildren(parameter).filter(
    (child) => child.name === "BoundIdentifier"
  );
  const parameterNameNode = parameterNameNodes[0];
  const parameterName =
    parameterNameNodes.length === 1 && parameterNameNode !== undefined
      ? identifierText(input, parameterNameNode)
      : null;
  if (parameterName === null) {
    return null;
  }
  const compactParameter = nodeText(input, parameter).replace(/\s+/gu, "");
  const qualifiedConfig = [...webAliases].some(
    (webAlias) => compactParameter === `${parameterName}:&mut${webAlias}::ServiceConfig`
  );
  const directlyImportedConfig = [...serviceConfigAliases].some(
    (configAlias) => compactParameter === `${parameterName}:&mut${configAlias}`
  );
  return !qualifiedConfig && !directlyImportedConfig
    ? null
    : {
        name: functionDeclaration.name,
        node: functionDeclaration.node,
        parameterName,
        parameterNames: functionDeclaration.parameterNames,
        body: functionDeclaration.body
      };
}

function staticRustAttributeRoute(
  input: RustExtractFileFactsInput,
  attribute: RustSyntaxNode,
  aliases: ReadonlyMap<string, StaticRustAttributeRouteImport>,
  handlerName: string
): StaticRustRoute | null {
  if (attribute.name !== "Attribute") {
    return null;
  }
  const children = directChildren(attribute);
  const metaItem = children[1];
  if (
    children.length !== 3 ||
    children[0]?.name !== "[" ||
    metaItem === undefined ||
    metaItem.name !== "MetaItem" ||
    children[2]?.name !== "]"
  ) {
    return null;
  }
  const metaChildren = directChildren(metaItem);
  const macro = metaChildren[0];
  const arguments_ = metaChildren[1];
  if (
    metaChildren.length !== 2 ||
    macro === undefined ||
    arguments_ === undefined ||
    arguments_.name !== "ParenthesizedTokens"
  ) {
    return null;
  }
  const macroName = identifierText(input, macro);
  const routeImport = macroName === null ? undefined : aliases.get(macroName);
  const argumentNodes = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  const pathNode = argumentNodes[0];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
  if (routeImport === undefined || argumentNodes.length !== 1 || path === null) {
    return null;
  }
  return {
    method: routeImport.method,
    path,
    handlerName,
    node: attribute,
    ruleId: routeImport.ruleId
  };
}

function directStaticItemBoundNames(
  input: RustExtractFileFactsInput,
  statement: RustSyntaxNode
): readonly string[] {
  if (statement.name === "UseDeclaration") {
    const target = directUseImportTarget(statement);
    return target === null ? [] : staticUseImports(input, target).map((imported) => imported.localName);
  }
  const localFunction = staticRustFunction(input, statement);
  if (localFunction !== null) {
    return [localFunction.name];
  }
  return [];
}

function directBoundNames(input: RustExtractFileFactsInput, statement: RustSyntaxNode): readonly string[] {
  const staticItemNames = directStaticItemBoundNames(input, statement);
  if (staticItemNames.length > 0) {
    return staticItemNames;
  }
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
): readonly StaticRustRoute[] | null {
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
    {
      method: methodRoute.method,
      path,
      handlerName: methodRoute.handlerName,
      node,
      ruleId: AXUM_ROUTE_RULE_ID
    }
  ];
}

function staticActixWebAppNew(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  appAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): boolean {
  const call = staticCall(node);
  const arguments_ = call === null ? null : staticArguments(call.arguments_);
  const segments = call === null ? null : staticPathSegments(input, call.callee);
  if (arguments_ === null || segments === null || arguments_.length !== 0 || segments.length !== 2) {
    return false;
  }
  const appName = segments[0];
  return appName !== undefined && appAliases.has(appName) && !shadowedNames.has(appName) && segments[1] === "new";
}

function staticActixWebMethodTo(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): { readonly method: RouteMethod; readonly handlerName: string } | null {
  const toCall = staticFieldCall(input, node);
  if (toCall === null || toCall.methodName !== "to" || toCall.arguments_.length !== 1) {
    return null;
  }
  const handler = toCall.arguments_[0];
  const handlerName = handler === undefined ? null : identifierText(input, handler);
  const methodCall = staticCall(toCall.receiver);
  const methodArguments = methodCall === null ? null : staticArguments(methodCall.arguments_);
  const segments = methodCall === null ? null : staticPathSegments(input, methodCall.callee);
  if (
    handlerName === null ||
    methodArguments === null ||
    segments === null ||
    methodArguments.length !== 0 ||
    segments.length !== 2
  ) {
    return null;
  }
  const webName = segments[0];
  const methodName = segments[1];
  if (webName === undefined || methodName === undefined || shadowedNames.has(webName)) {
    return null;
  }
  const method = ACTIX_WEB_BUILDER_METHODS[methodName];
  return method === undefined || !webAliases.has(webName) ? null : { method, handlerName };
}

function staticActixWebResource(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): string | null {
  const call = staticCall(node);
  const arguments_ = call === null ? null : staticArguments(call.arguments_);
  const segments = call === null ? null : staticPathSegments(input, call.callee);
  const pathNode = arguments_?.[0];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
  if (
    arguments_ === null ||
    segments === null ||
    arguments_.length !== 1 ||
    segments.length !== 2 ||
    path === null
  ) {
    return null;
  }
  const webName = segments[0];
  return webName === undefined || !webAliases.has(webName) || shadowedNames.has(webName) || segments[1] !== "resource"
    ? null
    : path;
}

function staticActixWebScope(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): string | null {
  const call = staticCall(node);
  const arguments_ = call === null ? null : staticArguments(call.arguments_);
  const segments = call === null ? null : staticPathSegments(input, call.callee);
  const pathNode = arguments_?.[0];
  const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
  if (
    arguments_ === null ||
    segments === null ||
    arguments_.length !== 1 ||
    segments.length !== 2 ||
    path === null ||
    (path !== "/" && path.endsWith("/"))
  ) {
    return null;
  }
  const webName = segments[0];
  return webName === undefined || !webAliases.has(webName) || shadowedNames.has(webName) || segments[1] !== "scope"
    ? null
    : path;
}

function prefixedActixWebScopePath(prefix: string, path: string): string {
  return prefix === "/" ? path : prefix + path;
}

function prefixActixWebScopeRoutes(
  prefix: string,
  routes: readonly StaticRustRoute[]
): readonly StaticRustRoute[] {
  return routes.map((route) => ({
    ...route,
    path: prefixedActixWebScopePath(prefix, route.path),
    ruleId: ACTIX_WEB_SCOPE_ROUTE_RULE_ID
  }));
}

function prefixedActixWebScopeRoutes(
  prefix: string,
  routes: readonly StaticRustRoute[]
): readonly StaticRustRoute[] {
  return routes.map((route) => ({
    ...route,
    path: prefixedActixWebScopePath(prefix, route.path)
  }));
}

function staticActixWebAttributeService(
  input: RustExtractFileFactsInput,
  handlerNode: RustSyntaxNode,
  mountNode: RustSyntaxNode,
  attributeRoutesByHandler: ReadonlyMap<string, readonly StaticRustRoute[]>,
  shadowedNames: ReadonlySet<string>,
  prefix: string,
  ruleId: string
): StaticActixWebAttributeService | null {
  const handlerName = identifierText(input, handlerNode);
  if (handlerName === null || shadowedNames.has(handlerName)) {
    return null;
  }
  const attributeRoutes = attributeRoutesByHandler.get(handlerName);
  if (attributeRoutes === undefined || attributeRoutes.length === 0) {
    return null;
  }
  return {
    handlerName,
    routes: attributeRoutes.map((attributeRoute) => ({
      ...attributeRoute,
      path: prefixedActixWebScopePath(prefix, attributeRoute.path),
      node: mountNode,
      ruleId
    }))
  };
}

function staticDirectExpressionStatementCall(statement: RustSyntaxNode): RustSyntaxNode | null {
  if (statement.name !== "ExpressionStatement") {
    return null;
  }
  const calls = directChildren(statement).filter((child) => child.name === "CallExpression");
  return calls.length === 1 ? calls[0] ?? null : null;
}

function configuredActixWebRoutes(
  prefix: string,
  routes: readonly StaticRustRoute[],
  mountNode: RustSyntaxNode,
  ruleId: string
): readonly StaticRustRoute[] {
  return routes.map((route) => ({
    ...route,
    path: prefixedActixWebScopePath(prefix, route.path),
    handlerScope: "service-config",
    node: mountNode,
    ruleId
  }));
}

/**
 * A nested ServiceConfig callback has its own lexical scope. Routes already
 * marked as `service-config` were proven there, so an enclosing callback's
 * local names must not suppress their top-level handler resolution.
 */
function staticActixWebServiceConfigVisibleRoutes(
  routes: readonly StaticRustRoute[],
  shadowedNames: ReadonlySet<string>
): readonly StaticRustRoute[] {
  return routes.filter(
    (route) => route.handlerScope === "service-config" || !shadowedNames.has(route.handlerName)
  );
}

function staticActixWebConfiguredRoutes(
  input: RustExtractFileFactsInput,
  configurationNode: RustSyntaxNode,
  mountNode: RustSyntaxNode,
  context: StaticActixWebRouteContext,
  callerShadowedNames: ReadonlySet<string>,
  prefix: string,
  ruleId: string,
  configurationStack: ReadonlySet<string>
): StaticActixWebRouteProjection | null {
  const configurationName = identifierText(input, configurationNode);
  if (configurationName === null || callerShadowedNames.has(configurationName)) {
    return null;
  }
  const configuration = context.serviceConfigsByName.get(configurationName);
  if (configuration === undefined || configurationStack.has(configurationName)) {
    return null;
  }
  const nextStack = new Set(configurationStack);
  nextStack.add(configurationName);
  return staticActixWebServiceConfigRoutes(
    input,
    configuration,
    context,
    prefix,
    ruleId,
    mountNode,
    nextStack
  );
}

function staticActixWebServiceConfigRoutes(
  input: RustExtractFileFactsInput,
  configuration: StaticActixWebServiceConfig,
  context: StaticActixWebRouteContext,
  prefix: string,
  ruleId: string,
  mountNode: RustSyntaxNode,
  configurationStack: ReadonlySet<string>
): StaticActixWebRouteProjection | null {
  const statements = directChildren(configuration.body);
  const staticItemBoundNames = new Set(
    statements.flatMap((statement) => directStaticItemBoundNames(input, statement))
  );
  const lexicalShadowedNames = new Set([
    ...configuration.parameterNames,
    ...staticItemBoundNames
  ]);
  let configurationReceiverAvailable = !staticItemBoundNames.has(configuration.parameterName);
  const routes: StaticRustRoute[] = [];
  const mountedAttributeHandlers: string[] = [];

  for (const statement of statements) {
    const expression = staticDirectExpressionStatementCall(statement);
    const call = expression === null ? null : staticFieldCall(input, expression);
    const receiverName = call === null ? null : identifierText(input, call.receiver);
    if (call !== null && receiverName === configuration.parameterName && configurationReceiverAvailable) {
      if (call.methodName === "route") {
        const pathNode = call.arguments_[0];
        const routeHandler = call.arguments_[1];
        const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
        const methodRoute =
          routeHandler === undefined
            ? null
            : staticActixWebMethodTo(input, routeHandler, context.webAliases, lexicalShadowedNames);
        if (call.arguments_.length !== 2 || path === null || methodRoute === null) {
          return null;
        }
        if (!lexicalShadowedNames.has(methodRoute.handlerName)) {
          routes.push({
            method: methodRoute.method,
            path: prefixedActixWebScopePath(prefix, path),
            handlerName: methodRoute.handlerName,
            handlerScope: "service-config",
            node: mountNode,
            ruleId
          });
        }
      } else if (call.methodName === "service") {
        const serviceNode = call.arguments_[0];
        if (call.arguments_.length !== 1 || serviceNode === undefined) {
          return null;
        }
        const resource = staticActixWebResourceChain(
          input,
          serviceNode,
          context.webAliases,
          lexicalShadowedNames
        );
        const scope = staticActixWebScopeChain(
          input,
          serviceNode,
          context.webAliases,
          lexicalShadowedNames,
          context,
          configurationStack
        );
        const attributeService = staticActixWebAttributeService(
          input,
          serviceNode,
          mountNode,
          context.attributeRoutesByHandler,
          lexicalShadowedNames,
          prefix,
          ruleId
        );
        if (resource !== null) {
          routes.push(
            ...configuredActixWebRoutes(
              prefix,
              staticActixWebServiceConfigVisibleRoutes(resource.routes, lexicalShadowedNames),
              mountNode,
              ruleId
            )
          );
        } else if (scope !== null) {
          routes.push(
            ...configuredActixWebRoutes(
              prefix,
              staticActixWebServiceConfigVisibleRoutes(scope.routes, lexicalShadowedNames),
              mountNode,
              ruleId
            )
          );
          mountedAttributeHandlers.push(...scope.mountedAttributeHandlers);
        } else if (attributeService !== null) {
          routes.push(
            ...attributeService.routes.map((route) => ({ ...route, handlerScope: "service-config" as const }))
          );
          mountedAttributeHandlers.push(attributeService.handlerName);
        } else {
          return null;
        }
      } else if (call.methodName === "configure") {
        const configurationNode = call.arguments_[0];
        if (call.arguments_.length !== 1 || configurationNode === undefined) {
          return null;
        }
        const nestedConfiguration = staticActixWebConfiguredRoutes(
          input,
          configurationNode,
          mountNode,
          context,
          lexicalShadowedNames,
          prefix,
          ruleId,
          configurationStack
        );
        if (nestedConfiguration === null) {
          return null;
        }
        routes.push(...nestedConfiguration.routes);
        mountedAttributeHandlers.push(...nestedConfiguration.mountedAttributeHandlers);
      }
    }
    for (const name of directBoundNames(input, statement)) {
      lexicalShadowedNames.add(name);
      if (name === configuration.parameterName) {
        configurationReceiverAvailable = false;
      }
    }
  }

  return { routes, mountedAttributeHandlers };
}

/**
 * Proves only a contiguous `web::resource("/path").route(web::get().to(handler))`
 * chain. The resource must later be attached directly to one proven `App::new()`
 * chain before these facts can enter the graph.
 */
function staticActixWebResourceChain(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>
): StaticActixWebResourceChain | null {
  const resourcePath = staticActixWebResource(input, node, webAliases, shadowedNames);
  if (resourcePath !== null) {
    return { path: resourcePath, routes: [] };
  }
  const call = staticFieldCall(input, node);
  if (call === null || call.arguments_.length !== 1) {
    return null;
  }
  const preceding = staticActixWebResourceChain(input, call.receiver, webAliases, shadowedNames);
  if (preceding === null) {
    return null;
  }
  if (call.methodName === "route") {
    const routeHandler = call.arguments_[0];
    const methodRoute =
      routeHandler === undefined
        ? null
        : staticActixWebMethodTo(input, routeHandler, webAliases, shadowedNames);
    if (methodRoute === null) {
      return null;
    }
    return {
      ...preceding,
      routes: [
        ...preceding.routes,
        {
          method: methodRoute.method,
          path: preceding.path,
          handlerName: methodRoute.handlerName,
          node,
          ruleId: ACTIX_WEB_RESOURCE_ROUTE_RULE_ID
        }
      ]
    };
  }
  if (call.methodName !== "to" || preceding.routes.length !== 0) {
    return null;
  }
  const handler = call.arguments_[0];
  const handlerName = handler === undefined ? null : identifierText(input, handler);
  if (handlerName === null) {
    return null;
  }
  return {
    ...preceding,
    routes: [
      {
        method: "ALL",
        path: preceding.path,
        handlerName,
        node,
        ruleId: ACTIX_WEB_RESOURCE_ROUTE_RULE_ID
      }
    ]
  };
}

/**
 * Proves only a direct `web::scope("/prefix")` chain of literal `.route(...)`
 * calls and direct resource, attribute-service, or nested-scope `.service(...)`
 * calls. Every scope prefix is static, starts with `/`, and has no trailing slash
 * except `/` itself.
 */
function staticActixWebScopeChain(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
  context: StaticActixWebRouteContext,
  configurationStack: ReadonlySet<string>
): StaticActixWebScopeChain | null {
  const scopePrefix = staticActixWebScope(input, node, webAliases, shadowedNames);
  if (scopePrefix !== null) {
    return { prefix: scopePrefix, routes: [], mountedAttributeHandlers: [] };
  }
  const call = staticFieldCall(input, node);
  if (call === null) {
    return null;
  }
  const preceding = staticActixWebScopeChain(
    input,
    call.receiver,
    webAliases,
    shadowedNames,
    context,
    configurationStack
  );
  if (preceding === null) {
    return null;
  }
  if (call.methodName === "route" && call.arguments_.length === 2) {
    const pathNode = call.arguments_[0];
    const routeHandler = call.arguments_[1];
    const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
    const methodRoute =
      routeHandler === undefined
        ? null
        : staticActixWebMethodTo(input, routeHandler, webAliases, shadowedNames);
    if (path === null || methodRoute === null) {
      return null;
    }
    return {
      ...preceding,
      routes: [
        ...preceding.routes,
        {
          method: methodRoute.method,
          path: prefixedActixWebScopePath(preceding.prefix, path),
          handlerName: methodRoute.handlerName,
          node,
          ruleId: ACTIX_WEB_SCOPE_ROUTE_RULE_ID
        }
      ]
    };
  }
  if (call.methodName === "configure") {
    const configurationNode = call.arguments_[0];
    if (call.arguments_.length !== 1 || configurationNode === undefined) {
      return null;
    }
    const configuredRoutes = staticActixWebConfiguredRoutes(
      input,
      configurationNode,
      node,
      context,
      shadowedNames,
      preceding.prefix,
      ACTIX_WEB_SCOPE_CONFIGURE_ROUTE_RULE_ID,
      configurationStack
    );
    return configuredRoutes === null
      ? null
      : {
          ...preceding,
          routes: [...preceding.routes, ...configuredRoutes.routes],
          mountedAttributeHandlers: [
            ...preceding.mountedAttributeHandlers,
            ...configuredRoutes.mountedAttributeHandlers
          ]
        };
  }
  if (call.methodName !== "service" || call.arguments_.length !== 1) {
    return null;
  }
  const serviceNode = call.arguments_[0];
  const resource =
    serviceNode === undefined
      ? null
      : staticActixWebResourceChain(input, serviceNode, webAliases, shadowedNames);
  const nestedScope =
    serviceNode === undefined
      ? null
      : staticActixWebScopeChain(
          input,
          serviceNode,
          webAliases,
          shadowedNames,
          context,
          configurationStack
        );
  const attributeService =
    serviceNode === undefined
      ? null
      : staticActixWebAttributeService(
          input,
          serviceNode,
          node,
          context.attributeRoutesByHandler,
          shadowedNames,
          preceding.prefix,
          ACTIX_WEB_SCOPE_ATTRIBUTE_SERVICE_ROUTE_RULE_ID
        );
  const serviceRoutes =
    resource !== null
      ? prefixActixWebScopeRoutes(preceding.prefix, resource.routes)
      : nestedScope !== null
        ? prefixedActixWebScopeRoutes(preceding.prefix, nestedScope.routes)
        : attributeService?.routes ?? null;
  const mountedAttributeHandlers =
    nestedScope?.mountedAttributeHandlers ??
    (attributeService === null ? [] : [attributeService.handlerName]);
  return serviceRoutes === null
    ? null
    : {
        ...preceding,
        routes: [...preceding.routes, ...serviceRoutes],
        mountedAttributeHandlers: [...preceding.mountedAttributeHandlers, ...mountedAttributeHandlers]
      };
}

/**
 * Proves only a contiguous direct `App::new()` chain. Supported calls are a
 * literal `.route("/path", web::METHOD().to(handler))` or `.service(...)` with
 * one direct resource, attribute-service, or scope chain; wrappers, mounts,
 * guards, and runtime composition stay out until their evidence rules are
 * deliberately added.
 */
function staticActixWebAppRouteChain(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  appAliases: ReadonlySet<string>,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
  context: StaticActixWebRouteContext,
  configurationStack: ReadonlySet<string>
): StaticActixWebAppChain | null {
  if (staticActixWebAppNew(input, node, appAliases, shadowedNames)) {
    return { routes: [], mountedAttributeHandlers: [] };
  }
  const call = staticFieldCall(input, node);
  if (call === null) {
    return null;
  }
  if (call.methodName === "route" && call.arguments_.length === 2) {
    const pathNode = call.arguments_[0];
    const routeHandler = call.arguments_[1];
    const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
    const methodRoute =
      routeHandler === undefined
        ? null
        : staticActixWebMethodTo(input, routeHandler, webAliases, shadowedNames);
    const precedingRoutes = staticActixWebAppRouteChain(
      input,
      call.receiver,
      appAliases,
      webAliases,
      shadowedNames,
      context,
      configurationStack
    );
    if (path === null || methodRoute === null || precedingRoutes === null) {
      return null;
    }
    return {
      ...precedingRoutes,
      routes: [
        ...precedingRoutes.routes,
        {
          method: methodRoute.method,
          path,
          handlerName: methodRoute.handlerName,
          node,
          ruleId: ACTIX_WEB_APP_ROUTE_RULE_ID
        }
      ]
    };
  }
  if (call.methodName === "configure") {
    const configurationNode = call.arguments_[0];
    if (call.arguments_.length !== 1 || configurationNode === undefined) {
      return null;
    }
    const configuredRoutes = staticActixWebConfiguredRoutes(
      input,
      configurationNode,
      node,
      context,
      shadowedNames,
      "/",
      ACTIX_WEB_APP_CONFIGURE_ROUTE_RULE_ID,
      configurationStack
    );
    const precedingRoutes = staticActixWebAppRouteChain(
      input,
      call.receiver,
      appAliases,
      webAliases,
      shadowedNames,
      context,
      configurationStack
    );
    return configuredRoutes === null || precedingRoutes === null
      ? null
      : {
          ...precedingRoutes,
          routes: [...precedingRoutes.routes, ...configuredRoutes.routes],
          mountedAttributeHandlers: [
            ...precedingRoutes.mountedAttributeHandlers,
            ...configuredRoutes.mountedAttributeHandlers
          ]
        };
  }
  if (call.methodName !== "service" || call.arguments_.length !== 1) {
    return null;
  }
  const serviceNode = call.arguments_[0];
  const resource =
    serviceNode === undefined
      ? null
      : staticActixWebResourceChain(input, serviceNode, webAliases, shadowedNames);
  const scope =
    serviceNode === undefined
      ? null
      : staticActixWebScopeChain(
          input,
          serviceNode,
          webAliases,
          shadowedNames,
          context,
          configurationStack
        );
  const attributeService =
    serviceNode === undefined
      ? null
      : staticActixWebAttributeService(
          input,
          serviceNode,
          node,
          context.attributeRoutesByHandler,
          shadowedNames,
          "/",
          ACTIX_WEB_APP_ATTRIBUTE_SERVICE_ROUTE_RULE_ID
        );
  const serviceRoutes = resource?.routes ?? scope?.routes ?? attributeService?.routes ?? null;
  const mountedAttributeHandlers =
    scope?.mountedAttributeHandlers ??
    (attributeService === null ? [] : [attributeService.handlerName]);
  const precedingRoutes = staticActixWebAppRouteChain(
    input,
    call.receiver,
    appAliases,
    webAliases,
    shadowedNames,
    context,
    configurationStack
  );
  return serviceRoutes === null || precedingRoutes === null
    ? null
    : {
        ...precedingRoutes,
        routes: [...precedingRoutes.routes, ...serviceRoutes],
        mountedAttributeHandlers: [...precedingRoutes.mountedAttributeHandlers, ...mountedAttributeHandlers]
      };
}

function staticActixWebImportedConfigMounts(
  input: RustExtractFileFactsInput,
  configurationNode: RustSyntaxNode,
  mountNode: RustSyntaxNode,
  context: StaticActixWebRouteContext,
  importedServiceConfigs: ReadonlyMap<string, StaticActixWebImportedServiceConfig>,
  shadowedNames: ReadonlySet<string>,
  prefix: string,
  kind: "app" | "scope"
): readonly StaticActixWebImportedConfigMount[] | null {
  const localName = identifierText(input, configurationNode);
  if (localName === null || shadowedNames.has(localName)) {
    return null;
  }
  if (context.serviceConfigsByName.has(localName)) {
    return [];
  }
  const imported = importedServiceConfigs.get(localName);
  return imported === undefined
    ? null
    : [
        {
          configurationName: imported.configurationName,
          moduleName: imported.moduleName,
          modulePath: imported.modulePath,
          importRoot: imported.importRoot,
          ...(imported.workspaceCrateName === undefined
            ? {}
            : { workspaceCrateName: imported.workspaceCrateName }),
          prefix,
          kind,
          node: mountNode
        }
      ];
}

function staticActixWebImportedConfigScopeChain(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
  context: StaticActixWebRouteContext,
  importedServiceConfigs: ReadonlyMap<string, StaticActixWebImportedServiceConfig>
): StaticActixWebImportedConfigScopeChain | null {
  const scopePrefix = staticActixWebScope(input, node, webAliases, shadowedNames);
  if (scopePrefix !== null) {
    return { prefix: scopePrefix, importedMounts: [] };
  }
  const call = staticFieldCall(input, node);
  if (call === null) {
    return null;
  }
  const preceding = staticActixWebImportedConfigScopeChain(
    input,
    call.receiver,
    webAliases,
    shadowedNames,
    context,
    importedServiceConfigs
  );
  if (preceding === null) {
    return null;
  }
  if (call.methodName === "route") {
    const pathNode = call.arguments_[0];
    const routeHandler = call.arguments_[1];
    const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
    const methodRoute =
      routeHandler === undefined
        ? null
        : staticActixWebMethodTo(input, routeHandler, webAliases, shadowedNames);
    return call.arguments_.length !== 2 || path === null || methodRoute === null ? null : preceding;
  }
  if (call.methodName === "configure") {
    const configurationNode = call.arguments_[0];
    if (call.arguments_.length !== 1 || configurationNode === undefined) {
      return null;
    }
    const importedMounts = staticActixWebImportedConfigMounts(
      input,
      configurationNode,
      node,
      context,
      importedServiceConfigs,
      shadowedNames,
      preceding.prefix,
      "scope"
    );
    return importedMounts === null
      ? null
      : {
          ...preceding,
          importedMounts: [...preceding.importedMounts, ...importedMounts]
        };
  }
  if (call.methodName !== "service" || call.arguments_.length !== 1) {
    return null;
  }
  const serviceNode = call.arguments_[0];
  const resource =
    serviceNode === undefined
      ? null
      : staticActixWebResourceChain(input, serviceNode, webAliases, shadowedNames);
  const nestedScope =
    serviceNode === undefined
      ? null
      : staticActixWebImportedConfigScopeChain(
          input,
          serviceNode,
          webAliases,
          shadowedNames,
          context,
          importedServiceConfigs
        );
  const attributeService =
    serviceNode === undefined
      ? null
      : staticActixWebAttributeService(
          input,
          serviceNode,
          node,
          context.attributeRoutesByHandler,
          shadowedNames,
          preceding.prefix,
          ACTIX_WEB_SCOPE_ATTRIBUTE_SERVICE_ROUTE_RULE_ID
        );
  if (resource !== null || attributeService !== null) {
    return preceding;
  }
  return nestedScope === null
    ? null
    : {
        ...preceding,
        importedMounts: [
          ...preceding.importedMounts,
          ...nestedScope.importedMounts.map((mount) => ({
            ...mount,
            prefix: prefixedActixWebScopePath(preceding.prefix, mount.prefix)
          }))
        ]
      };
}

function staticActixWebImportedConfigAppMounts(
  input: RustExtractFileFactsInput,
  node: RustSyntaxNode,
  appAliases: ReadonlySet<string>,
  webAliases: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
  context: StaticActixWebRouteContext,
  importedServiceConfigs: ReadonlyMap<string, StaticActixWebImportedServiceConfig>
): readonly StaticActixWebImportedConfigMount[] | null {
  if (staticActixWebAppNew(input, node, appAliases, shadowedNames)) {
    return [];
  }
  const call = staticFieldCall(input, node);
  if (call === null) {
    return null;
  }
  const preceding = staticActixWebImportedConfigAppMounts(
    input,
    call.receiver,
    appAliases,
    webAliases,
    shadowedNames,
    context,
    importedServiceConfigs
  );
  if (preceding === null) {
    return null;
  }
  if (call.methodName === "route") {
    const pathNode = call.arguments_[0];
    const routeHandler = call.arguments_[1];
    const path = pathNode === undefined ? null : staticLiteralSlashPath(input, pathNode);
    const methodRoute =
      routeHandler === undefined
        ? null
        : staticActixWebMethodTo(input, routeHandler, webAliases, shadowedNames);
    return call.arguments_.length !== 2 || path === null || methodRoute === null ? null : preceding;
  }
  if (call.methodName === "configure") {
    const configurationNode = call.arguments_[0];
    if (call.arguments_.length !== 1 || configurationNode === undefined) {
      return null;
    }
    const importedMounts = staticActixWebImportedConfigMounts(
      input,
      configurationNode,
      node,
      context,
      importedServiceConfigs,
      shadowedNames,
      "/",
      "app"
    );
    return importedMounts === null ? null : [...preceding, ...importedMounts];
  }
  if (call.methodName !== "service" || call.arguments_.length !== 1) {
    return null;
  }
  const serviceNode = call.arguments_[0];
  const resource =
    serviceNode === undefined
      ? null
      : staticActixWebResourceChain(input, serviceNode, webAliases, shadowedNames);
  const scope =
    serviceNode === undefined
      ? null
      : staticActixWebImportedConfigScopeChain(
          input,
          serviceNode,
          webAliases,
          shadowedNames,
          context,
          importedServiceConfigs
        );
  const attributeService =
    serviceNode === undefined
      ? null
      : staticActixWebAttributeService(
          input,
          serviceNode,
          node,
          context.attributeRoutesByHandler,
          shadowedNames,
          "/",
          ACTIX_WEB_APP_ATTRIBUTE_SERVICE_ROUTE_RULE_ID
        );
  if (resource !== null || attributeService !== null) {
    return preceding;
  }
  return scope === null ? null : [...preceding, ...scope.importedMounts];
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
 * Extracts conservative Rust file facts. Axum routes require a direct import,
 * a contiguous literal route builder chain, and one unshadowed named top-level
 * function handler. Actix Web accepts direct imported HTTP attributes plus one
 * continuous direct `App::new()` builder chain with direct resource, attribute,
 * and scope services. Rocket routes require their direct imported attribute
 * macro, a literal path, and the annotated top-level handler. No type checking
 * or runtime router composition is inferred from this syntax-only adapter.
 */
export function extractRustFileFacts(input: RustExtractFileFactsInput): ArtifactFacts {
  const frameworkCapabilities = [
    frameworkCapability("axum"),
    frameworkCapability("actix-web"),
    frameworkCapability("rocket")
  ] as const;
  if (frameworkCapabilities.some((capability) => !capability.languages.includes(input.language))) {
    throw new Error("Rust framework extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  let rustActixServiceConfigFacts: RustActixServiceConfigFacts | undefined;
  let rustProjectFacts: ArtifactFacts["rustProjectFacts"];
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

  function addProjectEnum(enumDeclaration: StaticRustProjectEnum): SymbolNode {
    const qualifiedName = `${input.filePath}#${enumDeclaration.name}`;
    const identity = `${qualifiedName}\u0000type`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "type",
        declarationOrdinal
      }),
      name: enumDeclaration.name,
      qualifiedName,
      kind: "type",
      filePath: input.filePath,
      range: rangeFor(lineStarts, enumDeclaration.node.from, enumDeclaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, enumDeclaration.node);
    return symbol;
  }

  function addDirectCall(caller: SymbolNode, target: SymbolNode, call: RustSyntaxNode): void {
    const range = rangeFor(lineStarts, call.from, call.to);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: target.name
      }),
      sourceId: caller.id,
      targetId: target.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: target.name,
      evidence: {
        ruleId: "syntax.rust.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  function addRustRoute(routeFact: StaticRustRoute, handler: SymbolNode): void {
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
        ruleId: routeFact.ruleId,
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  const rootHasSyntaxError = hasSyntaxError(root);
  const functions = directChildren(root)
    .map((node) => staticRustFunction(input, node))
    .filter((candidate): candidate is StaticRustFunction => candidate !== null)
    .filter(
      (candidate) =>
        !hasSyntaxError(candidate.node) &&
        candidate.attributes.every((attribute) => !hasSyntaxError(attribute))
    );
  const functionsByName = new Map<string, SymbolNode[]>();
  const functionSymbols = new Map<StaticRustFunction, SymbolNode>();
  for (const functionDeclaration of functions) {
    const symbol = addFunction(functionDeclaration);
    functionSymbols.set(functionDeclaration, symbol);
    const sameName = functionsByName.get(functionDeclaration.name) ?? [];
    sameName.push(symbol);
    functionsByName.set(functionDeclaration.name, sameName);
  }

  if (
    isRustProjectSourceFile(input.filePath) &&
    !hasRustConditionalInnerAttribute(input, root)
  ) {
      const projectNodes = directChildren(root);
      const moduleCollisionNames = projectNodes.flatMap((node) => {
        const name = directRustProjectItemName(input, node, "ModItem", "mod", "BoundIdentifier");
        return name === null ? [] : [name];
      });
      const importCollisionKeys = projectNodes.flatMap((node) => {
        const key = directRustProjectImportKey(input, node);
        return key === null ? [] : [key];
      });
      const declarationCollisionNames = projectNodes.flatMap((node) => {
        const enumName = directRustProjectItemName(
          input,
          node,
          "EnumItem",
          "enum",
          "TypeIdentifier"
        );
        const functionName = directRustProjectItemName(
          input,
          node,
          "FunctionItem",
          "fn",
          "BoundIdentifier"
        );
        return [enumName, functionName].filter((name): name is string => name !== null);
      });
      const projectModuleNodes = projectNodes.filter(
        (node) => directRustAttributedItem(node, "ModItem") !== null
      );
      const moduleCategoryIsSafe = projectModuleNodes.every(
        (node) => isSafeRustProjectModuleCandidate(input, node)
      );
      const projectImportNodes = projectNodes.filter(
        (node) => directRustAttributedItem(node, "UseDeclaration") !== null
      );
      const acceptedProjectImports = projectImportNodes
        .map((node) => staticRustProjectImport(input, node))
        .filter(
          (
            candidate
          ): candidate is {
            readonly modulePath: readonly string[];
            readonly importedName: string;
            readonly node: RustSyntaxNode;
          } => candidate !== null
        );
      const acceptedImportNames = acceptedProjectImports.map((candidate) => candidate.importedName);
      const importCategoryIsSafe =
        acceptedImportNames.every(
          (name) => occurrenceCount(acceptedImportNames, name) === 1
        ) &&
        projectImportNodes.every((node) =>
          isSafeRustProjectImportCandidate(input, node, acceptedImportNames)
        );
      const declarationCategoryIsSafe = projectNodes.every((node) => {
        const enumItem = directRustAttributedItem(node, "EnumItem");
        if (enumItem !== null) {
          return (
            staticRustAttributedItem(node, "EnumItem") !== null &&
            !hasRustPathAttribute(input, enumItem.attributes) &&
            directRustProjectItemName(input, node, "EnumItem", "enum", "TypeIdentifier") !== null
          );
        }
        const functionItem = directRustAttributedItem(node, "FunctionItem");
        if (functionItem === null) {
          return true;
        }
        return (
          !hasSyntaxError(node) &&
          staticRustFunction(input, node) !== null &&
          !hasRustPathAttribute(input, functionItem.attributes)
        );
      });
      const modules = !isRustCrateRoot(input.filePath) || !moduleCategoryIsSafe
        ? []
        : projectModuleNodes
            .map((node) => staticRustProjectModule(input, node))
            .filter((candidate): candidate is StaticRustExternalModule => candidate !== null)
            .filter(
              (candidate) => occurrenceCount(moduleCollisionNames, candidate.name) === 1
            )
            .map((module) => ({
              name: module.name,
              filePath: input.filePath,
              range: rangeFor(lineStarts, module.node.from, module.node.to),
              unconditionallyAvailable: true
            }));
      const imports = !importCategoryIsSafe
        ? []
        : acceptedProjectImports
        .filter(
          (candidate) =>
            occurrenceCount(
              importCollisionKeys,
              ["crate", ...candidate.modulePath, candidate.importedName].join("::")
            ) === 1
        )
        .map((imported) => ({
          modulePath: imported.modulePath,
          importedName: imported.importedName,
          range: rangeFor(lineStarts, imported.node.from, imported.node.to),
          unconditionallyAvailable: true
        }));
      const projectEnums = projectNodes
        .map((node) => staticRustProjectEnum(input, node))
        .filter((candidate): candidate is StaticRustProjectEnum => candidate !== null);
      const uniqueProjectEnums = projectEnums.filter(
        (candidate) => occurrenceCount(declarationCollisionNames, candidate.name) === 1
      );
      const enumSymbols = new Map<StaticRustProjectEnum, SymbolNode>();
      for (const enumDeclaration of uniqueProjectEnums) {
        enumSymbols.set(enumDeclaration, addProjectEnum(enumDeclaration));
      }
      const declarationCandidates = [
        ...functions.flatMap((functionDeclaration) => {
          const symbol = functionSymbols.get(functionDeclaration);
          const children = directChildren(functionDeclaration.node);
          const isPublic = children.some(
            (child) => child.name === "Vis" && nodeText(input, child) === "pub"
          );
          return symbol === undefined ||
            !isPublic ||
            hasRustProjectFactAttributeAmbiguity(input, functionDeclaration.attributes)
            ? []
            : [
                {
                  name: functionDeclaration.name,
                  symbol,
                  kind: "function" as const,
                  node: functionDeclaration.node
                }
              ];
        }),
        ...uniqueProjectEnums.flatMap((enumDeclaration) => {
          const symbol = enumSymbols.get(enumDeclaration);
          return symbol === undefined
            ? []
            : [
                {
                  name: enumDeclaration.name,
                  symbol,
                  kind: "type" as const,
                  node: enumDeclaration.node
                }
              ];
        })
      ];
      const extractedRustProjectFacts = {
        modules,
        imports,
        declarations: (declarationCategoryIsSafe ? declarationCandidates : [])
          .filter((candidate) => occurrenceCount(declarationCollisionNames, candidate.name) === 1)
          .map((declaration) => ({
            name: declaration.name,
            symbolId: declaration.symbol.id,
            filePath: input.filePath,
            kind: declaration.kind,
            range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
            unconditionallyAvailable: true
          }))
      };
      const hasProjectFacts =
        modules.length > 0 ||
        imports.length > 0 ||
        extractedRustProjectFacts.declarations.length > 0;
      if (
        hasProjectFacts ||
        (!rootHasSyntaxError && !hasAmbiguousRustProjectItem(input, root))
      ) {
        rustProjectFacts = extractedRustProjectFacts;
      }
  }

  if (!rootHasSyntaxError) {
    const importedNames = new Set(staticTopLevelUseImports(input, root).map((imported) => imported.localName));
    const hasGlobImport = hasRustGlobImport(root);
    for (const functionDeclaration of functions) {
      const analysis = staticRustDirectCalls(input, functionDeclaration);
      const callerCandidates = functionsByName.get(functionDeclaration.name) ?? [];
      const caller = callerCandidates[0];
      if (hasGlobImport || analysis.hasGlobImport || callerCandidates.length !== 1 || caller === undefined) {
        continue;
      }
      for (const [targetName, calls] of analysis.callsByName) {
        const targetCandidates = functionsByName.get(targetName) ?? [];
        const target = targetCandidates[0];
        if (
          importedNames.has(targetName) ||
          analysis.unsafeBindingNames.has(targetName) ||
          targetCandidates.length !== 1 ||
          target === undefined
        ) {
          continue;
        }
        for (const call of calls) {
          addDirectCall(caller, target, call);
        }
      }
    }

    const attributeRouteAliases = staticRustAttributeRouteAliases(input, root);
    const attributeRoutes: Array<{ readonly route: StaticRustRoute; readonly handler: SymbolNode }> = [];
    const actixAttributeRoutesByHandler = new Map<string, StaticRustRoute[]>();
    for (const functionDeclaration of functions) {
      for (const attribute of functionDeclaration.attributes) {
        const route = staticRustAttributeRoute(
          input,
          attribute,
          attributeRouteAliases,
          functionDeclaration.name
        );
        if (route === null) {
          continue;
        }
        const candidates = functionsByName.get(route.handlerName) ?? [];
        if (candidates.length === 1) {
          const handler = candidates[0];
          if (handler !== undefined) {
            attributeRoutes.push({ route, handler });
            if (route.ruleId === ACTIX_WEB_ATTRIBUTE_ROUTE_RULE_ID) {
              const routes = actixAttributeRoutesByHandler.get(route.handlerName) ?? [];
              routes.push(route);
              actixAttributeRoutesByHandler.set(route.handlerName, routes);
            }
          }
        }
      }
    }

    const { routerAliases, methodAliases } = staticAxumImportAliases(input, root);
    const { appAliases, webAliases, serviceConfigAliases } = staticActixWebImportAliases(input, root);
    const externalModules = staticRustExternalModules(input, root);
    const importedServiceConfigs = staticActixWebImportedServiceConfigs(
      input,
      root,
      externalModules
    );
    const serviceConfigsByName = new Map<string, StaticActixWebServiceConfig>();
    for (const functionDeclaration of functions) {
      if ((functionsByName.get(functionDeclaration.name) ?? []).length !== 1) {
        continue;
      }
      const serviceConfig = staticActixWebServiceConfig(
        input,
        functionDeclaration,
        webAliases,
        serviceConfigAliases
      );
      if (serviceConfig !== null) {
        serviceConfigsByName.set(serviceConfig.name, serviceConfig);
      }
    }
    const actixWebContext: StaticActixWebRouteContext = {
      webAliases,
      attributeRoutesByHandler: actixAttributeRoutesByHandler,
      serviceConfigsByName
    };
    const serviceConfigFacts = [...serviceConfigsByName.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((configuration) => {
        const projected = staticActixWebServiceConfigRoutes(
          input,
          configuration,
          actixWebContext,
          "/",
          ACTIX_WEB_SERVICE_CONFIG_DECLARATION_RULE_ID,
          configuration.node,
          new Set([configuration.name])
        );
        if (projected === null) {
          return [];
        }
        return [
          {
            name: configuration.name,
            range: rangeFor(lineStarts, configuration.node.from, configuration.node.to),
            routes: projected.routes.map((route) => ({
              method: route.method,
              path: route.path,
              handlerName: route.handlerName,
              range: rangeFor(lineStarts, route.node.from, route.node.to)
            })),
            mountedAttributeHandlers: [...new Set(projected.mountedAttributeHandlers)]
          }
        ];
      });
    const importedServiceConfigMounts: StaticActixWebImportedConfigMount[] = [];
    const mountedActixAttributeHandlers = new Set<string>();
    for (const functionDeclaration of functions) {
      const visibleRouterAliases = new Set(
        [...routerAliases].filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleMethodAliases = new Map(
        [...methodAliases].filter(([alias]) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleAppAliases = new Set(
        [...appAliases].filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const visibleWebAliases = new Set(
        [...webAliases].filter((alias) => !functionDeclaration.parameterNames.includes(alias))
      );
      const statements = directChildren(functionDeclaration.body);
      const staticItemBoundNames = new Set(
        statements.flatMap((statement) => directStaticItemBoundNames(input, statement))
      );
      const shadowedNames = new Set([...functionDeclaration.parameterNames, ...staticItemBoundNames]);
      for (const statement of statements) {
        const expression = staticStatementExpression(statement);
        const axumRoutes =
          expression === null
            ? null
            : staticAxumRouteChain(
                input,
                expression,
                visibleRouterAliases,
                visibleMethodAliases,
                shadowedNames
              );
        const actixWebChain =
          expression === null
            ? null
            : staticActixWebAppRouteChain(
                input,
                expression,
                visibleAppAliases,
                visibleWebAliases,
                shadowedNames,
                actixWebContext,
                new Set()
              );
        const importedActixWebMounts =
          expression === null
            ? null
            : staticActixWebImportedConfigAppMounts(
                input,
                expression,
                visibleAppAliases,
                visibleWebAliases,
                shadowedNames,
                actixWebContext,
                importedServiceConfigs
              );
        const actixWebRoutes = actixWebChain === null ? null : actixWebChain.routes;
        for (const routes of [axumRoutes, actixWebRoutes]) {
          if (routes === null) {
            continue;
          }
          for (const route of routes) {
            if (route.handlerScope !== "service-config" && shadowedNames.has(route.handlerName)) {
              continue;
            }
            const candidates = functionsByName.get(route.handlerName) ?? [];
            if (candidates.length === 1) {
              const handler = candidates[0];
              if (handler !== undefined) {
                addRustRoute(route, handler);
              }
            }
          }
        }
        if (actixWebChain !== null) {
          for (const handlerName of actixWebChain.mountedAttributeHandlers) {
            mountedActixAttributeHandlers.add(handlerName);
          }
        }
        if (importedActixWebMounts !== null) {
          importedServiceConfigMounts.push(...importedActixWebMounts);
        }
        for (const name of directBoundNames(input, statement)) {
          shadowedNames.add(name);
        }
      }
    }

    if (
      externalModules.length > 0 ||
      serviceConfigFacts.length > 0 ||
      importedServiceConfigMounts.length > 0
    ) {
      rustActixServiceConfigFacts = {
        externalModules: externalModules.map((module) => ({
          name: module.name,
          range: rangeFor(lineStarts, module.node.from, module.node.to)
        })),
        configurations: serviceConfigFacts,
        importedMounts: importedServiceConfigMounts.map((mount) => ({
          configurationName: mount.configurationName,
          moduleName: mount.moduleName,
          modulePath: mount.modulePath,
          importRoot: mount.importRoot,
          ...(mount.workspaceCrateName === undefined
            ? {}
            : { workspaceCrateName: mount.workspaceCrateName }),
          prefix: mount.prefix,
          kind: mount.kind,
          range: rangeFor(lineStarts, mount.node.from, mount.node.to)
        }))
      };
    }

    for (const { route, handler } of attributeRoutes) {
      if (
        route.ruleId !== ACTIX_WEB_ATTRIBUTE_ROUTE_RULE_ID ||
        !mountedActixAttributeHandlers.has(route.handlerName)
      ) {
        addRustRoute(route, handler);
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
    },
    ...(rustActixServiceConfigFacts === undefined ? {} : { rustActixServiceConfigFacts }),
    ...(rustProjectFacts === undefined ? {} : { rustProjectFacts })
  };
}

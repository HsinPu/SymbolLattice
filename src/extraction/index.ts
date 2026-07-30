import ts from "typescript";

import { extractGoFileFacts } from "./go.js";
import { extractJavaFileFacts } from "./java.js";
import { extractPythonFileFacts } from "./python.js";
import { extractRustFileFacts } from "./rust.js";
import {
  frameworkCapability,
  type FrameworkCapability,
  type FrameworkCapabilityId
} from "./framework-capabilities.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ArtifactLanguage,
  type BindingSpace,
  type EdgeKind,
  type EntryPointOperation,
  type EntryPointTransport,
  type ExportBinding,
  type FastifyPluginFacts,
  type FastifyPluginSymbolReference,
  type GraphEdge,
  type ImportBinding,
  type LocalBinding,
  type NestRouteFacts,
  type PendingReference,
  type ReExportBinding,
  type ReferenceScope,
  type RouteRegistration,
  type RouteMethod,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export type {
  ArtifactFacts,
  ExportBinding,
  FastApiRouterFacts,
  FastifyPluginFacts,
  ImportBinding,
  LocalBinding,
  NestRouteFacts,
  ReExportBinding,
  ReferenceScope
} from "../domain/index.js";
export {
  FRAMEWORK_CAPABILITIES,
  FRAMEWORK_CAPABILITY_IDS,
  frameworkCapability
} from "./framework-capabilities.js";
export type { FrameworkCapability, FrameworkCapabilityId } from "./framework-capabilities.js";

/** @deprecated Use ArtifactLanguage from the domain package. */
export type ExtractionLanguage = ArtifactLanguage;

export interface ExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: ExtractionLanguage;
}

/** @deprecated Use ArtifactFacts from the domain package. */
export type ExtractedFileFacts = ArtifactFacts;

interface DeclarationInfo {
  readonly name: string;
  readonly kind: Exclude<SymbolKind, "file">;
  readonly isExported: boolean;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
}

function scriptKindFor(input: ExtractFileFactsInput): ts.ScriptKind {
  if (input.language === "javascript") {
    return input.filePath.toLowerCase().endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  }

  return input.filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceRange(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 }
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function declarationName(node: ts.NamedDeclaration): string | null {
  if (node.name === undefined) {
    return null;
  }

  if (ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return null;
}

function declarationInfo(
  node: ts.Node,
  explicitExportNames: ReadonlySet<string>
): DeclarationInfo | null {
  if (ts.isClassDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : { name, kind: "class", isExported: hasExportModifier(node) || explicitExportNames.has(name) };
  }

  if (ts.isFunctionDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : {
          name,
          kind: "function",
          isExported: hasExportModifier(node) || explicitExportNames.has(name)
        };
  }

  if (ts.isMethodDeclaration(node)) {
    const name = declarationName(node);
    return name === null ? null : { name, kind: "method", isExported: false };
  }

  if (ts.isInterfaceDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "interface",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "type",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const statement = node.parent.parent;
    return {
      name: node.name.text,
      kind: "variable",
      isExported:
        (ts.isVariableStatement(statement) && hasExportModifier(statement)) ||
        explicitExportNames.has(node.name.text)
    };
  }

  return null;
}

function defaultExportExpressionInfo(node: ts.ExportAssignment): DeclarationInfo | null {
  if (node.isExportEquals) {
    return null;
  }

  if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) {
    return { name: "default", kind: "function", isExported: true };
  }

  if (ts.isClassExpression(node.expression)) {
    return { name: "default", kind: "class", isExported: true };
  }

  return null;
}

function collectExplicitExportNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      statement.moduleSpecifier !== undefined
    ) {
      continue;
    }

    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        // `export { localName as publicName }` exports the local declaration,
        // not a declaration named `publicName`.
        if (!statement.isTypeOnly && !element.isTypeOnly) {
          names.add(element.propertyName?.text ?? element.name.text);
        }
      }
    }
  }

  return names;
}

function isLexicalScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isFunctionLike(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    ts.isModuleBlock(node)
  );
}

function scopeIdFor(sourceFile: ts.SourceFile, node: ts.Node): string {
  return `${node.kind}:${node.getStart(sourceFile)}:${node.getEnd()}`;
}

function enclosingScopeNodes(node: ts.Node): readonly ts.Node[] {
  const scopeNodes: ts.Node[] = [];
  let current = node.parent;

  while (current !== undefined) {
    if (isLexicalScope(current)) {
      scopeNodes.push(current);
    }
    current = current.parent;
  }

  return scopeNodes;
}

function enclosingScopeIds(sourceFile: ts.SourceFile, node: ts.Node): readonly string[] {
  return enclosingScopeNodes(node).map((scopeNode) => scopeIdFor(sourceFile, scopeNode));
}

function isVarDeclaration(node: ts.Node): node is ts.VariableDeclaration {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
  );
}

function declarationScopeId(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  info: DeclarationInfo
): string | undefined {
  const scopeNodes = enclosingScopeNodes(node);
  if (info.kind === "variable" && isVarDeclaration(node)) {
    const variableScope = scopeNodes.find(
      (scopeNode) => ts.isFunctionLike(scopeNode) || ts.isSourceFile(scopeNode)
    );
    return variableScope === undefined ? undefined : scopeIdFor(sourceFile, variableScope);
  }

  const lexicalScope = scopeNodes[0];
  return lexicalScope === undefined ? undefined : scopeIdFor(sourceFile, lexicalScope);
}

function declaredBindingSpaces(info: DeclarationInfo): readonly BindingSpace[] {
  switch (info.kind) {
    case "class":
      return ["value", "type"];
    case "interface":
    case "type":
      return ["type"];
    case "function":
    case "variable":
      return ["value"];
    case "method":
      return [];
  }

  return [];
}

function typeParametersFor(node: ts.Node): ts.NodeArray<ts.TypeParameterDeclaration> | undefined {
  if (
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  ) {
    return node.typeParameters;
  }

  return ts.isFunctionLike(node) ? node.typeParameters : undefined;
}

interface ScopedRouteReceiverBindings {
  /** The closest value binding decides whether a receiver is known to be a supported framework. */
  readonly byScopeId: ReadonlyMap<string, ReadonlyMap<string, readonly RouteBinding[]>>;
}

type RouteBindingKind =
  | "express-receiver"
  | "express-default-factory"
  | "express-namespace"
  | "express-router-factory"
  | "fastify-receiver"
  | "fastify-default-factory"
  | "fastify-plugin-receiver"
  | "react-router-route"
  | "react-router-data-router-factory"
  | "react-router-elements-factory"
  | "other";

interface RouteBinding {
  readonly declaration: ts.Node;
  kind: RouteBindingKind;
  /** Static Fastify prefix inherited by a proven plugin callback. */
  prefix?: string;
  /** Provenance for the prefix that projected this callback's routes. */
  routeRegistration?: RouteRegistration;
}

interface StaticExpressRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

interface StaticFastifyRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
  readonly routeRegistration?: RouteRegistration;
}

/** A direct React Router route with a statically identifiable page component. */
interface StaticReactRouterRoute {
  readonly method: "NAVIGATE";
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** A direct data-router object route, retaining its exact registration range. */
interface StaticReactRouterDataRoute extends StaticReactRouterRoute {
  readonly declaration: ts.ObjectLiteralExpression;
}

/** A JSX `Route` record retaining the exact element that declared it. */
interface StaticReactRouterJsxRoute extends StaticReactRouterRoute {
  readonly declaration: ReactRouterJsxRouteElement;
}

/** One literal data-router object before its parent path is composed. */
interface StaticReactRouterDataRouteDefinition {
  readonly declaration: ts.ObjectLiteralExpression;
  /** `null` is a pathless layout route, which may still establish child context. */
  readonly path: string | null;
  readonly index: boolean;
  readonly handler: ts.Identifier | null;
  readonly children: readonly StaticReactRouterDataRouteDefinition[];
}

/** One literal JSX `Route` before its parent navigation path is composed. */
interface StaticReactRouterJsxRouteDefinition {
  readonly declaration: ReactRouterJsxRouteElement;
  /** `null` is a pathless layout route, which may still establish child context. */
  readonly path: string | null;
  readonly index: boolean;
  /** v5 `component` has no v6 nested-route composition proof. */
  readonly legacyComponent: boolean;
  readonly handler: ts.Identifier | null;
  readonly children: readonly StaticReactRouterJsxRouteDefinition[];
}

/** A convention-derived Next.js navigation route with a direct default export. */
interface StaticNextRoute extends StaticReactRouterRoute {
  readonly declaration: ts.Node;
  readonly routeRegistration: Extract<
    RouteRegistration,
    "nextjs-pages-router" | "nextjs-app-router"
  >;
}

interface FrameworkExtractionPass {
  readonly capability: FrameworkCapability;
  readonly visit?: (node: ts.Node) => void;
  readonly finalize?: () => void;
}

function frameworkExtractionPass(
  id: FrameworkCapabilityId,
  callbacks: Omit<FrameworkExtractionPass, "capability">
): FrameworkExtractionPass {
  return { capability: frameworkCapability(id), ...callbacks };
}

/** A literal Fastify route before a proven receiver provides any prefix context. */
interface StaticFastifyRouteShape {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** Lexical value bindings that can prove a NestJS HTTP decorator import. */
interface ScopedNestDecoratorBindings {
  readonly byScopeId: ReadonlyMap<string, ReadonlyMap<string, readonly NestDecoratorBinding[]>>;
}

type NestDecoratorBindingKind =
  | "nest-controller"
  | "nest-route"
  | "nest-module"
  | "nest-router-module"
  | "nest-graphql-resolver"
  | "nest-graphql-query"
  | "nest-graphql-mutation"
  | "nest-graphql-subscription"
  | "nest-microservice-message"
  | "nest-microservice-event"
  | "nest-websocket-gateway"
  | "nest-websocket-subscribe"
  | "other";

interface NestDecoratorBinding {
  readonly declaration: ts.Node;
  readonly kind: NestDecoratorBindingKind;
  /** Present only for a direct NestJS HTTP method decorator. */
  readonly method: RouteMethod | null;
}

interface StaticNestRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly decorator: ts.Decorator;
  readonly controller: ts.ClassDeclaration;
  readonly handler: ts.MethodDeclaration;
}

interface StaticNestEntrypoint {
  readonly transport: EntryPointTransport;
  readonly operation: EntryPointOperation;
  readonly name: string;
  readonly decorator: ts.Decorator;
  readonly handler: ts.MethodDeclaration;
}

interface StaticNestRouterModulePrefix {
  readonly module: ts.Identifier;
  readonly prefix: string;
}

interface StaticNestModuleDefinition {
  readonly controllers: readonly ts.Identifier[];
  readonly routerModulePrefixes: readonly StaticNestRouterModulePrefix[];
}

/** Direct HTTP decorators exported by `@nestjs/common`. */
const NEST_HTTP_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
  All: "ALL"
};

const EXPRESS_ROUTE_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "ALL"
] as const satisfies readonly RouteMethod[];

const FASTIFY_SHORTHAND_ROUTE_METHODS = [
  "GET",
  "HEAD",
  "TRACE",
  "DELETE",
  "OPTIONS",
  "PATCH",
  "PUT",
  "POST",
  "ALL"
] as const satisfies readonly RouteMethod[];

const FASTIFY_OBJECT_ROUTE_METHODS = [
  "GET",
  "HEAD",
  "TRACE",
  "DELETE",
  "OPTIONS",
  "PATCH",
  "PUT",
  "POST"
] as const satisfies readonly RouteMethod[];

const REACT_ROUTER_DATA_ROUTER_FACTORIES = [
  "createBrowserRouter",
  "createHashRouter",
  "createMemoryRouter"
] as const;
const REACT_ROUTER_ELEMENTS_FACTORY = "createRoutesFromElements";

const NEST_OTHER_DECORATOR_BINDING = { kind: "other", method: null } as const;

const NEST_GRAPHQL_OPERATION_BY_BINDING: Readonly<
  Partial<Record<NestDecoratorBindingKind, EntryPointOperation>>
> = {
  "nest-graphql-query": "query",
  "nest-graphql-mutation": "mutation",
  "nest-graphql-subscription": "subscription"
};

const NEST_MICROSERVICE_OPERATION_BY_BINDING: Readonly<
  Partial<Record<NestDecoratorBindingKind, EntryPointOperation>>
> = {
  "nest-microservice-message": "message",
  "nest-microservice-event": "event"
};

/** A syntax-proven direct base or contract named in a TypeScript heritage clause. */
interface StaticHeritageReference {
  readonly relationKind: "extends" | "implements";
  readonly identifier: ts.Identifier;
}

type HeritageDeclaration = ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration;

function nextHeritageToken(sourceFile: ts.SourceFile, node: ts.Node): ts.SyntaxKind {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    sourceFile.text
  );
  scanner.setTextPos(node.getEnd());
  return scanner.scan();
}

function hasSupportedHeritageDelimiter(
  sourceFile: ts.SourceFile,
  declaration: HeritageDeclaration,
  clause: ts.HeritageClause,
  type: ts.ExpressionWithTypeArguments
): boolean {
  const nextToken = nextHeritageToken(sourceFile, type);
  if (nextToken === ts.SyntaxKind.CommaToken || nextToken === ts.SyntaxKind.OpenBraceToken) {
    return true;
  }

  return (
    ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration)
  ) && clause.token === ts.SyntaxKind.ExtendsKeyword && nextToken === ts.SyntaxKind.ImplementsKeyword;
}

/**
 * Only record a heritage relation when TypeScript exposes a direct identifier base.
 * This deliberately excludes qualified types, mixin calls, intersections, and other
 * expressions whose target cannot be proven without semantic type resolution.
 */
function staticHeritageReferences(
  sourceFile: ts.SourceFile,
  declaration: HeritageDeclaration
): readonly StaticHeritageReference[] {
  const references: StaticHeritageReference[] = [];

  for (const clause of declaration.heritageClauses ?? []) {
    const relationKind =
      clause.token === ts.SyntaxKind.ExtendsKeyword
        ? "extends"
        : clause.token === ts.SyntaxKind.ImplementsKeyword
          ? "implements"
          : null;
    if (relationKind === null) {
      continue;
    }

    for (const type of clause.types) {
      if (
        !ts.isExpressionWithTypeArguments(type) ||
        !ts.isIdentifier(type.expression) ||
        !hasSupportedHeritageDelimiter(sourceFile, declaration, clause, type)
      ) {
        continue;
      }

      references.push({ relationKind, identifier: type.expression });
    }
  }

  return references;
}

function bindingNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  const names: string[] = [];
  for (const element of name.elements) {
    if (!ts.isBindingElement(element)) {
      continue;
    }
    names.push(...bindingNames(element.name));
  }
  return names;
}

function sourceScopeId(sourceFile: ts.SourceFile): string {
  return scopeIdFor(sourceFile, sourceFile);
}

function variableBindingScopeId(
  sourceFile: ts.SourceFile,
  declaration: ts.VariableDeclaration
): string | undefined {
  return declarationScopeId(sourceFile, declaration, {
    name: "value-binding",
    kind: "variable",
    isExported: false
  });
}

function isConstVariableDeclaration(declaration: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function isExpressImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "express" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isFastifyImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "fastify" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isReactRouterImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    (statement.moduleSpecifier.text === "react-router" ||
      statement.moduleSpecifier.text === "react-router-dom") &&
    statement.importClause?.isTypeOnly !== true
  );
}

function namedExpressImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isExpressImport(statement) || element.isTypeOnly) {
    return "other";
  }
  const importedName = element.propertyName?.text ?? element.name.text;
  if (importedName === "default") {
    return "express-default-factory";
  }
  if (importedName === "Router") {
    return "express-router-factory";
  }
  return "other";
}

function namedReactRouterImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isReactRouterImport(statement) || element.isTypeOnly) {
    return "other";
  }
  const importedName = element.propertyName?.text ?? element.name.text;
  if (importedName === "Route") {
    return "react-router-route";
  }
  if (importedName === REACT_ROUTER_ELEMENTS_FACTORY) {
    return "react-router-elements-factory";
  }
  return (REACT_ROUTER_DATA_ROUTER_FACTORIES as readonly string[]).includes(importedName)
    ? "react-router-data-router-factory"
    : "other";
}

function namedRouteImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  const expressBinding = namedExpressImportBindingKind(statement, element);
  return expressBinding === "other"
    ? namedReactRouterImportBindingKind(statement, element)
    : expressBinding;
}

function visibleRouteBinding(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): RouteBinding | undefined {
  for (const scopeId of enclosingScopeIds(sourceFile, identifier)) {
    const candidates = bindings.byScopeId.get(scopeId)?.get(identifier.text);
    if (candidates !== undefined) {
      // A duplicate declaration is ambiguous. It must block lookup rather than
      // allowing an outer Express import to prove a synthetic receiver.
      return candidates.length === 1 ? candidates[0] : undefined;
    }
  }
  return undefined;
}

function visibleRouteBindingKind(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): RouteBindingKind | undefined {
  return visibleRouteBinding(sourceFile, identifier, bindings)?.kind;
}

function isExpressReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  if (!ts.isCallExpression(initializer) || initializer.questionDotToken !== undefined) {
    return false;
  }

  if (ts.isIdentifier(initializer.expression)) {
    const binding = visibleRouteBindingKind(sourceFile, initializer.expression, bindings);
    return binding === "express-default-factory" || binding === "express-router-factory";
  }

  if (
    !ts.isPropertyAccessExpression(initializer.expression) ||
    initializer.expression.name.text !== "Router" ||
    !ts.isIdentifier(initializer.expression.expression)
  ) {
    return false;
  }

  const binding = visibleRouteBindingKind(sourceFile, initializer.expression.expression, bindings);
  return binding === "express-default-factory" || binding === "express-namespace";
}

function isFastifyReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return (
    ts.isCallExpression(initializer) &&
    initializer.questionDotToken === undefined &&
    ts.isIdentifier(initializer.expression) &&
    visibleRouteBindingKind(sourceFile, initializer.expression, bindings) === "fastify-default-factory"
  );
}

function addScopedValueBinding(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  names: readonly string[],
  declaration: ts.Node,
  bindingKind: RouteBindingKind = "other"
): void {
  if (scopeId === undefined) {
    return;
  }

  const bindings = byScopeId.get(scopeId) ?? new Map<string, RouteBinding[]>();
  for (const name of names) {
    const candidates = bindings.get(name) ?? [];
    candidates.push({ declaration, kind: bindingKind });
    bindings.set(name, candidates);
  }
  byScopeId.set(scopeId, bindings);
}

function markRouteReceiver(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  declaration: ts.VariableDeclaration,
  bindingKind: "express-receiver" | "fastify-receiver"
): void {
  if (scopeId === undefined || !ts.isIdentifier(declaration.name)) {
    return;
  }

  const binding = byScopeId
    .get(scopeId)
    ?.get(declaration.name.text)
    ?.find((candidate) => candidate.declaration === declaration);
  if (binding !== undefined) {
    binding.kind = bindingKind;
  }
}

type FastifyPluginCallback =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

type FastifyPluginCallbackOrigin = "inline" | "local";

interface FastifyRouteReceiverContext {
  readonly prefix: string;
  readonly routeRegistration?: RouteRegistration;
}

interface StaticFastifyPluginRegistration {
  readonly callback: FastifyPluginCallback;
  /** Includes every statically proven enclosing plugin prefix. */
  readonly prefix: string;
  readonly routeRegistration: RouteRegistration;
}

/**
 * Retain only literal non-root, non-trailing plugin prefixes. Fastify has
 * runtime-configurable special handling for a root route inside a prefixed
 * plugin, so this narrow static surface avoids inventing one canonical route.
 */
function staticFastifyPluginPrefix(options: ts.Expression | undefined): string | null {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return null;
  }

  const propertyNames = new Set<string>();
  let prefix: string | undefined;
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }
    const name = staticPropertyName(property.name);
    if (name === null || propertyNames.has(name)) {
      return null;
    }
    propertyNames.add(name);

    if (name !== "prefix") {
      continue;
    }
    const value = staticLiteralText(property.initializer);
    if (
      value === null ||
      !value.startsWith("/") ||
      value.length <= 1 ||
      value.endsWith("/")
    ) {
      return null;
    }
    prefix = value;
  }

  return prefix ?? null;
}

function isAssignmentOperatorKind(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.AmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarEqualsToken ||
    kind === ts.SyntaxKind.CaretEqualsToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken ||
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
    kind === ts.SyntaxKind.QuestionQuestionEqualsToken
  );
}

function directAssignmentTargetIdentifier(expression: ts.Expression): ts.Identifier | null {
  let target = expression;
  while (
    ts.isParenthesizedExpression(target) ||
    ts.isAsExpression(target) ||
    ts.isTypeAssertionExpression(target) ||
    ts.isNonNullExpression(target)
  ) {
    target = target.expression;
  }
  return ts.isIdentifier(target) ? target : null;
}

/**
 * A callback parameter is writable, unlike the immutable root Fastify receiver.
 * Do not classify it as a framework receiver when its own lexical body replaces it.
 */
function hasStableFastifyPluginReceiver(
  callback: FastifyPluginCallback,
  receiver: ts.Identifier
): boolean {
  if (callback.body === undefined) {
    return false;
  }

  let stable = true;
  const visit = (node: ts.Node): void => {
    if (!stable || (ts.isFunctionLike(node) && node !== callback)) {
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperatorKind(node.operatorToken.kind) &&
      directAssignmentTargetIdentifier(node.left)?.text === receiver.text
    ) {
      stable = false;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
      directAssignmentTargetIdentifier(node.operand)?.text === receiver.text
    ) {
      stable = false;
      return;
    }
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === receiver.text
    ) {
      stable = false;
      return;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(callback.body, visit);
  return stable;
}

function hasStableFastifyLocalPluginBinding(
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
  bindings: ScopedRouteReceiverBindings
): boolean {
  let stable = true;
  const isDeclarationBinding = (identifier: ts.Identifier): boolean =>
    visibleRouteBinding(sourceFile, identifier, bindings)?.declaration === declaration;
  const visit = (node: ts.Node): void => {
    if (!stable) {
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperatorKind(node.operatorToken.kind)
    ) {
      const target = directAssignmentTargetIdentifier(node.left);
      if (target !== null && isDeclarationBinding(target)) {
        stable = false;
        return;
      }
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const target = directAssignmentTargetIdentifier(node.operand);
      if (target !== null && isDeclarationBinding(target)) {
        stable = false;
        return;
      }
    }
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isIdentifier(node.initializer)) {
      if (isDeclarationBinding(node.initializer)) {
        stable = false;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return stable;
}

interface StaticLocalFastifyPluginCallback {
  readonly declaration: ts.FunctionDeclaration | ts.VariableDeclaration;
  readonly callback: FastifyPluginCallback;
  readonly receiver: ts.ParameterDeclaration;
}

function staticFastifyPluginReceiver(
  callback: FastifyPluginCallback
): ts.ParameterDeclaration | null {
  const receiver = callback.parameters[0];
  return receiver !== undefined &&
    ts.isIdentifier(receiver.name) &&
    receiver.dotDotDotToken === undefined &&
    receiver.initializer === undefined &&
    hasStableFastifyPluginReceiver(callback, receiver.name)
    ? receiver
    : null;
}

function staticLocalFastifyPluginCallbackForDeclaration(
  sourceFile: ts.SourceFile,
  declaration: ts.Node,
  bindings: ScopedRouteReceiverBindings
): StaticLocalFastifyPluginCallback | null {
  if (ts.isFunctionDeclaration(declaration)) {
    if (
      declaration.body === undefined ||
      declaration.asteriskToken !== undefined ||
      !hasStableFastifyLocalPluginBinding(sourceFile, declaration, bindings)
    ) {
      return null;
    }
    const receiver = staticFastifyPluginReceiver(declaration);
    return receiver === null ? null : { declaration, callback: declaration, receiver };
  }
  if (
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name) ||
    !isConstVariableDeclaration(declaration) ||
    declaration.initializer === undefined ||
    (!ts.isFunctionExpression(declaration.initializer) && !ts.isArrowFunction(declaration.initializer)) ||
    (ts.isFunctionExpression(declaration.initializer) && declaration.initializer.asteriskToken !== undefined) ||
    !hasStableFastifyLocalPluginBinding(sourceFile, declaration, bindings)
  ) {
    return null;
  }

  const receiver = staticFastifyPluginReceiver(declaration.initializer);
  return receiver === null
    ? null
    : { declaration, callback: declaration.initializer, receiver };
}

function staticLocalFastifyPluginCallback(
  sourceFile: ts.SourceFile,
  callback: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): FastifyPluginCallback | null {
  if (!ts.isIdentifier(callback)) {
    return null;
  }

  const declaration = visibleRouteBinding(sourceFile, callback, bindings)?.declaration;
  const localCallback =
    declaration === undefined
      ? null
      : staticLocalFastifyPluginCallbackForDeclaration(sourceFile, declaration, bindings);
  return localCallback?.callback ?? null;
}

interface ScopedFastifyPluginCallbacks {
  readonly byReceiverDeclaration: ReadonlyMap<ts.ParameterDeclaration, StaticLocalFastifyPluginCallback>;
}

function collectScopedFastifyPluginCallbacks(
  sourceFile: ts.SourceFile,
  bindings: ScopedRouteReceiverBindings
): ScopedFastifyPluginCallbacks {
  const byReceiverDeclaration = new Map<ts.ParameterDeclaration, StaticLocalFastifyPluginCallback>();
  const visit = (node: ts.Node): void => {
    const descriptor =
      ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)
        ? staticLocalFastifyPluginCallbackForDeclaration(sourceFile, node, bindings)
        : null;
    if (descriptor !== null) {
      byReceiverDeclaration.set(descriptor.receiver, descriptor);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return { byReceiverDeclaration };
}

function staticFastifyPluginCallback(
  sourceFile: ts.SourceFile,
  callback: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): { readonly callback: FastifyPluginCallback; readonly origin: FastifyPluginCallbackOrigin } | null {
  if (ts.isFunctionExpression(callback) || ts.isArrowFunction(callback)) {
    return ts.isFunctionExpression(callback) && callback.asteriskToken !== undefined
      ? null
      : { callback, origin: "inline" };
  }

  const localCallback = staticLocalFastifyPluginCallback(sourceFile, callback, bindings);
  return localCallback === null ? null : { callback: localCallback, origin: "local" };
}

function directFastifyRegisterPluginIdentifier(node: ts.CallExpression): ts.Identifier | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    node.expression.name.text !== "register"
  ) {
    return null;
  }

  const callback = node.arguments[0];
  return callback !== undefined && ts.isIdentifier(callback) ? callback : null;
}

/**
 * A same-file callback may be mounted through arbitrary runtime branches. Keep
 * the projection singular: if its exact lexical binding is passed to more than
 * one direct `.register(...)` call, no one prefix represents the full route
 * surface. Counting even non-Fastify receivers is intentionally conservative.
 */
function hasUniqueFastifyLocalPluginRegistration(
  sourceFile: ts.SourceFile,
  callback: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  const declaration = visibleRouteBinding(sourceFile, callback, bindings)?.declaration;
  if (declaration === undefined) {
    return false;
  }

  let registrations = 0;
  const visit = (node: ts.Node): void => {
    if (registrations > 1) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const candidate = directFastifyRegisterPluginIdentifier(node);
      if (
        candidate !== null &&
        visibleRouteBinding(sourceFile, candidate, bindings)?.declaration === declaration
      ) {
        registrations += 1;
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return registrations === 1;
}

function staticFastifyPluginRegistration(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticFastifyPluginRegistration | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    node.expression.name.text !== "register" ||
    !ts.isIdentifier(node.expression.expression) ||
    node.arguments.length !== 2
  ) {
    return null;
  }

  const parent = fastifyRouteReceiverContext(
    sourceFile,
    node.expression.expression,
    bindings
  );
  const callback = node.arguments[0];
  const prefix = staticFastifyPluginPrefix(node.arguments[1]);
  if (
    parent === undefined ||
    callback === undefined ||
    prefix === null
  ) {
    return null;
  }

  const resolvedCallback = staticFastifyPluginCallback(sourceFile, callback, bindings);
  if (
    resolvedCallback === null ||
    (resolvedCallback.origin === "local" &&
      (!ts.isIdentifier(callback) ||
        !hasUniqueFastifyLocalPluginRegistration(sourceFile, callback, bindings))) ||
    resolvedCallback.callback.parameters.length === 0
  ) {
    return null;
  }

  const receiver = resolvedCallback.callback.parameters[0];
  if (
    receiver === undefined ||
    !ts.isIdentifier(receiver.name) ||
    receiver.dotDotDotToken !== undefined ||
    receiver.initializer !== undefined ||
    !hasStableFastifyPluginReceiver(resolvedCallback.callback, receiver.name)
  ) {
    return null;
  }

  return {
    callback: resolvedCallback.callback,
    prefix: `${parent.prefix}${prefix}`,
    routeRegistration:
      resolvedCallback.origin === "local" ||
      parent.routeRegistration === "fastify-local-plugin-prefix"
        ? "fastify-local-plugin-prefix"
        : "fastify-inline-plugin-prefix"
  };
}

function markFastifyPluginReceiver(
  sourceFile: ts.SourceFile,
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  registration: StaticFastifyPluginRegistration
): boolean {
  const receiver = registration.callback.parameters[0];
  if (receiver === undefined || !ts.isIdentifier(receiver.name)) {
    return false;
  }

  const candidates = byScopeId
    .get(scopeIdFor(sourceFile, registration.callback))
    ?.get(receiver.name.text);
  if (candidates === undefined || candidates.length !== 1) {
    return false;
  }

  const binding = candidates[0];
  if (binding === undefined || binding.declaration !== receiver || binding.kind !== "other") {
    return false;
  }

  binding.kind = "fastify-plugin-receiver";
  binding.prefix = registration.prefix;
  binding.routeRegistration = registration.routeRegistration;
  return true;
}

/**
 * Finds value bindings before route extraction so a receiver cannot be inferred
 * from its spelling. A lexical shadow always wins over an outer framework receiver.
 */
function collectScopedRouteReceiverBindings(sourceFile: ts.SourceFile): ScopedRouteReceiverBindings {
  const byScopeId = new Map<string, Map<string, RouteBinding[]>>();
  const rootScopeId = sourceScopeId(sourceFile);

  function collectBindings(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        addScopedValueBinding(
          byScopeId,
          rootScopeId,
          [importClause.name.text],
          importClause.name,
          isExpressImport(node)
            ? "express-default-factory"
            : isFastifyImport(node)
              ? "fastify-default-factory"
              : "other"
        );
      }
      if (importClause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          addScopedValueBinding(
            byScopeId,
            rootScopeId,
            [importClause.namedBindings.name.text],
            importClause.namedBindings.name,
            isExpressImport(node) ? "express-namespace" : "other"
          );
        } else {
          for (const element of importClause.namedBindings.elements) {
            addScopedValueBinding(
              byScopeId,
              rootScopeId,
              [element.name.text],
              element.name,
              namedRouteImportBindingKind(node, element)
            );
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const names = bindingNames(node.name);
      const scopeId = variableBindingScopeId(sourceFile, node);
      addScopedValueBinding(byScopeId, scopeId, names, node);
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      if (node.name !== undefined) {
        const scopeId = declarationScopeId(sourceFile, node, {
          name: node.name.text,
          kind: ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ? "class" : "variable",
          isExported: false
        });
        addScopedValueBinding(byScopeId, scopeId, [node.name.text], node);
      }
    }

    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      // Named expressions bind their own name only inside their lexical body.
      // Record that self-binding so it cannot be mistaken for an outer import.
      addScopedValueBinding(byScopeId, scopeIdFor(sourceFile, node), [node.name.text], node);
    }

    if (ts.isFunctionLike(node)) {
      const scopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        addScopedValueBinding(byScopeId, scopeId, bindingNames(parameter.name), parameter);
      }
    }

    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      addScopedValueBinding(
        byScopeId,
        scopeIdFor(sourceFile, node),
        bindingNames(node.variableDeclaration.name),
        node.variableDeclaration
      );
    }

    ts.forEachChild(node, collectBindings);
  }

  function collectRootReceivers(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node) &&
      isExpressReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "express-receiver"
      );
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node) &&
      isFastifyReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "fastify-receiver"
      );
    }

    ts.forEachChild(node, collectRootReceivers);
  }

  function collectPluginReceivers(): boolean {
    let changed = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const registration = staticFastifyPluginRegistration(sourceFile, node, { byScopeId });
        if (registration !== null) {
          changed = markFastifyPluginReceiver(sourceFile, byScopeId, registration) || changed;
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return changed;
  }

  ts.forEachChild(sourceFile, collectBindings);
  ts.forEachChild(sourceFile, collectRootReceivers);
  while (collectPluginReceivers()) {
    // Plugin receivers are discovered in one lexical pass per static nesting level.
  }
  return { byScopeId };
}

function isExpressRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "express-receiver";
}

function fastifyRouteReceiverContext(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): FastifyRouteReceiverContext | undefined {
  const binding = visibleRouteBinding(sourceFile, receiver, bindings);
  if (binding?.kind === "fastify-receiver") {
    return { prefix: "" };
  }
  if (
    binding?.kind === "fastify-plugin-receiver" &&
    binding.prefix !== undefined &&
    binding.routeRegistration !== undefined
  ) {
    return { prefix: binding.prefix, routeRegistration: binding.routeRegistration };
  }
  return undefined;
}

function staticExpressRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticExpressRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    !isExpressRouteReceiver(sourceFile, node.expression.expression, bindings)
  ) {
    return null;
  }

  const methodName = node.expression.name.text;
  const method = staticRouteMethodForName(methodName, EXPRESS_ROUTE_METHODS);
  if (method === undefined) {
    return null;
  }

  const pathArgument = node.arguments[0];
  const handler = node.arguments.at(-1);
  if (
    node.arguments.length < 2 ||
    pathArgument === undefined ||
    !ts.isStringLiteral(pathArgument) ||
    !pathArgument.text.startsWith("/") ||
    handler === undefined ||
    !ts.isIdentifier(handler) ||
    node.arguments.slice(1).some((argument) => !ts.isIdentifier(argument))
  ) {
    return null;
  }

  return { method, path: pathArgument.text, handler };
}

type ReactRouterJsxRouteElement = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function staticReactRouterJsxPath(initializer: ts.JsxAttribute["initializer"]): string | null {
  if (initializer === undefined) {
    return null;
  }
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (!ts.isJsxExpression(initializer) || initializer.expression === undefined) {
    return null;
  }

  return staticLiteralText(initializer.expression);
}

function staticReactRouterElementHandler(expression: ts.Expression): ts.Identifier | null {
  if (ts.isJsxSelfClosingElement(expression)) {
    return ts.isIdentifier(expression.tagName) ? expression.tagName : null;
  }
  if (ts.isJsxElement(expression)) {
    return ts.isIdentifier(expression.openingElement.tagName)
      ? expression.openingElement.tagName
      : null;
  }
  return null;
}

function staticReactRouterHandler(
  attributeName: "component" | "Component" | "element",
  initializer: ts.JsxAttribute["initializer"]
): ts.Identifier | null {
  if (initializer === undefined) {
    return null;
  }
  if (!ts.isJsxExpression(initializer) || initializer.expression === undefined) {
    return null;
  }
  if (attributeName === "element") {
    return staticReactRouterElementHandler(initializer.expression);
  }
  return ts.isIdentifier(initializer.expression) ? initializer.expression : null;
}

function staticReactRouterDataRoutePath(expression: ts.Expression): string | null {
  return staticLiteralText(expression);
}

function staticReactRouterDataRouteHandler(
  propertyName: "Component" | "element",
  expression: ts.Expression
): ts.Identifier | null {
  return propertyName === "Component"
    ? (ts.isIdentifier(expression) ? expression : null)
    : staticReactRouterElementHandler(expression);
}

function staticReactRouterDataRouteIndex(expression: ts.Expression): boolean | null {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  return null;
}

function staticReactRouterRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/")) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function joinedReactRouterRoutePath(parentPath: string, childPath: string): string | null {
  if (!parentPath.startsWith("/") || !staticReactRouterRelativePath(childPath)) {
    return null;
  }
  const normalizedParent = parentPath === "/" ? "" : parentPath.replace(/\/+$/u, "");
  return `${normalizedParent}/${childPath}`;
}

/**
 * Reads one direct route object without assigning it a public URL yet. A
 * `children` array is independently traversable only when it is a literal;
 * a dynamic child definition never turns into a guessed route. `lazy` may
 * replace the rendered page at runtime, so it rejects the whole object.
 */
function staticReactRouterDataRouteObject(
  expression: ts.Expression
): StaticReactRouterDataRouteDefinition | null {
  if (!ts.isObjectLiteralExpression(expression)) {
    return null;
  }

  const propertyNames = new Set<string>();
  let path: string | undefined;
  let handler: ts.Identifier | undefined;
  let index = false;
  let hasChildren = false;
  const children: StaticReactRouterDataRouteDefinition[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }

    const propertyName = staticPropertyName(property.name);
    if (propertyName === null || propertyNames.has(propertyName)) {
      return null;
    }
    propertyNames.add(propertyName);

    if (propertyName === "path") {
      const staticPath = staticReactRouterDataRoutePath(property.initializer);
      if (staticPath === null) {
        return null;
      }
      path = staticPath;
      continue;
    }

    if (propertyName === "Component" || propertyName === "element") {
      if (handler !== undefined) {
        return null;
      }
      const staticHandler = staticReactRouterDataRouteHandler(propertyName, property.initializer);
      if (staticHandler === null) {
        return null;
      }
      handler = staticHandler;
      continue;
    }

    if (propertyName === "index") {
      const staticIndex = staticReactRouterDataRouteIndex(property.initializer);
      if (staticIndex === null) {
        return null;
      }
      index = staticIndex;
      continue;
    }

    if (propertyName === "children") {
      hasChildren = true;
      if (!ts.isArrayLiteralExpression(property.initializer)) {
        continue;
      }
      for (const child of property.initializer.elements) {
        if (!ts.isExpression(child)) {
          continue;
        }
        const staticChild = staticReactRouterDataRouteObject(child);
        if (staticChild !== null) {
          children.push(staticChild);
        }
      }
      continue;
    }

    if (propertyName === "lazy") {
      return null;
    }
  }

  if (index && (path !== undefined || hasChildren)) {
    return null;
  }

  return {
    declaration: expression,
    path: path ?? null,
    index,
    handler: handler ?? null,
    children
  };
}

function staticReactRouterDataRouteTree(
  route: StaticReactRouterDataRouteDefinition,
  parentPath: string,
  root: boolean
): readonly StaticReactRouterDataRoute[] {
  if (route.index) {
    return route.handler === null
      ? []
      : [
          {
            method: "NAVIGATE",
            path: parentPath,
            handler: route.handler,
            declaration: route.declaration
          }
        ];
  }

  const routePath =
    route.path === null
      ? parentPath
      : root
        ? (route.path.startsWith("/") ? route.path : null)
        : joinedReactRouterRoutePath(parentPath, route.path);
  if (routePath === null) {
    return [];
  }

  const staticRoutes: StaticReactRouterDataRoute[] = [];
  if (route.path !== null && route.handler !== null) {
    staticRoutes.push({
      method: "NAVIGATE",
      path: routePath,
      handler: route.handler,
      declaration: route.declaration
    });
  }
  for (const child of route.children) {
    staticRoutes.push(...staticReactRouterDataRouteTree(child, routePath, false));
  }
  return staticRoutes;
}

/**
 * Supports direct v6.4+ data-router factories imported from React Router.
 * Factory options can change the public URL base, so only the one-argument
 * form is accepted. Root routes require slash-prefixed literal paths; literal
 * children can compose non-empty relative paths or `index: true` routes from
 * that root. Unsupported siblings are skipped independently.
 */
function staticReactRouterDataRoutes(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): readonly StaticReactRouterDataRoute[] {
  if (
    node.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression) ||
    visibleRouteBindingKind(sourceFile, node.expression, bindings) !== "react-router-data-router-factory" ||
    node.arguments.length !== 1
  ) {
    return [];
  }

  const routes = node.arguments[0];
  if (routes === undefined || !ts.isArrayLiteralExpression(routes)) {
    return [];
  }

  const staticRoutes: StaticReactRouterDataRoute[] = [];
  for (const route of routes.elements) {
    if (!ts.isExpression(route)) {
      continue;
    }
    const definition = staticReactRouterDataRouteObject(route);
    if (definition !== null) {
      staticRoutes.push(...staticReactRouterDataRouteTree(definition, "/", true));
    }
  }
  return staticRoutes;
}

const NEXT_PAGES_NON_ROUTE_FILES = new Set(["_app", "_document", "_error", "404", "500"]);

function sourcePathBelowNextRoot(
  filePath: string,
  root: "app" | "pages"
): readonly string[] | null {
  const parts = filePath.replaceAll("\\", "/").split("/");
  const rootIndex =
    parts[0] === root ? 0 : parts[0] === "src" && parts[1] === root ? 1 : -1;
  if (rootIndex === -1 || rootIndex === parts.length - 1) {
    return null;
  }
  return parts.slice(rootIndex + 1);
}

function nextSourceFileStem(fileName: string): string | null {
  const extension = /\.[cm]?[jt]sx?$/i.exec(fileName);
  if (extension === null) {
    return null;
  }
  const stem = fileName.slice(0, -extension[0].length);
  return stem.endsWith(".d") ? null : stem;
}

function nextNavigationPath(segments: readonly string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function staticNextPagesRouterPath(filePath: string): string | null {
  const parts = sourcePathBelowNextRoot(filePath, "pages");
  const fileName = parts?.at(-1);
  if (parts === null || fileName === undefined || parts[0] === "api") {
    return null;
  }

  const stem = nextSourceFileStem(fileName);
  if (stem === null || NEXT_PAGES_NON_ROUTE_FILES.has(stem)) {
    return null;
  }
  return nextNavigationPath([...parts.slice(0, -1), ...(stem === "index" ? [] : [stem])]);
}

function isNextRouteGroup(segment: string): boolean {
  return /^\([A-Za-z0-9][A-Za-z0-9_-]*\)$/.test(segment);
}

/**
 * Intercepting and parallel-route segments change which slot or history state
 * renders a page. Without the complete layout tree, this extractor leaves
 * them outside its proof boundary instead of manufacturing one URL.
 */
function isUnsupportedNextAppSegment(segment: string): boolean {
  return segment.startsWith("@") || (segment.startsWith("(") && !isNextRouteGroup(segment));
}

function staticNextAppRouterPath(filePath: string): string | null {
  const parts = sourcePathBelowNextRoot(filePath, "app");
  const fileName = parts?.at(-1);
  if (parts === null || fileName === undefined || nextSourceFileStem(fileName) !== "page") {
    return null;
  }

  const pathSegments: string[] = [];
  for (const segment of parts.slice(0, -1)) {
    if (isNextRouteGroup(segment)) {
      continue;
    }
    if (segment.length === 0 || isUnsupportedNextAppSegment(segment)) {
      return null;
    }
    pathSegments.push(segment);
  }
  return nextNavigationPath(pathSegments);
}

interface StaticNextDefaultExport {
  readonly declaration: ts.Node;
  readonly handler: ts.Identifier;
}

/**
 * A Next.js page must have exactly one direct, named default export. Named
 * declarations and identifier assignments preserve enough syntax evidence for
 * normal local/import/re-export resolution; wrapped expressions remain out of
 * scope because their rendered handler is not statically explicit.
 */
function staticNextDefaultExport(sourceFile: ts.SourceFile): StaticNextDefaultExport | null {
  const candidates: StaticNextDefaultExport[] = [];
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name !== undefined &&
      hasExportModifier(statement) &&
      hasDefaultModifier(statement)
    ) {
      candidates.push({ declaration: statement, handler: statement.name });
      continue;
    }
    if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      candidates.push({ declaration: statement, handler: statement.expression });
    }
  }
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function staticNextRoute(sourceFile: ts.SourceFile): StaticNextRoute | null {
  const defaultExport = staticNextDefaultExport(sourceFile);
  if (defaultExport === null) {
    return null;
  }

  const pagesPath = staticNextPagesRouterPath(sourceFile.fileName);
  if (pagesPath !== null) {
    return {
      method: "NAVIGATE",
      path: pagesPath,
      handler: defaultExport.handler,
      declaration: defaultExport.declaration,
      routeRegistration: "nextjs-pages-router"
    };
  }

  const appPath = staticNextAppRouterPath(sourceFile.fileName);
  return appPath === null
    ? null
    : {
        method: "NAVIGATE",
        path: appPath,
        handler: defaultExport.handler,
        declaration: defaultExport.declaration,
        routeRegistration: "nextjs-app-router"
      };
}

function isStaticReactRouterJsxRouteElement(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  bindings: ScopedRouteReceiverBindings
): node is ReactRouterJsxRouteElement {
  return (
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    ts.isIdentifier(node.tagName) &&
    visibleRouteBindingKind(sourceFile, node.tagName, bindings) === "react-router-route"
  );
}

function staticReactRouterJsxIndex(initializer: ts.JsxAttribute["initializer"]): boolean | null {
  if (initializer === undefined) {
    return true;
  }
  if (!ts.isJsxExpression(initializer) || initializer.expression === undefined) {
    return null;
  }
  return staticReactRouterDataRouteIndex(initializer.expression);
}

function reactRouterJsxElement(node: ReactRouterJsxRouteElement): ts.JsxElement | null {
  return ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : null;
}

function hasSubstantiveReactRouterJsxChild(child: ts.JsxChild): boolean {
  if (ts.isJsxText(child)) {
    return child.getText().trim().length > 0;
  }
  if (ts.isJsxExpression(child)) {
    return child.expression !== undefined;
  }
  if (ts.isJsxFragment(child)) {
    return child.children.some(hasSubstantiveReactRouterJsxChild);
  }
  return true;
}

function staticReactRouterJsxRouteDefinitions(
  sourceFile: ts.SourceFile,
  children: readonly ts.JsxChild[],
  bindings: ScopedRouteReceiverBindings
): readonly StaticReactRouterJsxRouteDefinition[] {
  const definitions: StaticReactRouterJsxRouteDefinition[] = [];
  for (const child of children) {
    if (ts.isJsxFragment(child)) {
      definitions.push(...staticReactRouterJsxRouteDefinitions(sourceFile, child.children, bindings));
      continue;
    }
    const routeElement = ts.isJsxElement(child) ? child.openingElement : child;
    if (!isStaticReactRouterJsxRouteElement(sourceFile, routeElement, bindings)) {
      continue;
    }
    const definition = staticReactRouterJsxRouteDefinition(sourceFile, routeElement, bindings);
    if (definition !== null) {
      definitions.push(definition);
    }
  }
  return definitions;
}

/**
 * Reads the direct JSX child tree accepted by an imported
 * `createRoutesFromElements(...)` call. The factory gives this JSX tree
 * data-router semantics, so its route facts retain distinct provenance rather
 * than being indistinguishable from an arbitrary declarative JSX route.
 */
function staticReactRouterElementsFactoryRouteDefinitions(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): readonly StaticReactRouterJsxRouteDefinition[] {
  if (
    node.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression) ||
    visibleRouteBindingKind(sourceFile, node.expression, bindings) !== "react-router-elements-factory" ||
    node.arguments.length !== 1
  ) {
    return [];
  }

  const children = node.arguments[0];
  if (children === undefined) {
    return [];
  }
  if (ts.isJsxFragment(children)) {
    return staticReactRouterJsxRouteDefinitions(sourceFile, children.children, bindings);
  }

  const routeElement = ts.isJsxElement(children) ? children.openingElement : children;
  if (!isStaticReactRouterJsxRouteElement(sourceFile, routeElement, bindings)) {
    return [];
  }
  const definition = staticReactRouterJsxRouteDefinition(sourceFile, routeElement, bindings);
  return definition === null ? [] : [definition];
}

function markStaticReactRouterJsxRouteDefinitionDeclarations(
  definition: StaticReactRouterJsxRouteDefinition,
  declarations: Set<ReactRouterJsxRouteElement>
): void {
  declarations.add(definition.declaration);
  for (const child of definition.children) {
    markStaticReactRouterJsxRouteDefinitionDeclarations(child, declarations);
  }
}

/**
 * Reads one imported JSX `Route` without assigning it a public URL yet. Only
 * direct literal route children (including direct fragments) are traversed;
 * conditional or arbitrary JSX descendants never become guessed navigation.
 */
function staticReactRouterJsxRouteDefinition(
  sourceFile: ts.SourceFile,
  node: ReactRouterJsxRouteElement,
  bindings: ScopedRouteReceiverBindings
): StaticReactRouterJsxRouteDefinition | null {
  if (!isStaticReactRouterJsxRouteElement(sourceFile, node, bindings)) {
    return null;
  }

  let path: string | undefined;
  let handler: ts.Identifier | undefined;
  let index = false;
  let hasIndex = false;
  let legacyComponent = false;
  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) {
      return null;
    }

    const attributeName = property.name.text;
    if (attributeName === "path") {
      if (path !== undefined) {
        return null;
      }
      const staticPath = staticReactRouterJsxPath(property.initializer);
      if (staticPath === null) {
        return null;
      }
      path = staticPath;
      continue;
    }

    if (attributeName === "component" || attributeName === "Component" || attributeName === "element") {
      if (handler !== undefined) {
        return null;
      }
      const staticHandler = staticReactRouterHandler(attributeName, property.initializer);
      if (staticHandler === null) {
        return null;
      }
      handler = staticHandler;
      legacyComponent = attributeName === "component";
      continue;
    }

    if (attributeName === "index") {
      if (hasIndex) {
        return null;
      }
      const staticIndex = staticReactRouterJsxIndex(property.initializer);
      if (staticIndex === null) {
        return null;
      }
      index = staticIndex;
      hasIndex = true;
    }
  }

  const element = reactRouterJsxElement(node);
  const children = element === null
    ? []
    : staticReactRouterJsxRouteDefinitions(sourceFile, element.children, bindings);
  const hasChildren = element !== null && element.children.some(hasSubstantiveReactRouterJsxChild);
  if (index && (path !== undefined || hasChildren)) {
    return null;
  }

  return {
    declaration: node,
    path: path ?? null,
    index,
    legacyComponent,
    handler: handler ?? null,
    children
  };
}

function staticReactRouterJsxRouteTree(
  route: StaticReactRouterJsxRouteDefinition,
  parentPath: string,
  root: boolean
): readonly StaticReactRouterJsxRoute[] {
  if (route.index) {
    return route.legacyComponent || route.handler === null
      ? []
      : [
          {
            method: "NAVIGATE",
            path: parentPath,
            handler: route.handler,
            declaration: route.declaration
          }
        ];
  }

  const routePath =
    route.path === null
      ? parentPath
      : root
        ? (route.path.startsWith("/") ? route.path : null)
        : joinedReactRouterRoutePath(parentPath, route.path);
  if (routePath === null) {
    return [];
  }

  if (!root && route.legacyComponent) {
    return [];
  }

  const staticRoutes: StaticReactRouterJsxRoute[] = [];
  if (route.path !== null && route.handler !== null) {
    staticRoutes.push({
      method: "NAVIGATE",
      path: routePath,
      handler: route.handler,
      declaration: route.declaration
    });
  }
  if (route.legacyComponent) {
    return staticRoutes;
  }
  for (const child of route.children) {
    staticRoutes.push(...staticReactRouterJsxRouteTree(child, routePath, false));
  }
  return staticRoutes;
}

function staticReactRouterJsxRouteHasRouteAncestor(
  sourceFile: ts.SourceFile,
  node: ReactRouterJsxRouteElement,
  bindings: ScopedRouteReceiverBindings
): boolean {
  let ancestor: ts.Node | undefined = ts.isJsxOpeningElement(node) ? node.parent.parent : node.parent;
  while (ancestor !== undefined) {
    if (
      (ts.isJsxElement(ancestor) &&
        isStaticReactRouterJsxRouteElement(sourceFile, ancestor.openingElement, bindings)) ||
      (ts.isJsxSelfClosingElement(ancestor) &&
        isStaticReactRouterJsxRouteElement(sourceFile, ancestor, bindings))
    ) {
      return true;
    }
    ancestor = ancestor.parent;
  }
  return false;
}

function staticRouteMethodForName(
  methodName: string,
  supportedMethods: readonly RouteMethod[]
): RouteMethod | undefined {
  return supportedMethods.find((candidate) => candidate.toLowerCase() === methodName);
}

function staticFastifyPath(expression: ts.Expression | undefined): string | null {
  const path = staticLiteralText(expression);
  return path !== null && path.startsWith("/") ? path : null;
}

function staticFastifyProjectedPath(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  routePath: string,
  bindings: ScopedRouteReceiverBindings
): Pick<StaticFastifyRoute, "path" | "routeRegistration"> | null {
  const context = fastifyRouteReceiverContext(sourceFile, receiver, bindings);
  if (context === undefined) {
    return null;
  }
  if (context.prefix.length === 0) {
    return { path: routePath };
  }
  // Fastify's `prefixTrailingSlash` setting can emit one or two concrete
  // routes for `/` inside a prefixed plugin. Preserve that uncertainty rather
  // than selecting a path that source alone cannot prove.
  if (routePath === "/") {
    return null;
  }
  if (context.routeRegistration === undefined) {
    return null;
  }
  return {
    path: `${context.prefix}${routePath}`,
    routeRegistration: context.routeRegistration
  };
}

/**
 * Like staticObjectProperty, but permits the one direct handler shorthand
 * that Fastify route objects commonly use: { method: "GET", url: "/x", handler }.
 */
function staticFastifyObjectProperty(
  object: ts.ObjectLiteralExpression,
  propertyName: string
): ts.Expression | null | undefined {
  let result: ts.Expression | undefined;
  for (const property of object.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text !== "handler" || property.objectAssignmentInitializer !== undefined) {
        return null;
      }
      if (propertyName !== "handler") {
        continue;
      }
      if (result !== undefined) {
        return null;
      }
      result = property.name;
      continue;
    }

    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }
    if (staticPropertyName(property.name) !== propertyName) {
      continue;
    }
    if (result !== undefined) {
      return null;
    }
    result = property.initializer;
  }
  return result;
}

function staticFastifyObjectRouteMethods(expression: ts.Expression): readonly RouteMethod[] | null {
  const staticMethod = (candidate: ts.Expression): RouteMethod | null => {
    const method = staticLiteralText(candidate);
    return method !== null && (FASTIFY_OBJECT_ROUTE_METHODS as readonly RouteMethod[]).includes(method as RouteMethod)
      ? (method as RouteMethod)
      : null;
  };

  if (!ts.isArrayLiteralExpression(expression)) {
    const method = staticMethod(expression);
    return method === null ? null : [method];
  }

  const methods: RouteMethod[] = [];
  for (const element of expression.elements) {
    const method = ts.isExpression(element) ? staticMethod(element) : null;
    if (method === null || methods.includes(method)) {
      return null;
    }
    methods.push(method);
  }
  return methods.length === 0 ? null : methods;
}

function staticFastifyRouteObjectShapes(
  node: ts.CallExpression
): readonly StaticFastifyRouteShape[] {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.name.text !== "route" ||
    node.arguments.length !== 1
  ) {
    return [];
  }

  const options = node.arguments[0];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return [];
  }

  const method = staticFastifyObjectProperty(options, "method");
  const url = staticFastifyObjectProperty(options, "url");
  const path = staticFastifyObjectProperty(options, "path");
  const handler = staticFastifyObjectProperty(options, "handler");
  if (
    method === undefined ||
    method === null ||
    url === null ||
    path === null ||
    handler === undefined ||
    handler === null ||
    (url === undefined && path === undefined) ||
    (url !== undefined && path !== undefined) ||
    !ts.isIdentifier(handler)
  ) {
    return [];
  }

  const staticPath = staticFastifyPath(url ?? path);
  const methods = staticFastifyObjectRouteMethods(method);
  if (methods === null || staticPath === null) {
    return [];
  }

  return methods.map((routeMethod) => ({ method: routeMethod, path: staticPath, handler }));
}

function staticFastifyRouteShapes(node: ts.CallExpression): readonly StaticFastifyRouteShape[] {
  const objectRoutes = staticFastifyRouteObjectShapes(node);
  if (objectRoutes.length > 0) {
    return objectRoutes;
  }

  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return [];
  }

  const method = staticRouteMethodForName(
    node.expression.name.text,
    FASTIFY_SHORTHAND_ROUTE_METHODS
  );
  const pathArgument = node.arguments[0];
  const handler = node.arguments.at(-1);
  const staticPath = staticFastifyPath(pathArgument);
  if (
    method === undefined ||
    node.arguments.length < 2 ||
    node.arguments.length > 3 ||
    staticPath === null ||
    handler === undefined ||
    !ts.isIdentifier(handler)
  ) {
    return [];
  }

  return [{ method, path: staticPath, handler }];
}

function staticFastifyRoutes(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): readonly StaticFastifyRoute[] {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return [];
  }

  const receiver = node.expression.expression;
  return staticFastifyRouteShapes(node).flatMap((route) => {
    const projectedPath = staticFastifyProjectedPath(sourceFile, receiver, route.path, bindings);
    return projectedPath === null ? [] : [{ ...route, ...projectedPath }];
  });
}

interface StaticFastifyPluginRegisterCall {
  readonly receiver: ts.Identifier;
  readonly plugin: ts.Identifier;
  readonly prefix: string;
}

function staticFastifyPluginRegisterCall(
  node: ts.CallExpression
): StaticFastifyPluginRegisterCall | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    node.expression.name.text !== "register" ||
    !ts.isIdentifier(node.expression.expression) ||
    node.arguments.length !== 2
  ) {
    return null;
  }

  const plugin = node.arguments[0];
  const prefix = staticFastifyPluginPrefix(node.arguments[1]);
  return plugin !== undefined && ts.isIdentifier(plugin) && prefix !== null
    ? { receiver: node.expression.expression, plugin, prefix }
    : null;
}

function fastifyPluginSymbolReference(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier
): FastifyPluginSymbolReference {
  return {
    name: identifier.text,
    range: sourceRange(sourceFile, identifier),
    scopeIds: enclosingScopeIds(sourceFile, identifier)
  };
}

function isRuntimeImportedValueBinding(declaration: ts.Node | undefined): boolean {
  if (declaration === undefined) {
    return false;
  }
  const importSpecifier = ts.isImportSpecifier(declaration)
    ? declaration
    : ts.isIdentifier(declaration) &&
        ts.isImportSpecifier(declaration.parent) &&
        declaration.parent.name === declaration
      ? declaration.parent
      : undefined;
  if (importSpecifier !== undefined) {
    const namedImports = importSpecifier.parent;
    const importClause = namedImports.parent;
    return (
      !importSpecifier.isTypeOnly &&
      ts.isNamedImports(namedImports) &&
      ts.isImportClause(importClause) &&
      importClause.isTypeOnly !== true
    );
  }
  return (
    ts.isIdentifier(declaration) &&
    ts.isImportClause(declaration.parent) &&
    declaration.parent.name === declaration &&
    declaration.parent.isTypeOnly !== true
  );
}

function staticFastifyImportedPluginRootRegistration(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): FastifyPluginFacts["rootRegistrations"][number] | null {
  const registration = staticFastifyPluginRegisterCall(node);
  if (
    registration === null ||
    visibleRouteBindingKind(sourceFile, registration.receiver, bindings) !== "fastify-receiver" ||
    !isRuntimeImportedValueBinding(
      visibleRouteBinding(sourceFile, registration.plugin, bindings)?.declaration
    )
  ) {
    return null;
  }

  return {
    plugin: fastifyPluginSymbolReference(sourceFile, registration.plugin),
    prefix: registration.prefix
  };
}

function staticFastifyPluginChildRegistration(input: {
  readonly sourceFile: ts.SourceFile;
  readonly node: ts.CallExpression;
  readonly bindings: ScopedRouteReceiverBindings;
  readonly callbacks: ScopedFastifyPluginCallbacks;
  readonly symbolsByDeclaration: ReadonlyMap<ts.Node, SymbolNode>;
}): FastifyPluginFacts["childRegistrations"][number] | null {
  const registration = staticFastifyPluginRegisterCall(input.node);
  if (registration === null) {
    return null;
  }

  const receiverDeclaration = visibleRouteBinding(
    input.sourceFile,
    registration.receiver,
    input.bindings
  )?.declaration;
  const callback =
    receiverDeclaration !== undefined && ts.isParameter(receiverDeclaration)
      ? input.callbacks.byReceiverDeclaration.get(receiverDeclaration)
      : undefined;
  const parentPlugin = callback === undefined
    ? undefined
    : input.symbolsByDeclaration.get(callback.declaration);
  if (parentPlugin === undefined) {
    return null;
  }

  return {
    parentPluginId: parentPlugin.id,
    plugin: fastifyPluginSymbolReference(input.sourceFile, registration.plugin),
    prefix: registration.prefix
  };
}

interface StaticFastifyPluginRouteCandidate {
  readonly plugin: StaticLocalFastifyPluginCallback;
  readonly route: StaticFastifyRouteShape;
  readonly node: ts.CallExpression;
}

function staticFastifyPluginRouteCandidates(input: {
  readonly sourceFile: ts.SourceFile;
  readonly node: ts.CallExpression;
  readonly bindings: ScopedRouteReceiverBindings;
  readonly callbacks: ScopedFastifyPluginCallbacks;
}): readonly StaticFastifyPluginRouteCandidate[] {
  if (
    input.node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(input.node.expression) ||
    input.node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(input.node.expression.expression)
  ) {
    return [];
  }

  const receiverDeclaration = visibleRouteBinding(
    input.sourceFile,
    input.node.expression.expression,
    input.bindings
  )?.declaration;
  const plugin =
    receiverDeclaration !== undefined && ts.isParameter(receiverDeclaration)
      ? input.callbacks.byReceiverDeclaration.get(receiverDeclaration)
      : undefined;
  return plugin === undefined
    ? []
    : staticFastifyRouteShapes(input.node).map((route) => ({ plugin, route, node: input.node }));
}

function isNestCommonImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@nestjs/common" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isNestCoreImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@nestjs/core" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isNestGraphqlImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@nestjs/graphql" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isNestMicroservicesImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@nestjs/microservices" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isNestWebsocketsImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@nestjs/websockets" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function nestDecoratorImportBinding(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): Pick<NestDecoratorBinding, "kind" | "method"> {
  if (element.isTypeOnly) {
    return NEST_OTHER_DECORATOR_BINDING;
  }

  const importedName = element.propertyName?.text ?? element.name.text;
  if (isNestCoreImport(statement) && importedName === "RouterModule") {
    return { kind: "nest-router-module", method: null };
  }

  if (isNestGraphqlImport(statement)) {
    if (importedName === "Resolver") {
      return { kind: "nest-graphql-resolver", method: null };
    }
    if (importedName === "Query") {
      return { kind: "nest-graphql-query", method: null };
    }
    if (importedName === "Mutation") {
      return { kind: "nest-graphql-mutation", method: null };
    }
    if (importedName === "Subscription") {
      return { kind: "nest-graphql-subscription", method: null };
    }
    return NEST_OTHER_DECORATOR_BINDING;
  }

  if (isNestMicroservicesImport(statement)) {
    if (importedName === "MessagePattern") {
      return { kind: "nest-microservice-message", method: null };
    }
    if (importedName === "EventPattern") {
      return { kind: "nest-microservice-event", method: null };
    }
    return NEST_OTHER_DECORATOR_BINDING;
  }

  if (isNestWebsocketsImport(statement)) {
    if (importedName === "WebSocketGateway") {
      return { kind: "nest-websocket-gateway", method: null };
    }
    if (importedName === "SubscribeMessage") {
      return { kind: "nest-websocket-subscribe", method: null };
    }
    return NEST_OTHER_DECORATOR_BINDING;
  }

  if (!isNestCommonImport(statement)) {
    return NEST_OTHER_DECORATOR_BINDING;
  }

  if (importedName === "Controller") {
    return { kind: "nest-controller", method: null };
  }

  if (importedName === "Module") {
    return { kind: "nest-module", method: null };
  }

  const method = NEST_HTTP_DECORATOR_METHODS[importedName];
  return method === undefined ? NEST_OTHER_DECORATOR_BINDING : { kind: "nest-route", method };
}

function addScopedNestDecoratorBinding(
  byScopeId: Map<string, Map<string, NestDecoratorBinding[]>>,
  scopeId: string | undefined,
  names: readonly string[],
  declaration: ts.Node,
  binding: Pick<NestDecoratorBinding, "kind" | "method"> = NEST_OTHER_DECORATOR_BINDING
): void {
  if (scopeId === undefined) {
    return;
  }

  const bindings = byScopeId.get(scopeId) ?? new Map<string, NestDecoratorBinding[]>();
  for (const name of names) {
    const candidates = bindings.get(name) ?? [];
    candidates.push({ declaration, ...binding });
    bindings.set(name, candidates);
  }
  byScopeId.set(scopeId, bindings);
}

/**
 * Collects only lexical value bindings so an imported Nest decorator cannot be
 * inferred from its spelling. An inner declaration or duplicate binding blocks
 * the import just as it does for Express receiver extraction.
 */
function collectScopedNestDecoratorBindings(sourceFile: ts.SourceFile): ScopedNestDecoratorBindings {
  const byScopeId = new Map<string, Map<string, NestDecoratorBinding[]>>();
  const rootScopeId = sourceScopeId(sourceFile);

  function collectBindings(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        addScopedNestDecoratorBinding(byScopeId, rootScopeId, [importClause.name.text], importClause.name);
      }
      if (importClause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          addScopedNestDecoratorBinding(
            byScopeId,
            rootScopeId,
            [importClause.namedBindings.name.text],
            importClause.namedBindings.name
          );
        } else {
          for (const element of importClause.namedBindings.elements) {
            addScopedNestDecoratorBinding(
              byScopeId,
              rootScopeId,
              [element.name.text],
              element,
              nestDecoratorImportBinding(node, element)
            );
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      addScopedNestDecoratorBinding(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        bindingNames(node.name),
        node
      );
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      if (node.name !== undefined) {
        const scopeId = declarationScopeId(sourceFile, node, {
          name: node.name.text,
          kind: ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ? "class" : "variable",
          isExported: false
        });
        addScopedNestDecoratorBinding(byScopeId, scopeId, [node.name.text], node);
      }
    }

    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      addScopedNestDecoratorBinding(byScopeId, scopeIdFor(sourceFile, node), [node.name.text], node);
    }

    if (ts.isFunctionLike(node)) {
      const scopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        addScopedNestDecoratorBinding(byScopeId, scopeId, bindingNames(parameter.name), parameter);
      }
    }

    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      addScopedNestDecoratorBinding(
        byScopeId,
        scopeIdFor(sourceFile, node),
        bindingNames(node.variableDeclaration.name),
        node.variableDeclaration
      );
    }

    ts.forEachChild(node, collectBindings);
  }

  ts.forEachChild(sourceFile, collectBindings);
  return { byScopeId };
}

function visibleNestDecoratorBinding(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedNestDecoratorBindings
): NestDecoratorBinding | null {
  for (const scopeId of enclosingScopeIds(sourceFile, identifier)) {
    const candidates = bindings.byScopeId.get(scopeId)?.get(identifier.text);
    if (candidates !== undefined) {
      return candidates.length === 1 ? candidates[0] ?? null : null;
    }
  }
  return null;
}

function decoratorsFor(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function literalNestRoutePaths(arguments_: ts.NodeArray<ts.Expression>): readonly string[] | null {
  if (arguments_.length === 0) {
    return [""];
  }
  if (arguments_.length !== 1) {
    return null;
  }

  const argument = arguments_[0];
  if (
    argument !== undefined &&
    (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return [argument.text];
  }

  return null;
}

interface StaticNestDecorator {
  readonly decorator: ts.Decorator;
  readonly binding: NestDecoratorBinding;
  readonly paths: readonly string[];
}

interface DirectNestDecorator {
  readonly decorator: ts.Decorator;
  readonly binding: NestDecoratorBinding;
  readonly expression: ts.CallExpression;
}

function directNestDecorator(
  sourceFile: ts.SourceFile,
  decorator: ts.Decorator,
  bindings: ScopedNestDecoratorBindings
): DirectNestDecorator | null {
  const expression = decorator.expression;
  if (
    !ts.isCallExpression(expression) ||
    expression.questionDotToken !== undefined ||
    !ts.isIdentifier(expression.expression)
  ) {
    return null;
  }

  const binding = visibleNestDecoratorBinding(sourceFile, expression.expression, bindings);
  if (binding === null || binding.kind === "other") {
    return null;
  }

  return { decorator, binding, expression };
}

function staticNestDecorator(
  sourceFile: ts.SourceFile,
  decorator: ts.Decorator,
  bindings: ScopedNestDecoratorBindings
): StaticNestDecorator | null {
  const direct = directNestDecorator(sourceFile, decorator, bindings);
  if (direct === null) {
    return null;
  }

  const paths = literalNestRoutePaths(direct.expression.arguments);
  return paths === null ? null : { decorator, binding: direct.binding, paths };
}

function nestRoutePathPart(path: string): string {
  return path.replace(/^\/+|\/+$/gu, "");
}

function joinNestRoutePath(controllerPath: string, methodPath: string): string {
  const parts = [nestRoutePathPart(controllerPath), nestRoutePathPart(methodPath)].filter(
    (part) => part.length > 0
  );
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function isStaticMethod(method: ts.MethodDeclaration): boolean {
  return (method as ModifierCarrier).modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
  ) ?? false;
}

function staticNestRoutes(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestRoute[] {
  const controllers = decoratorsFor(declaration).flatMap((decorator) => {
    const candidate = staticNestDecorator(sourceFile, decorator, bindings);
    return candidate?.binding.kind === "nest-controller" ? [candidate] : [];
  });
  if (controllers.length !== 1) {
    return [];
  }

  const controller = controllers[0];
  if (controller === undefined) {
    return [];
  }

  const routes: StaticNestRoute[] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member) || member.body === undefined || isStaticMethod(member)) {
      continue;
    }

    for (const decorator of decoratorsFor(member)) {
      const candidate = staticNestDecorator(sourceFile, decorator, bindings);
      if (candidate?.binding.kind !== "nest-route" || candidate.binding.method === null) {
        continue;
      }

      for (const controllerPath of controller.paths) {
        for (const methodPath of candidate.paths) {
          routes.push({
            method: candidate.binding.method,
            path: joinNestRoutePath(controllerPath, methodPath),
            decorator: candidate.decorator,
            controller: declaration,
            handler: member
          });
        }
      }
    }
  }

  return routes;
}

function staticNestMethodName(method: ts.MethodDeclaration): string | null {
  const name = method.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : null;
}

function directNestClassDecorators(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings,
  kind: NestDecoratorBindingKind
): readonly DirectNestDecorator[] {
  return decoratorsFor(declaration).flatMap((decorator) => {
    const candidate = directNestDecorator(sourceFile, decorator, bindings);
    return candidate?.binding.kind === kind ? [candidate] : [];
  });
}

function staticLiteralText(expression: ts.Expression | undefined): string | null {
  return expression !== undefined &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;
}

function staticGraphqlOptionsName(
  expression: ts.Expression | undefined
): string | null | undefined {
  if (expression === undefined || !ts.isObjectLiteralExpression(expression)) {
    return null;
  }

  const name = staticObjectProperty(expression, "name");
  if (name === null) {
    return null;
  }
  if (name === undefined) {
    return undefined;
  }

  return staticLiteralText(name);
}

function staticGraphqlOperationName(
  arguments_: ts.NodeArray<ts.Expression>,
  handlerName: string
): string | null {
  if (arguments_.length === 0) {
    return handlerName;
  }

  const first = arguments_[0];
  const explicitName = staticLiteralText(first);
  if (explicitName !== null) {
    if (arguments_.length === 1) {
      return explicitName;
    }
    if (arguments_.length !== 2) {
      return null;
    }
    const optionName = staticGraphqlOptionsName(arguments_[1]);
    return optionName === undefined || optionName === explicitName ? explicitName : null;
  }

  if (first === undefined || !ts.isArrowFunction(first)) {
    return null;
  }
  if (arguments_.length === 1) {
    return handlerName;
  }
  if (arguments_.length !== 2) {
    return null;
  }

  const optionName = staticGraphqlOptionsName(arguments_[1]);
  return optionName === undefined ? handlerName : optionName;
}

type StaticNestJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly StaticNestJsonValue[]
  | { readonly [key: string]: StaticNestJsonValue };

function staticNestJsonValue(expression: ts.Expression): StaticNestJsonValue | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text);
    return Number.isFinite(value) ? value : undefined;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: StaticNestJsonValue[] = [];
    for (const element of expression.elements) {
      if (!ts.isExpression(element)) {
        return undefined;
      }
      const value = staticNestJsonValue(element);
      if (value === undefined) {
        return undefined;
      }
      values.push(value);
    }
    return values;
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    return undefined;
  }

  const entries: Array<readonly [string, StaticNestJsonValue]> = [];
  const keys = new Set<string>();
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return undefined;
    }
    const key = staticPropertyName(property.name);
    const value = staticNestJsonValue(property.initializer);
    // `__proto__` in an object literal is a prototype setter rather than an
    // ordinary JSON data property. Treating it as a pattern key would claim a
    // runtime object shape that the source does not prove.
    if (key === null || key === "__proto__" || value === undefined || keys.has(key)) {
      return undefined;
    }
    keys.add(key);
    entries.push([key, value]);
  }

  const object = Object.create(null) as Record<string, StaticNestJsonValue>;
  for (const [key, value] of entries.sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )) {
    object[key] = value;
  }
  return object;
}

function staticNestMicroservicePattern(arguments_: ts.NodeArray<ts.Expression>): string | null {
  const pattern = arguments_[0];
  const literal = staticLiteralText(pattern);
  if (literal !== null) {
    return literal;
  }
  if (pattern === undefined || !ts.isObjectLiteralExpression(pattern)) {
    return null;
  }

  const value = staticNestJsonValue(pattern);
  const encoded = value === undefined ? undefined : JSON.stringify(value);
  return encoded === undefined ? null : encoded;
}

function staticNestGatewayNamespace(arguments_: ts.NodeArray<ts.Expression>): string | null {
  if (arguments_.length === 0) {
    return "";
  }

  const first = arguments_[0];
  const second = arguments_[1];
  if (first === undefined) {
    return null;
  }
  const options =
    arguments_.length === 1 && ts.isObjectLiteralExpression(first)
      ? first
      : arguments_.length === 1 && ts.isNumericLiteral(first)
        ? undefined
        : arguments_.length === 2 && ts.isNumericLiteral(first) && second !== undefined && ts.isObjectLiteralExpression(second)
          ? second
          : null;
  if (options === null) {
    return null;
  }
  if (options === undefined) {
    return "";
  }

  const namespace = staticObjectProperty(options, "namespace");
  if (namespace === undefined) {
    return "";
  }
  return namespace === null ? null : staticLiteralText(namespace);
}

function staticNestGraphqlEntrypoints(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestEntrypoint[] {
  if (directNestClassDecorators(sourceFile, declaration, bindings, "nest-graphql-resolver").length !== 1) {
    return [];
  }

  const entrypoints: StaticNestEntrypoint[] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member) || member.body === undefined || isStaticMethod(member)) {
      continue;
    }
    const handlerName = staticNestMethodName(member);
    if (handlerName === null) {
      continue;
    }

    for (const decorator of decoratorsFor(member)) {
      const candidate = directNestDecorator(sourceFile, decorator, bindings);
      if (candidate === null) {
        continue;
      }
      const operation = NEST_GRAPHQL_OPERATION_BY_BINDING[candidate.binding.kind];
      const name = staticGraphqlOperationName(candidate.expression.arguments, handlerName);
      if (operation !== undefined && name !== null) {
        entrypoints.push({
          transport: "graphql",
          operation,
          name,
          decorator: candidate.decorator,
          handler: member
        });
      }
    }
  }
  return entrypoints;
}

function staticNestMicroserviceEntrypoints(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestEntrypoint[] {
  if (directNestClassDecorators(sourceFile, declaration, bindings, "nest-controller").length !== 1) {
    return [];
  }

  const entrypoints: StaticNestEntrypoint[] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member) || member.body === undefined || isStaticMethod(member)) {
      continue;
    }
    if (staticNestMethodName(member) === null) {
      continue;
    }

    for (const decorator of decoratorsFor(member)) {
      const candidate = directNestDecorator(sourceFile, decorator, bindings);
      if (candidate === null) {
        continue;
      }
      const operation = NEST_MICROSERVICE_OPERATION_BY_BINDING[candidate.binding.kind];
      const name = staticNestMicroservicePattern(candidate.expression.arguments);
      if (operation !== undefined && name !== null) {
        entrypoints.push({
          transport: "microservice",
          operation,
          name,
          decorator: candidate.decorator,
          handler: member
        });
      }
    }
  }
  return entrypoints;
}

function staticNestWebSocketEntrypoints(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestEntrypoint[] {
  const gateways = directNestClassDecorators(
    sourceFile,
    declaration,
    bindings,
    "nest-websocket-gateway"
  );
  if (gateways.length !== 1) {
    return [];
  }
  const gateway = gateways[0];
  if (gateway === undefined) {
    return [];
  }
  const namespace = staticNestGatewayNamespace(gateway.expression.arguments);
  if (namespace === null) {
    return [];
  }

  const entrypoints: StaticNestEntrypoint[] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member) || member.body === undefined || isStaticMethod(member)) {
      continue;
    }
    if (staticNestMethodName(member) === null) {
      continue;
    }

    for (const decorator of decoratorsFor(member)) {
      const candidate = directNestDecorator(sourceFile, decorator, bindings);
      if (candidate?.binding.kind !== "nest-websocket-subscribe") {
        continue;
      }
      const event = staticLiteralText(candidate.expression.arguments[0]);
      if (event === null || candidate.expression.arguments.length !== 1) {
        continue;
      }
      entrypoints.push({
        transport: "websocket",
        operation: "subscribe",
        name: namespace.length === 0 ? event : `${namespace}:${event}`,
        decorator: candidate.decorator,
        handler: member
      });
    }
  }
  return entrypoints;
}

function staticNestEntrypoints(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestEntrypoint[] {
  return [
    ...staticNestGraphqlEntrypoints(sourceFile, declaration, bindings),
    ...staticNestMicroserviceEntrypoints(sourceFile, declaration, bindings),
    ...staticNestWebSocketEntrypoints(sourceFile, declaration, bindings)
  ];
}

function staticPropertyName(property: ts.PropertyName): string | null {
  return ts.isIdentifier(property) || ts.isStringLiteral(property) || ts.isNoSubstitutionTemplateLiteral(property)
    ? property.text
    : null;
}

/**
 * Returns `undefined` when a field is absent and `null` when object shape
 * could change it dynamically (for example spread, computed, or duplicate).
 */
function staticObjectProperty(
  object: ts.ObjectLiteralExpression,
  propertyName: string
): ts.Expression | null | undefined {
  let result: ts.Expression | undefined;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }

    if (staticPropertyName(property.name) !== propertyName) {
      continue;
    }

    if (result !== undefined) {
      return null;
    }
    result = property.initializer;
  }

  return result;
}

function staticIdentifierArray(expression: ts.Expression): readonly ts.Identifier[] | null {
  if (!ts.isArrayLiteralExpression(expression) || expression.elements.some((element) => !ts.isIdentifier(element))) {
    return null;
  }

  return expression.elements.filter(ts.isIdentifier);
}

function staticNestRouterModulePrefixes(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  bindings: ScopedNestDecoratorBindings
): readonly StaticNestRouterModulePrefix[] {
  if (
    !ts.isCallExpression(expression) ||
    expression.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.questionDotToken !== undefined ||
    expression.expression.name.text !== "register" ||
    !ts.isIdentifier(expression.expression.expression) ||
    expression.arguments.length !== 1
  ) {
    return [];
  }

  const binding = visibleNestDecoratorBinding(sourceFile, expression.expression.expression, bindings);
  const routes = expression.arguments[0];
  if (
    binding?.kind !== "nest-router-module" ||
    routes === undefined ||
    !ts.isArrayLiteralExpression(routes)
  ) {
    return [];
  }

  return routes.elements.flatMap((route) => staticNestRouterModuleRoute(route, ""));
}

function staticNestRouterModuleRoute(
  expression: ts.Expression,
  parentPrefix: string
): readonly StaticNestRouterModulePrefix[] {
  if (!ts.isObjectLiteralExpression(expression)) {
    return [];
  }

  const path = staticObjectProperty(expression, "path");
  const module = staticObjectProperty(expression, "module");
  const children = staticObjectProperty(expression, "children");
  if (
    path === null ||
    module === null ||
    children === null ||
    path === undefined ||
    module === undefined ||
    !(ts.isStringLiteral(path) || ts.isNoSubstitutionTemplateLiteral(path)) ||
    !ts.isIdentifier(module)
  ) {
    return [];
  }

  const prefix = joinNestRoutePath(parentPrefix, path.text);
  const childPrefixes =
    children === undefined || !ts.isArrayLiteralExpression(children)
      ? []
      : children.elements.flatMap((child) => staticNestRouterModuleRoute(child, prefix));
  return [{ module, prefix }, ...childPrefixes];
}

function staticNestModuleDecorator(
  sourceFile: ts.SourceFile,
  decorator: ts.Decorator,
  bindings: ScopedNestDecoratorBindings
): ts.ObjectLiteralExpression | null {
  const expression = decorator.expression;
  if (
    !ts.isCallExpression(expression) ||
    expression.questionDotToken !== undefined ||
    !ts.isIdentifier(expression.expression) ||
    expression.arguments.length !== 1
  ) {
    return null;
  }

  const argument = expression.arguments[0];
  return visibleNestDecoratorBinding(sourceFile, expression.expression, bindings)?.kind === "nest-module" &&
    argument !== undefined &&
    ts.isObjectLiteralExpression(argument)
    ? argument
    : null;
}

function staticNestModuleDefinition(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): StaticNestModuleDefinition | null {
  const moduleObjects = decoratorsFor(declaration)
    .map((decorator) => staticNestModuleDecorator(sourceFile, decorator, bindings))
    .filter((object): object is ts.ObjectLiteralExpression => object !== null);
  if (moduleObjects.length !== 1) {
    return null;
  }

  const moduleObject = moduleObjects[0];
  if (moduleObject === undefined) {
    return null;
  }

  const controllers = staticObjectProperty(moduleObject, "controllers");
  const imports = staticObjectProperty(moduleObject, "imports");
  if (controllers === null || imports === null) {
    return null;
  }

  const controllerReferences =
    controllers === undefined ? [] : staticIdentifierArray(controllers) ?? [];
  const routerModulePrefixes =
    imports === undefined || !ts.isArrayLiteralExpression(imports)
      ? []
      : imports.elements.flatMap((entry) =>
          staticNestRouterModulePrefixes(sourceFile, entry, bindings)
        );
  return { controllers: controllerReferences, routerModulePrefixes };
}

function nestSymbolReference(sourceFile: ts.SourceFile, identifier: ts.Identifier) {
  return {
    name: identifier.text,
    range: sourceRange(sourceFile, identifier),
    scopeIds: enclosingScopeIds(sourceFile, identifier)
  };
}

function fileNodeFor(sourceFile: ts.SourceFile, input: ExtractFileFactsInput): SymbolNode {
  const fileName = input.filePath.split("/").at(-1) ?? input.filePath;
  return {
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
    range: sourceRange(sourceFile, sourceFile),
    isExported: true,
    declarationOrdinal: 0
  };
}

/**
 * Extracts only file-local, syntax-proven facts. Cross-file resolution is deliberately
 * left to the application layer so an unresolved reference cannot become a false edge.
 */
export function extractFileFacts(input: ExtractFileFactsInput): ExtractedFileFacts {
  if (input.language === "python") {
    return extractPythonFileFacts({ ...input, language: "python" });
  }
  if (input.language === "go") {
    return extractGoFileFacts({ ...input, language: "go" });
  }
  if (input.language === "rust") {
    return extractRustFileFacts({ ...input, language: "rust" });
  }
  if (input.language === "java") {
    return extractJavaFileFacts({ ...input, language: "java" });
  }

  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(input)
  );
  const explicitExportNames = collectExplicitExportNames(sourceFile);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const importBindings: ImportBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const reExportBindings: ReExportBinding[] = [];
  const nestRouteFacts: {
    routeControllers: NestRouteFacts["routeControllers"][number][];
    moduleControllers: NestRouteFacts["moduleControllers"][number][];
    routerModulePrefixes: NestRouteFacts["routerModulePrefixes"][number][];
  } = {
    routeControllers: [],
    moduleControllers: [],
    routerModulePrefixes: []
  };
  const declarationOrdinals = new Map<string, number>();
  const routeReceiverBindings = collectScopedRouteReceiverBindings(sourceFile);
  const fastifyPluginCallbacks = collectScopedFastifyPluginCallbacks(sourceFile, routeReceiverBindings);
  const nestDecoratorBindings = collectScopedNestDecoratorBindings(sourceFile);
  const symbolsByDeclaration = new Map<ts.Node, SymbolNode>();
  const reactRouterElementsFactoryRouteDeclarations = new Set<ReactRouterJsxRouteElement>();
  const fastifyPluginFacts: {
    routes: FastifyPluginFacts["routes"][number][];
    childRegistrations: FastifyPluginFacts["childRegistrations"][number][];
    rootRegistrations: FastifyPluginFacts["rootRegistrations"][number][];
  } = {
    routes: [],
    childRegistrations: [],
    rootRegistrations: []
  };
  const stack: SymbolNode[] = [];

  const fileNode = fileNodeFor(sourceFile, input);
  symbols.push(fileNode);
  stack.push(fileNode);

  function currentOwner(): SymbolNode {
    const owner = stack.at(-1);
    if (owner === undefined) {
      throw new Error("Extraction symbol stack unexpectedly became empty.");
    }
    return owner;
  }

  function addResolvedEdge(
    sourceId: string,
    targetId: string,
    kind: EdgeKind,
    node: ts.Node,
    referenceName: string
  ): void {
    const range = sourceRange(sourceFile, node);
    edges.push({
      id: createEdgeId({
        sourceId,
        targetId,
        kind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      targetId,
      kind,
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [targetId]
      }
    });
  }

  function addPendingReference(
    sourceId: string,
    referenceName: string,
    relationKind: PendingReference["relationKind"],
    node: ts.Node,
    routeFramework?: PendingReference["routeFramework"],
    routeRegistration?: PendingReference["routeRegistration"]
  ): void {
    const range = sourceRange(sourceFile, node);
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId,
        targetId: null,
        kind: relationKind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      filePath: input.filePath,
      referenceName,
      relationKind,
      range,
      ...(routeFramework === undefined ? {} : { routeFramework }),
      ...(routeRegistration === undefined ? {} : { routeRegistration })
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: enclosingScopeIds(sourceFile, node)
    });
  }

  function addRouteSymbol(node: ts.Node, method: RouteMethod, path: string): SymbolNode {
    const name = `${method} ${path}`;
    const qualifiedName = `${input.filePath}#route:${name}`;
    const identity = `${qualifiedName}\u0000route`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(fileNode.id, symbol.id, "contains", node, name);
    return symbol;
  }

  function addEntrypointSymbol(
    node: ts.Node,
    transport: EntryPointTransport,
    operation: EntryPointOperation,
    name: string
  ): SymbolNode {
    const symbolName = `${transport} ${operation} ${name}`;
    const qualifiedName = `${input.filePath}#entrypoint:${symbolName}`;
    const identity = `${qualifiedName}\u0000entrypoint`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "entrypoint",
        declarationOrdinal
      }),
      name: symbolName,
      qualifiedName,
      kind: "entrypoint",
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(fileNode.id, symbol.id, "contains", node, symbolName);
    return symbol;
  }

  function addStaticRoute(
    node: ts.Node,
    route: StaticExpressRoute | StaticFastifyRoute | StaticNextRoute | StaticReactRouterRoute,
    routeFramework: NonNullable<PendingReference["routeFramework"]>,
    routeRegistration?: PendingReference["routeRegistration"]
  ): void {
    const symbol = addRouteSymbol(node, route.method, route.path);
    addPendingReference(
      symbol.id,
      route.handler.text,
      "routes",
      route.handler,
      routeFramework,
      routeRegistration
    );
  }

  function addStaticExpressRoute(node: ts.CallExpression, route: StaticExpressRoute): void {
    addStaticRoute(node, route, "express");
  }

  function addStaticFastifyRoute(node: ts.CallExpression, route: StaticFastifyRoute): void {
    addStaticRoute(node, route, "fastify", route.routeRegistration);
  }

  function addStaticReactRouterRoute(
    node: ReactRouterJsxRouteElement,
    route: StaticReactRouterRoute
  ): void {
    addStaticRoute(node, route, "react-router");
  }

  function addStaticReactRouterDataRoute(route: StaticReactRouterDataRoute): void {
    addStaticRoute(route.declaration, route, "react-router", "react-router-data-router");
  }

  function addStaticReactRouterElementsFactoryRoute(route: StaticReactRouterJsxRoute): void {
    addStaticRoute(
      route.declaration,
      route,
      "react-router",
      "react-router-create-routes-from-elements"
    );
  }

  function addStaticNextRoute(route: StaticNextRoute): void {
    addStaticRoute(route.declaration, route, "nextjs", route.routeRegistration);
  }

  function addFastifyPluginFacts(node: ts.CallExpression): void {
    for (const candidate of staticFastifyPluginRouteCandidates({
      sourceFile,
      node,
      bindings: routeReceiverBindings,
      callbacks: fastifyPluginCallbacks
    })) {
      const plugin = symbolsByDeclaration.get(candidate.plugin.declaration);
      if (plugin?.kind !== "function" && plugin?.kind !== "variable") {
        continue;
      }
      fastifyPluginFacts.routes.push({
        pluginId: plugin.id,
        method: candidate.route.method,
        path: candidate.route.path,
        handler: fastifyPluginSymbolReference(sourceFile, candidate.route.handler),
        range: sourceRange(sourceFile, candidate.node)
      });
    }

    const childRegistration = staticFastifyPluginChildRegistration({
      sourceFile,
      node,
      bindings: routeReceiverBindings,
      callbacks: fastifyPluginCallbacks,
      symbolsByDeclaration
    });
    if (childRegistration !== null) {
      fastifyPluginFacts.childRegistrations.push(childRegistration);
    }

    const rootRegistration = staticFastifyImportedPluginRootRegistration(
      sourceFile,
      node,
      routeReceiverBindings
    );
    if (rootRegistration !== null) {
      fastifyPluginFacts.rootRegistrations.push(rootRegistration);
    }
  }

  function addStaticNestRoute(route: StaticNestRoute): void {
    const handler = symbolsByDeclaration.get(route.handler);
    const controller = symbolsByDeclaration.get(route.controller);
    if (handler?.kind !== "method" || controller?.kind !== "class") {
      return;
    }

    const symbol = addRouteSymbol(route.decorator, route.method, route.path);
    nestRouteFacts.routeControllers.push({ routeId: symbol.id, controllerId: controller.id });
    const range = sourceRange(sourceFile, route.decorator);
    edges.push({
      id: createEdgeId({
        sourceId: symbol.id,
        targetId: handler.id,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: handler.name
      }),
      sourceId: symbol.id,
      targetId: handler.id,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: handler.name,
      evidence: {
        ruleId: "framework.nestjs.decorator-route.local-method",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function nestEntrypointEvidenceRuleId(transport: EntryPointTransport): string {
    switch (transport) {
      case "graphql":
        return "framework.nestjs.graphql.operation.local-method";
      case "microservice":
        return "framework.nestjs.microservice.pattern.local-method";
      case "websocket":
        return "framework.nestjs.websocket.subscribe-message.local-method";
    }
  }

  function addStaticNestEntrypoint(entrypoint: StaticNestEntrypoint): void {
    const handler = symbolsByDeclaration.get(entrypoint.handler);
    if (handler?.kind !== "method") {
      return;
    }

    const symbol = addEntrypointSymbol(
      entrypoint.decorator,
      entrypoint.transport,
      entrypoint.operation,
      entrypoint.name
    );
    const range = sourceRange(sourceFile, entrypoint.decorator);
    edges.push({
      id: createEdgeId({
        sourceId: symbol.id,
        targetId: handler.id,
        kind: "handles",
        line: range.start.line,
        column: range.start.column,
        referenceName: handler.name
      }),
      sourceId: symbol.id,
      targetId: handler.id,
      kind: "handles",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: handler.name,
      evidence: {
        ruleId: nestEntrypointEvidenceRuleId(entrypoint.transport),
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addStaticNestModuleFacts(declaration: ts.ClassDeclaration): void {
    const module = symbolsByDeclaration.get(declaration);
    const definition = staticNestModuleDefinition(sourceFile, declaration, nestDecoratorBindings);
    if (module?.kind !== "class" || definition === null) {
      return;
    }

    for (const controller of definition.controllers) {
      nestRouteFacts.moduleControllers.push({
        moduleId: module.id,
        controller: nestSymbolReference(sourceFile, controller)
      });
    }
    for (const routerModulePrefix of definition.routerModulePrefixes) {
      nestRouteFacts.routerModulePrefixes.push({
        module: nestSymbolReference(sourceFile, routerModulePrefix.module),
        prefix: routerModulePrefix.prefix
      });
    }
  }

  function addDeclaration(node: ts.Node, info: DeclarationInfo): SymbolNode {
    const parent = currentOwner();
    const qualifiedName =
      parent.kind === "file"
        ? `${input.filePath}#${info.name}`
        : `${parent.qualifiedName}.${info.name}`;
    const identity = `${qualifiedName}\u0000${info.kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: info.kind,
        declarationOrdinal
      }),
      name: info.name,
      qualifiedName,
      kind: info.kind,
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: info.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByDeclaration.set(node, symbol);
    addResolvedEdge(parent.id, symbol.id, "contains", node, info.name);
    return symbol;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "imports", node.moduleSpecifier);

      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        importBindings.push({
          moduleSpecifier: node.moduleSpecifier.text,
          localName: importClause.name.text,
          importedName: "default",
          range: sourceRange(sourceFile, importClause.name),
          ...(importClause.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }

      if (importClause?.namedBindings !== undefined && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          importBindings.push({
            moduleSpecifier: node.moduleSpecifier.text,
            localName: element.name.text,
            importedName: element.propertyName?.text ?? element.name.text,
            range: sourceRange(sourceFile, element),
            ...(importClause.isTypeOnly || element.isTypeOnly ? { isTypeOnly: true } : {})
          });
        }
      } else if (
        importClause?.namedBindings !== undefined &&
        ts.isNamespaceImport(importClause.namedBindings)
      ) {
        // A namespace is a module object rather than a declaration target. Keep
        // the binding so resolution can reject an unsafe global-name fallback.
        importBindings.push({
          moduleSpecifier: node.moduleSpecifier.text,
          localName: importClause.namedBindings.name.text,
          importedName: "*",
          range: sourceRange(sourceFile, importClause.namedBindings),
          ...(importClause.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "exports", node.moduleSpecifier);

      if (node.exportClause === undefined) {
        reExportBindings.push({
          kind: "wildcard",
          moduleSpecifier: node.moduleSpecifier.text,
          range: sourceRange(sourceFile, node),
          ...(node.isTypeOnly ? { isTypeOnly: true } : {})
        });
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          reExportBindings.push({
            kind: "named",
            moduleSpecifier: node.moduleSpecifier.text,
            importedName: element.propertyName?.text ?? element.name.text,
            exportedName: element.name.text,
            range: sourceRange(sourceFile, element),
            ...(node.isTypeOnly || element.isTypeOnly ? { isTypeOnly: true } : {})
          });
        }
      } else if (ts.isNamespaceExport(node.exportClause)) {
        reExportBindings.push({
          kind: "namespace",
          moduleSpecifier: node.moduleSpecifier.text,
          exportedName: node.exportClause.name.text,
          range: sourceRange(sourceFile, node.exportClause),
          ...(node.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier === undefined &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        exportBindings.push({
          localName: element.propertyName?.text ?? element.name.text,
          exportedName: element.name.text,
          range: sourceRange(sourceFile, element),
          ...(node.isTypeOnly || element.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }
    }

    let info = declarationInfo(node, explicitExportNames);
    const exportAssignment = ts.isExportAssignment(node) ? node : null;
    const expressionInfo =
      exportAssignment === null ? null : defaultExportExpressionInfo(exportAssignment);
    let heritageDeclaration: HeritageDeclaration | null = null;
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      heritageDeclaration = node;
    } else if (exportAssignment !== null && ts.isClassExpression(exportAssignment.expression)) {
      heritageDeclaration = exportAssignment.expression;
    }
    let declaredSymbol = info === null ? null : addDeclaration(node, info);
    if (declaredSymbol === null && expressionInfo !== null && exportAssignment !== null) {
      info = expressionInfo;
      declaredSymbol = addDeclaration(exportAssignment.expression, info);
    }
    if (
      declaredSymbol !== null &&
      info !== null &&
      (hasDefaultModifier(node) || expressionInfo !== null)
    ) {
      exportBindings.push({
        localName: info.name,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
      exportBindings.push({
        localName: node.expression.text,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (declaredSymbol !== null && heritageDeclaration !== null) {
      for (const reference of staticHeritageReferences(sourceFile, heritageDeclaration)) {
        addPendingReference(
          declaredSymbol.id,
          reference.identifier.text,
          reference.relationKind,
          reference.identifier
        );
      }
    }
    if (info !== null && declaredSymbol !== null) {
      const enclosingScopeId = declarationScopeId(sourceFile, node, info);
      if (enclosingScopeId !== undefined) {
        for (const space of declaredBindingSpaces(info)) {
          localBindings.push({
            name: info.name,
            symbolId: declaredSymbol.id,
            scopeId: enclosingScopeId,
            space
          });
        }
      }
    }

    const typeParameters = typeParametersFor(node);
    if (typeParameters !== undefined) {
      const typeParameterScopeId = scopeIdFor(sourceFile, node);
      for (const typeParameter of typeParameters) {
        localBindings.push({
          name: typeParameter.name.text,
          symbolId: null,
          scopeId: typeParameterScopeId,
          space: "type"
        });
      }
    }

    if (ts.isFunctionLike(node)) {
      const functionScopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) {
          localBindings.push({
            name: parameter.name.text,
            symbolId: null,
            scopeId: functionScopeId,
            space: "value"
          });
        }
      }
    }

    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration !== undefined &&
      ts.isIdentifier(node.variableDeclaration.name)
    ) {
      localBindings.push({
        name: node.variableDeclaration.name.text,
        symbolId: null,
        scopeId: scopeIdFor(sourceFile, node),
        space: "value"
      });
    }
    if (declaredSymbol !== null) {
      stack.push(declaredSymbol);
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      addPendingReference(currentOwner().id, node.expression.text, "calls", node.expression);
    }

    ts.forEachChild(node, visit);

    if (declaredSymbol !== null) {
      stack.pop();
    }
  }

  ts.forEachChild(sourceFile, visit);

  const frameworkExtractionPasses: readonly FrameworkExtractionPass[] = [
    frameworkExtractionPass("nestjs", {
      visit(node) {
        if (!ts.isClassDeclaration(node)) {
          return;
        }
        for (const route of staticNestRoutes(sourceFile, node, nestDecoratorBindings)) {
          addStaticNestRoute(route);
        }
        for (const entrypoint of staticNestEntrypoints(sourceFile, node, nestDecoratorBindings)) {
          addStaticNestEntrypoint(entrypoint);
        }
        addStaticNestModuleFacts(node);
      }
    }),
    frameworkExtractionPass("express", {
      visit(node) {
        if (!ts.isCallExpression(node)) {
          return;
        }
        const route = staticExpressRoute(sourceFile, node, routeReceiverBindings);
        if (route !== null) {
          addStaticExpressRoute(node, route);
        }
      }
    }),
    frameworkExtractionPass("fastify", {
      visit(node) {
        if (!ts.isCallExpression(node)) {
          return;
        }
        for (const route of staticFastifyRoutes(sourceFile, node, routeReceiverBindings)) {
          addStaticFastifyRoute(node, route);
        }
        addFastifyPluginFacts(node);
      }
    }),
    frameworkExtractionPass("react-router", {
      visit(node) {
        if (ts.isCallExpression(node)) {
          for (const route of staticReactRouterDataRoutes(sourceFile, node, routeReceiverBindings)) {
            addStaticReactRouterDataRoute(route);
          }
          for (const definition of staticReactRouterElementsFactoryRouteDefinitions(
            sourceFile,
            node,
            routeReceiverBindings
          )) {
            markStaticReactRouterJsxRouteDefinitionDeclarations(
              definition,
              reactRouterElementsFactoryRouteDeclarations
            );
            for (const route of staticReactRouterJsxRouteTree(definition, "/", true)) {
              addStaticReactRouterElementsFactoryRoute(route);
            }
          }
        }
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (reactRouterElementsFactoryRouteDeclarations.has(node)) {
            return;
          }
          if (staticReactRouterJsxRouteHasRouteAncestor(sourceFile, node, routeReceiverBindings)) {
            return;
          }
          const definition = staticReactRouterJsxRouteDefinition(sourceFile, node, routeReceiverBindings);
          if (definition !== null) {
            for (const route of staticReactRouterJsxRouteTree(definition, "/", true)) {
              addStaticReactRouterRoute(route.declaration, route);
            }
          }
        }
      }
    }),
    frameworkExtractionPass("nextjs", {
      finalize() {
        const route = staticNextRoute(sourceFile);
        if (route !== null) {
          addStaticNextRoute(route);
        }
      }
    })
  ];

  // The registry is part of execution, not merely documentation: a capability
  // opts its pass into the language currently being parsed.
  const applicableFrameworkExtractionPasses = frameworkExtractionPasses.filter((pass) =>
    pass.capability.languages.includes(input.language)
  );

  function extractFrameworkFacts(node: ts.Node): void {
    for (const pass of applicableFrameworkExtractionPasses) {
      pass.visit?.(node);
    }
    ts.forEachChild(node, extractFrameworkFacts);
  }

  ts.forEachChild(sourceFile, extractFrameworkFacts);
  for (const pass of applicableFrameworkExtractionPasses) {
    pass.finalize?.();
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes,
    importBindings,
    exportBindings,
    reExportBindings,
    nestRouteFacts,
    fastifyPluginFacts
  };
}

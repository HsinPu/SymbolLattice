import ts from "typescript";

import { extractCFileFacts } from "./c.js";
import { extractCobolFileFacts } from "./cobol.js";
import { extractCsharpFileFacts } from "./csharp.js";
import { extractCppFileFacts } from "./cpp.js";
import { extractDartFileFacts } from "./dart.js";
import { extractElixirFileFacts } from "./elixir.js";
import { extractErlangFileFacts } from "./erlang.js";
import { extractFsharpFileFacts } from "./fsharp.js";
import { extractNimFileFacts } from "./nim.js";
import { extractClojureFileFacts } from "./clojure.js";
import { extractHaskellFileFacts } from "./haskell.js";
import { extractJuliaFileFacts } from "./julia.js";
import { extractOcamlFileFacts } from "./ocaml.js";
import { extractPerlFileFacts } from "./perl.js";
import { extractScalaFileFacts } from "./scala.js";
import { extractGoFileFacts } from "./go.js";
import { extractJavaFileFacts } from "./java.js";
import { extractGroovyFileFacts } from "./groovy.js";
import { extractFortranFileFacts } from "./fortran.js";
import { extractAdaFileFacts } from "./ada.js";
import { extractKotlinFileFacts } from "./kotlin.js";
import { extractLuaFileFacts } from "./lua.js";
import { projectLuaFileOnlyFacts } from "./lua-structural.js";
import { extractObjectiveCFileFacts } from "./objc.js";
import { extractPascalFileFacts } from "./pascal.js";
import { extractRFileFacts } from "./r.js";
import { extractShellFileFacts } from "./shell.js";
import { extractSqlFileFacts } from "./sql.js";
import { extractGraphqlFileFacts } from "./graphql.js";
import { extractProtoFileFacts } from "./proto.js";
import { extractPhpFileFacts } from "./php.js";
import { extractPythonFileFacts } from "./python.js";
import { extractRubyFileFacts } from "./ruby.js";
import { extractRustFileFacts } from "./rust.js";
import { extractSwiftFileFacts } from "./swift.js";
import { extractSvelteFileFacts } from "./svelte.js";
import { extractAstroFileFacts } from "./astro.js";
import { astroEndpointPath } from "./astro-routes.js";
import { extractArkTsFileFacts } from "./arkts.js";
import { extractCfmlFileFacts } from "./cfml.js";
import { extractNixFileFacts } from "./nix.js";
import { extractVbnetFileFacts } from "./vbnet.js";
import { extractZigFileFacts } from "./zig.js";
import { extractYamlFileFacts } from "./yaml.js";
import { extractXmlFileFacts } from "./xml.js";
import { extractHtmlFileFacts } from "./html.js";
import { extractJspFileFacts } from "./jsp.js";
import { extractCssFileFacts } from "./css.js";
import { extractMarkdownFileFacts } from "./markdown.js";
import { extractPropertiesFileFacts } from "./properties.js";
import { extractLiquidFileFacts } from "./liquid.js";
import { extractTwigFileFacts } from "./twig.js";
import { extractBladeFileFacts } from "./blade.js";
import { extractRazorFileFacts } from "./razor.js";
import { extractSolidityFileFacts } from "./solidity.js";
import { extractTerraformFileFacts } from "./terraform.js";
import { extractVueFileFacts } from "./vue.js";
import {
  frameworkCapability,
  type FrameworkCapability,
  type FrameworkCapabilityId
} from "./framework-capabilities.js";
import {
  frameworkRoutePluginExtractorVersion,
  frameworkRoutePluginsForLanguage,
  type FrameworkRoutePluginDecoratorRoute,
  type FrameworkRoutePluginMountMethod,
  type FrameworkRoutePlugin,
  type FrameworkRoutePluginRegistry
} from "./framework-route-plugins.js";

import {
  customRouteFramework,
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
  type FrameworkRoutePluginFacts,
  type GraphEdge,
  type ImportBinding,
  type LocalBinding,
  type NestGraphqlFacts,
  type NestRouteFacts,
  type PendingReference,
  type ProjectFrameworkEvidence,
  type ReactNativeFacts,
  type ReExportBinding,
  type ReferenceScope,
  type RouteRegistration,
  type RoutePrefixSegment,
  type RouteMethod,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export type {
  ArtifactFacts,
  DjangoUrlFacts,
  ExportBinding,
  FastApiRouterFacts,
  FastifyPluginFacts,
  FlaskBlueprintFacts,
  ImportBinding,
  LocalBinding,
  NestGraphqlFacts,
  NestRouteFacts,
  ReExportBinding,
  ReferenceScope,
  SanicBlueprintFacts
} from "../domain/index.js";
export {
  FRAMEWORK_CAPABILITIES,
  FRAMEWORK_CAPABILITY_IDS,
  frameworkCapability
} from "./framework-capabilities.js";
export type { FrameworkCapability, FrameworkCapabilityId } from "./framework-capabilities.js";
export {
  createFrameworkRoutePluginRegistry,
  frameworkRoutePluginExtractorVersion,
  FrameworkRoutePluginConfigurationError
} from "./framework-route-plugins.js";
export {
  createFrameworkFactPluginExtractor,
  createFrameworkFactPluginRegistry,
  FrameworkFactPluginConfigurationError,
  FrameworkFactPluginOutputError
} from "./framework-fact-plugins.js";
export type {
  FrameworkFactPlugin,
  FrameworkFactPluginBaseExtractor,
  FrameworkFactPluginEntrypointSymbol,
  FrameworkFactPluginExtractor,
  FrameworkFactPluginInput,
  FrameworkFactPluginNamedSymbol,
  FrameworkFactPluginReference,
  FrameworkFactPluginRegistry,
  FrameworkFactPluginRelation,
  FrameworkFactPluginResult,
  FrameworkFactPluginRouteSymbol,
  FrameworkFactPluginSymbol,
  FrameworkFactPluginSymbolSource
} from "./framework-fact-plugins.js";
export type {
  FrameworkRoutePluginDecoratorRoute,
  FrameworkRoutePluginMountMethod,
  FrameworkRoutePlugin,
  FrameworkRoutePluginHttpMethod,
  FrameworkRoutePluginLanguage,
  FrameworkRoutePluginMethod,
  FrameworkRoutePluginRegistry
} from "./framework-route-plugins.js";

/** @deprecated Use ArtifactLanguage from the domain package. */
export type ExtractionLanguage = ArtifactLanguage;

export interface ExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  /** Optional original bytes retained by byte-sensitive source catalogs. */
  readonly sourceBytes?: Uint8Array;
  readonly language: ExtractionLanguage;
  /** Project-wide framework proof supplied by the source catalog when available. */
  readonly frameworkEvidence?: ProjectFrameworkEvidence;
}

/** Explicit extensions for one extractor instance; no plugin is loaded implicitly from project files. */
export interface ExtractFileFactsOptions {
  readonly frameworkRoutePlugins?: FrameworkRoutePluginRegistry;
}

/** @deprecated Use ArtifactFacts from the domain package. */
export type ExtractedFileFacts = ArtifactFacts;

/** A configured extractor whose version includes the immutable route-plugin descriptor fingerprint. */
export type FrameworkRoutePluginExtractor = ((
  input: ExtractFileFactsInput
) => ExtractedFileFacts) & {
  readonly version: string;
};

/**
 * Creates an extractor bound to one validated registry. Pass it to
 * `SymbolLatticeService` to make the descriptor part of persisted fact reuse.
 */
export function createFrameworkRoutePluginExtractor(
  registry: FrameworkRoutePluginRegistry
): FrameworkRoutePluginExtractor {
  const version = frameworkRoutePluginExtractorVersion(registry);
  return Object.assign(
    (input: ExtractFileFactsInput): ExtractedFileFacts =>
      extractFileFacts(input, { frameworkRoutePlugins: registry }),
    { version }
  );
}

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

/** TypeScript's `override` modifier is the sole supported override declaration signal. */
function hasOverrideModifier(node: ts.MethodDeclaration): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.OverrideKeyword) ?? false;
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

  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    const name = declarationName(node);
    return name === null ? null : { name, kind: "method", isExported: false };
  }

  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
    const name = declarationName(node);
    return name === null ? null : { name, kind: "variable", isExported: false };
  }

  if (ts.isConstructorDeclaration(node)) {
    return { name: "constructor", kind: "method", isExported: false };
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

function bindingNameIncludes(name: ts.BindingName, expected: string): boolean {
  if (ts.isIdentifier(name)) {
    return name.text === expected;
  }
  return name.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingNameIncludes(element.name, expected)
  );
}

function hasDirectSourceBinding(sourceFile: ts.SourceFile, expected: string): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name?.text === expected
    ) {
      return true;
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) =>
        bindingNameIncludes(declaration.name, expected)
      );
    }
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      if (clause.name?.text === expected) {
        return true;
      }
      if (clause.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          return clause.namedBindings.name.text === expected;
        }
        return clause.namedBindings.elements.some((element) => element.name.text === expected);
      }
    }
    return false;
  });
}

function hasEcmaScriptModuleSyntax(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      hasExportModifier(statement)
  );
}

function hasUseStrictDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use strict") {
      return true;
    }
  }
  return false;
}

function hasOnlyDirectCommonJsRequireUses(sourceFile: ts.SourceFile): boolean {
  let valid = true;
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === "require") {
      const call = node.parent;
      const argument = ts.isCallExpression(call) ? call.arguments[0] : undefined;
      const declaration = ts.isCallExpression(call) && call.expression === node ? call.parent : undefined;
      const declarationList =
        declaration !== undefined && ts.isVariableDeclaration(declaration)
          ? declaration.parent
          : undefined;
      const statement =
        declarationList !== undefined && ts.isVariableDeclarationList(declarationList)
          ? declarationList.parent
          : undefined;
      if (
        !ts.isCallExpression(call) ||
        call.arguments.length !== 1 ||
        argument === undefined ||
        !ts.isStringLiteral(argument) ||
        statement === undefined ||
        !ts.isVariableStatement(statement) ||
        statement.parent !== sourceFile
      ) {
        valid = false;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return valid;
}

function hasOnlyDirectCommonJsModuleUses(sourceFile: ts.SourceFile): boolean {
  let valid = true;
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === "module") {
      const access = node.parent;
      const directTarget = ts.isPropertyAccessExpression(access) ? access : undefined;
      const augmentedTarget =
        directTarget !== undefined &&
        directTarget.expression === node &&
        directTarget.name.text === "exports" &&
        ts.isPropertyAccessExpression(directTarget.parent) &&
        directTarget.parent.expression === directTarget
          ? directTarget.parent
          : undefined;
      const target = augmentedTarget ?? directTarget;
      const assignment = target === undefined ? undefined : target.parent;
      const statement =
        assignment !== undefined && ts.isBinaryExpression(assignment)
          ? assignment.parent
          : undefined;
      if (
        directTarget === undefined ||
        directTarget.expression !== node ||
        directTarget.name.text !== "exports" ||
        assignment === undefined ||
        !ts.isBinaryExpression(assignment) ||
        assignment.left !== target ||
        assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
        statement === undefined ||
        !ts.isExpressionStatement(statement) ||
        statement.parent !== sourceFile
      ) {
        valid = false;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return valid;
}

function directCommonJsExportClass(sourceFile: ts.SourceFile): ts.ClassExpression | null {
  const assignments = sourceFile.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) {
      return [];
    }
    const expression = statement.expression;
    if (
      expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
      !ts.isPropertyAccessExpression(expression.left) ||
      !ts.isIdentifier(expression.left.expression) ||
      expression.left.expression.text !== "module" ||
      expression.left.name.text !== "exports"
    ) {
      return [];
    }
    return [expression];
  });
  if (assignments.length !== 1) {
    return null;
  }
  const expression = assignments[0]?.right;
  return expression !== undefined && ts.isClassExpression(expression) && expression.name !== undefined
    ? expression
    : null;
}

function directCommonJsRequires(sourceFile: ts.SourceFile): ReadonlyMap<ts.VariableDeclaration, ts.StringLiteral> {
  const requires = new Map<ts.VariableDeclaration, ts.StringLiteral>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      const argument =
        initializer !== undefined && ts.isCallExpression(initializer)
          ? initializer.arguments[0]
          : undefined;
      if (
        initializer === undefined ||
        !ts.isCallExpression(initializer) ||
        !ts.isIdentifier(initializer.expression) ||
        initializer.expression.text !== "require" ||
        initializer.arguments.length !== 1 ||
        argument === undefined ||
        !ts.isStringLiteral(argument)
      ) {
        continue;
      }
      requires.set(declaration, argument);
    }
  }
  return requires;
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

function enclosingTypeParameterNames(node: ts.Node): ReadonlySet<string> {
  const names = new Set<string>();
  let current: ts.Node | undefined = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    for (const typeParameter of typeParametersFor(current) ?? []) {
      names.add(typeParameter.name.text);
    }
    current = current.parent;
  }
  return names;
}

const IGNORED_SIGNATURE_TYPE_REFERENCES = new Set([
  "Array",
  "Awaited",
  "BigInt",
  "Boolean",
  "Date",
  "Error",
  "Exclude",
  "Extract",
  "Function",
  "InstanceType",
  "Map",
  "NonNullable",
  "Number",
  "Object",
  "Omit",
  "Parameters",
  "Partial",
  "Pick",
  "Promise",
  "ReadonlyArray",
  "Record",
  "RegExp",
  "Required",
  "ReturnType",
  "Set",
  "String",
  "Symbol",
  "Uint8Array",
  "WeakMap",
  "WeakSet"
]);

function signatureTypeReferences(
  typeNode: ts.TypeNode,
  typeParameterNames: ReadonlySet<string>
): readonly ts.Identifier[] {
  const references: ts.Identifier[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      if (
        ts.isIdentifier(node.typeName) &&
        !typeParameterNames.has(node.typeName.text) &&
        !IGNORED_SIGNATURE_TYPE_REFERENCES.has(node.typeName.text)
      ) {
        references.push(node.typeName);
      }
      for (const argument of node.typeArguments ?? []) {
        visit(argument);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(typeNode);
  return references;
}

interface ScopedRouteReceiverBindings {
  /** The closest value binding decides whether a receiver is known to be a supported framework. */
  readonly byScopeId: ReadonlyMap<string, ReadonlyMap<string, readonly RouteBinding[]>>;
}

type RouteBindingKind =
  | "express-receiver"
  | "express-default-factory"
  | "express-namespace"
  | "typescript-namespace"
  | "express-router-factory"
  | "custom-framework-constructor"
  | "custom-framework-receiver"
  | "koa-router-constructor"
  | "koa-router-receiver"
  | "hono-constructor"
  | "hono-receiver"
  | "elysia-constructor"
  | "elysia-receiver"
  | "fastify-receiver"
  | "fastify-default-factory"
  | "fastify-plugin-receiver"
  | "react-router-route"
  | "react-router-data-router-factory"
  | "react-router-elements-factory"
  | "react-native-native-modules"
  | "react-native-turbo-module-registry"
  | "react-native-turbo-module"
  | "react-native-namespace"
  | "other";

interface RouteBinding {
  readonly declaration: ts.Node;
  kind: RouteBindingKind;
  /** Validated descriptor retained only for one exact imported route constructor and receiver. */
  frameworkRoutePlugin?: FrameworkRoutePlugin;
  /** Literal registry name retained only for an immutable direct TurboModule binding. */
  reactNativeTurboModuleName?: string;
  /** Static framework prefix inherited by a proven registration. */
  prefix?: string;
  /** Provenance for the prefix that projected this callback's routes. */
  routeRegistration?: RouteRegistration;
  /** Ordered syntax evidence for the prefix that projected this callback's routes. */
  routePrefixChain?: readonly RoutePrefixSegment[];
  /** A configured mount was observed but could not prove one safe full route path. */
  suppressFrameworkRoutePluginRoutes?: boolean;
}

interface StaticExpressRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** A direct @koa/router route with literal path and named terminal handler. */
interface StaticKoaRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** A direct Hono route with literal path and named terminal handler. */
interface StaticHonoRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** A direct Elysia route with literal path and named terminal handler. */
interface StaticElysiaRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

/** A direct call through one proven React Native NativeModules binding. */
interface StaticReactNativeNativeModuleCall {
  readonly moduleName: string;
  readonly methodName: string;
  readonly expression: ts.PropertyAccessExpression;
}

/** A direct call through an immutable TurboModule registry result. */
interface StaticReactNativeTurboModuleCall {
  readonly moduleName: string;
  readonly methodName: string;
  readonly expression: ts.PropertyAccessExpression;
}

/** A direct method call through one lexically proven default import. */
interface StaticReactNativeTurboModuleDefaultImportCall {
  readonly moduleSpecifier: string;
  readonly methodName: string;
  readonly expression: ts.PropertyAccessExpression;
}

/** One direct default export of a literal or immutable TurboModule registry result. */
interface StaticReactNativeTurboModuleDefaultExport {
  readonly moduleName: string;
  readonly expression: ts.Expression;
}

/** One direct `TurboModuleRegistry.get*<Spec>("Module")` registration. */
interface StaticReactNativeTurboModuleRegistryCall {
  readonly moduleName: string;
  readonly typeName: string | null;
}

/** One direct, exported TurboModule TypeScript contract. */
interface StaticReactNativeTurboModuleSpec {
  readonly moduleName: string;
  readonly methods: readonly {
    readonly name: string;
    readonly declaration: ts.MethodSignature;
  }[];
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

/** A direct Vue Router route from one top-level createRouter routes option. */
interface StaticVueRouterRoute extends StaticReactRouterRoute {
  readonly declaration: ts.ObjectLiteralExpression;
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

/** A direct Astro endpoint handler exposed from an evidence-backed source file. */
interface StaticAstroEndpointRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
  readonly declaration: ts.Node;
  readonly routeRegistration: Extract<RouteRegistration, "astro-filesystem-endpoint">;
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

/** Lexical value bindings that can prove one configured public route decorator import. */
interface ScopedFrameworkRoutePluginDecoratorBindings {
  readonly byScopeId: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly FrameworkRoutePluginDecoratorBinding[]>
  >;
}

const EMPTY_SCOPED_FRAMEWORK_ROUTE_PLUGIN_DECORATOR_BINDINGS: ScopedFrameworkRoutePluginDecoratorBindings = {
  byScopeId: new Map()
};

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

interface FrameworkRoutePluginDecoratorBinding {
  readonly declaration: ts.Node;
  /** Present only for one exact configured decorator import. */
  readonly plugin?: FrameworkRoutePlugin;
  /** Present together with `plugin` for a configured literal method decorator. */
  readonly decoratorRoute?: FrameworkRoutePluginDecoratorRoute;
}

type FrameworkRoutePluginDecoratorImport = Pick<
  FrameworkRoutePluginDecoratorBinding,
  "plugin" | "decoratorRoute"
>;

interface StaticNestRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly decorator: ts.Decorator;
  readonly controller: ts.ClassDeclaration;
  readonly handler: ts.MethodDeclaration;
}

/** One exact configured TypeScript method decorator with a literal absolute path. */
interface StaticFrameworkRoutePluginDecoratorRoute {
  readonly plugin: FrameworkRoutePlugin;
  readonly routeMethod: FrameworkRoutePluginDecoratorRoute;
  readonly path: string;
  readonly decorator: ts.Decorator;
  readonly handler: ts.MethodDeclaration;
}

interface StaticNestEntrypoint {
  readonly transport: Exclude<EntryPointTransport, "ui">;
  readonly operation: EntryPointOperation;
  readonly name: string;
  readonly decorator: ts.Decorator;
  readonly handler: ts.MethodDeclaration;
}

interface StaticNestGraphqlResolverReference {
  readonly resolver: ts.ClassDeclaration;
  readonly schemaType: ts.Identifier;
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

const KOA_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  del: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  connect: "CONNECT",
  trace: "TRACE",
  all: "ALL"
};

const HONO_ROUTE_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "ALL"
] as const satisfies readonly RouteMethod[];

const ELYSIA_ROUTE_METHODS = [
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
  const typeParameterNames = enclosingTypeParameterNames(declaration);

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
        typeParameterNames.has(type.expression.text) ||
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

function isKoaRouterImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@koa/router" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isHonoImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "hono" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function isElysiaImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "elysia" &&
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

function isReactNativeImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "react-native" &&
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

function namedReactNativeImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isReactNativeImport(statement) || element.isTypeOnly) {
    return "other";
  }
  const importedName = element.propertyName?.text ?? element.name.text;
  if (importedName === "NativeModules") {
    return "react-native-native-modules";
  }
  return importedName === "TurboModuleRegistry"
    ? "react-native-turbo-module-registry"
    : "other";
}

function namedHonoImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isHonoImport(statement) || element.isTypeOnly) {
    return "other";
  }
  return (element.propertyName?.text ?? element.name.text) === "Hono"
    ? "hono-constructor"
    : "other";
}

function namedElysiaImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isElysiaImport(statement) || element.isTypeOnly) {
    return "other";
  }
  return (element.propertyName?.text ?? element.name.text) === "Elysia"
    ? "elysia-constructor"
    : "other";
}

function namedRouteImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  const expressBinding = namedExpressImportBindingKind(statement, element);
  if (expressBinding !== "other") {
    return expressBinding;
  }
  const honoBinding = namedHonoImportBindingKind(statement, element);
  if (honoBinding !== "other") {
    return honoBinding;
  }
  const elysiaBinding = namedElysiaImportBindingKind(statement, element);
  if (elysiaBinding !== "other") {
    return elysiaBinding;
  }
  const reactRouterBinding = namedReactRouterImportBindingKind(statement, element);
  return reactRouterBinding === "other"
    ? namedReactNativeImportBindingKind(statement, element)
    : reactRouterBinding;
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

interface StaticTypeScriptMemberCall {
  readonly method: ts.Identifier;
  readonly receiverTypeName: string | null;
  readonly receiverBindingSpace: BindingSpace | null;
  readonly receiverMemberKind: "static" | "instance";
  readonly inlineParameterMember: boolean;
}

function nearestNamedClass(node: ts.Node): ts.ClassDeclaration | ts.ClassExpression | null {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isArrowFunction(current)) {
      current = current.parent;
      continue;
    }
    if (ts.isFunctionLike(current)) {
      if (
        !ts.isMethodDeclaration(current) &&
        !ts.isConstructorDeclaration(current) &&
        !ts.isGetAccessorDeclaration(current) &&
        !ts.isSetAccessorDeclaration(current)
      ) {
        return null;
      }
    }
    if (
      (ts.isClassDeclaration(current) || ts.isClassExpression(current)) &&
      current.name !== undefined
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function nearestNamedType(
  node: ts.Node
): ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration | null {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (
      (ts.isClassDeclaration(current) ||
        ts.isClassExpression(current) ||
        ts.isInterfaceDeclaration(current)) &&
      current.name !== undefined
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function typeReferenceIdentifier(type: ts.TypeNode | undefined): ts.Identifier | null {
  return type !== undefined &&
    ts.isTypeReferenceNode(type) &&
    type.typeArguments === undefined &&
    ts.isIdentifier(type.typeName)
    ? type.typeName
    : null;
}

function isDirectlyCallableTypeScriptMember(node: ts.Node): boolean {
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    return true;
  }
  if (!ts.isPropertyDeclaration(node) && !ts.isPropertySignature(node)) {
    return false;
  }
  let type = node.type;
  while (type !== undefined && ts.isParenthesizedTypeNode(type)) {
    type = type.type;
  }
  if (type !== undefined && ts.isFunctionTypeNode(type)) {
    return true;
  }
  if (!ts.isPropertyDeclaration(node) || node.initializer === undefined) {
    return false;
  }
  const initializer = transparentExpression(node.initializer);
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer);
}

function directValueImportSpecifier(node: ts.Node): ts.ImportSpecifier | null {
  const specifier = ts.isImportSpecifier(node)
    ? node
    : ts.isIdentifier(node) && ts.isImportSpecifier(node.parent) && node.parent.name === node
      ? node.parent
      : null;
  if (specifier === null || specifier.isTypeOnly || !ts.isNamedImports(specifier.parent)) {
    return null;
  }
  const importClause = specifier.parent.parent;
  return ts.isImportClause(importClause) &&
    importClause.isTypeOnly !== true &&
    ts.isImportDeclaration(importClause.parent)
    ? specifier
    : null;
}

function provenValueConstructorName(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): string | null {
  const declaration = visibleRouteBinding(sourceFile, identifier, bindings)?.declaration;
  return declaration !== undefined &&
    (ts.isClassDeclaration(declaration) || directValueImportSpecifier(declaration) !== null)
    ? identifier.text
    : null;
}

function staticThisReceiver(
  node: ts.Node
): { readonly typeName: string; readonly memberKind: "static" | "instance" } | null {
  let current: ts.Node | undefined = node.parent;
  let enclosingMemberKind: "static" | "instance" | null = null;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isArrowFunction(current)) {
      current = current.parent;
      continue;
    }
    if (ts.isFunctionLike(current)) {
      const explicitThis = current.parameters.find(
        (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "this"
      );
      if (explicitThis !== undefined) {
        const typeName = typeReferenceIdentifier(explicitThis.type);
        return typeName !== null && !enclosingTypeParameterNames(explicitThis).has(typeName.text)
          ? { typeName: typeName.text, memberKind: "instance" }
          : null;
      }
      if (
        !ts.isMethodDeclaration(current) &&
        !ts.isConstructorDeclaration(current) &&
        !ts.isGetAccessorDeclaration(current) &&
        !ts.isSetAccessorDeclaration(current)
      ) {
        return null;
      }
      enclosingMemberKind =
        ts.isConstructorDeclaration(current) ||
        !ts.canHaveModifiers(current) ||
        !ts.getModifiers(current)?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
        )
          ? "instance"
          : "static";
    }
    if (ts.isClassStaticBlockDeclaration(current)) {
      enclosingMemberKind = "static";
    } else if (
      ts.isPropertyDeclaration(current) &&
      (ts.isClassDeclaration(current.parent) || ts.isClassExpression(current.parent))
    ) {
      enclosingMemberKind = current.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
      )
        ? "static"
        : "instance";
    }
    if (
      (ts.isClassDeclaration(current) || ts.isClassExpression(current)) &&
      current.name !== undefined
    ) {
      return {
        typeName: current.name.text,
        memberKind: enclosingMemberKind ?? "instance"
      };
    }
    current = current.parent;
  }
  return null;
}

function hasReadonlyParameterPropertyModifier(parameter: ts.ParameterDeclaration): boolean {
  const modifiers = parameter.modifiers ?? [];
  return (
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) &&
    modifiers.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.PublicKeyword ||
        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
        modifier.kind === ts.SyntaxKind.ProtectedKeyword
    )
  );
}

function directReadonlyConstructorParameterPropertyType(
  node: ts.Node,
  propertyName: string
): ts.Identifier | null {
  const owner = nearestNamedClass(node);
  if (owner === null) {
    return null;
  }
  const parameters = owner.members
    .filter(ts.isConstructorDeclaration)
    .flatMap((constructor) => constructor.parameters)
    .filter(
      (parameter) =>
        ts.isIdentifier(parameter.name) &&
        parameter.name.text === propertyName &&
        hasReadonlyParameterPropertyModifier(parameter)
    );
  if (parameters.length !== 1) {
    return null;
  }
  return typeReferenceIdentifier(parameters[0]?.type);
}

function isThisPropertyAccess(expression: ts.Expression, propertyName: string): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.questionDotToken === undefined &&
    expression.name.text === propertyName &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword
  );
}

function startsWithThisProperty(expression: ts.Expression, propertyName: string): boolean {
  return (
    isThisPropertyAccess(expression, propertyName) ||
    (ts.isPropertyAccessExpression(expression) &&
      expression.questionDotToken === undefined &&
      startsWithThisProperty(expression.expression, propertyName))
  );
}

const thisPropertyMutationCache = new WeakMap<
  ts.ClassDeclaration | ts.ClassExpression,
  Map<string, boolean>
>();

function thisPropertyIsMutated(
  owner: ts.ClassDeclaration | ts.ClassExpression,
  propertyName: string
): boolean {
  let byProperty = thisPropertyMutationCache.get(owner);
  if (byProperty === undefined) {
    byProperty = new Map();
    thisPropertyMutationCache.set(owner, byProperty);
  }
  const cached = byProperty.get(propertyName);
  if (cached !== undefined) return cached;
  let mutated = false;
  const visit = (node: ts.Node): void => {
    if (mutated) {
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      startsWithThisProperty(node.left, propertyName)
    ) {
      mutated = true;
      return;
    }
    const mutationTarget = memberMutationCallTarget(node);
    if (mutationTarget !== null && startsWithThisProperty(mutationTarget, propertyName)) {
      mutated = true;
      return;
    }
    if (node !== owner && (ts.isClassDeclaration(node) || ts.isClassExpression(node))) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(owner, visit);
  byProperty.set(propertyName, mutated);
  return mutated;
}

function staticMemberAccessName(expression: ts.Expression): string | null {
  const current = transparentExpression(expression);
  if (ts.isPropertyAccessExpression(current)) {
    return current.name.text;
  }
  if (
    ts.isElementAccessExpression(current) &&
    current.argumentExpression !== undefined &&
    (ts.isStringLiteral(current.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(current.argumentExpression))
  ) {
    return current.argumentExpression.text;
  }
  return null;
}

function memberMutationCallTarget(node: ts.Node): ts.Expression | null {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  const ownerExpression = staticMemberAccessReceiver(node.expression);
  const owner = ownerExpression === null ? null : transparentIdentifier(ownerExpression);
  const method = staticMemberAccessName(node.expression);
  if (owner === null || method === null) {
    return null;
  }
  const mutationCall =
    (owner.text === "Object" &&
      ["assign", "defineProperties", "defineProperty", "setPrototypeOf"].includes(method)) ||
    (owner.text === "Reflect" &&
      ["defineProperty", "set", "setPrototypeOf"].includes(method));
  return mutationCall ? (node.arguments[0] ?? null) : null;
}

function staticMemberAccessReceiver(expression: ts.Expression): ts.Expression | null {
  const current = transparentExpression(expression);
  return ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)
    ? current.expression
    : null;
}

function transparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function transparentIdentifier(expression: ts.Expression): ts.Identifier | null {
  const current = transparentExpression(expression);
  return ts.isIdentifier(current) ? current : null;
}

function staticExpressionPath(expression: ts.Expression): string | null {
  const current = transparentExpression(expression);
  if (current.kind === ts.SyntaxKind.ThisKeyword) {
    return "this";
  }
  if (ts.isIdentifier(current)) {
    return current.text;
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    const receiver = staticExpressionPath(current.expression);
    const member = staticMemberAccessName(current);
    return receiver === null || member === null ? null : `${receiver}.${member}`;
  }
  return null;
}

const identifierAliasCache = new WeakMap<ts.SourceFile, Map<string, ReadonlySet<string>>>();
const trackedValueCarrierAliasCache = new WeakMap<ts.Node, Map<string, ReadonlySet<string>>>();
const constructorInstanceAliasCache = new WeakMap<ts.SourceFile, Map<string, ReadonlySet<string>>>();
const constructorPrototypeAliasCache = new WeakMap<ts.SourceFile, Map<string, ReadonlySet<string>>>();
const unprovenDynamicPrototypeAliasCache = new WeakMap<ts.SourceFile, ReadonlySet<string>>();
const receiverMemberMutationCache = new WeakMap<ts.SourceFile, Map<string, boolean>>();
const constructorPrototypeMemberMutationCache = new WeakMap<
  ts.SourceFile,
  Map<string, boolean>
>();

function aliasSetKey(values: ReadonlySet<string>): string {
  return [...values].sort().join("\u0000");
}

function identifierAliases(sourceFile: ts.SourceFile, initialName: string): ReadonlySet<string> {
  let byName = identifierAliasCache.get(sourceFile);
  if (byName === undefined) {
    byName = new Map();
    identifierAliasCache.set(sourceFile, byName);
  }
  const cached = byName.get(initialName);
  if (cached !== undefined) return cached;
  const aliases = new Set<string>([initialName]);
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      let left: ts.Identifier | undefined;
      let right: ts.Identifier | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        left = node.name;
        right = transparentIdentifier(node.initializer) ?? undefined;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        left = node.left;
        right = transparentIdentifier(node.right) ?? undefined;
      }
      if (left !== undefined && right !== undefined && aliases.has(right.text) && !aliases.has(left.text)) {
        aliases.add(left.text);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  byName.set(initialName, aliases);
  return aliases;
}

function expressionCarriesTrackedValue(
  expression: ts.Expression,
  carrierAliases: ReadonlySet<string>
): boolean {
  const current = transparentExpression(expression);
  const expressionPath = staticExpressionPath(current);
  if (expressionPath !== null && carrierAliases.has(expressionPath)) {
    return true;
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return expressionCarriesTrackedValue(property.initializer, carrierAliases);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return carrierAliases.has(property.name.text);
      }
      return (
        ts.isSpreadAssignment(property) &&
        expressionCarriesTrackedValue(property.expression, carrierAliases)
      );
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        expressionCarriesTrackedValue(element, carrierAliases)
    );
  }
  if (ts.isPropertyAccessExpression(current)) {
    // Reading a property does not imply that the property value carries its
    // receiver. Carrier members are recorded explicitly by
    // trackedValueCarrierAliases, so only the full static path is evidence.
    return false;
  }
  if (ts.isElementAccessExpression(current)) {
    // Numeric/dynamic array slots have no staticExpressionPath. Preserve the
    // conservative container-carrier proof for those indexed reads.
    return staticMemberAccessName(current) === null &&
      expressionCarriesTrackedValue(current.expression, carrierAliases);
  }
  if (ts.isCallExpression(current)) {
    const calleePath = staticExpressionPath(current.expression);
    if (calleePath !== null && carrierAliases.has(calleePath)) {
      return true;
    }
    const callee = transparentExpression(current.expression);
    return (
      (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) &&
      functionLikeReturnsTrackedValue(callee, carrierAliases)
    );
  }
  if (ts.isConditionalExpression(current)) {
    return (
      expressionCarriesTrackedValue(current.whenTrue, carrierAliases) ||
      expressionCarriesTrackedValue(current.whenFalse, carrierAliases)
    );
  }
  if (
    ts.isBinaryExpression(current) &&
    (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      current.operatorToken.kind === ts.SyntaxKind.CommaToken)
  ) {
    return (
      expressionCarriesTrackedValue(current.left, carrierAliases) ||
      expressionCarriesTrackedValue(current.right, carrierAliases)
    );
  }
  return false;
}

type TrackedValueFactoryDeclaration =
  | ConstructorInstanceFactoryDeclaration
  | ts.GetAccessorDeclaration;

function functionLikeReturnsTrackedValue(
  declaration: TrackedValueFactoryDeclaration,
  carrierAliases: ReadonlySet<string>
): boolean {
  if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) {
    return expressionCarriesTrackedValue(declaration.body, carrierAliases);
  }
  if (declaration.body === undefined) {
    return false;
  }
  let returnsTrackedValue = false;
  const visit = (node: ts.Node): void => {
    if (returnsTrackedValue || (node !== declaration && ts.isFunctionLike(node))) {
      return;
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      expressionCarriesTrackedValue(node.expression, carrierAliases)
    ) {
      returnsTrackedValue = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(declaration.body, visit);
  return returnsTrackedValue;
}

function trackedValueCarrierAliases(
  root: ts.Node,
  initialAliases: ReadonlySet<string>
): ReadonlySet<string> {
  let byInitialAliases = trackedValueCarrierAliasCache.get(root);
  if (byInitialAliases === undefined) {
    byInitialAliases = new Map();
    trackedValueCarrierAliasCache.set(root, byInitialAliases);
  }
  const cacheKey = aliasSetKey(initialAliases);
  const cached = byInitialAliases.get(cacheKey);
  if (cached !== undefined) return cached;
  const aliases = new Set(initialAliases);
  let changed = true;
  while (changed) {
    changed = false;
    const addAlias = (alias: string): void => {
      if (!aliases.has(alias)) {
        aliases.add(alias);
        changed = true;
      }
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name !== undefined &&
        functionLikeReturnsTrackedValue(node, aliases)
      ) {
        addAlias(node.name.text);
      }
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
        const initializer = transparentExpression(node.initializer);
        if (
          ts.isIdentifier(node.name) &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          functionLikeReturnsTrackedValue(initializer, aliases)
        ) {
          addAlias(node.name.text);
        }
        if (ts.isIdentifier(node.name) && ts.isObjectLiteralExpression(initializer)) {
          for (const property of initializer.properties) {
            const memberName =
              ts.isMethodDeclaration(property) ||
              ts.isGetAccessorDeclaration(property) ||
              ts.isPropertyAssignment(property)
                ? staticPropertyName(property.name)
                : null;
            const factory = ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)
              ? property
              : ts.isPropertyAssignment(property) &&
                  (ts.isArrowFunction(property.initializer) ||
                    ts.isFunctionExpression(property.initializer))
                ? property.initializer
                : null;
            if (
              memberName !== null &&
              factory !== null &&
              functionLikeReturnsTrackedValue(factory, aliases)
            ) {
              addAlias(`${node.name.text}.${memberName}`);
            }
            const carriedExpression = ts.isPropertyAssignment(property)
              ? property.initializer
              : ts.isShorthandPropertyAssignment(property)
                ? property.name
                : ts.isSpreadAssignment(property)
                  ? property.expression
                  : undefined;
            if (
              memberName !== null &&
              carriedExpression !== undefined &&
              expressionCarriesTrackedValue(carriedExpression, aliases)
            ) {
              addAlias(`${node.name.text}.${memberName}`);
            }
          }
        }
        if (ts.isIdentifier(node.name) && ts.isArrayLiteralExpression(initializer)) {
          const arrayName = node.name.text;
          initializer.elements.forEach((element, index) => {
            if (
              !ts.isOmittedExpression(element) &&
              expressionCarriesTrackedValue(
                ts.isSpreadElement(element) ? element.expression : element,
                aliases
              )
            ) {
              addAlias(`${arrayName}.${index}`);
            }
          });
        }
      }
      if (ts.isClassDeclaration(node) && node.name !== undefined) {
        for (const member of node.members) {
          if (
            (!ts.isMethodDeclaration(member) && !ts.isGetAccessorDeclaration(member)) ||
            !isStaticMethod(member)
          ) {
            continue;
          }
          const memberName = staticPropertyName(member.name);
          if (
            memberName !== null &&
            functionLikeReturnsTrackedValue(member, aliases)
          ) {
            addAlias(`${node.name.text}.${memberName}`);
          }
        }
      }
      let leftPaths: readonly string[] = [];
      let right: ts.Expression | undefined;
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
        leftPaths = bindingNames(node.name);
        right = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        leftPaths = assignmentTargetPaths(node.left);
        right = node.right;
      }
      if (
        right !== undefined &&
        expressionCarriesTrackedValue(right, aliases)
      ) {
        for (const leftPath of leftPaths) {
          addAlias(leftPath);
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(root, visit);
  }
  byInitialAliases.set(cacheKey, aliases);
  return aliases;
}

function isConstructorPrototype(
  expression: ts.Expression,
  constructorNames: ReadonlySet<string>
): boolean {
  const receiver = staticMemberAccessReceiver(expression);
  const constructor = receiver === null ? null : transparentIdentifier(receiver);
  return (
    staticMemberAccessName(expression) === "prototype" &&
    constructor !== null &&
    constructorNames.has(constructor.text)
  );
}

function isConstructedConstructorAlias(
  expression: ts.Expression,
  constructorNames: ReadonlySet<string>
): boolean {
  const current = transparentExpression(expression);
  if (!ts.isNewExpression(current)) {
    return false;
  }
  const constructor = transparentIdentifier(current.expression);
  return constructor !== null && constructorNames.has(constructor.text);
}

function expressionCarriesConstructorInstance(
  expression: ts.Expression,
  constructorNames: ReadonlySet<string>,
  carrierAliases: ReadonlySet<string>
): boolean {
  const current = transparentExpression(expression);
  if (isConstructedConstructorAlias(current, constructorNames)) {
    return true;
  }
  const identifier = transparentIdentifier(current);
  if (identifier !== null && carrierAliases.has(identifier.text)) {
    return true;
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return expressionCarriesConstructorInstance(
          property.initializer,
          constructorNames,
          carrierAliases
        );
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return carrierAliases.has(property.name.text);
      }
      return ts.isSpreadAssignment(property) &&
        expressionCarriesConstructorInstance(property.expression, constructorNames, carrierAliases);
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some((element) =>
      !ts.isOmittedExpression(element) &&
      expressionCarriesConstructorInstance(element, constructorNames, carrierAliases)
    );
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return expressionCarriesConstructorInstance(
      current.expression,
      constructorNames,
      carrierAliases
    );
  }
  if (ts.isCallExpression(current)) {
    const callee = staticExpressionPath(current.expression);
    return callee !== null && carrierAliases.has(callee);
  }
  return false;
}

type ConstructorInstanceFactoryDeclaration =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

function functionLikeReturnsConstructorInstance(
  declaration: ConstructorInstanceFactoryDeclaration,
  constructorNames: ReadonlySet<string>,
  carrierAliases: ReadonlySet<string>
): boolean {
  if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) {
    return expressionCarriesConstructorInstance(
      declaration.body,
      constructorNames,
      carrierAliases
    );
  }
  if (declaration.body === undefined) {
    return false;
  }
  let returnsInstance = false;
  const visit = (node: ts.Node): void => {
    if (returnsInstance || (node !== declaration && ts.isFunctionLike(node))) {
      return;
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      expressionCarriesConstructorInstance(node.expression, constructorNames, carrierAliases)
    ) {
      returnsInstance = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(declaration.body, visit);
  return returnsInstance;
}

function constructorInstanceAliases(
  sourceFile: ts.SourceFile,
  constructorNames: ReadonlySet<string>
): ReadonlySet<string> {
  let byConstructorNames = constructorInstanceAliasCache.get(sourceFile);
  if (byConstructorNames === undefined) {
    byConstructorNames = new Map();
    constructorInstanceAliasCache.set(sourceFile, byConstructorNames);
  }
  const cacheKey = aliasSetKey(constructorNames);
  const cached = byConstructorNames.get(cacheKey);
  if (cached !== undefined) return cached;
  const aliases = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name !== undefined &&
        !aliases.has(node.name.text) &&
        functionLikeReturnsConstructorInstance(node, constructorNames, aliases)
      ) {
        aliases.add(node.name.text);
        changed = true;
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        const initializer = transparentExpression(node.initializer);
        if (
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          !aliases.has(node.name.text) &&
          functionLikeReturnsConstructorInstance(initializer, constructorNames, aliases)
        ) {
          aliases.add(node.name.text);
          changed = true;
        }
        if (ts.isObjectLiteralExpression(initializer)) {
          for (const property of initializer.properties) {
            const memberName = ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property)
              ? staticPropertyName(property.name)
              : null;
            const factory = ts.isMethodDeclaration(property)
              ? property
              : ts.isPropertyAssignment(property) &&
                  (ts.isArrowFunction(property.initializer) ||
                    ts.isFunctionExpression(property.initializer))
                ? property.initializer
                : null;
            const factoryPath = memberName === null ? null : `${node.name.text}.${memberName}`;
            if (
              factory !== null &&
              factoryPath !== null &&
              !aliases.has(factoryPath) &&
              functionLikeReturnsConstructorInstance(factory, constructorNames, aliases)
            ) {
              aliases.add(factoryPath);
              changed = true;
            }
          }
        }
      }
      if (ts.isClassDeclaration(node) && node.name !== undefined) {
        for (const member of node.members) {
          if (!ts.isMethodDeclaration(member) || !isStaticMethod(member)) {
            continue;
          }
          const memberName = staticPropertyName(member.name);
          const factoryPath = memberName === null ? null : `${node.name.text}.${memberName}`;
          if (
            factoryPath !== null &&
            !aliases.has(factoryPath) &&
            functionLikeReturnsConstructorInstance(member, constructorNames, aliases)
          ) {
            aliases.add(factoryPath);
            changed = true;
          }
        }
      }
      let left: ts.Identifier | undefined;
      let right: ts.Expression | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        left = node.name;
        right = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        left = node.left;
        right = node.right;
      }
      if (left !== undefined && right !== undefined && !aliases.has(left.text)) {
        if (expressionCarriesConstructorInstance(right, constructorNames, aliases)) {
          aliases.add(left.text);
          changed = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  byConstructorNames.set(cacheKey, aliases);
  return aliases;
}

function isConstructorInstanceExpression(
  expression: ts.Expression,
  constructorNames: ReadonlySet<string>,
  instanceAliases: ReadonlySet<string>
): boolean {
  return expressionCarriesConstructorInstance(expression, constructorNames, instanceAliases);
}

function expressionMayBeConstructorPrototype(
  expression: ts.Expression,
  constructorNames: ReadonlySet<string>,
  prototypeAliases: ReadonlySet<string>,
  instanceAliases: ReadonlySet<string>
): boolean {
  const current = transparentExpression(expression);
  const identifier = transparentIdentifier(current);
  if (identifier !== null && prototypeAliases.has(identifier.text)) {
    return true;
  }
  if (isConstructorPrototype(current, constructorNames)) {
    return true;
  }
  const memberReceiver = staticMemberAccessReceiver(current);
  const memberName = staticMemberAccessName(current);
  if (
    memberReceiver !== null &&
    memberName === "__proto__" &&
    isConstructorInstanceExpression(memberReceiver, constructorNames, instanceAliases)
  ) {
    return true;
  }
  if (memberReceiver !== null && memberName === "prototype") {
    const constructorReceiver = staticMemberAccessReceiver(memberReceiver);
    if (
      staticMemberAccessName(memberReceiver) === "constructor" &&
      constructorReceiver !== null &&
      isConstructorInstanceExpression(constructorReceiver, constructorNames, instanceAliases)
    ) {
      return true;
    }
  }
  if (
    memberReceiver !== null &&
    expressionMayBeConstructorPrototype(
      memberReceiver,
      constructorNames,
      prototypeAliases,
      instanceAliases
    )
  ) {
    return true;
  }
  const memberConstructor = memberReceiver === null
    ? null
    : transparentIdentifier(memberReceiver);
  if (
    memberConstructor !== null &&
    constructorNames.has(memberConstructor.text) &&
    staticMemberAccessName(current) === null
  ) {
    return true;
  }
  if (ts.isCallExpression(current)) {
    const callOwnerExpression = staticMemberAccessReceiver(current.expression);
    const callOwner = callOwnerExpression === null
      ? null
      : transparentIdentifier(callOwnerExpression);
    const callMethod = staticMemberAccessName(current.expression);
    if (
      callOwner !== null &&
      (callOwner.text === "Object" || callOwner.text === "Reflect") &&
      callMethod === "getPrototypeOf" &&
      current.arguments[0] !== undefined &&
      isConstructorInstanceExpression(current.arguments[0], constructorNames, instanceAliases)
    ) {
      return true;
    }
    return current.arguments.some((argument) => {
      const argumentIdentifier = transparentIdentifier(argument);
      return (
        (argumentIdentifier !== null && constructorNames.has(argumentIdentifier.text)) ||
        isConstructorInstanceExpression(argument, constructorNames, instanceAliases) ||
        expressionMayBeConstructorPrototype(
          argument,
          constructorNames,
          prototypeAliases,
          instanceAliases
        )
      );
    });
  }
  return false;
}

function expressionMayBeUnprovenDynamicPrototype(expression: ts.Expression): boolean {
  const current = transparentExpression(expression);
  if (ts.isCallExpression(current)) {
    return true;
  }
  const receiver = staticMemberAccessReceiver(current);
  const memberName = staticMemberAccessName(current);
  if (receiver === null) {
    return false;
  }
  if (memberName === "__proto__") {
    return true;
  }
  if (
    memberName === "prototype" &&
    staticMemberAccessName(receiver) === "constructor"
  ) {
    return true;
  }
  return expressionMayBeUnprovenDynamicPrototype(receiver);
}

function expressionCarriesUnprovenDynamicPrototype(
  expression: ts.Expression,
  carrierAliases: ReadonlySet<string>
): boolean {
  const current = transparentExpression(expression);
  if (expressionMayBeUnprovenDynamicPrototype(current)) {
    return true;
  }
  const expressionPath = staticExpressionPath(current);
  if (expressionPath !== null && carrierAliases.has(expressionPath)) {
    return true;
  }
  const identifier = transparentIdentifier(current);
  if (identifier !== null && carrierAliases.has(identifier.text)) {
    return true;
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return expressionCarriesUnprovenDynamicPrototype(property.initializer, carrierAliases);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return carrierAliases.has(property.name.text);
      }
      return ts.isSpreadAssignment(property) &&
        expressionCarriesUnprovenDynamicPrototype(property.expression, carrierAliases);
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        expressionCarriesUnprovenDynamicPrototype(element, carrierAliases)
    );
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return expressionCarriesUnprovenDynamicPrototype(current.expression, carrierAliases);
  }
  let nestedCarrier = false;
  ts.forEachChild(current, (child) => {
    if (
      !nestedCarrier &&
      ts.isExpression(child) &&
      expressionCarriesUnprovenDynamicPrototype(child, carrierAliases)
    ) {
      nestedCarrier = true;
    }
  });
  return nestedCarrier;
}

function assignmentTargetPaths(expression: ts.Expression): readonly string[] {
  const current = transparentExpression(expression);
  const directPath = staticExpressionPath(current);
  if (directPath !== null) {
    return [directPath];
  }
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return assignmentTargetPaths(current.left);
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.flatMap((element) => {
      if (ts.isOmittedExpression(element)) {
        return [];
      }
      return assignmentTargetPaths(
        ts.isSpreadElement(element) ? element.expression : element
      );
    });
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property)) {
        return assignmentTargetPaths(property.initializer);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return [property.name.text];
      }
      if (ts.isSpreadAssignment(property)) {
        return assignmentTargetPaths(property.expression);
      }
      return [];
    });
  }
  return [];
}

function unprovenDynamicPrototypeCarrierAliases(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const cached = unprovenDynamicPrototypeAliasCache.get(sourceFile);
  if (cached !== undefined) return cached;
  const aliases = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      let leftNames: readonly string[] = [];
      let right: ts.Expression | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined
      ) {
        leftNames = bindingNames(node.name);
        right = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        leftNames = assignmentTargetPaths(node.left);
        right = node.right;
      }
      if (
        leftNames.length > 0 &&
        right !== undefined &&
        expressionCarriesUnprovenDynamicPrototype(right, aliases)
      ) {
        for (const leftName of leftNames) {
          if (!aliases.has(leftName)) {
            aliases.add(leftName);
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  unprovenDynamicPrototypeAliasCache.set(sourceFile, aliases);
  return aliases;
}

function staticDestructuringPropertyName(name: ts.PropertyName): string | null {
  const directName = staticPropertyName(name);
  if (directName !== null) {
    return directName;
  }
  if (ts.isComputedPropertyName(name)) {
    const expression = transparentExpression(name.expression);
    return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
      ? expression.text
      : null;
  }
  return null;
}

function constructorPrototypeAliases(
  sourceFile: ts.SourceFile,
  constructorNames: ReadonlySet<string>,
  instanceAliases: ReadonlySet<string>
): ReadonlySet<string> {
  let byInputs = constructorPrototypeAliasCache.get(sourceFile);
  if (byInputs === undefined) {
    byInputs = new Map();
    constructorPrototypeAliasCache.set(sourceFile, byInputs);
  }
  const cacheKey = `${aliasSetKey(constructorNames)}\u0001${aliasSetKey(instanceAliases)}`;
  const cached = byInputs.get(cacheKey);
  if (cached !== undefined) return cached;
  const aliases = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined
      ) {
        const constructor = transparentIdentifier(node.initializer);
        if (constructor !== null && constructorNames.has(constructor.text)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) {
              continue;
            }
            const property = element.propertyName ?? element.name;
            const propertyName = staticDestructuringPropertyName(property);
            if (
              propertyName === "prototype" &&
              !aliases.has(element.name.text)
            ) {
              aliases.add(element.name.text);
              changed = true;
            }
          }
        }
      }
      const assignmentPattern = ts.isBinaryExpression(node)
        ? transparentExpression(node.left)
        : null;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        assignmentPattern !== null &&
        ts.isObjectLiteralExpression(assignmentPattern)
      ) {
        const constructor = transparentIdentifier(node.right);
        if (constructor !== null && constructorNames.has(constructor.text)) {
          for (const property of assignmentPattern.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              staticDestructuringPropertyName(property.name) === "prototype"
            ) {
              const target = transparentIdentifier(property.initializer);
              if (target !== null && !aliases.has(target.text)) {
                aliases.add(target.text);
                changed = true;
              }
            } else if (
              ts.isShorthandPropertyAssignment(property) &&
              property.name.text === "prototype" &&
              !aliases.has(property.name.text)
            ) {
              aliases.add(property.name.text);
              changed = true;
            }
          }
        }
      }
      let left: ts.Identifier | undefined;
      let right: ts.Expression | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        left = node.name;
        right = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        left = node.left;
        right = node.right;
      }
      if (left !== undefined && right !== undefined && !aliases.has(left.text)) {
        if (expressionMayBeConstructorPrototype(right, constructorNames, aliases, instanceAliases)) {
          aliases.add(left.text);
          changed = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  byInputs.set(cacheKey, aliases);
  return aliases;
}

function receiverMemberIsMutated(
  sourceFile: ts.SourceFile,
  receiver: ts.Expression,
  methodName: string,
  callNode: ts.Node
): boolean {
  const receiverPath = staticExpressionPath(receiver);
  const owner =
    receiverPath === "this" || receiverPath?.startsWith("this.") === true
      ? nearestNamedClass(callNode)
      : null;
  let byReceiver = receiverMemberMutationCache.get(sourceFile);
  if (byReceiver === undefined) {
    byReceiver = new Map();
    receiverMemberMutationCache.set(sourceFile, byReceiver);
  }
  const receiverIdentity =
    receiverPath ?? `${receiver.getStart(sourceFile)}:${receiver.end}`;
  const cacheKey = `${owner?.pos ?? -1}\u0000${receiverIdentity}\u0000${methodName}`;
  const cached = byReceiver.get(cacheKey);
  if (cached !== undefined) return cached;
  const aliases = ts.isIdentifier(receiver)
    ? identifierAliases(sourceFile, receiver.text)
    : receiverPath === null
      ? null
      : new Set([receiverPath]);
  const receiverCarrierAliases =
    aliases === null ? null : trackedValueCarrierAliases(owner ?? sourceFile, aliases);
  const constructorName =
    ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression)
      ? receiver.expression.text
      : null;
  const constructorAliases = constructorName === null
    ? null
    : identifierAliases(sourceFile, constructorName);
  const instanceAliases = constructorAliases === null
    ? null
    : constructorInstanceAliases(sourceFile, constructorAliases);
  const prototypeAliases = constructorAliases === null
    ? null
    : constructorPrototypeAliases(sourceFile, constructorAliases, instanceAliases ?? new Set());
  const unprovenPrototypeAliases = constructorAliases === null
    ? null
    : unprovenDynamicPrototypeCarrierAliases(sourceFile);
  if (prototypeAliases !== null && prototypeAliases.size > 0) {
    byReceiver.set(cacheKey, true);
    return true;
  }
  const root: ts.Node = owner ?? sourceFile;
  const matchesReceiver = (expression: ts.Expression): boolean => {
    const identifier = transparentIdentifier(expression);
    return (
      (receiverCarrierAliases !== null &&
        ((identifier !== null && receiverCarrierAliases.has(identifier.text)) ||
          expressionCarriesTrackedValue(expression, receiverCarrierAliases))) ||
      (constructorAliases !== null &&
        (isConstructorInstanceExpression(expression, constructorAliases, instanceAliases ?? new Set()) ||
          expressionMayBeConstructorPrototype(
            expression,
            constructorAliases,
            prototypeAliases ?? new Set(),
            instanceAliases ?? new Set()
          ))) ||
      (owner !== null && expression.kind === ts.SyntaxKind.ThisKeyword)
    );
  };
  const matchesUnprovenPrototype = (expression: ts.Expression): boolean =>
    constructorAliases !== null &&
    expressionCarriesUnprovenDynamicPrototype(
      expression,
      unprovenPrototypeAliases ?? new Set()
    );
  let mutated = false;
  const visit = (node: ts.Node): void => {
    if (mutated) {
      return;
    }
    const mutationTarget = memberMutationCallTarget(node);
    if (
      mutationTarget !== null &&
      (matchesReceiver(mutationTarget) ||
        matchesUnprovenPrototype(mutationTarget))
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.some(
        (argument) => matchesReceiver(argument)
      )
    ) {
      mutated = true;
      return;
    }
    const assignedMemberName = ts.isBinaryExpression(node)
      ? staticMemberAccessName(node.left)
      : null;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      (assignedMemberName === methodName || assignedMemberName === null) &&
      (staticMemberAccessReceiver(node.left) !== null &&
        (matchesReceiver(staticMemberAccessReceiver(node.left)!) ||
          matchesUnprovenPrototype(staticMemberAccessReceiver(node.left)!)))
    ) {
      mutated = true;
      return;
    }
    const deletedMemberName = ts.isDeleteExpression(node)
      ? staticMemberAccessName(node.expression)
      : null;
    if (
      ts.isDeleteExpression(node) &&
      (deletedMemberName === methodName || deletedMemberName === null) &&
      staticMemberAccessReceiver(node.expression) !== null &&
      (matchesReceiver(staticMemberAccessReceiver(node.expression)!) ||
        matchesUnprovenPrototype(staticMemberAccessReceiver(node.expression)!))
    ) {
      mutated = true;
      return;
    }
    if (
      owner !== null &&
      node !== root &&
      (ts.isClassDeclaration(node) || ts.isClassExpression(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  byReceiver.set(cacheKey, mutated);
  return mutated;
}

function constructorPrototypeMemberIsMutated(
  sourceFile: ts.SourceFile,
  constructorName: string,
  memberName: string
): boolean {
  let byConstructorMember = constructorPrototypeMemberMutationCache.get(sourceFile);
  if (byConstructorMember === undefined) {
    byConstructorMember = new Map();
    constructorPrototypeMemberMutationCache.set(sourceFile, byConstructorMember);
  }
  const cacheKey = `${constructorName}\u0000${memberName}`;
  const cached = byConstructorMember.get(cacheKey);
  if (cached !== undefined) return cached;
  const constructorAliases = identifierAliases(sourceFile, constructorName);
  const instanceAliases = constructorInstanceAliases(sourceFile, constructorAliases);
  const prototypeAliases = constructorPrototypeAliases(
    sourceFile,
    constructorAliases,
    instanceAliases
  );
  if (prototypeAliases.size > 0) {
    byConstructorMember.set(cacheKey, true);
    return true;
  }
  const matchesPrototype = (expression: ts.Expression): boolean =>
    expressionMayBeConstructorPrototype(
      expression,
      constructorAliases,
      prototypeAliases,
      instanceAliases
    );
  let mutated = false;
  const visit = (node: ts.Node): void => {
    if (mutated) {
      return;
    }
    const mutationTarget = memberMutationCallTarget(node);
    if (mutationTarget !== null && matchesPrototype(mutationTarget)) {
      mutated = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.some((argument) => matchesPrototype(argument))
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const receiver = staticMemberAccessReceiver(node.left);
      const assignedMemberName = staticMemberAccessName(node.left);
      if (
        matchesPrototype(node.left) ||
        (receiver !== null &&
          matchesPrototype(receiver) &&
          (assignedMemberName === memberName || assignedMemberName === null))
      ) {
        mutated = true;
        return;
      }
    }
    if (ts.isDeleteExpression(node)) {
      const receiver = staticMemberAccessReceiver(node.expression);
      const deletedMemberName = staticMemberAccessName(node.expression);
      if (
        matchesPrototype(node.expression) ||
        (receiver !== null &&
          matchesPrototype(receiver) &&
          (deletedMemberName === memberName || deletedMemberName === null))
      ) {
        mutated = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  byConstructorMember.set(cacheKey, mutated);
  return mutated;
}

interface RuntimeTaintedTypeScriptMemberSurface {
  readonly typeSymbolId: string;
  readonly memberName: string | null;
  readonly memberKind: "static" | "instance";
}

function staticStringValue(expression: ts.Expression | undefined): string | null {
  return expression !== undefined &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;
}

function runtimeTaintedMemberSurfaces(
  sourceFile: ts.SourceFile,
  typeSymbolsByDeclaration: ReadonlyMap<ts.ClassDeclaration | ts.ClassExpression, SymbolNode>
): readonly RuntimeTaintedTypeScriptMemberSurface[] {
  type Owner = ts.ClassDeclaration | ts.ClassExpression;
  type OwnerMap = Map<string, Owner | null>;
  const classAliases: OwnerMap = new Map();
  const prototypeAliases: OwnerMap = new Map();
  const instanceAliases: OwnerMap = new Map();
  const factoryAliases: OwnerMap = new Map();
  const setOwner = (map: OwnerMap, key: string, owner: Owner): boolean => {
    const existing = map.get(key);
    if (existing === owner || (existing === null && map.has(key))) {
      return false;
    }
    map.set(key, existing === undefined ? owner : null);
    return true;
  };
  const ownerFor = (map: OwnerMap, key: string | null): Owner | null =>
    key === null ? null : (map.get(key) ?? null);
  for (const owner of typeSymbolsByDeclaration.keys()) {
    if (owner.name !== undefined) {
      setOwner(classAliases, owner.name.text, owner);
    }
  }
  const aliasNodes: ts.Node[] = [];
  const collectAliasNodes = (node: ts.Node): void => {
    aliasNodes.push(node);
    ts.forEachChild(node, collectAliasNodes);
  };
  ts.forEachChild(sourceFile, collectAliasNodes);
  const expressionInstanceOwner = (expression: ts.Expression): Owner | null => {
    const current = transparentExpression(expression);
    const path = staticExpressionPath(current);
    const direct = ownerFor(instanceAliases, path);
    if (direct !== null) {
      return direct;
    }
    if (ts.isNewExpression(current)) {
      return ownerFor(classAliases, staticExpressionPath(current.expression));
    }
    if (ts.isCallExpression(current)) {
      return ownerFor(factoryAliases, staticExpressionPath(current.expression));
    }
    const nestedExpressions: ts.Expression[] = [];
    if (ts.isObjectLiteralExpression(current)) {
      for (const property of current.properties) {
        if (ts.isPropertyAssignment(property)) nestedExpressions.push(property.initializer);
        else if (ts.isShorthandPropertyAssignment(property)) nestedExpressions.push(property.name);
        else if (ts.isSpreadAssignment(property)) nestedExpressions.push(property.expression);
      }
    } else if (ts.isArrayLiteralExpression(current)) {
      nestedExpressions.push(
        ...current.elements.filter((element): element is ts.Expression => !ts.isOmittedExpression(element))
      );
    } else if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      // The direct full path was checked above. Do not infer that an arbitrary
      // property value is the same instance merely because its receiver is.
      return null;
    } else if (ts.isConditionalExpression(current)) {
      nestedExpressions.push(current.whenTrue, current.whenFalse);
    } else if (
      ts.isBinaryExpression(current) &&
      (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        current.operatorToken.kind === ts.SyntaxKind.CommaToken)
    ) {
      nestedExpressions.push(current.left, current.right);
    }
    const owners = nestedExpressions
      .map(expressionInstanceOwner)
      .filter((owner): owner is Owner => owner !== null);
    return owners.length > 0 && owners.every((owner) => owner === owners[0])
      ? (owners[0] ?? null)
      : null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visitAliases = (node: ts.Node): void => {
      let left: ts.Identifier | undefined;
      let right: ts.Expression | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        left = node.name;
        right = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        left = node.left;
        right = node.right;
      }
      if (left !== undefined && right !== undefined) {
        const rightPath = staticExpressionPath(right);
        const classOwner = ownerFor(classAliases, rightPath);
        if (classOwner !== null) changed = setOwner(classAliases, left.text, classOwner) || changed;
        const prototypeOwner =
          ownerFor(prototypeAliases, rightPath) ??
          (staticMemberAccessName(right) === "prototype"
            ? ownerFor(
                classAliases,
                staticExpressionPath(staticMemberAccessReceiver(right) ?? right)
              )
            : null);
        if (prototypeOwner !== null) {
          changed = setOwner(prototypeAliases, left.text, prototypeOwner) || changed;
        }
        const instanceOwner = expressionInstanceOwner(right);
        if (instanceOwner !== null) {
          changed = setOwner(instanceAliases, left.text, instanceOwner) || changed;
        }
        const initializer = transparentExpression(right);
        if (ts.isObjectLiteralExpression(initializer)) {
          for (const property of initializer.properties) {
            const memberName = ts.isSpreadAssignment(property)
              ? null
              : staticPropertyName(property.name);
            const memberExpression = ts.isPropertyAssignment(property)
              ? property.initializer
              : ts.isShorthandPropertyAssignment(property)
                ? property.name
                : ts.isSpreadAssignment(property)
                  ? property.expression
                  : undefined;
            const memberOwner = memberExpression === undefined
              ? null
              : expressionInstanceOwner(memberExpression);
            if (memberName !== null && memberOwner !== null) {
              changed = setOwner(instanceAliases, `${left.text}.${memberName}`, memberOwner) || changed;
            }
          }
        }
        if (ts.isArrayLiteralExpression(initializer)) {
          initializer.elements.forEach((element, index) => {
            if (ts.isOmittedExpression(element)) return;
            const memberOwner = expressionInstanceOwner(
              ts.isSpreadElement(element) ? element.expression : element
            );
            if (memberOwner !== null) {
              changed = setOwner(instanceAliases, `${left.text}.${index}`, memberOwner) || changed;
            }
          });
        }
      }
      const factoryDeclaration =
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
          ? node
          : null;
      const factoryPath =
        ts.isFunctionDeclaration(node) && node.name !== undefined
          ? node.name.text
          : (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) &&
              node.parent !== undefined &&
              (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) &&
              node.parent.name !== undefined
            ? `${node.parent.name.text}.${staticPropertyName(node.name) ?? ""}`
            : ts.isArrowFunction(node) || ts.isFunctionExpression(node)
              ? ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
                ? node.parent.name.text
                : null
              : null;
      if (factoryDeclaration !== null && factoryPath !== null && factoryPath !== "") {
        const bodies: ts.Expression[] = [];
        if (ts.isArrowFunction(factoryDeclaration) && !ts.isBlock(factoryDeclaration.body)) {
          bodies.push(factoryDeclaration.body);
        } else if (factoryDeclaration.body !== undefined) {
          const collectReturns = (current: ts.Node): void => {
            if (current !== factoryDeclaration && ts.isFunctionLike(current)) return;
            if (ts.isReturnStatement(current) && current.expression !== undefined) {
              bodies.push(current.expression);
              return;
            }
            ts.forEachChild(current, collectReturns);
          };
          ts.forEachChild(factoryDeclaration.body, collectReturns);
        }
        const owners = bodies
          .map(expressionInstanceOwner)
          .filter((owner): owner is Owner => owner !== null);
        if (owners.length > 0 && owners.every((owner) => owner === owners[0])) {
          changed = setOwner(factoryAliases, factoryPath, owners[0]!) || changed;
        }
      }
    };
    for (const node of aliasNodes) visitAliases(node);
    for (let index = aliasNodes.length - 1; index >= 0; index -= 1) {
      const node = aliasNodes[index];
      if (node !== undefined) visitAliases(node);
    }
  }
  const surfaces = new Map<string, RuntimeTaintedTypeScriptMemberSurface>();
  const add = (
    owner: Owner,
    memberKind: "static" | "instance",
    memberName: string | null
  ): void => {
    const typeSymbolId = typeSymbolsByDeclaration.get(owner)?.id;
    if (typeSymbolId === undefined) return;
    surfaces.set(`${typeSymbolId}\u0000${memberKind}\u0000${memberName ?? "*"}`, {
      typeSymbolId,
      memberKind,
      memberName
    });
  };
  const classify = (
    expression: ts.Expression,
    node: ts.Node
  ): { readonly owner: Owner; readonly memberKind: "static" | "instance" } | null => {
    const current = transparentExpression(expression);
    if (current.kind === ts.SyntaxKind.ThisKeyword) {
      const owner = nearestNamedClass(node);
      return owner !== null && typeSymbolsByDeclaration.has(owner)
        ? { owner, memberKind: "instance" }
        : null;
    }
    const path = staticExpressionPath(current);
    const instanceOwner = expressionInstanceOwner(current);
    const prototypeOwner =
      ownerFor(prototypeAliases, path) ??
      (staticMemberAccessName(current) === "prototype"
        ? ownerFor(
            classAliases,
            staticExpressionPath(staticMemberAccessReceiver(current) ?? current)
          )
        : null);
    const staticOwner = ownerFor(classAliases, path);
    const candidates = [
      ...(instanceOwner === null ? [] : [{ owner: instanceOwner, memberKind: "instance" as const }]),
      ...(prototypeOwner === null ? [] : [{ owner: prototypeOwner, memberKind: "instance" as const }]),
      ...(staticOwner === null ? [] : [{ owner: staticOwner, memberKind: "static" as const }])
    ].filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) => other.owner === candidate.owner && other.memberKind === candidate.memberKind
        ) === index
    );
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
  };
  const objectMemberNames = (expression: ts.Expression | undefined): readonly string[] | null => {
    if (expression === undefined || !ts.isObjectLiteralExpression(transparentExpression(expression))) {
      return null;
    }
    const literal = transparentExpression(expression) as ts.ObjectLiteralExpression;
    const names = literal.properties.map((property) =>
      ts.isSpreadAssignment(property) ? null : staticPropertyName(property.name)
    );
    return names.every((name): name is string => name !== null) ? names : null;
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const wholePrototype = classify(node.left, node);
      if (staticMemberAccessName(node.left) === "prototype" && wholePrototype?.memberKind === "instance") {
        add(wholePrototype.owner, "instance", null);
      } else {
        const receiver = staticMemberAccessReceiver(node.left);
        const memberName = staticMemberAccessName(node.left);
        const surface = receiver === null ? null : classify(receiver, node);
        if (surface !== null) {
          add(surface.owner, surface.memberKind, memberName);
        }
      }
    }
    if (ts.isDeleteExpression(node)) {
      const receiver = staticMemberAccessReceiver(node.expression);
      const memberName = staticMemberAccessName(node.expression);
      const surface = receiver === null ? null : classify(receiver, node);
      if (surface !== null) {
        add(surface.owner, surface.memberKind, memberName);
      }
    }
    if (ts.isCallExpression(node)) {
      const target = memberMutationCallTarget(node);
      const surface = target === null ? null : classify(target, node);
      if (surface !== null) {
        const method = staticMemberAccessName(node.expression);
        if (method === "defineProperty" || method === "set") {
          add(surface.owner, surface.memberKind, staticStringValue(node.arguments[1]));
        } else if (method === "assign" || method === "defineProperties") {
          const names = objectMemberNames(node.arguments[1]);
          if (names === null) {
            add(surface.owner, surface.memberKind, null);
          } else {
            for (const name of names) {
              add(surface.owner, surface.memberKind, name);
            }
          }
        } else {
          add(surface.owner, surface.memberKind, null);
        }
      }
      for (const argument of node.arguments) {
        if (ts.isNewExpression(transparentExpression(argument))) {
          continue;
        }
        const argumentSurface = classify(argument, node);
        if (argumentSurface !== null && argument !== target) {
          add(argumentSurface.owner, argumentSurface.memberKind, null);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return [...surfaces.values()];
}

/**
 * Proves the callback hop made by one direct `const values = []` Array sort.
 * Unknown receivers, mutable bindings, optional calls, extra arguments, and
 * object methods named `sort` remain ordinary property calls with no inferred
 * callback edge.
 */
function staticArraySortComparator(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): ts.Identifier | null {
  const expression = node.expression;
  const callback = node.arguments[0];
  if (
    node.questionDotToken !== undefined ||
    node.arguments.length !== 1 ||
    callback === undefined ||
    !ts.isIdentifier(callback) ||
    !ts.isPropertyAccessExpression(expression) ||
    expression.questionDotToken !== undefined ||
    expression.name.text !== "sort" ||
    !ts.isIdentifier(expression.expression)
  ) {
    return null;
  }
  if (
    receiverMemberIsMutated(sourceFile, expression.expression, "sort", node) ||
    constructorPrototypeMemberIsMutated(sourceFile, "Array", "sort")
  ) {
    return null;
  }
  const binding = visibleRouteBinding(sourceFile, expression.expression, bindings);
  if (
    binding === undefined ||
    !ts.isVariableDeclaration(binding.declaration) ||
    !isConstVariableDeclaration(binding.declaration) ||
    binding.declaration.initializer === undefined ||
    !ts.isArrayLiteralExpression(binding.declaration.initializer)
  ) {
    return null;
  }
  return callback;
}

/**
 * Recognizes a bounded TypeScript member call only when the receiver's class or
 * interface is explicit in source. Dynamic/computed/optional/mutable shapes
 * remain unprojected instead of becoming a name-only exact edge.
 */
function staticTypeScriptMemberCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticTypeScriptMemberCall | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined
  ) {
    return null;
  }
  const access = node.expression;
  if (!ts.isIdentifier(access.name)) {
    return null;
  }
  const receiver = access.expression;
  if (receiverMemberIsMutated(sourceFile, receiver, access.name.text, node)) {
    return null;
  }

  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    const receiverEvidence = staticThisReceiver(node);
    return receiverEvidence === null
      ? null
      : {
          method: access.name,
          receiverTypeName: receiverEvidence.typeName,
          receiverBindingSpace: "type",
          receiverMemberKind: receiverEvidence.memberKind,
          inlineParameterMember: false
        };
  }

  if (ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression)) {
    const receiverTypeName = provenValueConstructorName(
      sourceFile,
      receiver.expression,
      bindings
    );
    if (receiverTypeName === null) {
      return null;
    }
    return {
      method: access.name,
      receiverTypeName,
      receiverBindingSpace: "value",
      receiverMemberKind: "instance",
      inlineParameterMember: false
    };
  }

  if (
    ts.isPropertyAccessExpression(receiver) &&
    receiver.questionDotToken === undefined &&
    receiver.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    const owner = nearestNamedClass(node);
    if (owner === null || thisPropertyIsMutated(owner, receiver.name.text)) {
      return null;
    }
    const receiverTypeName = directReadonlyConstructorParameterPropertyType(node, receiver.name.text);
    return receiverTypeName === null
      ? null
      : {
          method: access.name,
          receiverTypeName: receiverTypeName.text,
          receiverBindingSpace: "type",
          receiverMemberKind: "instance",
          inlineParameterMember: false
        };
  }

  if (!ts.isIdentifier(receiver)) {
    return null;
  }
  const binding = visibleRouteBinding(sourceFile, receiver, bindings);
  const declaration = binding?.declaration;
  if (declaration === undefined) {
    return null;
  }
  if (binding?.kind === "typescript-namespace") {
    return {
      method: access.name,
      receiverTypeName: receiver.text,
      receiverBindingSpace: "value",
      receiverMemberKind: "static",
      inlineParameterMember: false
    };
  }
  if (ts.isClassDeclaration(declaration) || directValueImportSpecifier(declaration) !== null) {
    return {
      method: access.name,
      receiverTypeName: receiver.text,
      receiverBindingSpace: "value",
      receiverMemberKind: "static",
      inlineParameterMember: false
    };
  }
  if (ts.isVariableDeclaration(declaration)) {
    if (
      !isConstVariableDeclaration(declaration) ||
      declaration.initializer === undefined ||
      !ts.isNewExpression(declaration.initializer) ||
      !ts.isIdentifier(declaration.initializer.expression) ||
      provenValueConstructorName(sourceFile, declaration.initializer.expression, bindings) === null
    ) {
      return null;
    }
    return {
      method: access.name,
      receiverTypeName: declaration.initializer.expression.text,
      receiverBindingSpace: "value",
      receiverMemberKind: "instance",
      inlineParameterMember: false
    };
  }
  if (ts.isParameter(declaration)) {
    const typeName = typeReferenceIdentifier(declaration.type);
    if (typeName !== null) {
      return {
        method: access.name,
        receiverTypeName: typeName.text,
        receiverBindingSpace: "type",
        receiverMemberKind: "instance",
        inlineParameterMember: false
      };
    }
    if (declaration.type !== undefined && ts.isTypeLiteralNode(declaration.type)) {
      const callableMembers = declaration.type.members.filter(
        (member) =>
          ((ts.isPropertySignature(member) &&
            member.type !== undefined &&
            ts.isFunctionTypeNode(member.type)) ||
            ts.isMethodSignature(member)) &&
          member.name !== undefined &&
          ts.isIdentifier(member.name) &&
          member.name.text === access.name.text
      );
      return callableMembers.length === 1
        ? {
            method: access.name,
            receiverTypeName: null,
            receiverBindingSpace: null,
            receiverMemberKind: "instance",
            inlineParameterMember: true
          }
        : null;
    }
    return null;
  }
  return null;
}

/**
 * Recognizes `NativeModules.Module.method()` and
 * `ReactNative.NativeModules.Module.method()` only through one exact visible
 * import binding. Property aliases, computed access, optional chains, and
 * dynamic module or method names stay outside this bridge surface.
 */
function staticReactNativeNativeModuleCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeNativeModuleCall | null {
  const expression = node.expression;
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(expression) ||
    expression.questionDotToken !== undefined
  ) {
    return null;
  }
  const methodAccess = expression;
  const moduleExpression = methodAccess.expression;
  if (
    !ts.isPropertyAccessExpression(moduleExpression) ||
    moduleExpression.questionDotToken !== undefined
  ) {
    return null;
  }
  const moduleAccess = moduleExpression;
  const receiver = moduleAccess.expression;
  const directNativeModules =
    ts.isIdentifier(receiver) &&
    visibleRouteBindingKind(sourceFile, receiver, bindings) === "react-native-native-modules";
  const namespaceNativeModules =
    ts.isPropertyAccessExpression(receiver) &&
    receiver.questionDotToken === undefined &&
    receiver.name.text === "NativeModules" &&
    ts.isIdentifier(receiver.expression) &&
    visibleRouteBindingKind(sourceFile, receiver.expression, bindings) === "react-native-namespace";
  return directNativeModules || namespaceNativeModules
    ? {
        moduleName: moduleAccess.name.text,
        methodName: methodAccess.name.text,
        expression: methodAccess
      }
    : null;
}

/**
 * Recognizes exactly `TurboModuleRegistry.get*<Spec>("Module")` through a
 * direct named or namespace import from react-native. The module name remains
 * literal; type arguments are retained only when they are one bare identifier.
 */
function staticReactNativeTurboModuleRegistryCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleRegistryCall | null {
  const moduleNameArgument = node.arguments[0];
  if (
    node.questionDotToken !== undefined ||
    node.arguments.length !== 1 ||
    moduleNameArgument === undefined ||
    !ts.isStringLiteral(moduleNameArgument) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    (node.expression.name.text !== "get" && node.expression.name.text !== "getEnforcing")
  ) {
    return null;
  }

  const receiver = node.expression.expression;
  const directRegistry =
    ts.isIdentifier(receiver) &&
    visibleRouteBindingKind(sourceFile, receiver, bindings) === "react-native-turbo-module-registry";
  const namespaceRegistry =
    ts.isPropertyAccessExpression(receiver) &&
    receiver.questionDotToken === undefined &&
    receiver.name.text === "TurboModuleRegistry" &&
    ts.isIdentifier(receiver.expression) &&
    visibleRouteBindingKind(sourceFile, receiver.expression, bindings) === "react-native-namespace";
  if (!directRegistry && !namespaceRegistry) {
    return null;
  }

  const typeArgument = node.typeArguments?.length === 1 ? node.typeArguments[0] : undefined;
  const typeName =
    typeArgument !== undefined &&
    ts.isTypeReferenceNode(typeArgument) &&
    ts.isIdentifier(typeArgument.typeName) &&
    typeArgument.typeArguments === undefined
      ? typeArgument.typeName.text
      : null;
  return { moduleName: moduleNameArgument.text, typeName };
}

function unwrapReactNativeTurboModuleExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticReactNativeTurboModuleRegistryResult(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleRegistryCall | null {
  const unwrapped = unwrapReactNativeTurboModuleExpression(expression);
  return ts.isCallExpression(unwrapped)
    ? staticReactNativeTurboModuleRegistryCall(sourceFile, unwrapped, bindings)
    : null;
}

/**
 * Recognizes `const Module = TurboModuleRegistry.get*<Spec>("Module")` and
 * the direct chained form `TurboModuleRegistry.get*<Spec>("Module").method()`.
 * Mutable bindings, optional chains, and computed access remain outside the
 * evidence surface.
 */
function staticReactNativeTurboModuleCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleCall | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined
  ) {
    return null;
  }

  const methodAccess = node.expression;
  const receiver = methodAccess.expression;
  const localBinding =
    ts.isIdentifier(receiver) ? visibleRouteBinding(sourceFile, receiver, bindings) : undefined;
  const moduleName =
    localBinding?.kind === "react-native-turbo-module"
      ? localBinding.reactNativeTurboModuleName
      : staticReactNativeTurboModuleRegistryResult(sourceFile, receiver, bindings)?.moduleName;
  return moduleName === undefined || moduleName === null
    ? null
    : { moduleName, methodName: methodAccess.name.text, expression: methodAccess };
}

function directDefaultImportModuleSpecifier(binding: RouteBinding | undefined): string | null {
  if (
    binding === undefined ||
    !ts.isIdentifier(binding.declaration) ||
    !ts.isImportClause(binding.declaration.parent)
  ) {
    return null;
  }
  const importClause = binding.declaration.parent;
  if (importClause.name !== binding.declaration || importClause.isTypeOnly || !ts.isImportDeclaration(importClause.parent)) {
    return null;
  }
  const importDeclaration = importClause.parent;
  return ts.isStringLiteral(importDeclaration.moduleSpecifier) ? importDeclaration.moduleSpecifier.text : null;
}

/**
 * Retains a default-import call only as a candidate. Project resolution emits a
 * bridge edge later only when the imported local file directly exports a proven
 * TurboModule registry result.
 */
function staticReactNativeTurboModuleDefaultImportCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleDefaultImportCall | null {
  if (node.questionDotToken !== undefined || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  const methodAccess = node.expression;
  if (methodAccess.questionDotToken !== undefined || !ts.isIdentifier(methodAccess.expression)) {
    return null;
  }
  const binding = visibleRouteBinding(sourceFile, methodAccess.expression, bindings);
  const moduleSpecifier = directDefaultImportModuleSpecifier(binding);
  return moduleSpecifier === null
    ? null
    : { moduleSpecifier, methodName: methodAccess.name.text, expression: methodAccess };
}

function staticReactNativeTurboModuleDefaultExport(
  sourceFile: ts.SourceFile,
  node: ts.ExportAssignment,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleDefaultExport | null {
  if (node.isExportEquals) {
    return null;
  }
  const expression = unwrapReactNativeTurboModuleExpression(node.expression);
  const direct = staticReactNativeTurboModuleRegistryResult(sourceFile, expression, bindings);
  if (direct !== null) {
    return { moduleName: direct.moduleName, expression };
  }
  if (!ts.isIdentifier(expression)) {
    return null;
  }
  const binding = visibleRouteBinding(sourceFile, expression, bindings);
  return binding?.kind === "react-native-turbo-module" && binding.reactNativeTurboModuleName !== undefined
    ? { moduleName: binding.reactNativeTurboModuleName, expression }
    : null;
}

function directReactNativeTurboModuleBaseType(
  sourceFile: ts.SourceFile,
  declaration: ts.InterfaceDeclaration,
  base: ts.ExpressionWithTypeArguments,
  bindings: ScopedRouteReceiverBindings
): boolean {
  if (declaration.typeParameters?.some((parameter) => parameter.name.text === "TurboModule") === true) {
    return false;
  }

  if (
    ts.isPropertyAccessExpression(base.expression) &&
    base.expression.questionDotToken === undefined &&
    base.expression.name.text === "TurboModule" &&
    ts.isIdentifier(base.expression.expression) &&
    visibleRouteBindingKind(sourceFile, base.expression.expression, bindings) === "react-native-namespace"
  ) {
    return true;
  }

  if (!ts.isIdentifier(base.expression)) {
    return false;
  }

  const localName = base.expression.text;
  return sourceFile.statements.some((statement) => {
    const importClause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "react-native" ||
      importClause?.namedBindings === undefined ||
      !ts.isNamedImports(importClause.namedBindings)
    ) {
      return false;
    }
    return importClause.namedBindings.elements.some(
      (element) =>
        element.name.text === localName &&
        (element.propertyName?.text ?? element.name.text) === "TurboModule"
    );
  });
}

/**
 * Retains a spec only when its direct `TurboModule` base and exactly one
 * literal registry registration jointly prove the contract's module identity.
 */
function staticReactNativeTurboModuleSpec(
  sourceFile: ts.SourceFile,
  declaration: ts.InterfaceDeclaration,
  bindings: ScopedRouteReceiverBindings
): StaticReactNativeTurboModuleSpec | null {
  const heritageClauses = declaration.heritageClauses;
  if (!hasExportModifier(declaration) || heritageClauses === undefined || heritageClauses.length !== 1) {
    return null;
  }
  const extendsClause = heritageClauses[0];
  if (
    extendsClause === undefined ||
    extendsClause.token !== ts.SyntaxKind.ExtendsKeyword ||
    extendsClause.types.length !== 1 ||
    extendsClause.types[0] === undefined ||
    !directReactNativeTurboModuleBaseType(sourceFile, declaration, extendsClause.types[0], bindings)
  ) {
    return null;
  }

  const registrations: StaticReactNativeTurboModuleRegistryCall[] = [];
  const collectRegistrations = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const registration = staticReactNativeTurboModuleRegistryCall(sourceFile, node, bindings);
      if (registration?.typeName === declaration.name.text) {
        registrations.push(registration);
      }
    }
    ts.forEachChild(node, collectRegistrations);
  };
  ts.forEachChild(sourceFile, collectRegistrations);
  if (registrations.length !== 1 || registrations[0] === undefined) {
    return null;
  }

  const seenNames = new Set<string>();
  const methods: StaticReactNativeTurboModuleSpec["methods"][number][] = [];
  for (const member of declaration.members) {
    if (!ts.isMethodSignature(member)) {
      continue;
    }
    if (
      member.questionToken !== undefined ||
      member.typeParameters !== undefined ||
      !ts.isIdentifier(member.name) ||
      seenNames.has(member.name.text)
    ) {
      return null;
    }
    seenNames.add(member.name.text);
    methods.push({ name: member.name.text, declaration: member });
  }
  return methods.length === 0 ? null : { moduleName: registrations[0].moduleName, methods };
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

function isKoaRouteReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return (
    ts.isNewExpression(initializer) &&
    initializer.arguments !== undefined &&
    initializer.arguments.length === 0 &&
    ts.isIdentifier(initializer.expression) &&
    visibleRouteBindingKind(sourceFile, initializer.expression, bindings) === "koa-router-constructor"
  );
}

function isHonoRouteReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return (
    ts.isNewExpression(initializer) &&
    initializer.arguments !== undefined &&
    initializer.arguments.length === 0 &&
    ts.isIdentifier(initializer.expression) &&
    visibleRouteBindingKind(sourceFile, initializer.expression, bindings) === "hono-constructor"
  );
}

function isElysiaRouteReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return (
    ts.isNewExpression(initializer) &&
    initializer.arguments !== undefined &&
    initializer.arguments.length === 0 &&
    ts.isIdentifier(initializer.expression) &&
    visibleRouteBindingKind(sourceFile, initializer.expression, bindings) === "elysia-constructor"
  );
}

function directCommonJsFrameworkFactoryKind(
  sourceFile: ts.SourceFile,
  declaration: ts.VariableDeclaration
): Extract<RouteBindingKind, "express-default-factory" | "fastify-default-factory"> | null {
  const initializer = declaration.initializer;
  const argument =
    initializer !== undefined && ts.isCallExpression(initializer)
      ? initializer.arguments[0]
      : undefined;
  const commonJsFile = sourceFile.fileName.toLowerCase().endsWith(".cjs");
  if (
    !ts.isIdentifier(declaration.name) ||
    !isConstVariableDeclaration(declaration) ||
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    initializer.questionDotToken !== undefined ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== "require" ||
    initializer.arguments.length !== 1 ||
    argument === undefined ||
    !ts.isStringLiteral(argument) ||
    hasDirectSourceBinding(sourceFile, "require") ||
    hasEcmaScriptModuleSyntax(sourceFile) ||
    (!commonJsFile && !hasUseStrictDirective(sourceFile))
  ) {
    return null;
  }
  if (argument.text === "express") {
    return "express-default-factory";
  }
  return argument.text === "fastify" ? "fastify-default-factory" : null;
}

function frameworkRoutePluginForImport(
  declaration: ts.ImportDeclaration,
  factoryExport: string,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePlugin | undefined {
  const moduleSpecifier = declaration.moduleSpecifier;
  if (
    declaration.importClause?.isTypeOnly === true ||
    !ts.isStringLiteral(moduleSpecifier) ||
    plugins.length === 0
  ) {
    return undefined;
  }
  const candidates = plugins.filter(
    (plugin) =>
      plugin.moduleSpecifier === moduleSpecifier.text && plugin.factoryExport === factoryExport
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function frameworkRoutePluginForDefaultImport(
  declaration: ts.ImportDeclaration,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePlugin | undefined {
  return frameworkRoutePluginForImport(declaration, "default", plugins);
}

function frameworkRoutePluginForNamedImport(
  declaration: ts.ImportDeclaration,
  element: ts.ImportSpecifier,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePlugin | undefined {
  if (element.isTypeOnly) {
    return undefined;
  }
  return frameworkRoutePluginForImport(
    declaration,
    element.propertyName?.text ?? element.name.text,
    plugins
  );
}

function frameworkRoutePluginDecoratorForImport(
  declaration: ts.ImportDeclaration,
  decoratorExport: string,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePluginDecoratorImport | undefined {
  const moduleSpecifier = declaration.moduleSpecifier;
  if (
    declaration.importClause?.isTypeOnly === true ||
    !ts.isStringLiteral(moduleSpecifier) ||
    plugins.length === 0
  ) {
    return undefined;
  }
  const candidates = plugins.flatMap((plugin) =>
    (plugin.decoratorRoutes ?? [])
      .filter(
        (decoratorRoute) =>
          plugin.moduleSpecifier === moduleSpecifier.text &&
          decoratorRoute.decoratorExport === decoratorExport
      )
      .map((decoratorRoute) => ({ plugin, decoratorRoute }))
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function frameworkRoutePluginDecoratorForDefaultImport(
  declaration: ts.ImportDeclaration,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePluginDecoratorImport | undefined {
  return frameworkRoutePluginDecoratorForImport(declaration, "default", plugins);
}

function frameworkRoutePluginDecoratorForNamedImport(
  declaration: ts.ImportDeclaration,
  element: ts.ImportSpecifier,
  plugins: readonly FrameworkRoutePlugin[]
): FrameworkRoutePluginDecoratorImport | undefined {
  if (element.isTypeOnly) {
    return undefined;
  }
  return frameworkRoutePluginDecoratorForImport(
    declaration,
    element.propertyName?.text ?? element.name.text,
    plugins
  );
}

/** Retains only immutable direct `const router = new ImportedRouter()` receivers. */
function customFrameworkRoutePluginForReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): FrameworkRoutePlugin | undefined {
  if (
    !ts.isNewExpression(initializer) ||
    (initializer.arguments?.length ?? 0) !== 0 ||
    !ts.isIdentifier(initializer.expression)
  ) {
    return undefined;
  }
  const binding = visibleRouteBinding(sourceFile, initializer.expression, bindings);
  return binding?.kind === "custom-framework-constructor" ? binding.frameworkRoutePlugin : undefined;
}

function addScopedValueBinding(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  names: readonly string[],
  declaration: ts.Node,
  bindingKind: RouteBindingKind = "other",
  frameworkRoutePlugin?: FrameworkRoutePlugin
): void {
  if (scopeId === undefined) {
    return;
  }

  const bindings = byScopeId.get(scopeId) ?? new Map<string, RouteBinding[]>();
  for (const name of names) {
    const candidates = bindings.get(name) ?? [];
    candidates.push({
      declaration,
      kind: bindingKind,
      ...(frameworkRoutePlugin === undefined ? {} : { frameworkRoutePlugin })
    });
    bindings.set(name, candidates);
  }
  byScopeId.set(scopeId, bindings);
}

function markRouteReceiver(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  declaration: ts.VariableDeclaration,
  bindingKind:
    | "express-receiver"
    | "custom-framework-receiver"
    | "koa-router-receiver"
    | "hono-receiver"
    | "elysia-receiver"
    | "fastify-receiver",
  frameworkRoutePlugin?: FrameworkRoutePlugin
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
    if (frameworkRoutePlugin !== undefined) {
      binding.frameworkRoutePlugin = frameworkRoutePlugin;
    }
  }
}

function markReactNativeTurboModuleReceiver(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  declaration: ts.VariableDeclaration,
  moduleName: string
): void {
  if (scopeId === undefined || !ts.isIdentifier(declaration.name)) {
    return;
  }
  const binding = byScopeId
    .get(scopeId)
    ?.get(declaration.name.text)
    ?.find((candidate) => candidate.declaration === declaration);
  if (binding !== undefined) {
    binding.kind = "react-native-turbo-module";
    binding.reactNativeTurboModuleName = moduleName;
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

function assignmentTargetRootIdentifier(expression: ts.Expression): ts.Identifier | null {
  let target = expression;
  while (
    ts.isParenthesizedExpression(target) ||
    ts.isAsExpression(target) ||
    ts.isTypeAssertionExpression(target) ||
    ts.isNonNullExpression(target) ||
    ts.isPropertyAccessExpression(target) ||
    ts.isElementAccessExpression(target)
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
  bindings: ScopedRouteReceiverBindings,
  rejectMemberMutation = false
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
      const target =
        directAssignmentTargetIdentifier(node.left) ??
        (rejectMemberMutation ? assignmentTargetRootIdentifier(node.left) : null);
      if (target !== null && isDeclarationBinding(target)) {
        stable = false;
        return;
      }
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const target =
        directAssignmentTargetIdentifier(node.operand) ??
        (rejectMemberMutation ? assignmentTargetRootIdentifier(node.operand) : null);
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

const SAFE_EXPRESS_FACTORY_METHODS = new Set([
  "Router",
  "json",
  "raw",
  "static",
  "text",
  "urlencoded"
]);

function hasOnlySafeCommonJsFrameworkFactoryReferences(
  sourceFile: ts.SourceFile,
  declaration: ts.VariableDeclaration,
  kind: Extract<RouteBindingKind, "express-default-factory" | "fastify-default-factory">,
  bindings: ScopedRouteReceiverBindings
): boolean {
  let safe = true;
  const isDeclarationBinding = (identifier: ts.Identifier): boolean =>
    visibleRouteBinding(sourceFile, identifier, bindings)?.declaration === declaration;
  const visit = (node: ts.Node): void => {
    if (!safe) return;
    if (ts.isIdentifier(node) && isDeclarationBinding(node)) {
      if (node === declaration.name) return;
      const parent = node.parent;
      if (ts.isCallExpression(parent) && parent.expression === node) return;
      if (
        kind === "express-default-factory" &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        SAFE_EXPRESS_FACTORY_METHODS.has(parent.name.text) &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      ) {
        return;
      }
      safe = false;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return safe;
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
function collectScopedRouteReceiverBindings(
  sourceFile: ts.SourceFile,
  frameworkRoutePlugins: readonly FrameworkRoutePlugin[]
): ScopedRouteReceiverBindings {
  const byScopeId = new Map<string, Map<string, RouteBinding[]>>();
  const rootScopeId = sourceScopeId(sourceFile);

  function collectBindings(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        const customPlugin = frameworkRoutePluginForDefaultImport(node, frameworkRoutePlugins);
        const bindingKind = isExpressImport(node)
          ? "express-default-factory"
          : isKoaRouterImport(node)
            ? "koa-router-constructor"
            : isFastifyImport(node)
              ? "fastify-default-factory"
              : customPlugin === undefined
                ? "other"
                : "custom-framework-constructor";
        addScopedValueBinding(
          byScopeId,
          rootScopeId,
          [importClause.name.text],
          importClause.name,
          bindingKind,
          bindingKind === "custom-framework-constructor" ? customPlugin : undefined
        );
      }
      if (importClause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          addScopedValueBinding(
            byScopeId,
            rootScopeId,
            [importClause.namedBindings.name.text],
            importClause.namedBindings.name,
            isExpressImport(node)
              ? "express-namespace"
              : isReactNativeImport(node)
                ? "react-native-namespace"
                : importClause.isTypeOnly
                  ? "other"
                  : "typescript-namespace"
          );
        } else {
          for (const element of importClause.namedBindings.elements) {
            const builtInKind = namedRouteImportBindingKind(node, element);
            const customPlugin =
              builtInKind === "other"
                ? frameworkRoutePluginForNamedImport(node, element, frameworkRoutePlugins)
                : undefined;
            addScopedValueBinding(
              byScopeId,
              rootScopeId,
              [element.name.text],
              element.name,
              customPlugin === undefined ? builtInKind : "custom-framework-constructor",
              customPlugin
            );
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const names = bindingNames(node.name);
      const scopeId = variableBindingScopeId(sourceFile, node);
      addScopedValueBinding(
        byScopeId,
        scopeId,
        names,
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
    const turboModuleRegistration =
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node)
        ? staticReactNativeTurboModuleRegistryResult(sourceFile, node.initializer, { byScopeId })
        : null;
    const customRoutePlugin =
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node)
        ? customFrameworkRoutePluginForReceiverInitializer(sourceFile, node.initializer, { byScopeId })
        : undefined;
    if (
      turboModuleRegistration !== null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name)
    ) {
      markReactNativeTurboModuleReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        turboModuleRegistration.moduleName
      );
    } else if (
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
      isKoaRouteReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "koa-router-receiver"
      );
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node) &&
      isHonoRouteReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "hono-receiver"
      );
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node) &&
      isElysiaRouteReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "elysia-receiver"
      );
    } else if (
      customRoutePlugin !== undefined &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name)
    ) {
      markRouteReceiver(
        byScopeId,
        variableBindingScopeId(sourceFile, node),
        node,
        "custom-framework-receiver",
        customRoutePlugin
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

  function classifyCommonJsFrameworkFactories(): void {
    for (const bindings of byScopeId.values()) {
      for (const candidates of bindings.values()) {
        for (const binding of candidates) {
          if (!ts.isVariableDeclaration(binding.declaration)) continue;
          const kind = directCommonJsFrameworkFactoryKind(sourceFile, binding.declaration);
          const initializer = binding.declaration.initializer;
          if (
            kind !== null &&
            initializer !== undefined &&
            ts.isCallExpression(initializer) &&
            ts.isIdentifier(initializer.expression) &&
            visibleRouteBinding(sourceFile, initializer.expression, { byScopeId }) === undefined
          ) {
            binding.kind = kind;
          }
        }
      }
    }
  }

  function invalidateMutableFrameworkFactories(): void {
    for (const bindings of byScopeId.values()) {
      for (const candidates of bindings.values()) {
        for (const binding of candidates) {
          if (
            (binding.kind === "express-default-factory" ||
              binding.kind === "fastify-default-factory") &&
            ts.isVariableDeclaration(binding.declaration) &&
            (!hasStableFastifyLocalPluginBinding(
                sourceFile,
                binding.declaration,
                { byScopeId },
                true
              ) ||
              !hasOnlySafeCommonJsFrameworkFactoryReferences(
                sourceFile,
                binding.declaration,
                binding.kind,
                { byScopeId }
              ))
          ) {
            binding.kind = "other";
          }
        }
      }
    }
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
  classifyCommonJsFrameworkFactories();
  invalidateMutableFrameworkFactories();
  ts.forEachChild(sourceFile, collectRootReceivers);
  applyExpressRouteMountPrefixes(sourceFile, { byScopeId });
  while (collectPluginReceivers()) {
    // Plugin receivers are discovered in one lexical pass per static nesting level.
  }
  return { byScopeId };
}

interface FrameworkRoutePluginMountObservation {
  readonly parent: RouteBinding;
  readonly child: RouteBinding;
  /** Null means a configured mount was seen but its prefix was not safe to project. */
  readonly segment: RoutePrefixSegment | null;
}

interface FrameworkRoutePluginResolvedMountPrefix {
  readonly prefix: string;
  readonly depth: number;
  readonly segments: readonly RoutePrefixSegment[];
}

/** Keeps adversarial or generated router nesting from growing an unbounded static traversal. */
const MAX_FRAMEWORK_ROUTE_PLUGIN_MOUNT_DEPTH = 16;

function literalFrameworkRoutePluginMountPrefix(expression: ts.Expression | undefined): string | null {
  if (
    expression === undefined ||
    !ts.isStringLiteral(expression) ||
    !expression.text.startsWith("/")
  ) {
    return null;
  }
  const prefix = expression.text;
  return prefix === "/" || prefix.endsWith("/") || prefix.includes("//") ? null : prefix;
}

function staticFrameworkRoutePluginMountObservation(
  sourceFile: ts.SourceFile,
  filePath: string,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): FrameworkRoutePluginMountObservation | null {
  if (node.questionDotToken !== undefined || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  const mountAccess = node.expression;
  const mountReceiver = mountAccess.expression;
  if (mountAccess.questionDotToken !== undefined || !ts.isIdentifier(mountReceiver)) {
    return null;
  }
  const parent = visibleRouteBinding(sourceFile, mountReceiver, bindings);
  if (
    parent?.kind !== "custom-framework-receiver" ||
    parent.frameworkRoutePlugin === undefined ||
    !(parent.frameworkRoutePlugin.mountMethods ?? []).some(
      (mountMethod) => mountMethod.methodName === mountAccess.name.text
    )
  ) {
    return null;
  }
  const childArgument = node.arguments[1];
  if (childArgument === undefined || !ts.isIdentifier(childArgument)) {
    return null;
  }
  const child = visibleRouteBinding(sourceFile, childArgument, bindings);
  if (
    child?.kind !== "custom-framework-receiver" ||
    child.frameworkRoutePlugin !== parent.frameworkRoutePlugin
  ) {
    return null;
  }
  const prefix =
    node.arguments.length === 2
      ? literalFrameworkRoutePluginMountPrefix(node.arguments[0])
      : null;
  return {
    parent,
    child,
    segment:
      prefix === null
        ? null
        : {
            filePath,
            range: sourceRange(sourceFile, node),
            parentReceiver: mountReceiver.text,
            childReceiver: childArgument.text,
            mountMethod: mountAccess.name.text,
            prefix
          }
  };
}

/**
 * Projects a child receiver only when one configured mount chain yields a
 * stable, non-root prefix. Duplicate, cyclic, dynamic, or over-deep chains
 * suppress the child route rather than publish an incomplete endpoint path.
 */
function applyFrameworkRoutePluginMountPrefixes(
  sourceFile: ts.SourceFile,
  filePath: string,
  bindings: ScopedRouteReceiverBindings
): void {
  const observationsByChild = new Map<RouteBinding, FrameworkRoutePluginMountObservation[]>();

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const observation = staticFrameworkRoutePluginMountObservation(
        sourceFile,
        filePath,
        node,
        bindings
      );
      if (observation !== null) {
        const observations = observationsByChild.get(observation.child) ?? [];
        observations.push(observation);
        observationsByChild.set(observation.child, observations);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  const resolvedPrefixes = new Map<RouteBinding, FrameworkRoutePluginResolvedMountPrefix | null>();

  const resolvedPrefixFor = (
    binding: RouteBinding
  ): FrameworkRoutePluginResolvedMountPrefix | null => {
    if (resolvedPrefixes.has(binding)) {
      return resolvedPrefixes.get(binding) ?? null;
    }
    const chain: FrameworkRoutePluginMountObservation[] = [];
    const seen = new Set<RouteBinding>();
    let cursor = binding;
    let resolved: FrameworkRoutePluginResolvedMountPrefix | null;

    while (true) {
      if (resolvedPrefixes.has(cursor)) {
        resolved = resolvedPrefixes.get(cursor) ?? null;
        break;
      }
      if (seen.has(cursor)) {
        resolved = null;
        break;
      }
      const observations = observationsByChild.get(cursor);
      if (observations === undefined) {
        resolved = { prefix: "", depth: 0, segments: [] };
        break;
      }
      const observation = observations.length === 1 ? observations[0] : undefined;
      const segment = observation?.segment;
      if (
        observation === undefined ||
        segment === null ||
        segment === undefined ||
        observation.parent === cursor
      ) {
        resolved = null;
        break;
      }
      if (chain.length >= MAX_FRAMEWORK_ROUTE_PLUGIN_MOUNT_DEPTH) {
        return null;
      }
      seen.add(cursor);
      chain.push(observation);
      cursor = observation.parent;
    }

    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const observation = chain[index];
      const segment = observation?.segment;
      if (
        observation === undefined ||
        segment === null ||
        segment === undefined ||
        resolved === null ||
        resolved.depth >= MAX_FRAMEWORK_ROUTE_PLUGIN_MOUNT_DEPTH
      ) {
        return null;
      }
      resolved = {
        prefix: `${resolved.prefix}${segment.prefix}`,
        depth: resolved.depth + 1,
        segments: [...resolved.segments, segment]
      };
      resolvedPrefixes.set(observation.child, resolved);
    }
    return resolved;
  };

  for (const [child] of observationsByChild) {
    const resolved = resolvedPrefixFor(child);
    if (resolved === null || resolved.depth === 0 || child.prefix !== undefined) {
      child.suppressFrameworkRoutePluginRoutes = true;
      continue;
    }
    child.prefix = resolved.prefix;
    child.routePrefixChain = resolved.segments;
    child.routeRegistration =
      resolved.depth === 1 ? "plugin-literal-prefix-mount" : "plugin-literal-prefix-chain";
  }
}

interface ExpressMountObservation {
  readonly parent: RouteBinding | null;
  readonly prefix: string | null;
}

function applyExpressRouteMountPrefixes(
  sourceFile: ts.SourceFile,
  bindings: ScopedRouteReceiverBindings
): void {
  const observations = new Map<RouteBinding, ExpressMountObservation[]>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "use" &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const parent = visibleRouteBinding(sourceFile, node.expression.expression, bindings);
      for (const [index, argument] of node.arguments.entries()) {
        if (!ts.isIdentifier(argument)) continue;
        const child = visibleRouteBinding(sourceFile, argument, bindings);
        if (child?.kind !== "express-receiver") continue;
        const isDirectLiteralMount =
          node.questionDotToken === undefined &&
          node.expression.questionDotToken === undefined &&
          parent?.kind === "express-receiver" &&
          node.arguments.length === 2 &&
          index === 1;
        const mounts = observations.get(child) ?? [];
        mounts.push({
          parent: isDirectLiteralMount ? parent : null,
          prefix: isDirectLiteralMount
            ? literalFrameworkRoutePluginMountPrefix(node.arguments[0])
            : null
        });
        observations.set(child, mounts);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  const resolved = new Map<RouteBinding, string | null>();
  const resolvePrefix = (binding: RouteBinding, active: Set<RouteBinding>): string | null => {
    if (resolved.has(binding)) return resolved.get(binding) ?? null;
    if (active.has(binding)) return null;
    const mounts = observations.get(binding);
    if (mounts === undefined) return "";
    const mount = mounts.length === 1 ? mounts[0] : undefined;
    if (
      mount === undefined ||
      mount.parent === null ||
      mount.prefix === null ||
      mount.parent === binding
    ) {
      resolved.set(binding, null);
      return null;
    }
    const parentPrefix = resolvePrefix(mount.parent, new Set(active).add(binding));
    const prefix = parentPrefix === null ? null : `${parentPrefix}${mount.prefix}`;
    resolved.set(binding, prefix);
    return prefix;
  };

  for (const child of observations.keys()) {
    const prefix = resolvePrefix(child, new Set());
    if (prefix === null || prefix.length === 0) {
      child.suppressFrameworkRoutePluginRoutes = true;
    } else {
      child.prefix = prefix;
    }
  }
}

function staticFrameworkRoutePluginImportedMountFact(
  sourceFile: ts.SourceFile,
  filePath: string,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings,
  symbolsByDeclaration: ReadonlyMap<ts.Node, SymbolNode>
): FrameworkRoutePluginFacts["importedMounts"][number] | null {
  if (node.questionDotToken !== undefined || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  const access = node.expression;
  if (access.questionDotToken !== undefined || !ts.isIdentifier(access.expression)) {
    return null;
  }
  const parent = visibleRouteBinding(sourceFile, access.expression, bindings);
  if (
    parent?.kind !== "custom-framework-receiver" ||
    parent.frameworkRoutePlugin === undefined ||
    !(parent.frameworkRoutePlugin.mountMethods ?? []).some(
      (candidate) => candidate.methodName === access.name.text
    )
  ) {
    return null;
  }
  const child = node.arguments[1];
  if (child === undefined || !ts.isIdentifier(child)) {
    return null;
  }
  const localChild = visibleRouteBinding(sourceFile, child, bindings);
  if (localChild?.kind === "custom-framework-receiver") {
    return null;
  }
  const parentReceiver = symbolsByDeclaration.get(parent.declaration);
  if (parentReceiver === undefined) {
    return null;
  }
  const prefix =
    node.arguments.length === 2
      ? literalFrameworkRoutePluginMountPrefix(node.arguments[0])
      : null;
  return {
    frameworkId: parent.frameworkRoutePlugin.id,
    parentReceiverId: parentReceiver.id,
    child: fastifyPluginSymbolReference(sourceFile, child),
    segment:
      prefix === null
        ? null
        : {
            filePath,
            range: sourceRange(sourceFile, node),
            parentReceiver: access.expression.text,
            childReceiver: child.text,
            mountMethod: access.name.text,
            prefix
          }
  };
}

function isExpressRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "express-receiver";
}

function isKoaRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "koa-router-receiver";
}

function isHonoRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "hono-receiver";
}

function isElysiaRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "elysia-receiver";
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
    !ts.isIdentifier(node.expression.expression)
  ) {
    return null;
  }

  const receiver = visibleRouteBinding(sourceFile, node.expression.expression, bindings);
  if (receiver?.kind !== "express-receiver" || receiver.suppressFrameworkRoutePluginRoutes === true) {
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

  return { method, path: `${receiver.prefix ?? ""}${pathArgument.text}`, handler };
}

interface StaticFrameworkRoutePluginRoute {
  readonly plugin: FrameworkRoutePlugin;
  readonly receiver: RouteBinding;
  readonly route: StaticExpressRoute;
  readonly routeRegistration?: RouteRegistration;
  readonly routePrefixChain?: readonly RoutePrefixSegment[];
}

/**
 * The public extension surface deliberately proves only one exact import,
 * immutable zero-argument receiver, literal path, and named terminal handler.
 * Unsupported composition falls through without emitting a graph fact.
 */
function staticFrameworkRoutePluginRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticFrameworkRoutePluginRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return null;
  }
  const binding = visibleRouteBinding(sourceFile, node.expression.expression, bindings);
  if (
    binding?.kind !== "custom-framework-receiver" ||
    binding.frameworkRoutePlugin === undefined ||
    binding.suppressFrameworkRoutePluginRoutes === true
  ) {
    return null;
  }
  const routeMethodName = node.expression.name.text;
  const routeMethod = (binding.frameworkRoutePlugin.routeMethods ?? []).find(
    (candidate) => candidate.methodName === routeMethodName
  );
  const pathArgument = node.arguments[0];
  const handler = node.arguments[1];
  if (
    routeMethod === undefined ||
    node.arguments.length !== 2 ||
    pathArgument === undefined ||
    !ts.isStringLiteral(pathArgument) ||
    !pathArgument.text.startsWith("/") ||
    handler === undefined ||
    !ts.isIdentifier(handler)
  ) {
    return null;
  }
  const routePath =
    binding.prefix === undefined
      ? pathArgument.text
      : pathArgument.text === "/"
        ? null
        : `${binding.prefix}${pathArgument.text}`;
  if (routePath === null) {
    return null;
  }
  return {
    plugin: binding.frameworkRoutePlugin,
    receiver: binding,
    route: { method: routeMethod.routeMethod, path: routePath, handler },
    ...(binding.routeRegistration === undefined
      ? {}
      : { routeRegistration: binding.routeRegistration }),
    ...(binding.routePrefixChain === undefined
      ? {}
      : { routePrefixChain: binding.routePrefixChain })
  };
}

function staticKoaRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticKoaRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    !isKoaRouteReceiver(sourceFile, node.expression.expression, bindings)
  ) {
    return null;
  }

  const method = KOA_ROUTE_METHODS[node.expression.name.text];
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

function staticHonoRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticHonoRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    !isHonoRouteReceiver(sourceFile, node.expression.expression, bindings)
  ) {
    return null;
  }

  const method = staticRouteMethodForName(node.expression.name.text, HONO_ROUTE_METHODS);
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

function staticElysiaRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticElysiaRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    !isElysiaRouteReceiver(sourceFile, node.expression.expression, bindings)
  ) {
    return null;
  }

  const method = staticRouteMethodForName(node.expression.name.text, ELYSIA_ROUTE_METHODS);
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

function staticNextRoute(
  sourceFile: ts.SourceFile,
  frameworkEvidence: ProjectFrameworkEvidence | undefined
): StaticNextRoute | null {
  // An Astro project's `src/pages/*.ts|js|mjs` files are endpoints, not
  // Next.js navigation components. Preserve Next.js behavior everywhere else.
  if (frameworkEvidence?.astro === true && astroEndpointPath(sourceFile.fileName) !== null) {
    return null;
  }
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

const ASTRO_ENDPOINT_METHODS: ReadonlySet<string> = new Set([
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

function astroEndpointMethod(name: string): RouteMethod | null {
  return ASTRO_ENDPOINT_METHODS.has(name) ? (name as RouteMethod) : null;
}

/**
 * Type-only wrappers do not alter the value bound to an endpoint export. Keep
 * them transparent while rejecting calls, conditionals, and other runtime
 * expressions whose handler identity is not syntactically direct.
 */
function directAstroEndpointHandler(
  expression: ts.Expression
): ts.ArrowFunction | ts.FunctionExpression | null {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isArrowFunction(current) || ts.isFunctionExpression(current) ? current : null;
}

function staticAstroEndpointRoutes(
  sourceFile: ts.SourceFile,
  frameworkEvidence: ProjectFrameworkEvidence | undefined
): readonly StaticAstroEndpointRoute[] {
  if (frameworkEvidence?.astro !== true) {
    return [];
  }
  const path = astroEndpointPath(sourceFile.fileName);
  if (path === null) {
    return [];
  }

  const candidates: StaticAstroEndpointRoute[] = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      statement.body !== undefined &&
      hasExportModifier(statement) &&
      !hasDefaultModifier(statement)
    ) {
      const method = astroEndpointMethod(statement.name.text);
      if (method !== null) {
        candidates.push({
          method,
          path,
          handler: statement.name,
          declaration: statement,
          routeRegistration: "astro-filesystem-endpoint"
        });
      }
      continue;
    }

    if (
      !ts.isVariableStatement(statement) ||
      !hasExportModifier(statement) ||
      hasDefaultModifier(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.initializer === undefined ||
        directAstroEndpointHandler(declaration.initializer) === null
      ) {
        continue;
      }
      const method = astroEndpointMethod(declaration.name.text);
      if (method !== null) {
        candidates.push({
          method,
          path,
          handler: declaration.name,
          declaration,
          routeRegistration: "astro-filesystem-endpoint"
        });
      }
    }
  }

  const uniqueMethods = new Set<string>();
  for (const candidate of candidates) {
    if (uniqueMethods.has(candidate.method)) {
      return [];
    }
    uniqueMethods.add(candidate.method);
  }
  return candidates;
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

function addScopedFrameworkRoutePluginDecoratorBinding(
  byScopeId: Map<string, Map<string, FrameworkRoutePluginDecoratorBinding[]>>,
  scopeId: string | undefined,
  names: readonly string[],
  declaration: ts.Node,
  configured?: FrameworkRoutePluginDecoratorImport
): void {
  if (scopeId === undefined) {
    return;
  }

  const bindings = byScopeId.get(scopeId) ?? new Map<string, FrameworkRoutePluginDecoratorBinding[]>();
  for (const name of names) {
    const candidates = bindings.get(name) ?? [];
    candidates.push({
      declaration,
      ...(configured === undefined ? {} : configured)
    });
    bindings.set(name, candidates);
  }
  byScopeId.set(scopeId, bindings);
}

/**
 * Collects only lexical value bindings for configured public route decorators.
 * Any shadow, duplicate import, namespace import, or dynamic binding blocks
 * route extraction instead of guessing by decorator spelling.
 */
function collectScopedFrameworkRoutePluginDecoratorBindings(
  sourceFile: ts.SourceFile,
  plugins: readonly FrameworkRoutePlugin[]
): ScopedFrameworkRoutePluginDecoratorBindings {
  const byScopeId = new Map<string, Map<string, FrameworkRoutePluginDecoratorBinding[]>>();
  const rootScopeId = sourceScopeId(sourceFile);

  function collectBindings(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        addScopedFrameworkRoutePluginDecoratorBinding(
          byScopeId,
          rootScopeId,
          [importClause.name.text],
          importClause.name,
          frameworkRoutePluginDecoratorForDefaultImport(node, plugins)
        );
      }
      if (importClause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          addScopedFrameworkRoutePluginDecoratorBinding(
            byScopeId,
            rootScopeId,
            [importClause.namedBindings.name.text],
            importClause.namedBindings.name
          );
        } else {
          for (const element of importClause.namedBindings.elements) {
            addScopedFrameworkRoutePluginDecoratorBinding(
              byScopeId,
              rootScopeId,
              [element.name.text],
              element,
              frameworkRoutePluginDecoratorForNamedImport(node, element, plugins)
            );
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      addScopedFrameworkRoutePluginDecoratorBinding(
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
        addScopedFrameworkRoutePluginDecoratorBinding(byScopeId, scopeId, [node.name.text], node);
      }
    }

    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      addScopedFrameworkRoutePluginDecoratorBinding(
        byScopeId,
        scopeIdFor(sourceFile, node),
        [node.name.text],
        node
      );
    }

    if (ts.isFunctionLike(node)) {
      const scopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        addScopedFrameworkRoutePluginDecoratorBinding(
          byScopeId,
          scopeId,
          bindingNames(parameter.name),
          parameter
        );
      }
    }

    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      addScopedFrameworkRoutePluginDecoratorBinding(
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

function visibleFrameworkRoutePluginDecoratorBinding(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedFrameworkRoutePluginDecoratorBindings
): FrameworkRoutePluginDecoratorBinding | null {
  for (const scopeId of enclosingScopeIds(sourceFile, identifier)) {
    const candidates = bindings.byScopeId.get(scopeId)?.get(identifier.text);
    if (candidates !== undefined) {
      return candidates.length === 1 ? candidates[0] ?? null : null;
    }
  }
  return null;
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

function isStaticMethod(method: ts.MethodDeclaration | ts.GetAccessorDeclaration): boolean {
  return (method as ModifierCarrier).modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
  ) ?? false;
}

function staticFrameworkRoutePluginDecoratorRoute(
  sourceFile: ts.SourceFile,
  decorator: ts.Decorator,
  handler: ts.MethodDeclaration,
  bindings: ScopedFrameworkRoutePluginDecoratorBindings
): StaticFrameworkRoutePluginDecoratorRoute | null {
  const expression = decorator.expression;
  if (
    !ts.isCallExpression(expression) ||
    expression.questionDotToken !== undefined ||
    !ts.isIdentifier(expression.expression) ||
    expression.arguments.length !== 1
  ) {
    return null;
  }
  const path = expression.arguments[0];
  if (path === undefined || !ts.isStringLiteral(path) || !path.text.startsWith("/")) {
    return null;
  }
  const binding = visibleFrameworkRoutePluginDecoratorBinding(
    sourceFile,
    expression.expression,
    bindings
  );
  if (binding?.plugin === undefined || binding.decoratorRoute === undefined) {
    return null;
  }
  return {
    plugin: binding.plugin,
    routeMethod: binding.decoratorRoute,
    path: path.text,
    decorator,
    handler
  };
}

function staticFrameworkRoutePluginDecoratorRoutes(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedFrameworkRoutePluginDecoratorBindings
): readonly StaticFrameworkRoutePluginDecoratorRoute[] {
  const routes: StaticFrameworkRoutePluginDecoratorRoute[] = [];
  for (const member of declaration.members) {
    if (
      !ts.isMethodDeclaration(member) ||
      member.body === undefined ||
      isStaticMethod(member) ||
      !ts.isIdentifier(member.name)
    ) {
      continue;
    }
    for (const decorator of decoratorsFor(member)) {
      const route = staticFrameworkRoutePluginDecoratorRoute(
        sourceFile,
        decorator,
        member,
        bindings
      );
      if (route !== null) {
        routes.push(route);
      }
    }
  }
  return routes;
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

function staticNestGraphqlResolverReference(
  sourceFile: ts.SourceFile,
  declaration: ts.ClassDeclaration,
  bindings: ScopedNestDecoratorBindings
): StaticNestGraphqlResolverReference | null {
  const resolvers = directNestClassDecorators(
    sourceFile,
    declaration,
    bindings,
    "nest-graphql-resolver"
  );
  if (resolvers.length !== 1) {
    return null;
  }
  const resolver = resolvers[0];
  if (resolver === undefined || resolver.expression.arguments.length !== 1) {
    return null;
  }
  const typeFactory = resolver.expression.arguments[0];
  if (
    typeFactory === undefined ||
    !ts.isArrowFunction(typeFactory) ||
    typeFactory.parameters.length !== 0 ||
    !ts.isIdentifier(typeFactory.body) ||
    ((typeFactory as ModifierCarrier).modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
    ) ?? false)
  ) {
    return null;
  }
  return { resolver: declaration, schemaType: typeFactory.body };
}

function staticLiteralText(expression: ts.Expression | undefined): string | null {
  return expression !== undefined &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;
}

function directVueRouterFactoryImport(sourceFile: ts.SourceFile): boolean {
  let exactCount = 0;
  let unsupported = false;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "vue-router"
    ) {
      continue;
    }
    const importClause = statement.importClause;
    if (importClause === undefined) {
      continue;
    }
    const namedBindings = importClause.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName !== "createRouter") {
        continue;
      }
      if (
        !importClause.isTypeOnly &&
        !element.isTypeOnly &&
        element.propertyName === undefined &&
        element.name.text === "createRouter"
      ) {
        exactCount += 1;
      } else {
        unsupported = true;
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name?.text === "createRouter") {
        unsupported = true;
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "createRouter") {
        unsupported = true;
      }
    }
  }

  return exactCount === 1 && !unsupported;
}

function directTopLevelVueRouterArrays(
  sourceFile: ts.SourceFile
): ReadonlyMap<string, ts.ArrayLiteralExpression | null> {
  const arrays = new Map<string, ts.ArrayLiteralExpression | null>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) {
        continue;
      }
      const array = declaration.initializer;
      const value = array !== undefined && ts.isArrayLiteralExpression(array) ? array : null;
      if (arrays.has(declaration.name.text)) {
        arrays.set(declaration.name.text, null);
      } else {
        arrays.set(declaration.name.text, value);
      }
    }
  }
  return arrays;
}

function staticVueRouterRoutesOption(
  options: ts.ObjectLiteralExpression
): ts.Expression | null {
  let routes: ts.Expression | undefined;
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) {
      return null;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text !== "routes") {
        continue;
      }
      if (routes !== undefined) {
        return null;
      }
      routes = property.name;
      continue;
    }
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      continue;
    }
    if (staticPropertyName(property.name) !== "routes") {
      continue;
    }
    if (routes !== undefined) {
      return null;
    }
    routes = property.initializer;
  }
  return routes ?? null;
}

function staticVueRouterRoute(element: ts.Expression): StaticVueRouterRoute | null {
  if (!ts.isObjectLiteralExpression(element)) {
    return null;
  }

  let path: string | undefined;
  let handler: ts.Identifier | undefined;
  for (const property of element.properties) {
    if (ts.isSpreadAssignment(property)) {
      return null;
    }
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      continue;
    }
    const name = staticPropertyName(property.name);
    if (name === "path") {
      if (path !== undefined) {
        return null;
      }
      const literalPath = staticLiteralText(property.initializer);
      if (literalPath === null || !literalPath.startsWith("/")) {
        return null;
      }
      path = literalPath;
      continue;
    }
    if (name === "component") {
      if (handler !== undefined || !ts.isIdentifier(property.initializer)) {
        return null;
      }
      handler = property.initializer;
    }
  }

  return path === undefined || handler === undefined
    ? null
    : {
        method: "NAVIGATE",
        path,
        handler,
        declaration: element
      };
}

function staticVueRouterRoutes(sourceFile: ts.SourceFile): readonly StaticVueRouterRoute[] {
  if (!directVueRouterFactoryImport(sourceFile)) {
    return [];
  }

  const directArrays = directTopLevelVueRouterArrays(sourceFile);
  const routerCalls: ts.CallExpression[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (
        initializer !== undefined &&
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        initializer.expression.text === "createRouter"
      ) {
        routerCalls.push(initializer);
      }
    }
  }
  if (routerCalls.length !== 1 || routerCalls[0] === undefined) {
    return [];
  }

  const routerCall = routerCalls[0];
  if (routerCall.arguments.length !== 1) {
    return [];
  }
  const options = routerCall.arguments[0];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return [];
  }
  const routesExpression = staticVueRouterRoutesOption(options);
  if (routesExpression === null) {
    return [];
  }
  const routesArray = ts.isArrayLiteralExpression(routesExpression)
    ? routesExpression
    : ts.isIdentifier(routesExpression)
      ? directArrays.get(routesExpression.text) ?? null
      : null;
  if (routesArray === null) {
    return [];
  }

  return routesArray.elements
    .filter(ts.isExpression)
    .map((element) => staticVueRouterRoute(element))
    .filter((route): route is StaticVueRouterRoute => route !== null);
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

const LARGE_VENDORED_JAVASCRIPT_CHARACTER_LIMIT = 64 * 1024;

/**
 * Some repositories keep multi-megabyte TypeScript fixtures whose purpose is
 * parser/colorizer performance testing rather than application code. Walking
 * every node in those fixtures can dominate a full-root index and does not
 * provide trustworthy cross-file facts. Keep the guard path-specific and
 * file-only so ordinary TypeScript (including large source files elsewhere)
 * keeps the normal extractor contract.
 */
const LARGE_TYPESCRIPT_FIXTURE_CHARACTER_LIMIT = 4 * 1024 * 1024;

function isLargeVendoredJavaScript(input: ExtractFileFactsInput): boolean {
  return (
    input.language === "javascript" &&
    input.sourceText.length >= LARGE_VENDORED_JAVASCRIPT_CHARACTER_LIMIT &&
    /(?:^|\/)src\/compiled\//iu.test(input.filePath.replaceAll("\\", "/"))
  );
}

function isLargeTypeScriptFixture(input: ExtractFileFactsInput): boolean {
  const normalizedPath = input.filePath.replaceAll("\\", "/");
  return (
    input.language === "typescript" &&
    input.sourceText.length >= LARGE_TYPESCRIPT_FIXTURE_CHARACTER_LIMIT &&
    /(?:^|\/)test\/colorize-fixtures\//iu.test(normalizedPath)
  );
}

function largeSourceFileOnlyFacts(input: ExtractFileFactsInput): ExtractedFileFacts {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    false,
    scriptKindFor(input)
  );
  return {
    symbols: [fileNodeFor(sourceFile, input)],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: []
  };
}

function hasJavaScriptParseDiagnostics(sourceFile: ts.SourceFile): boolean {
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  return diagnostics !== undefined && diagnostics.length > 0;
}

/**
 * Extracts only file-local, syntax-proven facts. Cross-file resolution is deliberately
 * left to the application layer so an unresolved reference cannot become a false edge.
 */
export function extractFileFacts(
  input: ExtractFileFactsInput,
  options: ExtractFileFactsOptions = {}
): ExtractedFileFacts {
  if (isLargeVendoredJavaScript(input)) {
    return largeSourceFileOnlyFacts(input);
  }
  if (isLargeTypeScriptFixture(input)) {
    return largeSourceFileOnlyFacts(input);
  }
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
  if (input.language === "groovy") {
    return extractGroovyFileFacts({ ...input, language: "groovy" });
  }
  if (input.language === "fortran") {
    return extractFortranFileFacts({ ...input, language: "fortran" });
  }
  if (input.language === "ada") {
    return extractAdaFileFacts({ ...input, language: "ada" });
  }
  if (input.language === "php") {
    return extractPhpFileFacts({ ...input, language: "php" });
  }
  if (input.language === "blade") {
    return extractBladeFileFacts({ ...input, language: "blade" });
  }
  if (input.language === "c") {
    return extractCFileFacts({ ...input, language: "c" });
  }
  if (input.language === "cobol") {
    return extractCobolFileFacts({ ...input, language: "cobol" });
  }
  if (input.language === "zig") {
    return extractZigFileFacts({ ...input, language: "zig" });
  }
  if (input.language === "yaml") {
    return extractYamlFileFacts({ ...input, language: "yaml" });
  }
  if (input.language === "xml") {
    return extractXmlFileFacts({ ...input, language: "xml" });
  }
  if (input.language === "html") {
    return extractHtmlFileFacts({ ...input, language: "html" });
  }
  if (input.language === "jsp") {
    return extractJspFileFacts({ ...input, language: "jsp" });
  }
  if (input.language === "css") {
    return extractCssFileFacts({ ...input, language: "css" });
  }
  if (input.language === "markdown") {
    return extractMarkdownFileFacts({ ...input, language: "markdown" });
  }
  if (input.language === "properties") {
    return extractPropertiesFileFacts({ ...input, language: "properties" });
  }
  if (input.language === "shell") {
    return extractShellFileFacts({ ...input, language: "shell" });
  }
  if (input.language === "sql") {
    return extractSqlFileFacts({ ...input, language: "sql" });
  }
  if (input.language === "graphql") {
    return extractGraphqlFileFacts({ ...input, language: "graphql" });
  }
  if (input.language === "proto") {
    return extractProtoFileFacts({ ...input, language: "proto" });
  }
  if (input.language === "lua") {
    return projectLuaFileOnlyFacts({ filePath: input.filePath, sourceText: input.sourceText });
  }
  if (input.language === "luau") {
    return extractLuaFileFacts({ ...input, language: "luau" });
  }
  if (input.language === "pascal") {
    return extractPascalFileFacts({ ...input, language: "pascal" });
  }
  if (input.language === "objc") {
    return extractObjectiveCFileFacts({ ...input, language: "objc" });
  }
  if (input.language === "r") {
    return extractRFileFacts({ ...input, language: "r" });
  }
  if (input.language === "elixir") {
    return extractElixirFileFacts({ ...input, language: "elixir" });
  }
  if (input.language === "erlang") {
    return extractErlangFileFacts({ ...input, language: "erlang" });
  }
  if (input.language === "clojure") {
    return extractClojureFileFacts({ ...input, language: "clojure" });
  }
  if (input.language === "perl") {
    return extractPerlFileFacts({ ...input, language: "perl" });
  }
  if (input.language === "julia") {
    return extractJuliaFileFacts({ ...input, language: "julia" });
  }
  if (input.language === "haskell") {
    return extractHaskellFileFacts({ ...input, language: "haskell" });
  }
  if (input.language === "ocaml") {
    return extractOcamlFileFacts({ ...input, language: "ocaml" });
  }
  if (input.language === "fsharp") {
    return extractFsharpFileFacts({ ...input, language: "fsharp" });
  }
  if (input.language === "nim") {
    return extractNimFileFacts({ ...input, language: "nim" });
  }
  if (input.language === "cpp") {
    return extractCppFileFacts({ ...input, language: "cpp" });
  }
  if (input.language === "csharp") {
    return extractCsharpFileFacts({ ...input, language: "csharp" });
  }
  if (input.language === "ruby") {
    return extractRubyFileFacts({ ...input, language: "ruby" });
  }
  if (input.language === "kotlin") {
    return extractKotlinFileFacts({ ...input, language: "kotlin" });
  }
  if (input.language === "swift") {
    return extractSwiftFileFacts({ ...input, language: "swift" });
  }
  if (input.language === "dart") {
    return extractDartFileFacts({ ...input, language: "dart" });
  }
  if (input.language === "scala") {
    return extractScalaFileFacts({ ...input, language: "scala" });
  }
  if (input.language === "vue") {
    return extractVueFileFacts({ ...input, language: "vue" });
  }
  if (input.language === "svelte") {
    return extractSvelteFileFacts({ ...input, language: "svelte" });
  }
  if (input.language === "astro") {
    return extractAstroFileFacts({ ...input, language: "astro" });
  }
  if (input.language === "razor") {
    return extractRazorFileFacts({ ...input, language: "razor" });
  }
  if (input.language === "arkts") {
    return extractArkTsFileFacts({ ...input, language: "arkts" });
  }
  if (input.language === "terraform") {
    return extractTerraformFileFacts({ ...input, language: "terraform" });
  }
  if (input.language === "liquid") {
    return extractLiquidFileFacts({ ...input, language: "liquid" });
  }
  if (input.language === "twig") {
    return extractTwigFileFacts({ ...input, language: "twig" });
  }
  if (input.language === "solidity") {
    return extractSolidityFileFacts({ ...input, language: "solidity" });
  }
  if (input.language === "cfml") {
    return extractCfmlFileFacts({ ...input, language: "cfml" });
  }
  if (input.language === "nix") {
    return extractNixFileFacts({ ...input, language: "nix" });
  }
  if (input.language === "vbnet") {
    return extractVbnetFileFacts({ ...input, language: "vbnet" });
  }

  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(input)
  );
  if (input.language === "javascript" && hasJavaScriptParseDiagnostics(sourceFile)) {
    return {
      symbols: [fileNodeFor(sourceFile, input)],
      edges: [],
      pendingReferences: [],
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings: [],
      reExportBindings: []
    };
  }
  const isAstroEndpointSource =
    input.frameworkEvidence?.astro === true && astroEndpointPath(input.filePath) !== null;
  const explicitExportNames = collectExplicitExportNames(sourceFile);
  const commonJsSyntaxEnabled =
    input.language === "javascript" &&
    (/\.cjs$/iu.test(input.filePath) || hasUseStrictDirective(sourceFile)) &&
    !hasEcmaScriptModuleSyntax(sourceFile);
  const commonJsExportClass =
    commonJsSyntaxEnabled &&
    !hasDirectSourceBinding(sourceFile, "module") &&
    hasOnlyDirectCommonJsModuleUses(sourceFile)
    ? directCommonJsExportClass(sourceFile)
    : null;
  const commonJsRequires =
    commonJsSyntaxEnabled &&
    !hasDirectSourceBinding(sourceFile, "require") &&
    hasOnlyDirectCommonJsRequireUses(sourceFile)
    ? directCommonJsRequires(sourceFile)
    : new Map<ts.VariableDeclaration, ts.StringLiteral>();
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
  const nestGraphqlFacts: {
    resolverReferences: NestGraphqlFacts["resolverReferences"][number][];
  } = {
    resolverReferences: []
  };
  const declarationOrdinals = new Map<string, number>();
  const frameworkRoutePlugins = frameworkRoutePluginsForLanguage(
    options.frameworkRoutePlugins,
    input.language
  );
  const frameworkRoutePluginsWithDecorators =
    input.language === "typescript"
      ? frameworkRoutePlugins.filter((plugin) => (plugin.decoratorRoutes?.length ?? 0) > 0)
      : [];
  const frameworkRoutePluginsWithMounts = frameworkRoutePlugins.filter(
    (plugin) => (plugin.mountMethods?.length ?? 0) > 0
  );
  const frameworkRoutePluginDecoratorBindings =
    frameworkRoutePluginsWithDecorators.length === 0
      ? EMPTY_SCOPED_FRAMEWORK_ROUTE_PLUGIN_DECORATOR_BINDINGS
      : collectScopedFrameworkRoutePluginDecoratorBindings(
          sourceFile,
          frameworkRoutePluginsWithDecorators
        );
  const routeReceiverBindings = collectScopedRouteReceiverBindings(sourceFile, frameworkRoutePlugins);
  if (frameworkRoutePluginsWithMounts.length > 0) {
    applyFrameworkRoutePluginMountPrefixes(sourceFile, input.filePath, routeReceiverBindings);
  }
  const fastifyPluginCallbacks = collectScopedFastifyPluginCallbacks(sourceFile, routeReceiverBindings);
  const nestDecoratorBindings = collectScopedNestDecoratorBindings(sourceFile);
  const symbolsByDeclaration = new Map<ts.Node, SymbolNode>();
  const decoratorTaintedTypeSymbolIds = new Set<string>();
  const decoratorTaintedMemberSymbolIds = new Set<string>();
  const staticTypeScriptMemberSymbolIds = new Set<string>();
  const instanceTypeScriptMemberSymbolIds = new Set<string>();
  const callableTypeScriptMemberSymbolIds = new Set<string>();
  const runtimeTaintedTypeScriptMemberSurfaces: {
    typeSymbolId: string;
    memberName: string | null;
    memberKind: "static" | "instance";
  }[] = [];
  const ownerByNode = new Map<ts.Node, SymbolNode>();
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
  const frameworkRoutePluginFacts: {
    receivers: FrameworkRoutePluginFacts["receivers"][number][];
    routes: FrameworkRoutePluginFacts["routes"][number][];
    importedMounts: FrameworkRoutePluginFacts["importedMounts"][number][];
  } = { receivers: [], routes: [], importedMounts: [] };
  const reactNativeFacts: {
    nativeModuleCalls: ReactNativeFacts["nativeModuleCalls"][number][];
    turboModuleCalls: ReactNativeFacts["turboModuleCalls"][number][];
    turboModuleDefaultImportCalls: ReactNativeFacts["turboModuleDefaultImportCalls"][number][];
    turboModuleDefaultExports: ReactNativeFacts["turboModuleDefaultExports"][number][];
    turboModuleSpecMethods: ReactNativeFacts["turboModuleSpecMethods"][number][];
    nativeMethods: ReactNativeFacts["nativeMethods"][number][];
  } = {
    nativeModuleCalls: [],
    turboModuleCalls: [],
    turboModuleDefaultImportCalls: [],
    turboModuleDefaultExports: [],
    turboModuleSpecMethods: [],
    nativeMethods: []
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

  /**
   * A local variable is a declaration node, but evaluating its initializer is
   * executable work performed by the enclosing callable. Keep top-level and
   * class-boundary initializers on their declaration owner instead of crossing
   * into an unrelated outer callable.
   */
  function currentCallOwner(node: ts.Node): SymbolNode {
    let callableAncestor: ts.Node | undefined = node.parent;
    while (callableAncestor !== undefined && !ts.isSourceFile(callableAncestor)) {
      if (ts.isFunctionLike(callableAncestor)) {
        if (
          (ts.isArrowFunction(callableAncestor) || ts.isFunctionExpression(callableAncestor)) &&
          ts.isVariableDeclaration(callableAncestor.parent) &&
          callableAncestor.parent.initializer === callableAncestor
        ) {
          const callableVariable = symbolsByDeclaration.get(callableAncestor.parent);
          if (callableVariable !== undefined) {
            return callableVariable;
          }
        }
        const callable = symbolsByDeclaration.get(callableAncestor);
        if (callable !== undefined) {
          return callable;
        }
        // Anonymous callbacks without their own graph symbol execute within
        // the nearest representable enclosing callable. Keep walking instead
        // of assigning their calls to a temporary local initializer.
      }
      callableAncestor = callableAncestor.parent;
    }
    const owner = currentOwner();
    if (owner.kind !== "variable") {
      return owner;
    }
    let current: ts.Node | undefined = node;
    while (current !== undefined && !ts.isSourceFile(current)) {
      if (ts.isVariableDeclaration(current) && symbolsByDeclaration.get(current)?.id === owner.id) {
        if (
          current.initializer !== undefined &&
          (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
        ) {
          return owner;
        }
        break;
      }
      current = current.parent;
    }
    for (let index = stack.length - 2; index >= 0; index -= 1) {
      const candidate = stack[index];
      if (candidate === undefined) {
        continue;
      }
      if (candidate.kind === "function" || candidate.kind === "method") {
        return candidate;
      }
      if (
        candidate.kind === "file" ||
        candidate.kind === "class" ||
        candidate.kind === "interface"
      ) {
        return owner;
      }
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
    routeRegistration?: PendingReference["routeRegistration"],
    routePrefixChain?: PendingReference["routePrefixChain"],
    callSemantics?: PendingReference["callSemantics"],
    callReceiverTypeName?: string,
    callReceiverTargetQualifiedName?: string,
    callReceiverBindingSpace?: PendingReference["callReceiverBindingSpace"],
    callReceiverMemberKind?: PendingReference["callReceiverMemberKind"]
  ): PendingReference {
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
      ...(callSemantics === undefined ? {} : { callSemantics }),
      ...(callReceiverTypeName === undefined ? {} : { callReceiverTypeName }),
      ...(callReceiverTargetQualifiedName === undefined
        ? {}
        : { callReceiverTargetQualifiedName }),
      ...(callReceiverBindingSpace === undefined ? {} : { callReceiverBindingSpace }),
      ...(callReceiverMemberKind === undefined ? {} : { callReceiverMemberKind }),
      ...(routeFramework === undefined ? {} : { routeFramework }),
      ...(routeRegistration === undefined ? {} : { routeRegistration }),
      ...(routePrefixChain === undefined ? {} : { routePrefixChain })
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: enclosingScopeIds(sourceFile, node)
    });
    return reference;
  }

  function addCallableSignatureReferences(
    owner: SymbolNode,
    signature: ts.SignatureDeclaration,
    seen: Set<string>
  ): void {
    const typeParameterNames = enclosingTypeParameterNames(signature);
    const addSignatureReferences = (
      typeNode: ts.TypeNode | undefined,
      relationKind: "accepts" | "returns"
    ): void => {
      if (typeNode === undefined) {
        return;
      }
      for (const reference of signatureTypeReferences(typeNode, typeParameterNames)) {
        const key = `${relationKind}\u0000${reference.text}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        addPendingReference(owner.id, reference.text, relationKind, reference);
      }
    };

    for (const parameter of signature.parameters) {
      addSignatureReferences(parameter.type, "accepts");
    }
    if (signature.type !== undefined && ts.isThisTypeNode(signature.type)) {
      const enclosingType = nearestNamedType(signature);
      const target = enclosingType === null ? undefined : symbolsByDeclaration.get(enclosingType);
      if (target !== undefined) {
        const range = sourceRange(sourceFile, signature.type);
        edges.push({
          id: createEdgeId({
            sourceId: owner.id,
            targetId: target.id,
            kind: "returns",
            line: range.start.line,
            column: range.start.column,
            referenceName: "this"
          }),
          sourceId: owner.id,
          targetId: target.id,
          kind: "returns",
          filePath: input.filePath,
          range,
          resolution: "exact",
          confidence: 1,
          referenceName: "this",
          evidence: {
            ruleId: "syntax.typescript.explicit-this-return-type",
            stage: "syntax",
            candidateSymbolIds: [target.id]
          }
        });
      }
      return;
    }
    addSignatureReferences(signature.type, "returns");
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
    route:
      | StaticExpressRoute
      | StaticKoaRoute
      | StaticHonoRoute
      | StaticElysiaRoute
      | StaticFastifyRoute
      | StaticNextRoute
      | StaticAstroEndpointRoute
      | StaticReactRouterRoute
      | StaticVueRouterRoute,
    routeFramework: NonNullable<PendingReference["routeFramework"]>,
    routeRegistration?: PendingReference["routeRegistration"],
    routePrefixChain?: PendingReference["routePrefixChain"]
  ): { readonly symbol: SymbolNode; readonly reference: PendingReference } {
    const symbol = addRouteSymbol(node, route.method, route.path);
    const reference = addPendingReference(
      symbol.id,
      route.handler.text,
      "routes",
      route.handler,
      routeFramework,
      routeRegistration,
      routePrefixChain
    );
    return { symbol, reference };
  }

  function addStaticExpressRoute(node: ts.CallExpression, route: StaticExpressRoute): void {
    addStaticRoute(node, route, "express");
  }

  function addStaticFrameworkRoutePluginRoute(
    node: ts.CallExpression,
    candidate: StaticFrameworkRoutePluginRoute
  ): void {
    const added = addStaticRoute(
      node,
      candidate.route,
      customRouteFramework(candidate.plugin.id),
      candidate.routeRegistration,
      candidate.routePrefixChain
    );
    const receiver = symbolsByDeclaration.get(candidate.receiver.declaration);
    if (receiver !== undefined) {
      frameworkRoutePluginFacts.routes.push({
        receiverId: receiver.id,
        frameworkId: candidate.plugin.id,
        routeId: added.symbol.id,
        referenceId: added.reference.id,
        method: candidate.route.method,
        path: candidate.route.path,
        range: added.symbol.range,
        routePrefixChain: candidate.routePrefixChain ?? []
      });
    }
  }

  function addStaticFrameworkRoutePluginDecoratorRoute(
    candidate: StaticFrameworkRoutePluginDecoratorRoute
  ): void {
    const handler = symbolsByDeclaration.get(candidate.handler);
    if (handler?.kind !== "method") {
      return;
    }
    const symbol = addRouteSymbol(
      candidate.decorator,
      candidate.routeMethod.routeMethod,
      candidate.path
    );
    const range = sourceRange(sourceFile, candidate.decorator);
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
        ruleId: `framework.plugin.${candidate.plugin.id.replace("/", ".")}.decorator-route.local-method`,
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addStaticKoaRoute(node: ts.CallExpression, route: StaticKoaRoute): void {
    addStaticRoute(node, route, "koa");
  }

  function addStaticHonoRoute(node: ts.CallExpression, route: StaticHonoRoute): void {
    addStaticRoute(node, route, "hono");
  }

  function addStaticElysiaRoute(node: ts.CallExpression, route: StaticElysiaRoute): void {
    addStaticRoute(node, route, "elysia");
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

  function addStaticVueRouterRoute(route: StaticVueRouterRoute): void {
    addStaticRoute(route.declaration, route, "vue-router");
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

  function addStaticAstroEndpointRoute(route: StaticAstroEndpointRoute): void {
    addStaticRoute(route.declaration, route, "astro", route.routeRegistration);
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

  function nestEntrypointEvidenceRuleId(transport: Exclude<EntryPointTransport, "ui">): string {
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

  function addStaticNestGraphqlResolverReference(
    reference: StaticNestGraphqlResolverReference
  ): void {
    const resolver = symbolsByDeclaration.get(reference.resolver);
    if (resolver?.kind !== "class") {
      return;
    }
    nestGraphqlFacts.resolverReferences.push({
      resolverId: resolver.id,
      schemaTypeName: reference.schemaType.text,
      range: sourceRange(sourceFile, reference.schemaType)
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

  function addReactNativeTurboModuleSpecMethod(
    specSymbol: SymbolNode,
    declaration: ts.MethodSignature,
    name: string
  ): SymbolNode {
    const qualifiedName = `${specSymbol.qualifiedName}.${name}`;
    const identity = `${qualifiedName}\u0000method`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: sourceRange(sourceFile, declaration),
      isExported: specSymbol.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(specSymbol.id, symbol.id, "contains", declaration, name);
    return symbol;
  }

  function visit(node: ts.Node): void {
    ownerByNode.set(node, currentOwner());
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
    if (info === null && node === commonJsExportClass && commonJsExportClass.name !== undefined) {
      info = { name: commonJsExportClass.name.text, kind: "class", isExported: true };
    }
    const exportAssignment = ts.isExportAssignment(node) ? node : null;
    const expressionInfo =
      exportAssignment === null ? null : defaultExportExpressionInfo(exportAssignment);
    let heritageDeclaration: HeritageDeclaration | null = null;
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      heritageDeclaration = node;
    } else if (node === commonJsExportClass) {
      heritageDeclaration = commonJsExportClass;
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
      (hasDefaultModifier(node) || expressionInfo !== null || node === commonJsExportClass)
    ) {
      exportBindings.push({
        localName: info.name,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (
      input.language === "typescript" &&
      decoratorsFor(node).length > 0
    ) {
      if (declaredSymbol?.kind === "class") {
        decoratorTaintedTypeSymbolIds.add(declaredSymbol.id);
      } else if (declaredSymbol?.kind === "method" || declaredSymbol?.kind === "variable") {
        decoratorTaintedMemberSymbolIds.add(declaredSymbol.id);
      }
      const owningTypeDeclaration = nearestNamedClass(node);
      const owningType =
        owningTypeDeclaration === null
          ? undefined
          : symbolsByDeclaration.get(owningTypeDeclaration);
      if (owningType?.kind === "class") {
        decoratorTaintedTypeSymbolIds.add(owningType.id);
      }
    }
    if (
      input.language === "typescript" &&
      declaredSymbol !== null &&
      (declaredSymbol.kind === "method" || declaredSymbol.kind === "variable") &&
      (currentOwner().kind === "class" ||
        currentOwner().kind === "interface" ||
        (node.parent !== undefined && ts.isTypeLiteralNode(node.parent)))
    ) {
      const isStatic =
        ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
        ) === true;
      (isStatic ? staticTypeScriptMemberSymbolIds : instanceTypeScriptMemberSymbolIds).add(
        declaredSymbol.id
      );
      if (isDirectlyCallableTypeScriptMember(node)) {
        callableTypeScriptMemberSymbolIds.add(declaredSymbol.id);
      }
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
      exportBindings.push({
        localName: node.expression.text,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (ts.isVariableDeclaration(node)) {
      const commonJsSpecifier = commonJsRequires.get(node);
      if (commonJsSpecifier !== undefined) {
        addPendingReference(fileNode.id, commonJsSpecifier.text, "imports", commonJsSpecifier);
      }
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
    if (declaredSymbol !== null && input.language === "typescript") {
      const seenSignatureReferences = new Set<string>();
      if (ts.isFunctionLike(node)) {
        addCallableSignatureReferences(declaredSymbol, node, seenSignatureReferences);
      } else if (ts.isVariableDeclaration(node)) {
        if (node.type !== undefined && ts.isFunctionTypeNode(node.type)) {
          addCallableSignatureReferences(declaredSymbol, node.type, seenSignatureReferences);
        } else if (
          node.initializer !== undefined &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
        ) {
          addCallableSignatureReferences(declaredSymbol, node.initializer, seenSignatureReferences);
        }
      } else if (
        exportAssignment !== null &&
        (ts.isArrowFunction(exportAssignment.expression) ||
          ts.isFunctionExpression(exportAssignment.expression))
      ) {
        addCallableSignatureReferences(
          declaredSymbol,
          exportAssignment.expression,
          seenSignatureReferences
        );
      }
    }
    if (
      declaredSymbol !== null &&
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      hasOverrideModifier(node) &&
      currentOwner().kind === "class"
    ) {
      addPendingReference(declaredSymbol.id, node.name.text, "overrides", node.name);
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
    if (
      (input.language === "typescript" || input.language === "javascript") &&
      ts.isBinaryExpression(node) &&
      isAssignmentOperatorKind(node.operatorToken.kind) &&
      ts.isIdentifier(node.left)
    ) {
      const assignmentScope = enclosingScopeNodes(node)[0];
      if (assignmentScope !== undefined) {
        localBindings.push({
          name: node.left.text,
          symbolId: null,
          scopeId: scopeIdFor(sourceFile, assignmentScope),
          space: "value"
        });
      }
    }
    if (declaredSymbol !== null) {
      stack.push(declaredSymbol);
    }

    if (
      (input.language === "typescript" || input.language === "javascript") &&
      !isAstroEndpointSource &&
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      addPendingReference(currentCallOwner(node).id, node.expression.text, "instantiates", node.expression);
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      addPendingReference(currentCallOwner(node).id, node.expression.text, "calls", node.expression);
    }
    if (ts.isCallExpression(node)) {
      const comparator = staticArraySortComparator(sourceFile, node, routeReceiverBindings);
      if (comparator !== null) {
        addPendingReference(
          currentCallOwner(node).id,
          comparator.text,
          "calls",
          comparator,
          undefined,
          undefined,
          undefined,
          "typescript-array-sort-comparator"
        );
      }
    }
    if (
      input.language === "typescript" &&
      ts.isCallExpression(node)
    ) {
      const memberCall = staticTypeScriptMemberCall(sourceFile, node, routeReceiverBindings);
      if (memberCall !== null) {
        addPendingReference(
          currentCallOwner(node).id,
          memberCall.method.text,
          "calls",
          memberCall.method,
          undefined,
          undefined,
          undefined,
          "typescript-proven-receiver-member-call",
          memberCall.receiverTypeName ?? undefined,
          memberCall.inlineParameterMember
            ? `${currentCallOwner(node).qualifiedName}.${memberCall.method.text}`
            : undefined,
          memberCall.receiverBindingSpace ?? undefined,
          memberCall.receiverMemberKind
        );
      }
    }

    ts.forEachChild(node, visit);

    if (declaredSymbol !== null) {
      stack.pop();
    }
  }

  ts.forEachChild(sourceFile, visit);

  if (input.language === "typescript") {
    const typeSymbolsByDeclaration = new Map<
      ts.ClassDeclaration | ts.ClassExpression,
      SymbolNode
    >();
    for (const [declaration, symbol] of symbolsByDeclaration) {
      if (
        symbol.kind === "class" &&
        (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration))
      ) {
        typeSymbolsByDeclaration.set(declaration, symbol);
      }
    }
    runtimeTaintedTypeScriptMemberSurfaces.push(
      ...runtimeTaintedMemberSurfaces(sourceFile, typeSymbolsByDeclaration)
    );
  }

  const seenFrameworkRoutePluginReceivers = new Set<string>();
  for (const bindingsByName of routeReceiverBindings.byScopeId.values()) {
    for (const bindingsForName of bindingsByName.values()) {
      for (const binding of bindingsForName) {
        const receiver = symbolsByDeclaration.get(binding.declaration);
        if (
          binding.kind !== "custom-framework-receiver" ||
          binding.frameworkRoutePlugin === undefined ||
          receiver === undefined ||
          seenFrameworkRoutePluginReceivers.has(receiver.id)
        ) {
          continue;
        }
        seenFrameworkRoutePluginReceivers.add(receiver.id);
        frameworkRoutePluginFacts.receivers.push({
          receiverId: receiver.id,
          frameworkId: binding.frameworkRoutePlugin.id
        });
      }
    }
  }

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
        const resolverReference = staticNestGraphqlResolverReference(
          sourceFile,
          node,
          nestDecoratorBindings
        );
        if (resolverReference !== null) {
          addStaticNestGraphqlResolverReference(resolverReference);
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
    frameworkExtractionPass("koa", {
      visit(node) {
        if (!ts.isCallExpression(node)) {
          return;
        }
        const route = staticKoaRoute(sourceFile, node, routeReceiverBindings);
        if (route !== null) {
          addStaticKoaRoute(node, route);
        }
      }
    }),
    frameworkExtractionPass("hono", {
      visit(node) {
        if (!ts.isCallExpression(node)) {
          return;
        }
        const route = staticHonoRoute(sourceFile, node, routeReceiverBindings);
        if (route !== null) {
          addStaticHonoRoute(node, route);
        }
      }
    }),
    frameworkExtractionPass("elysia", {
      visit(node) {
        if (!ts.isCallExpression(node)) {
          return;
        }
        const route = staticElysiaRoute(sourceFile, node, routeReceiverBindings);
        if (route !== null) {
          addStaticElysiaRoute(node, route);
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
    frameworkExtractionPass("react-native", {
      visit(node) {
        if (ts.isCallExpression(node)) {
          const owner = ownerByNode.get(node);
          const nativeModuleCall = staticReactNativeNativeModuleCall(
            sourceFile,
            node,
            routeReceiverBindings
          );
          if (nativeModuleCall !== null && owner !== undefined) {
            reactNativeFacts.nativeModuleCalls.push({
              sourceId: owner.id,
              filePath: input.filePath,
              moduleName: nativeModuleCall.moduleName,
              methodName: nativeModuleCall.methodName,
              range: sourceRange(sourceFile, nativeModuleCall.expression)
            });
          }

          const turboModuleCall = staticReactNativeTurboModuleCall(sourceFile, node, routeReceiverBindings);
          if (turboModuleCall !== null && owner !== undefined) {
            reactNativeFacts.turboModuleCalls.push({
              sourceId: owner.id,
              filePath: input.filePath,
              moduleName: turboModuleCall.moduleName,
              methodName: turboModuleCall.methodName,
              range: sourceRange(sourceFile, turboModuleCall.expression)
            });
          }

          const defaultImportCall = staticReactNativeTurboModuleDefaultImportCall(
            sourceFile,
            node,
            routeReceiverBindings
          );
          if (defaultImportCall !== null && owner !== undefined) {
            reactNativeFacts.turboModuleDefaultImportCalls.push({
              sourceId: owner.id,
              filePath: input.filePath,
              moduleSpecifier: defaultImportCall.moduleSpecifier,
              methodName: defaultImportCall.methodName,
              range: sourceRange(sourceFile, defaultImportCall.expression)
            });
          }
        }

        if (ts.isExportAssignment(node)) {
          const defaultExport = staticReactNativeTurboModuleDefaultExport(
            sourceFile,
            node,
            routeReceiverBindings
          );
          if (defaultExport !== null) {
            reactNativeFacts.turboModuleDefaultExports.push({
              filePath: input.filePath,
              moduleName: defaultExport.moduleName,
              range: sourceRange(sourceFile, defaultExport.expression)
            });
          }
        }

        if (!ts.isInterfaceDeclaration(node)) {
          return;
        }
        const spec = staticReactNativeTurboModuleSpec(sourceFile, node, routeReceiverBindings);
        const specSymbol = symbolsByDeclaration.get(node);
        if (spec === null || specSymbol?.kind !== "interface") {
          return;
        }
        for (const method of spec.methods) {
          const methodSymbol =
            symbolsByDeclaration.get(method.declaration) ??
            addReactNativeTurboModuleSpecMethod(specSymbol, method.declaration, method.name);
          reactNativeFacts.turboModuleSpecMethods.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            moduleName: spec.moduleName,
            methodName: method.name,
            range: sourceRange(sourceFile, method.declaration)
          });
        }
      }
    }),
    frameworkExtractionPass("vue-router", {
      finalize() {
        for (const route of staticVueRouterRoutes(sourceFile)) {
          addStaticVueRouterRoute(route);
        }
      }
    }),
    frameworkExtractionPass("nextjs", {
      finalize() {
        const route = staticNextRoute(sourceFile, input.frameworkEvidence);
        if (route !== null) {
          addStaticNextRoute(route);
        }
      }
    }),
    frameworkExtractionPass("astro", {
      finalize() {
        for (const route of staticAstroEndpointRoutes(sourceFile, input.frameworkEvidence)) {
          addStaticAstroEndpointRoute(route);
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

  function extractFrameworkRoutePluginFacts(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const importedMount = staticFrameworkRoutePluginImportedMountFact(
        sourceFile,
        input.filePath,
        node,
        routeReceiverBindings,
        symbolsByDeclaration
      );
      if (importedMount !== null) {
        frameworkRoutePluginFacts.importedMounts.push(importedMount);
      }
      const candidate = staticFrameworkRoutePluginRoute(sourceFile, node, routeReceiverBindings);
      if (candidate !== null) {
        addStaticFrameworkRoutePluginRoute(node, candidate);
      }
    }
    ts.forEachChild(node, extractFrameworkRoutePluginFacts);
  }

  function extractFrameworkRoutePluginDecoratorFacts(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      for (const candidate of staticFrameworkRoutePluginDecoratorRoutes(
        sourceFile,
        node,
        frameworkRoutePluginDecoratorBindings
      )) {
        addStaticFrameworkRoutePluginDecoratorRoute(candidate);
      }
    }
    ts.forEachChild(node, extractFrameworkRoutePluginDecoratorFacts);
  }

  if (frameworkRoutePlugins.length > 0) {
    ts.forEachChild(sourceFile, extractFrameworkRoutePluginFacts);
  }
  if (frameworkRoutePluginsWithDecorators.length > 0) {
    ts.forEachChild(sourceFile, extractFrameworkRoutePluginDecoratorFacts);
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
    typescriptFacts: {
      decoratorTaintedTypeSymbolIds: [...decoratorTaintedTypeSymbolIds],
      decoratorTaintedMemberSymbolIds: [...decoratorTaintedMemberSymbolIds],
      staticMemberSymbolIds: [...staticTypeScriptMemberSymbolIds],
      instanceMemberSymbolIds: [...instanceTypeScriptMemberSymbolIds],
      callableMemberSymbolIds: [...callableTypeScriptMemberSymbolIds],
      runtimeTaintedMemberSurfaces: runtimeTaintedTypeScriptMemberSurfaces
    },
    nestRouteFacts,
    nestGraphqlFacts,
    fastifyPluginFacts,
    frameworkRoutePluginFacts,
    reactNativeFacts
  };
}

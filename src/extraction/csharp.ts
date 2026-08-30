import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type CsharpCallFact,
  type CsharpCallableFact,
  type CsharpFacts,
  type CsharpHeritageFact,
  type CsharpInstantiationFact,
  type CsharpOverrideFact,
  type CsharpTypeFact,
  type CsharpUsingFact,
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
  readonly baseName: string | null;
  readonly kind: "class" | "interface";
  readonly declarationKind: "class" | "interface";
  readonly namespaceName: string;
  readonly isPartial: boolean;
  readonly isStatic: boolean;
  readonly isAbstract: boolean;
  readonly isExported: boolean;
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly body: CsharpSyntaxNode;
}

interface StaticCsharpMethod {
  readonly body: CsharpSyntaxNode | null;
  readonly isStatic: boolean;
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly parameterCount: number | null;
  readonly requiredParameterCount: number | null;
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName: string | null;
  readonly isOverride: boolean;
  readonly isExported: boolean;
}

interface StaticCsharpFunction {
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly parameterCount: number | null;
  readonly requiredParameterCount: number | null;
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName: string | null;
  readonly isExported: boolean;
}

interface StaticCsharpExtraType {
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly declarationKind: "record" | "struct" | "enum" | "delegate";
  readonly namespaceName: string;
}

interface StaticCsharpConstructor {
  readonly name: string;
  readonly node: CsharpSyntaxNode;
  readonly parameterCount: number | null;
  readonly requiredParameterCount: number | null;
  readonly parameterTypeNames: readonly string[];
  readonly isExported: boolean;
}

interface StaticCsharpDeclarationEntry {
  readonly node: CsharpSyntaxNode;
  readonly namespaceName: string;
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

interface StaticCsharpCall {
  readonly name: string;
  readonly callKind: "direct" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly argumentCount: number;
  readonly node: CsharpSyntaxNode;
}

interface StaticCsharpInstantiation {
  readonly typeName: string;
  readonly argumentCount: number;
  readonly node: CsharpSyntaxNode;
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

function csharpQualifiedName(node: CsharpSyntaxNode | undefined): string | null {
  if (node === undefined) return null;
  if (node.kind() === "identifier") return identifierText(node);
  if (node.kind() !== "qualified_name") return null;
  const text = nodeText(node).trim();
  return /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(text) ? text : null;
}

function csharpIsExported(node: CsharpSyntaxNode): boolean {
  return directChildren(node).some((child) => child.kind() === "modifier" && ["public", "protected", "internal"].includes(nodeText(child)));
}

function csharpParameterShape(parameterList: CsharpSyntaxNode | undefined): {
  readonly parameterCount: number | null;
  readonly requiredParameterCount: number | null;
  readonly parameterTypeNames: readonly string[];
} {
  if (parameterList === undefined) return { parameterCount: null, requiredParameterCount: null, parameterTypeNames: [] };
  const children = directChildren(parameterList);
  if (children.some((child) => !["(", ")", ",", "parameter"].includes(String(child.kind())))) return { parameterCount: null, requiredParameterCount: null, parameterTypeNames: [] };
  const parameters = children.filter((child) => child.kind() === "parameter");
  const names: string[] = [];
  for (const parameter of parameters) {
    const parts = directChildren(parameter);
    const typeNode = parts.find((child) => child.kind() === "identifier" || child.kind() === "predefined_type" || child.kind() === "qualified_name");
    const typeName = typeNode === undefined ? null : nodeText(typeNode);
    if (typeName === null || !/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(typeName) || typeName === "var" || typeName === "dynamic") return { parameterCount: null, requiredParameterCount: null, parameterTypeNames: [] };
    names.push(typeName);
  }
  const hasDefault = parameters.some((parameter) => nodeText(parameter).includes("="));
  const hasParams = parameters.some((parameter) => /\bparams\b/u.test(nodeText(parameter)));
  return { parameterCount: parameters.length, requiredParameterCount: hasDefault || hasParams ? null : parameters.length, parameterTypeNames: names };
}

function csharpReturnTypeName(node: CsharpSyntaxNode, parametersIndex: number): string | null {
  const parts = directChildren(node).slice(0, parametersIndex).filter((child) => ["identifier", "predefined_type", "qualified_name"].includes(String(child.kind())));
  const candidate = parts.at(-2) ?? parts.at(-1);
  if (candidate === undefined) return null;
  const name = nodeText(candidate);
  return /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(name) && name !== "void" ? name : null;
}

function staticCsharpType(node: CsharpSyntaxNode, namespaceName = ""): StaticCsharpType | null {
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
  const baseList = children.find((child) => child.kind() === "base_list");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const isStatic = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "static"
  );
  const isPartial = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "partial"
  );
  const baseText = baseList === undefined ? null : nodeText(baseList).trim();
  const baseName =
    baseText === null
      ? null
      : /^:\s*(PageModel|Microsoft\.AspNetCore\.Mvc\.RazorPages\.PageModel)$/u.exec(baseText)?.[1] ?? null;
  return name === null || body === undefined
    ? null
    : { baseName, kind, declarationKind: kind, namespaceName, isPartial, isStatic, isAbstract: children.some((child) => child.kind() === "modifier" && nodeText(child) === "abstract"), isExported: csharpIsExported(node), name, node, body };
}

function staticCsharpExtraType(node: CsharpSyntaxNode, namespaceName: string): StaticCsharpExtraType | null {
  const declarationKind = node.kind() === "record_declaration" ? "record" : node.kind() === "struct_declaration" ? "struct" : node.kind() === "enum_declaration" ? "enum" : node.kind() === "delegate_declaration" ? "delegate" : null;
  if (declarationKind === null) return null;
  const children = directChildren(node);
  // Delegate declarations put the return type before the declared name.  Use
  // the identifier immediately preceding the parameter list so `delegate
  // Point Handler(...)` is recorded as Handler rather than Point.
  const parameterIndex = declarationKind === "delegate"
    ? children.findIndex((child) => child.kind() === "parameter_list")
    : -1;
  const nameNode = parameterIndex > 0
    ? children.slice(0, parameterIndex).filter((child) => child.kind() === "identifier").at(-1)
    : children.find((child) => child.kind() === "identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null ? null : { name, node, declarationKind, namespaceName };
}

function csharpDeclarationEntries(root: CsharpSyntaxNode): readonly StaticCsharpDeclarationEntry[] {
  const entries: StaticCsharpDeclarationEntry[] = [];
  function visit(nodes: readonly CsharpSyntaxNode[], namespaceName: string): void {
    let activeNamespace = namespaceName;
    for (const node of nodes) {
      if (node.kind() === "file_scoped_namespace_declaration") {
        const name = csharpQualifiedName(directChildren(node).find((child) => child.kind() === "qualified_name"));
        if (name !== null) activeNamespace = name;
        continue;
      }
      if (node.kind() === "namespace_declaration") {
        const name = csharpQualifiedName(directChildren(node).find((child) => child.kind() === "qualified_name"));
        const list = directChildren(node).find((child) => child.kind() === "declaration_list");
        if (list !== undefined) visit(directChildren(list), name === null ? activeNamespace : name);
        continue;
      }
      if (["class_declaration", "interface_declaration", "record_declaration", "struct_declaration", "enum_declaration", "delegate_declaration"].includes(String(node.kind()))) entries.push({ node, namespaceName: activeNamespace });
    }
  }
  visit(directChildren(root), "");
  return entries;
}

function staticCsharpHeritageNames(node: CsharpSyntaxNode): readonly string[] {
  const baseList = directChildren(node).find((child) => child.kind() === "base_list");
  if (baseList === undefined) return [];
  return directChildren(baseList)
    .filter((child) => child.kind() === "identifier" || child.kind() === "qualified_name")
    .map((child) => nodeText(child))
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(name));
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
  const parameterList = children[parametersIndex];
  const parameterShape = csharpParameterShape(parameterList);
  const parameterCount = parameterList === undefined ? null : boundedCsharpParameterCount(parameterList);
  const isStatic = children.some(
    (child) => child.kind() === "modifier" && nodeText(child) === "static"
  );
  return name === null
    ? null
    : {
        body: body ?? null,
        isStatic,
        name,
        node,
        parameterCount,
        requiredParameterCount: parameterShape.requiredParameterCount,
        parameterTypeNames: parameterShape.parameterTypeNames,
        returnTypeName: csharpReturnTypeName(node, parametersIndex),
        isOverride: children.some((child) => child.kind() === "modifier" && nodeText(child) === "override"),
        isExported: csharpIsExported(node)
      };
}

function staticCsharpConstructor(node: CsharpSyntaxNode): StaticCsharpConstructor | null {
  if (node.kind() !== "constructor_declaration") return null;
  const children = directChildren(node);
  const parametersIndex = children.findIndex((child) => child.kind() === "parameter_list");
  const nameNode = children.slice(0, Math.max(0, parametersIndex)).find((child) => child.kind() === "identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const shape = csharpParameterShape(parametersIndex < 0 ? undefined : children[parametersIndex]);
  return name === null ? null : { name, node, parameterCount: shape.parameterCount, requiredParameterCount: shape.requiredParameterCount, parameterTypeNames: shape.parameterTypeNames, isExported: csharpIsExported(node) };
}

function hasDirectRazorPagesImport(root: CsharpSyntaxNode): boolean {
  return (
    directChildren(root).filter((node) => {
      const text = nodeText(node).trim();
      return (
        (node.kind() === "using_directive" &&
          text === "using Microsoft.AspNetCore.Mvc.RazorPages;") ||
        (node.kind() === "global_using_directive" &&
          text === "global using Microsoft.AspNetCore.Mvc.RazorPages;")
      );
    }).length === 1
  );
}

function razorPageHandlerName(method: StaticCsharpMethod): string | null {
  if (method.body === null || method.isStatic || method.name === "OnPostAsync") {
    return null;
  }
  const children = directChildren(method.node);
  const modifiers = children
    .filter((child) => child.kind() === "modifier")
    .map((child) => nodeText(child));
  if (
    modifiers.filter((modifier) => modifier === "public").length !== 1 ||
    modifiers.some((modifier) => modifier !== "public" && modifier !== "async") ||
    children.some((child) => child.kind() === "type_parameter_list") ||
    staticRouteAttributes(method.node).some((attribute) => attribute.shortName === "NonHandler")
  ) {
    return null;
  }
  const match = /^OnPost([A-Za-z_][A-Za-z0-9_]*?)(?:Async)?$/u.exec(method.name);
  return match?.[1] ?? null;
}

function boundedCsharpParameterCount(parameterList: CsharpSyntaxNode): number | null {
  const children = directChildren(parameterList);
  if (children.some((child) => !["(", ")", ",", "parameter"].includes(String(child.kind())))) {
    return null;
  }
  const parameters = children.filter((child) => child.kind() === "parameter");
  return parameters.some((parameter) => /\b(?:params|this)\b|=/u.test(nodeText(parameter)))
    ? null
    : parameters.length;
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
  readonly calls: readonly { readonly argumentCount: number; readonly name: string; readonly node: CsharpSyntaxNode }[];
  readonly boundNames: ReadonlySet<string>;
  readonly unsafe: boolean;
} {
  const calls: Array<{ readonly argumentCount: number; readonly name: string; readonly node: CsharpSyntaxNode }> = [];
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
      const argumentChildren = arguments_ === undefined ? [] : directChildren(arguments_);
      const argumentCount = argumentChildren.filter((child) => child.kind() === "argument").length;
      if (
        name !== null &&
        arguments_?.kind() === "argument_list" &&
        children.length === 2 &&
        argumentChildren.every((child) => ["(", ")", ",", "argument"].includes(String(child.kind())))
      ) {
        calls.push({ argumentCount, name, node });
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  };
  visit(body);
  return { calls, boundNames, unsafe };
}

function hasCsharpPreprocessing(node: CsharpSyntaxNode): boolean {
  return String(node.kind()).startsWith("preproc_") || directChildren(node).some((child) => hasCsharpPreprocessing(child));
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
  const parameterList = children[parametersIndex];
  const parameterShape = csharpParameterShape(parameterList);
  return name === null
    ? null
    : {
        name,
        node: functionNode,
        parameterCount: parameterShape.parameterCount,
        requiredParameterCount: parameterShape.requiredParameterCount,
        parameterTypeNames: parameterShape.parameterTypeNames,
        returnTypeName: csharpReturnTypeName(functionNode, parametersIndex),
        isExported: true
      };
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

function staticCsharpArgumentCount(argumentList: CsharpSyntaxNode): number | null {
  const children = directChildren(argumentList);
  if (argumentList.kind() !== "argument_list" || children.some((child) => !["(", ")", ",", "argument"].includes(String(child.kind())))) return null;
  const arguments_ = children.filter((child) => child.kind() === "argument");
  if (arguments_.some((argument) => nodeText(argument).includes(":"))) return null;
  return arguments_.length;
}

function staticCsharpSimpleMember(node: CsharpSyntaxNode): { readonly receiverName: string; readonly name: string } | null {
  if (node.kind() !== "member_access_expression") return null;
  const children = directChildren(node);
  const receiver = children[0];
  const nameNode = children.at(-1);
  const receiverName = receiver === undefined ? null : identifierText(receiver);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return receiverName === null || name === null || children.length !== 3 || children[1]?.kind() !== "."
    ? null
    : { receiverName, name };
}

function staticCsharpTypeBindings(declaration: { readonly node: CsharpSyntaxNode }, body: CsharpSyntaxNode): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  const parameterList = directChildren(declaration.node).find((child) => child.kind() === "parameter_list");
  if (parameterList !== undefined) {
    for (const parameter of directChildren(parameterList).filter((child) => child.kind() === "parameter")) {
      const children = directChildren(parameter);
      const identifiers = children.filter((child) => child.kind() === "identifier");
      const typeNode = children.find((child) => child.kind() === "identifier" || child.kind() === "predefined_type" || child.kind() === "qualified_name");
      const nameNode = identifiers.at(-1);
      const name = nameNode === undefined ? null : identifierText(nameNode);
      const typeName = typeNode === undefined ? null : nodeText(typeNode);
      if (name !== null && typeName !== null && name !== typeName && /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(typeName) && typeName !== "dynamic" && typeName !== "var") {
        if (bindings.has(name) && bindings.get(name) !== typeName) bindings.delete(name);
        else bindings.set(name, typeName);
      }
    }
  }
  function visit(node: CsharpSyntaxNode): void {
    if (node.kind() === "local_function_statement" || node.kind() === "lambda_expression" || node.kind() === "anonymous_method_expression") return;
    if (node.kind() === "variable_declaration") {
      const children = directChildren(node);
      const typeNode = children.find((child) => child.kind() === "identifier" || child.kind() === "predefined_type" || child.kind() === "qualified_name");
      const typeName = typeNode === undefined ? null : nodeText(typeNode);
      if (typeName !== null && typeName !== "var" && typeName !== "dynamic") {
        for (const declarator of children.filter((child) => child.kind() === "variable_declarator")) {
          const nameNode = directChildren(declarator).find((child) => child.kind() === "identifier");
          const name = nameNode === undefined ? null : identifierText(nameNode);
          if (name !== null) {
            if (bindings.has(name) && bindings.get(name) !== typeName) bindings.delete(name);
            else bindings.set(name, typeName);
          }
        }
      }
    }
    for (const child of directChildren(node)) visit(child);
  }
  visit(body);
  return bindings;
}

function collectCsharpCalls(
  body: CsharpSyntaxNode,
  declaration: { readonly node: CsharpSyntaxNode }
): { readonly calls: readonly StaticCsharpCall[]; readonly instantiations: readonly StaticCsharpInstantiation[] } {
  const bindings = staticCsharpTypeBindings(declaration, body);
  const bodyText = nodeText(body);
  const tainted = new Set<string>();
  for (const name of bindings.keys()) {
    const stripped = bodyText.replace(new RegExp(`(?:\\b(?:var|const|readonly|[A-Za-z_][A-Za-z0-9_.<>]*)\\s+)${name}\\s*=`, "gu"), "");
    if (new RegExp(`(?:\\breturn\\s+${name}\\b|\\b${name}\\s*=|\\([^)]*\\b${name}\\b[^)]*\\))`, "u").test(stripped)) tainted.add(name);
  }
  const calls: StaticCsharpCall[] = [];
  const instantiations: StaticCsharpInstantiation[] = [];
  function visit(node: CsharpSyntaxNode, isRoot: boolean): void {
    if (!isRoot && (node.kind() === "local_function_statement" || node.kind() === "lambda_expression" || node.kind() === "anonymous_method_expression" || node.kind() === "class_declaration" || node.kind() === "interface_declaration")) return;
    if (node.kind() === "invocation_expression") {
      const children = directChildren(node);
      const argumentList = children.find((child) => child.kind() === "argument_list");
      const argumentCount = argumentList === undefined ? null : staticCsharpArgumentCount(argumentList);
      const callee = children[0];
      if (argumentCount !== null && callee !== undefined && children.length === 2) {
        const directName = identifierText(callee);
        if (directName !== null) calls.push({ name: directName, callKind: "direct", argumentCount, node });
        else {
          const member = staticCsharpSimpleMember(callee);
          if (member !== null && !tainted.has(member.receiverName)) {
            const receiverIsType = /^[A-Z]/u.test(member.receiverName);
            const receiverTypeName = bindings.get(member.receiverName) ?? (receiverIsType ? member.receiverName : null);
            calls.push({ name: member.name, callKind: "member", receiverName: member.receiverName, ...(receiverTypeName === null ? {} : { receiverTypeName }), ...(receiverIsType ? { receiverIsType: true } : {}), argumentCount, node });
          }
        }
      }
    }
    if (node.kind() === "object_creation_expression") {
      const children = directChildren(node);
      const typeNode = children.find((child) => child.kind() === "identifier" || child.kind() === "qualified_name");
      const argumentList = children.find((child) => child.kind() === "argument_list");
      const typeName = typeNode === undefined ? null : nodeText(typeNode);
      const argumentCount = argumentList === undefined ? null : staticCsharpArgumentCount(argumentList);
      if (typeName !== null && argumentCount !== null && /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(typeName)) instantiations.push({ typeName, argumentCount, node });
    }
    for (const child of directChildren(node)) visit(child, false);
  }
  visit(body, true);
  return { calls, instantiations };
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
  const csharpDirectClassFacts: Array<{
    classId: string;
    isPartial: boolean;
    isRazorPageModel?: boolean;
    razorPageHandlerMethods?: Array<{ handlerName: string; methodId: string }>;
  }> = [];
  const csharpTypes: CsharpTypeFact[] = [];
  const csharpCallables: CsharpCallableFact[] = [];
  const csharpUsings: CsharpUsingFact[] = [];
  const csharpCalls: CsharpCallFact[] = [];
  const csharpInstantiations: CsharpInstantiationFact[] = [];
  const csharpHeritage: CsharpHeritageFact[] = [];
  const csharpOverrides: CsharpOverrideFact[] = [];
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
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    const qualifiedTypePath = declaration.namespaceName === "" ? declaration.name : `${declaration.namespaceName}.${declaration.name}`;
    csharpTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      namespaceName: declaration.namespaceName,
      qualifiedTypePath,
      declarationKind: declaration.declarationKind,
      isExported: declaration.isExported,
      isPartial: declaration.isPartial,
      ...(declaration.isAbstract ? { isAbstract: true } : {}),
      range: symbol.range
    });
    for (const targetName of staticCsharpHeritageNames(declaration.node)) {
      csharpHeritage.push({ sourceId: symbol.id, filePath: input.filePath, referenceName: targetName, relationKind: "extends", sourceTypeKind: declaration.declarationKind, range: symbol.range });
    }
    return symbol;
  }

  function addNamespace(namespaceName: string): SymbolNode {
    const name = namespaceName;
    const qualifiedName = input.filePath + "#namespace:" + name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "module");
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "module", declarationOrdinal }), name, qualifiedName, kind: "module", filePath: input.filePath, range: fileNode.range, isExported: true, declarationOrdinal };
    symbols.push(symbol);
    addContainment(fileNode, symbol, root);
    csharpTypes.push({ symbolId: symbol.id, filePath: input.filePath, name, namespaceName, qualifiedTypePath: name, declarationKind: "namespace", isExported: true, range: symbol.range });
    return symbol;
  }

  function addExtraType(declaration: StaticCsharpExtraType): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "type");
    const isExported = csharpIsExported(declaration.node);
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "type", declarationOrdinal }),
      name: declaration.name,
      qualifiedName,
      kind: "type",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    csharpTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: declaration.name, namespaceName: declaration.namespaceName, qualifiedTypePath: declaration.namespaceName === "" ? declaration.name : `${declaration.namespaceName}.${declaration.name}`, declarationKind: declaration.declarationKind, isExported, range: symbol.range });
    for (const targetName of staticCsharpHeritageNames(declaration.node)) {
      csharpHeritage.push({ sourceId: symbol.id, filePath: input.filePath, referenceName: targetName, relationKind: "extends", sourceTypeKind: declaration.declarationKind, range: symbol.range });
    }
    if (declaration.declarationKind === "record") {
      const parameterList = directChildren(declaration.node).find((child) => child.kind() === "parameter_list");
      const shape = csharpParameterShape(parameterList);
      if (shape.parameterCount !== null) {
        csharpCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: declaration.name, namespaceName: declaration.namespaceName, callableKind: "constructor", ownerTypeName: declaration.name, ownerTypeId: symbol.id, parameterCount: shape.parameterCount, requiredParameterCount: shape.requiredParameterCount ?? shape.parameterCount, parameterTypeNames: shape.parameterTypeNames, isStatic: false, isExported, range: symbol.range });
      }
    }
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticCsharpMethod, namespaceName = ""): SymbolNode {
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
    csharpCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      namespaceName,
      callableKind: "method",
      ownerTypeName: parent.name,
      ownerTypeId: parent.id,
      parameterCount: declaration.parameterCount ?? -1,
      requiredParameterCount: declaration.requiredParameterCount ?? -1,
      parameterTypeNames: declaration.parameterTypeNames,
      ...(declaration.returnTypeName === null ? {} : { returnTypeName: declaration.returnTypeName }),
      isStatic: declaration.isStatic,
      isExported: declaration.isExported,
      ...(declaration.isOverride ? { isOverride: true } : {}),
      range: symbol.range
    });
    return symbol;
  }

  function addConstructor(parent: SymbolNode, declaration: StaticCsharpConstructor, namespaceName = ""): SymbolNode {
    const qualifiedName = parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "method", declarationOrdinal }), name: declaration.name, qualifiedName, kind: "method", filePath: input.filePath, range: rangeForNode(declaration.node), isExported: declaration.isExported, declarationOrdinal };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    csharpCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: declaration.name, namespaceName, callableKind: "constructor", ownerTypeName: parent.name, ownerTypeId: parent.id, parameterCount: declaration.parameterCount ?? -1, requiredParameterCount: declaration.requiredParameterCount ?? -1, parameterTypeNames: declaration.parameterTypeNames, isStatic: false, isExported: declaration.isExported, range: symbol.range });
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
    csharpCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: declaration.name, namespaceName: "", callableKind: "function", parameterCount: declaration.parameterCount ?? -1, requiredParameterCount: declaration.requiredParameterCount ?? -1, parameterTypeNames: declaration.parameterTypeNames, ...(declaration.returnTypeName === null ? {} : { returnTypeName: declaration.returnTypeName }), isStatic: true, isExported: declaration.isExported, range: symbol.range });
    return symbol;
  }

  function recordCsharpBody(
    source: SymbolNode,
    declaration: { readonly node: CsharpSyntaxNode },
    body: CsharpSyntaxNode
  ): void {
    if (hasCsharpPreprocessing(body)) return;
    const collected = collectCsharpCalls(body, declaration);
    for (const call of collected.calls) {
      const range = rangeForNode(call.node);
      csharpCalls.push({
        sourceId: source.id,
        filePath: input.filePath,
        referenceName: call.name,
        callKind: call.callKind,
        ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }),
        ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }),
        ...(call.receiverIsType === undefined ? {} : { receiverIsType: call.receiverIsType }),
        argumentCount: call.argumentCount,
        range
      });
    }
    for (const instantiation of collected.instantiations) {
      csharpInstantiations.push({
        sourceId: source.id,
        filePath: input.filePath,
        typeName: instantiation.typeName,
        argumentCount: instantiation.argumentCount,
        range: rangeForNode(instantiation.node)
      });
    }
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
    const declarationEntries = csharpDeclarationEntries(root);
    for (const usingNode of directChildren(root).filter((node) => node.kind() === "using_directive" || node.kind() === "global_using_directive")) {
      const raw = nodeText(usingNode).replace(/\s+/gu, " ").trim();
      const match = /^(?:global\s+)?using\s+(static\s+)?([A-Za-z_][A-Za-z0-9_.]*)(?:\s*=\s*[A-Za-z_][A-Za-z0-9_.]*)?\s*;$/u.exec(raw);
      if (match === null || match[2] === undefined) continue;
      csharpUsings.push({ sourceId: fileNode.id, filePath: input.filePath, importedPath: match[2], isStatic: match[1] !== undefined, isAlias: raw.includes("="), range: rangeForNode(usingNode) });
    }
    for (const namespaceName of [...new Set(declarationEntries.map((entry) => entry.namespaceName).filter((name) => name !== ""))].sort()) {
      addNamespace(namespaceName);
    }
    const types = declarationEntries
      .filter((entry) => entry.node.kind() === "class_declaration" || entry.node.kind() === "interface_declaration")
      .map((entry) => staticCsharpType(entry.node, entry.namespaceName))
      .filter((candidate): candidate is StaticCsharpType => candidate !== null);
    const extraTypes = declarationEntries
      .map((entry) => staticCsharpExtraType(entry.node, entry.namespaceName))
      .filter((candidate): candidate is StaticCsharpExtraType => candidate !== null);
    const hasMvcImport = hasDirectMvcImport(root);
    const hasRazorPagesImport = hasDirectRazorPagesImport(root);
    const hasPreprocessing = hasCsharpPreprocessing(root);
    const hasAmbiguousUsing = hasAmbiguousCsharpUsing(root);
    const hasLocalPageModelDeclaration = types.some(
      (candidate) => candidate.kind === "class" && candidate.name === "PageModel"
    );
    const staticClassMethods: Array<{
      readonly declaration: StaticCsharpMethod;
      readonly symbol: SymbolNode;
      readonly type: StaticCsharpType;
      readonly typeSymbol: SymbolNode;
    }> = [];

    for (const type of types) {
      const typeSymbol = addType(type);
      const directClassFact =
        type.kind === "class"
          ? {
              classId: typeSymbol.id,
              isPartial: type.isPartial,
              isRazorPageModel:
                !type.isPartial &&
                !hasPreprocessing &&
                !hasAmbiguousUsing &&
                !hasLocalPageModelDeclaration &&
                (type.baseName === "Microsoft.AspNetCore.Mvc.RazorPages.PageModel" ||
                  (type.baseName === "PageModel" && hasRazorPagesImport)),
              razorPageHandlerMethods: [] as Array<{ handlerName: string; methodId: string }>
            }
          : null;
      const controllerPath = staticControllerPath(type, hasMvcImport);
      const methods = directChildren(type.body)
        .map((node) => staticCsharpMethod(node))
        .filter((candidate): candidate is StaticCsharpMethod => candidate !== null);
      for (const methodDeclaration of methods) {
        const methodSymbol = addMethod(typeSymbol, methodDeclaration, type.namespaceName);
        if (methodDeclaration.isOverride) {
          csharpOverrides.push({ sourceId: methodSymbol.id, filePath: input.filePath, methodName: methodDeclaration.name, ownerTypeName: type.name, range: methodSymbol.range });
        }
        const handlerName =
          directClassFact?.isRazorPageModel === true
            ? razorPageHandlerName(methodDeclaration)
            : null;
        if (handlerName !== null && directClassFact !== null) {
          directClassFact.razorPageHandlerMethods.push({ handlerName, methodId: methodSymbol.id });
        }
        staticClassMethods.push({ declaration: methodDeclaration, symbol: methodSymbol, type, typeSymbol });
        if (methodDeclaration.body !== null) recordCsharpBody(methodSymbol, methodDeclaration, methodDeclaration.body);
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
      if (directClassFact !== null) {
        csharpDirectClassFacts.push(directClassFact);
      }
      for (const child of directChildren(type.body)) {
        const constructor = staticCsharpConstructor(child);
        if (constructor !== null) {
          const constructorSymbol = addConstructor(typeSymbol, constructor, type.namespaceName);
          const body = directChildren(constructor.node).find((candidate) => candidate.kind() === "block");
          if (body !== undefined) recordCsharpBody(constructorSymbol, constructor, body);
        }
      }
    }

    for (const extra of extraTypes) addExtraType(extra);

    if (!hasAmbiguousUsing && !hasPreprocessing) {
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
            !candidates[0].declaration.isStatic ||
            candidates[0].declaration.parameterCount === null ||
            candidates[0].declaration.parameterCount !== call.argumentCount
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
      const body = directChildren(functionDeclaration.node).find((child) => child.kind() === "block" || child.kind() === "arrow_expression_clause");
      if (body !== undefined) recordCsharpBody(symbol, functionDeclaration, body);
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
    },
    csharpDirectClassFacts,
    csharpFacts: {
      namespaceName: "",
      types: csharpTypes,
      callables: csharpCallables,
      usings: csharpUsings,
      calls: csharpCalls,
      instantiations: csharpInstantiations,
      ...(csharpHeritage.length === 0 ? {} : { heritage: csharpHeritage }),
      ...(csharpOverrides.length === 0 ? {} : { overrides: csharpOverrides })
    } satisfies CsharpFacts
  };
}

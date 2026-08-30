import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SwiftObjectiveCExtensionMethodFact,
  type SwiftObjectiveCMethodFact,
  type SwiftObjectiveCTypeFact,
  type SwiftCallableFact,
  type SwiftCallFact,
  type SwiftFacts,
  type SwiftHeritageFact,
  type SwiftImportFact,
  type SwiftInstantiationFact,
  type SwiftOverrideFact,
  type SwiftTypeFact,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

/** Swift uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface SwiftExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "swift";
}

type SwiftSyntaxNode = SgNode;

interface StaticSwiftType {
  readonly kind: "class" | "interface";
  readonly declarationKind: "class" | "struct" | "protocol" | "actor";
  readonly name: string;
  readonly node: SwiftSyntaxNode;
  readonly body: SwiftSyntaxNode;
  /** Explicit Objective-C runtime class name, never inferred from the Swift name. */
  readonly objcClassName: string | null;
  readonly isExported: boolean;
  readonly isDecoratorTainted: boolean;
}

interface StaticSwiftEnum {
  readonly name: string;
  readonly node: SwiftSyntaxNode;
  readonly isExported: boolean;
}

interface StaticSwiftTypeAlias {
  readonly name: string;
  readonly node: SwiftSyntaxNode;
  readonly targetName: string | null;
  readonly isExported: boolean;
}

interface StaticSwiftExtension {
  /** A single direct, unqualified type identifier; parameterized target syntax is excluded. */
  readonly extendedTypeName: string;
  readonly node: SwiftSyntaxNode;
  readonly body: SwiftSyntaxNode;
  readonly isExported: boolean;
}

interface StaticSwiftFunction {
  readonly name: string;
  readonly nameNode: SwiftSyntaxNode;
  readonly node: SwiftSyntaxNode;
  readonly body: SwiftSyntaxNode | null;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName: string | null;
  readonly isExported: boolean;
  readonly isOverride: boolean;
  /** Explicit Objective-C selector, never inferred from the Swift declaration. */
  readonly objcSelector: string | null;
}

interface StaticSwiftInitializer {
  readonly node: SwiftSyntaxNode;
  readonly body: SwiftSyntaxNode | null;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames: readonly string[];
  readonly isExported: boolean;
}

interface StaticSwiftPlainCall {
  readonly name: string;
  readonly nameNode: SwiftSyntaxNode;
  readonly node: SwiftSyntaxNode;
}

interface StaticVaporRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: SwiftSyntaxNode;
}

interface StaticSwiftMemberCall {
  readonly receiverName: string;
  readonly name: string;
  readonly suffix: SwiftSyntaxNode;
}

interface StaticSwiftCall {
  readonly name: string;
  readonly nameNode: SwiftSyntaxNode;
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly callKind: "direct" | "member";
  readonly argumentCount: number;
  readonly node: SwiftSyntaxNode;
}

const VAPOR_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS"
};

const VAPOR_IMPORT = "Vapor";

function directChildren(node: SwiftSyntaxNode): readonly SwiftSyntaxNode[] {
  return node.children();
}

function nodeText(node: SwiftSyntaxNode): string {
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

function rangeForNode(node: SwiftSyntaxNode): SourceRange {
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

function hasSyntaxError(node: SwiftSyntaxNode): boolean {
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "source_file" && nodeText(node).length === 0) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function identifierText(node: SwiftSyntaxNode): string | null {
  const rawValue = nodeText(node);
  const value =
    rawValue.length >= 3 && rawValue[0] === "`" && rawValue.at(-1) === "`"
      ? rawValue.slice(1, -1)
      : rawValue;
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticSwiftDeclarationIsExported(node: SwiftSyntaxNode): boolean {
  const modifiers = directChildren(node)
    .filter((child) => child.kind() === "modifiers")
    .flatMap((child) => directChildren(child));
  const visibility = modifiers.find((modifier) => modifier.kind() === "visibility_modifier");
  const value = visibility === undefined ? null : nodeText(visibility);
  return value === "public" || value === "open";
}

function staticSwiftHasAttribute(node: SwiftSyntaxNode): boolean {
  return directChildren(node)
    .filter((child) => child.kind() === "modifiers")
    .flatMap((child) => directChildren(child))
    .some((modifier) => modifier.kind() === "attribute");
}

function staticSwiftParameterShape(node: SwiftSyntaxNode): {
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
} {
  const children = directChildren(node);
  const parameters = children.filter((child) => child.kind() === "parameter");
  const opening = children.findIndex((child) => child.kind() === "(");
  const closing = children.findIndex((child, index) => index > opening && child.kind() === ")");
  const signature = opening >= 0 && closing > opening
    ? children.slice(opening + 1, closing).map((child) => nodeText(child)).join("")
    : "";
  const hasUnsupportedParameter = parameters.some((parameter) => {
    const text = nodeText(parameter);
    return text.includes("...") || text.includes("some ") || text.includes("any ");
  });
  const hasDefault = signature.includes("=");
  return {
    parameterCount: parameters.length,
    requiredParameterCount:
      hasUnsupportedParameter || hasDefault ? -1 : parameters.length
  };
}

function staticSwiftOverrideModifier(node: SwiftSyntaxNode): boolean {
  return directChildren(node)
    .filter((child) => child.kind() === "modifiers")
    .flatMap((child) => directChildren(child))
    .some((modifier) => modifier.kind() === "member_modifier" && nodeText(modifier) === "override");
}

function staticSwiftSimpleUserType(node: SwiftSyntaxNode | undefined): string | null {
  if (node?.kind() !== "user_type") {
    return null;
  }
  const children = directChildren(node);
  const identifiers = children.filter((child) => child.kind() === "type_identifier");
  return identifiers.length === 1 && children.length === 1
    ? identifierText(identifiers[0]!)
    : null;
}

function staticSwiftParameterTypeNames(node: SwiftSyntaxNode): readonly string[] {
  return directChildren(node)
    .filter((child) => child.kind() === "parameter")
    .map((parameter) => {
      const colonIndex = directChildren(parameter).findIndex((child) => child.kind() === ":");
      return staticSwiftSimpleUserType(colonIndex < 0 ? undefined : directChildren(parameter)[colonIndex + 1]);
    })
    .filter((name): name is string => name !== null);
}

function staticSwiftReturnTypeName(node: SwiftSyntaxNode): string | null {
  const children = directChildren(node);
  const arrowIndex = children.findIndex((child) => child.kind() === "->");
  return arrowIndex < 0 ? null : staticSwiftSimpleUserType(children[arrowIndex + 1]);
}

function directSwiftObjectiveCAttributes(node: SwiftSyntaxNode): readonly SwiftSyntaxNode[] {
  return directChildren(node)
    .filter((child) => child.kind() === "modifiers")
    .flatMap((modifiers) => directChildren(modifiers))
    .filter((attribute) => {
      const children = directChildren(attribute);
      return (
        attribute.kind() === "attribute" &&
        children[0]?.kind() === "@" &&
        children[1]?.kind() === "user_type" &&
        nodeText(children[1]) === "objc"
      );
    });
}

/**
 * Returns only a syntactically explicit `@objc(...)` argument made from bare
 * selector labels and colons. Bare `@objc` deliberately remains unproven.
 */
function directSwiftObjectiveCAttributeParts(attribute: SwiftSyntaxNode): readonly string[] | null {
  const children = directChildren(attribute);
  const opening = children[2];
  const closing = children.at(-1);
  if (
    opening?.kind() !== "(" ||
    closing?.kind() !== ")" ||
    children.length < 5
  ) {
    return null;
  }

  const parts: string[] = [];
  for (const child of children.slice(3, -1)) {
    if (child.kind() === "simple_identifier") {
      const identifier = identifierText(child);
      if (identifier === null) {
        return null;
      }
      parts.push(identifier);
      continue;
    }
    if (nodeText(child) === ":") {
      parts.push(":");
      continue;
    }
    return null;
  }
  return parts.length === 0 ? null : parts;
}

function directSwiftObjectiveCClassName(node: SwiftSyntaxNode): string | null {
  const attributes = directSwiftObjectiveCAttributes(node);
  if (attributes.length !== 1 || attributes[0] === undefined) {
    return null;
  }
  const parts = directSwiftObjectiveCAttributeParts(attributes[0]);
  return parts?.length === 1 && parts[0] !== ":" ? parts[0] ?? null : null;
}

function directSwiftObjectiveCSelector(node: SwiftSyntaxNode): string | null {
  const attributes = directSwiftObjectiveCAttributes(node);
  if (attributes.length !== 1 || attributes[0] === undefined) {
    return null;
  }
  const parts = directSwiftObjectiveCAttributeParts(attributes[0]);
  if (parts === null || parts[0] === ":") {
    return null;
  }
  if (parts.length === 1) {
    return parts[0] ?? null;
  }
  if (parts.length % 2 !== 0) {
    return null;
  }
  for (let index = 0; index < parts.length; index += 1) {
    if ((index % 2 === 0 && parts[index] === ":") || (index % 2 === 1 && parts[index] !== ":")) {
      return null;
    }
  }
  return parts.join("");
}

function staticSwiftType(node: SwiftSyntaxNode): StaticSwiftType | null {
  if (node.kind() === "class_declaration") {
    const children = directChildren(node);
    const declarationKind = children.find(
      (child) => child.kind() === "class" || child.kind() === "struct" || child.kind() === "actor"
    );
    const typeIdentifiers = children.filter((child) => child.kind() === "type_identifier");
    const nameNode = typeIdentifiers[0];
    const body = children.find((child) => child.kind() === "class_body");
    const name = nameNode === undefined ? null : identifierText(nameNode);
    if (
      declarationKind === undefined ||
      name === null ||
      body === undefined ||
      typeIdentifiers.length !== 1
    ) {
      return null;
    }
    return {
      kind: "class",
      declarationKind: declarationKind.kind() as "class" | "struct" | "actor",
      name,
      node,
      body,
      objcClassName: declarationKind.kind() === "class" ? directSwiftObjectiveCClassName(node) : null,
      isExported: staticSwiftDeclarationIsExported(node),
      isDecoratorTainted: staticSwiftHasAttribute(node)
    };
  }

  if (node.kind() === "protocol_declaration") {
    const children = directChildren(node);
    const protocols = children.filter((child) => child.kind() === "protocol");
    const typeIdentifiers = children.filter((child) => child.kind() === "type_identifier");
    const nameNode = typeIdentifiers[0];
    const body = children.find((child) => child.kind() === "protocol_body");
    const name = nameNode === undefined ? null : identifierText(nameNode);
    if (protocols.length !== 1 || name === null || body === undefined || typeIdentifiers.length !== 1) {
      return null;
    }
    return {
      kind: "interface",
      declarationKind: "protocol",
      name,
      node,
      body,
      objcClassName: null,
      isExported: staticSwiftDeclarationIsExported(node),
      isDecoratorTainted: staticSwiftHasAttribute(node)
    };
  }

  return null;
}

function staticSwiftEnum(node: SwiftSyntaxNode): StaticSwiftEnum | null {
  if (node.kind() !== "class_declaration") {
    return null;
  }
  const children = directChildren(node);
  const enumKeyword = children.find((child) => child.kind() === "enum");
  const nameNode = children.find((child) => child.kind() === "type_identifier");
  const body = children.find((child) => child.kind() === "enum_class_body");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return enumKeyword === undefined || name === null || body === undefined
    ? null
    : { name, node, isExported: staticSwiftDeclarationIsExported(node) };
}

function staticSwiftTypeAlias(node: SwiftSyntaxNode): StaticSwiftTypeAlias | null {
  if (node.kind() !== "typealias_declaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.kind() === "type_identifier");
  const target = children.find((child) => child.kind() === "user_type");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null
    ? null
    : {
        name,
        node,
        targetName: staticSwiftSimpleUserType(target),
        isExported: staticSwiftDeclarationIsExported(node)
      };
}

/**
 * Accepts a direct `extension TypeName { ... }` declaration as syntax only.
 * It deliberately does not assert that the target type is local, inherited,
 * or identical to a declaration in another file.
 */
function staticSwiftExtension(node: SwiftSyntaxNode): StaticSwiftExtension | null {
  if (node.kind() !== "class_declaration") {
    return null;
  }
  const children = directChildren(node);
  const extensionKeywords = children.filter((child) => child.kind() === "extension");
  const userTypes = children.filter((child) => child.kind() === "user_type");
  const target = userTypes[0];
  const body = children.find((child) => child.kind() === "class_body");
  if (
    extensionKeywords.length !== 1 ||
    target === undefined ||
    body === undefined ||
    userTypes.length !== 1
  ) {
    return null;
  }
  const targetChildren = directChildren(target);
  const typeIdentifiers = targetChildren.filter((child) => child.kind() === "type_identifier");
  const nameNode = typeIdentifiers[0];
  const extendedTypeName = nameNode === undefined ? null : identifierText(nameNode);
  if (
    extendedTypeName === null ||
    typeIdentifiers.length !== 1 ||
    targetChildren.length !== 1
  ) {
    return null;
  }
  return { extendedTypeName, node, body, isExported: staticSwiftDeclarationIsExported(node) };
}

function staticSwiftFunction(node: SwiftSyntaxNode): StaticSwiftFunction | null {
  if (
    node.kind() !== "function_declaration" &&
    node.kind() !== "protocol_function_declaration"
  ) {
    return null;
  }
  const identifiers = directChildren(node).filter((child) => child.kind() === "simple_identifier");
  const nameNode = identifiers[0];
  const name = nameNode === undefined || identifiers.length !== 1 ? null : identifierText(nameNode);
  if (name === null) {
    return null;
  }
  const body = directChildren(node).find((child) => child.kind() === "function_body") ?? null;
  const parameterShape = staticSwiftParameterShape(node);
  return {
    name,
    nameNode: nameNode!,
    node,
    body,
    parameterCount: parameterShape.parameterCount,
    requiredParameterCount: parameterShape.requiredParameterCount,
    parameterTypeNames: staticSwiftParameterTypeNames(node),
    returnTypeName: staticSwiftReturnTypeName(node),
    isExported: staticSwiftDeclarationIsExported(node),
    isOverride: staticSwiftOverrideModifier(node),
    objcSelector:
      node.kind() === "function_declaration" ? directSwiftObjectiveCSelector(node) : null
  };
}

function staticSwiftInitializer(node: SwiftSyntaxNode): StaticSwiftInitializer | null {
  if (node.kind() !== "init_declaration") {
    return null;
  }
  const parameterShape = staticSwiftParameterShape(node);
  return {
    node,
    body: directChildren(node).find((child) => child.kind() === "function_body") ?? null,
    parameterCount: parameterShape.parameterCount,
    requiredParameterCount: parameterShape.requiredParameterCount,
    parameterTypeNames: staticSwiftParameterTypeNames(node),
    isExported: staticSwiftDeclarationIsExported(node)
  };
}

function syntaxNodeKey(node: SwiftSyntaxNode): string {
  const range = node.range();
  return `${node.kind()}:${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`;
}

function isFilePrivateZeroParameterFunction(declaration: StaticSwiftFunction): boolean {
  if (declaration.body === null) {
    return false;
  }
  const children = directChildren(declaration.node);
  const visibilities = children
    .filter((child) => child.kind() === "modifiers")
    .flatMap((modifiers) => directChildren(modifiers))
    .filter((modifier) => modifier.kind() === "visibility_modifier")
    .map((modifier) => nodeText(modifier));
  return (
    visibilities.length === 1 &&
    (visibilities[0] === "private" || visibilities[0] === "fileprivate") &&
    !children.some(
      (child) =>
        child.kind() === "parameter" ||
        child.kind() === "type_parameters" ||
        child.kind() === "generic_parameter_clause"
    )
  );
}

function staticSwiftPlainEmptyCall(node: SwiftSyntaxNode): StaticSwiftPlainCall | null {
  if (node.kind() !== "call_expression") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children[0];
  const suffix = children[1];
  if (
    nameNode?.kind() !== "simple_identifier" ||
    suffix?.kind() !== "call_suffix" ||
    children.length !== 2
  ) {
    return null;
  }
  const name = identifierText(nameNode);
  const suffixChildren = directChildren(suffix);
  const argumentsNode = suffixChildren[0];
  if (
    name === null ||
    argumentsNode?.kind() !== "value_arguments" ||
    suffixChildren.length !== 1
  ) {
    return null;
  }
  const argumentChildren = directChildren(argumentsNode);
  return argumentChildren.length === 2 &&
    argumentChildren[0]?.kind() === "(" &&
    argumentChildren[1]?.kind() === ")"
    ? { name, nameNode, node }
    : null;
}

function directSwiftPlainCalls(body: SwiftSyntaxNode): readonly StaticSwiftPlainCall[] {
  const calls: StaticSwiftPlainCall[] = [];
  function visit(node: SwiftSyntaxNode, isRoot: boolean): void {
    if (
      !isRoot &&
      (node.kind() === "function_declaration" ||
        node.kind() === "lambda_literal" ||
        node.kind() === "class_declaration" ||
        node.kind() === "protocol_declaration")
    ) {
      return;
    }
    const call = staticSwiftPlainEmptyCall(node);
    if (call !== null) {
      calls.push(call);
      return;
    }
    for (const child of directChildren(node)) {
      visit(child, false);
    }
  }
  visit(body, true);
  return calls;
}

function hasNamedIdentifierExcept(
  root: SwiftSyntaxNode,
  name: string,
  allowedNodeKeys: ReadonlySet<string>
): boolean {
  if (
    (root.kind() === "simple_identifier" || root.kind() === "type_identifier") &&
    identifierText(root) === name &&
    !allowedNodeKeys.has(syntaxNodeKey(root))
  ) {
    return true;
  }
  return directChildren(root).some((child) => hasNamedIdentifierExcept(child, name, allowedNodeKeys));
}

function hasTopLevelNameCompetition(
  topLevel: readonly SwiftSyntaxNode[],
  target: StaticSwiftFunction
): boolean {
  const targetKey = syntaxNodeKey(target.node);
  return topLevel.some((node) => {
    if (syntaxNodeKey(node) === targetKey || node.kind() === "function_declaration") {
      return false;
    }
    return hasNamedIdentifierExcept(node, target.name, new Set<string>());
  });
}

function hasDirectVaporImport(root: SwiftSyntaxNode): boolean {
  return directChildren(root).some(
    (node) =>
      node.kind() === "import_declaration" &&
      nodeText(node).replace(/\s+/gu, " ") === "import " + VAPOR_IMPORT
  );
}

function staticDirectMemberCall(node: SwiftSyntaxNode): StaticSwiftMemberCall | null {
  if (node.kind() !== "call_expression") {
    return null;
  }
  const children = directChildren(node);
  const navigation = children[0];
  const suffix = children[1];
  if (
    navigation?.kind() !== "navigation_expression" ||
    suffix?.kind() !== "call_suffix" ||
    children.length !== 2
  ) {
    return null;
  }
  const navigationChildren = directChildren(navigation);
  const receiver = navigationChildren[0];
  const memberSuffix = navigationChildren[1];
  if (
    receiver === undefined ||
    memberSuffix?.kind() !== "navigation_suffix" ||
    navigationChildren.length !== 2
  ) {
    return null;
  }
  const receiverName = identifierText(receiver);
  const suffixChildren = directChildren(memberSuffix);
  const nameNode = suffixChildren.find((child) => child.kind() === "simple_identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (
    receiverName === null ||
    name === null ||
    suffixChildren.filter((child) => child.kind() === "simple_identifier").length !== 1
  ) {
    return null;
  }
  return { receiverName, name, suffix };
}

function staticValueArguments(
  callSuffix: SwiftSyntaxNode
): readonly SwiftSyntaxNode[] | null {
  const suffixChildren = directChildren(callSuffix);
  const valueArguments = suffixChildren[0];
  if (valueArguments?.kind() !== "value_arguments" || suffixChildren.length !== 1) {
    return null;
  }
  return directChildren(valueArguments).filter((child) => child.kind() === "value_argument");
}

function staticSwiftCall(node: SwiftSyntaxNode): StaticSwiftCall | null {
  if (node.kind() !== "call_expression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children[0];
  const suffix = children[1];
  if (suffix?.kind() !== "call_suffix" || children.length !== 2) {
    return null;
  }
  const arguments_ = staticValueArguments(suffix);
  if (arguments_ === null) {
    return null;
  }
  if (callee?.kind() === "simple_identifier") {
    const name = identifierText(callee);
    return name === null
      ? null
      : {
          name,
          nameNode: callee,
          callKind: "direct",
          argumentCount: arguments_.length,
          node
        };
  }
  if (callee?.kind() !== "navigation_expression") {
    return null;
  }
  const navigationChildren = directChildren(callee);
  const receiver = navigationChildren[0];
  const memberSuffix = navigationChildren[1];
  if (
    receiver === undefined ||
    memberSuffix?.kind() !== "navigation_suffix" ||
    navigationChildren.length !== 2
  ) {
    return null;
  }
  const receiverName = receiver.kind() === "self_expression" ? "self" : identifierText(receiver);
  const memberIdentifiers = directChildren(memberSuffix).filter(
    (child) => child.kind() === "simple_identifier"
  );
  const nameNode = memberIdentifiers[0];
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (receiverName === null || name === null || memberIdentifiers.length !== 1) {
    return null;
  }
  return {
    name,
    nameNode: nameNode!,
    receiverName,
    callKind: "member",
    argumentCount: arguments_.length,
    node
  };
}

function staticSwiftTypeNameFromParameter(parameter: SwiftSyntaxNode): {
  readonly name: string;
  readonly typeName: string;
} | null {
  const children = directChildren(parameter);
  const identifiers = children.filter((child) => child.kind() === "simple_identifier");
  const colonIndex = children.findIndex((child) => child.kind() === ":");
  const type = colonIndex < 0 ? undefined : children[colonIndex + 1];
  const nameNode = identifiers.at(-1);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const typeName = staticSwiftSimpleUserType(type);
  return name === null || typeName === null ? null : { name, typeName };
}

function staticSwiftParameterBindings(node: SwiftSyntaxNode): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  for (const parameter of directChildren(node).filter((child) => child.kind() === "parameter")) {
    const binding = staticSwiftTypeNameFromParameter(parameter);
    if (binding !== null) {
      bindings.set(binding.name, binding.typeName);
    }
  }
  return bindings;
}

function staticSwiftTypedLocalBindings(body: SwiftSyntaxNode): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  function visit(node: SwiftSyntaxNode, isRoot: boolean): void {
    if (
      !isRoot &&
      (node.kind() === "function_declaration" ||
        node.kind() === "init_declaration" ||
        node.kind() === "lambda_literal" ||
        node.kind() === "class_declaration" ||
        node.kind() === "protocol_declaration")
    ) {
      return;
    }
    if (node.kind() === "property_declaration") {
      const children = directChildren(node);
      const valueBinding = children.find((child) => child.kind() === "value_binding_pattern");
      const pattern = children.find((child) => child.kind() === "pattern");
      const annotation = children.find((child) => child.kind() === "type_annotation");
      const patternChildren = pattern === undefined ? [] : directChildren(pattern);
      const nameNode = patternChildren.find((child) => child.kind() === "simple_identifier");
      const name = nameNode === undefined ? null : identifierText(nameNode);
      const typeChildren = annotation === undefined ? [] : directChildren(annotation);
      const typeName = staticSwiftSimpleUserType(typeChildren.find((child) => child.kind() === "user_type"));
      if (valueBinding !== undefined && nodeText(valueBinding) === "let" && name !== null && typeName !== null) {
        bindings.set(name, typeName);
      }
    }
    for (const child of directChildren(node)) {
      visit(child, false);
    }
  }
  visit(body, true);
  return bindings;
}

function staticSwiftCallsInBody(
  body: SwiftSyntaxNode,
  ownerTypeName: string | null,
  declarationNode: SwiftSyntaxNode
): readonly StaticSwiftCall[] {
  const bindings = new Map(staticSwiftParameterBindings(declarationNode));
  for (const [name, typeName] of staticSwiftTypedLocalBindings(body)) {
    if (!bindings.has(name)) {
      bindings.set(name, typeName);
    }
  }
  const bodyText = nodeText(body);
  const escapedOrMutated = new Set<string>();
  for (const name of bindings.keys()) {
    const escaped = new RegExp(`(?:\\breturn\\s+${name}\\b|\\b${name}\\s*=|\\([^)]*\\b${name}\\b[^)]*\\))`, "u").test(bodyText);
    if (escaped) {
      escapedOrMutated.add(name);
    }
  }
  const calls: StaticSwiftCall[] = [];
  function visit(node: SwiftSyntaxNode, isRoot: boolean): void {
    if (
      !isRoot &&
      (node.kind() === "function_declaration" ||
        node.kind() === "init_declaration" ||
        node.kind() === "lambda_literal" ||
        node.kind() === "class_declaration" ||
        node.kind() === "protocol_declaration")
    ) {
      return;
    }
    const call = staticSwiftCall(node);
    if (call !== null) {
      if (call.callKind === "member" && call.receiverName !== undefined && escapedOrMutated.has(call.receiverName)) {
        for (const child of directChildren(node)) {
          visit(child, false);
        }
        return;
      }
      const receiverTypeName = call.callKind === "member"
        ? call.receiverName === "self"
          ? ownerTypeName ?? undefined
          : bindings.get(call.receiverName ?? "")
        : undefined;
      calls.push(receiverTypeName === undefined ? call : { ...call, receiverTypeName });
    }
    for (const child of directChildren(node)) {
      visit(child, false);
    }
  }
  visit(body, true);
  return calls;
}

function staticSwiftHeritageNames(node: SwiftSyntaxNode): readonly string[] {
  return directChildren(node)
    .filter((child) => child.kind() === "inheritance_specifier")
    .map((child) => staticSwiftSimpleUserType(directChildren(child)[0]))
    .filter((name): name is string => name !== null);
}

function staticPlainVaporSegment(node: SwiftSyntaxNode): string | null {
  if (node.kind() !== "value_argument") {
    return null;
  }
  const children = directChildren(node);
  const stringLiteral = children[0];
  if (stringLiteral?.kind() !== "line_string_literal" || children.length !== 1) {
    return null;
  }
  const value = nodeText(stringLiteral);
  if (
    value.length < 3 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticVaporPath(segments: readonly string[]): string | null {
  if (segments.some((segment) => segment.length === 0 || segment.includes("//"))) {
    return null;
  }
  if (segments.length === 0) {
    return "/";
  }
  const joined = segments.join("/");
  const path = joined.startsWith("/") ? joined : "/" + joined;
  return path.includes("//") ? null : path;
}

function staticUseHandler(node: SwiftSyntaxNode): string | null {
  if (node.kind() !== "value_argument") {
    return null;
  }
  const children = directChildren(node);
  const label = children[0];
  const colon = children[1];
  const handler = children[2];
  if (
    label?.kind() !== "value_argument_label" ||
    nodeText(label) !== "use" ||
    colon?.kind() !== ":" ||
    handler === undefined ||
    children.length !== 3
  ) {
    return null;
  }
  return identifierText(handler);
}

function staticVaporRoute(node: SwiftSyntaxNode): StaticVaporRoute | null {
  const call = staticDirectMemberCall(node);
  const method = call === null ? undefined : VAPOR_ROUTE_METHODS[call.name];
  if (call === null || call.receiverName !== "app" || method === undefined) {
    return null;
  }
  const arguments_ = staticValueArguments(call.suffix);
  if (arguments_ === null || arguments_.length === 0) {
    return null;
  }
  const handlerArgument = arguments_.at(-1);
  if (handlerArgument === undefined) {
    return null;
  }
  const handlerName = staticUseHandler(handlerArgument);
  const segments = arguments_
    .slice(0, -1)
    .map((argument) => staticPlainVaporSegment(argument));
  if (handlerName === null || segments.some((segment) => segment === null)) {
    return null;
  }
  const path = staticVaporPath(segments as readonly string[]);
  return path === null ? null : { method, path, handlerName, node };
}

function isDirectRoutesApplicationFunction(functionDeclaration: StaticSwiftFunction): boolean {
  if (functionDeclaration.name !== "routes") {
    return false;
  }
  const parameters = directChildren(functionDeclaration.node).filter(
    (child) => child.kind() === "parameter"
  );
  const parameter = parameters[0];
  if (parameter === undefined || parameters.length !== 1) {
    return false;
  }
  const children = directChildren(parameter);
  const externalName = children[0];
  const localName = children[1];
  const colon = children[2];
  const type = children[3];
  return (
    externalName !== undefined &&
    nodeText(externalName) === "_" &&
    localName !== undefined &&
    identifierText(localName) === "app" &&
    colon?.kind() === ":" &&
    type?.kind() === "user_type" &&
    nodeText(type) === "Application" &&
    children.length === 4
  );
}

function staticVaporRouteStatements(
  functionDeclaration: StaticSwiftFunction
): readonly SwiftSyntaxNode[] {
  if (!isDirectRoutesApplicationFunction(functionDeclaration) || functionDeclaration.body === null) {
    return [];
  }
  const bodyStatements = directChildren(functionDeclaration.body).filter(
    (child) => child.kind() === "statements"
  );
  if (bodyStatements.length !== 1 || bodyStatements[0] === undefined) {
    return [];
  }
  return directChildren(bodyStatements[0]);
}

export function extractSwiftFileFacts(input: SwiftExtractFileFactsInput): ArtifactFacts {
  const vaporCapability = frameworkCapability("vapor");
  if (!vaporCapability.languages.includes(input.language)) {
    throw new Error("Vapor framework extraction was invoked for an unsupported source language.");
  }

  const root = parse("swift", input.sourceText).root();
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const swiftObjectiveCMethods: SwiftObjectiveCMethodFact[] = [];
  const swiftObjectiveCTypes: SwiftObjectiveCTypeFact[] = [];
  const swiftObjectiveCExtensionMethods: SwiftObjectiveCExtensionMethodFact[] = [];
  const swiftTypes: SwiftTypeFact[] = [];
  const swiftCallables: SwiftCallableFact[] = [];
  const swiftImports: SwiftImportFact[] = [];
  const swiftCalls: SwiftCallFact[] = [];
  const swiftInstantiations: SwiftInstantiationFact[] = [];
  const swiftHeritage: SwiftHeritageFact[] = [];
  const swiftOverrides: SwiftOverrideFact[] = [];
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: SwiftSyntaxNode): void {
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

  function addDirectCall(
    caller: SymbolNode,
    target: SymbolNode,
    call: StaticSwiftPlainCall
  ): void {
    const range = rangeForNode(call.node);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: call.name
      }),
      sourceId: caller.id,
      targetId: target.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.name,
      evidence: {
        ruleId: "syntax.swift.same-file.unique-file-private-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  function addType(declaration: StaticSwiftType): SymbolNode {
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
    swiftTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      moduleName: "",
      qualifiedTypePath: declaration.name,
      declarationKind: declaration.declarationKind,
      isExported: declaration.isExported,
      range: symbol.range,
      ...(declaration.isDecoratorTainted ? { isDecoratorTainted: true } : {})
    });
    for (const referenceName of staticSwiftHeritageNames(declaration.node)) {
      swiftHeritage.push({
        sourceId: symbol.id,
        filePath: input.filePath,
        referenceName,
        relationKind: "extends",
        sourceTypeKind: declaration.declarationKind,
        range: rangeForNode(declaration.node)
      });
    }
    return symbol;
  }

  function addExtraType(
    declaration: StaticSwiftEnum | StaticSwiftTypeAlias,
    declarationKind: "enum" | "typealias"
  ): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "type");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "type",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "type",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    const aliasTargetName = declarationKind === "typealias"
      ? (declaration as unknown as StaticSwiftTypeAlias).targetName
      : null;
    swiftTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      moduleName: "",
      qualifiedTypePath: declaration.name,
      declarationKind,
      isExported: declaration.isExported,
      range: symbol.range,
      ...(aliasTargetName === null ? {} : { aliasTargetName: aliasTargetName ?? undefined })
    });
    return symbol;
  }

  /**
   * `SymbolKind` has no extension category. Keep the exact syntax container
   * visibly named as an extension instead of claiming that its members are
   * lexically contained by the extended type or that it is an inheritance edge.
   */
  function addExtension(declaration: StaticSwiftExtension): SymbolNode {
    const qualifiedName = input.filePath + "#extension:" + declaration.extendedTypeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: "extension " + declaration.extendedTypeName,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticSwiftFunction): SymbolNode {
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
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    const extensionOwner = parent.name.startsWith("extension ")
      ? parent.name.slice("extension ".length)
      : undefined;
    swiftCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      moduleName: "",
      callableKind: extensionOwner === undefined ? "method" : "extension",
      ...(extensionOwner === undefined
        ? { ownerTypeName: parent.name, ownerTypeId: parent.id }
        : { ownerTypeName: extensionOwner, receiverTypeName: extensionOwner }),
      parameterCount: declaration.parameterCount,
      requiredParameterCount: declaration.requiredParameterCount,
      parameterTypeNames: declaration.parameterTypeNames,
      ...(declaration.returnTypeName === null ? {} : { returnTypeName: declaration.returnTypeName }),
      isExported: declaration.isExported,
      ...(declaration.isOverride ? { isOverride: true } : {}) ,
      range: symbol.range
    });
    return symbol;
  }

  function addInitializer(parent: SymbolNode, declaration: StaticSwiftInitializer): SymbolNode {
    const qualifiedName = parent.qualifiedName + ".init";
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: "init",
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    swiftCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: "init",
      moduleName: "",
      callableKind: "initializer",
      ownerTypeName: parent.name,
      ownerTypeId: parent.id,
      parameterCount: declaration.parameterCount,
      requiredParameterCount: declaration.requiredParameterCount,
      parameterTypeNames: declaration.parameterTypeNames,
      isExported: declaration.isExported,
      range: symbol.range
    });
    return symbol;
  }

  function addFunction(declaration: StaticSwiftFunction): SymbolNode {
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
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    swiftCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      moduleName: "",
      callableKind: "function",
      parameterCount: declaration.parameterCount,
      requiredParameterCount: declaration.requiredParameterCount,
      parameterTypeNames: declaration.parameterTypeNames,
      ...(declaration.returnTypeName === null ? {} : { returnTypeName: declaration.returnTypeName }),
      isExported: declaration.isExported,
      ...(declaration.isOverride ? { isOverride: true } : {}),
      range: symbol.range
    });
    return symbol;
  }

  function addVaporRoute(routeFact: StaticVaporRoute, handler: SymbolNode): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = input.filePath + "#route:" + routeName;
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
    addContainment(fileNode, route, routeFact.node);
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
        ruleId:
          "framework.vapor.direct-routes-application.literal-segment-route.use.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const topLevelTypes = topLevel
      .map((node) => staticSwiftType(node))
      .filter((candidate): candidate is StaticSwiftType => candidate !== null);
    const topLevelEnums = topLevel
      .map((node) => staticSwiftEnum(node))
      .filter((candidate): candidate is StaticSwiftEnum => candidate !== null);
    const topLevelTypeAliases = topLevel
      .map((node) => staticSwiftTypeAlias(node))
      .filter((candidate): candidate is StaticSwiftTypeAlias => candidate !== null);
    const topLevelExtensions = topLevel
      .map((node) => staticSwiftExtension(node))
      .filter((candidate): candidate is StaticSwiftExtension => candidate !== null);
    const topLevelFunctions = topLevel
      .filter((node) => node.kind() === "function_declaration")
      .map((node) => staticSwiftFunction(node))
      .filter((candidate): candidate is StaticSwiftFunction => candidate !== null);

    for (const importNode of topLevel.filter((node) => node.kind() === "import_declaration")) {
      const importIdentifier = directChildren(importNode).find((child) => child.kind() === "identifier");
      const importedPath = importIdentifier === undefined ? null : nodeText(importIdentifier).trim();
      const importedName = importedPath?.split(".").at(-1) ?? null;
      if (importedPath === null || importedName === null || !/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(importedPath)) {
        continue;
      }
      swiftImports.push({
        sourceId: fileNode.id,
        filePath: input.filePath,
        importedPath,
        importedName,
        localName: importedName,
        isWildcard: false,
        isAliased: false,
        range: rangeForNode(importNode)
      });
    }

    for (const declaration of topLevelEnums) {
      addExtraType(declaration, "enum");
    }
    for (const declaration of topLevelTypeAliases) {
      addExtraType(declaration, "typealias");
    }
    const functionsByName = new Map<
      string,
      { readonly declaration: StaticSwiftFunction; readonly symbol: SymbolNode }[]
    >();
    const importedCallNames = new Set(swiftImports.map((fact) => fact.localName));
    const shouldRecordCall = (call: StaticSwiftCall, declarationNode: SwiftSyntaxNode): boolean => {
      if (call.callKind === "member") {
        return call.receiverTypeName !== undefined;
      }
      if (/^[A-Z][A-Za-z0-9_]*$/u.test(call.name)) {
        return true;
      }
      if (importedCallNames.has(call.name)) {
        return !hasNamedIdentifierExcept(declarationNode, call.name, new Set([syntaxNodeKey(call.nameNode)]));
      }
      if (topLevel.some((node) => node.kind() === "import_declaration")) {
        return false;
      }
      const candidates = topLevelFunctions.filter((candidate) => candidate.name === call.name);
      const target = candidates[0];
      return candidates.length === 1 &&
        target !== undefined &&
        call.argumentCount === 0 &&
        isFilePrivateZeroParameterFunction(target) &&
        !hasTopLevelNameCompetition(topLevel, target) &&
        !hasNamedIdentifierExcept(declarationNode, call.name, new Set([syntaxNodeKey(call.nameNode)]));
    };
    const extendedTypeNames = new Set(
      topLevelExtensions.map((declaration) => declaration.extendedTypeName)
    );

    for (const declaration of topLevelTypes) {
      const typeSymbol = addType(declaration);
      if (declaration.objcClassName !== null || extendedTypeNames.has(declaration.name)) {
        swiftObjectiveCTypes.push({
          swiftTypeName: declaration.name,
          objcClassName: declaration.objcClassName,
          filePath: input.filePath,
          range: typeSymbol.range
        });
      }
      for (const methodDeclaration of directChildren(declaration.body)
        .map((node) => staticSwiftFunction(node))
        .filter((candidate): candidate is StaticSwiftFunction => candidate !== null)) {
        const methodSymbol = addMethod(typeSymbol, methodDeclaration);
        if (methodDeclaration.isOverride) {
          swiftOverrides.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            methodName: methodDeclaration.name,
            ownerTypeName: declaration.name,
            range: methodSymbol.range
          });
        }
        if (methodDeclaration.body !== null) {
          for (const call of staticSwiftCallsInBody(methodDeclaration.body, declaration.name, methodDeclaration.node)) {
            if (!shouldRecordCall(call, methodDeclaration.node)) {
              continue;
            }
            swiftCalls.push({
              sourceId: methodSymbol.id,
              filePath: input.filePath,
              referenceName: call.name,
              callKind: call.callKind,
              ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }),
              ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }),
              argumentCount: call.argumentCount,
              range: rangeForNode(call.node)
            });
            if (call.callKind === "direct" && /^[A-Z][A-Za-z0-9_]*$/u.test(call.name)) {
              swiftInstantiations.push({
                sourceId: methodSymbol.id,
                filePath: input.filePath,
                typeName: call.name,
                argumentCount: call.argumentCount,
                range: rangeForNode(call.node)
              });
            }
          }
        }
        if (
          declaration.objcClassName !== null &&
          methodDeclaration.objcSelector !== null &&
          methodDeclaration.body !== null
        ) {
          swiftObjectiveCMethods.push({
            objcClassName: declaration.objcClassName,
            selector: methodDeclaration.objcSelector,
            methodId: methodSymbol.id,
            filePath: input.filePath,
            range: methodSymbol.range
          });
        }
      }
      for (const initializerNode of directChildren(declaration.body)
        .map((node) => staticSwiftInitializer(node))
        .filter((candidate): candidate is StaticSwiftInitializer => candidate !== null)) {
        const initializerSymbol = addInitializer(typeSymbol, initializerNode);
        if (initializerNode.body !== null) {
          for (const call of staticSwiftCallsInBody(initializerNode.body, declaration.name, initializerNode.node)) {
            if (!shouldRecordCall(call, initializerNode.node)) {
              continue;
            }
            swiftCalls.push({
              sourceId: initializerSymbol.id,
              filePath: input.filePath,
              referenceName: call.name,
              callKind: call.callKind,
              ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }),
              ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }),
              argumentCount: call.argumentCount,
              range: rangeForNode(call.node)
            });
          }
        }
      }
    }

    for (const declaration of topLevelExtensions) {
      const extensionSymbol = addExtension(declaration);
      for (const referenceName of staticSwiftHeritageNames(declaration.node)) {
        swiftHeritage.push({
          sourceId: extensionSymbol.id,
          filePath: input.filePath,
          referenceName,
          relationKind: "implements",
          sourceTypeKind: "class",
          range: rangeForNode(declaration.node)
        });
      }
      for (const methodDeclaration of directChildren(declaration.body)
        .map((node) => staticSwiftFunction(node))
        .filter((candidate): candidate is StaticSwiftFunction => candidate !== null)) {
        const methodSymbol = addMethod(extensionSymbol, methodDeclaration);
        if (methodDeclaration.isOverride) {
          swiftOverrides.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            methodName: methodDeclaration.name,
            ownerTypeName: declaration.extendedTypeName,
            range: methodSymbol.range
          });
        }
        if (methodDeclaration.body !== null) {
          for (const call of staticSwiftCallsInBody(methodDeclaration.body, declaration.extendedTypeName, methodDeclaration.node)) {
            if (!shouldRecordCall(call, methodDeclaration.node)) {
              continue;
            }
            swiftCalls.push({
              sourceId: methodSymbol.id,
              filePath: input.filePath,
              referenceName: call.name,
              callKind: call.callKind,
              ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }),
              ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }),
              argumentCount: call.argumentCount,
              range: rangeForNode(call.node)
            });
            if (call.callKind === "direct" && /^[A-Z][A-Za-z0-9_]*$/u.test(call.name)) {
              swiftInstantiations.push({
                sourceId: methodSymbol.id,
                filePath: input.filePath,
                typeName: call.name,
                argumentCount: call.argumentCount,
                range: rangeForNode(call.node)
              });
            }
          }
        }
        if (
          methodDeclaration.objcSelector !== null &&
          methodDeclaration.body !== null
        ) {
          swiftObjectiveCExtensionMethods.push({
            extendedTypeName: declaration.extendedTypeName,
            selector: methodDeclaration.objcSelector,
            methodId: methodSymbol.id,
            filePath: input.filePath,
            range: methodSymbol.range
          });
        }
      }
    }

    for (const functionDeclaration of topLevelFunctions) {
      const symbol = addFunction(functionDeclaration);
      const candidates = functionsByName.get(functionDeclaration.name) ?? [];
      candidates.push({ declaration: functionDeclaration, symbol });
      functionsByName.set(functionDeclaration.name, candidates);
      if (functionDeclaration.body !== null) {
        for (const call of staticSwiftCallsInBody(functionDeclaration.body, null, functionDeclaration.node)) {
          if (!shouldRecordCall(call, functionDeclaration.node)) {
            continue;
          }
          swiftCalls.push({
            sourceId: symbol.id,
            filePath: input.filePath,
            referenceName: call.name,
            callKind: call.callKind,
            ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }),
            ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }),
            argumentCount: call.argumentCount,
            range: rangeForNode(call.node)
          });
          if (call.callKind === "direct" && /^[A-Z][A-Za-z0-9_]*$/u.test(call.name)) {
            swiftInstantiations.push({
              sourceId: symbol.id,
              filePath: input.filePath,
              typeName: call.name,
              argumentCount: call.argumentCount,
              range: rangeForNode(call.node)
            });
          }
        }
      }
    }

    if (!topLevel.some((node) => node.kind() === "import_declaration")) {
      for (const callerDeclaration of topLevelFunctions) {
        if (callerDeclaration.body === null) {
          continue;
        }
        const callerCandidates = functionsByName.get(callerDeclaration.name) ?? [];
        const caller = callerCandidates.find(
          (candidate) => syntaxNodeKey(candidate.declaration.node) === syntaxNodeKey(callerDeclaration.node)
        )?.symbol;
        if (caller === undefined) {
          continue;
        }
        const plainCalls = directSwiftPlainCalls(callerDeclaration.body);
        for (const call of plainCalls) {
          const targetCandidates = functionsByName.get(call.name) ?? [];
          const target = targetCandidates[0];
          if (
            target === undefined ||
            targetCandidates.length !== 1 ||
            !isFilePrivateZeroParameterFunction(target.declaration) ||
            hasTopLevelNameCompetition(topLevel, target.declaration)
          ) {
            continue;
          }
          const allowedNodeKeys = new Set([syntaxNodeKey(call.nameNode)]);
          if (callerDeclaration.name === call.name) {
            const callerNameNode = directChildren(callerDeclaration.node).find(
              (child) => child.kind() === "simple_identifier"
            );
            if (callerNameNode !== undefined) {
              allowedNodeKeys.add(syntaxNodeKey(callerNameNode));
            }
          }
          for (const siblingCall of plainCalls) {
            if (siblingCall.name === call.name) {
              allowedNodeKeys.add(syntaxNodeKey(siblingCall.nameNode));
            }
          }
          if (hasNamedIdentifierExcept(callerDeclaration.node, call.name, allowedNodeKeys)) {
            continue;
          }
          addDirectCall(caller, target.symbol, call);
        }
      }
    }

    if (hasDirectVaporImport(root)) {
      for (const functionDeclaration of topLevelFunctions) {
        for (const statement of staticVaporRouteStatements(functionDeclaration)) {
          const route = staticVaporRoute(statement);
          if (route === null) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          if (handlerCandidates.length === 1) {
            const handler = handlerCandidates[0];
            if (handler !== undefined) {
              addVaporRoute(route, handler.symbol);
            }
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
    },
    swiftFacts: {
      moduleName: "",
      types: swiftTypes,
      callables: swiftCallables,
      imports: swiftImports,
      calls: swiftCalls,
      instantiations: swiftInstantiations,
      ...(swiftHeritage.length === 0 ? {} : { heritage: swiftHeritage }),
      ...(swiftOverrides.length === 0 ? {} : { overrides: swiftOverrides })
    } satisfies SwiftFacts,
    ...(swiftObjectiveCMethods.length === 0 &&
    swiftObjectiveCTypes.length === 0 &&
    swiftObjectiveCExtensionMethods.length === 0
      ? {}
      : {
          swiftObjectiveCFacts: {
            methods: swiftObjectiveCMethods,
            ...(swiftObjectiveCTypes.length === 0 ? {} : { types: swiftObjectiveCTypes }),
            ...(swiftObjectiveCExtensionMethods.length === 0
              ? {}
              : { extensionMethods: swiftObjectiveCExtensionMethods })
          }
        })
  };
}

import { parser } from "@lezer/cpp";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type CppCallFact,
  type CppCallableFact,
  type CppFacts,
  type CppImportFact,
  type CppInstantiationFact,
  type CppTypeFact,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface CppExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "cpp";
}

type CppSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticCppFunction {
  readonly name: string;
  readonly node: CppSyntaxNode;
  readonly body: CppSyntaxNode;
  readonly parameterList: CppSyntaxNode;
  readonly parameterCount: number;
}

interface StaticCppFunctionDeclaration {
  readonly name: string;
}

interface StaticCppClass {
  readonly name: string;
  readonly node: CppSyntaxNode;
  readonly body: CppSyntaxNode;
}

interface StaticCppMethod {
  readonly name: string;
  readonly node: CppSyntaxNode;
}

interface StaticCppServer {
  readonly name: string;
  readonly node: CppSyntaxNode;
}

interface StaticCppHttplibRoute {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: CppSyntaxNode;
}

const CPP_HTTPLIB_SERVER_TYPES = new Set(["httplib::Server", "httplib::SSLServer"]);

const CPP_HTTPLIB_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS"
};

function directChildren(node: CppSyntaxNode): readonly CppSyntaxNode[] {
  const children: CppSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: CppExtractFileFactsInput, node: CppSyntaxNode): string {
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

function hasSyntaxError(node: CppSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticPlainCppString(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  if (node.name !== "String") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    value[0] !== '"' ||
    value.at(-1) !== '"' ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticCppPath(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  const path = staticPlainCppString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function functionName(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode,
  identifierKind: "Identifier" | "FieldIdentifier"
): string | null {
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const names = directChildren(declarators[0])
    .filter((child) => child.name === identifierKind)
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return names.length === 1 && names[0] !== undefined ? names[0] : null;
}

function staticCppFunction(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppFunction | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const name = functionName(input, node, "Identifier");
  const bodies = directChildren(node).filter((child) => child.name === "CompoundStatement");
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const parameterLists =
    declarators.length === 1 && declarators[0] !== undefined
      ? directChildren(declarators[0]).filter((child) => child.name === "ParameterList")
      : [];
  const parameterList = parameterLists[0];
  const parameterCount = parameterList === undefined ? null : boundedCppParameterCount(input, parameterList);
  return name !== null && bodies.length === 1 && bodies[0] !== undefined && parameterList !== undefined && parameterCount !== null
    ? { name, node, body: bodies[0], parameterList, parameterCount }
    : null;
}

function boundedCppParameterCount(
  input: CppExtractFileFactsInput,
  parameterList: CppSyntaxNode
): number | null {
  const parameters = directChildren(parameterList).filter((child) => child.name === "ParameterDeclaration");
  const unsupported = directChildren(parameterList).some(
    (child) => !["(", ")", ",", "ParameterDeclaration"].includes(child.name)
  );
  if (unsupported) {
    return null;
  }
  if (parameters.length === 1 && parameters[0] !== undefined && nodeText(input, parameters[0]).trim() === "void") {
    return 0;
  }
  if (parameters.some((parameter) => nodeText(input, parameter).includes("...") || nodeText(input, parameter).includes("="))) {
    return null;
  }
  return parameters.length;
}

function staticCppFunctionDeclaration(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode
): StaticCppFunctionDeclaration | null {
  const declaration =
    node.name === "TemplateDeclaration"
      ? directChildren(node).find(
          (child) => child.name === "Declaration" || child.name === "FunctionDefinition"
        )
      : node.name === "Declaration"
        ? node
        : undefined;
  if (declaration === undefined) {
    return null;
  }
  if (declaration.name === "FunctionDefinition") {
    const name = functionName(input, declaration, "Identifier");
    return name === null ? null : { name };
  }
  const declarators = directChildren(declaration).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const names = directChildren(declarators[0])
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return names.length === 1 && names[0] !== undefined ? { name: names[0] } : null;
}

function macroNames(input: CppExtractFileFactsInput, root: CppSyntaxNode): ReadonlySet<string> {
  const names = new Set<string>();
  function visit(node: CppSyntaxNode): void {
    if (node.name === "PreprocDirective") {
      const text = nodeText(input, node);
      const match = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/u.exec(text);
      if (match?.[1] !== undefined) {
        names.add(match[1]);
      } else if (/^\s*#\s*define\b/u.test(text)) {
        for (const name of identifierNames(input, node)) {
          names.add(name);
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }
  visit(root);
  return names;
}

function directBareCall(
  input: CppExtractFileFactsInput,
  statement: CppSyntaxNode
): { readonly name: string; readonly node: CppSyntaxNode; readonly argumentCount: number } | null {
  if (statement.name !== "ExpressionStatement" && statement.name !== "ReturnStatement") {
    return null;
  }
  const calls = directChildren(statement).filter((child) => child.name === "CallExpression");
  if (calls.length !== 1 || calls[0] === undefined) {
    return null;
  }
  const children = directChildren(calls[0]);
  const callee = children[0];
  const arguments_ = children[1];
  const name = callee === undefined ? null : identifierText(input, callee);
  const argumentCount = arguments_ === undefined
    ? null
    : directChildren(arguments_).filter((child) => !["(", ")", ","].includes(child.name)).length;
  return (
    children.length === 2 &&
    callee?.name === "Identifier" &&
    arguments_?.name === "ArgumentList" &&
    name !== null &&
    argumentCount !== null
  )
    ? { name, node: calls[0], argumentCount }
    : null;
}

function identifierNames(input: CppExtractFileFactsInput, node: CppSyntaxNode): readonly string[] {
  const name = node.name === "Identifier" ? identifierText(input, node) : null;
  return [
    ...(name === null ? [] : [name]),
    ...directChildren(node).flatMap((child) => identifierNames(input, child))
  ];
}

function declaratorBindingNames(input: CppExtractFileFactsInput, node: CppSyntaxNode): readonly string[] {
  if (node.name === "ParameterList") {
    return [];
  }
  if (node.name === "TypeIdentifier") {
    const name = identifierText(input, node);
    return name === null ? [] : [name];
  }
  return directChildren(node).flatMap((child) => declaratorBindingNames(input, child));
}

function localBindingNames(input: CppExtractFileFactsInput, statement: CppSyntaxNode): readonly string[] {
  if (statement.name === "AliasDeclaration") {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  if (statement.name === "TypeDefinition") {
    const declarators = directChildren(statement).filter((child) => child.name.endsWith("Declarator"));
    if (declarators.length > 0) {
      return declarators.flatMap((declarator) => declaratorBindingNames(input, declarator));
    }
    const names = directChildren(statement)
      .filter((child) => child.name === "TypeIdentifier")
      .map((child) => identifierText(input, child))
      .filter((value): value is string => value !== null);
    const name = names.at(-1);
    return name === undefined ? [] : [name];
  }
  if (statement.name === "EnumSpecifier") {
    const typeName = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return [
      ...(typeName === undefined ? [] : [identifierText(input, typeName)].filter((value): value is string => value !== null)),
      ...identifierNames(input, statement)
    ];
  }
  if (["StructSpecifier", "ClassSpecifier"].includes(statement.name)) {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  return identifierNames(input, statement);
}

function directCallerCalls(
  input: CppExtractFileFactsInput,
  declaration: StaticCppFunction
): readonly { readonly name: string; readonly node: CppSyntaxNode; readonly argumentCount: number }[] {
  const shadowedNames = new Set(identifierNames(input, declaration.parameterList));
  const calls: Array<{ readonly name: string; readonly node: CppSyntaxNode; readonly argumentCount: number }> = [];
  for (const statement of directChildren(declaration.body)) {
    if (
      ["Declaration", "AliasDeclaration", "TypeDefinition", "StructSpecifier", "ClassSpecifier", "EnumSpecifier"].includes(
        statement.name
      )
    ) {
      for (const name of localBindingNames(input, statement)) {
        shadowedNames.add(name);
      }
      continue;
    }
    const call = directBareCall(input, statement);
    if (call !== null) {
      calls.push(call);
    }
  }
  return calls.filter((call) => !shadowedNames.has(call.name));
}

function hasCppPreprocessing(root: CppSyntaxNode): boolean {
  return root.name === "PreprocDirective" || directChildren(root).some((node) => hasCppPreprocessing(node));
}

function staticCppClass(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppClass | null {
  if (node.name !== "ClassSpecifier" && node.name !== "StructSpecifier") {
    return null;
  }
  const names = directChildren(node)
    .filter((child) => child.name === "TypeIdentifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const bodies = directChildren(node).filter((child) => child.name === "FieldDeclarationList");
  return names.length === 1 && bodies.length === 1 && names[0] !== undefined && bodies[0] !== undefined
    ? { name: names[0], node, body: bodies[0] }
    : null;
}

function staticCppMethod(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppMethod | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const name = functionName(input, node, "FieldIdentifier");
  return name === null ? null : { name, node };
}

function cppParameterTypeNames(
  input: CppExtractFileFactsInput,
  parameterList: CppSyntaxNode
): readonly string[] | undefined {
  const parameters = directChildren(parameterList).filter((child) => child.name === "ParameterDeclaration");
  if (parameters.some((parameter) => /\.\.\.|[=<]/u.test(nodeText(input, parameter)))) {
    return undefined;
  }
  if (parameters.length === 1 && nodeText(input, parameters[0]!).trim() === "void") {
    return [];
  }
  const names: string[] = [];
  for (const parameter of parameters) {
    const compact = nodeText(input, parameter)
      .replace(/\b(?:const|volatile|mutable|register|static|typename)\b/gu, " ")
      .replace(/[&*]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    const tokens = compact.split(" ").filter((token) => token.length > 0);
    const typeName = tokens.length <= 1 ? tokens[0] : tokens.at(-2);
    if (typeName === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(typeName)) {
      return undefined;
    }
    names.push(typeName);
  }
  return names;
}

function cppReturnTypeName(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | undefined {
  const declarator = directChildren(node).find((child) => child.name === "FunctionDeclarator");
  if (declarator === undefined) {
    return undefined;
  }
  const prefix = input.sourceText.slice(node.from, declarator.from)
    .replace(/\b(?:static|inline|virtual|constexpr|consteval|extern|friend|typename|auto|register)\b/gu, " ")
    .replace(/[&*]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const typeName = prefix.split(" ").filter((token) => token.length > 0).at(-1);
  return typeName !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(typeName) && typeName !== "void"
    ? typeName
    : undefined;
}

function cppArgumentCount(text: string): number | undefined {
  const compact = text.trim();
  if (compact.length === 0) return 0;
  let depth = 0;
  let count = 1;
  for (const character of compact) {
    if ("([{<".includes(character)) depth += 1;
    else if (")]}>".includes(character)) depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) count += 1;
  }
  return compact.includes("...") ? undefined : count;
}

function staticCppImportFacts(
  input: CppExtractFileFactsInput,
  root: CppSyntaxNode,
  sourceId: string,
  lineStarts: readonly number[]
): readonly CppImportFact[] {
  const imports: CppImportFact[] = [];
  for (const node of directChildren(root)) {
    if (node.name !== "PreprocDirective") continue;
    const text = nodeText(input, node);
    const match = /^\s*#\s*include\s*"([^"\r\n]+)"/u.exec(text);
    const importedPath = match?.[1];
    if (match === null || importedPath === undefined) continue;
    const offset = node.from + (match[0]?.indexOf(importedPath) ?? -1);
    if (offset < node.from) continue;
    imports.push({
      sourceId,
      filePath: input.filePath,
      importedPath,
      range: rangeFor(lineStarts, offset, offset + importedPath.length)
    });
  }
  return imports;
}

function staticCppMemberCallFacts(
  input: CppExtractFileFactsInput,
  method: StaticCppMethod,
  ownerTypeName: string,
  sourceId: string,
  lineStarts: readonly number[]
): readonly CppCallFact[] {
  const calls: CppCallFact[] = [];
  const text = nodeText(input, method.node);
  const pattern = /\bthis\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)/gu;
  for (const match of text.matchAll(pattern)) {
    const referenceName = match[1];
    const argumentsText = match[2];
    if (referenceName === undefined || argumentsText === undefined) continue;
    const count = cppArgumentCount(argumentsText);
    if (count === undefined) continue;
    const relative = (match.index ?? 0) + (match[0]?.indexOf(referenceName) ?? -1);
    if (relative < 0) continue;
    const start = method.node.from + relative;
    calls.push({
      sourceId,
      filePath: input.filePath,
      referenceName,
      callKind: "member",
      receiverTypeName: ownerTypeName,
      argumentCount: count,
      range: rangeFor(lineStarts, start, start + referenceName.length)
    });
  }
  return calls;
}

function staticCppInstantiationFacts(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode,
  sourceId: string,
  lineStarts: readonly number[]
): readonly CppInstantiationFact[] {
  const instantiations: CppInstantiationFact[] = [];
  const text = nodeText(input, node);
  const pattern = /\bnew\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)/gu;
  for (const match of text.matchAll(pattern)) {
    const typeName = match[1];
    const argumentsText = match[2];
    if (typeName === undefined || argumentsText === undefined) continue;
    const count = cppArgumentCount(argumentsText);
    if (count === undefined) continue;
    const relative = (match.index ?? 0) + (match[0]?.indexOf(typeName) ?? -1);
    if (relative < 0) continue;
    const start = node.from + relative;
    instantiations.push({
      sourceId,
      filePath: input.filePath,
      typeName,
      argumentCount: count,
      range: rangeFor(lineStarts, start, start + typeName.length)
    });
  }
  return instantiations;
}

function includesHttplib(input: CppExtractFileFactsInput, root: CppSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.name !== "PreprocDirective") {
      return false;
    }
    const header = directChildren(node).find(
      (child) => child.name === "SystemLibString" || child.name === "String"
    );
    return header !== undefined && ["<httplib.h>", '"httplib.h"'].includes(nodeText(input, header));
  });
}

function staticCppServer(input: CppExtractFileFactsInput, node: CppSyntaxNode): StaticCppServer | null {
  if (node.name !== "Declaration") {
    return null;
  }
  const children = directChildren(node);
  const type = children.find((child) => child.name === "ScopedTypeIdentifier");
  const names = children
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  return (
    type !== undefined &&
    CPP_HTTPLIB_SERVER_TYPES.has(nodeText(input, type)) &&
    names.length === 1 &&
    names[0] !== undefined
  )
    ? { name: names[0], node }
    : null;
}

function assignmentReceiver(input: CppExtractFileFactsInput, node: CppSyntaxNode): string | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const assignment = directChildren(node).find((child) => child.name === "AssignmentExpression");
  const receiver = assignment === undefined ? undefined : directChildren(assignment)[0];
  return receiver === undefined ? null : identifierText(input, receiver);
}

function staticCppHttplibRoute(
  input: CppExtractFileFactsInput,
  node: CppSyntaxNode
): StaticCppHttplibRoute | null {
  if (node.name !== "ExpressionStatement") {
    return null;
  }
  const calls = directChildren(node).filter((child) => child.name === "CallExpression");
  if (calls.length !== 1 || calls[0] === undefined) {
    return null;
  }
  const children = directChildren(calls[0]);
  const callee = children[0];
  const arguments_ = children[1];
  if (
    children.length !== 2 ||
    callee?.name !== "FieldExpression" ||
    arguments_?.name !== "ArgumentList"
  ) {
    return null;
  }
  const fieldChildren = directChildren(callee);
  const receiver = fieldChildren[0] === undefined ? null : identifierText(input, fieldChildren[0]);
  const methodName = fieldChildren[1] === undefined ? null : identifierText(input, fieldChildren[1]);
  const method = methodName === null ? undefined : CPP_HTTPLIB_ROUTE_METHODS[methodName];
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  const path = values[0] === undefined ? null : staticCppPath(input, values[0]);
  const handlerName = values[1] === undefined ? null : identifierText(input, values[1]);
  return (
    fieldChildren.length === 2 &&
    receiver !== null &&
    method !== undefined &&
    values.length === 2 &&
    path !== null &&
    handlerName !== null
  )
    ? { receiver, method, path, handlerName, node }
    : null;
}

export function extractCppFileFacts(input: CppExtractFileFactsInput): ArtifactFacts {
  const cppHttplibCapability = frameworkCapability("cpp-httplib");
  if (!cppHttplibCapability.languages.includes(input.language)) {
    throw new Error("C++ framework extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const cppTypes: CppTypeFact[] = [];
  const cppCallables: CppCallableFact[] = [];
  const cppImports: CppImportFact[] = [];
  const cppCalls: CppCallFact[] = [];
  const cppInstantiations: CppInstantiationFact[] = [];
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
  const parserRejected = hasSyntaxError(root);
  if (!parserRejected) {
    cppImports.push(...staticCppImportFacts(input, root, fileNode.id, lineStarts));
  }

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: CppSyntaxNode): void {
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

  function addFunction(declaration: StaticCppFunction): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addClass(declaration: StaticCppClass): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticCppMethod): SymbolNode {
    const qualifiedName = `${parent.qualifiedName}.${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    return symbol;
  }

  function addHttplibRoute(
    parent: SymbolNode,
    routeFact: StaticCppHttplibRoute,
    handler: SymbolNode
  ): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${parent.qualifiedName}#route:${routeName}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
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
        ruleId: "framework.cpp-httplib.direct-server.literal-route.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addCall(caller: SymbolNode, callee: SymbolNode, node: CppSyntaxNode): void {
    const range = rangeFor(lineStarts, node.from, node.to);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: callee.name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: callee.name,
      evidence: {
        ruleId: "syntax.cpp.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const functions = topLevel
      .map((node) => staticCppFunction(input, node))
      .filter((candidate): candidate is StaticCppFunction => candidate !== null);
    const declarations = topLevel
      .map((node) => staticCppFunctionDeclaration(input, node))
      .filter((candidate): candidate is StaticCppFunctionDeclaration => candidate !== null);
    const functionSymbols = new Map<StaticCppFunction, SymbolNode>();
    const functionsByName = new Map<string, SymbolNode[]>();
    const declarationCountsByName = new Map<string, number>();
    for (const declaration of declarations) {
      declarationCountsByName.set(
        declaration.name,
        (declarationCountsByName.get(declaration.name) ?? 0) + 1
      );
    }
    for (const functionDeclaration of functions) {
      const symbol = addFunction(functionDeclaration);
      functionSymbols.set(functionDeclaration, symbol);
      functionsByName.set(functionDeclaration.name, [
        ...(functionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
      const parameterTypes = cppParameterTypeNames(input, functionDeclaration.parameterList);
      const returnType = cppReturnTypeName(input, functionDeclaration.node);
      cppCallables.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        name: functionDeclaration.name,
        moduleName: input.filePath,
        parameterCount: functionDeclaration.parameterCount,
        ...(parameterTypes === undefined ? {} : { parameterTypeNames: parameterTypes }),
        ...(returnType === undefined ? {} : { returnTypeName: returnType }),
        isExported: symbol.isExported,
        range: symbol.range
      });
      cppInstantiations.push(
        ...staticCppInstantiationFacts(input, functionDeclaration.node, symbol.id, lineStarts)
      );
    }

    const definedMacros = macroNames(input, root);
    const unsafePreprocessor = /#\s*(?:if|ifdef|ifndef|elif|else|endif|define|undef)\b/u.test(
      input.sourceText
    );
    if (!unsafePreprocessor) for (const functionDeclaration of functions) {
      const caller = functionSymbols.get(functionDeclaration);
      if (caller === undefined) {
        continue;
      }
      for (const call of directCallerCalls(input, functionDeclaration)) {
        if (definedMacros.has(call.name)) {
          continue;
        }
        cppCalls.push({
          sourceId: caller.id,
          filePath: input.filePath,
          referenceName: call.name,
          callKind: "direct",
          argumentCount: call.argumentCount,
          range: rangeFor(lineStarts, call.node.from, call.node.to)
        });
        if (hasCppPreprocessing(root)) continue;
        const candidates = functionsByName.get(call.name) ?? [];
        if (
          candidates.length === 1 &&
          candidates[0] !== undefined &&
          functions.find((candidate) => functionSymbols.get(candidate)?.id === candidates[0]?.id)?.parameterCount === call.argumentCount &&
          (declarationCountsByName.get(call.name) ?? 0) === 0
        ) {
          addCall(caller, candidates[0], call.node);
        }
      }
    }

    for (const classDeclaration of topLevel
      .map((node) => staticCppClass(input, node))
      .filter((candidate): candidate is StaticCppClass => candidate !== null)) {
      const classSymbol = addClass(classDeclaration);
      const declarationKind = /\b(struct|class|enum)\b/u.exec(nodeText(input, classDeclaration.node))?.[1] as
        | "struct"
        | "class"
        | "enum"
        | undefined;
      cppTypes.push({
        symbolId: classSymbol.id,
        filePath: input.filePath,
        name: classDeclaration.name,
        moduleName: input.filePath,
        declarationKind: declarationKind === "enum" ? "enum" : declarationKind === "struct" ? "struct" : "class",
        isExported: classSymbol.isExported,
        range: classSymbol.range
      });
      for (const methodDeclaration of directChildren(classDeclaration.body)
        .map((node) => staticCppMethod(input, node))
        .filter((candidate): candidate is StaticCppMethod => candidate !== null)) {
        const methodSymbol = addMethod(classSymbol, methodDeclaration);
        const declarator = directChildren(methodDeclaration.node).find(
          (child) => child.name === "FunctionDeclarator"
        );
        const parameterList = declarator === undefined
          ? undefined
          : directChildren(declarator).find((child) => child.name === "ParameterList");
        const parameterCount = parameterList === undefined
          ? undefined
          : boundedCppParameterCount(input, parameterList);
        if (parameterList !== undefined && parameterCount !== null && parameterCount !== undefined) {
          const parameterTypes = cppParameterTypeNames(input, parameterList);
          const returnType = cppReturnTypeName(input, methodDeclaration.node);
          cppCallables.push({
            symbolId: methodSymbol.id,
            filePath: input.filePath,
            name: methodDeclaration.name,
            moduleName: input.filePath,
            ownerTypeName: classDeclaration.name,
            parameterCount,
            ...(parameterTypes === undefined ? {} : { parameterTypeNames: parameterTypes }),
            ...(returnType === undefined ? {} : { returnTypeName: returnType }),
            isExported: methodSymbol.isExported,
            range: methodSymbol.range
          });
          cppCalls.push(
            ...staticCppMemberCallFacts(
              input,
              methodDeclaration,
              classDeclaration.name,
              methodSymbol.id,
              lineStarts
            )
          );
          cppInstantiations.push(
            ...staticCppInstantiationFacts(input, methodDeclaration.node, methodSymbol.id, lineStarts)
          );
        }
      }
    }

    if (includesHttplib(input, root)) {
      for (const functionDeclaration of functions) {
        const parent = functionSymbols.get(functionDeclaration);
        if (parent === undefined) {
          continue;
        }
        const servers = new Map<string, StaticCppServer>();
        for (const statement of directChildren(functionDeclaration.body)) {
          const server = staticCppServer(input, statement);
          if (server !== null) {
            servers.set(server.name, server);
            continue;
          }
          const reboundName = assignmentReceiver(input, statement);
          if (reboundName !== null) {
            servers.delete(reboundName);
            continue;
          }
          const route = staticCppHttplibRoute(input, statement);
          if (route === null || !servers.has(route.receiver)) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          const handler = handlerCandidates.length === 1 ? handlerCandidates[0] : undefined;
          if (handler !== undefined) {
            addHttplibRoute(parent, route, handler);
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
    cppFacts: {
      parserRejected,
      types: cppTypes,
      callables: cppCallables,
      imports: cppImports,
      calls: cppCalls,
      instantiations: cppInstantiations
    } satisfies CppFacts,
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

import { parser } from "@lezer/cpp";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type CCallFact,
  type CCallableFact,
  type CImportFact,
  type CPrototypeFact,
  type CTypeFact,
  type CTypeDeclarationKind,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface CExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "c";
}

/**
 * The bundled Lezer C++ parser accepts the common C declaration and expression
 * subset used here. This extractor deliberately interprets only C-shaped
 * top-level functions and CivetWeb's C API; C++ files continue through their
 * separate extractor and capability.
 */
type CSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticCFunction {
  readonly name: string;
  readonly node: CSyntaxNode;
  readonly body: CSyntaxNode;
  readonly parameterList: CSyntaxNode;
}

interface StaticCFunctionDeclaration {
  readonly name: string;
  readonly node: CSyntaxNode;
  readonly parameterList: CSyntaxNode;
}

interface StaticCivetWebRoute {
  readonly path: string;
  readonly handlerName: string;
  readonly node: CSyntaxNode;
}

interface CParameterContract {
  readonly signature: string;
  readonly minimumArgumentCount: number;
  readonly variadic: boolean;
}

interface CFunctionContract {
  readonly returnType: string;
  readonly parameters: CParameterContract;
}

interface DirectCFunctionCall {
  readonly name: string;
  readonly argumentCount: number;
  readonly argumentIdentifierNames: readonly string[];
  readonly node: CSyntaxNode;
}

interface CPreprocessorFacts {
  readonly hasInclude: boolean;
  readonly malformed: boolean;
  readonly macroNames: ReadonlySet<string>;
  conditionalDepthAt(offset: number): number | null;
}

interface StaticCTypeDeclaration {
  readonly name: string;
  readonly declarationKind: CTypeDeclarationKind;
  readonly node: CSyntaxNode;
}

function directChildren(node: CSyntaxNode): readonly CSyntaxNode[] {
  const children: CSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: CExtractFileFactsInput, node: CSyntaxNode): string {
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

function hasSyntaxError(node: CSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function typeIdentifierText(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  if (node.name !== "TypeIdentifier") return null;
  return identifierText(input, node);
}

function typeTagName(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  const tag = directChildren(node).find((child) => child.name === "TypeIdentifier");
  return tag === undefined ? null : typeIdentifierText(input, tag);
}

function staticCTypeDeclarations(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): readonly StaticCTypeDeclaration[] {
  const declarations: StaticCTypeDeclaration[] = [];
  const declarationKind: CTypeDeclarationKind | undefined =
    node.name === "StructSpecifier"
      ? "struct"
      : node.name === "UnionSpecifier"
        ? "union"
        : node.name === "EnumSpecifier"
          ? "enum"
          : node.name === "TypeDefinition"
            ? "typedef"
            : undefined;
  if (declarationKind === undefined) return declarations;
  if (declarationKind === "typedef") {
    for (const child of directChildren(node)) {
      if (["StructSpecifier", "UnionSpecifier", "EnumSpecifier"].includes(child.name)) {
        const nestedKind: CTypeDeclarationKind =
          child.name === "StructSpecifier"
            ? "struct"
            : child.name === "UnionSpecifier"
              ? "union"
              : "enum";
        const nestedName = typeTagName(input, child);
        if (nestedName !== null) declarations.push({ name: nestedName, declarationKind: nestedKind, node: child });
      }
    }
    const aliases = directChildren(node)
      .filter((child) => child.name === "TypeIdentifier")
      .map((child) => typeIdentifierText(input, child))
      .filter((name): name is string => name !== null);
    const alias = aliases.at(-1);
    if (alias !== undefined && !declarations.some((candidate) => candidate.name === alias)) {
      declarations.push({ name: alias, declarationKind, node });
    }
    return declarations;
  }
  const name = typeTagName(input, node);
  return name === null ? declarations : [{ name, declarationKind, node }];
}

function cTypeNamesInNode(input: CExtractFileFactsInput, node: CSyntaxNode): readonly string[] {
  const names: string[] = [];
  function visit(current: CSyntaxNode): void {
    if (current.name === "Identifier" && current.parent?.name === "FunctionDeclarator") return;
    const name = typeIdentifierText(input, current);
    if (name !== null && !names.includes(name)) names.push(name);
    for (const child of directChildren(current)) visit(child);
  }
  visit(node);
  return names;
}

function staticPlainCString(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
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

function staticCImportFacts(
  input: CExtractFileFactsInput,
  root: CSyntaxNode,
  sourceId: string,
  lineStarts: readonly number[]
): readonly CImportFact[] {
  const imports: CImportFact[] = [];
  for (const node of directChildren(root)) {
    if (node.name !== "PreprocDirective") continue;
    const text = nodeText(input, node);
    const match = /^\s*#\s*include\s*"([^"\r\n]+)"/u.exec(text);
    const importedPath = match?.[1];
    if (match === null || importedPath === undefined) continue;
    const relativeOffset = match[0]?.indexOf(importedPath) ?? -1;
    const offset = node.from + relativeOffset;
    if (relativeOffset < 0 || offset < node.from) continue;
    imports.push({
      sourceId,
      filePath: input.filePath,
      importedPath,
      range: rangeFor(lineStarts, offset, offset + importedPath.length)
    });
  }
  return imports;
}

function cArgumentCount(text: string): number | undefined {
  const compact = text.trim();
  if (compact.length === 0) return 0;
  let depth = 0;
  let count = 1;
  for (const character of compact) {
    if ("([{".includes(character)) depth += 1;
    else if (")] }".replaceAll(" ", "").includes(character)) depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) count += 1;
  }
  return compact.includes("...") ? undefined : count;
}

function staticCivetWebPath(input: CExtractFileFactsInput, node: CSyntaxNode): string | null {
  const path = staticPlainCString(input, node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticCFunction(input: CExtractFileFactsInput, node: CSyntaxNode): StaticCFunction | null {
  if (node.name !== "FunctionDefinition") {
    return null;
  }
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const bodies = directChildren(node).filter((child) => child.name === "CompoundStatement");
  const declarator = declarators.length === 1 ? declarators[0] : undefined;
  const body = bodies.length === 1 ? bodies[0] : undefined;
  if (declarator === undefined || body === undefined) {
    return null;
  }
  const nameNode = directChildren(declarator).find((child) => child.name === "Identifier");
  const parameterList = directChildren(declarator).find((child) => child.name === "ParameterList");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  return name === null || parameterList === undefined ? null : { name, node, body, parameterList };
}

function staticCFunctionDeclaration(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): StaticCFunctionDeclaration | null {
  if (node.name !== "Declaration") {
    return null;
  }
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  if (declarators.length !== 1 || declarators[0] === undefined) {
    return null;
  }
  const children = directChildren(declarators[0]);
  const names = children
    .filter((child) => child.name === "Identifier")
    .map((child) => identifierText(input, child))
    .filter((candidate): candidate is string => candidate !== null);
  const parameterLists = children.filter((child) => child.name === "ParameterList");
  return names.length === 1 && names[0] !== undefined && parameterLists.length === 1 && parameterLists[0] !== undefined
    ? { name: names[0], node, parameterList: parameterLists[0] }
    : null;
}

function cParameterSignature(input: CExtractFileFactsInput, parameterList: CSyntaxNode): string {
  const characters = nodeText(input, parameterList).split("");
  function maskParameterNames(node: CSyntaxNode): void {
    if (node.name === "Identifier") {
      characters.fill(" ", node.from - parameterList.from, node.to - parameterList.from);
      return;
    }
    for (const child of directChildren(node)) {
      maskParameterNames(child);
    }
  }
  maskParameterNames(parameterList);
  return characters.join("").replace(/\s+/gu, "");
}

function cParameterContract(
  input: CExtractFileFactsInput,
  parameterList: CSyntaxNode
): CParameterContract | null {
  const compact = nodeText(input, parameterList).replace(/\s+/gu, "");
  if (compact.length < 2 || compact[0] !== "(" || compact.at(-1) !== ")") {
    return null;
  }
  const parameters = directChildren(parameterList).filter((child) => child.name === "ParameterDeclaration");
  const contents = compact.slice(1, -1);
  if (contents === "void") {
    return parameters.length === 1
      ? { signature: cParameterSignature(input, parameterList), minimumArgumentCount: 0, variadic: false }
      : null;
  }
  if (contents.length === 0 || parameters.length === 0) {
    // In C, an empty list is an old-style declaration with unspecified parameters.
    return null;
  }
  const variadic = contents.endsWith(",...");
  if (contents.includes("...") && !variadic) {
    return null;
  }
  return {
    signature: cParameterSignature(input, parameterList),
    minimumArgumentCount: parameters.length,
    variadic
  };
}

function cFunctionContract(
  input: CExtractFileFactsInput,
  node: CSyntaxNode,
  parameterList: CSyntaxNode
): CFunctionContract | null {
  const declarators = directChildren(node).filter((child) => child.name === "FunctionDeclarator");
  const declarator = declarators.length === 1 ? declarators[0] : undefined;
  if (declarator === undefined) {
    return null;
  }
  const returnType = input.sourceText
    .slice(node.from, declarator.from)
    .replace(/\b(?:auto|extern|register|static|typedef|_Thread_local)\b/gu, "")
    .replace(/\s+/gu, "");
  const parameters = cParameterContract(input, parameterList);
  return returnType.length === 0 || parameters === null ? null : { returnType, parameters };
}

function cParameterTypeNames(
  input: CExtractFileFactsInput,
  parameterList: CSyntaxNode
): readonly string[] | undefined {
  const names: string[] = [];
  for (const parameter of directChildren(parameterList).filter(
    (child) => child.name === "ParameterDeclaration"
  )) {
    for (const name of cTypeNamesInNode(input, parameter)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.length === 0 ? undefined : names;
}

function cReturnTypeName(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): string | undefined {
  const declarator = directChildren(node).find((child) => child.name === "FunctionDeclarator");
  if (declarator === undefined) return undefined;
  const names: string[] = [];
  for (const child of directChildren(node).filter((candidate) => candidate.to <= declarator.from)) {
    for (const name of cTypeNamesInNode(input, child)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.length === 0 ? undefined : names.at(-1);
}

function hasStorageClass(input: CExtractFileFactsInput, node: CSyntaxNode, storageClass: string): boolean {
  const declarator = directChildren(node).find((child) => child.name === "FunctionDeclarator");
  if (declarator === undefined) {
    return false;
  }
  return new RegExp(`\\b${storageClass}\\b`, "u").test(
    input.sourceText.slice(node.from, declarator.from).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu, " ")
  );
}

function compatibleFunctionContracts(left: CFunctionContract, right: CFunctionContract): boolean {
  return left.returnType === right.returnType && left.parameters.signature === right.parameters.signature;
}

function acceptsCallArgumentCount(contract: CFunctionContract, argumentCount: number): boolean {
  return contract.parameters.variadic
    ? argumentCount >= contract.parameters.minimumArgumentCount
    : argumentCount === contract.parameters.minimumArgumentCount;
}

function includesCivetWeb(input: CExtractFileFactsInput, root: CSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.name !== "PreprocDirective") {
      return false;
    }
    const header = directChildren(node).find(
      (child) => child.name === "SystemLibString" || child.name === "String"
    );
    return header !== undefined && ["<civetweb.h>", '"civetweb.h"'].includes(nodeText(input, header));
  });
}

function staticCivetWebRoute(
  input: CExtractFileFactsInput,
  node: CSyntaxNode
): StaticCivetWebRoute | null {
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
    callee?.name !== "Identifier" ||
    identifierText(input, callee) !== "mg_set_request_handler" ||
    arguments_?.name !== "ArgumentList"
  ) {
    return null;
  }
  const values = directChildren(arguments_).filter((child) => !["(", ")", ","].includes(child.name));
  const contextName = values[0] === undefined ? null : identifierText(input, values[0]);
  const path = values[1] === undefined ? null : staticCivetWebPath(input, values[1]);
  const handlerName = values[2] === undefined ? null : identifierText(input, values[2]);
  return values.length === 4 && contextName !== null && path !== null && handlerName !== null
    ? { path, handlerName, node }
    : null;
}

function containsIdentifier(input: CExtractFileFactsInput, node: CSyntaxNode, name: string): boolean {
  return (
    (node.name === "Identifier" && identifierText(input, node) === name) ||
    directChildren(node).some((child) => containsIdentifier(input, child, name))
  );
}

/**
 * A same-name function cannot prove a handler if a direct parameter or direct
 * declaration in the registration function could shadow the handler name.
 * This deliberately rejects plausible C code rather than emitting a false edge.
 */
function hasPotentialHandlerShadow(
  input: CExtractFileFactsInput,
  declaration: StaticCFunction,
  handlerName: string
): boolean {
  if (containsIdentifier(input, declaration.parameterList, handlerName)) {
    return true;
  }
  return directChildren(declaration.body).some(
    (statement) =>
      statement.name === "Declaration" && containsIdentifier(input, statement, handlerName)
  );
}

function directBareCall(
  input: CExtractFileFactsInput,
  statement: CSyntaxNode
): DirectCFunctionCall | null {
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
  const argumentChildren = arguments_ === undefined ? [] : directChildren(arguments_);
  const argumentExpressions = argumentChildren.filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  return (
    children.length === 2 &&
    callee?.name === "Identifier" &&
    arguments_?.name === "ArgumentList" &&
    argumentChildren.length >= 2 &&
    argumentChildren[0]?.name === "(" &&
    argumentChildren.at(-1)?.name === ")" &&
    name !== null
  )
    ? {
      name,
      argumentCount: argumentExpressions.length,
      argumentIdentifierNames: argumentExpressions.flatMap((argument) => identifierNames(input, argument)),
      node: calls[0]
    }
    : null;
}

function identifierNames(input: CExtractFileFactsInput, node: CSyntaxNode): readonly string[] {
  const name = node.name === "Identifier" ? identifierText(input, node) : null;
  return [
    ...(name === null ? [] : [name]),
    ...directChildren(node).flatMap((child) => identifierNames(input, child))
  ];
}

function localBindingNames(input: CExtractFileFactsInput, statement: CSyntaxNode): readonly string[] {
  if (statement.name === "AliasDeclaration") {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  if (statement.name === "TypeDefinition") {
    const names = directChildren(statement)
      .filter((child) => child.name === "TypeIdentifier")
      .map((child) => identifierText(input, child))
      .filter((value): value is string => value !== null);
    const name = names.at(-1);
    return name === undefined ? [] : [name];
  }
  if (["StructSpecifier", "ClassSpecifier", "EnumSpecifier"].includes(statement.name)) {
    const name = directChildren(statement).find((child) => child.name === "TypeIdentifier");
    return name === undefined ? [] : [identifierText(input, name)].filter((value): value is string => value !== null);
  }
  return identifierNames(input, statement);
}

function enumEnumeratorNames(input: CExtractFileFactsInput, statement: CSyntaxNode): readonly string[] {
  if (!/\benum\b/u.test(nodeText(input, statement))) {
    return [];
  }
  const names: string[] = [];
  for (const match of nodeText(input, statement).matchAll(/\benum\b[^{}]*\{([^}]*)\}/gu)) {
    const body = match[1];
    if (body === undefined) {
      continue;
    }
    for (const enumerator of body.split(",")) {
      const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)/u.exec(enumerator)?.[1];
      if (name !== undefined) {
        names.push(name);
      }
    }
  }
  return names;
}

function directCallerCalls(
  input: CExtractFileFactsInput,
  declaration: StaticCFunction
): readonly DirectCFunctionCall[] {
  const shadowedNames = new Set(identifierNames(input, declaration.parameterList));
  const calls: DirectCFunctionCall[] = [];
  for (const statement of directChildren(declaration.body)) {
    if (
      ["Declaration", "AliasDeclaration", "TypeDefinition", "StructSpecifier", "ClassSpecifier", "EnumSpecifier"].includes(
        statement.name
      )
    ) {
      for (const name of localBindingNames(input, statement)) {
        shadowedNames.add(name);
      }
      for (const name of enumEnumeratorNames(input, statement)) {
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

function cPreprocessorFacts(input: CExtractFileFactsInput): CPreprocessorFacts {
  const lineDepths: Array<{ readonly from: number; readonly to: number; readonly depth: number }> = [];
  const macroNames = new Set<string>();
  const conditionalStack: Array<{ elseSeen: boolean }> = [];
  let hasInclude = false;
  let malformed = false;
  let offset = 0;
  const identifier = "[A-Za-z_][A-Za-z0-9_]*";
  const lines = input.sourceText.matchAll(/.*(?:\r\n|\r|\n|$)/gu);

  for (const match of lines) {
    const line = match[0];
    if (line.length === 0) {
      continue;
    }
    const lineBody = line.replace(/[\r\n]+$/gu, "");
    lineDepths.push({ from: offset, to: offset + line.length, depth: conditionalStack.length });
    offset += line.length;
    let directiveCandidate = lineBody;
    let cursor = 0;
    while (true) {
      cursor += /^\s*/u.exec(directiveCandidate.slice(cursor))?.[0].length ?? 0;
      if (!directiveCandidate.startsWith("/*", cursor)) {
        break;
      }
      const close = directiveCandidate.indexOf("*/", cursor + 2);
      if (close < 0) {
        break;
      }
      cursor = close + 2;
    }
    directiveCandidate = directiveCandidate.slice(cursor);
    if (!/^#/u.test(directiveCandidate)) {
      continue;
    }
    const directive = /^#\s*([A-Za-z_][A-Za-z0-9_]*)(.*)$/u.exec(directiveCandidate);
    if (directive?.[1] === undefined || directive[2] === undefined || /\\\s*$/u.test(directiveCandidate)) {
      malformed = true;
      continue;
    }
    const command = directive[1];
    const rest = directive[2].trim();
    if (["if", "ifdef", "ifndef"].includes(command)) {
      if (
        (command === "if" && rest.length === 0) ||
        ((command === "ifdef" || command === "ifndef") && !new RegExp(`^${identifier}$`, "u").test(rest))
      ) {
        malformed = true;
      }
      conditionalStack.push({ elseSeen: false });
      continue;
    }
    if (command === "elif") {
      const frame = conditionalStack.at(-1);
      if (frame === undefined || frame.elseSeen || rest.length === 0) {
        malformed = true;
      }
      continue;
    }
    if (command === "else") {
      const frame = conditionalStack.at(-1);
      if (frame === undefined || frame.elseSeen || rest.length !== 0) {
        malformed = true;
      } else {
        frame.elseSeen = true;
      }
      continue;
    }
    if (command === "endif") {
      if (conditionalStack.length === 0 || rest.length !== 0) {
        malformed = true;
      } else {
        conditionalStack.pop();
      }
      continue;
    }
    if (["elifdef", "elifndef"].includes(command)) {
      malformed = true;
      continue;
    }
    if (command === "include") {
      hasInclude = true;
      continue;
    }
    if (command === "define") {
      const name = new RegExp(`^(${identifier})(?:\\s|\\(|$)`, "u").exec(rest)?.[1];
      if (name === undefined) {
        malformed = true;
      } else {
        macroNames.add(name);
      }
      continue;
    }
    if (command === "undef" && !new RegExp(`^${identifier}$`, "u").test(rest)) {
      malformed = true;
    }
  }
  if (conditionalStack.length > 0) {
    malformed = true;
  }
  return {
    hasInclude,
    malformed,
    macroNames,
    conditionalDepthAt(targetOffset: number): number | null {
      const line = lineDepths.find(({ from, to }) => targetOffset >= from && targetOffset < to);
      return line?.depth ?? null;
    }
  };
}

/**
 * Extracts C file/function symbols plus one intentionally narrow CivetWeb C
 * API surface. A route requires a direct civetweb.h include, a direct literal
 * `mg_set_request_handler` call in a top-level function body, and one unique
 * unshadowed top-level named handler function. CivetWeb does not bind a method
 * at registration time, so accepted registrations use the route method `ALL`.
 */
export function extractCFileFacts(input: CExtractFileFactsInput): ArtifactFacts {
  const civetWebCapability = frameworkCapability("civetweb");
  if (!civetWebCapability.languages.includes(input.language)) {
    throw new Error("CivetWeb extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const cTypes: CTypeFact[] = [];
  const cCallables: CCallableFact[] = [];
  const cPrototypes: CPrototypeFact[] = [];
  const cImports: CImportFact[] = [];
  const cCalls: CCallFact[] = [];
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
  if (!parserRejected) cImports.push(...staticCImportFacts(input, root, fileNode.id, lineStarts));
  const preprocessor = cPreprocessorFacts(input);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: CSyntaxNode): void {
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

  function addFunction(declaration: StaticCFunction, isExported: boolean): SymbolNode {
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
      isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addType(declaration: StaticCTypeDeclaration): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    cTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      declarationKind: declaration.declarationKind,
      isExported: symbol.isExported,
      range: symbol.range
    });
    return symbol;
  }

  function addCivetWebRoute(
    parent: SymbolNode,
    routeFact: StaticCivetWebRoute,
    handler: SymbolNode
  ): void {
    const routeName = `ALL ${routeFact.path}`;
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
        ruleId: "framework.civetweb.direct-request-handler.literal-uri.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  function addCall(caller: SymbolNode, callee: SymbolNode, node: CSyntaxNode): void {
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
        ruleId: "syntax.c.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const functions = directChildren(root)
      .map((node) => staticCFunction(input, node))
      .filter((candidate): candidate is StaticCFunction => candidate !== null);
    const declarations = directChildren(root)
      .map((node) => staticCFunctionDeclaration(input, node))
      .filter((candidate): candidate is StaticCFunctionDeclaration => candidate !== null);
    const symbolsByFunction = new Map<StaticCFunction, SymbolNode>();
    const functionsByName = new Map<string, SymbolNode[]>();
    const functionsBySymbolId = new Map<string, StaticCFunction>();
    const functionContractsBySymbolId = new Map<string, CFunctionContract | null>();
    const declarationsByName = new Map<string, StaticCFunctionDeclaration[]>();
    for (const declaration of declarations) {
      declarationsByName.set(declaration.name, [
        ...(declarationsByName.get(declaration.name) ?? []),
        declaration
      ]);
    }
    for (const functionDeclaration of functions) {
      const inheritedInternalLinkage = declarations.some(
        (declaration) =>
          declaration.name === functionDeclaration.name &&
          declaration.node.from < functionDeclaration.node.from &&
          hasStorageClass(input, declaration.node, "static")
      );
      const symbol = addFunction(
        functionDeclaration,
        !hasStorageClass(input, functionDeclaration.node, "static") && !inheritedInternalLinkage
      );
      symbolsByFunction.set(functionDeclaration, symbol);
      functionsBySymbolId.set(symbol.id, functionDeclaration);
      functionContractsBySymbolId.set(
        symbol.id,
        cFunctionContract(input, functionDeclaration.node, functionDeclaration.parameterList)
      );
      const parameterTypes = cParameterTypeNames(input, functionDeclaration.parameterList);
      const returnType = cReturnTypeName(input, functionDeclaration.node);
      const contract = functionContractsBySymbolId.get(symbol.id);
      cCallables.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        name: functionDeclaration.name,
        parameterCount: contract?.parameters.minimumArgumentCount ?? 0,
        ...(contract?.parameters.variadic === true ? { variadic: true } : {}),
        ...(parameterTypes === undefined ? {} : { parameterTypeNames: parameterTypes }),
        ...(returnType === undefined ? {} : { returnTypeName: returnType }),
        isExported: symbol.isExported,
        range: symbol.range
      });
      functionsByName.set(functionDeclaration.name, [
        ...(functionsByName.get(functionDeclaration.name) ?? []),
        symbol
      ]);
    }

    for (const declaration of declarations) {
      const contract = cFunctionContract(input, declaration.node, declaration.parameterList);
      if (contract === null) continue;
      const parameterTypes = cParameterTypeNames(input, declaration.parameterList);
      const returnType = cReturnTypeName(input, declaration.node);
      cPrototypes.push({
        name: declaration.name,
        parameterCount: contract.parameters.minimumArgumentCount,
        ...(contract.parameters.variadic ? { variadic: true } : {}),
        ...(parameterTypes === undefined ? {} : { parameterTypeNames: parameterTypes }),
        ...(returnType === undefined ? {} : { returnTypeName: returnType }),
        range: rangeFor(lineStarts, declaration.node.from, declaration.node.to)
      });
    }

    for (const node of directChildren(root)) {
      for (const declaration of staticCTypeDeclarations(input, node)) {
        addType(declaration);
      }
    }

    if (!preprocessor.malformed) {
      for (const functionDeclaration of functions) {
        const caller = symbolsByFunction.get(functionDeclaration);
        if (
          caller === undefined ||
          preprocessor.macroNames.has(functionDeclaration.name) ||
          preprocessor.conditionalDepthAt(functionDeclaration.node.from) !== 0
        ) {
          continue;
        }
        for (const call of directCallerCalls(input, functionDeclaration)) {
          if (
            preprocessor.macroNames.has(call.name) ||
            call.argumentIdentifierNames.some((name) => preprocessor.macroNames.has(name)) ||
            preprocessor.conditionalDepthAt(call.node.from) !== 0
          ) {
            continue;
          }
          if (preprocessor.macroNames.size === 0) {
            const range = rangeFor(lineStarts, call.node.from, call.node.to);
            cCalls.push({
              sourceId: caller.id,
              filePath: input.filePath,
              referenceName: call.name,
              argumentCount: call.argumentCount,
              range
            });
          }
          const candidates = functionsByName.get(call.name) ?? [];
          const candidate = candidates.length === 1 ? candidates[0] : undefined;
          const candidateContract =
            candidate === undefined ? undefined : functionContractsBySymbolId.get(candidate.id);
          const candidateDefinition =
            candidate === undefined ? undefined : functionsBySymbolId.get(candidate.id);
          const visibleDeclarations = (declarationsByName.get(call.name) ?? []).filter(
            (declaration) => declaration.node.from < call.node.from
          );
          const compatibleDeclarations = visibleDeclarations.every(
            (declaration) =>
              preprocessor.conditionalDepthAt(declaration.node.from) === 0 &&
              candidateContract !== null &&
              candidateContract !== undefined &&
              (() => {
                const declarationContract = cFunctionContract(
                  input,
                  declaration.node,
                  declaration.parameterList
                );
                return (
                  declarationContract !== null &&
                  compatibleFunctionContracts(candidateContract, declarationContract)
                );
              })()
          );
          if (
            candidate !== undefined &&
            candidateDefinition !== undefined &&
            candidateContract !== undefined &&
            candidateContract !== null &&
            preprocessor.conditionalDepthAt(candidateDefinition.node.from) === 0 &&
            compatibleDeclarations &&
            acceptsCallArgumentCount(candidateContract, call.argumentCount)
          ) {
            if (!preprocessor.hasInclude) addCall(caller, candidate, call.node);
          }
        }
      }
    }

    if (includesCivetWeb(input, root)) {
      for (const functionDeclaration of functions) {
        const parent = symbolsByFunction.get(functionDeclaration);
        if (parent === undefined) {
          continue;
        }
        for (const statement of directChildren(functionDeclaration.body)) {
          const route = staticCivetWebRoute(input, statement);
          if (route === null || hasPotentialHandlerShadow(input, functionDeclaration, route.handlerName)) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          const handler = handlerCandidates.length === 1 ? handlerCandidates[0] : undefined;
          if (handler !== undefined) {
            addCivetWebRoute(parent, route, handler);
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
    cFacts: {
      parserRejected,
      unsafePreprocessor:
        preprocessor.malformed ||
        preprocessor.macroNames.size > 0 ||
        /^\s*#\s*(?:if|ifdef|ifndef|elif|else|endif)\b/mu.test(input.sourceText),
      types: cTypes,
      callables: cCallables,
      prototypes: cPrototypes,
      imports: cImports,
      calls: cCalls
    }
  };
}

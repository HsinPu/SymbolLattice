import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RCallFact,
  type RFacts,
  type RFunctionFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface RExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "r";
}

type RTokenKind = "identifier" | "keyword" | "comment" | "string" | "symbol";
type RDelimiter = "(" | "[" | "{";
type PlumberRouteMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RToken {
  readonly kind: RTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface RDelimiterFrame {
  readonly kind: RDelimiter;
  readonly index: number;
}

interface RStructure {
  readonly tokens: readonly RToken[];
  readonly valid: boolean;
  /** Balanced-delimiter depth immediately before each token is processed. */
  readonly depthBefore: readonly number[];
  readonly pairedDelimiters: ReadonlyMap<number, number>;
}

interface StaticRFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly parameterCount: number;
  readonly parameterNames: readonly string[];
}

interface StaticRCall {
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface StaticRClass {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticPlumberRoute {
  readonly method: PlumberRouteMethod;
  readonly path: string;
  readonly annotationStart: number;
  readonly annotationEnd: number;
  readonly handlerStart: number;
  readonly handlerEnd: number;
}

const R_KEYWORDS = new Set([
  "break",
  "else",
  "FALSE",
  "for",
  "function",
  "if",
  "in",
  "Inf",
  "NA",
  "NaN",
  "next",
  "NULL",
  "repeat",
  "TRUE",
  "while"
] as const);

const PLUMBER_HTTP_METHODS: ReadonlyMap<string, PlumberRouteMethod> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["delete", "DELETE"]
]);

const R_CONTINUATION_TOKENS = new Set([
  "<-",
  "<<-",
  "=",
  "->",
  "->>",
  "(",
  "[",
  "{",
  ",",
  "+",
  "-",
  "*",
  "/",
  "^",
  "$",
  "@",
  ":",
  "|",
  "&",
  "~",
  "%",
  "<",
  ">"
] as const);

function isIdentifierStart(character: string, next: string): boolean {
  return /[A-Za-z_]/u.test(character) || (character === "." && /[A-Za-z_]/u.test(next));
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_.]/u.test(character);
}

function tokenizeR(sourceText: string): { readonly tokens: readonly RToken[]; readonly valid: boolean } {
  const tokens: RToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (character === "#") {
      const start = index;
      while (index < sourceText.length && !/[\r\n]/u.test(sourceText[index] ?? "")) {
        index += 1;
      }
      tokens.push({ kind: "comment", text: sourceText.slice(start, index), start, end: index });
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      const start = index;
      index += 1;
      let closed = false;
      while (index < sourceText.length) {
        const next = sourceText[index] ?? "";
        if (next === "\\") {
          index += 2;
          continue;
        }
        if (next === character) {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        return { tokens, valid: false };
      }
      tokens.push({ kind: "string", text: sourceText.slice(start, index), start, end: index });
      continue;
    }

    if (isIdentifierStart(character, sourceText[index + 1] ?? "")) {
      const start = index;
      index += 1;
      while (index < sourceText.length && isIdentifierPart(sourceText[index] ?? "")) {
        index += 1;
      }
      const text = sourceText.slice(start, index);
      tokens.push({
        kind: R_KEYWORDS.has(text as never) ? "keyword" : "identifier",
        text,
        start,
        end: index
      });
      continue;
    }

    const operator = ["<<-", "->>", "<-", "->"].find((candidate) =>
      sourceText.startsWith(candidate, index)
    );
    if (operator !== undefined) {
      tokens.push({ kind: "symbol", text: operator, start: index, end: index + operator.length });
      index += operator.length;
      continue;
    }

    tokens.push({ kind: "symbol", text: character, start: index, end: index + 1 });
    index += 1;
  }

  return { tokens, valid: true };
}

function analyzeRStructure(sourceText: string): RStructure {
  const lexed = tokenizeR(sourceText);
  const depthBefore: number[] = [];
  const pairedDelimiters = new Map<number, number>();
  if (!lexed.valid) {
    return { tokens: lexed.tokens, valid: false, depthBefore, pairedDelimiters };
  }

  const delimiters: RDelimiterFrame[] = [];
  let valid = true;
  const closeDelimiter = (expected: RDelimiter, closingIndex: number): void => {
    const opening = delimiters.pop();
    if (opening?.kind !== expected) {
      valid = false;
      return;
    }
    pairedDelimiters.set(opening.index, closingIndex);
  };

  for (let index = 0; index < lexed.tokens.length; index += 1) {
    const token = lexed.tokens[index];
    if (token === undefined) {
      continue;
    }
    depthBefore[index] = delimiters.length;
    if (token.text === "(" || token.text === "[" || token.text === "{") {
      delimiters.push({ kind: token.text, index });
    } else if (token.text === ")") {
      closeDelimiter("(", index);
    } else if (token.text === "]") {
      closeDelimiter("[", index);
    } else if (token.text === "}") {
      closeDelimiter("{", index);
    }
  }

  if (delimiters.length > 0) {
    valid = false;
  }
  return { tokens: lexed.tokens, valid, depthBefore, pairedDelimiters };
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
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle;
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

function startsDirectStatement(sourceText: string, tokens: readonly RToken[], index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = tokens[index - 1];
  const current = tokens[index];
  if (previous === undefined || current === undefined) {
    return false;
  }
  return previous.text === ";" || /[;\r\n]/u.test(sourceText.slice(previous.end, current.start));
}

function endsDirectStatement(sourceText: string, tokens: readonly RToken[], index: number): boolean {
  const current = tokens[index];
  const next = tokens[index + 1];
  if (current === undefined) {
    return false;
  }
  if (next === undefined || next.text === ";") {
    return true;
  }
  return /[;\r\n]/u.test(sourceText.slice(current.end, next.start));
}

function atLineStart(sourceText: string, offset: number): boolean {
  const lastCarriageReturn = sourceText.lastIndexOf("\r", offset - 1);
  const lastLineFeed = sourceText.lastIndexOf("\n", offset - 1);
  const lineStart = Math.max(lastCarriageReturn, lastLineFeed) + 1;
  return /^[ \t]*$/u.test(sourceText.slice(lineStart, offset));
}

function previousCodeTokenIndex(tokens: readonly RToken[], index: number): number | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor]?.kind !== "comment") {
      return cursor;
    }
  }
  return null;
}

function startsDirectRootStatement(sourceText: string, structure: RStructure, index: number): boolean {
  if (!startsDirectStatement(sourceText, structure.tokens, index)) return false;
  const previousIndex = previousCodeTokenIndex(structure.tokens, index);
  if (previousIndex === null) return true;
  const previous = structure.tokens[previousIndex];
  if (previous?.text === "else" || previous?.text === "repeat") return false;
  if (previous?.text !== ")") return true;
  let openingIndex: number | undefined;
  for (const [opening, closing] of structure.pairedDelimiters) {
    if (closing === previousIndex) {
      openingIndex = opening;
      break;
    }
  }
  const control = openingIndex === undefined ? undefined : structure.tokens[openingIndex - 1]?.text;
  return !["if", "for", "while"].includes(control ?? "");
}

function startsStandaloneAnnotation(sourceText: string, structure: RStructure, index: number): boolean {
  const annotation = structure.tokens[index];
  if (
    annotation === undefined ||
    annotation.kind !== "comment" ||
    structure.depthBefore[index] !== 0 ||
    !atLineStart(sourceText, annotation.start)
  ) {
    return false;
  }
  const previousIndex = previousCodeTokenIndex(structure.tokens, index);
  if (previousIndex === null) {
    return true;
  }
  const previous = structure.tokens[previousIndex];
  if (previous === undefined) {
    return false;
  }
  const gap = sourceText.slice(previous.end, annotation.start);
  return (
    gap.includes(";") ||
    (/[\r\n]/u.test(gap) && !R_CONTINUATION_TOKENS.has(previous.text as never))
  );
}

function staticPlumberAnnotation(token: RToken | undefined): {
  readonly method: PlumberRouteMethod;
  readonly path: string;
} | null {
  if (token?.kind !== "comment") {
    return null;
  }
  const match = /^#(?:\*|')\s*@([A-Za-z]+)\s+(\/[^\s#\\]*)\s*$/u.exec(token.text);
  if (match === null) {
    return null;
  }
  const method = PLUMBER_HTTP_METHODS.get((match[1] ?? "").toLowerCase());
  const path = match[2] ?? "";
  return method === undefined || path.length === 0 ? null : { method, path };
}

function directAnnotatedFunction(
  sourceText: string,
  structure: RStructure,
  annotationIndex: number
): StaticPlumberRoute | null {
  const annotation = structure.tokens[annotationIndex];
  const directive = staticPlumberAnnotation(annotation);
  const functionIndex = annotationIndex + 1;
  const functionToken = structure.tokens[functionIndex];
  if (
    annotation === undefined ||
    directive === null ||
    !startsStandaloneAnnotation(sourceText, structure, annotationIndex) ||
    functionToken?.text !== "function" ||
    structure.depthBefore[functionIndex] !== 0 ||
    !/^\s*$/u.test(sourceText.slice(annotation.end, functionToken.start))
  ) {
    return null;
  }

  const openingParenthesis = functionIndex + 1;
  const closingParenthesis = structure.pairedDelimiters.get(openingParenthesis);
  const bodyStart = closingParenthesis === undefined ? undefined : closingParenthesis + 1;
  const bodyEnd = bodyStart === undefined ? undefined : structure.pairedDelimiters.get(bodyStart);
  const bodyToken = bodyStart === undefined ? undefined : structure.tokens[bodyStart];
  const bodyEndToken = bodyEnd === undefined ? undefined : structure.tokens[bodyEnd];
  if (
    structure.tokens[openingParenthesis]?.text !== "(" ||
    closingParenthesis === undefined ||
    bodyToken?.text !== "{" ||
    bodyEnd === undefined ||
    bodyEndToken === undefined ||
    !endsDirectStatement(sourceText, structure.tokens, bodyEnd)
  ) {
    return null;
  }
  return {
    method: directive.method,
    path: directive.path,
    annotationStart: annotation.start,
    annotationEnd: annotation.end,
    handlerStart: functionToken.start,
    handlerEnd: bodyEndToken.end
  };
}

function collectTopLevelRFunctions(
  sourceText: string,
  structure: RStructure
): readonly StaticRFunction[] {
  const parameterFacts = (openingParenthesis: number, closingParenthesis: number): {
    readonly count: number;
    readonly names: readonly string[];
  } => {
    const openingDepth = structure.depthBefore[openingParenthesis];
    if (openingDepth === undefined) return { count: 0, names: [] };
    const parameterDepth = openingDepth + 1;
    let count = 0;
    let hasParameter = false;
    let expectName = true;
    const names: string[] = [];
    for (let cursor = openingParenthesis + 1; cursor < closingParenthesis; cursor += 1) {
      const token = structure.tokens[cursor];
      if (token === undefined || structure.depthBefore[cursor] !== parameterDepth) continue;
      if (token.text === ",") {
        if (hasParameter) count += 1;
        hasParameter = false;
        expectName = true;
        continue;
      }
      hasParameter = true;
      if (expectName && token.kind === "identifier") {
        names.push(token.text);
        expectName = false;
      }
    }
    if (hasParameter) count += 1;
    return { count, names };
  };
  const functions: StaticRFunction[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const nameToken = structure.tokens[index];
    if (
      nameToken?.kind !== "identifier" ||
      structure.depthBefore[index] !== 0 ||
      !startsDirectRootStatement(sourceText, structure, index)
    ) {
      continue;
    }
    const assignment = structure.tokens[index + 1];
    const functionToken = structure.tokens[index + 2];
    const openingParenthesis = index + 3;
    const closingParenthesis = structure.pairedDelimiters.get(openingParenthesis);
    if (
      (assignment?.text !== "<-" && assignment?.text !== "=") ||
      functionToken?.text !== "function" ||
      structure.tokens[openingParenthesis]?.text !== "(" ||
      closingParenthesis === undefined
    ) {
      continue;
    }
    let bodyStart = closingParenthesis + 1;
    while (structure.tokens[bodyStart]?.kind === "comment") bodyStart += 1;
    const bodyToken = structure.tokens[bodyStart];
    if (bodyToken === undefined || structure.depthBefore[bodyStart] !== 0) continue;
    if (bodyToken.text === "{") {
      const bodyEnd = structure.pairedDelimiters.get(bodyStart);
      const bodyEndToken = bodyEnd === undefined ? undefined : structure.tokens[bodyEnd];
      if (bodyEnd === undefined || bodyEndToken === undefined || !endsDirectStatement(sourceText, structure.tokens, bodyEnd)) {
        continue;
      }
      const parameters = parameterFacts(openingParenthesis, closingParenthesis);
      functions.push({
        name: nameToken.text,
        start: nameToken.start,
        end: bodyEndToken.end,
        bodyStart,
        bodyEnd,
        parameterCount: parameters.count,
        parameterNames: parameters.names
      });
      continue;
    }

    let previousCodeIndex: number | null = null;
    let expressionEnd: RToken | undefined;
    let expressionEndIndex: number | undefined;
    for (let cursor = bodyStart; cursor < structure.tokens.length; cursor += 1) {
      const token = structure.tokens[cursor];
      if (token === undefined || token.kind === "comment") continue;
      if (cursor > bodyStart && structure.depthBefore[cursor] === 0 && previousCodeIndex !== null) {
        const previous = structure.tokens[previousCodeIndex];
        if (token.text === ";") break;
        if (
          previous !== undefined &&
          /[\r\n]/u.test(sourceText.slice(previous.end, token.start)) &&
          !R_CONTINUATION_TOKENS.has(previous.text as never) &&
          !R_CONTINUATION_TOKENS.has(token.text as never) &&
          token.text !== "else"
        ) {
          break;
        }
      }
      previousCodeIndex = cursor;
      expressionEnd = token;
      expressionEndIndex = cursor;
    }
    if (expressionEnd !== undefined && expressionEndIndex !== undefined) {
      const parameters = parameterFacts(openingParenthesis, closingParenthesis);
      functions.push({
        name: nameToken.text,
        start: nameToken.start,
        end: expressionEnd.end,
        bodyStart,
        bodyEnd: expressionEndIndex,
        parameterCount: parameters.count,
        parameterNames: parameters.names
      });
    }
  }
  const ordered = functions.sort((left, right) => left.start - right.start || left.end - right.end);
  const direct: StaticRFunction[] = [];
  let coveredUntil = -1;
  for (const declaration of ordered) {
    if (declaration.start < coveredUntil) continue;
    direct.push(declaration);
    coveredUntil = declaration.end;
  }
  return direct;
}

const R_DYNAMIC_BINDING_CALLS = new Set(["source", "library", "load", "attach", "assign"]);
const R_DYNAMIC_DISPATCH_NAMES = new Set(["UseMethod", "NextMethod", "setMethod", "setGeneric", "standardGeneric"]);
const R_QUOTING_CALLS = new Set(["quote", "substitute", "bquote", "enquote"]);

function callArgumentCount(
  structure: RStructure,
  openingParenthesis: number,
  closingParenthesis: number
): number {
  const openingDepth = structure.depthBefore[openingParenthesis];
  if (openingDepth === undefined) return 0;
  const argumentDepth = openingDepth + 1;
  let count = 0;
  let hasArgument = false;
  for (let cursor = openingParenthesis + 1; cursor < closingParenthesis; cursor += 1) {
    const token = structure.tokens[cursor];
    if (token === undefined || structure.depthBefore[cursor] !== argumentDepth) continue;
    if (token.text === ",") {
      if (hasArgument) count += 1;
      hasArgument = false;
      continue;
    }
    if (token.kind !== "comment") hasArgument = true;
  }
  if (hasArgument) count += 1;
  return count;
}

function collectDirectRCalls(
  structure: RStructure,
  declaration: StaticRFunction,
  declaredNames: ReadonlySet<string>,
  dynamicDispatchNames: ReadonlySet<string>
): readonly StaticRCall[] {
  const openingBody = structure.tokens[declaration.bodyStart];
  const closingBody = structure.tokens[declaration.bodyEnd];
  const bracedBody = openingBody?.text === "{" && closingBody?.text === "}";
  const firstToken = declaration.bodyStart + (bracedBody ? 1 : 0);
  const lastToken = declaration.bodyEnd - (bracedBody ? 1 : 0);
  const parameterNames = new Set(declaration.parameterNames);
  const assignedNames = new Set<string>();
  for (let cursor = firstToken; cursor <= lastToken; cursor += 1) {
    const token = structure.tokens[cursor];
    const next = structure.tokens[cursor + 1];
    const previous = structure.tokens[cursor - 1];
    if (token?.kind === "identifier" && ["<-", "=", "<<-"].includes(next?.text ?? "")) {
      assignedNames.add(token.text);
    }
    if (token?.kind === "identifier" && ["->", "->>"].includes(previous?.text ?? "")) {
      assignedNames.add(token.text);
    }
  }
  for (let cursor = firstToken; cursor <= lastToken; cursor += 1) {
    if (structure.tokens[cursor]?.text === "function") return [];
  }

  const calls: StaticRCall[] = [];
  for (let cursor = firstToken; cursor <= lastToken; cursor += 1) {
    const token = structure.tokens[cursor];
    const openingParenthesis = structure.tokens[cursor + 1];
    if (token?.kind !== "identifier" || openingParenthesis?.text !== "(") continue;
    if (
      !declaredNames.has(token.text) ||
      dynamicDispatchNames.has(token.text) ||
      parameterNames.has(token.text) ||
      assignedNames.has(token.text)
    ) continue;
    const previous = structure.tokens[cursor - 1];
    const beforePrevious = structure.tokens[cursor - 2];
    if (["$", "@", ".", ":"].includes(previous?.text ?? "") || beforePrevious?.text === ":") continue;
    if (beforePrevious?.kind === "identifier" && R_QUOTING_CALLS.has(beforePrevious.text)) continue;
    const closingParenthesis = structure.pairedDelimiters.get(cursor + 1);
    if (closingParenthesis === undefined || closingParenthesis > lastToken) continue;
    calls.push({
      referenceName: token.text,
      argumentCount: callArgumentCount(structure, cursor + 1, closingParenthesis),
      start: token.start,
      end: (structure.tokens[closingParenthesis]?.end ?? openingParenthesis.end)
    });
  }
  return calls;
}

function hasBindingTaint(structure: RStructure): boolean {
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const token = structure.tokens[index];
    const next = structure.tokens[index + 1];
    if (
      token?.kind === "identifier" &&
      next?.text === "(" &&
      R_DYNAMIC_BINDING_CALLS.has(token.text)
    ) {
      return true;
    }
  }
  return false;
}

function hasDynamicDispatch(structure: RStructure, declaration: StaticRFunction): boolean {
  const firstToken = declaration.bodyStart + (structure.tokens[declaration.bodyStart]?.text === "{" ? 1 : 0);
  const lastToken = declaration.bodyEnd - (structure.tokens[declaration.bodyEnd]?.text === "}" ? 1 : 0);
  for (let cursor = firstToken; cursor <= lastToken; cursor += 1) {
    const token = structure.tokens[cursor];
    if (token?.kind === "identifier" && R_DYNAMIC_DISPATCH_NAMES.has(token.text)) return true;
  }
  return false;
}

function collectTopLevelRClasses(
  sourceText: string,
  structure: RStructure
): readonly StaticRClass[] {
  const classes: StaticRClass[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const declarationToken = structure.tokens[index];
    if (
      declarationToken?.kind !== "identifier" ||
      !["setClass", "setRefClass"].includes(declarationToken.text) ||
      structure.depthBefore[index] !== 0 ||
      !startsDirectRootStatement(sourceText, structure, index) ||
      structure.tokens[index + 1]?.text !== "("
    ) {
      continue;
    }
    const closing = structure.pairedDelimiters.get(index + 1);
    const firstArgument = structure.tokens[index + 2];
    const afterFirstArgument = structure.tokens[index + 3];
    const closingToken = closing === undefined ? undefined : structure.tokens[closing];
    if (
      closing === undefined ||
      firstArgument?.kind !== "string" ||
      closingToken === undefined ||
      (afterFirstArgument !== undefined && afterFirstArgument.text !== "," && afterFirstArgument.text !== ")") ||
      !endsDirectStatement(sourceText, structure.tokens, closing)
    ) {
      continue;
    }
    const rawName = firstArgument.text.slice(1, -1);
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/u.test(rawName)) {
      continue;
    }
    classes.push({ name: rawName, start: declarationToken.start, end: closingToken.end });
  }
  return classes;
}

function collectPlumberRoutes(sourceText: string, structure: RStructure): readonly StaticPlumberRoute[] {
  const routes: StaticPlumberRoute[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const route = directAnnotatedFunction(sourceText, structure, index);
    if (route !== null) {
      routes.push(route);
    }
  }
  return routes;
}

/**
 * Extracts top-level R function bindings and a narrow Plumber annotation subset.
 * Routes require a standalone `#*` or `#'` HTTP annotation immediately followed
 * by a top-level, braced anonymous `function(...) { ... }` handler.
 */
export function extractRFileFacts(input: RExtractFileFactsInput): ArtifactFacts {
  const plumberCapability = frameworkCapability("plumber");
  if (!plumberCapability.languages.includes(input.language)) {
    throw new Error("Plumber extraction was invoked for an unsupported source language.");
  }

  const structure = analyzeRStructure(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const rFunctionFacts: RFunctionFact[] = [];
  const rCallFacts: RCallFact[] = [];
  const topLevelFunctions = structure.valid ? collectTopLevelRFunctions(input.sourceText, structure) : [];
  const functionSymbolsByStart = new Map<number, SymbolNode>();
  const bindingTainted = structure.valid && hasBindingTaint(structure);
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

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
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

  function addFunction(
    name: string,
    qualifiedName: string,
    start: number,
    end: number,
    isExported: boolean
  ): SymbolNode {
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, start, end),
      isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, start, end);
    return symbol;
  }

  function addClass(name: string, start: number, end: number): SymbolNode {
    const qualifiedName = `${fileNode.qualifiedName}#class:${name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, start, end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, start, end);
    return symbol;
  }

  function addPlumberRoute(routeFact: StaticPlumberRoute, handler: SymbolNode): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${fileNode.qualifiedName}#route:${routeName}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeFor(lineStarts, routeFact.annotationStart, routeFact.annotationEnd);
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
    addContainment(fileNode, route, routeFact.annotationStart, routeFact.annotationEnd);
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
        ruleId: "framework.plumber.annotation.literal-route.braced-handler",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (structure.valid) {
    const declarations = [
      ...topLevelFunctions.map((declaration) => ({
        kind: "function" as const,
        start: declaration.start,
        declaration
      })),
      ...collectTopLevelRClasses(input.sourceText, structure).map((declaration) => ({
        kind: "class" as const,
        start: declaration.start,
        declaration
      })),
      ...collectPlumberRoutes(input.sourceText, structure).map((route) => ({
        kind: "route" as const,
        start: route.handlerStart,
        route
      }))
    ].sort((left, right) => left.start - right.start);

    for (const declaration of declarations) {
      if (declaration.kind === "function") {
        const functionFact = declaration.declaration;
        const functionSymbol = addFunction(
          functionFact.name,
          `${fileNode.qualifiedName}#${functionFact.name}`,
          functionFact.start,
          functionFact.end,
          true
        );
        functionSymbolsByStart.set(functionFact.start, functionSymbol);
        rFunctionFacts.push({
          symbolId: functionSymbol.id,
          filePath: input.filePath,
          name: functionFact.name,
          parameterCount: functionFact.parameterCount,
          parameterNames: functionFact.parameterNames,
          dynamicDispatch: hasDynamicDispatch(structure, functionFact),
          range: functionSymbol.range
        });
        continue;
      }
      if (declaration.kind === "class") {
        const classFact = declaration.declaration;
        addClass(classFact.name, classFact.start, classFact.end);
        continue;
      }
      const routeFact = declaration.route;
      const handlerName = `${routeFact.method} ${routeFact.path} handler`;
      const handler = addFunction(
        handlerName,
        `${fileNode.qualifiedName}#handler:${routeFact.method}:${routeFact.path}`,
        routeFact.handlerStart,
        routeFact.handlerEnd,
        false
      );
      addPlumberRoute(routeFact, handler);
    }

    if (!bindingTainted) {
      const declaredNames = new Set(topLevelFunctions.map((declaration) => declaration.name));
      const dynamicDispatchNames = new Set(
        topLevelFunctions
          .filter((declaration) => hasDynamicDispatch(structure, declaration))
          .map((declaration) => declaration.name)
      );
      for (const functionFact of topLevelFunctions) {
        const source = functionSymbolsByStart.get(functionFact.start);
        if (source === undefined || hasDynamicDispatch(structure, functionFact)) continue;
        for (const call of collectDirectRCalls(
          structure,
          functionFact,
          declaredNames,
          dynamicDispatchNames
        )) {
          rCallFacts.push({
            sourceId: source.id,
            filePath: input.filePath,
            referenceName: call.referenceName,
            argumentCount: call.argumentCount,
            range: rangeFor(lineStarts, call.start, call.end)
          });
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
    rFacts: {
      parserRejected: !structure.valid,
      bindingTainted,
      functions: rFunctionFacts,
      calls: rCallFacts
    } satisfies RFacts
  };
}

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
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
        if (/[\r\n]/u.test(next)) {
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
  const functions: StaticRFunction[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const nameToken = structure.tokens[index];
    if (
      nameToken?.kind !== "identifier" ||
      structure.depthBefore[index] !== 0 ||
      !startsDirectStatement(sourceText, structure.tokens, index)
    ) {
      continue;
    }
    const assignment = structure.tokens[index + 1];
    const functionToken = structure.tokens[index + 2];
    const openingParenthesis = index + 3;
    const closingParenthesis = structure.pairedDelimiters.get(openingParenthesis);
    const bodyStart = closingParenthesis === undefined ? undefined : closingParenthesis + 1;
    const bodyEnd = bodyStart === undefined ? undefined : structure.pairedDelimiters.get(bodyStart);
    const bodyToken = bodyStart === undefined ? undefined : structure.tokens[bodyStart];
    const bodyEndToken = bodyEnd === undefined ? undefined : structure.tokens[bodyEnd];
    if (
      (assignment?.text !== "<-" && assignment?.text !== "=") ||
      functionToken?.text !== "function" ||
      structure.tokens[openingParenthesis]?.text !== "(" ||
      closingParenthesis === undefined ||
      bodyToken?.text !== "{" ||
      bodyEnd === undefined ||
      bodyEndToken === undefined ||
      !endsDirectStatement(sourceText, structure.tokens, bodyEnd)
    ) {
      continue;
    }
    functions.push({ name: nameToken.text, start: nameToken.start, end: bodyEndToken.end });
  }
  return functions;
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
      !startsDirectStatement(sourceText, structure.tokens, index) ||
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
      ...collectTopLevelRFunctions(input.sourceText, structure).map((declaration) => ({
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
        addFunction(
          functionFact.name,
          `${fileNode.qualifiedName}#${functionFact.name}`,
          functionFact.start,
          functionFact.end,
          true
        );
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
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: []
  };
}

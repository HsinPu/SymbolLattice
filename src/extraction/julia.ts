import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface JuliaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "julia";
}

type JuliaTokenKind = "word" | "string" | "symbol";

interface JuliaToken {
  readonly kind: JuliaTokenKind;
  readonly text: string;
  readonly value: string | undefined;
  readonly escaped: boolean | undefined;
  readonly start: number;
  readonly end: number;
}

interface StaticJuliaFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly isZeroArgument: boolean;
}

interface StaticJuliaDirectCall {
  readonly callerName: string;
  readonly callerStart: number;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticGenieRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticJuliaFacts {
  readonly valid: boolean;
  readonly functions: readonly StaticJuliaFunction[];
  readonly methodDeclarationNames: readonly string[];
  readonly calls: readonly StaticJuliaDirectCall[];
  readonly routes: readonly StaticGenieRoute[];
}

interface LexicalJuliaTokens {
  readonly valid: boolean;
  readonly tokens: readonly JuliaToken[];
}

interface DelimiterPairs {
  readonly valid: boolean;
  readonly pairs: ReadonlyMap<number, number>;
}

const GENIE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS"
};

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
]);

const CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  ["]", "["],
  [")", "("]
]);

const JULIA_BLOCK_OPENERS = new Set([
  "begin",
  "do",
  "for",
  "function",
  "if",
  "let",
  "macro",
  "module",
  "baremodule",
  "quote",
  "struct",
  "try",
  "while"
]);

function isJuliaWordStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/u.test(value);
}

function isJuliaWordPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_!]/u.test(value);
}

function isSimpleJuliaIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*!?$/u.test(value);
}

function lexJulia(sourceText: string): LexicalJuliaTokens {
  const tokens: JuliaToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
    }

    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }

    if (current === "#") {
      if (sourceText.slice(index, index + 2) === "#=") {
        const closingIndex = sourceText.indexOf("=#", index + 2);
        if (closingIndex === -1) {
          return { valid: false, tokens: [] };
        }
        index = closingIndex + 2;
        continue;
      }
      const nextLine = sourceText.indexOf("\n", index);
      index = nextLine === -1 ? sourceText.length : nextLine + 1;
      continue;
    }

    if (sourceText.slice(index, index + 3) === "\"\"\"") {
      return { valid: false, tokens: [] };
    }

    if (current === "'") {
      return { valid: false, tokens: [] };
    }

    if (current === "\"") {
      const start = index;
      let escaped = false;
      index += 1;
      let closed = false;
      while (index < sourceText.length) {
        const value = sourceText[index];
        if (value === "\\") {
          escaped = true;
          index += 1;
          if (index >= sourceText.length) {
            return { valid: false, tokens: [] };
          }
          index += 1;
          continue;
        }
        if (value === "\"") {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        return { valid: false, tokens: [] };
      }
      tokens.push({
        kind: "string",
        text: sourceText.slice(start, index),
        value: sourceText.slice(start + 1, index - 1),
        escaped,
        start,
        end: index
      });
      continue;
    }

    if (isJuliaWordStart(current)) {
      const start = index;
      index += 1;
      while (isJuliaWordPart(sourceText[index])) {
        index += 1;
      }
      tokens.push({
        kind: "word",
        text: sourceText.slice(start, index),
        value: undefined,
        escaped: undefined,
        start,
        end: index
      });
      continue;
    }

    const start = index;
    const paired = sourceText.slice(index, index + 2);
    if (
      paired === "::" ||
      paired === "=>" ||
      paired === "==" ||
      paired === "!=" ||
      paired === "<=" ||
      paired === ">="
    ) {
      index += 2;
    } else {
      index += 1;
    }
    tokens.push({
      kind: "symbol",
      text: sourceText.slice(start, index),
      value: undefined,
      escaped: undefined,
      start,
      end: index
    });
  }

  return { valid: true, tokens };
}

function delimiterPairs(tokens: readonly JuliaToken[]): DelimiterPairs {
  const pairs = new Map<number, number>();
  const stack: number[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "symbol") {
      continue;
    }
    if (OPEN_TO_CLOSE.has(token.text)) {
      stack.push(index);
      continue;
    }
    const expectedOpen = CLOSE_TO_OPEN.get(token.text);
    if (expectedOpen === undefined) {
      continue;
    }
    const openIndex = stack.pop();
    if (openIndex === undefined || tokens[openIndex]?.text !== expectedOpen) {
      return { valid: false, pairs: new Map() };
    }
    pairs.set(openIndex, index);
  }

  return stack.length === 0 ? { valid: true, pairs } : { valid: false, pairs: new Map() };
}

function isDirectGenieUse(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number
): boolean {
  return (
    tokens[index]?.kind === "word" &&
    tokens[index]?.text === "using" &&
    tokens[index + 1]?.kind === "word" &&
    tokens[index + 1]?.text === "Genie" &&
    startsDirectStatement(sourceText, tokens, index)
  );
}

function directJuliaFunction(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): StaticJuliaFunction | null {
  const name = tokens[index];
  const parameterOpen = tokens[index + 1];
  if (
    name?.kind !== "word" ||
    !isSimpleJuliaIdentifier(name.text) ||
    parameterOpen?.text !== "(" ||
    !startsDirectStatement(sourceText, tokens, index)
  ) {
    return null;
  }
  const parameterCloseIndex = pairs.get(index + 1);
  const equals =
    parameterCloseIndex === undefined ? undefined : tokens[parameterCloseIndex + 1];
  if (equals?.text !== "=") {
    return null;
  }
  return {
    name: name.text,
    start: name.start,
    end: equals.end,
    isZeroArgument: parameterCloseIndex === index + 2
  };
}

function directJuliaZeroArgumentBareCall(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): StaticJuliaDirectCall | null {
  const caller = directJuliaFunction(sourceText, tokens, index, pairs);
  if (caller === null || !caller.isZeroArgument) {
    return null;
  }
  const callerParameterClose = pairs.get(index + 1);
  const calleeIndex = callerParameterClose === undefined ? undefined : callerParameterClose + 2;
  const callee = calleeIndex === undefined ? undefined : tokens[calleeIndex];
  const opening = calleeIndex === undefined ? undefined : tokens[calleeIndex + 1];
  if (calleeIndex === undefined || callee?.kind !== "word" || !isSimpleJuliaIdentifier(callee.text) || opening?.text !== "(") {
    return null;
  }
  const closingIndex = pairs.get(calleeIndex + 1);
  const next = closingIndex === undefined ? undefined : tokens[closingIndex + 1];
  if (
    closingIndex !== calleeIndex + 2 ||
    (next !== undefined && !startsDirectStatement(sourceText, tokens, closingIndex + 1))
  ) {
    return null;
  }
  return {
    callerName: caller.name,
    callerStart: caller.start,
    calleeName: callee.text,
    start: callee.start,
    end: callee.end
  };
}

function directJuliaFullFormMethodName(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): string | null {
  const keyword = tokens[index];
  if (
    keyword?.kind !== "word" ||
    keyword.text !== "function" ||
    !startsDirectStatement(sourceText, tokens, index)
  ) {
    return null;
  }
  const name = tokens[index + 1];
  const parameterOpen = tokens[index + 2];
  if (name?.kind === "word" && isSimpleJuliaIdentifier(name.text) && parameterOpen?.text === "(") {
    return pairs.get(index + 2) === undefined ? null : name.text;
  }
  const qualifier = tokens[index + 1];
  const separator = tokens[index + 2];
  const qualifiedName = tokens[index + 3];
  const qualifiedParameterOpen = tokens[index + 4];
  return qualifier?.kind === "word" &&
    qualifier.text === "Main" &&
    separator?.text === "." &&
    qualifiedName?.kind === "word" &&
    isSimpleJuliaIdentifier(qualifiedName.text) &&
    qualifiedParameterOpen?.text === "(" &&
    pairs.get(index + 4) !== undefined
    ? qualifiedName.text
    : null;
}

function hasOnlyJuliaB1TopLevelForms(
  sourceText: string,
  tokens: readonly JuliaToken[],
  pairs: ReadonlyMap<number, number>
): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (!startsDirectStatement(sourceText, tokens, index)) {
      continue;
    }
    const functionFact = directJuliaFunction(sourceText, tokens, index, pairs);
    if (functionFact === null || !functionFact.isZeroArgument) {
      return false;
    }
  }
  return true;
}

function isLiteralSlashPath(
  token: JuliaToken | undefined
): token is JuliaToken & { readonly value: string; readonly escaped: false } {
  return (
    token?.kind === "string" &&
    token.value !== undefined &&
    token.escaped === false &&
    /^\/[^\s\\$]*$/u.test(token.value)
  );
}

function startsDirectStatement(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number
): boolean {
  const current = tokens[index];
  const previous = tokens[index - 1];
  if (current === undefined || previous === undefined) {
    return true;
  }
  if (previous.text === ";") {
    return true;
  }
  return /\r|\n/u.test(sourceText.slice(previous.end, current.start));
}

function directGenieRoute(
  sourceText: string,
  tokens: readonly JuliaToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): StaticGenieRoute | null {
  const route = tokens[index];
  const open = tokens[index + 1];
  const path = tokens[index + 2];
  const separator = tokens[index + 3];
  const handler = tokens[index + 4];
  if (
    route?.kind !== "word" ||
    route.text !== "route" ||
    open?.text !== "(" ||
    !isLiteralSlashPath(path) ||
    separator?.text !== "," ||
    handler?.kind !== "word" ||
    !isSimpleJuliaIdentifier(handler.text) ||
    !startsDirectStatement(sourceText, tokens, index)
  ) {
    return null;
  }

  const closingIndex = pairs.get(index + 1);
  const nextToken = closingIndex === undefined ? undefined : tokens[closingIndex + 1];
  if (
    closingIndex === index + 5 &&
    tokens[closingIndex]?.text === ")" &&
    !(nextToken?.kind === "word" && nextToken.text === "do")
  ) {
    return {
      method: "GET",
      path: path.value,
      handlerName: handler.text,
      start: route.start,
      end: tokens[closingIndex]?.end ?? handler.end
    };
  }

  const methodKeyword = tokens[index + 6];
  const assignment = tokens[index + 7];
  const methodToken = tokens[index + 8];
  const method =
    methodToken?.kind === "word" ? GENIE_METHODS[methodToken.text] : undefined;
  if (
    closingIndex !== index + 9 ||
    tokens[index + 5]?.text !== "," ||
    methodKeyword?.kind !== "word" ||
    methodKeyword.text !== "method" ||
    assignment?.text !== "=" ||
    method === undefined ||
    tokens[closingIndex]?.text !== ")" ||
    (nextToken?.kind === "word" && nextToken.text === "do")
  ) {
    return null;
  }
  return {
    method,
    path: path.value,
    handlerName: handler.text,
    start: route.start,
    end: tokens[closingIndex]?.end ?? methodToken?.end ?? handler.end
  };
}

function staticJuliaFacts(sourceText: string): StaticJuliaFacts {
  const lexical = lexJulia(sourceText);
  if (!lexical.valid) {
    return { valid: false, functions: [], methodDeclarationNames: [], calls: [], routes: [] };
  }
  const delimiters = delimiterPairs(lexical.tokens);
  if (!delimiters.valid) {
    return { valid: false, functions: [], methodDeclarationNames: [], calls: [], routes: [] };
  }

  const functions: StaticJuliaFunction[] = [];
  const methodDeclarationNames: string[] = [];
  const calls: StaticJuliaDirectCall[] = [];
  const routes: StaticGenieRoute[] = [];
  let directGenieUseCount = 0;
  let delimiterDepth = 0;
  let blockDepth = 0;
  const blockOpeners: string[] = [];

  for (let index = 0; index < lexical.tokens.length; index += 1) {
    const token = lexical.tokens[index];
    if (token === undefined) {
      continue;
    }

    const inTopLevelBegin = blockDepth === 1 && blockOpeners.at(-1) === "begin";
    if (delimiterDepth === 0 && (blockDepth === 0 || inTopLevelBegin)) {
      const functionFact = directJuliaFunction(
        sourceText,
        lexical.tokens,
        index,
        delimiters.pairs
      );
      if (functionFact !== null) {
        if (blockDepth === 0) {
          functions.push(functionFact);
        }
        methodDeclarationNames.push(functionFact.name);
      }
      const fullFormMethodName = directJuliaFullFormMethodName(
        sourceText,
        lexical.tokens,
        index,
        delimiters.pairs
      );
      if (fullFormMethodName !== null) {
        methodDeclarationNames.push(fullFormMethodName);
      }
      if (blockDepth === 0) {
        if (isDirectGenieUse(sourceText, lexical.tokens, index)) {
          directGenieUseCount += 1;
        }
        const callFact = directJuliaZeroArgumentBareCall(
          sourceText,
          lexical.tokens,
          index,
          delimiters.pairs
        );
        if (callFact !== null) {
          calls.push(callFact);
        }
        const routeFact = directGenieRoute(
          sourceText,
          lexical.tokens,
          index,
          delimiters.pairs
        );
        if (routeFact !== null) {
          routes.push(routeFact);
        }
      }
    }

    if (token.kind === "word" && delimiterDepth === 0) {
      if (token.text === "end") {
        if (blockDepth === 0) {
          return { valid: false, functions: [], methodDeclarationNames: [], calls: [], routes: [] };
        }
        blockDepth -= 1;
        blockOpeners.pop();
      } else if (JULIA_BLOCK_OPENERS.has(token.text)) {
        blockDepth += 1;
        blockOpeners.push(token.text);
      }
    }

    if (token.kind !== "symbol") {
      continue;
    }
    if (OPEN_TO_CLOSE.has(token.text)) {
      delimiterDepth += 1;
    } else if (CLOSE_TO_OPEN.has(token.text)) {
      delimiterDepth -= 1;
    }
  }

  if (blockDepth !== 0) {
    return { valid: false, functions: [], methodDeclarationNames: [], calls: [], routes: [] };
  }
  return {
    valid: true,
    functions,
    methodDeclarationNames,
    calls: hasOnlyJuliaB1TopLevelForms(sourceText, lexical.tokens, delimiters.pairs) ? calls : [],
    routes: directGenieUseCount === 1 ? routes : []
  };
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], index: number): SourcePosition {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= index) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const lineStart = lineStarts[low] ?? 0;
  return { line: low + 1, column: index - lineStart + 1 };
}

function rangeFor(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, Math.max(start, end))
  };
}

/**
 * Extracts direct Julia one-line functions and a narrow Genie route subset.
 * Exact routes require a direct using Genie proof and a unique same-file function.
 */
export function extractJuliaFileFacts(input: JuliaExtractFileFactsInput): ArtifactFacts {
  const genieCapability = frameworkCapability("genie");
  if (!genieCapability.languages.includes(input.language)) {
    throw new Error("Genie extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticJuliaFacts(input.sourceText);
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
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
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

  function addFunction(functionFact: StaticJuliaFunction): SymbolNode {
    const qualifiedName = fileNode.qualifiedName + "." + functionFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: functionFact.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, functionFact.start, functionFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, functionFact.start, functionFact.end);
    return symbol;
  }

  function addGenieRoute(routeFact: StaticGenieRoute, handler: SymbolNode | null): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = fileNode.qualifiedName + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeFor(lineStarts, routeFact.start, routeFact.end);
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
    addContainment(route, routeFact.start, routeFact.end);
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: routeFact.handlerName
      }),
      sourceId: route.id,
      targetId: handler?.id ?? null,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: handler === null ? "unresolved" : "exact",
      confidence: handler === null ? 0 : 1,
      referenceName: routeFact.handlerName,
      evidence: {
        ruleId:
          handler === null
            ? "framework.genie.direct-route.literal-named-function.unresolved"
            : "framework.genie.direct-route.literal-named-function.local-function",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  if (staticFacts.valid) {
    const functionsByName = new Map<string, SymbolNode[]>();
    const functionsByStart = new Map<number, SymbolNode>();
    const zeroArgumentFunctionsByName = new Map<string, SymbolNode[]>();
    const methodDeclarationCounts = new Map<string, number>();
    for (const name of staticFacts.methodDeclarationNames) {
      methodDeclarationCounts.set(name, (methodDeclarationCounts.get(name) ?? 0) + 1);
    }
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
      functionsByStart.set(functionFact.start, symbol);
      if (functionFact.isZeroArgument) {
        zeroArgumentFunctionsByName.set(functionFact.name, [
          ...(zeroArgumentFunctionsByName.get(functionFact.name) ?? []),
          symbol
        ]);
      }
    }
    for (const callFact of [...staticFacts.calls].sort((left, right) => left.start - right.start)) {
      const caller = functionsByStart.get(callFact.callerStart);
      const candidates = functionsByName.get(callFact.calleeName) ?? [];
      const zeroArgumentCandidates = zeroArgumentFunctionsByName.get(callFact.calleeName) ?? [];
      if (
        caller === undefined ||
        candidates.length !== 1 ||
        zeroArgumentCandidates.length !== 1 ||
        methodDeclarationCounts.get(callFact.calleeName) !== 1
      ) {
        continue;
      }
      const callee = zeroArgumentCandidates[0];
      if (callee === undefined) {
        continue;
      }
      const range = rangeFor(lineStarts, callFact.start, callFact.end);
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: callee.id,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName: callFact.calleeName
        }),
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: callFact.calleeName,
        evidence: {
          ruleId: "syntax.julia.same-file.unique-zero-argument-bare-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      });
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addGenieRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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

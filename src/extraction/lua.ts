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

export interface LuaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  /** Lua receives the optional Lapis route pass; Luau receives declarations only. */
  readonly language: "lua" | "luau";
}

type LuaTokenKind = "identifier" | "keyword" | "string" | "symbol";
type LuaBlockKind = "function" | "if" | "do" | "repeat";
type LuaDelimiter = "(" | "[" | "{";
type LapisRouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "ALL";

interface LuaToken {
  readonly kind: LuaTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface LuaBlock {
  readonly kind: LuaBlockKind;
  readonly functionTokenIndex?: number;
}

interface LuaDelimiterFrame {
  readonly kind: LuaDelimiter;
  readonly index: number;
}

interface LuaStructure {
  readonly tokens: readonly LuaToken[];
  readonly valid: boolean;
  /** Block and balanced-delimiter depth immediately before each token is processed. */
  readonly depthBefore: readonly number[];
  readonly functionEnds: ReadonlyMap<number, number>;
  readonly pairedParentheses: ReadonlyMap<number, number>;
}

interface StaticLuaFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly isLocal: boolean;
}

interface StaticLuaBinding {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticLapisRoute {
  readonly receiverName: string;
  readonly method: LapisRouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

const LUA_KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "goto",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while"
] as const);

const LAPIS_HTTP_METHODS: ReadonlyMap<string, Exclude<LapisRouteMethod, "ALL">> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["delete", "DELETE"]
]);

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_]/u.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_]/u.test(character);
}

/** Returns the offset after a long-bracket literal, -1 for an unclosed opener, or null. */
function longBracketEnd(sourceText: string, start: number): number | null {
  const opener = /^\[(=*)\[/u.exec(sourceText.slice(start));
  if (opener === null) {
    return null;
  }
  const equals = opener[1] ?? "";
  const closingDelimiter = `]${equals}]`;
  const contentStart = start + opener[0].length;
  const closingStart = sourceText.indexOf(closingDelimiter, contentStart);
  return closingStart < 0 ? -1 : closingStart + closingDelimiter.length;
}

/**
 * A deliberately small Lua lexer. It preserves string/comment boundaries and
 * block delimiters so only a direct, lexical subset can become graph facts.
 */
function tokenizeLua(sourceText: string): { readonly tokens: readonly LuaToken[]; readonly valid: boolean } {
  const tokens: LuaToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (sourceText.startsWith("--", index)) {
      const longCommentEnd = longBracketEnd(sourceText, index + 2);
      if (longCommentEnd === -1) {
        return { tokens, valid: false };
      }
      if (longCommentEnd !== null) {
        index = longCommentEnd;
        continue;
      }
      while (index < sourceText.length && !/[\r\n]/u.test(sourceText[index] ?? "")) {
        index += 1;
      }
      continue;
    }

    if (character === '"' || character === "'") {
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
      tokens.push({
        kind: "string",
        text: sourceText.slice(start, index),
        start,
        end: index
      });
      continue;
    }

    if (character === "[") {
      const end = longBracketEnd(sourceText, index);
      if (end === -1) {
        return { tokens, valid: false };
      }
      if (end !== null) {
        tokens.push({
          kind: "string",
          text: sourceText.slice(index, end),
          start: index,
          end
        });
        index = end;
        continue;
      }
    }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (index < sourceText.length && isIdentifierPart(sourceText[index] ?? "")) {
        index += 1;
      }
      const text = sourceText.slice(start, index);
      tokens.push({
        kind: LUA_KEYWORDS.has(text as never) ? "keyword" : "identifier",
        text,
        start,
        end: index
      });
      continue;
    }

    tokens.push({ kind: "symbol", text: character, start: index, end: index + 1 });
    index += 1;
  }

  return { tokens, valid: true };
}

function analyzeLuaStructure(sourceText: string): LuaStructure {
  const lexed = tokenizeLua(sourceText);
  const depthBefore: number[] = [];
  const functionEnds = new Map<number, number>();
  const pairedParentheses = new Map<number, number>();
  if (!lexed.valid) {
    return {
      tokens: lexed.tokens,
      valid: false,
      depthBefore,
      functionEnds,
      pairedParentheses
    };
  }

  const blockStack: LuaBlock[] = [];
  const delimiterStack: LuaDelimiterFrame[] = [];
  let pendingConditional: "if" | "elseif" | null = null;
  let valid = true;

  const closeDelimiter = (expected: LuaDelimiter, closingIndex: number): void => {
    const opening = delimiterStack.pop();
    if (opening?.kind !== expected) {
      valid = false;
      return;
    }
    if (expected === "(") {
      pairedParentheses.set(opening.index, closingIndex);
    }
  };

  for (let index = 0; index < lexed.tokens.length; index += 1) {
    const token = lexed.tokens[index];
    if (token === undefined) {
      continue;
    }
    depthBefore[index] = blockStack.length + delimiterStack.length;

    if (token.text === "(" || token.text === "[" || token.text === "{") {
      delimiterStack.push({ kind: token.text, index });
    } else if (token.text === ")") {
      closeDelimiter("(", index);
    } else if (token.text === "]") {
      closeDelimiter("[", index);
    } else if (token.text === "}") {
      closeDelimiter("{", index);
    }

    if (token.kind !== "keyword") {
      continue;
    }

    switch (token.text) {
      case "function":
        blockStack.push({ kind: "function", functionTokenIndex: index });
        break;
      case "if":
        pendingConditional = "if";
        break;
      case "elseif":
        pendingConditional = "elseif";
        break;
      case "then":
        if (pendingConditional === "if") {
          blockStack.push({ kind: "if" });
        }
        pendingConditional = null;
        break;
      case "do":
        blockStack.push({ kind: "do" });
        break;
      case "repeat":
        blockStack.push({ kind: "repeat" });
        break;
      case "until": {
        const block = blockStack.pop();
        if (block?.kind !== "repeat") {
          valid = false;
        }
        break;
      }
      case "end": {
        const block = blockStack.pop();
        if (block === undefined || block.kind === "repeat") {
          valid = false;
        } else if (block.kind === "function" && block.functionTokenIndex !== undefined) {
          functionEnds.set(block.functionTokenIndex, index);
        }
        break;
      }
      default:
        break;
    }
  }

  if (blockStack.length > 0 || delimiterStack.length > 0) {
    valid = false;
  }
  return { tokens: lexed.tokens, valid, depthBefore, functionEnds, pairedParentheses };
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

function startsDirectStatement(
  sourceText: string,
  tokens: readonly LuaToken[],
  index: number
): boolean {
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

function endsDirectStatement(
  sourceText: string,
  tokens: readonly LuaToken[],
  index: number
): boolean {
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

function staticPlainLuaString(token: LuaToken | undefined): string | null {
  if (token?.kind !== "string") {
    return null;
  }
  const value = token.text;
  if (
    value.length < 2 ||
    (value[0] !== '"' && value[0] !== "'") ||
    value.at(-1) !== value[0] ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticLapisPath(token: LuaToken | undefined): string | null {
  const path = staticPlainLuaString(token);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function identifierText(token: LuaToken | undefined): string | null {
  return token?.kind === "identifier" ? token.text : null;
}

function collectTopLevelFunctions(
  sourceText: string,
  structure: LuaStructure,
  language: LuaExtractFileFactsInput["language"]
): readonly StaticLuaFunction[] {
  const functions: StaticLuaFunction[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const functionToken = structure.tokens[index];
    if (functionToken?.text !== "function" || structure.depthBefore[index] !== 0) {
      continue;
    }
    const previous = index > 0 ? structure.tokens[index - 1] : undefined;
    const isDirect = startsDirectStatement(sourceText, structure.tokens, index);
    const isLocal =
      previous?.text === "local" &&
      structure.depthBefore[index - 1] === 0 &&
      startsDirectStatement(sourceText, structure.tokens, index - 1);
    const isLuauExport =
      language === "luau" &&
      previous?.text === "export" &&
      structure.depthBefore[index - 1] === 0 &&
      startsDirectStatement(sourceText, structure.tokens, index - 1);
    const name = identifierText(structure.tokens[index + 1]);
    const openingParenthesis = structure.tokens[index + 2];
    const endIndex = structure.functionEnds.get(index);
    const endToken = endIndex === undefined ? undefined : structure.tokens[endIndex];
    if (
      name === null ||
      openingParenthesis?.text !== "(" ||
      (!isDirect && !isLocal && !isLuauExport) ||
      endIndex === undefined ||
      endToken === undefined ||
      !endsDirectStatement(sourceText, structure.tokens, endIndex)
    ) {
      continue;
    }
    functions.push({
      name,
      start: isLocal ? (previous?.start ?? functionToken.start) : functionToken.start,
      end: endToken.end,
      isLocal
    });
  }
  return functions;
}

function collectTopLevelRebindings(
  sourceText: string,
  structure: LuaStructure
): ReadonlyMap<string, readonly number[]> {
  const locations = new Map<string, number[]>();
  const add = (name: string, offset: number): void => {
    const existing = locations.get(name) ?? [];
    existing.push(offset);
    locations.set(name, existing);
  };

  for (let index = 0; index < structure.tokens.length; index += 1) {
    const token = structure.tokens[index];
    if (token === undefined || structure.depthBefore[index] !== 0) {
      continue;
    }
    if (token.text === "local" && startsDirectStatement(sourceText, structure.tokens, index)) {
      if (structure.tokens[index + 1]?.text === "function") {
        continue;
      }
      let cursor = index + 1;
      while (true) {
        const name = identifierText(structure.tokens[cursor]);
        if (name === null) {
          break;
        }
        const nameToken = structure.tokens[cursor];
        if (nameToken !== undefined) {
          add(name, nameToken.start);
        }
        if (structure.tokens[cursor + 1]?.text !== ",") {
          break;
        }
        cursor += 2;
      }
      continue;
    }
    if (token.kind === "identifier" && startsDirectStatement(sourceText, structure.tokens, index)) {
      const assignedNames: LuaToken[] = [];
      let cursor = index;
      while (true) {
        const name = structure.tokens[cursor];
        if (name?.kind !== "identifier") {
          break;
        }
        assignedNames.push(name);
        if (structure.tokens[cursor + 1]?.text !== ",") {
          cursor += 1;
          break;
        }
        cursor += 2;
      }
      if (assignedNames.length > 0 && structure.tokens[cursor]?.text === "=") {
        for (const assignedName of assignedNames) {
          add(assignedName.text, assignedName.start);
        }
      }
    }
  }
  return locations;
}

function hasRebindingBetween(
  rebindings: ReadonlyMap<string, readonly number[]>,
  name: string,
  after: number,
  before: number
): boolean {
  return (rebindings.get(name) ?? []).some((offset) => offset > after && offset < before);
}

function directLapisModuleBinding(
  sourceText: string,
  structure: LuaStructure,
  index: number
): StaticLuaBinding | null {
  const tokens = structure.tokens;
  const localToken = tokens[index];
  const name = identifierText(tokens[index + 1]);
  const closeIndex = index + 6;
  const moduleName = staticPlainLuaString(tokens[index + 5]);
  const close = tokens[closeIndex];
  if (
    localToken?.text !== "local" ||
    structure.depthBefore[index] !== 0 ||
    !startsDirectStatement(sourceText, tokens, index) ||
    name === null ||
    tokens[index + 2]?.text !== "=" ||
    tokens[index + 3]?.text !== "require" ||
    tokens[index + 4]?.text !== "(" ||
    moduleName !== "lapis" ||
    close?.text !== ")" ||
    !endsDirectStatement(sourceText, tokens, closeIndex)
  ) {
    return null;
  }
  return { name, start: localToken.start, end: close.end };
}

function directLapisApplicationExpressionEnd(
  structure: LuaStructure,
  expressionIndex: number,
  moduleBindings: readonly StaticLuaBinding[],
  rebindings: ReadonlyMap<string, readonly number[]>,
  statementStart: number
): number | null {
  const tokens = structure.tokens;
  const receiver = identifierText(tokens[expressionIndex]);
  const memberEnd = expressionIndex + 4;
  if (
    receiver !== null &&
    tokens[expressionIndex + 1]?.text === "." &&
    tokens[expressionIndex + 2]?.text === "Application" &&
    tokens[expressionIndex + 3]?.text === "(" &&
    tokens[memberEnd]?.text === ")"
  ) {
    const candidates = moduleBindings.filter(
      (binding) =>
        binding.name === receiver &&
        binding.end < statementStart &&
        !hasRebindingBetween(rebindings, receiver, binding.end, statementStart)
    );
    return candidates.length === 1 ? memberEnd : null;
  }

  const directEnd = expressionIndex + 7;
  if (
    tokens[expressionIndex]?.text === "require" &&
    tokens[expressionIndex + 1]?.text === "(" &&
    staticPlainLuaString(tokens[expressionIndex + 2]) === "lapis" &&
    tokens[expressionIndex + 3]?.text === ")" &&
    tokens[expressionIndex + 4]?.text === "." &&
    tokens[expressionIndex + 5]?.text === "Application" &&
    tokens[expressionIndex + 6]?.text === "(" &&
    tokens[directEnd]?.text === ")"
  ) {
    return directEnd;
  }
  return null;
}

function collectLapisApplicationBindings(
  sourceText: string,
  structure: LuaStructure,
  rebindings: ReadonlyMap<string, readonly number[]>
): readonly StaticLuaBinding[] {
  const modules: StaticLuaBinding[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const binding = directLapisModuleBinding(sourceText, structure, index);
    if (binding !== null) {
      modules.push(binding);
    }
  }

  const applications: StaticLuaBinding[] = [];
  for (let index = 0; index < structure.tokens.length; index += 1) {
    const localToken = structure.tokens[index];
    const name = identifierText(structure.tokens[index + 1]);
    if (
      localToken?.text !== "local" ||
      structure.depthBefore[index] !== 0 ||
      !startsDirectStatement(sourceText, structure.tokens, index) ||
      name === null ||
      structure.tokens[index + 2]?.text !== "="
    ) {
      continue;
    }
    const expressionEnd = directLapisApplicationExpressionEnd(
      structure,
      index + 3,
      modules,
      rebindings,
      localToken.start
    );
    const endToken = expressionEnd === null ? undefined : structure.tokens[expressionEnd];
    if (
      expressionEnd === null ||
      endToken === undefined ||
      !endsDirectStatement(sourceText, structure.tokens, expressionEnd)
    ) {
      continue;
    }
    applications.push({ name, start: localToken.start, end: endToken.end });
  }
  return applications;
}

function directLapisArguments(
  tokens: readonly LuaToken[],
  openingParenthesis: number,
  closingParenthesis: number
): readonly LuaToken[] | null {
  const arguments_: LuaToken[] = [];
  let cursor = openingParenthesis + 1;
  while (cursor < closingParenthesis) {
    const argument = tokens[cursor];
    if (argument === undefined || !["identifier", "string"].includes(argument.kind)) {
      return null;
    }
    arguments_.push(argument);
    cursor += 1;
    if (cursor === closingParenthesis) {
      break;
    }
    if (tokens[cursor]?.text !== ",") {
      return null;
    }
    cursor += 1;
  }
  return arguments_;
}

function staticLapisRoute(
  sourceText: string,
  structure: LuaStructure,
  index: number
): StaticLapisRoute | null {
  const tokens = structure.tokens;
  const receiver = tokens[index];
  const receiverName = identifierText(receiver);
  const methodToken = tokens[index + 2];
  const openingParenthesis = index + 3;
  const closingParenthesis = structure.pairedParentheses.get(openingParenthesis);
  if (
    receiver === undefined ||
    receiverName === null ||
    structure.depthBefore[index] !== 0 ||
    !startsDirectStatement(sourceText, tokens, index) ||
    tokens[index + 1]?.text !== ":" ||
    methodToken?.kind !== "identifier" ||
    tokens[openingParenthesis]?.text !== "(" ||
    closingParenthesis === undefined ||
    !endsDirectStatement(sourceText, tokens, closingParenthesis)
  ) {
    return null;
  }

  const method = methodToken.text === "match" ? "ALL" : LAPIS_HTTP_METHODS.get(methodToken.text);
  const arguments_ = directLapisArguments(tokens, openingParenthesis, closingParenthesis);
  if (method === undefined || arguments_ === null) {
    return null;
  }
  const namedRoute = arguments_.length === 3 ? staticPlainLuaString(arguments_[0]) : null;
  const pathIndex = arguments_.length === 3 ? 1 : 0;
  const handlerIndex = arguments_.length === 3 ? 2 : 1;
  const path = staticLapisPath(arguments_[pathIndex]);
  const handlerName = identifierText(arguments_[handlerIndex]);
  if (
    (arguments_.length !== 2 && arguments_.length !== 3) ||
    (arguments_.length === 3 && namedRoute === null) ||
    path === null ||
    handlerName === null
  ) {
    return null;
  }
  const endToken = tokens[closingParenthesis];
  return endToken === undefined
    ? null
    : {
        receiverName,
        method,
        path,
        handlerName,
        start: receiver.start,
        end: endToken.end
      };
}

/**
 * Extracts Lua-compatible file/function symbols. Lua also receives a narrow
 * Lapis route subset: direct top-level local function handlers, direct Lapis
 * module and Application bindings, and literal `app:get/post/put/delete/match` calls.
 */
export function extractLuaFileFacts(input: LuaExtractFileFactsInput): ArtifactFacts {
  if (input.language === "lua") {
    const lapisCapability = frameworkCapability("lapis");
    if (!lapisCapability.languages.includes(input.language)) {
      throw new Error("Lapis extraction was invoked for an unsupported source language.");
    }
  }

  const structure = analyzeLuaStructure(input.sourceText);
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

  function addFunction(declaration: StaticLuaFunction): SymbolNode {
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
      range: rangeFor(lineStarts, declaration.start, declaration.end),
      isExported: !declaration.isLocal,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.start, declaration.end);
    return symbol;
  }

  function addLapisRoute(routeFact: StaticLapisRoute, handler: SymbolNode): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${fileNode.qualifiedName}#route:${routeName}`;
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
    addContainment(fileNode, route, routeFact.start, routeFact.end);
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
        ruleId: "framework.lapis.direct-application.literal-route.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (structure.valid) {
    const functions = collectTopLevelFunctions(input.sourceText, structure, input.language);
    const functionsByName = new Map<string, { readonly declaration: StaticLuaFunction; readonly symbol: SymbolNode }[]>();
    for (const declaration of functions) {
      const symbol = addFunction(declaration);
      const existing = functionsByName.get(declaration.name) ?? [];
      functionsByName.set(declaration.name, [...existing, { declaration, symbol }]);
    }

    if (input.language === "lua") {
      const rebindings = collectTopLevelRebindings(input.sourceText, structure);
      const applications = collectLapisApplicationBindings(input.sourceText, structure, rebindings);
      for (let index = 0; index < structure.tokens.length; index += 1) {
        const route = staticLapisRoute(input.sourceText, structure, index);
        if (route === null) {
          continue;
        }
        const applicationCandidates = applications.filter(
          (application) =>
            application.name === route.receiverName &&
            application.end < route.start &&
            !hasRebindingBetween(rebindings, application.name, application.end, route.start)
        );
        const handlerCandidates = (functionsByName.get(route.handlerName) ?? []).filter(
          (candidate) =>
            candidate.declaration.isLocal &&
            candidate.declaration.end < route.start &&
            !hasRebindingBetween(
              rebindings,
              route.handlerName,
              candidate.declaration.end,
              route.start
            )
        );
        if (applicationCandidates.length === 1 && handlerCandidates.length === 1) {
          const handler = handlerCandidates[0];
          if (handler !== undefined) {
            addLapisRoute(route, handler.symbol);
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
    }
  };
}

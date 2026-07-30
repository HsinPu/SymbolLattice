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

export interface ErlangExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "erlang";
}

type ErlangTokenKind = "atom" | "variable" | "string" | "quoted-atom" | "number" | "symbol";
type ErlangTermKind = "list" | "tuple" | "atom" | "quoted-atom" | "string" | "opaque";

interface ErlangToken {
  readonly kind: ErlangTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly value?: string | undefined;
  readonly escaped?: boolean | undefined;
}

interface ErlangStatement {
  readonly startIndex: number;
  readonly endIndex: number;
}

interface ErlangTerm {
  readonly kind: ErlangTermKind;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly start: number;
  readonly end: number;
  readonly value?: string | undefined;
  readonly escaped?: boolean | undefined;
  readonly elements?: readonly ErlangTerm[];
}

interface StaticErlangModule {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticErlangMethod {
  readonly name: string;
  readonly arity: number;
  readonly start: number;
  readonly end: number;
  readonly isExported: boolean;
}

interface StaticCowboyRoute {
  readonly path: string;
  readonly handlerModule: string;
  readonly start: number;
  readonly end: number;
}

interface ErlangStaticFacts {
  readonly valid: boolean;
  readonly module: StaticErlangModule | null;
  readonly methods: readonly StaticErlangMethod[];
  readonly routes: readonly StaticCowboyRoute[];
}

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["#{", "}"],
  ["<<", ">>"]
]);
const CLOSERS = new Set<string>([")", "]", "}", ">>"]);
const TWO_CHARACTER_SYMBOLS = new Set<string>(["->", "=>", "<<", ">>", "#{", ":="]);

function isWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n";
}

function isLowercaseAscii(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 97 && code <= 122;
}

function isUppercaseAscii(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 65 && code <= 90;
}

function isDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierContinuation(character: string): boolean {
  return (
    isLowercaseAscii(character) ||
    isUppercaseAscii(character) ||
    isDigit(character) ||
    character === "_" ||
    character === "@"
  );
}

function quotedToken(
  sourceText: string,
  start: number,
  quote: string,
  kind: Extract<ErlangTokenKind, "string" | "quoted-atom">
): { readonly token: ErlangToken; readonly next: number } | null {
  let index = start + 1;
  let escaped = false;
  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (character === "\\") {
      escaped = true;
      index += 2;
      continue;
    }
    if (character === quote) {
      const end = index + 1;
      return {
        token: {
          kind,
          text: sourceText.slice(start, end),
          start,
          end,
          value: sourceText.slice(start + 1, index),
          escaped
        },
        next: end
      };
    }
    if (character === "\r" || character === "\n") {
      return null;
    }
    index += 1;
  }
  return null;
}

function tokenizeErlang(sourceText: string): readonly ErlangToken[] | null {
  const tokens: ErlangToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (isWhitespace(character)) {
      index += 1;
      continue;
    }
    if (character === "%") {
      while (index < sourceText.length) {
        const commentCharacter = sourceText[index] ?? "";
        index += 1;
        if (commentCharacter === "\r" || commentCharacter === "\n") {
          break;
        }
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      const quoted = quotedToken(
        sourceText,
        index,
        character,
        character === "\"" ? "string" : "quoted-atom"
      );
      if (quoted === null) {
        return null;
      }
      tokens.push(quoted.token);
      index = quoted.next;
      continue;
    }
    if (isLowercaseAscii(character)) {
      const start = index;
      index += 1;
      while (index < sourceText.length && isIdentifierContinuation(sourceText[index] ?? "")) {
        index += 1;
      }
      tokens.push({
        kind: "atom",
        text: sourceText.slice(start, index),
        start,
        end: index
      });
      continue;
    }
    if (isUppercaseAscii(character) || character === "_") {
      const start = index;
      index += 1;
      while (index < sourceText.length && isIdentifierContinuation(sourceText[index] ?? "")) {
        index += 1;
      }
      tokens.push({
        kind: "variable",
        text: sourceText.slice(start, index),
        start,
        end: index
      });
      continue;
    }
    if (isDigit(character)) {
      const start = index;
      index += 1;
      while (index < sourceText.length && isDigit(sourceText[index] ?? "")) {
        index += 1;
      }
      if (
        sourceText[index] === "." &&
        isDigit(sourceText[index + 1] ?? "")
      ) {
        index += 1;
        while (index < sourceText.length && isDigit(sourceText[index] ?? "")) {
          index += 1;
        }
      }
      tokens.push({
        kind: "number",
        text: sourceText.slice(start, index),
        start,
        end: index
      });
      continue;
    }
    const twoCharacters = sourceText.slice(index, index + 2);
    if (TWO_CHARACTER_SYMBOLS.has(twoCharacters)) {
      tokens.push({
        kind: "symbol",
        text: twoCharacters,
        start: index,
        end: index + 2
      });
      index += 2;
      continue;
    }
    tokens.push({
      kind: "symbol",
      text: character,
      start: index,
      end: index + 1
    });
    index += 1;
  }

  return tokens;
}

function pairedDelimiters(tokens: readonly ErlangToken[]): ReadonlyMap<number, number> | null {
  const pairs = new Map<number, number>();
  const stack: Array<{ readonly index: number; readonly expected: string }> = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    const expected = OPEN_TO_CLOSE.get(token.text);
    if (expected !== undefined) {
      stack.push({ index, expected });
      continue;
    }
    if (!CLOSERS.has(token.text)) {
      continue;
    }
    const opening = stack.pop();
    if (opening === undefined || opening.expected !== token.text) {
      return null;
    }
    pairs.set(opening.index, index);
  }
  return stack.length === 0 ? pairs : null;
}

function topLevelStatements(
  tokens: readonly ErlangToken[]
): readonly ErlangStatement[] | null {
  const statements: ErlangStatement[] = [];
  let startIndex = 0;
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    if (OPEN_TO_CLOSE.has(token.text)) {
      depth += 1;
    } else if (CLOSERS.has(token.text)) {
      depth -= 1;
    }
    if (token.text === "." && depth === 0) {
      if (startIndex < index) {
        statements.push({ startIndex, endIndex: index });
      }
      startIndex = index + 1;
    }
  }
  if (startIndex !== tokens.length || depth !== 0) {
    return null;
  }
  return statements;
}

function directModule(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement
): StaticErlangModule | null {
  const { startIndex, endIndex } = statement;
  if (endIndex - startIndex !== 5) {
    return null;
  }
  const dash = tokens[startIndex];
  const module = tokens[startIndex + 1];
  const opening = tokens[startIndex + 2];
  const name = tokens[startIndex + 3];
  const closing = tokens[startIndex + 4];
  if (
    dash?.text !== "-" ||
    module?.kind !== "atom" ||
    module.text !== "module" ||
    opening?.text !== "(" ||
    name?.kind !== "atom" ||
    closing?.text !== ")"
  ) {
    return null;
  }
  return { name: name.text, start: dash.start, end: closing.end };
}

function isExportAttribute(tokens: readonly ErlangToken[], statement: ErlangStatement): boolean {
  return (
    tokens[statement.startIndex]?.text === "-" &&
    tokens[statement.startIndex + 1]?.kind === "atom" &&
    tokens[statement.startIndex + 1]?.text === "export"
  );
}

function directExportEntries(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement,
  pairs: ReadonlyMap<number, number>
): readonly string[] | null {
  if (!isExportAttribute(tokens, statement)) {
    return null;
  }
  const openingParenthesis = statement.startIndex + 2;
  const openingList = statement.startIndex + 3;
  if (tokens[openingParenthesis]?.text !== "(" || tokens[openingList]?.text !== "[") {
    return null;
  }
  const closingParenthesis = pairs.get(openingParenthesis);
  const closingList = pairs.get(openingList);
  if (
    closingParenthesis === undefined ||
    closingList === undefined ||
    closingParenthesis !== statement.endIndex - 1 ||
    closingList !== closingParenthesis - 1 ||
    tokens[closingParenthesis]?.text !== ")" ||
    tokens[closingList]?.text !== "]"
  ) {
    return null;
  }

  const entries: string[] = [];
  let cursor = openingList + 1;
  if (cursor === closingList) {
    return entries;
  }
  while (cursor < closingList) {
    const name = tokens[cursor];
    const slash = tokens[cursor + 1];
    const arity = tokens[cursor + 2];
    if (name?.kind !== "atom" || slash?.text !== "/" || arity?.kind !== "number") {
      return null;
    }
    const parsedArity = Number(arity.text);
    if (!Number.isSafeInteger(parsedArity) || parsedArity < 0) {
      return null;
    }
    entries.push(name.text + "/" + parsedArity);
    cursor += 3;
    if (cursor === closingList) {
      break;
    }
    if (tokens[cursor]?.text !== ",") {
      return null;
    }
    cursor += 1;
  }
  return cursor === closingList ? entries : null;
}

function directFunctionArity(
  tokens: readonly ErlangToken[],
  opening: number,
  closing: number
): number | null {
  if (opening + 1 === closing) {
    return 0;
  }
  let arity = 0;
  let cursor = opening + 1;
  while (cursor < closing) {
    const argument = tokens[cursor];
    if (argument?.kind !== "variable" && argument?.kind !== "atom") {
      return null;
    }
    arity += 1;
    cursor += 1;
    if (cursor === closing) {
      return arity;
    }
    if (tokens[cursor]?.text !== ",") {
      return null;
    }
    cursor += 1;
  }
  return null;
}

function directFunction(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement,
  pairs: ReadonlyMap<number, number>,
  exported: ReadonlySet<string>
): StaticErlangMethod | null {
  const name = tokens[statement.startIndex];
  const opening = statement.startIndex + 1;
  if (name?.kind !== "atom" || tokens[opening]?.text !== "(") {
    return null;
  }
  const closing = pairs.get(opening);
  if (
    closing === undefined ||
    closing + 2 >= statement.endIndex ||
    tokens[closing + 1]?.text !== "->"
  ) {
    return null;
  }
  const arity = directFunctionArity(tokens, opening, closing);
  if (arity === null) {
    return null;
  }
  const end = tokens[statement.endIndex - 1];
  if (end === undefined) {
    return null;
  }
  return {
    name: name.text,
    arity,
    start: name.start,
    end: end.end,
    isExported: exported.has(name.text + "/" + arity)
  };
}

function opaqueDelimitedTerm(
  kind: "opaque",
  tokens: readonly ErlangToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): ErlangTerm | null {
  const close = pairs.get(index);
  const opening = tokens[index];
  const closing = close === undefined ? undefined : tokens[close];
  if (opening === undefined || close === undefined || closing === undefined) {
    return null;
  }
  return {
    kind,
    startIndex: index,
    endIndex: close + 1,
    start: opening.start,
    end: closing.end
  };
}

function delimitedTerm(
  kind: Extract<ErlangTermKind, "list" | "tuple">,
  openingText: string,
  closingText: string,
  tokens: readonly ErlangToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): ErlangTerm | null {
  const close = pairs.get(index);
  const opening = tokens[index];
  const closing = close === undefined ? undefined : tokens[close];
  if (
    opening?.text !== openingText ||
    close === undefined ||
    closing?.text !== closingText
  ) {
    return null;
  }
  const elements: ErlangTerm[] = [];
  let cursor = index + 1;
  if (cursor === close) {
    return {
      kind,
      startIndex: index,
      endIndex: close + 1,
      start: opening.start,
      end: closing.end,
      elements
    };
  }
  while (cursor < close) {
    const term = parseTerm(tokens, cursor, pairs);
    if (term === null || term.endIndex > close) {
      return null;
    }
    elements.push(term);
    cursor = term.endIndex;
    if (cursor === close) {
      break;
    }
    if (tokens[cursor]?.text !== ",") {
      return null;
    }
    cursor += 1;
  }
  return cursor === close
    ? {
        kind,
        startIndex: index,
        endIndex: close + 1,
        start: opening.start,
        end: closing.end,
        elements
      }
    : null;
}

function parseTerm(
  tokens: readonly ErlangToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): ErlangTerm | null {
  const token = tokens[index];
  if (token === undefined) {
    return null;
  }
  if (token.kind === "atom") {
    return {
      kind: "atom",
      startIndex: index,
      endIndex: index + 1,
      start: token.start,
      end: token.end,
      value: token.text
    };
  }
  if (token.kind === "quoted-atom") {
    return {
      kind: "quoted-atom",
      startIndex: index,
      endIndex: index + 1,
      start: token.start,
      end: token.end,
      value: token.value,
      escaped: token.escaped
    };
  }
  if (token.kind === "string") {
    return {
      kind: "string",
      startIndex: index,
      endIndex: index + 1,
      start: token.start,
      end: token.end,
      value: token.value,
      escaped: token.escaped
    };
  }
  if (token.text === "[") {
    return delimitedTerm("list", "[", "]", tokens, index, pairs);
  }
  if (token.text === "{") {
    return delimitedTerm("tuple", "{", "}", tokens, index, pairs);
  }
  if (token.text === "#{" || token.text === "<<") {
    return opaqueDelimitedTerm("opaque", tokens, index, pairs);
  }
  return null;
}

function staticLiteralPath(term: ErlangTerm): string | null {
  if (
    term.kind !== "string" ||
    term.escaped === true ||
    term.value === undefined ||
    !/^\/[^"\\\s]*$/u.test(term.value)
  ) {
    return null;
  }
  return term.value;
}

function wildcardHost(term: ErlangTerm): boolean {
  return term.kind === "quoted-atom" && term.escaped !== true && term.value === "_";
}

function directCowboyDispatch(
  dispatch: ErlangTerm
): readonly StaticCowboyRoute[] | null {
  if (dispatch.kind !== "list" || dispatch.elements === undefined || dispatch.elements.length !== 1) {
    return null;
  }
  const host = dispatch.elements[0];
  if (host?.kind !== "tuple" || host.elements === undefined || host.elements.length !== 2) {
    return null;
  }
  const hostMatch = host.elements[0];
  const paths = host.elements[1];
  if (!wildcardHost(hostMatch ?? { kind: "opaque", startIndex: 0, endIndex: 0, start: 0, end: 0 }) || paths?.kind !== "list" || paths.elements === undefined) {
    return null;
  }
  const routes: StaticCowboyRoute[] = [];
  for (const pathEntry of paths.elements) {
    if (
      pathEntry.kind !== "tuple" ||
      pathEntry.elements === undefined ||
      pathEntry.elements.length !== 3
    ) {
      return null;
    }
    const path = staticLiteralPath(pathEntry.elements[0] ?? { kind: "opaque", startIndex: 0, endIndex: 0, start: 0, end: 0 });
    const handler = pathEntry.elements[1];
    if (path === null || handler?.kind !== "atom" || handler.value === undefined) {
      return null;
    }
    routes.push({
      path,
      handlerModule: handler.value,
      start: pathEntry.start,
      end: pathEntry.end
    });
  }
  return routes;
}

function collectCowboyRoutes(
  tokens: readonly ErlangToken[],
  pairs: ReadonlyMap<number, number>
): readonly StaticCowboyRoute[] {
  const routes: StaticCowboyRoute[] = [];
  for (let index = 0; index + 4 < tokens.length; index += 1) {
    if (
      tokens[index]?.kind !== "atom" ||
      tokens[index]?.text !== "cowboy_router" ||
      tokens[index + 1]?.text !== ":" ||
      tokens[index + 2]?.kind !== "atom" ||
      tokens[index + 2]?.text !== "compile" ||
      tokens[index + 3]?.text !== "("
    ) {
      continue;
    }
    const argument = parseTerm(tokens, index + 4, pairs);
    if (argument === null || tokens[argument.endIndex]?.text !== ")") {
      continue;
    }
    const dispatchRoutes = directCowboyDispatch(argument);
    if (dispatchRoutes !== null) {
      routes.push(...dispatchRoutes);
    }
  }
  return routes;
}

function staticErlangFacts(sourceText: string): ErlangStaticFacts {
  const tokens = tokenizeErlang(sourceText);
  if (tokens === null) {
    return { valid: false, module: null, methods: [], routes: [] };
  }
  const pairs = pairedDelimiters(tokens);
  if (pairs === null) {
    return { valid: false, module: null, methods: [], routes: [] };
  }
  const statements = topLevelStatements(tokens);
  if (statements === null) {
    return { valid: false, module: null, methods: [], routes: [] };
  }
  const modules = statements
    .map((statement) => directModule(tokens, statement))
    .filter((module): module is StaticErlangModule => module !== null);
  if (modules.length > 1) {
    return { valid: false, module: null, methods: [], routes: [] };
  }
  const exported = new Set<string>();
  for (const statement of statements) {
    if (!isExportAttribute(tokens, statement)) {
      continue;
    }
    const entries = directExportEntries(tokens, statement, pairs);
    if (entries === null) {
      return { valid: false, module: null, methods: [], routes: [] };
    }
    for (const entry of entries) {
      exported.add(entry);
    }
  }
  const module = modules[0] ?? null;
  const methods =
    module === null
      ? []
      : statements
          .map((statement) => directFunction(tokens, statement, pairs, exported))
          .filter((method): method is StaticErlangMethod => method !== null);
  return {
    valid: true,
    module,
    methods,
    routes: module === null ? [] : collectCowboyRoutes(tokens, pairs)
  };
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
  let upper = lineStarts.length - 1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      upper = middle - 1;
    } else if (offset >= next) {
      lower = middle + 1;
    } else {
      return { line: middle + 1, column: offset - start + 1 };
    }
  }
  const fallbackIndex = Math.max(0, lineStarts.length - 1);
  const fallbackStart = lineStarts[fallbackIndex] ?? 0;
  return { line: fallbackIndex + 1, column: Math.max(1, offset - fallbackStart + 1) };
}

function rangeFor(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, Math.max(start, end))
  };
}

/**
 * Extracts direct Erlang modules/methods and a narrow Cowboy dispatch subset.
 * Accepted dispatches use one literal wildcard host and literal three-item route
 * tuples. A route is exact only for an exported same-module init/2 callback.
 */
export function extractErlangFileFacts(input: ErlangExtractFileFactsInput): ArtifactFacts {
  const cowboyCapability = frameworkCapability("cowboy");
  if (!cowboyCapability.languages.includes(input.language)) {
    throw new Error("Cowboy extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticErlangFacts(input.sourceText);
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

  function addModule(moduleFact: StaticErlangModule): SymbolNode {
    const qualifiedName = input.filePath + "#" + moduleFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: moduleFact.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, moduleFact.start, moduleFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, moduleFact.start, moduleFact.end);
    return symbol;
  }

  function addMethod(parent: SymbolNode, methodFact: StaticErlangMethod): SymbolNode {
    const methodName = methodFact.name + "/" + methodFact.arity;
    const qualifiedName = parent.qualifiedName + "." + methodName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: methodName,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeFor(lineStarts, methodFact.start, methodFact.end),
      isExported: methodFact.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, methodFact.start, methodFact.end);
    return symbol;
  }

  function addCowboyRoute(routeFact: StaticCowboyRoute, handler: SymbolNode | null): void {
    const routeName = "ALL " + routeFact.path;
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
    addContainment(fileNode, route, routeFact.start, routeFact.end);
    const referenceName = routeFact.handlerModule + "#init/2";
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId: route.id,
      targetId: handler?.id ?? null,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: handler === null ? "unresolved" : "exact",
      confidence: handler === null ? 0 : 1,
      referenceName,
      evidence: {
        ruleId:
          handler === null
            ? "framework.cowboy.direct-router.literal-wildcard-host.unresolved-handler-init"
            : "framework.cowboy.direct-router.literal-wildcard-host.local-exported-init",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  if (staticFacts.valid && staticFacts.module !== null) {
    const moduleSymbol = addModule(staticFacts.module);
    const methodsByIdentity = new Map<string, SymbolNode[]>();
    for (const methodFact of [...staticFacts.methods].sort((left, right) => left.start - right.start)) {
      const method = addMethod(moduleSymbol, methodFact);
      const identity = staticFacts.module.name + "\u0000" + methodFact.name + "\u0000" + methodFact.arity;
      methodsByIdentity.set(identity, [...(methodsByIdentity.get(identity) ?? []), method]);
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates =
        methodsByIdentity.get(routeFact.handlerModule + "\u0000init\u00002") ?? [];
      const exportedCandidates = candidates.filter((candidate) => candidate.isExported);
      addCowboyRoute(routeFact, exportedCandidates.length === 1 ? exportedCandidates[0] ?? null : null);
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

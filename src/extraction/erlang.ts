import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ErlangCallFact,
  type ErlangCallableFact,
  type ErlangFacts,
  type ErlangHeritageFact,
  type ErlangImportFact,
  type ErlangInstantiationFact,
  type ErlangTypeFact,
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

interface StaticErlangCall {
  readonly callerName: string;
  readonly callerArity: 0;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
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
  readonly directCalls: readonly StaticErlangCall[];
  readonly routes: readonly StaticCowboyRoute[];
}

interface ErlangRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "module" | "record" | "type" | "opaque" | "behaviour";
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
}

interface ErlangRawCallable {
  readonly sourceKey: string;
  readonly name: string;
  readonly moduleName: string;
  readonly arity: number;
  readonly callableKind: "function" | "callback";
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly bodyStartIndex?: number;
  readonly bodyEndIndex?: number;
}

interface ErlangRawImport {
  readonly importKind: "module" | "include";
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly includePath?: string;
  readonly start: number;
  readonly end: number;
}

interface ErlangRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ErlangRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ErlangRawHeritage {
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly start: number;
  readonly end: number;
}

interface ErlangRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly exported: ReadonlySet<string>;
  readonly types: readonly ErlangRawType[];
  readonly callables: readonly ErlangRawCallable[];
  readonly imports: readonly ErlangRawImport[];
  readonly calls: readonly ErlangRawCall[];
  readonly instantiations: readonly ErlangRawInstantiation[];
  readonly heritage: readonly ErlangRawHeritage[];
}

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["#{", "}"],
  ["<<", ">>"]
]);
const CLOSERS = new Set<string>([")", "]", "}", ">>"]);
const TWO_CHARACTER_SYMBOLS = new Set<string>(["->", "=>", "<<", ">>", "#{", ":=", "::"]);

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
  return directExportLikeEntries(tokens, statement, pairs, "export");
}

function directExportTypeEntries(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement,
  pairs: ReadonlyMap<number, number>
): readonly string[] | null {
  return directExportLikeEntries(tokens, statement, pairs, "export_type");
}

function directExportLikeEntries(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement,
  pairs: ReadonlyMap<number, number>,
  attributeName: "export" | "export_type"
): readonly string[] | null {
  if (tokens[statement.startIndex]?.text !== "-" || tokens[statement.startIndex + 1]?.kind !== "atom" || tokens[statement.startIndex + 1]?.text !== attributeName) {
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

function directZeroArityCall(
  tokens: readonly ErlangToken[],
  statement: ErlangStatement
): StaticErlangCall | null {
  const { startIndex, endIndex } = statement;
  if (endIndex - startIndex !== 7) {
    return null;
  }
  const caller = tokens[startIndex];
  const callerOpening = startIndex + 1;
  const callerClosing = startIndex + 2;
  const arrow = tokens[startIndex + 3];
  const callee = tokens[startIndex + 4];
  const calleeOpening = startIndex + 5;
  const calleeClosing = startIndex + 6;
  const calleeClosingToken = tokens[calleeClosing];
  if (
    caller?.kind !== "atom" ||
    tokens[callerOpening]?.text !== "(" ||
    tokens[callerClosing]?.text !== ")" ||
    arrow?.text !== "->" ||
    callee?.kind !== "atom" ||
    tokens[calleeOpening]?.text !== "(" ||
    calleeClosingToken?.text !== ")"
  ) {
    return null;
  }
  return {
    callerName: caller.text,
    callerArity: 0,
    calleeName: callee.text,
    start: callee.start,
    end: calleeClosingToken.end
  };
}

function hasUnsafeDirectCallAttribute(
  tokens: readonly ErlangToken[],
  statements: readonly ErlangStatement[]
): boolean {
  return statements.some((statement) => {
    if (tokens[statement.startIndex]?.text !== "-") {
      return false;
    }
    const attribute = tokens[statement.startIndex + 1];
    const name =
      attribute?.kind === "atom"
        ? attribute.text
        : attribute?.kind === "quoted-atom" && attribute.escaped !== true
          ? attribute.value
          : null;
    return name !== "module" && name !== "export";
  });
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
    return { valid: false, module: null, methods: [], directCalls: [], routes: [] };
  }
  const pairs = pairedDelimiters(tokens);
  if (pairs === null) {
    return { valid: false, module: null, methods: [], directCalls: [], routes: [] };
  }
  const statements = topLevelStatements(tokens);
  if (statements === null) {
    return { valid: false, module: null, methods: [], directCalls: [], routes: [] };
  }
  const modules = statements
    .map((statement) => directModule(tokens, statement))
    .filter((module): module is StaticErlangModule => module !== null);
  if (modules.length > 1) {
    return { valid: false, module: null, methods: [], directCalls: [], routes: [] };
  }
  const exported = new Set<string>();
  for (const statement of statements) {
    if (!isExportAttribute(tokens, statement)) {
      continue;
    }
    const entries = directExportEntries(tokens, statement, pairs);
    if (entries === null) {
      return { valid: false, module: null, methods: [], directCalls: [], routes: [] };
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
  const directCalls =
    module === null || hasUnsafeDirectCallAttribute(tokens, statements)
      ? []
      : statements
          .map((statement) => directZeroArityCall(tokens, statement))
          .filter((call): call is StaticErlangCall => call !== null);
  return {
    valid: true,
    module,
    methods,
    directCalls,
    routes: module === null ? [] : collectCowboyRoutes(tokens, pairs)
  };
}

function erlangTokenName(token: ErlangToken | undefined): string | null {
  if (token?.kind === "atom") return token.text;
  if (token?.kind === "quoted-atom" && token.escaped !== true) return token.value ?? null;
  return null;
}

function erlangDelimitedArity(
  tokens: readonly ErlangToken[],
  opening: number,
  closing: number
): number | null {
  if (opening + 1 === closing) return 0;
  let depth = 0;
  let arity = 1;
  for (let index = opening + 1; index < closing; index += 1) {
    const token = tokens[index];
    if (token === undefined) return null;
    if (OPEN_TO_CLOSE.has(token.text)) {
      depth += 1;
    } else if (CLOSERS.has(token.text)) {
      depth -= 1;
      if (depth < 0) return null;
    } else if (token.text === "," && depth === 0) {
      arity += 1;
    }
  }
  return depth === 0 ? arity : null;
}

const ERLANG_BUILTIN_TYPES = new Set([
  "any",
  "atom",
  "binary",
  "bitstring",
  "boolean",
  "byte",
  "char",
  "float",
  "function",
  "integer",
  "iodata",
  "iolist",
  "list",
  "map",
  "maybe_improper_list",
  "module",
  "no_return",
  "non_neg_integer",
  "number",
  "pid",
  "port",
  "reference",
  "term",
  "timeout",
  "tuple"
]);

function erlangTypeNames(
  tokens: readonly ErlangToken[],
  start: number,
  end: number
): readonly string[] {
  const names: string[] = [];
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const name = erlangTokenName(token);
    if (name === null || ERLANG_BUILTIN_TYPES.has(name) || next?.text !== "(") continue;
    if (tokens[index - 1]?.text === ":") continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function erlangSpecShape(
  tokens: readonly ErlangToken[],
  opening: number,
  closing: number,
  statementEnd: number,
  pairs: ReadonlyMap<number, number>
): { readonly arity: number; readonly parameterTypeNames: readonly string[]; readonly returnTypeName?: string } | null {
  const arity = erlangDelimitedArity(tokens, opening, closing);
  const arrow = tokens[closing + 1];
  if (arity === null || arrow?.text !== "->") return null;
  const parameterTypeNames = erlangTypeNames(tokens, opening + 1, closing);
  const returnTypeNames = erlangTypeNames(tokens, closing + 2, statementEnd);
  const returnTypeName = returnTypeNames[0];
  // Ensure the type expression itself is balanced before retaining a spec.
  for (let index = closing + 2; index < statementEnd; index += 1) {
    const token = tokens[index];
    if (token === undefined) return null;
    if (OPEN_TO_CLOSE.has(token.text) && pairs.get(index) === undefined) return null;
  }
  return { arity, parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }) };
}

function erlangImportNames(
  tokens: readonly ErlangToken[],
  listOpening: number,
  listClosing: number
): readonly string[] | null {
  if (listOpening + 1 === listClosing) return [];
  const names: string[] = [];
  let cursor = listOpening + 1;
  while (cursor < listClosing) {
    const name = erlangTokenName(tokens[cursor]);
    const slash = tokens[cursor + 1];
    const arityToken = tokens[cursor + 2];
    if (name === null || slash?.text !== "/" || arityToken?.kind !== "number") return null;
    names.push(`${name}/${arityToken.text}`);
    cursor += 3;
    if (cursor === listClosing) break;
    if (tokens[cursor]?.text !== ",") return null;
    cursor += 1;
  }
  return cursor === listClosing ? names : null;
}

function parseErlangRelations(sourceText: string): ErlangRelationFacts {
  const tokens = tokenizeErlang(sourceText);
  if (tokens === null) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
  const pairs = pairedDelimiters(tokens);
  const statements = pairs === null ? null : topLevelStatements(tokens);
  if (pairs === null || statements === null) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
  const modules = statements.map((statement) => directModule(tokens, statement)).filter((module): module is StaticErlangModule => module !== null);
  if (modules.length > 1) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
  const module = modules[0];
  const moduleName = module?.name ?? "";
  const exported = new Set<string>();
  const exportedTypes = new Set<string>();
  for (const statement of statements) {
    if (isExportAttribute(tokens, statement)) {
      const entries = directExportEntries(tokens, statement, pairs);
      if (entries === null) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
      for (const entry of entries) exported.add(entry);
      continue;
    }
    if (tokens[statement.startIndex]?.text === "-" && tokens[statement.startIndex + 1]?.kind === "atom" && tokens[statement.startIndex + 1]?.text === "export_type") {
      const entries = directExportTypeEntries(tokens, statement, pairs);
      if (entries === null) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
      for (const entry of entries) exportedTypes.add(entry);
    }
  }
  const types: ErlangRawType[] = module === undefined ? [] : [{ name: module.name, moduleName: "", declarationKind: "module", isExported: true, start: module.start, end: module.end }];
  const callables: ErlangRawCallable[] = [];
  const imports: ErlangRawImport[] = [];
  const calls: ErlangRawCall[] = [];
  const instantiations: ErlangRawInstantiation[] = [];
  const heritage: ErlangRawHeritage[] = [];
  const specs = new Map<string, { readonly parameterTypeNames: readonly string[]; readonly returnTypeName?: string; readonly arity: number }>();
  const unsupportedBodyTokens = new Set(["case", "if", "receive", "try", "catch", "after", "fun", "when", ";", "->", "?"]);
  const supportedAttributes = new Set(["module", "export", "export_type", "record", "type", "opaque", "behaviour", "behavior", "import", "include", "include_lib", "spec", "callback"]);

  for (const statement of statements) {
    const startIndex = statement.startIndex;
    const attribute = tokens[startIndex + 1];
    if (tokens[startIndex]?.text !== "-") continue;
    if (attribute?.kind !== "atom" || !supportedAttributes.has(attribute.text)) return { valid: false, moduleName: "", exported: new Set(), types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
    const attributeName = attribute.text;
    if (attributeName === "record" && module !== undefined) {
      const name = erlangTokenName(tokens[startIndex + 3]);
      const opening = startIndex + 5;
      const closing = pairs.get(opening);
      if (name !== null && tokens[startIndex + 2]?.text === "(" && tokens[startIndex + 3]?.kind === "atom" && tokens[opening]?.text === "{" && closing !== undefined && tokens[closing]?.text === "}") {
        types.push({ name, moduleName: module.name, declarationKind: "record", isExported: true, start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
      }
      continue;
    }
    if ((attributeName === "type" || attributeName === "opaque") && module !== undefined) {
      const name = erlangTokenName(tokens[startIndex + 2]);
      const opening = startIndex + 3;
      const closing = pairs.get(opening);
      if (name !== null && tokens[startIndex + 2]?.kind === "atom" && tokens[opening]?.text === "(" && closing !== undefined && tokens[closing + 1]?.text === "::") {
        types.push({ name, moduleName: module.name, declarationKind: attributeName, isExported: exportedTypes.has(`${name}/${erlangDelimitedArity(tokens, opening, closing) ?? 0}`), start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
      }
      continue;
    }
    if ((attributeName === "behaviour" || attributeName === "behavior") && module !== undefined) {
      const opening = startIndex + 2;
      const closing = pairs.get(opening);
      const target = erlangTokenName(tokens[startIndex + 3]);
      if (tokens[opening]?.text === "(" && closing === startIndex + 4 && target !== null) {
        heritage.push({ sourceTypeName: module.name, referenceName: target, start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
      }
      continue;
    }
    if (attributeName === "import" || attributeName === "include" || attributeName === "include_lib") {
      const opening = startIndex + 2;
      const closing = pairs.get(opening);
      if (tokens[opening]?.text !== "(" || closing === undefined) continue;
      if (attributeName === "import") {
        const moduleToken = erlangTokenName(tokens[startIndex + 3]);
        const listOpening = startIndex + 5;
        const listClosing = pairs.get(listOpening);
        const names = listClosing === undefined ? null : erlangImportNames(tokens, listOpening, listClosing);
        if (moduleToken !== null && tokens[startIndex + 4]?.text === "," && listClosing !== undefined && names !== null) imports.push({ importKind: "module", importedModule: moduleToken, importedNames: names, start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
      } else {
        const pathToken = tokens[startIndex + 3];
        if (pathToken?.kind === "string" && pathToken.value !== undefined && closing === startIndex + 4) imports.push({ importKind: "include", importedModule: pathToken.value, includePath: pathToken.value, start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
      }
      continue;
    }
    if (attributeName === "spec" || attributeName === "callback") {
      const name = erlangTokenName(tokens[startIndex + 2]);
      const opening = startIndex + 3;
      const closing = pairs.get(opening);
      const shape = closing === undefined ? null : erlangSpecShape(tokens, opening, closing, statement.endIndex, pairs);
      if (module !== undefined && name !== null && shape !== null) {
        const sourceKey = `${name}\u0000${shape.arity}\u0000${attributeName}\u0000${tokens[startIndex]?.start ?? 0}`;
        if (attributeName === "callback") callables.push({ sourceKey, name, moduleName: module.name, arity: shape.arity, callableKind: "callback", parameterTypeNames: shape.parameterTypeNames, ...(shape.returnTypeName === undefined ? {} : { returnTypeName: shape.returnTypeName }), isExported: true, start: tokens[startIndex]?.start ?? 0, end: tokens[statement.endIndex - 1]?.end ?? 0 });
        else specs.set(`${name}/${shape.arity}`, shape);
      }
      continue;
    }
  }

  if (module !== undefined) {
    for (const statement of statements) {
      const method = directFunction(tokens, statement, pairs, exported);
      if (method === null) continue;
      const sourceKey = `${method.name}\u0000${method.arity}\u0000${method.start}`;
      const shape = specs.get(`${method.name}/${method.arity}`);
      const bodyStart = pairs.get(statement.startIndex + 1);
      const bodyTokens = bodyStart === undefined ? [] : tokens.slice(bodyStart + 2, statement.endIndex);
      const unsafeBody = bodyTokens.some((token) => unsupportedBodyTokens.has(token.text));
      if (unsafeBody) continue;
      callables.push({ sourceKey, name: method.name, moduleName: module.name, arity: method.arity, callableKind: "function", parameterTypeNames: shape?.parameterTypeNames ?? [], ...(shape?.returnTypeName === undefined ? {} : { returnTypeName: shape.returnTypeName }), isExported: method.isExported, start: method.start, end: method.end, ...(bodyStart === undefined ? {} : { bodyStartIndex: bodyStart + 2, bodyEndIndex: statement.endIndex }) });
    }
    for (const callable of callables.filter((candidate) => candidate.callableKind === "function" && candidate.bodyStartIndex !== undefined && candidate.bodyEndIndex !== undefined)) {
      const bodyStart = callable.bodyStartIndex!;
      const bodyEnd = callable.bodyEndIndex!;
      const bodyTokens = tokens.slice(bodyStart, bodyEnd);
      for (let index = 0; index < bodyTokens.length; index += 1) {
        const current = bodyTokens[index];
        const next = bodyTokens[index + 1];
        const afterNext = bodyTokens[index + 2];
        if (current === undefined) continue;
        if (current.kind === "atom" && next?.text === ":" && afterNext?.kind === "atom" && bodyTokens[index + 3]?.text === "(") {
          const opening = index + 3;
          const closing = pairs.get(bodyStart + opening);
          if (closing !== undefined && closing < bodyEnd) {
            const arity = erlangDelimitedArity(tokens, bodyStart + opening, closing);
            if (arity !== null) calls.push({ sourceKey: callable.sourceKey, referenceName: `${afterNext.text}/${arity}`, callKind: "module", receiverModuleName: current.text, argumentCount: arity, start: current.start, end: tokens[closing]?.end ?? afterNext.end });
          }
          continue;
        }
        if (current.kind !== "atom" || next?.text !== "(") continue;
        if (bodyTokens[index - 1]?.text === ":") continue;
        const opening = index + 1;
        const closing = pairs.get(bodyStart + opening);
        if (closing === undefined || closing >= bodyEnd) continue;
        const arity = erlangDelimitedArity(tokens, bodyStart + opening, closing);
        if (arity !== null) calls.push({ sourceKey: callable.sourceKey, referenceName: `${current.text}/${arity}`, callKind: "direct", argumentCount: arity, start: current.start, end: tokens[closing]?.end ?? current.end });
      }
      for (let index = 0; index + 2 < bodyTokens.length; index += 1) {
        const recordMarker = bodyTokens[index];
        const record = bodyTokens[index + 1];
        const opening = bodyTokens[index + 2];
        if (recordMarker?.text !== "#" || record?.kind !== "atom" || opening?.text !== "{") continue;
        const closing = pairs.get(bodyStart + index + 2);
        if (closing === undefined || closing >= bodyEnd) continue;
        const arity = erlangDelimitedArity(tokens, bodyStart + index + 2, closing);
        if (arity !== null) instantiations.push({ sourceKey: callable.sourceKey, typeName: record.text, argumentCount: arity, start: recordMarker.start, end: tokens[closing]?.end ?? opening.end });
      }
    }
  }
  return { valid: true, moduleName, exported, types, callables, imports, calls, instantiations, heritage };
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
  const relationFacts = parseErlangRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const erlangTypes: ErlangTypeFact[] = [];
  const erlangCallables: ErlangCallableFact[] = [];
  const erlangImports: ErlangImportFact[] = [];
  const erlangCalls: ErlangCallFact[] = [];
  const erlangInstantiations: ErlangInstantiationFact[] = [];
  const erlangHeritage: ErlangHeritageFact[] = [];
  const relationCallableSymbols = new Map<string, SymbolNode>();
  const staticMethodSymbols = new Map<string, SymbolNode>();
  let moduleSymbol: SymbolNode | null = null;
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

  function addDirectCall(callFact: StaticErlangCall, caller: SymbolNode, callee: SymbolNode): void {
    const range = rangeFor(lineStarts, callFact.start, callFact.end);
    const referenceName = callFact.calleeName + "/0";
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName,
      evidence: {
        ruleId: "syntax.erlang.same-module.unique-zero-arity-direct-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (staticFacts.valid && staticFacts.module !== null) {
    moduleSymbol = addModule(staticFacts.module);
    const methodsByIdentity = new Map<string, SymbolNode[]>();
    for (const methodFact of [...staticFacts.methods].sort((left, right) => left.start - right.start)) {
      const method = addMethod(moduleSymbol, methodFact);
      staticMethodSymbols.set(`${methodFact.name}\u0000${methodFact.arity}\u0000${methodFact.start}`, method);
      const identity = staticFacts.module.name + "\u0000" + methodFact.name + "\u0000" + methodFact.arity;
      methodsByIdentity.set(identity, [...(methodsByIdentity.get(identity) ?? []), method]);
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates =
        methodsByIdentity.get(routeFact.handlerModule + "\u0000init\u00002") ?? [];
      const exportedCandidates = candidates.filter((candidate) => candidate.isExported);
      addCowboyRoute(routeFact, exportedCandidates.length === 1 ? exportedCandidates[0] ?? null : null);
    }
    for (const callFact of staticFacts.directCalls) {
      const callerCandidates =
        methodsByIdentity.get(
          staticFacts.module.name + "\u0000" + callFact.callerName + "\u0000" + callFact.callerArity
        ) ?? [];
      const calleeCandidates =
        methodsByIdentity.get(staticFacts.module.name + "\u0000" + callFact.calleeName + "\u00000") ?? [];
      if (callerCandidates.length === 1 && calleeCandidates.length === 1) {
        const caller = callerCandidates[0];
        const callee = calleeCandidates[0];
        if (caller !== undefined && callee !== undefined) {
          addDirectCall(callFact, caller, callee);
        }
      }
    }
  }

  function findSymbolAtStart(qualifiedName: string, kind: SymbolNode["kind"], start: number): SymbolNode | undefined {
    return symbols.find((symbol) => symbol.qualifiedName === qualifiedName && symbol.kind === kind && symbol.range.start.line === rangeFor(lineStarts, start, start).start.line && symbol.range.start.column === rangeFor(lineStarts, start, start).start.column);
  }

  function addErlangType(type: ErlangRawType): SymbolNode {
    if (type.declarationKind === "module" && moduleSymbol !== null) {
      erlangTypes.push({ symbolId: moduleSymbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: type.name, declarationKind: type.declarationKind, isExported: type.isExported, range: moduleSymbol.range });
      return moduleSymbol;
    }
    const qualifiedTypePath = type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`;
    const qualifiedName = type.declarationKind === "module" ? `${input.filePath}#${type.name}` : `${input.filePath}#${qualifiedTypePath}`;
    const kind: SymbolNode["kind"] = type.declarationKind === "module" ? "class" : "type";
    const existing = findSymbolAtStart(qualifiedName, kind, type.start);
    const symbol = existing ?? (() => {
      const declarationOrdinal = nextOrdinal(qualifiedName, kind);
      const created: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: type.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, type.start, type.end), isExported: type.isExported, declarationOrdinal };
      symbols.push(created);
      addContainment(moduleSymbol ?? fileNode, created, type.start, type.end);
      return created;
    })();
    erlangTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath, declarationKind: type.declarationKind, isExported: type.isExported, range: symbol.range });
    return symbol;
  }

  function addErlangCallable(callable: ErlangRawCallable): SymbolNode {
    const methodName = `${callable.name}/${callable.arity}`;
    const qualifiedName = `${input.filePath}#${callable.moduleName}.${methodName}`;
    const staticSymbol = callable.callableKind === "function" ? staticMethodSymbols.get(`${callable.name}\u0000${callable.arity}\u0000${callable.start}`) : undefined;
    const existing = staticSymbol ?? findSymbolAtStart(qualifiedName, "method", callable.start);
    const symbol = existing ?? (() => {
      const declarationOrdinal = nextOrdinal(qualifiedName, "method");
      const created: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "method", declarationOrdinal }), name: methodName, qualifiedName, kind: "method", filePath: input.filePath, range: rangeFor(lineStarts, callable.start, callable.end), isExported: callable.isExported, declarationOrdinal };
      symbols.push(created);
      addContainment(moduleSymbol ?? fileNode, created, callable.start, callable.end);
      return created;
    })();
    erlangCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, arity: callable.arity, callableKind: callable.callableKind, ...(callable.parameterTypeNames.length === 0 ? {} : { parameterTypeNames: callable.parameterTypeNames }), ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isExported: callable.isExported, range: symbol.range });
    relationCallableSymbols.set(callable.sourceKey, symbol);
    return symbol;
  }

  if (relationFacts.valid) {
    const relationModules = new Map<string, SymbolNode>();
    for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind === "module")) relationModules.set(type.name, addErlangType(type));
    for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind !== "module")) addErlangType(type);
    for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) addErlangCallable(callable);
    for (const imported of relationFacts.imports) erlangImports.push({ sourceId: fileNode.id, filePath: input.filePath, importKind: imported.importKind, importedModule: imported.importedModule, ...(imported.importedNames === undefined ? {} : { importedNames: imported.importedNames }), ...(imported.includePath === undefined ? {} : { includePath: imported.includePath }), range: rangeFor(lineStarts, imported.start, imported.end) });
    for (const call of relationFacts.calls) {
      const source = relationCallableSymbols.get(call.sourceKey);
      if (source === undefined) continue;
      erlangCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
    }
    for (const instantiation of relationFacts.instantiations) {
      const source = relationCallableSymbols.get(instantiation.sourceKey);
      if (source === undefined) continue;
      erlangInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
    }
    for (const reference of relationFacts.heritage) erlangHeritage.push({ sourceId: relationModules.get(reference.sourceTypeName)?.id ?? moduleSymbol?.id ?? fileNode.id, filePath: input.filePath, referenceName: reference.referenceName, sourceTypeName: reference.sourceTypeName, relationKind: "implements", range: rangeFor(lineStarts, reference.start, reference.end) });
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
    erlangFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: erlangTypes,
      callables: erlangCallables,
      imports: erlangImports,
      calls: erlangCalls,
      instantiations: erlangInstantiations,
      heritage: erlangHeritage
    } satisfies ErlangFacts
  };
}

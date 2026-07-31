import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface SqlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "sql";
}

type SqlDeclarationKind = "table" | "view";

interface SqlDeclaration {
  readonly kind: SqlDeclarationKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SqlStatement {
  /** First offset after the preceding semicolon (or zero). */
  readonly start: number;
  /** Offset of this statement's terminating semicolon. */
  readonly end: number;
}

interface SanitizedSqlSource {
  readonly valid: boolean;
  readonly text: string;
}

interface SqlIdentifier {
  readonly name: string;
  readonly end: number;
}

const SQL_IDENTIFIER_START = /^[A-Za-z_]$/u;
const SQL_IDENTIFIER_PART = /^[A-Za-z0-9_$]$/u;

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
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
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

function isSqlWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n" || character === "\f";
}

function isSqlIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && SQL_IDENTIFIER_START.test(character);
}

function isSqlIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && SQL_IDENTIFIER_PART.test(character);
}

function isDollarQuoteStart(sourceText: string, index: number): boolean {
  if (sourceText[index] !== "$") {
    return false;
  }

  let cursor = index + 1;
  while (isSqlIdentifierPart(sourceText[cursor])) {
    cursor += 1;
  }
  return sourceText[cursor] === "$";
}

/**
 * Blanks comments, quoted data, and quoted identifiers without moving any
 * offsets. Dollar-quoted bodies intentionally fail closed: they are most
 * common in dialect-specific routine definitions, which this first DDL slice
 * does not model.
 */
function sanitizeSqlSource(sourceText: string): SanitizedSqlSource {
  const text = sourceText.split("");
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanLineComment(): void {
    while (index < sourceText.length) {
      const character = sourceText[index];
      if (character === "\r" || character === "\n") {
        return;
      }
      blank(index);
      index += 1;
    }
  }

  function scanBlockComment(): boolean {
    blank(index);
    blank(index + 1);
    index += 2;
    while (index < sourceText.length) {
      const character = sourceText[index];
      const next = sourceText[index + 1];
      if (character === "*" && next === "/") {
        blank(index);
        blank(index + 1);
        index += 2;
        return true;
      }
      blank(index);
      index += 1;
    }
    return false;
  }

  function scanQuoted(quote: "'" | '"' | "`"): boolean {
    blank(index);
    index += 1;
    while (index < sourceText.length) {
      const character = sourceText[index];
      const next = sourceText[index + 1];
      if (character === "\\") {
        blank(index);
        index += 1;
        if (index >= sourceText.length) {
          return false;
        }
        blank(index);
        index += 1;
        continue;
      }
      if (character === quote) {
        blank(index);
        if (next === quote) {
          blank(index + 1);
          index += 2;
          continue;
        }
        index += 1;
        return true;
      }
      blank(index);
      index += 1;
    }
    return false;
  }

  function scanBracketIdentifier(): boolean {
    blank(index);
    index += 1;
    while (index < sourceText.length) {
      const character = sourceText[index];
      const next = sourceText[index + 1];
      if (character === "]") {
        blank(index);
        if (next === "]") {
          blank(index + 1);
          index += 2;
          continue;
        }
        index += 1;
        return true;
      }
      blank(index);
      index += 1;
    }
    return false;
  }

  while (index < sourceText.length) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (character === undefined) {
      break;
    }

    if (character === "-" && next === "-") {
      scanLineComment();
      continue;
    }
    if (character === "/" && next === "*") {
      if (!scanBlockComment()) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      if (!scanQuoted(character)) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (character === "[") {
      if (!scanBracketIdentifier()) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (character === "$" && isDollarQuoteStart(sourceText, index)) {
      return { valid: false, text: "" };
    }
    index += 1;
  }

  return { valid: true, text: text.join("") };
}

function skipWhitespace(text: string, index: number, limit: number): number {
  let cursor = index;
  while (cursor < limit && isSqlWhitespace(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function consumeKeyword(text: string, index: number, limit: number, keyword: string): number | null {
  const start = skipWhitespace(text, index, limit);
  const end = start + keyword.length;
  if (
    end > limit ||
    text.slice(start, end).toUpperCase() !== keyword ||
    isSqlIdentifierPart(text[start - 1]) ||
    isSqlIdentifierPart(text[end])
  ) {
    return null;
  }
  return end;
}

function consumeAnyKeyword(
  text: string,
  index: number,
  limit: number,
  keywords: readonly string[]
): number | null {
  for (const keyword of keywords) {
    const end = consumeKeyword(text, index, limit, keyword);
    if (end !== null) {
      return end;
    }
  }
  return null;
}

function readSqlIdentifier(text: string, index: number, limit: number): SqlIdentifier | null {
  const start = skipWhitespace(text, index, limit);
  if (!isSqlIdentifierStart(text[start])) {
    return null;
  }

  let end = start + 1;
  while (end < limit && isSqlIdentifierPart(text[end])) {
    end += 1;
  }
  return { name: text.slice(start, end), end };
}

function readQualifiedSqlIdentifier(text: string, index: number, limit: number): SqlIdentifier | null {
  const first = readSqlIdentifier(text, index, limit);
  if (first === null) {
    return null;
  }

  const parts = [first.name];
  let cursor = first.end;
  while (true) {
    const dot = skipWhitespace(text, cursor, limit);
    if (text[dot] !== ".") {
      return { name: parts.join("."), end: cursor };
    }
    const next = readSqlIdentifier(text, dot + 1, limit);
    if (next === null) {
      return null;
    }
    parts.push(next.name);
    cursor = next.end;
  }
}

function matchingParenthesis(text: string, opening: number, limit: number): number | null {
  let depth = 0;
  for (let index = opening; index < limit; index += 1) {
    const character = text[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

function hasBalancedParentheses(text: string, start: number, limit: number): boolean {
  let depth = 0;
  for (let index = start; index < limit; index += 1) {
    const character = text[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}

function directSqlTableDeclaration(text: string, statement: SqlStatement): SqlDeclaration | null {
  let cursor = consumeKeyword(text, statement.start, statement.end, "CREATE");
  if (cursor === null) {
    return null;
  }
  const start = skipWhitespace(text, statement.start, statement.end);

  const localOrGlobal = consumeAnyKeyword(text, cursor, statement.end, ["GLOBAL", "LOCAL"]);
  if (localOrGlobal !== null) {
    cursor = consumeAnyKeyword(text, localOrGlobal, statement.end, ["TEMPORARY", "TEMP"]);
    if (cursor === null) {
      return null;
    }
  } else {
    const temporary = consumeAnyKeyword(text, cursor, statement.end, ["TEMPORARY", "TEMP"]);
    if (temporary !== null) {
      cursor = temporary;
    } else {
      const unlogged = consumeKeyword(text, cursor, statement.end, "UNLOGGED");
      if (unlogged !== null) {
        cursor = unlogged;
      }
    }
  }

  cursor = consumeKeyword(text, cursor, statement.end, "TABLE");
  if (cursor === null) {
    return null;
  }

  const ifKeyword = consumeKeyword(text, cursor, statement.end, "IF");
  if (ifKeyword !== null) {
    const notKeyword = consumeKeyword(text, ifKeyword, statement.end, "NOT");
    const existsKeyword =
      notKeyword === null ? null : consumeKeyword(text, notKeyword, statement.end, "EXISTS");
    if (existsKeyword === null) {
      return null;
    }
    cursor = existsKeyword;
  }

  const name = readQualifiedSqlIdentifier(text, cursor, statement.end);
  if (name === null) {
    return null;
  }
  const opening = skipWhitespace(text, name.end, statement.end);
  if (text[opening] !== "(") {
    return null;
  }
  const closing = matchingParenthesis(text, opening, statement.end);
  if (closing === null || skipWhitespace(text, closing + 1, statement.end) !== statement.end) {
    return null;
  }

  return { kind: "table", name: name.name, start, end: statement.end + 1 };
}

function directSqlViewDeclaration(text: string, statement: SqlStatement): SqlDeclaration | null {
  let cursor = consumeKeyword(text, statement.start, statement.end, "CREATE");
  if (cursor === null) {
    return null;
  }
  const start = skipWhitespace(text, statement.start, statement.end);

  const orKeyword = consumeKeyword(text, cursor, statement.end, "OR");
  if (orKeyword !== null) {
    cursor = consumeKeyword(text, orKeyword, statement.end, "REPLACE");
    if (cursor === null) {
      return null;
    }
  }
  const temporary = consumeAnyKeyword(text, cursor, statement.end, ["TEMPORARY", "TEMP"]);
  if (temporary !== null) {
    cursor = temporary;
  }

  cursor = consumeKeyword(text, cursor, statement.end, "VIEW");
  if (cursor === null) {
    return null;
  }
  const name = readQualifiedSqlIdentifier(text, cursor, statement.end);
  if (name === null) {
    return null;
  }
  const asKeyword = consumeKeyword(text, name.end, statement.end, "AS");
  if (asKeyword === null) {
    return null;
  }
  const queryStart = skipWhitespace(text, asKeyword, statement.end);
  const queryKeyword =
    consumeKeyword(text, queryStart, statement.end, "SELECT") ??
    consumeKeyword(text, queryStart, statement.end, "WITH");
  if (
    queryKeyword === null ||
    skipWhitespace(text, queryKeyword, statement.end) >= statement.end ||
    !hasBalancedParentheses(text, queryStart, statement.end)
  ) {
    return null;
  }

  return { kind: "view", name: name.name, start, end: statement.end + 1 };
}

/**
 * Extracts a narrow, source-only SQL DDL surface. Each candidate must be a
 * semicolon-terminated direct `CREATE TABLE` or `CREATE VIEW` statement with
 * an unquoted literal identifier. Table bodies and view queries are not
 * interpreted; routines, DML, constraints, relations, and runtime behavior
 * intentionally remain outside this first SQL language slice.
 */
function staticSqlDeclarations(sourceText: string): readonly SqlDeclaration[] {
  const sanitized = sanitizeSqlSource(sourceText);
  if (!sanitized.valid) {
    return [];
  }

  const declarations: SqlDeclaration[] = [];
  let statementStart = 0;
  for (let index = 0; index < sanitized.text.length; index += 1) {
    if (sanitized.text[index] !== ";") {
      continue;
    }
    const statement = { start: statementStart, end: index };
    const declaration =
      directSqlTableDeclaration(sanitized.text, statement) ??
      directSqlViewDeclaration(sanitized.text, statement);
    if (declaration !== null) {
      declarations.push(declaration);
    }
    statementStart = index + 1;
  }
  return declarations;
}

/**
 * Emits direct SQL schema declaration facts without claiming a dialect parser,
 * query planner, database connection, migration order, or runtime database
 * behavior. The existing `resource` kind represents named schema resources.
 */
export function extractSqlFileFacts(input: SqlExtractFileFactsInput): ArtifactFacts {
  const declarations = staticSqlDeclarations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
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
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();

  for (const declaration of declarations) {
    const qualifiedName = `${input.filePath}#sql-${declaration.kind}:${declaration.name}`;
    const identity = `${qualifiedName}\u0000resource`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "resource",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "resource",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: `language.sql.create-${declaration.kind}.direct-ddl`,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
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

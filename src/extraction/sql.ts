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

const MAXIMUM_SOURCE_BYTES = 131_072;
const MAXIMUM_TOKENS = 32_768;
const MAXIMUM_STATEMENTS = 1_024;
const MAXIMUM_COMMENT_DEPTH = 32;
const MAXIMUM_PARENTHESES_DEPTH = 64;
const MAXIMUM_IDENTIFIER_BYTES = 63;
const MAXIMUM_LITERAL_BYTES = 16_384;

const RESERVED_WORDS = new Set(
  ("all analyse analyze and any array as asc asymmetric authorization binary both case cast check " +
    "collate collation column concurrently constraint create cross current_catalog current_date " +
    "current_role current_schema current_time current_timestamp current_user default deferrable desc " +
    "distinct do else end except false fetch for foreign freeze from full grant group having ilike in " +
    "initially inner intersect into is isnull join lateral leading left like limit localtime " +
    "localtimestamp natural not notnull null nulls offset on only or order outer overlaps placing " +
    "primary references returning right select session_user similar some symmetric system_user table tablesample " +
    "then to trailing true union unique user using variadic verbose when where window with").split(" ")
);
const SIMPLE_TYPES = new Set(
  ("smallint integer bigint int int2 int4 int8 smallserial serial bigserial text boolean bool uuid json " +
    "jsonb bytea date time timetz timestamptz timestamp interval numeric decimal real float float4 float8 " +
    "char bpchar bit varbit varchar name oid").split(" ")
);

type TokenKind = "word" | "qident" | "number" | "string" | "dollar" | "punct" | "symbol" | "operator";
type FileErrorCode =
  | "SOURCE_LIMIT" | "NUL" | "INVALID_UNICODE_SENTINEL" | "UNTERMINATED_COMMENT" | "COMMENT_DEPTH"
  | "EMPTY_IDENTIFIER" | "IDENTIFIER_LIMIT" | "UNTERMINATED_IDENTIFIER" | "UNTERMINATED_STRING"
  | "LITERAL_LIMIT" | "UNTERMINATED_DOLLAR" | "PAREN_DEPTH" | "UNBALANCED_PAREN" | "NESTED_SEMICOLON"
  | "UNMODELED_BACKSLASH" | "UNMODELED_UNICODE_ESCAPE" | "TOKEN_LIMIT" | "STATEMENT_LIMIT" | "COPY_STDIN";
type ParseErrorCode = FileErrorCode | "UNEXPECTED_EOF" | "EXPECTED_TOKEN" | "EXPECTED_IDENTIFIER" | "UNSUPPORTED_CREATE" | "TRAILING_TOKEN" | "TRAILING_COMMA" | "DUPLICATE_COLUMN" | "DUPLICATE_PRIMARY_KEY" | "INVALID_PRIMARY_KEY_COLUMNS" | "UNSUPPORTED_TYPE" | "TYPE_MODIFIER" | "DUPLICATE_NULLABILITY";

interface Token { readonly kind: TokenKind; readonly value: string; readonly start: number; readonly end: number; readonly raw: string; }
interface Statement { readonly ordinal: number; readonly tokens: readonly Token[]; }
interface Declaration {
  readonly kind: "schema" | "table";
  readonly name: string;
  readonly qualified: boolean;
  readonly declarationStart: number;
  readonly declarationEnd: number;
  readonly nameStart: number;
  readonly nameEnd: number;
}
type LexResult = { readonly ok: true; readonly statements: readonly Statement[] } | { readonly ok: false; readonly code: FileErrorCode; readonly offsetUtf16: number };

class TinySqlParseError extends Error {
  public constructor(public readonly code: ParseErrorCode, public readonly offsetUtf16: number) { super(code); }
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText.charCodeAt(index) === 13) {
      if (sourceText.charCodeAt(index + 1) === 10) index += 1;
      starts.push(index + 1);
    } else if (sourceText.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}
function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let lower = 0;
  let upper = lineStarts.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) lower = middle;
    else upper = middle - 1;
  }
  return { line: lower + 1, column: offset - (lineStarts[lower] ?? 0) + 1 };
}
function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return { start: positionFor(lineStarts, from), end: positionFor(lineStarts, to) };
}
/** Computes the file endpoint without retaining one offset per line. */
function fileRangeFor(sourceText: string): SourceRange {
  let line = 1;
  let column = 1;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      if (sourceText.charCodeAt(index + 1) === 10) index += 1;
      line += 1;
      column = 1;
    } else if (character === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { start: { line: 1, column: 1 }, end: { line, column } };
}
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => String.fromCharCode(character.charCodeAt(0) + 32));
}
/** Counts UTF-8 bytes without allocating an encoded copy of attacker-controlled source. */
function byteLength(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) result += 1;
    else if (codeUnit < 0x800) result += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      result += 4;
      index += 1;
    } else result += 3;
  }
  return result;
}
function pointAt(sourceText: string, index: number): { readonly value: string; readonly width: number } | null {
  const codePoint = sourceText.codePointAt(index);
  return codePoint === undefined ? null : { value: String.fromCodePoint(codePoint), width: codePoint > 0xffff ? 2 : 1 };
}
function isIdentifierStart(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return character === "_" || (character >= "A" && character <= "Z") || (character >= "a" && character <= "z") || codePoint >= 128;
}
function isIdentifierContinue(character: string): boolean {
  return isIdentifierStart(character) || character === "$" || (character >= "0" && character <= "9");
}
function isWord(token: Token | undefined, value: string): boolean { return token?.kind === "word" && token.value === value; }
function renderIdentifier(value: string, quoted: boolean): string { return quoted ? `"${value.replaceAll('"', '""')}"` : value; }

/** Bounded lexical isolation: any lexical or resource error invalidates the entire file. */
function lexTinyPostgresStructuralV2(sourceText: string): LexResult {
  const fail = (code: FileErrorCode, offsetUtf16: number): LexResult => ({ ok: false, code, offsetUtf16 });
  if (sourceText.includes("\0")) return fail("NUL", sourceText.indexOf("\0"));
  if (sourceText.includes("\ufffd") || /[\ud800-\udfff]/u.test(sourceText)) return fail("INVALID_UNICODE_SENTINEL", 0);
  if (byteLength(sourceText) > MAXIMUM_SOURCE_BYTES) return fail("SOURCE_LIMIT", 0);
  const tokens: Token[] = [];
  let statementTokenStart = 0;
  let index = 0;
  let parentheses = 0;
  const emit = (kind: TokenKind, value: string, start: number, end: number): LexResult | null => {
    tokens.push({ kind, value, start, end, raw: sourceText.slice(start, end) });
    return tokens.length > MAXIMUM_TOKENS ? fail("TOKEN_LIMIT", start) : null;
  };
  const blockComment = (): LexResult | null => {
    const start = index;
    let depth = 1;
    index += 2;
    while (index < sourceText.length && depth > 0) {
      if (sourceText.startsWith("/*", index)) {
        depth += 1;
        if (depth > MAXIMUM_COMMENT_DEPTH) return fail("COMMENT_DEPTH", index);
        index += 2;
      } else if (sourceText.startsWith("*/", index)) {
        depth -= 1;
        index += 2;
      } else index += pointAt(sourceText, index)?.width ?? 1;
    }
    return depth === 0 ? null : fail("UNTERMINATED_COMMENT", start);
  };
  const quotedIdentifier = (): LexResult | null => {
    const start = index;
    let decoded = "";
    index += 1;
    while (index < sourceText.length) {
      if (sourceText[index] === '"') {
        if (sourceText[index + 1] === '"') { decoded += '"'; index += 2; continue; }
        index += 1;
        if (decoded.length === 0) return fail("EMPTY_IDENTIFIER", start);
        if (byteLength(decoded) > MAXIMUM_IDENTIFIER_BYTES) return fail("IDENTIFIER_LIMIT", start);
        return emit("qident", decoded, start, index);
      }
      const point = pointAt(sourceText, index);
      if (point === null) break;
      decoded += point.value;
      index += point.width;
    }
    return fail("UNTERMINATED_IDENTIFIER", start);
  };
  const stringLiteral = (prefixLength: number, backslashEscapes: boolean): LexResult | null => {
    const start = index;
    index += prefixLength + 1;
    while (index < sourceText.length) {
      if (backslashEscapes && sourceText[index] === "\\") {
        const next = pointAt(sourceText, index + 1);
        if (next === null) return fail("UNTERMINATED_STRING", start);
        index += next.width + 1;
      } else if (sourceText[index] === "'") {
        if (sourceText[index + 1] === "'") index += 2;
        else {
          index += 1;
          if (byteLength(sourceText.slice(start, index)) > MAXIMUM_LITERAL_BYTES) return fail("LITERAL_LIMIT", start);
          return emit("string", sourceText.slice(start, index), start, index);
        }
      } else index += pointAt(sourceText, index)?.width ?? 1;
    }
    return fail("UNTERMINATED_STRING", start);
  };
  const dollarDelimiterAt = (start: number): string | null => {
    let cursor = start + 1;
    if (sourceText[cursor] === "$") return "$$";
    const first = pointAt(sourceText, cursor);
    if (first === null || !isIdentifierStart(first.value)) return null;
    cursor += first.width;
    while (cursor < sourceText.length) {
      if (sourceText[cursor] === "$") return sourceText.slice(start, cursor + 1);
      const point = pointAt(sourceText, cursor);
      if (point === null || !isIdentifierContinue(point.value)) return null;
      cursor += point.width;
    }
    return null;
  };
  const dollarLiteral = (delimiter: string): LexResult | null => {
    const start = index;
    index += delimiter.length;
    const end = sourceText.indexOf(delimiter, index);
    if (end < 0) return fail("UNTERMINATED_DOLLAR", start);
    index = end + delimiter.length;
    if (byteLength(sourceText.slice(start, index)) > MAXIMUM_LITERAL_BYTES) return fail("LITERAL_LIMIT", start);
    return emit("dollar", sourceText.slice(start, index), start, index);
  };
  const unicodeEscapeToken = (): LexResult | null => {
    const start = index;
    const quote = sourceText[index + 2];
    index += 3;
    while (index < sourceText.length) {
      if (sourceText[index] === quote) {
        if (sourceText[index + 1] === quote) { index += 2; continue; }
        index += 1;
        if (byteLength(sourceText.slice(start, index)) > MAXIMUM_LITERAL_BYTES) return fail("LITERAL_LIMIT", start);
        return emit("symbol", "unicode-escape", start, index);
      }
      index += pointAt(sourceText, index)?.width ?? 1;
    }
    return fail("UNMODELED_UNICODE_ESCAPE", start);
  };
  const skipPsqlMacroStatement = (from: number): number | null => {
    let cursor = from;
    while (cursor < sourceText.length) {
      if (sourceText.startsWith("--", cursor)) {
        const end = sourceText.indexOf("\n", cursor + 2);
        cursor = end < 0 ? sourceText.length : end + 1;
        continue;
      }
      if (sourceText.startsWith("/*", cursor)) {
        let depth = 1;
        cursor += 2;
        while (cursor < sourceText.length && depth > 0) {
          if (sourceText.startsWith("/*", cursor)) { depth += 1; cursor += 2; }
          else if (sourceText.startsWith("*/", cursor)) { depth -= 1; cursor += 2; }
          else cursor += pointAt(sourceText, cursor)?.width ?? 1;
        }
        if (depth !== 0) return null;
        continue;
      }
      if (sourceText[cursor] === "'" || sourceText[cursor] === '"') {
        const quote = sourceText[cursor];
        const escaped = quote === "'" && (sourceText[cursor - 1] === "e" || sourceText[cursor - 1] === "E") && !/[A-Za-z0-9_$]/u.test(sourceText[cursor - 2] ?? "");
        cursor += 1;
        let closed = false;
        while (cursor < sourceText.length) {
          if (escaped && sourceText[cursor] === "\\") { cursor += 2; continue; }
          if (sourceText[cursor] === quote) {
            if (sourceText[cursor + 1] === quote) { cursor += 2; continue; }
            cursor += 1;
            closed = true;
            break;
          }
          cursor += pointAt(sourceText, cursor)?.width ?? 1;
        }
        if (!closed) return null;
        continue;
      }
      if (sourceText[cursor] === "$") {
        const delimiter = dollarDelimiterAt(cursor);
        if (delimiter !== null) {
          const closing = sourceText.indexOf(delimiter, cursor + delimiter.length);
          if (closing < 0) return null;
          cursor = closing + delimiter.length;
          continue;
        }
      }
      if (sourceText[cursor] === ";") return cursor + 1;
      cursor += pointAt(sourceText, cursor)?.width ?? 1;
    }
    return null;
  };

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    const point = pointAt(sourceText, index);
    if (point === null) break;
    if (character === " " || character === "\t" || character === "\r" || character === "\n" || character === "\f") { index += point.width; continue; }
    if (sourceText.startsWith("--", index)) { const end = sourceText.indexOf("\n", index + 2); index = end < 0 ? sourceText.length : end + 1; continue; }
    if (sourceText.startsWith("/*", index)) { const result = blockComment(); if (result !== null) return result; continue; }
    if (sourceText.slice(index, index + 2).toLowerCase() === "u&" && (sourceText[index + 2] === "'" || sourceText[index + 2] === '"')) {
      const result = unicodeEscapeToken();
      if (result !== null) return result;
      continue;
    }
    if ("eEbBxX".includes(character) && sourceText[index + 1] === "'") { const result = stringLiteral(1, character === "e" || character === "E"); if (result !== null) return result; continue; }
    if (character === '"') { const result = quotedIdentifier(); if (result !== null) return result; continue; }
    if (character === "'") { const result = stringLiteral(0, false); if (result !== null) return result; continue; }
    if (character === "$") {
      const delimiter = dollarDelimiterAt(index);
      const result = delimiter === null ? emit("symbol", "$", index, index + 1) : dollarLiteral(delimiter);
      if (result !== null) return result;
      if (delimiter === null) index += 1;
      continue;
    }
    if (isIdentifierStart(point.value)) {
      const start = index;
      index += point.width;
      while (index < sourceText.length) { const next = pointAt(sourceText, index); if (next === null || !isIdentifierContinue(next.value)) break; index += next.width; }
      const result = emit("word", asciiLower(sourceText.slice(start, index)), start, index);
      if (result !== null) return result;
      continue;
    }
    if (character >= "0" && character <= "9") {
      const start = index;
      index += 1;
      while (true) {
        const next = sourceText[index];
        if (next === undefined || next < "0" || next > "9") break;
        index += 1;
      }
      const result = emit("number", sourceText.slice(start, index), start, index);
      if (result !== null) return result;
      continue;
    }
    if ("(),.;[]".includes(character)) {
      if (character === "(") { parentheses += 1; if (parentheses > MAXIMUM_PARENTHESES_DEPTH) return fail("PAREN_DEPTH", index); }
      else if (character === ")") {
        parentheses -= 1;
        if (parentheses < 0) {
          const statementTokens = tokens.slice(statementTokenStart);
          const hasPsqlVariable = statementTokens.some((token, tokenIndex) => token.value === ":" && ["word", "qident"].includes(statementTokens[tokenIndex + 1]?.kind ?? ""));
          const recoveredAt = hasPsqlVariable ? skipPsqlMacroStatement(index + 1) : null;
          if (recoveredAt === null) return fail("UNBALANCED_PAREN", index);
          tokens.splice(statementTokenStart);
          parentheses = 0;
          index = recoveredAt;
          statementTokenStart = tokens.length;
          continue;
        }
      }
      else if (character === ";" && parentheses !== 0) return fail("NESTED_SEMICOLON", index);
      const copyFromStdin = character === ";" && (() => {
        const values = tokens.slice(statementTokenStart).map((token) => token.value);
        return values[0] === "copy" && values.some((value, tokenIndex) => value === "from" && values[tokenIndex + 1] === "stdin");
      })();
      const result = emit("punct", character, index, index + 1);
      if (result !== null) return result;
      index += 1;
      if (character === ";") statementTokenStart = tokens.length;
      if (copyFromStdin) {
        let cursor = index;
        let terminated = false;
        while (cursor <= sourceText.length) {
          const lineEnd = sourceText.indexOf("\n", cursor);
          const end = lineEnd < 0 ? sourceText.length : lineEnd;
          const line = sourceText.slice(cursor, end).replace(/\r$/u, "");
          if (/^[ \t]*\\\.[ \t]*$/u.test(line)) {
            index = lineEnd < 0 ? sourceText.length : lineEnd + 1;
            terminated = true;
            break;
          }
          if (lineEnd < 0) break;
          cursor = lineEnd + 1;
        }
        if (!terminated) return fail("COPY_STDIN", index);
      }
      continue;
    }
    if (character === "\\") {
      const lineStart = sourceText.lastIndexOf("\n", index - 1) + 1;
      const lineEnd = sourceText.indexOf("\n", index + 1);
      const command = sourceText.slice(index, lineEnd < 0 ? sourceText.length : lineEnd);
      if (/^[ \t]*$/u.test(sourceText.slice(lineStart, index))) {
        if (parentheses === 0 && /^\\g(?:set|exec)?(?:[ \t]+[^\r\n]*)?\r?$/u.test(command) && tokens.length > statementTokenStart) {
          const result = emit("punct", ";", index, index + 1);
          if (result !== null) return result;
          statementTokenStart = tokens.length;
        }
        index = lineEnd < 0 ? sourceText.length : lineEnd + 1;
        continue;
      }
      if (parentheses === 0 && /^\\g(?:set|exec)?(?:[ \t]+[^\r\n]*)?\r?$/u.test(command)) {
        const result = emit("punct", ";", index, index + 1);
        if (result !== null) return result;
        statementTokenStart = tokens.length;
        index = lineEnd < 0 ? sourceText.length : lineEnd + 1;
        continue;
      }
      return fail("UNMODELED_BACKSLASH", index);
    }
    const start = index;
    index += point.width;
    while (index < sourceText.length && "+-*/<>=~!@#%^&|`?:".includes(sourceText[index] ?? "")) index += 1;
    const result = emit("operator", sourceText.slice(start, index), start, index);
    if (result !== null) return result;
  }
  if (parentheses !== 0) return fail("UNBALANCED_PAREN", sourceText.length);
  const statements: Statement[] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.value === ";") {
      if (current.length > 0) {
        statements.push({ ordinal: statements.length, tokens: current });
        if (statements.length > MAXIMUM_STATEMENTS) return fail("STATEMENT_LIMIT", token.start);
        current = [];
      }
    } else current.push(token);
  }
  if (current.length > 0) {
    statements.push({ ordinal: statements.length, tokens: current });
    if (statements.length > MAXIMUM_STATEMENTS) return fail("STATEMENT_LIMIT", current[0]?.start ?? sourceText.length);
  }
  return { ok: true, statements };
}

class TinyStatementParser {
  private index = 0;
  public constructor(private readonly tokens: readonly Token[]) {}
  public parse(): Declaration {
    const create = this.expect("create");
    const schema = this.match("schema");
    if (schema === null && (this.peek("temporary") !== undefined || this.peek("temp") !== undefined || this.peek("unlogged") !== undefined)) this.take();
    const declaration = schema !== null ? this.schema(create) : this.match("table") !== null ? this.table(create) : (() => { throw this.error("UNSUPPORTED_CREATE", create.start); })();
    if (this.index !== this.tokens.length) throw this.error("TRAILING_TOKEN", this.current()?.start ?? declaration.declarationEnd);
    return declaration;
  }
  private current(): Token | undefined { return this.tokens[this.index]; }
  private peek(value: string): Token | undefined {
    const token = this.current();
    return isWord(token, value) || (token?.kind === "punct" && token.value === value) ? token : undefined;
  }
  private take(): Token { const token = this.tokens[this.index]; if (token === undefined) throw this.error("UNEXPECTED_EOF", this.tokens.at(-1)?.end ?? 0); this.index += 1; return token; }
  private match(value: string): Token | null { const token = this.peek(value); if (token === undefined) return null; this.index += 1; return token; }
  private expect(value: string): Token {
    const token = this.take();
    const expectedWord = /^[a-z]+$/u.test(value);
    if ((expectedWord && !isWord(token, value)) || (!expectedWord && (token.kind !== "punct" || token.value !== value))) throw this.error("EXPECTED_TOKEN", token.start);
    return token;
  }
  private identifier(): { readonly token: Token; readonly name: string; readonly quoted: boolean } {
    const token = this.take();
    if (token.kind === "qident") return { token, name: token.value, quoted: true };
    if (token.kind !== "word") throw this.error("EXPECTED_IDENTIFIER", token.start);
    if (RESERVED_WORDS.has(token.value)) throw this.error("EXPECTED_IDENTIFIER", token.start);
    if (byteLength(token.raw) > MAXIMUM_IDENTIFIER_BYTES) throw this.error("IDENTIFIER_LIMIT", token.start);
    return { token, name: token.value, quoted: false };
  }
  private ifNotExists(): void { if (this.match("if") !== null) { this.expect("not"); this.expect("exists"); } }
  private schema(create: Token): Declaration {
    this.ifNotExists();
    const name = this.identifier();
    if (this.match("authorization") !== null) {
      if (this.current()?.value === ":") this.take();
      this.identifier();
    }
    return { kind: "schema", name: renderIdentifier(name.name, name.quoted), qualified: false, declarationStart: create.start, declarationEnd: this.tokens.at(-1)?.end ?? create.end, nameStart: name.token.start, nameEnd: name.token.end };
  }
  private table(create: Token): Declaration {
    this.ifNotExists();
    const first = this.identifier();
    const names = [first];
    if (this.match(".") !== null) names.push(this.identifier());
    if (this.peek("(") !== undefined && this.tableAsColumnList()) {
      return { kind: "table", name: names.map((name) => renderIdentifier(name.name, name.quoted)).join("."), qualified: names.length === 2, declarationStart: create.start, declarationEnd: this.tokens[this.index - 1]?.end ?? create.end, nameStart: first.token.start, nameEnd: names.at(-1)?.token.end ?? first.token.end };
    }
    if (this.match("of") !== null) {
      this.qualifiedIdentifier();
      this.tableTails();
      return { kind: "table", name: names.map((name) => renderIdentifier(name.name, name.quoted)).join("."), qualified: names.length === 2, declarationStart: create.start, declarationEnd: this.tokens[this.index - 1]?.end ?? create.end, nameStart: first.token.start, nameEnd: names.at(-1)?.token.end ?? first.token.end };
    }
    if (this.match("as") !== null) {
      this.tableAsQuery();
      return { kind: "table", name: names.map((name) => renderIdentifier(name.name, name.quoted)).join("."), qualified: names.length === 2, declarationStart: create.start, declarationEnd: this.tokens[this.index - 1]?.end ?? create.end, nameStart: first.token.start, nameEnd: names.at(-1)?.token.end ?? first.token.end };
    }
    if (this.match("partition") !== null) {
      this.partitionOf();
      this.tableTails();
      return { kind: "table", name: names.map((name) => renderIdentifier(name.name, name.quoted)).join("."), qualified: names.length === 2, declarationStart: create.start, declarationEnd: this.tokens[this.index - 1]?.end ?? create.end, nameStart: first.token.start, nameEnd: names.at(-1)?.token.end ?? first.token.end };
    }
    this.expect("(");
    const columns: string[] = [];
    let tablePrimaryKey: readonly string[] | null = null;
    while (this.peek(")") === undefined) {
      if (this.match("like") !== null) {
        this.tableLike();
      } else if (this.peek("constraint") !== undefined || this.peek("primary") !== undefined || this.peek("unique") !== undefined || this.peek("check") !== undefined || this.peek("foreign") !== undefined || this.peek("exclude") !== undefined) {
        const primaryKey = this.tableConstraint();
        if (primaryKey !== null) {
          if (tablePrimaryKey !== null) throw this.error("DUPLICATE_PRIMARY_KEY", this.current()?.start ?? create.end);
          tablePrimaryKey = primaryKey;
        }
      } else {
        const column = this.column();
        if (columns.includes(column)) throw this.error("DUPLICATE_COLUMN", this.tokens[this.index - 1]?.start ?? create.end);
        columns.push(column);
      }
      if (this.match(",") !== null) { if (this.peek(")") !== undefined) throw this.error("TRAILING_COMMA", this.current()?.start ?? create.end); continue; }
      break;
    }
    const closing = this.expect(")");
    const inherits = this.tableTails();
    if (tablePrimaryKey !== null && (new Set(tablePrimaryKey).size !== tablePrimaryKey.length || (!inherits && tablePrimaryKey.some((name) => !columns.includes(name))))) throw this.error("INVALID_PRIMARY_KEY_COLUMNS", closing.start);
    return { kind: "table", name: names.map((name) => renderIdentifier(name.name, name.quoted)).join("."), qualified: names.length === 2, declarationStart: create.start, declarationEnd: this.tokens[this.index - 1]?.end ?? closing.end, nameStart: first.token.start, nameEnd: names.at(-1)?.token.end ?? first.token.end };
  }
  private tableLike(): void {
    if (!this.psqlVariable()) this.qualifiedIdentifier();
    const options = new Set(["all", "comments", "compression", "constraints", "defaults", "extended_statistics", "generated", "identity", "indexes", "statistics", "storage"]);
    while (this.peek("including") !== undefined || this.peek("excluding") !== undefined) {
      this.take();
      const option = this.take();
      if (option.kind !== "word" || !options.has(option.value)) throw this.error("EXPECTED_TOKEN", option.start);
    }
  }
  private tableAsColumnList(): boolean {
    const saved = this.index;
    try {
      this.expect("(");
      this.identifier();
      while (this.match(",") !== null) this.identifier();
      this.expect(")");
      if (this.match("as") === null) { this.index = saved; return false; }
      this.tableAsQuery();
      return true;
    } catch (error) {
      if (!(error instanceof TinySqlParseError)) throw error;
      this.index = saved;
      return false;
    }
  }
  private tableAsQuery(): void {
    if (this.psqlVariable()) {
      if (this.index !== this.tokens.length) throw this.error("TRAILING_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
      return;
    }
    const starter = this.take();
    if (starter.kind !== "word" || !new Set(["select", "table", "values", "with"]).has(starter.value)) throw this.error("EXPECTED_TOKEN", starter.start);
    const remaining = this.tokens.slice(this.index);
    let queryTokenCount = remaining.length;
    if (isWord(remaining.at(-1), "data")) {
      if (isWord(remaining.at(-2), "no") && isWord(remaining.at(-3), "with")) queryTokenCount -= 3;
      else if (isWord(remaining.at(-2), "with")) queryTokenCount -= 2;
    }
    if (queryTokenCount < 1 || (starter.value === "with" && !remaining.slice(0, queryTokenCount).some((token) => isWord(token, "select") || isWord(token, "table") || isWord(token, "values")))) {
      throw this.error("EXPECTED_TOKEN", this.current()?.start ?? starter.end);
    }
    this.index = this.tokens.length;
  }
  private partitionOf(): void {
    this.expect("of");
    this.qualifiedIdentifier();
    if (this.match("default") !== null) return;
    this.expect("for");
    this.expect("values");
    if (this.match("from") !== null) {
      this.balancedParenthesized();
      this.expect("to");
      this.balancedParenthesized();
    } else if (this.match("in") !== null || this.match("with") !== null) {
      this.balancedParenthesized();
    } else throw this.error("EXPECTED_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
  }
  private tableTails(): boolean {
    let inherits = false;
    while (this.index < this.tokens.length) {
      if (this.match("with") !== null) this.balancedParenthesized();
      else if (this.match("tablespace") !== null || this.match("using") !== null) this.identifier();
      else if (this.match("inherits") !== null) {
        inherits = true;
        this.expect("(");
        this.qualifiedIdentifier();
        while (this.match(",") !== null) this.qualifiedIdentifier();
        this.expect(")");
      } else if (this.match("partition") !== null) {
        this.expect("by");
        const strategy = this.take();
        if (strategy.kind !== "word" || !new Set(["hash", "list", "range"]).has(strategy.value)) throw this.error("EXPECTED_TOKEN", strategy.start);
        this.balancedParenthesized();
      } else break;
    }
    return inherits;
  }
  private type(): void {
    if (this.psqlVariable()) return;
    const token = this.take();
    if (token.kind !== "word" && token.kind !== "qident") throw this.error("UNSUPPORTED_TYPE", token.start);
    if (token.kind === "word" && RESERVED_WORDS.has(token.value) && !SIMPLE_TYPES.has(token.value)) throw this.error("UNSUPPORTED_TYPE", token.start);
    if (token.kind === "word" && token.value === "character") {
      this.expect("varying");
      if (this.match("(") !== null) { if (this.take().kind !== "number") throw this.error("TYPE_MODIFIER", token.start); this.expect(")"); }
    } else {
      if (token.value === "double") this.expect("precision");
      if ((token.value === "time" || token.value === "timestamp") && this.match("(") !== null) {
        if (this.take().kind !== "number") throw this.error("TYPE_MODIFIER", token.start);
        this.expect(")");
      }
      if (new Set(["bit", "bpchar", "char", "decimal", "numeric", "varbit", "varchar"]).has(token.value) && this.match("(") !== null) {
        if (this.take().kind !== "number") throw this.error("TYPE_MODIFIER", token.start);
        if (this.match(",") !== null && this.take().kind !== "number") throw this.error("TYPE_MODIFIER", token.start);
        this.expect(")");
      }
      if ((token.value === "time" || token.value === "timestamp") && (this.peek("with") !== undefined || this.peek("without") !== undefined)) {
        this.take();
        this.expect("time");
        this.expect("zone");
      }
      if (!SIMPLE_TYPES.has(token.value) && token.value !== "double" && this.match(".") !== null) {
        const qualified = this.take();
        if (qualified.kind !== "word" && qualified.kind !== "qident") throw this.error("UNSUPPORTED_TYPE", qualified.start);
      }
    }
    while (this.match("[") !== null) this.expect("]");
  }
  private column(): string {
    const name = this.identifier().name;
    this.type();
    let nullability: "null" | "not-null" | null = null;
    let primary = false;
    while (this.index < this.tokens.length) {
      if (this.match("not") !== null) { this.expect("null"); if (nullability !== null) throw this.error("DUPLICATE_NULLABILITY", this.tokens[this.index - 1]?.start ?? 0); nullability = "not-null"; }
      else if (this.match("null") !== null) { if (nullability !== null) throw this.error("DUPLICATE_NULLABILITY", this.tokens[this.index - 1]?.start ?? 0); nullability = "null"; }
      else if (this.match("collate") !== null) { if (!this.psqlVariable()) this.qualifiedIdentifier(); }
      else if (this.match("primary") !== null) { this.expect("key"); if (primary) throw this.error("DUPLICATE_PRIMARY_KEY", this.tokens[this.index - 1]?.start ?? 0); primary = true; this.constraintOptions(); }
      else if (this.match("unique") !== null) { this.constraintOptions(); continue; }
      else if (this.match("check") !== null) this.balancedParenthesized();
      else if (this.match("constraint") !== null) {
        this.identifier();
        if (this.match("check") !== null) this.balancedParenthesized();
        else if (this.match("unique") !== null) this.constraintOptions();
        else if (this.match("primary") !== null) { this.expect("key"); this.constraintOptions(); }
        else throw this.error("EXPECTED_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
      }
      else if (this.match("references") !== null) {
        this.qualifiedIdentifier();
        if (this.peek("(") !== undefined) this.identifierList();
        if (!this.atBoundary()) this.skipToBoundary();
        break;
      } else if (this.match("default") !== null || this.match("generated") !== null) {
        this.skipToBoundary();
        break;
      }
      else break;
    }
    return name;
  }
  private tableConstraint(): readonly string[] | null {
    if (this.match("constraint") !== null) this.identifier();
    if (this.match("primary") !== null) {
      this.expect("key");
      const names = this.identifierList();
      this.constraintOptions();
      return names;
    }
    if (this.match("unique") !== null) {
      this.identifierList();
      this.constraintOptions();
      return null;
    }
    if (this.match("check") !== null) {
      this.balancedParenthesized();
      return null;
    }
    if (this.match("exclude") !== null) {
      this.expect("using");
      this.identifier();
      this.balancedParenthesized();
      if (this.match("where") !== null) this.balancedParenthesized();
      this.constraintOptions();
      return null;
    }
    if (this.match("foreign") !== null) {
      this.expect("key");
      this.identifierList();
      this.expect("references");
      this.qualifiedIdentifier();
      if (this.peek("(") !== undefined) this.identifierList();
      if (!this.atBoundary()) this.skipToBoundary();
      return null;
    }
    throw this.error("EXPECTED_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
  }
  private constraintOptions(): void {
    while (this.index < this.tokens.length) {
      if (this.match("using") !== null) {
        this.expect("index");
        if (this.match("tablespace") !== null) this.identifier();
      } else if (this.match("deferrable") !== null) continue;
      else if (this.peek("not") !== undefined && isWord(this.tokens[this.index + 1], "deferrable")) { this.take(); this.take(); }
      else if (this.match("initially") !== null) {
        if (this.match("deferred") === null && this.match("immediate") === null) throw this.error("EXPECTED_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
      } else break;
    }
  }
  private identifierList(): readonly string[] {
    this.expect("(");
    const names = [this.identifier().name];
    while (this.match(",") !== null) names.push(this.identifier().name);
    this.expect(")");
    return names;
  }
  private qualifiedIdentifier(): void {
    this.identifier();
    if (this.match(".") !== null) this.identifier();
  }
  private psqlVariable(): boolean {
    if (this.current()?.value !== ":") return false;
    const name = this.tokens[this.index + 1];
    if (name?.kind !== "word" && name?.kind !== "qident") return false;
    this.index += 2;
    return true;
  }
  private balancedParenthesized(): void {
    this.expect("(");
    let depth = 1;
    while (depth > 0) {
      const token = this.take();
      if (token.value === "(") depth += 1;
      else if (token.value === ")") depth -= 1;
    }
  }
  private skipToBoundary(): void {
    let depth = 0;
    let consumed = false;
    while (this.index < this.tokens.length) {
      const token = this.current();
      if (token === undefined || (depth === 0 && (token.value === "," || token.value === ")"))) break;
      this.take();
      consumed = true;
      if (token.value === "(") depth += 1;
      else if (token.value === ")") depth -= 1;
    }
    if (!consumed || depth !== 0) throw this.error("EXPECTED_TOKEN", this.current()?.start ?? this.tokens.at(-1)?.end ?? 0);
  }
  private atBoundary(): boolean {
    const token = this.current();
    return token === undefined || token.value === "," || token.value === ")";
  }
  private error(code: ParseErrorCode, offsetUtf16: number): TinySqlParseError { return new TinySqlParseError(code, offsetUtf16); }
}

function structuralDeclarations(sourceText: string): readonly Declaration[] {
  const lexed = lexTinyPostgresStructuralV2(sourceText);
  if (!lexed.ok) return [];
  const declarations: Declaration[] = [];
  for (const statement of lexed.statements) {
    const values = statement.tokens.map((token) => token.value);
    if (values[0] === "copy" && values.some((value, index) => value === "from" && values[index + 1] === "stdin")) continue;
    try { declarations.push(new TinyStatementParser(statement.tokens).parse()); }
    catch (error) { if (!(error instanceof TinySqlParseError)) throw error; }
  }
  return declarations;
}

/** Emits only complete, source-proven PostgreSQL schema/table occurrences and file containment. */
export function extractSqlFileFacts(input: SqlExtractFileFactsInput): ArtifactFacts {
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileNode: SymbolNode = {
    id: createSymbolId({ filePath: input.filePath, qualifiedName: input.filePath, kind: "file", declarationOrdinal: 0 }),
    name: fileName, qualifiedName: input.filePath, kind: "file", filePath: input.filePath,
    range: fileRangeFor(input.sourceText), isExported: true, declarationOrdinal: 0
  };
  const declarations = structuralDeclarations(input.sourceText);
  if (declarations.length === 0) {
    return { symbols: [fileNode], edges: [], pendingReferences: [], localBindings: [], referenceScopes: [], importBindings: [], exportBindings: [], reExportBindings: [] };
  }
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  for (const declaration of declarations) {
    const qualifiedName = `${input.filePath}#sql-structural-v2:${declaration.kind}:${declaration.qualified ? "qualified" : "unqualified"}:${declaration.name}`;
    const identity = `${qualifiedName}\u0000resource`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.declarationStart, declaration.declarationEnd);
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "resource", declarationOrdinal }),
      name: declaration.name, qualifiedName, kind: "resource", filePath: input.filePath, range, isExported: true, declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({ sourceId: fileNode.id, targetId: symbol.id, kind: "contains", line: range.start.line, column: range.start.column, referenceName: symbol.name }),
      sourceId: fileNode.id, targetId: symbol.id, kind: "contains", filePath: input.filePath, range,
      resolution: "exact", confidence: 1, referenceName: symbol.name,
      evidence: { ruleId: `language.sql.structural-v2.create-${declaration.kind}`, stage: "syntax", candidateSymbolIds: [symbol.id] }
    });
  }
  return { symbols, edges, pendingReferences: [], localBindings: [], referenceScopes: [], importBindings: [], exportBindings: [], reExportBindings: [] };
}

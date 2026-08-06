import { createHash } from "node:crypto";

export const MCP_SOURCE_POINTER_POLICY = "mcp-source-pointer-v1" as const;
export const MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS = 5 as const;
export const MCP_SOURCE_POINTER_MAXIMUM_CANDIDATE_SYMBOLS = 256 as const;

export interface McpSourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface McpSourceRange {
  readonly start: McpSourcePosition;
  readonly end: McpSourcePosition;
}

export interface McpSourcePointerSymbol {
  readonly reference: string;
  readonly name: string;
  readonly kind: string;
  readonly range: McpSourceRange;
}

export interface McpSourcePointer {
  readonly policy: typeof MCP_SOURCE_POINTER_POLICY;
  readonly sourceId: string;
  readonly filePath: string;
  readonly range: McpSourceRange;
  readonly lineSpan: { readonly start: number; readonly end: number };
  readonly fullFileCharacterOffsets: { readonly start: number; readonly end: number };
  readonly symbols: readonly McpSourcePointerSymbol[];
  readonly symbolsTruncated: boolean;
  readonly display: string;
  readonly pointerSha256: string;
}

export interface McpSourcePointerContext {
  readonly filePath: string;
  readonly text: string;
  readonly start: McpSourcePosition;
  readonly symbols: readonly McpSourcePointerSymbol[];
  readonly symbolsTruncated: boolean;
}

export interface McpSourcePointerContextInput {
  readonly filePath: string;
  readonly text: string;
  readonly start: McpSourcePosition;
  readonly expectedEnd: McpSourcePosition;
  readonly allowTruncatedEnd?: boolean;
  readonly symbols?: readonly McpSourcePointerSymbol[];
  readonly symbolsTruncated?: boolean;
}

export interface McpSourcePointerProjectionInput {
  readonly context: McpSourcePointerContext;
  readonly sourceId: string;
  readonly deliveredCharacterOffsets: { readonly start: number; readonly end: number };
  readonly fullFileCharacterOffsets: { readonly start: number; readonly end: number };
}

function validPosition(value: McpSourcePosition): boolean {
  return Number.isSafeInteger(value.line) && value.line > 0 &&
    Number.isSafeInteger(value.column) && value.column > 0;
}

function comparePosition(left: McpSourcePosition, right: McpSourcePosition): number {
  return left.line - right.line || left.column - right.column;
}

function validRange(value: McpSourceRange): boolean {
  return validPosition(value.start) && validPosition(value.end) &&
    comparePosition(value.start, value.end) <= 0;
}

function positionAtOffset(
  text: string,
  start: McpSourcePosition,
  offset: number
): McpSourcePosition | null {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length || !validPosition(start)) {
    return null;
  }
  let line = start.line;
  let column = start.column;
  let cursor = 0;
  while (cursor < offset) {
    const character = text[cursor]!;
    if (character === "\r" && text[cursor + 1] === "\n") {
      if (cursor + 2 > offset) return null;
      line += 1;
      column = 1;
      cursor += 2;
      continue;
    }
    if (character === "\r" || character === "\n" || character === "\u2028" || character === "\u2029") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    cursor += 1;
  }
  return { line, column };
}

function symbolsOverlapRange(symbol: McpSourcePointerSymbol, range: McpSourceRange): boolean {
  return comparePosition(symbol.range.end, range.start) > 0 &&
    comparePosition(symbol.range.start, range.end) < 0;
}

function compareSymbols(left: McpSourcePointerSymbol, right: McpSourcePointerSymbol): number {
  return comparePosition(left.range.start, right.range.start) ||
    comparePosition(left.range.end, right.range.end) ||
    left.reference.localeCompare(right.reference);
}

function endsWithLineEnding(value: string): boolean {
  return /(?:\r\n|\r|\n|\u2028|\u2029)$/u.test(value);
}

function pointerDigest(value: Omit<McpSourcePointer, "display" | "pointerSha256">): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/** Validates one response-local line origin without affecting source equality. */
export function mcpSourcePointerContext(
  input: McpSourcePointerContextInput
): McpSourcePointerContext | null {
  if (input.filePath.length === 0 || !validPosition(input.start) || !validPosition(input.expectedEnd)) {
    return null;
  }
  const calculatedEnd = positionAtOffset(input.text, input.start, input.text.length);
  if (
    calculatedEnd === null ||
    (input.allowTruncatedEnd === true
      ? comparePosition(calculatedEnd, input.expectedEnd) > 0
      : comparePosition(calculatedEnd, input.expectedEnd) !== 0)
  ) {
    return null;
  }
  const symbols: McpSourcePointerSymbol[] = [];
  const seen = new Set<string>();
  let symbolsTruncated = input.symbolsTruncated === true;
  for (const symbol of input.symbols ?? []) {
    if (
      symbol.reference.length === 0 || symbol.name.length === 0 || symbol.kind.length === 0 ||
      !validRange(symbol.range)
    ) {
      symbolsTruncated = true;
      continue;
    }
    if (seen.has(symbol.reference)) continue;
    seen.add(symbol.reference);
    symbols.push(symbol);
  }
  symbols.sort(compareSymbols);
  return {
    filePath: input.filePath,
    text: input.text,
    start: { line: input.start.line, column: input.start.column },
    symbols,
    symbolsTruncated
  };
}

/** Projects one verified raw offset interval into a bounded human-readable pointer. */
export function projectMcpSourcePointer(
  input: McpSourcePointerProjectionInput
): McpSourcePointer | null {
  const delivered = input.deliveredCharacterOffsets;
  const source = input.fullFileCharacterOffsets;
  if (
    !/^source:[0-9a-f]{64}$/u.test(input.sourceId) ||
    !Number.isSafeInteger(delivered.start) || !Number.isSafeInteger(delivered.end) ||
    delivered.start < 0 || delivered.end <= delivered.start || delivered.end > input.context.text.length ||
    !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end) ||
    source.start < 0 || source.end <= source.start
  ) {
    return null;
  }
  const start = positionAtOffset(input.context.text, input.context.start, delivered.start);
  const end = positionAtOffset(input.context.text, input.context.start, delivered.end);
  if (start === null || end === null || comparePosition(start, end) > 0) return null;
  const range = { start, end };
  const allSymbols = input.context.symbols.filter((symbol) => symbolsOverlapRange(symbol, range));
  const symbols = allSymbols.slice(0, MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS);
  const symbolsTruncated = input.context.symbolsTruncated || allSymbols.length > symbols.length;
  const slice = input.context.text.slice(delivered.start, delivered.end);
  const lineSpanEnd = endsWithLineEnding(slice) && end.column === 1 && end.line > start.line
    ? end.line - 1
    : end.line;
  const lineSpan = { start: start.line, end: Math.max(start.line, lineSpanEnd) };
  const location = lineSpan.start === lineSpan.end
    ? `L${lineSpan.start}`
    : `L${lineSpan.start}-L${lineSpan.end}`;
  const symbolNames = symbols.map((symbol) => symbol.name);
  const display = `${input.context.filePath}:${location}${symbolNames.length > 0 ? ` (${symbolNames.join(", ")}${symbolsTruncated ? ", +more" : ""})` : ""}`;
  const base = {
    policy: MCP_SOURCE_POINTER_POLICY,
    sourceId: input.sourceId,
    filePath: input.context.filePath,
    range,
    lineSpan,
    fullFileCharacterOffsets: { start: source.start, end: source.end },
    symbols,
    symbolsTruncated
  } as const;
  return {
    ...base,
    display,
    pointerSha256: pointerDigest(base)
  };
}

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type CobolCicsTransactionOwnerFact,
  type GraphEdge,
  type PendingReference,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface CobolExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "cobol";
}

interface CobolLine {
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
  readonly text: string;
}

interface CobolParagraph {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface CobolProgram {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly procedureStart: number;
  readonly procedureEnd: number;
  readonly paragraphs: readonly CobolParagraph[];
}

interface SanitizedCobolSource {
  readonly valid: boolean;
  readonly text: string;
}

interface CobolCicsTransactionOwner {
  readonly transactionId: string;
  readonly start: number;
  readonly end: number;
}

interface CobolCicsTransactionHop {
  readonly transactionId: string;
  readonly start: number;
  readonly end: number;
}

const COBOL_IDENTIFIER = "[A-Za-z][A-Za-z0-9-]*";
const COBOL_IDENTIFICATION_DIVISION = /^\s*IDENTIFICATION\s+DIVISION\.\s*$/iu;
const COBOL_PROGRAM_ID = new RegExp(
  "^\\s*PROGRAM-ID\\.\\s*(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$",
  "iu"
);
const COBOL_PROGRAM_ID_ONLY = /^\s*PROGRAM-ID\.\s*$/iu;
const COBOL_PROCEDURE_DIVISION = /^\s*PROCEDURE\s+DIVISION\.\s*$/iu;
const COBOL_END_PROGRAM = new RegExp(
  "^\\s*END\\s+PROGRAM\\s+(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$",
  "iu"
);
const COBOL_PARAGRAPH = new RegExp("^\\s*(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$", "iu");
const COBOL_SECTION = new RegExp(
  "^\\s*(" + COBOL_IDENTIFIER + ")\\s+SECTION\\s*\\.\\s*$",
  "iu"
);
const COBOL_END_DECLARATIVES = /^\s*END\s+DECLARATIVES\s*\.\s*$/iu;
const COBOL_DIRECT_PARAGRAPH_PERFORM = new RegExp(
  "^\\s*PERFORM\\s+(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$",
  "iu"
);
const COBOL_INLINE_PARAGRAPH_PERFORM = new RegExp(
  "\\bPERFORM\\s+(" + COBOL_IDENTIFIER + ")\\s*\\.",
  "iu"
);
const COBOL_AMBIGUOUS_PROCEDURE_CONTROL = /^\s*(?:ALTER|GO\s+TO|COPY|REPLACE)\b/iu;
const COBOL_CICS_COMMAND_START = /^\s*EXEC\s+CICS\s+(?:RETURN|START)\b/iu;
const COBOL_CICS_TRANSACTION_OWNER = new RegExp(
  "^\\s*\\d{1,2}\\s+(" +
    COBOL_IDENTIFIER +
    ")\\b[^.]*\\bVALUE\\s+(['\"])([A-Za-z0-9$#@]{1,4})\\2\\s*\\.\\s*$",
  "iu"
);
const CICS_TRANSACTION_REFERENCE_PREFIX = "cics-transid:";

const COBOL_NON_PARAGRAPH_NAMES: ReadonlySet<string> = new Set([
  "ACCEPT",
  "ADD",
  "ALTER",
  "CALL",
  "CANCEL",
  "CLOSE",
  "COMPUTE",
  "CONTINUE",
  "DECLARATIVES",
  "DELETE",
  "DISPLAY",
  "DIVIDE",
  "ELSE",
  "END-DECLARATIVES",
  "EVALUATE",
  "EXIT",
  "GOBACK",
  "GO",
  "IF",
  "INITIALIZE",
  "INSPECT",
  "MERGE",
  "MOVE",
  "MULTIPLY",
  "OPEN",
  "PERFORM",
  "READ",
  "RETURN",
  "REWRITE",
  "SEARCH",
  "SET",
  "SORT",
  "START",
  "STOP",
  "STRING",
  "SUBTRACT",
  "UNSTRING",
  "WRITE"
]);

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

function linesFor(sourceText: string): readonly CobolLine[] {
  const lines: CobolLine[] = [];
  let start = 0;
  while (start < sourceText.length) {
    let contentEnd = start;
    while (contentEnd < sourceText.length) {
      const character = sourceText[contentEnd];
      if (character === "\r" || character === "\n") {
        break;
      }
      contentEnd += 1;
    }
    let end = contentEnd;
    if (sourceText[end] === "\r") {
      end += 1;
      if (sourceText[end] === "\n") {
        end += 1;
      }
    } else if (sourceText[end] === "\n") {
      end += 1;
    }
    lines.push({
      start,
      contentEnd,
      end,
      text: sourceText.slice(start, contentEnd)
    });
    start = end;
  }
  return lines;
}

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== undefined && character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

function blankLine(characters: string[], line: CobolLine): void {
  for (let index = line.start; index < line.contentEnd; index += 1) {
    blankCharacter(characters, index);
  }
}

function isFixedFormatCommentLine(sourceText: string, line: CobolLine): boolean {
  const indicator = sourceText[line.start + 6];
  return indicator === "*" || indicator === "/";
}

function isFixedFormatLiteralContinuation(sourceText: string, offset: number): boolean {
  const lineStart = offset;
  return /^\d{6}-/u.test(sourceText.slice(lineStart, lineStart + 7));
}

function isCobolIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$#@-]/u.test(character);
}

/** Returns the offset immediately after one single-line COBOL quoted literal. */
function afterCobolQuotedLiteral(text: string, start: number): number | null {
  const quote = text[start];
  if (quote !== "'" && quote !== "\"") {
    return null;
  }
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    if (text[cursor] !== quote) {
      continue;
    }
    if (text[cursor + 1] === quote) {
      cursor += 1;
      continue;
    }
    return cursor + 1;
  }
  return null;
}

/** Removes a free-format inline comment while preserving quoted literal offsets. */
function commentFreeCobolLine(line: CobolLine): string {
  let cursor = 0;
  while (cursor < line.text.length) {
    const character = line.text[cursor];
    if (character === "'" || character === "\"") {
      const next = afterCobolQuotedLiteral(line.text, cursor);
      if (next === null) {
        return line.text;
      }
      cursor = next;
      continue;
    }
    if (character === "*" && line.text[cursor + 1] === ">") {
      return line.text.slice(0, cursor);
    }
    cursor += 1;
  }
  return line.text;
}

/** Finds a COBOL keyword outside strings, preserving a fail-closed boundary. */
function cobolKeywordIndexOutsideLiteral(text: string, keyword: string): number | null {
  const normalizedKeyword = keyword.toUpperCase();
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "'" || character === "\"") {
      const next = afterCobolQuotedLiteral(text, cursor);
      if (next === null) {
        return null;
      }
      cursor = next - 1;
      continue;
    }
    if (
      text.slice(cursor, cursor + normalizedKeyword.length).toUpperCase() !== normalizedKeyword ||
      isCobolIdentifierCharacter(text[cursor - 1]) ||
      isCobolIdentifierCharacter(text[cursor + normalizedKeyword.length])
    ) {
      continue;
    }
    return cursor;
  }
  return null;
}

function skipCobolWhitespace(text: string, start: number): number {
  let cursor = start;
  while (/\s/u.test(text[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

/**
 * Returns one literal CICS TRANSID only when the command contains exactly one
 * statically quoted TRANSID option. Dynamic or duplicate options are omitted.
 */
function literalCicsTransactionId(commandText: string): string | null {
  let transactionId: string | null = null;
  let optionCount = 0;
  for (let cursor = 0; cursor < commandText.length; cursor += 1) {
    const character = commandText[cursor];
    if (character === "'" || character === "\"") {
      const next = afterCobolQuotedLiteral(commandText, cursor);
      if (next === null) {
        return null;
      }
      cursor = next - 1;
      continue;
    }
    if (
      commandText.slice(cursor, cursor + "TRANSID".length).toUpperCase() !== "TRANSID" ||
      isCobolIdentifierCharacter(commandText[cursor - 1]) ||
      isCobolIdentifierCharacter(commandText[cursor + "TRANSID".length])
    ) {
      continue;
    }
    optionCount += 1;
    let valueStart = skipCobolWhitespace(commandText, cursor + "TRANSID".length);
    if (commandText[valueStart] !== "(") {
      return null;
    }
    valueStart = skipCobolWhitespace(commandText, valueStart + 1);
    const quote = commandText[valueStart];
    const valueEnd = afterCobolQuotedLiteral(commandText, valueStart);
    if ((quote !== "'" && quote !== "\"") || valueEnd === null) {
      return null;
    }
    const value = commandText.slice(valueStart + 1, valueEnd - 1);
    const closingParenthesis = skipCobolWhitespace(commandText, valueEnd);
    if (commandText[closingParenthesis] !== ")" || !/^[A-Za-z0-9$#@]{1,4}$/u.test(value)) {
      return null;
    }
    transactionId = value.toUpperCase();
    cursor = closingParenthesis;
  }
  return optionCount === 1 ? transactionId : null;
}

/**
 * Blanks supported COBOL comments and literals without changing offsets.
 * This is intentionally not a COBOL grammar: it creates a fail-closed lexical
 * boundary for direct program and paragraph declarations only.
 */
function sanitizeCobol(sourceText: string): SanitizedCobolSource {
  const characters = sourceText.split("");
  for (const line of linesFor(sourceText)) {
    if (isFixedFormatCommentLine(sourceText, line)) {
      blankLine(characters, line);
    }
  }

  let quote: "'" | "\"" | null = null;
  let continuationDelimiterIndex: number | null = null;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }
    if (quote !== null && continuationDelimiterIndex === index) {
      blankCharacter(characters, index);
      continuationDelimiterIndex = null;
      continue;
    }
    if (quote !== null) {
      if (character === "\r" || character === "\n") {
        const nextLineStart: number = character === "\r" && next === "\n" ? index + 2 : index + 1;
        if (isFixedFormatLiteralContinuation(sourceText, nextLineStart)) {
          let delimiter: number = nextLineStart + 7;
          while (sourceText[delimiter] === " " || sourceText[delimiter] === "\t") delimiter += 1;
          if (sourceText[delimiter] === quote) continuationDelimiterIndex = delimiter;
          if (character === "\r" && next === "\n") index += 1;
          continue;
        }
        return { valid: false, text: characters.join("") };
      }
      blankCharacter(characters, index);
      if (character === quote) {
        if (next === quote) {
          blankCharacter(characters, index + 1);
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      blankCharacter(characters, index);
      continue;
    }
    if (character === "*" && next === ">") {
      while (index < characters.length) {
        const commentCharacter = characters[index];
        if (commentCharacter === "\r" || commentCharacter === "\n") {
          break;
        }
        blankCharacter(characters, index);
        index += 1;
      }
      index -= 1;
    }
  }
  return { valid: quote === null, text: characters.join("") };
}

function isCobolFixedFormatLine(line: CobolLine): boolean {
  return /^\d{6}[ \t]/u.test(line.text);
}

function codeFor(line: CobolLine): string {
  const body = isCobolFixedFormatLine(line) ? line.text.slice(6, 72) : line.text;
  return body.trim();
}

function firstCodeColumn(line: CobolLine): number | null {
  const firstCodeOffset = isCobolFixedFormatLine(line) ? 6 : 0;
  for (let index = firstCodeOffset; index < line.text.length; index += 1) {
    const character = line.text[index];
    if (character !== " " && character !== "\t") {
      return index;
    }
  }
  return null;
}

function isDirectParagraphLine(line: CobolLine): boolean {
  const firstColumn = firstCodeColumn(line);
  return firstColumn === 0 || (firstColumn !== null && firstColumn >= 7 && firstColumn <= 10);
}

function isCobolParagraphName(name: string): boolean {
  const normalized = name.toUpperCase();
  return !COBOL_NON_PARAGRAPH_NAMES.has(normalized) && !normalized.startsWith("END-");
}

function isCobolCopybookPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".cpy");
}

function collectDirectCobolParagraphs(
  lines: readonly CobolLine[],
  procedureLineIndex: number,
  procedureEnd: number
): readonly CobolParagraph[] {
  const starts: Array<{ name: string; start: number }> = [];
  const boundaries: number[] = [];
  for (let index = procedureLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.start >= procedureEnd) {
      continue;
    }
    const code = codeFor(line);
    if (COBOL_SECTION.test(code) || COBOL_END_DECLARATIVES.test(code)) {
      boundaries.push(line.start);
      continue;
    }
    if (!isDirectParagraphLine(line)) {
      continue;
    }
    const match = COBOL_PARAGRAPH.exec(code);
    const name = match?.[1];
    if (name !== undefined && isCobolParagraphName(name)) {
      starts.push({ name, start: line.start });
      boundaries.push(line.start);
    }
  }

  return starts.map((paragraph, index) => ({
    name: paragraph.name,
    start: paragraph.start,
    end: boundaries.find((boundary) => boundary > paragraph.start) ?? procedureEnd
  }));
}

interface CobolParagraphPerform {
  readonly sourceName: string;
  readonly targetName: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Retains only complete single-paragraph PERFORM statements whose source and
 * target are uniquely declared within this one program. COPY/REPLACE, ALTER,
 * and GO TO introduce compiler or runtime control-flow ambiguity, so this
 * deliberately emits no relation from such a Procedure Division.
 */
function directCobolParagraphPerforms(
  lines: readonly CobolLine[],
  program: CobolProgram
): readonly CobolParagraphPerform[] {
  const procedureLines = lines.filter(
    (line) => line.start >= program.procedureStart && line.start < program.procedureEnd
  );
  if (procedureLines.some((line) => COBOL_AMBIGUOUS_PROCEDURE_CONTROL.test(codeFor(line)))) {
    return [];
  }

  const paragraphNames = new Map<string, number>();
  for (const paragraph of program.paragraphs) {
    const normalized = paragraph.name.toUpperCase();
    paragraphNames.set(normalized, (paragraphNames.get(normalized) ?? 0) + 1);
  }
  if ([...paragraphNames.values()].some((count) => count !== 1)) {
    return [];
  }

  const sectionNames = new Set<string>();
  for (const line of procedureLines) {
    const sectionName = COBOL_SECTION.exec(codeFor(line))?.[1];
    if (sectionName !== undefined) {
      sectionNames.add(sectionName.toUpperCase());
    }
  }

  const performs: CobolParagraphPerform[] = [];
  for (const line of procedureLines) {
    const code = codeFor(line);
    const directTarget = COBOL_DIRECT_PARAGRAPH_PERFORM.exec(code)?.[1];
    const targetName = directTarget ?? COBOL_INLINE_PARAGRAPH_PERFORM.exec(code)?.[1];
    if (targetName === undefined) {
      continue;
    }
    const targetKey = targetName.toUpperCase();
    if (paragraphNames.get(targetKey) !== 1 || sectionNames.has(targetKey)) {
      continue;
    }
    const source = program.paragraphs.find(
      (paragraph) => line.start >= paragraph.start && line.start < paragraph.end
    );
    if (source !== undefined) {
      performs.push({
        sourceName: source.name,
        targetName,
        start: line.start,
        end: line.contentEnd
      });
    }
  }
  return performs;
}

function directCobolProgram(
  lines: readonly CobolLine[],
  sourceLength: number
): CobolProgram | null {
  const identificationLineIndexes = lines
    .map((line, index) => (COBOL_IDENTIFICATION_DIVISION.test(codeFor(line)) ? index : null))
    .filter((index): index is number => index !== null);
  const programDeclarations: Array<{ index: number; name: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const code = codeFor(line);
    const direct = COBOL_PROGRAM_ID.exec(code)?.[1];
    if (direct !== undefined) {
      programDeclarations.push({ index, name: direct });
      continue;
    }
    if (!COBOL_PROGRAM_ID_ONLY.test(code) || !isCobolFixedFormatLine(line)) {
      continue;
    }
    const continuation = lines[index + 1];
    const name = continuation === undefined
      ? undefined
      : isCobolFixedFormatLine(continuation)
        ? /^\s*([A-Za-z][A-Za-z0-9-]*)\s*\.\s*$/u.exec(codeFor(continuation))?.[1]
        : undefined;
    if (name !== undefined) {
      programDeclarations.push({ index, name });
    }
  }
  const procedureLineIndexes = lines
    .map((line, index) => (COBOL_PROCEDURE_DIVISION.test(codeFor(line)) ? index : null))
    .filter((index): index is number => index !== null);

  if (
    identificationLineIndexes.length !== 1 ||
    programDeclarations.length !== 1 ||
    procedureLineIndexes.length !== 1
  ) {
    return null;
  }

  const identificationLineIndex = identificationLineIndexes[0];
  const declaration = programDeclarations[0];
  const procedureLineIndex = procedureLineIndexes[0];
  if (
    identificationLineIndex === undefined ||
    declaration === undefined ||
    procedureLineIndex === undefined ||
    !(identificationLineIndex < declaration.index && declaration.index < procedureLineIndex)
  ) {
    return null;
  }

  const endPrograms = lines
    .map((line, index) => {
      const match = COBOL_END_PROGRAM.exec(codeFor(line));
      const name = match?.[1];
      return name === undefined ? null : { index, name };
    })
    .filter((endProgram): endProgram is { index: number; name: string } => endProgram !== null);
  if (
    endPrograms.length > 1 ||
    endPrograms.some((endProgram) => endProgram.name.toUpperCase() !== declaration.name.toUpperCase())
  ) {
    return null;
  }

  const endProgram = endPrograms[0];
  if (endProgram !== undefined && endProgram.index <= procedureLineIndex) {
    return null;
  }
  const identificationLine = lines[identificationLineIndex];
  const procedureLine = lines[procedureLineIndex];
  const endLine = endProgram === undefined ? undefined : lines[endProgram.index];
  if (identificationLine === undefined || procedureLine === undefined) {
    return null;
  }
  const procedureEnd = endLine?.start ?? sourceLength;
  const end = endLine?.end ?? sourceLength;
  return {
    name: declaration.name,
    start: identificationLine.start,
    end,
    procedureStart: procedureLine.end,
    procedureEnd,
    paragraphs: collectDirectCobolParagraphs(lines, procedureLineIndex, procedureEnd)
  };
}

/**
 * Retains only direct level-number data declarations before Procedure Division.
 * The CICS resource definition lives outside the repository, so a TRAN-named
 * literal is stored as evidence for bounded later project resolution only.
 */
function directCobolCicsTransactionOwners(
  sourceText: string,
  lines: readonly CobolLine[],
  program: CobolProgram
): readonly CobolCicsTransactionOwner[] {
  const owners = new Map<string, CobolCicsTransactionOwner>();
  for (const line of lines) {
    if (
      line.start < program.start ||
      line.start >= program.procedureStart ||
      isFixedFormatCommentLine(sourceText, line)
    ) {
      continue;
    }
    const match = COBOL_CICS_TRANSACTION_OWNER.exec(commentFreeCobolLine(line));
    const name = match?.[1];
    const transactionId = match?.[3];
    if (name === undefined || transactionId === undefined || !name.toUpperCase().includes("TRAN")) {
      continue;
    }
    const normalizedTransactionId = transactionId.toUpperCase();
    if (!owners.has(normalizedTransactionId)) {
      owners.set(normalizedTransactionId, {
        transactionId: normalizedTransactionId,
        start: line.start,
        end: line.contentEnd
      });
    }
  }
  return [...owners.values()];
}

/**
 * Retains direct CICS RETURN/START commands only when their complete command
 * body contains one literal TRANSID option and terminates with END-EXEC.
 */
function directCobolCicsTransactionHops(
  sourceText: string,
  lines: readonly CobolLine[],
  program: CobolProgram
): readonly CobolCicsTransactionHop[] {
  const hops: CobolCicsTransactionHop[] = [];
  let command: { readonly start: number; text: string } | null = null;

  for (const line of lines) {
    if (
      line.start < program.procedureStart ||
      line.start >= program.procedureEnd ||
      isFixedFormatCommentLine(sourceText, line)
    ) {
      continue;
    }
    const code = commentFreeCobolLine(line);
    const commandStart = COBOL_CICS_COMMAND_START.exec(code);
    if (command === null || commandStart !== null) {
      if (commandStart === null) {
        continue;
      }
      command = {
        start: line.start + (commandStart.index ?? 0),
        text: ""
      };
    }

    const endExecIndex = cobolKeywordIndexOutsideLiteral(code, "END-EXEC");
    const fragment = endExecIndex === null ? code : code.slice(0, endExecIndex + "END-EXEC".length);
    command = { ...command, text: command.text + "\n" + fragment };
    if (endExecIndex === null) {
      continue;
    }

    const transactionId = literalCicsTransactionId(command.text);
    if (transactionId !== null) {
      hops.push({
        transactionId,
        start: command.start,
        end: line.start + endExecIndex + "END-EXEC".length
      });
    }
    command = null;
  }

  return hops;
}

/**
 * Extracts one source-proven COBOL program, direct Procedure Division
 * paragraphs, and a bounded CICS transaction handoff surface. General data
 * definitions, calls, copy expansion, nested programs, compiler formats, and
 * runtime semantics deliberately remain outside this language slice.
 */
export function extractCobolFileFacts(input: CobolExtractFileFactsInput): ArtifactFacts {
  const cicsCapability = frameworkCapability("cics");
  if (!cicsCapability.languages.includes(input.language)) {
    throw new Error("CICS framework extraction was invoked for an unsupported source language.");
  }

  const lineStarts = lineStartsFor(input.sourceText);
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileRange = rangeFor(lineStarts, 0, input.sourceText.length);
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
    range: fileRange,
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const cicsTransactionOwners: CobolCicsTransactionOwnerFact[] = [];
  const declarationOrdinals = new Map<string, number>();

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addSymbol(symbolInput: {
    readonly name: string;
    readonly kind: "module" | "function";
    readonly qualifiedName: string;
    readonly start: number;
    readonly end: number;
    readonly isExported: boolean;
    readonly parent: SymbolNode;
    readonly ruleId: string;
  }): SymbolNode {
    const declarationOrdinal = nextOrdinal(symbolInput.qualifiedName, symbolInput.kind);
    const range = rangeFor(lineStarts, symbolInput.start, symbolInput.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: symbolInput.qualifiedName,
        kind: symbolInput.kind,
        declarationOrdinal
      }),
      name: symbolInput.name,
      qualifiedName: symbolInput.qualifiedName,
      kind: symbolInput.kind,
      filePath: input.filePath,
      range,
      isExported: symbolInput.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: symbolInput.parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: symbolInput.parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: symbolInput.ruleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  const sanitized = sanitizeCobol(input.sourceText);
  if (!sanitized.valid || isCobolCopybookPath(input.filePath)) {
    return {
      symbols,
      edges,
      pendingReferences,
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings: [],
      reExportBindings: []
    };
  }

  const program = directCobolProgram(linesFor(sanitized.text), input.sourceText.length);
  if (program !== null) {
    const sourceLines = linesFor(input.sourceText);
    const programSymbol = addSymbol({
      name: program.name,
      kind: "module",
      qualifiedName: input.filePath + "#program:" + program.name,
      start: program.start,
      end: program.end,
      isExported: true,
      parent: fileNode,
      ruleId: "language.cobol.program.identification-program-id-procedure"
    });
    const paragraphSymbols = program.paragraphs.map((paragraph) => ({
      paragraph,
      symbol: addSymbol({
        name: paragraph.name,
        kind: "function",
        qualifiedName: programSymbol.qualifiedName + "#paragraph:" + paragraph.name,
        start: paragraph.start,
        end: paragraph.end,
        isExported: false,
        parent: programSymbol,
        ruleId: "language.cobol.paragraph.direct-procedure-division"
      })
    }));

    for (const owner of directCobolCicsTransactionOwners(input.sourceText, sourceLines, program)) {
      cicsTransactionOwners.push({
        transactionId: owner.transactionId,
        programId: programSymbol.id,
        range: rangeFor(lineStarts, owner.start, owner.end)
      });
    }

    for (const hop of directCobolCicsTransactionHops(input.sourceText, sourceLines, program)) {
      const source =
        paragraphSymbols.find(
          ({ paragraph }) => hop.start >= paragraph.start && hop.start < paragraph.end
        )?.symbol ?? programSymbol;
      const range = rangeFor(lineStarts, hop.start, hop.end);
      const referenceName = CICS_TRANSACTION_REFERENCE_PREFIX + hop.transactionId;
      pendingReferences.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: null,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName
        }),
        sourceId: source.id,
        filePath: input.filePath,
        referenceName,
        relationKind: "calls",
        range
      });
    }

    for (const perform of directCobolParagraphPerforms(linesFor(sanitized.text), program)) {
      const source = paragraphSymbols.find(
        ({ symbol }) => symbol.name.toUpperCase() === perform.sourceName.toUpperCase()
      )?.symbol;
      const target = paragraphSymbols.find(
        ({ symbol }) => symbol.name.toUpperCase() === perform.targetName.toUpperCase()
      )?.symbol;
      if (source === undefined || target === undefined) {
        continue;
      }
      const range = rangeFor(lineStarts, perform.start, perform.end);
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName: target.name
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: target.name,
        evidence: {
          ruleId: "syntax.cobol.same-program.unique-paragraph-perform",
          stage: "syntax",
          candidateSymbolIds: [target.id]
        }
      });
    }
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    ...(cicsTransactionOwners.length === 0
      ? {}
      : { cobolCicsFacts: { transactionOwners: cicsTransactionOwners } })
  };
}

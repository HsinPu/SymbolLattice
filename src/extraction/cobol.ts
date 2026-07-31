import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

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
  readonly paragraphs: readonly CobolParagraph[];
}

interface SanitizedCobolSource {
  readonly valid: boolean;
  readonly text: string;
}

const COBOL_IDENTIFIER = "[A-Za-z][A-Za-z0-9-]*";
const COBOL_IDENTIFICATION_DIVISION = /^\s*IDENTIFICATION\s+DIVISION\.\s*$/iu;
const COBOL_PROGRAM_ID = new RegExp(
  "^\\s*PROGRAM-ID\\.\\s*(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$",
  "iu"
);
const COBOL_PROCEDURE_DIVISION = /^\s*PROCEDURE\s+DIVISION\.\s*$/iu;
const COBOL_END_PROGRAM = new RegExp(
  "^\\s*END\\s+PROGRAM\\s+(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$",
  "iu"
);
const COBOL_PARAGRAPH = new RegExp("^\\s*(" + COBOL_IDENTIFIER + ")\\s*\\.\\s*$", "iu");

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
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }
    if (quote !== null) {
      if (character === "\r" || character === "\n") {
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

function codeFor(line: CobolLine): string {
  return line.text.trim();
}

function firstCodeColumn(line: CobolLine): number | null {
  for (let index = 0; index < line.text.length; index += 1) {
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
  for (let index = procedureLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.start >= procedureEnd || !isDirectParagraphLine(line)) {
      continue;
    }
    const match = COBOL_PARAGRAPH.exec(codeFor(line));
    const name = match?.[1];
    if (name === undefined || !isCobolParagraphName(name)) {
      continue;
    }
    starts.push({ name, start: line.start });
  }

  return starts.map((paragraph, index) => ({
    name: paragraph.name,
    start: paragraph.start,
    end: starts[index + 1]?.start ?? procedureEnd
  }));
}

function directCobolProgram(
  lines: readonly CobolLine[],
  sourceLength: number
): CobolProgram | null {
  const identificationLineIndexes = lines
    .map((line, index) => (COBOL_IDENTIFICATION_DIVISION.test(codeFor(line)) ? index : null))
    .filter((index): index is number => index !== null);
  const programDeclarations = lines
    .map((line, index) => {
      const match = COBOL_PROGRAM_ID.exec(codeFor(line));
      const name = match?.[1];
      return name === undefined ? null : { index, name };
    })
    .filter((declaration): declaration is { index: number; name: string } => declaration !== null);
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
  const endLine = endProgram === undefined ? undefined : lines[endProgram.index];
  if (identificationLine === undefined) {
    return null;
  }
  const procedureEnd = endLine?.start ?? sourceLength;
  const end = endLine?.end ?? sourceLength;
  return {
    name: declaration.name,
    start: identificationLine.start,
    end,
    paragraphs: collectDirectCobolParagraphs(lines, procedureLineIndex, procedureEnd)
  };
}

/**
 * Extracts one source-proven COBOL program and its direct Procedure Division
 * paragraph declarations. Data definitions, calls, copy expansion, nested
 * programs, compiler formats, and runtime semantics deliberately remain out of
 * scope for this first language slice.
 */
export function extractCobolFileFacts(input: CobolExtractFileFactsInput): ArtifactFacts {
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
      pendingReferences: [],
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings: [],
      reExportBindings: []
    };
  }

  const program = directCobolProgram(linesFor(sanitized.text), input.sourceText.length);
  if (program !== null) {
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
    for (const paragraph of program.paragraphs) {
      addSymbol({
        name: paragraph.name,
        kind: "function",
        qualifiedName: programSymbol.qualifiedName + "#paragraph:" + paragraph.name,
        start: paragraph.start,
        end: paragraph.end,
        isExported: false,
        parent: programSymbol,
        ruleId: "language.cobol.paragraph.direct-procedure-division"
      });
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

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface AdaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "ada";
}

type AdaUnitKind = "package" | "package-body" | "procedure" | "function";

interface AdaLine {
  readonly code: string;
  readonly codeStart: number;
  readonly codeEnd: number;
}

interface AdaHeader {
  readonly kind: AdaUnitKind;
  readonly name: string;
  readonly requiresNamedEnd: boolean;
}

interface AdaUnit {
  readonly kind: AdaUnitKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const ADA_NAME = "[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)*";
const PACKAGE_BODY_START = new RegExp(
  "^(?:private\\s+)?package\\s+body\\s+(" + ADA_NAME + ")\\s+is\\s*$",
  "iu"
);
const PACKAGE_START = new RegExp(
  "^(?:private\\s+)?package\\s+(" + ADA_NAME + ")\\s+is\\s*$",
  "iu"
);
const PROCEDURE_BODY_START = new RegExp(
  "^procedure\\s+(" + ADA_NAME + ")(?:\\s*\\([^()]*\\))?\\s+is\\s*$",
  "iu"
);
const PROCEDURE_DECLARATION = new RegExp(
  "^procedure\\s+(" + ADA_NAME + ")(?:\\s*\\([^()]*\\))?\\s*;\\s*$",
  "iu"
);
const FUNCTION_BODY_START = new RegExp(
  "^function\\s+(" +
    ADA_NAME +
    ")(?:\\s*\\([^()]*\\))?\\s+return\\s+" +
    ADA_NAME +
    "\\s+is\\s*$",
  "iu"
);
const FUNCTION_DECLARATION = new RegExp(
  "^function\\s+(" +
    ADA_NAME +
    ")(?:\\s*\\([^()]*\\))?\\s+return\\s+" +
    ADA_NAME +
    "\\s*;\\s*$",
  "iu"
);

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
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

function rangeForSpan(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

/**
 * Ada strings use doubled double quotes to escape a quote. An unterminated
 * string makes lexical comment stripping unsafe, so extraction fails closed.
 */
function stripAdaInlineComment(sourceText: string): string | null {
  let inString = false;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (inString) {
      if (character !== '"') {
        continue;
      }
      if (sourceText[index + 1] === '"') {
        index += 1;
        continue;
      }
      inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "-" && sourceText[index + 1] === "-") {
      return sourceText.slice(0, index);
    }
  }
  return inString ? null : sourceText;
}

function normalizedAdaLine(rawLine: string, lineStart: number): AdaLine | null {
  const commentFree = stripAdaInlineComment(rawLine);
  if (commentFree === null) {
    return null;
  }
  const firstContent = commentFree.search(/\S/u);
  if (firstContent < 0) {
    const emptyOffset = lineStart + commentFree.length;
    return { code: "", codeStart: emptyOffset, codeEnd: emptyOffset };
  }
  const trailingContent = commentFree.replace(/[ \t]*$/u, "").length;
  return {
    code: commentFree.slice(firstContent, trailingContent),
    codeStart: lineStart + firstContent,
    codeEnd: lineStart + trailingContent
  };
}

function adaLines(sourceText: string): readonly AdaLine[] | null {
  const lines: AdaLine[] = [];
  let lineStart = 0;
  while (lineStart < sourceText.length) {
    const newline = sourceText.indexOf("\n", lineStart);
    const lineLimit = newline < 0 ? sourceText.length : newline;
    const lineEnd =
      lineLimit > lineStart && sourceText[lineLimit - 1] === "\r" ? lineLimit - 1 : lineLimit;
    const normalized = normalizedAdaLine(sourceText.slice(lineStart, lineEnd), lineStart);
    if (normalized === null) {
      return null;
    }
    lines.push(normalized);
    if (newline < 0) {
      break;
    }
    lineStart = newline + 1;
  }
  return lines;
}

function directAdaHeader(line: AdaLine): AdaHeader | null {
  const packageBody = PACKAGE_BODY_START.exec(line.code);
  if (packageBody !== null) {
    return { kind: "package-body", name: packageBody[1] ?? "", requiresNamedEnd: true };
  }
  const pkg = PACKAGE_START.exec(line.code);
  if (pkg !== null) {
    return { kind: "package", name: pkg[1] ?? "", requiresNamedEnd: true };
  }
  const procedureBody = PROCEDURE_BODY_START.exec(line.code);
  if (procedureBody !== null) {
    return { kind: "procedure", name: procedureBody[1] ?? "", requiresNamedEnd: true };
  }
  const fnBody = FUNCTION_BODY_START.exec(line.code);
  if (fnBody !== null) {
    return { kind: "function", name: fnBody[1] ?? "", requiresNamedEnd: true };
  }
  const procedureDeclaration = PROCEDURE_DECLARATION.exec(line.code);
  if (procedureDeclaration !== null) {
    return {
      kind: "procedure",
      name: procedureDeclaration[1] ?? "",
      requiresNamedEnd: false
    };
  }
  const functionDeclaration = FUNCTION_DECLARATION.exec(line.code);
  return functionDeclaration === null
    ? null
    : { kind: "function", name: functionDeclaration[1] ?? "", requiresNamedEnd: false };
}

function namedAdaEnd(line: AdaLine): string | null {
  const ending = new RegExp("^end\\s+(" + ADA_NAME + ")\\s*;\\s*$", "iu").exec(line.code);
  return ending?.[1] ?? null;
}

/**
 * A package or subprogram may contain nested declarations. Only the outer
 * named terminator is selected; nested names are not emitted as direct units.
 */
function matchingAdaBodyEnd(
  lines: readonly AdaLine[],
  start: number,
  expectedName: string
): number | null {
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const declaredName = namedAdaEnd(line);
    if (declaredName !== null && declaredName.toLowerCase() === expectedName.toLowerCase()) {
      return index;
    }
  }
  return null;
}

/**
 * Extracts complete direct Ada library units. Multi-line profiles, aspect
 * clauses, generic instances, nested members, and ambiguous endings are not
 * promoted to guessed declarations.
 */
function staticAdaUnits(input: AdaExtractFileFactsInput): readonly AdaUnit[] | null {
  const lines = adaLines(input.sourceText);
  if (lines === null) {
    return null;
  }

  const units: AdaUnit[] = [];
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const header = directAdaHeader(line);
    if (header === null) {
      index += 1;
      continue;
    }
    if (!header.requiresNamedEnd) {
      units.push({
        kind: header.kind,
        name: header.name,
        start: line.codeStart,
        end: line.codeEnd
      });
      index += 1;
      continue;
    }
    const endIndex = matchingAdaBodyEnd(lines, index, header.name);
    if (endIndex === null) {
      return null;
    }
    const endLine = lines[endIndex];
    if (endLine === undefined) {
      return null;
    }
    units.push({
      kind: header.kind,
      name: header.name,
      start: line.codeStart,
      end: endLine.codeEnd
    });
    index = endIndex + 1;
  }
  return units;
}

function symbolKindFor(unit: AdaUnit): "module" | "function" {
  return unit.kind === "package" || unit.kind === "package-body" ? "module" : "function";
}

/**
 * Emits source-ranged direct Ada library units without claiming full Ada
 * parsing, member analysis, specification/body pairing, or runtime behavior.
 */
export function extractAdaFileFacts(input: AdaExtractFileFactsInput): ArtifactFacts {
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "module" | "function";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly containmentRuleId: string;
  }): void {
    const identity = inputSymbol.qualifiedName + "\u0000" + inputSymbol.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: inputSymbol.qualifiedName,
        kind: inputSymbol.kind,
        declarationOrdinal
      }),
      name: inputSymbol.name,
      qualifiedName: inputSymbol.qualifiedName,
      kind: inputSymbol.kind,
      filePath: input.filePath,
      range: inputSymbol.range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: inputSymbol.range.start.line,
        column: inputSymbol.range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: inputSymbol.range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: inputSymbol.containmentRuleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  for (const unit of staticAdaUnits(input) ?? []) {
    addSymbol({
      name: unit.name,
      kind: symbolKindFor(unit),
      qualifiedName: input.filePath + "#" + unit.kind + ":" + unit.name,
      range: rangeForSpan(lineStarts, unit.start, unit.end),
      containmentRuleId: "language.ada." + unit.kind + ".direct-library-unit"
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

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ObjectiveCExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "objc";
}

interface ObjectiveCLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface StaticObjectiveCImplementation {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly bodyStartLine: number;
  readonly endLine: number;
}

interface StaticObjectiveCMethod {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SanitizedObjectiveCSource {
  readonly valid: boolean;
  readonly text: string;
}

type ObjectiveCLexicalMode =
  | "block-comment"
  | "line-comment"
  | "single-quoted-literal"
  | "double-quoted-literal"
  | null;

const DIRECT_IMPLEMENTATION_HEADER =
  /^[ \t]*@implementation[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/u;
const DIRECT_END_DIRECTIVE = /^[ \t]*@end[ \t]*$/u;

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

function rangeFor(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== undefined && character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

function isNewline(character: string): boolean {
  return character === "\r" || character === "\n";
}

function isHorizontalWhitespace(character: string): boolean {
  return character === " " || character === "\t";
}

/**
 * Blanks C-family comments, quoted literals, and preprocessor directives
 * without changing offsets. This intentionally avoids parsing Objective-C;
 * it only protects the narrow direct-declaration matcher below from text that
 * cannot prove a declaration.
 */
function sanitizeObjectiveC(sourceText: string): SanitizedObjectiveCSource {
  const characters = sourceText.split("");
  let mode: ObjectiveCLexicalMode = null;
  let escaped = false;
  let atLineStart = true;
  let inPreprocessorDirective = false;
  let lastDirectiveNonWhitespace = "";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }

    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        index += 1;
        mode = null;
        continue;
      }
      if (isNewline(character)) {
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "line-comment") {
      if (isNewline(character)) {
        mode = null;
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "single-quoted-literal" || mode === "double-quoted-literal") {
      if (isNewline(character)) {
        return { valid: false, text: sourceText };
      }
      blankCharacter(characters, index);
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (mode === "single-quoted-literal" && character === "'") ||
        (mode === "double-quoted-literal" && character === "\"")
      ) {
        mode = null;
      }
      continue;
    }

    if (inPreprocessorDirective) {
      if (isNewline(character)) {
        inPreprocessorDirective = lastDirectiveNonWhitespace === "\\";
        lastDirectiveNonWhitespace = "";
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
        if (!isHorizontalWhitespace(character)) {
          lastDirectiveNonWhitespace = character;
        }
      }
      continue;
    }

    if (isNewline(character)) {
      atLineStart = true;
      continue;
    }

    if (atLineStart && isHorizontalWhitespace(character)) {
      continue;
    }

    if (atLineStart && character === "#") {
      blankCharacter(characters, index);
      inPreprocessorDirective = true;
      lastDirectiveNonWhitespace = "#";
      atLineStart = false;
      continue;
    }

    atLineStart = false;
    if (character === "/" && next === "*") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "block-comment";
      continue;
    }
    if (character === "/" && next === "/") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "line-comment";
      continue;
    }
    if (character === "'") {
      blankCharacter(characters, index);
      mode = "single-quoted-literal";
      escaped = false;
      continue;
    }
    if (character === "\"") {
      blankCharacter(characters, index);
      mode = "double-quoted-literal";
      escaped = false;
    }
  }

  return {
    valid:
      mode !== "block-comment" &&
      mode !== "single-quoted-literal" &&
      mode !== "double-quoted-literal" &&
      !(inPreprocessorDirective && lastDirectiveNonWhitespace === "\\"),
    text: characters.join("")
  };
}

function linesFor(sourceText: string): readonly ObjectiveCLine[] {
  const lines: ObjectiveCLine[] = [];
  let start = 0;

  while (start <= sourceText.length) {
    const newline = sourceText.indexOf("\n", start);
    const rawEnd = newline === -1 ? sourceText.length : newline;
    const end = rawEnd > start && sourceText.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ start, end, text: sourceText.slice(start, end) });
    if (newline === -1) {
      break;
    }
    start = newline + 1;
  }

  return lines;
}

function firstCodeOffset(line: ObjectiveCLine): number {
  return line.start + (line.text.length - line.text.trimStart().length);
}

function collectDirectImplementations(
  lines: readonly ObjectiveCLine[]
): readonly StaticObjectiveCImplementation[] | null {
  const implementations: StaticObjectiveCImplementation[] = [];
  const names = new Set<string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    const header = DIRECT_IMPLEMENTATION_HEADER.exec(line.text);
    if (header === null) {
      continue;
    }
    const name = header[1];
    if (name === undefined || names.has(name)) {
      return null;
    }

    let endLine = lineIndex + 1;
    for (; endLine < lines.length; endLine += 1) {
      const candidate = lines[endLine];
      if (candidate === undefined) {
        return null;
      }
      if (DIRECT_IMPLEMENTATION_HEADER.test(candidate.text)) {
        return null;
      }
      if (DIRECT_END_DIRECTIVE.test(candidate.text)) {
        break;
      }
    }
    const end = lines[endLine];
    if (end === undefined) {
      return null;
    }

    names.add(name);
    implementations.push({
      name,
      start: firstCodeOffset(line),
      end: end.end,
      bodyStartLine: lineIndex + 1,
      endLine
    });
    lineIndex = endLine;
  }

  return implementations;
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      character === "_")
  );
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || (character !== undefined && character >= "0" && character <= "9");
}

function skipHorizontalWhitespace(sourceText: string, index: number, limit: number): number {
  let cursor = index;
  while (cursor < limit && isHorizontalWhitespace(sourceText.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function identifierAt(
  sourceText: string,
  index: number,
  limit: number
): { readonly name: string; readonly end: number } | null {
  if (!isIdentifierStart(sourceText.charAt(index))) {
    return null;
  }
  let end = index + 1;
  while (end < limit && isIdentifierPart(sourceText.charAt(end))) {
    end += 1;
  }
  return { name: sourceText.slice(index, end), end };
}

function closingParenthesisOnLine(
  sourceText: string,
  opening: number,
  lineEnd: number
): number | null {
  let depth = 0;
  for (let index = opening; index < lineEnd; index += 1) {
    const character = sourceText.charAt(index);
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

function matchingBrace(
  sourceText: string,
  opening: number,
  limit: number
): number | null {
  let depth = 0;
  for (let index = opening; index < limit; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
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

function directMethodOnLine(
  sourceText: string,
  line: ObjectiveCLine,
  implementationEnd: number
): StaticObjectiveCMethod | null {
  let cursor = skipHorizontalWhitespace(sourceText, line.start, line.end);
  const start = cursor;
  const polarity = sourceText.charAt(cursor);
  if (polarity !== "-" && polarity !== "+") {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, cursor + 1, line.end);
  if (sourceText.charAt(cursor) !== "(") {
    return null;
  }
  const returnTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
  if (returnTypeEnd === null) {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, returnTypeEnd + 1, line.end);
  const firstSelectorPart = identifierAt(sourceText, cursor, line.end);
  if (firstSelectorPart === null) {
    return null;
  }

  const selectorParts = [firstSelectorPart.name];
  cursor = firstSelectorPart.end;
  if (sourceText.charAt(cursor) === ":") {
    selectorParts[0] = firstSelectorPart.name + ":";
    cursor += 1;
    while (true) {
      cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
      if (sourceText.charAt(cursor) !== "(") {
        return null;
      }
      const parameterTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
      if (parameterTypeEnd === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameterTypeEnd + 1, line.end);
      const parameter = identifierAt(sourceText, cursor, line.end);
      if (parameter === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameter.end, line.end);
      if (sourceText.charAt(cursor) === "{") {
        break;
      }
      const nextSelectorPart = identifierAt(sourceText, cursor, line.end);
      if (nextSelectorPart === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, nextSelectorPart.end, line.end);
      if (sourceText.charAt(cursor) !== ":") {
        return null;
      }
      selectorParts.push(nextSelectorPart.name + ":");
      cursor += 1;
    }
  } else {
    cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
    if (sourceText.charAt(cursor) !== "{") {
      return null;
    }
  }

  const end = matchingBrace(sourceText, cursor, implementationEnd);
  return end === null ? null : { name: selectorParts.join(""), start, end: end + 1 };
}

function directMethodsInImplementation(
  sourceText: string,
  lines: readonly ObjectiveCLine[],
  implementation: StaticObjectiveCImplementation
): readonly StaticObjectiveCMethod[] | null {
  const methods: StaticObjectiveCMethod[] = [];
  let braceDepth = 0;
  const endLine = lines[implementation.endLine];
  if (endLine === undefined) {
    return null;
  }

  for (
    let lineIndex = implementation.bodyStartLine;
    lineIndex < implementation.endLine;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    if (braceDepth === 0) {
      const method = directMethodOnLine(sourceText, line, endLine.start);
      if (method !== null) {
        methods.push(method);
      }
    }

    for (let offset = line.start; offset < line.end; offset += 1) {
      const character = sourceText.charAt(offset);
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
        if (braceDepth < 0) {
          return null;
        }
      }
    }
  }

  return braceDepth === 0 ? methods : null;
}

/**
 * Extracts a conservative Objective-C implementation subset: complete direct
 * non-category @implementation ClassName ... @end blocks and their one-line,
 * brace-bodied instance or class methods. Headers, categories, protocols,
 * imports, properties, calls, and Swift bridging are deliberately left to
 * later language slices.
 */
export function extractObjectiveCFileFacts(input: ObjectiveCExtractFileFactsInput): ArtifactFacts {
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

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    range: SourceRange,
    ruleId: string
  ): void {
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
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addClass(implementation: StaticObjectiveCImplementation): SymbolNode {
    const qualifiedName = input.filePath + "#" + implementation.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const range = rangeFor(lineStarts, implementation.start, implementation.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: implementation.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, "language.objc.implementation.direct");
    return symbol;
  }

  function addMethod(parent: SymbolNode, method: StaticObjectiveCMethod): void {
    const qualifiedName = parent.qualifiedName + "." + method.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const range = rangeFor(lineStarts, method.start, method.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: method.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, range, "language.objc.method.direct-implementation");
  }

  const sanitized = sanitizeObjectiveC(input.sourceText);
  if (!sanitized.valid) {
    return emptyFacts(symbols, edges);
  }
  const lines = linesFor(sanitized.text);
  const implementations = collectDirectImplementations(lines);
  if (implementations === null) {
    return emptyFacts(symbols, edges);
  }

  const methodsByImplementation = implementations.map((implementation) => ({
    implementation,
    methods: directMethodsInImplementation(sanitized.text, lines, implementation)
  }));
  if (methodsByImplementation.some((entry) => entry.methods === null)) {
    return emptyFacts([fileNode], []);
  }

  for (const entry of methodsByImplementation) {
    const parent = addClass(entry.implementation);
    for (const method of entry.methods ?? []) {
      addMethod(parent, method);
    }
  }

  return emptyFacts(symbols, edges);
}

function emptyFacts(symbols: readonly SymbolNode[], edges: readonly GraphEdge[]): ArtifactFacts {
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

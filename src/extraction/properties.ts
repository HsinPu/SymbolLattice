import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface PropertiesExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "properties";
}

interface PhysicalLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface PropertyDeclaration {
  readonly name: string;
  /** The source span of the key only: property values can contain secrets. */
  readonly start: number;
  readonly end: number;
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

function physicalLines(sourceText: string): readonly PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13 || character === 10) {
      lines.push({ start, end: index, text: sourceText.slice(start, index) });
      if (character === 13 && sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      start = index + 1;
    }
  }
  lines.push({ start, end: sourceText.length, text: sourceText.slice(start) });
  return lines;
}

function isPropertiesWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === "\f";
}

function firstNonWhitespace(text: string): number {
  let index = 0;
  while (index < text.length && isPropertiesWhitespace(text[index] ?? "")) {
    index += 1;
  }
  return index;
}

function hasOddTrailingBackslashes(text: string): boolean {
  let count = 0;
  for (let index = text.length - 1; index >= 0 && text[index] === "\\"; index -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

/**
 * Decodes the source-proven Java properties escapes needed for a key identity.
 * Values are deliberately not decoded or retained: config values frequently
 * contain secrets and play no part in the symbol graph for this language slice.
 */
function decodePropertyKey(rawKey: string): string | null {
  let decoded = "";
  for (let index = 0; index < rawKey.length; index += 1) {
    const character = rawKey[index] ?? "";
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escaped = rawKey[index + 1];
    if (escaped === undefined) {
      return null;
    }
    if (escaped === "u") {
      const hex = rawKey.slice(index + 2, index + 6);
      if (!/^[0-9A-Fa-f]{4}$/u.test(hex)) {
        return null;
      }
      decoded += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }

    const escapedControls: Readonly<Record<string, string>> = {
      t: "\t",
      n: "\n",
      r: "\r",
      f: "\f"
    };
    decoded += escapedControls[escaped] ?? escaped;
    index += 1;
  }

  return decoded.length > 0 && !/[\u0000-\u001F\u007F]/u.test(decoded) ? decoded : null;
}

/**
 * Returns an exact, physical-line key span. A property whose key itself is
 * continued onto the next line is deliberately excluded: its decoded key has
 * no single contiguous source range. Value continuations are handled by the
 * caller solely to prevent their lines from being mistaken for new entries.
 */
function propertyDeclaration(line: PhysicalLine): PropertyDeclaration | null {
  const keyStart = firstNonWhitespace(line.text);
  if (keyStart >= line.text.length || line.text[keyStart] === "#" || line.text[keyStart] === "!") {
    return null;
  }

  let keyEnd = keyStart;
  while (keyEnd < line.text.length) {
    const character = line.text[keyEnd] ?? "";
    if (character === "\\") {
      if (keyEnd + 1 >= line.text.length) {
        return null;
      }
      keyEnd += 2;
      continue;
    }
    if (character === "=" || character === ":" || isPropertiesWhitespace(character)) {
      break;
    }
    keyEnd += 1;
  }

  const name = decodePropertyKey(line.text.slice(keyStart, keyEnd));
  return name === null ? null : { name, start: line.start + keyStart, end: line.start + keyEnd };
}

/**
 * Parses Java `.properties` declarations without reading values. It accepts
 * comment lines and the standard `=`, `:`, whitespace, or no-value forms;
 * escaped separators, whitespace, and `\\uXXXX` key characters are decoded.
 * Continuation values are consumed so their physical lines cannot create false
 * keys. Malformed escapes, dangling continuations, and continued keys remain
 * intentionally outside this evidence-first language slice.
 */
function staticPropertiesDeclarations(sourceText: string): readonly PropertyDeclaration[] {
  const lines = physicalLines(sourceText);
  const declarations: PropertyDeclaration[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const firstLine = lines[index];
    if (firstLine === undefined) {
      continue;
    }
    const firstContentIndex = firstNonWhitespace(firstLine.text);
    const isComment =
      firstContentIndex < firstLine.text.length &&
      (firstLine.text[firstContentIndex] === "#" || firstLine.text[firstContentIndex] === "!");
    if (isComment) {
      continue;
    }

    let finalLineIndex = index;
    let danglingContinuation = false;
    while (hasOddTrailingBackslashes(lines[finalLineIndex]?.text ?? "")) {
      if (finalLineIndex + 1 >= lines.length) {
        danglingContinuation = true;
        break;
      }
      finalLineIndex += 1;
    }

    if (!danglingContinuation) {
      const declaration = propertyDeclaration(firstLine);
      if (declaration !== null) {
        declarations.push(declaration);
      }
    }
    index = finalLineIndex;
  }

  return declarations;
}

/**
 * Extracts generic Java properties file and literal key symbols. Values never
 * enter nodes, edge evidence, signatures, or key ranges. Spring profile
 * selection, config precedence, placeholders, `@Value`, and all cross-file
 * framework semantics deliberately remain for a later framework-specific pass.
 */
export function extractPropertiesFileFacts(input: PropertiesExtractFileFactsInput): ArtifactFacts {
  const declarations = staticPropertiesDeclarations(input.sourceText);
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

  for (const declaration of declarations) {
    const qualifiedName = `${fileNode.qualifiedName}#properties-key:${declaration.name}`;
    const identity = `${qualifiedName}\u0000variable`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "variable",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "variable",
      filePath: input.filePath,
      range,
      isExported: false,
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
        ruleId: "syntax.properties.literal-key",
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

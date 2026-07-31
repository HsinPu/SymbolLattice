import { isMap, isScalar, parseDocument } from "yaml";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface YamlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "yaml";
}

interface YamlDeclaration {
  readonly name: string;
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

/**
 * Retains only a parsed single-document top-level mapping pair when both its
 * key and value are source-ranged, untagged, unanchored scalars on one line.
 * Nested YAML remains useful as context, but never becomes a fabricated graph
 * relationship in this first declaration-only slice.
 */
function staticYamlDeclarations(sourceText: string): readonly YamlDeclaration[] {
  try {
    const document = parseDocument(sourceText, { prettyErrors: false });
    if (document.errors.length > 0 || !isMap(document.contents)) {
      return [];
    }

    const declarations: YamlDeclaration[] = [];
    for (const pair of document.contents.items) {
      if (
        !isScalar(pair.key) ||
        typeof pair.key.value !== "string" ||
        pair.key.value.length === 0 ||
        pair.key.anchor !== undefined ||
        pair.key.tag !== undefined ||
        !isScalar(pair.value) ||
        pair.value.value === null ||
        pair.value.anchor !== undefined ||
        pair.value.tag !== undefined ||
        pair.key.range === undefined ||
        pair.value.range === undefined
      ) {
        continue;
      }

      const start = pair.key.range[0];
      const end = pair.value.range[1];
      const source = sourceText.slice(start, end);
      if (source.includes("\r") || source.includes("\n")) {
        continue;
      }
      declarations.push({ name: pair.key.value, start, end });
    }
    return declarations;
  } catch {
    return [];
  }
}

/**
 * Extracts source-proven YAML file and top-level scalar mapping-key symbols.
 * It intentionally excludes nested mappings/sequences, aliases, anchors,
 * tags, multi-document streams, imports, calls, framework facts, and runtime
 * configuration semantics.
 */
export function extractYamlFileFacts(input: YamlExtractFileFactsInput): ArtifactFacts {
  const declarations = staticYamlDeclarations(input.sourceText);
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
    const qualifiedName = `${fileNode.qualifiedName}#yaml-key:${declaration.name}`;
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
        ruleId: "syntax.yaml.top-level-scalar-mapping",
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

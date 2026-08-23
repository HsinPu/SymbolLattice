import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import {
  parseShellSource,
  type ShellDialect,
  type ShellParser
} from "./shell-wasm-runtime.js";

export interface ShellExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly sourceBytes?: Uint8Array;
  readonly language: "shell";
}

const POSIX_SHEBANGS = new Set([
  "#!/bin/sh",
  "#!/usr/bin/sh",
  "#!/bin/dash",
  "#!/usr/bin/dash",
  "#!/usr/bin/env sh",
  "#!/usr/bin/env dash"
]);
const BASH_SHEBANGS = new Set([
  "#!/bin/bash",
  "#!/usr/bin/bash",
  "#!/usr/bin/env bash"
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
  let upper = lineStarts.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  return { line: lower + 1, column: offset - (lineStarts[lower] ?? 0) + 1 };
}

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function createFileNode(input: ShellExtractFileFactsInput, lineStarts: readonly number[]): SymbolNode {
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  return {
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
}

function emptyFacts(fileNode: SymbolNode): ArtifactFacts {
  return {
    symbols: [fileNode],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: []
  };
}

function classifyDialect(filePath: string, sourceText: string): ShellDialect | null {
  const newlineIndex = sourceText.indexOf("\n");
  const rawFirstLine = newlineIndex === -1 ? sourceText : sourceText.slice(0, newlineIndex);
  const firstLine = newlineIndex !== -1 && rawFirstLine.endsWith("\r") ? rawFirstLine.slice(0, -1) : rawFirstLine;
  const posixShebang = POSIX_SHEBANGS.has(firstLine);
  const bashShebang = BASH_SHEBANGS.has(firstLine);
  const anyShebang = firstLine.startsWith("#!");
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith(".bash")) {
    return !anyShebang || bashShebang ? "bash" : null;
  }
  if (normalizedPath.endsWith(".sh")) {
    if (!anyShebang && /^[ \t]*function[ \t]+[A-Za-z_][A-Za-z0-9_.:-]*(?:[ \t]*\(\))?[ \t]*(?:\r?\n[ \t]*)*(?:\{|\()/mu.test(sourceText)) {
      return "bash";
    }
    if (!anyShebang || posixShebang) {
      return "posix";
    }
    return bashShebang ? "bash" : null;
  }
  if (posixShebang) {
    return "posix";
  }
  return bashShebang ? "bash" : null;
}

function utf8BoundaryMap(sourceText: string): Uint32Array {
  const byteLength = new TextEncoder().encode(sourceText).byteLength;
  const invalid = 0xffff_ffff;
  const boundaries = new Uint32Array(byteLength + 1);
  boundaries.fill(invalid);
  let byteOffset = 0;
  let utf16Offset = 0;
  boundaries[0] = 0;

  while (utf16Offset < sourceText.length) {
    const codePoint = sourceText.codePointAt(utf16Offset) ?? 0;
    const utf16Width = codePoint > 0xffff ? 2 : 1;
    const utf8Width = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    byteOffset += utf8Width;
    utf16Offset += utf16Width;
    boundaries[byteOffset] = utf16Offset;
  }
  return boundaries;
}

function utf16OffsetFor(boundaries: Uint32Array, byteOffset: number): number {
  const result = boundaries[byteOffset];
  if (result === undefined || result === 0xffff_ffff) {
    throw new Error(`Validated Shell parser byte boundary is unavailable: ${byteOffset}`);
  }
  return result;
}

function isAsciiShellNameStart(value: number | undefined): boolean {
  return value === 0x5f ||
    (value !== undefined && ((value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a)));
}

function normalizeZshEqualsExpansion(
  source: string | Uint8Array
): string | Uint8Array | null {
  if (typeof source === "string") {
    let changed = false;
    const normalized = source.replace(/\$\{=([A-Za-z_][A-Za-z0-9_]*)/gu, (match) => {
      changed = true;
      return `${match.slice(0, 2)}_${match.slice(3)}`;
    });
    return changed ? normalized : null;
  }

  let normalized: Uint8Array | null = null;
  for (let index = 0; index + 3 < source.byteLength; index += 1) {
    if (
      source[index] === 0x24 &&
      source[index + 1] === 0x7b &&
      source[index + 2] === 0x3d &&
      isAsciiShellNameStart(source[index + 3])
    ) {
      normalized ??= source.slice();
      normalized[index + 2] = 0x5f;
    }
  }
  return normalized;
}

/**
 * Projects only syntax-valid, direct top-level mvdan FuncDecl nodes. Dialect
 * conflicts and every adapter source/parser error retain the file node alone;
 * packaging/runtime failures intentionally propagate and abort generation.
 */
export function extractShellFileFacts(
  input: ShellExtractFileFactsInput,
  parser: ShellParser = parseShellSource
): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileNode = createFileNode(input, lineStarts);
  const dialect = classifyDialect(input.filePath, input.sourceText);
  if (dialect === null) {
    return emptyFacts(fileNode);
  }

  const parserSource = input.sourceBytes ?? input.sourceText;
  let parsed = parser(parserSource, dialect);
  if (!parsed.ok && parsed.code === 6 && dialect === "bash") {
    const normalized = normalizeZshEqualsExpansion(parserSource);
    if (normalized !== null) {
      parsed = parser(normalized, dialect);
    }
  }
  if (!parsed.ok) {
    return emptyFacts(fileNode);
  }

  const byteBoundaries = utf8BoundaryMap(input.sourceText);
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();

  for (const functionFact of parsed.functions) {
    const qualifiedName = `${input.filePath}#${functionFact.name}`;
    const identity = `${qualifiedName}\u0000function`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(
      lineStarts,
      utf16OffsetFor(byteBoundaries, functionFact.declStart),
      utf16OffsetFor(byteBoundaries, functionFact.declEnd)
    );
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: functionFact.name,
      qualifiedName,
      kind: "function",
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
        ruleId: "language.shell.function.direct-top-level",
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

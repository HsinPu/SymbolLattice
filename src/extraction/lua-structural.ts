import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import type { LuaWorkerResponse } from "./lua-worker-protocol.js";

export const LUA_STRUCTURAL_RULE_ID =
  "language.lua.function.direct-root.tree-sitter-lua-v0.5" as const;

export interface ProjectLuaStructuralFactsInput {
  readonly filePath: string;
  readonly sourceBytes: Uint8Array;
  readonly sourceText?: string;
  readonly response: LuaWorkerResponse;
}

export function projectLuaStructuralFacts(input: ProjectLuaStructuralFactsInput): ArtifactFacts {
  if (input.response.decision.kind === "file-only") {
    return projectLuaFileOnlyFacts({
      filePath: input.filePath,
      sourceText: input.sourceText ?? new TextDecoder("utf-8").decode(input.sourceBytes)
    });
  }
  const offsets = byteOffsetMap(input.sourceBytes);
  const sourceText = offsets.sourceText;
  const lineStarts = lineStartsFor(sourceText);
  const fileNode = fileSymbol(input.filePath, rangeFor(lineStarts, 0, sourceText.length));
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const ordinals = new Map<string, number>();
  for (const declaration of input.response.declarations) {
    const declarationStart = requiredUtf16Offset(offsets.byByte, declaration.declarationStartByte);
    const declarationEnd = requiredUtf16Offset(offsets.byByte, declaration.declarationEndByte);
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const identity = `${qualifiedName}\0function`;
    const declarationOrdinal = ordinals.get(identity) ?? 0;
    ordinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declarationStart, declarationEnd);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range,
      isExported: declaration.form !== "local-function",
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
        ruleId: LUA_STRUCTURAL_RULE_ID,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }
  return emptyFacts(symbols, edges);
}

export function projectLuaFileOnlyFacts(input: {
  readonly filePath: string;
  readonly sourceText: string;
}): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  return emptyFacts([
    fileSymbol(input.filePath, rangeFor(lineStarts, 0, input.sourceText.length))
  ], []);
}

function fileSymbol(filePath: string, range: SourceRange): SymbolNode {
  const name = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  return {
    id: createSymbolId({ filePath, qualifiedName: filePath, kind: "file", declarationOrdinal: 0 }),
    name,
    qualifiedName: filePath,
    kind: "file",
    filePath,
    range,
    isExported: true,
    declarationOrdinal: 0
  };
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
    reExportBindings: [],
    nestRouteFacts: {
      routeControllers: [],
      moduleControllers: [],
      routerModulePrefixes: []
    },
    fastifyPluginFacts: {
      routes: [],
      childRegistrations: [],
      rootRegistrations: []
    },
    fastApiRouterFacts: {
      routers: [],
      routes: [],
      importedRouterInclusions: []
    }
  };
}

function byteOffsetMap(sourceBytes: Uint8Array): {
  readonly sourceText: string;
  readonly byByte: ReadonlyMap<number, number>;
} {
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const byByte = new Map<number, number>([[0, 0]]);
  let byteOffset = 0;
  let utf16Offset = 0;
  const encoder = new TextEncoder();
  for (const point of sourceText) {
    byteOffset += encoder.encode(point).byteLength;
    utf16Offset += point.length;
    byByte.set(byteOffset, utf16Offset);
  }
  if (byteOffset !== sourceBytes.byteLength) {
    throw new Error("Lua source byte-to-UTF-16 map did not consume the exact source bytes.");
  }
  return { sourceText, byByte };
}

function requiredUtf16Offset(offsets: ReadonlyMap<number, number>, byteOffset: number): number {
  const result = offsets.get(byteOffset);
  if (result === undefined) {
    throw new Error(`Lua worker byte offset ${byteOffset} does not align to a UTF-8 code point.`);
  }
  return result;
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\r") {
      if (sourceText[index + 1] === "\n") index += 1;
      starts.push(index + 1);
    } else if (sourceText[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function rangeFor(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return { start: positionFor(lineStarts, start), end: positionFor(lineStarts, end) };
}

function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const value = lineStarts[middle];
    if (value !== undefined && value <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
}

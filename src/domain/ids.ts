import type { EdgeKind, SymbolKind } from "./types.js";

function encodePart(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function createSymbolId(input: {
  readonly filePath: string;
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly declarationOrdinal: number;
}): string {
  return [
    "symbol",
    encodePart(input.filePath),
    encodePart(input.qualifiedName),
    input.kind,
    input.declarationOrdinal
  ].join(":");
}

export function createEdgeId(input: {
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind: EdgeKind;
  readonly line: number;
  readonly column: number;
  readonly referenceName: string | null;
}): string {
  return [
    "edge",
    encodePart(input.sourceId),
    encodePart(input.targetId ?? input.referenceName ?? "unresolved"),
    input.kind,
    input.line,
    input.column
  ].join(":");
}

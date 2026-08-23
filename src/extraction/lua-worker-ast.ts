import type { Node as TreeSitterNode } from "web-tree-sitter";

import {
  LUA_MAXIMUM_FUNCTIONS,
  LUA_MAXIMUM_NESTING,
  type LuaFileFailureCode,
  type LuaFunctionForm,
  type LuaWorkerDeclaration,
  type LuaWorkerMetrics
} from "./lua-worker-protocol.js";

export interface LuaTreeInspection {
  readonly code: LuaFileFailureCode | null;
  readonly metrics: LuaWorkerMetrics;
  readonly declarations: readonly LuaWorkerDeclaration[];
}

export function inspectLuaTree(
  root: TreeSitterNode,
  sourceBytes: Uint8Array,
  parserSourceText?: string
): LuaTreeInspection {
  const utf16ToByte = utf16ByteOffsetMap(sourceBytes, parserSourceText);
  let functionCandidates = 0;
  let namedFunctions = 0;
  let maxDepth = 0;
  let hasError = root.type !== "chunk";
  let hasMissing = false;
  const stack: Array<readonly [TreeSitterNode, number]> = [[root, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    maxDepth = Math.max(maxDepth, depth);
    hasError ||= node.isError;
    hasMissing ||= node.isMissing;
    if (node.type === "function_declaration" || node.type === "function_definition") {
      functionCandidates += 1;
    }
    if (node.type === "function_declaration") namedFunctions += 1;
    for (let index = node.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = node.namedChildren[index];
      if (child !== undefined) stack.push([child, depth + 1]);
    }
  }
  const metrics: LuaWorkerMetrics = {
    sourceBytes: sourceBytes.byteLength,
    physicalLines: physicalLines(sourceBytes),
    functionCandidates,
    namedFunctions,
    maxDepth
  };
  if (functionCandidates > LUA_MAXIMUM_FUNCTIONS || namedFunctions > LUA_MAXIMUM_FUNCTIONS) {
    return { code: "FUNCTION_LIMIT", metrics: cappedMetrics(metrics), declarations: [] };
  }
  if (maxDepth > LUA_MAXIMUM_NESTING) {
    return { code: "NESTING_LIMIT", metrics: cappedMetrics(metrics), declarations: [] };
  }
  if (hasMissing) return { code: "MISSING", metrics, declarations: [] };
  if (hasError || root.hasError) return { code: "ERROR", metrics, declarations: [] };

  const declarations: LuaWorkerDeclaration[] = [];
  for (const node of root.namedChildren) {
    if (node.type !== "function_declaration") continue;
    const nameNode = node.childForFieldName("name");
    if (nameNode === null) continue;
    const declarationStartByte = requiredByteOffset(utf16ToByte, node.startIndex);
    const declarationEndByte = requiredByteOffset(utf16ToByte, node.endIndex);
    const nameStartByte = requiredByteOffset(utf16ToByte, nameNode.startIndex);
    const nameEndByte = requiredByteOffset(utf16ToByte, nameNode.endIndex);
    const name = decodeSlice(sourceBytes, nameStartByte, nameEndByte);
    const prefix = decodeSlice(sourceBytes, declarationStartByte, nameStartByte).trimStart();
    const form = functionForm(prefix, name);
    if (form === null) continue;
    declarations.push({
      name,
      form,
      declarationStartByte,
      declarationEndByte,
      nameStartByte,
      nameEndByte
    });
  }
  declarations.sort((left, right) =>
    left.declarationStartByte - right.declarationStartByte ||
    left.declarationEndByte - right.declarationEndByte ||
    compareText(left.name, right.name)
  );
  return { code: null, metrics, declarations };
}

export function emptyLuaMetrics(sourceBytes: Uint8Array): LuaWorkerMetrics {
  return {
    sourceBytes: sourceBytes.byteLength,
    physicalLines: physicalLines(sourceBytes),
    functionCandidates: 0,
    namedFunctions: 0,
    maxDepth: 0
  };
}

function functionForm(prefix: string, name: string): LuaFunctionForm | null {
  if (prefix.startsWith("global")) return null;
  if (name.includes(":")) return "colon-function";
  if (name.includes(".")) return "dotted-function";
  return prefix.startsWith("local") ? "local-function" : "plain-function";
}

function cappedMetrics(metrics: LuaWorkerMetrics): LuaWorkerMetrics {
  return {
    ...metrics,
    functionCandidates: Math.min(LUA_MAXIMUM_FUNCTIONS, metrics.functionCandidates),
    namedFunctions: Math.min(LUA_MAXIMUM_FUNCTIONS, metrics.namedFunctions),
    maxDepth: Math.min(LUA_MAXIMUM_NESTING, metrics.maxDepth)
  };
}

function physicalLines(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  let lines = 1;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] === 0x0d) {
      lines += 1;
      if (bytes[index + 1] === 0x0a) index += 1;
    } else if (bytes[index] === 0x0a) {
      lines += 1;
    }
  }
  return lines;
}

function decodeSlice(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
}

function utf16ByteOffsetMap(
  sourceBytes: Uint8Array,
  parserSourceText?: string
): ReadonlyMap<number, number> {
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const parsedText = parserSourceText ?? sourceText;
  const crlfNormalized = parsedText !== sourceText;
  if (crlfNormalized && parsedText !== sourceText.replaceAll("\r\n", "\n")) {
    throw new Error("Lua parser source text is not an exact CRLF normalization of the raw bytes.");
  }
  const result = new Map<number, number>([[0, 0]]);
  const encoder = new TextEncoder();
  let sourceOffset = 0;
  let parserOffset = 0;
  let byteOffset = 0;
  while (sourceOffset < sourceText.length) {
    if (crlfNormalized && sourceText[sourceOffset] === "\r" && sourceText[sourceOffset + 1] === "\n") {
      sourceOffset += 2;
      parserOffset += 1;
      byteOffset += 2;
      result.set(parserOffset, byteOffset);
      continue;
    }
    const codePoint = sourceText.codePointAt(sourceOffset);
    const point = codePoint === undefined ? "" : String.fromCodePoint(codePoint);
    sourceOffset += point.length;
    parserOffset += point.length;
    byteOffset += encoder.encode(point).byteLength;
    result.set(parserOffset, byteOffset);
  }
  if (parserOffset !== parsedText.length || byteOffset !== sourceBytes.byteLength) {
    throw new Error("Lua parser source map did not consume the exact parser text and raw bytes.");
  }
  return result;
}

function requiredByteOffset(offsets: ReadonlyMap<number, number>, utf16Offset: number): number {
  const result = offsets.get(utf16Offset);
  if (result === undefined) {
    throw new Error(`Lua AST index ${utf16Offset} splits a UTF-16 code point.`);
  }
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

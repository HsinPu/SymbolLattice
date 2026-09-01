import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode,
  type ZigCallFact,
  type ZigCallableFact,
  type ZigFacts,
  type ZigImportFact,
  type ZigInstantiationFact,
  type ZigTypeFact,
  type ZigTypeDeclarationKind
} from "../domain/index.js";

export interface ZigExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "zig";
}

interface ZigDeclaration {
  readonly name: string;
  readonly kind: Extract<SymbolNode["kind"], "class" | "function">;
  readonly declarationKind?: ZigTypeDeclarationKind;
  readonly start: number;
  readonly end: number;
  readonly bodyStart?: number;
  readonly bodyEnd?: number;
  readonly isExported: boolean;
  readonly parameterCount?: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly relationEligible?: boolean;
}

interface ZigParseResult {
  readonly valid: boolean;
  readonly text: string;
  readonly pairs: ReadonlyMap<number, number>;
  readonly declarations: readonly ZigDeclaration[];
}

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
]);

const CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  ["]", "["],
  [")", "("]
]);

const RESERVED_CALL_NAMES = new Set([
  "if",
  "else",
  "for",
  "while",
  "switch",
  "catch",
  "defer",
  "errdefer",
  "return",
  "fn",
  "struct",
  "enum",
  "union",
  "opaque",
  "test",
  "asm",
  "comptime",
  "nosuspend",
  "async",
  "await",
  "suspend",
  "resume"
]);

const UNSAFE_RELATION_BODY =
  /\b(?:comptime|anytype|usingnamespace|async|await|suspend|resume|nosuspend|if|for|while|switch|catch|defer|errdefer)\b|@(?!import\b)(?:call|field|Type|cImport|extern|asyncCall|frameAddress)\b/u;

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

function lineEndAfter(sourceText: string, start: number): number {
  let end = start;
  while (end < sourceText.length && sourceText[end] !== "\r" && sourceText[end] !== "\n") {
    end += 1;
  }
  return end;
}

function isAtLineIndentation(sourceText: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && sourceText[cursor] !== "\r" && sourceText[cursor] !== "\n") {
    if (sourceText[cursor] !== " " && sourceText[cursor] !== "\t") {
      return false;
    }
    cursor -= 1;
  }
  return true;
}

/**
 * Keeps offsets stable while removing comments and quoted literals. Zig has
 * line comments and indentation-sensitive multiline strings but no block
 * comment form. Any unterminated literal or unbalanced delimiter fails closed.
 */
function sanitizeZig(sourceText: string): { readonly valid: boolean; readonly text: string } {
  const text = sourceText.split("");
  const delimiters: string[] = [];
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanQuoted(quote: string): boolean {
    const start = index;
    blank(index);
    index += 1;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === "\\") {
        blank(index);
        if (index + 1 < sourceText.length) {
          blank(index + 1);
        }
        index += 2;
        continue;
      }
      if (current === quote) {
        blank(index);
        index += 1;
        return true;
      }
      if (current === "\r" || current === "\n") {
        index = start;
        return false;
      }
      blank(index);
      index += 1;
    }
    index = start;
    return false;
  }

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
    }
    if (sourceText.slice(index, index + 2) === "//") {
      const end = lineEndAfter(sourceText, index);
      for (let cursor = index; cursor < end; cursor += 1) {
        blank(cursor);
      }
      index = end;
      continue;
    }
    if (current === "\\" && sourceText[index + 1] === "\\" && isAtLineIndentation(sourceText, index)) {
      const end = lineEndAfter(sourceText, index);
      for (let cursor = index; cursor < end; cursor += 1) {
        blank(cursor);
      }
      index = end;
      continue;
    }
    if (current === '"' || current === "'") {
      if (!scanQuoted(current)) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (OPEN_TO_CLOSE.has(current)) {
      delimiters.push(current);
    } else {
      const expectedOpen = CLOSE_TO_OPEN.get(current);
      if (expectedOpen !== undefined && delimiters.pop() !== expectedOpen) {
        return { valid: false, text: "" };
      }
    }
    index += 1;
  }
  return delimiters.length === 0 ? { valid: true, text: text.join("") } : { valid: false, text: "" };
}

function delimiterPairs(sourceText: string): ReadonlyMap<number, number> {
  const stack: Array<{ readonly open: string; readonly index: number }> = [];
  const pairs = new Map<number, number>();
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character !== undefined && OPEN_TO_CLOSE.has(character)) {
      stack.push({ open: character, index });
      continue;
    }
    const expected = character === undefined ? undefined : CLOSE_TO_OPEN.get(character);
    if (expected !== undefined) {
      const open = stack.pop();
      if (open !== undefined && open.open === expected) {
        pairs.set(open.index, index);
      }
    }
  }
  return pairs;
}

function splitTopLevel(text: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  const stack: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== undefined && OPEN_TO_CLOSE.has(character)) {
      stack.push(character);
    } else if (character !== undefined && CLOSE_TO_OPEN.has(character)) {
      if (stack.at(-1) === CLOSE_TO_OPEN.get(character)) {
        stack.pop();
      }
    } else if (character === "," && stack.length === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const final = text.slice(start).trim();
  if (final.length > 0) {
    parts.push(final);
  }
  return parts;
}

function simpleTypeName(value: string): string | undefined {
  const normalized = value
    .replace(/\b(?:comptime|noalias|const|volatile|allowzero)\b/gu, " ")
    .replace(/\balign\s*\([^)]*\)/gu, " ")
    .replace(/[!?*\[\]]/gu, " ")
    .trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function parameterTypeNames(parameters: string): readonly string[] | undefined {
  const segments = splitTopLevel(parameters);
  if (segments.length === 0) {
    return [];
  }
  const names: string[] = [];
  for (const segment of segments) {
    if (segment.includes("anytype") || segment.includes("...")) {
      return undefined;
    }
    const colon = segment.indexOf(":");
    if (colon < 0) {
      return undefined;
    }
    const name = simpleTypeName(segment.slice(colon + 1).split("=")[0] ?? "");
    if (name === undefined) {
      return undefined;
    }
    names.push(name);
  }
  return names;
}

function returnTypeName(suffix: string): string | undefined {
  const normalized = suffix.trim();
  if (normalized.length === 0 || normalized === "void") {
    return undefined;
  }
  const withoutError = normalized.replace(/^!?/u, "");
  const name = simpleTypeName(withoutError);
  return name === "void" ? undefined : name;
}

function parseFunctionDeclaration(
  line: string,
  start: number,
  pairs: ReadonlyMap<number, number>
): ZigDeclaration | null {
  const match = /^(?:(?:pub|inline|noinline|export|extern(?:\s*\([^)]*\))?|callconv\s*\([^)]*\)|nosuspend)\s+)*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*([^{};]*?)(\{|;)(?:.*)?$/u.exec(line.trim());
  const name = match?.[1];
  const parameters = match?.[2];
  const suffix = match?.[3];
  if (match === null || name === undefined || parameters === undefined || suffix === undefined) {
    return null;
  }
  const types = parameterTypeNames(parameters);
  const unsafeHeader = /\b(?:anytype|comptime|asm)\b/u.test(parameters + " " + suffix);
  const parsedReturnType = returnTypeName(suffix);
  if (match[4] === ";") {
    return {
      name,
      kind: "function",
      start,
      end: start + line.length,
      isExported: /^(?:pub|export)\b/u.test(line),
      parameterCount: splitTopLevel(parameters).length,
      ...(types === undefined ? {} : { parameterTypeNames: types }),
      ...(parsedReturnType === undefined ? {} : { returnTypeName: parsedReturnType }),
      relationEligible: false
    };
  }
  const openOffset = line.indexOf("{");
  if (openOffset < 0) {
    return null;
  }
  const bodyStart = start + openOffset;
  const bodyEnd = pairs.get(bodyStart);
  if (bodyEnd === undefined) {
    return null;
  }
  return {
    name,
    kind: "function",
    start,
    end: bodyEnd + 1,
    bodyStart,
    bodyEnd,
    isExported: /^(?:pub|export)\b/u.test(line),
    parameterCount: splitTopLevel(parameters).length,
    ...(types === undefined ? {} : { parameterTypeNames: types }),
    ...(parsedReturnType === undefined ? {} : { returnTypeName: parsedReturnType }),
    relationEligible: !unsafeHeader
  };
}

function parseContainerDeclaration(
  line: string,
  start: number,
  pairs: ReadonlyMap<number, number>
): ZigDeclaration | null {
  const match = /^(?:(pub)\s+)?(?:const|var)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[^=]+)?\s*=\s*(?:(?:extern|packed|allowzero)\s+)*(struct|enum|union|opaque)\b[^\{]*\{/u.exec(line);
  const name = match?.[2];
  const declarationKind = match?.[3] as ZigTypeDeclarationKind | undefined;
  if (match === null || name === undefined || declarationKind === undefined) {
    return null;
  }
  const openOffset = line.indexOf("{");
  if (openOffset < 0) {
    return null;
  }
  const bodyStart = start + openOffset;
  const bodyEnd = pairs.get(bodyStart);
  if (bodyEnd === undefined) {
    return null;
  }
  return {
    name,
    kind: "class",
    declarationKind,
    start,
    end: bodyEnd + 1,
    bodyStart,
    bodyEnd,
    isExported: match[1] !== undefined
  };
}

function parseZigSource(sourceText: string): ZigParseResult {
  const sanitized = sanitizeZig(sourceText);
  if (!sanitized.valid) {
    return { valid: false, text: "", pairs: new Map(), declarations: [] };
  }
  const pairs = delimiterPairs(sanitized.text);
  const declarations: ZigDeclaration[] = [];
  let braceDepth = 0;
  let lineStart = 0;
  while (lineStart <= sanitized.text.length) {
    const lineEnd = lineEndAfter(sanitized.text, lineStart);
    const line = sanitized.text.slice(lineStart, lineEnd);
    const leadingWhitespace = /^\s*/u.exec(line)?.[0].length ?? 0;
    const content = line.slice(leadingWhitespace);
    if (braceDepth === 0 && content.length > 0) {
      const declarationStart = lineStart + leadingWhitespace;
      const declaration =
        parseFunctionDeclaration(content, declarationStart, pairs) ??
        parseContainerDeclaration(content, declarationStart, pairs);
      if (declaration !== null) {
        declarations.push(declaration);
      }
    }
    for (const character of line) {
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
    if (lineEnd >= sanitized.text.length) {
      break;
    }
    lineStart = lineEnd + (sanitized.text[lineEnd] === "\r" && sanitized.text[lineEnd + 1] === "\n" ? 2 : 1);
  }
  return { valid: true, text: sanitized.text, pairs, declarations };
}

function argumentCount(
  sanitized: string,
  open: number,
  pairs: ReadonlyMap<number, number>
): number | undefined {
  const close = pairs.get(open);
  if (close === undefined) {
    return undefined;
  }
  const body = sanitized.slice(open + 1, close).trim();
  if (body.length === 0) {
    return 0;
  }
  if (body.includes("...")) {
    return undefined;
  }
  return splitTopLevel(body).length;
}

function importFacts(
  sourceText: string,
  sanitized: string,
  filePath: string,
  sourceId: string,
  lineStarts: readonly number[]
): readonly ZigImportFact[] {
  const imports: ZigImportFact[] = [];
  const pattern = /(?:^|\n)[ \t]*(?:pub\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*@import\s*\(\s*"([^"\r\n]*)"\s*\)\s*;/gu;
  for (const match of sourceText.matchAll(pattern)) {
    const full = match[0] ?? "";
    const index = match.index ?? 0;
    const masked = sanitized.slice(index, index + full.length);
    if (!masked.includes("@import")) {
      continue;
    }
    const importedPath = match[2];
    if (importedPath === undefined || match[1] === undefined) {
      continue;
    }
    const pathOffset = index + full.indexOf(importedPath);
    imports.push({
      sourceId,
      filePath,
      localName: match[1],
      importedPath,
      range: rangeFor(lineStarts, pathOffset, pathOffset + importedPath.length)
    });
  }
  return imports;
}

function bodyFacts(
  parsed: ZigParseResult,
  declaration: ZigDeclaration,
  filePath: string,
  sourceId: string,
  lineStarts: readonly number[],
  allowDirectCalls: boolean
): { readonly calls: readonly ZigCallFact[]; readonly instantiations: readonly ZigInstantiationFact[] } {
  if (
    declaration.kind !== "function" ||
    declaration.bodyStart === undefined ||
    declaration.bodyEnd === undefined ||
    declaration.relationEligible !== true
  ) {
    return { calls: [], instantiations: [] };
  }
  const body = parsed.text.slice(declaration.bodyStart + 1, declaration.bodyEnd);
  if (UNSAFE_RELATION_BODY.test(body) || /\b(?:const|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=/u.test(body)) {
    return { calls: [], instantiations: [] };
  }
  const calls: ZigCallFact[] = [];
  const moduleRanges: Array<{ readonly start: number; readonly end: number }> = [];
  const modulePattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu;
  for (const match of body.matchAll(modulePattern)) {
    const receiverModuleName = match[1];
    const referenceName = match[2];
    if (receiverModuleName === undefined || referenceName === undefined) {
      continue;
    }
    const relative = match.index ?? 0;
    const open = declaration.bodyStart + 1 + relative + (match[0]?.lastIndexOf("(") ?? -1);
    const count = argumentCount(parsed.text, open, parsed.pairs);
    if (count === undefined) {
      continue;
    }
    const start = declaration.bodyStart + 1 + relative;
    const end = start + (match[0]?.trimEnd().length ?? 0);
    moduleRanges.push({ start, end });
    calls.push({
      sourceId,
      filePath,
      referenceName,
      callKind: "module",
      receiverModuleName,
      argumentCount: count,
      range: rangeFor(lineStarts, start, end)
    });
  }
  const directPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu;
  for (const match of allowDirectCalls ? body.matchAll(directPattern) : []) {
    const referenceName = match[1];
    if (referenceName === undefined || RESERVED_CALL_NAMES.has(referenceName)) {
      continue;
    }
    const relative = match.index ?? 0;
    const start = declaration.bodyStart + 1 + relative;
    const previous = parsed.text[start - 1];
    if (previous === "." || previous === "@" || moduleRanges.some((span) => start > span.start && start < span.end)) {
      continue;
    }
    const open = declaration.bodyStart + 1 + relative + (match[0]?.lastIndexOf("(") ?? -1);
    const count = argumentCount(parsed.text, open, parsed.pairs);
    if (count === undefined) {
      continue;
    }
    const end = start + referenceName.length;
    calls.push({
      sourceId,
      filePath,
      referenceName,
      callKind: "direct",
      argumentCount: count,
      range: rangeFor(lineStarts, start, end)
    });
  }
  const instantiations: ZigInstantiationFact[] = [];
  const moduleInstantiationPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/gu;
  for (const match of body.matchAll(moduleInstantiationPattern)) {
    const receiverModuleName = match[1];
    const typeName = match[2];
    if (receiverModuleName === undefined || typeName === undefined) {
      continue;
    }
    const start = declaration.bodyStart + 1 + (match.index ?? 0);
    instantiations.push({
      sourceId,
      filePath,
      typeName,
      receiverModuleName,
      argumentCount: 0,
      range: rangeFor(lineStarts, start, start + (match[0]?.indexOf("{") ?? typeName.length))
    });
  }
  const instantiationPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\{/gu;
  for (const match of body.matchAll(instantiationPattern)) {
    const typeName = match[1];
    if (typeName === undefined || RESERVED_CALL_NAMES.has(typeName)) {
      continue;
    }
    const start = declaration.bodyStart + 1 + (match.index ?? 0);
    const previous = parsed.text[start - 1];
    if (previous === ".") {
      continue;
    }
    instantiations.push({
      sourceId,
      filePath,
      typeName,
      argumentCount: 0,
      range: rangeFor(lineStarts, start, start + typeName.length)
    });
  }
  return { calls, instantiations };
}

export function extractZigFileFacts(input: ZigExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const parsed = parseZigSource(input.sourceText);
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
  const types: ZigTypeFact[] = [];
  const callables: ZigCallableFact[] = [];
  const imports: ZigImportFact[] = parsed.valid
    ? [...importFacts(input.sourceText, parsed.text, input.filePath, fileNode.id, lineStarts)]
    : [];
  const calls: ZigCallFact[] = [];
  const instantiations: ZigInstantiationFact[] = [];
  const symbolByName = new Map<string, SymbolNode[]>();
  const callableSymbolIds = new Set<string>();

  for (const declaration of parsed.declarations) {
    const qualifiedName = `${fileNode.qualifiedName}.${declaration.name}`;
    const identity = `${qualifiedName}\u0000${declaration.kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbolRange = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: declaration.kind,
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: declaration.kind,
      filePath: input.filePath,
      range: symbolRange,
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolByName.set(declaration.name, [...(symbolByName.get(declaration.name) ?? []), symbol]);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: symbolRange.start.line,
        column: symbolRange.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: symbolRange,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId:
          declaration.kind === "function"
            ? "syntax.zig.top-level-function"
            : "syntax.zig.top-level-container",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    if (declaration.kind === "class" && declaration.declarationKind !== undefined) {
      types.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        name: declaration.name,
        moduleName: input.filePath,
        declarationKind: declaration.declarationKind,
        isExported: declaration.isExported,
        range: symbolRange
      });
    } else if (declaration.kind === "function" && declaration.relationEligible === true) {
      callables.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        name: declaration.name,
        moduleName: input.filePath,
        parameterCount: declaration.parameterCount ?? 0,
        ...(declaration.parameterTypeNames === undefined
          ? {}
          : { parameterTypeNames: declaration.parameterTypeNames }),
        ...(declaration.returnTypeName === undefined ? {} : { returnTypeName: declaration.returnTypeName }),
        isExported: declaration.isExported,
        range: symbolRange
      });
      callableSymbolIds.add(symbol.id);
      const facts = bodyFacts(
        parsed,
        declaration,
        input.filePath,
        symbol.id,
        lineStarts,
        imports.length === 0
      );
      calls.push(...facts.calls);
      instantiations.push(...facts.instantiations);
    }
  }

  for (const call of calls) {
    if (call.callKind !== "direct") {
      continue;
    }
    const source = symbols.find((symbol) => symbol.id === call.sourceId);
    const candidates =
      symbolByName
        .get(call.referenceName)
        ?.filter((symbol) => symbol.kind === "function" && callableSymbolIds.has(symbol.id)) ?? [];
    if (source === undefined || candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0];
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        line: call.range.start.line,
        column: call.range.start.column,
        referenceName: call.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "calls",
      filePath: call.filePath,
      range: call.range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.referenceName,
      evidence: {
        ruleId:
          call.argumentCount === 0
            ? "syntax.zig.same-file.unique-zero-argument-top-level-function-call"
            : "syntax.zig.same-file.unique-direct-function-call",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  const zigFacts: ZigFacts = {
    moduleName: input.filePath,
    parserRejected: !parsed.valid,
    types,
    callables,
    imports,
    calls,
    instantiations
  };
  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    zigFacts
  };
}

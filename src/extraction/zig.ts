import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ZigExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "zig";
}

interface ZigDeclaration {
  readonly name: string;
  readonly kind: Extract<SymbolNode["kind"], "class" | "function">;
  readonly start: number;
  readonly end: number;
  readonly isExported: boolean;
}

interface ZigDirectCall {
  readonly callerName: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SanitizedZigSource {
  readonly valid: boolean;
  readonly text: string;
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
 * Zig has line comments and line-oriented multiline string literals, but no
 * block-comment form. The scanner preserves offsets while removing only text
 * that cannot contain declarations. Any unclosed quoted literal or unbalanced
 * delimiter makes the file fail closed.
 */
function sanitizeZig(sourceText: string): SanitizedZigSource {
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

    if (
      current === "\\" &&
      sourceText[index + 1] === "\\" &&
      isAtLineIndentation(sourceText, index)
    ) {
      const end = lineEndAfter(sourceText, index);
      for (let cursor = index; cursor < end; cursor += 1) {
        blank(cursor);
      }
      index = end;
      continue;
    }

    if (current === "\"" || current === "'") {
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

  return delimiters.length === 0
    ? { valid: true, text: text.join("") }
    : { valid: false, text: "" };
}

function directZigFunction(line: string, start: number): ZigDeclaration | null {
  const match = /^(?:(?:pub|inline|noinline|extern|export)\s+)*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u.exec(
    line
  );
  const name = match?.[1];
  if (match === null || name === undefined) {
    return null;
  }
  const header = match[0];
  return {
    name,
    kind: "function",
    start,
    end: start + line.length,
    isExported: /\b(?:pub|export)\b/u.test(header)
  };
}

function directZigContainer(line: string, start: number): ZigDeclaration | null {
  const match = /^(?:pub\s+)?(?:const|var)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[^=]+)?\s*=\s*(?:(?:extern|packed)\s+)?(?:struct|enum|union|opaque)\b/u.exec(
    line
  );
  const name = match?.[1];
  if (match === null || name === undefined) {
    return null;
  }
  const header = match[0];
  return {
    name,
    kind: "class",
    start,
    end: start + line.length,
    isExported: /^pub\s+/u.test(header)
  };
}

function staticZigDeclarations(sourceText: string): readonly ZigDeclaration[] {
  const sanitized = sanitizeZig(sourceText);
  if (!sanitized.valid) {
    return [];
  }

  const declarations: ZigDeclaration[] = [];
  let braceDepth = 0;
  let lineStart = 0;

  while (lineStart <= sanitized.text.length) {
    const lineEnd = lineEndAfter(sanitized.text, lineStart);
    const line = sanitized.text.slice(lineStart, lineEnd);
    const leadingWhitespace = /^\s*/u.exec(line)?.[0].length ?? 0;
    const content = line.slice(leadingWhitespace);

    if (braceDepth === 0) {
      const declarationStart = lineStart + leadingWhitespace;
      const declaration =
        directZigFunction(content, declarationStart) ?? directZigContainer(content, declarationStart);
      if (declaration !== null) {
        declarations.push(declaration);
      }
    }

    for (const character of line) {
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
      }
    }

    if (lineEnd >= sanitized.text.length) {
      break;
    }
    lineStart = lineEnd + (sanitized.text[lineEnd] === "\r" && sanitized.text[lineEnd + 1] === "\n" ? 2 : 1);
  }

  return declarations;
}

/**
 * The exact Zig edge is intentionally limited to a two-function source where
 * the caller's entire body is one bare, zero-argument top-level call and the
 * target is an empty zero-argument function. This excludes imports,
 * usingnamespace, local values, comptime construction, and member calls.
 */
function staticZigDirectCalls(sourceText: string): readonly ZigDirectCall[] {
  const sanitized = sanitizeZig(sourceText);
  if (!sanitized.valid) {
    return [];
  }
  const lines: Array<{ readonly text: string; readonly start: number }> = [];
  let lineStart = 0;
  while (lineStart <= sanitized.text.length) {
    const lineEnd = lineEndAfter(sanitized.text, lineStart);
    const text = sanitized.text.slice(lineStart, lineEnd);
    if (text.trim().length > 0) {
      lines.push({ text, start: lineStart });
    }
    if (lineEnd >= sanitized.text.length) {
      break;
    }
    lineStart =
      lineEnd +
      (sanitized.text[lineEnd] === "\r" && sanitized.text[lineEnd + 1] === "\n" ? 2 : 1);
  }
  if (lines.length !== 2) {
    return [];
  }
  const callerLine = lines[0];
  const targetLine = lines[1];
  if (callerLine === undefined || targetLine === undefined) {
    return [];
  }
  const callMatch = /^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s+void\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*;\s*\}\s*$/u.exec(
    callerLine.text
  );
  const callerName = callMatch?.[1];
  const name = callMatch?.[2];
  if (callMatch === null || callerName === undefined || name === undefined) {
    return [];
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (
    !new RegExp(
      "^\\s*fn\\s+" + escapedName + "\\s*\\(\\s*\\)\\s+void\\s*\\{\\s*\\}\\s*$",
      "u"
    ).test(targetLine.text)
  ) {
    return [];
  }
  const offset = callerLine.text.lastIndexOf(name);
  return offset < 0
    ? []
    : [
        {
          callerName,
          name,
          start: callerLine.start + offset,
          end: callerLine.start + offset + name.length
        }
      ];
}

/**
 * Extracts source-proven Zig file, top-level container, and function symbols.
 * It deliberately excludes imports, calls, test blocks, anonymous containers,
 * nested container methods, and dynamic/comptime declaration construction.
 */
export function extractZigFileFacts(input: ZigExtractFileFactsInput): ArtifactFacts {
  const declarations = staticZigDeclarations(input.sourceText);
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
    const qualifiedName = fileNode.qualifiedName + "." + declaration.name;
    const identity = qualifiedName + "\u0000" + declaration.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
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
      range,
      isExported: declaration.isExported,
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
        ruleId:
          declaration.kind === "function"
            ? "syntax.zig.top-level-function"
            : "syntax.zig.top-level-container",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  for (const call of staticZigDirectCalls(input.sourceText)) {
    const callers = symbols.filter(
      (symbol) => symbol.kind === "function" && symbol.name === call.callerName
    );
    const candidates = symbols.filter(
      (symbol) => symbol.kind === "function" && symbol.name === call.name
    );
    const caller = callers.length === 1 ? callers[0] : undefined;
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (caller === undefined || target === undefined) {
      continue;
    }
    const range = rangeFor(lineStarts, call.start, call.end);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: call.name
      }),
      sourceId: caller.id,
      targetId: target.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.name,
      evidence: {
        ruleId: "syntax.zig.same-file.unique-zero-argument-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [target.id]
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

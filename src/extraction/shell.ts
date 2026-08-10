import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ShellExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "shell";
}

interface ShellLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface StaticShellFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticShellFunctionExport {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SanitizedShellSource {
  readonly valid: boolean;
  readonly text: string;
}

const SHELL_IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";
const POSIX_FUNCTION_HEADER = new RegExp(
  `^(${SHELL_IDENTIFIER})[ \\t]*\\([ \\t]*\\)[ \\t]*\\{[ \\t]*$`,
  "u"
);
const BASH_FUNCTION_HEADER = new RegExp(
  `^function[ \\t]+(${SHELL_IDENTIFIER})(?:[ \\t]*\\([ \\t]*\\))?[ \\t]*\\{[ \\t]*$`,
  "u"
);
const OPENING_CONTROL = /^(?:if|for|while|until|case|select)(?:[ \t;]|$)/u;
const CLOSING_CONTROL = /^(?:fi|done|esac)(?:[ \t;]|$)/u;

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

function shellLines(sourceText: string, sanitizedText: string): readonly ShellLine[] {
  const starts = lineStartsFor(sourceText);
  return starts.map((start, index) => {
    const nextStart = starts[index + 1] ?? sourceText.length;
    let end = nextStart;
    while (end > start && (sourceText[end - 1] === "\r" || sourceText[end - 1] === "\n")) {
      end -= 1;
    }
    return { start, end, text: sanitizedText.slice(start, end) };
  });
}

function isShellCommentStart(sourceText: string, index: number): boolean {
  const previous = sourceText[index - 1];
  return previous === undefined || /[\t \r\n;]/u.test(previous);
}

/**
 * Blanks strings, comments, escapes, and parameter expansions while preserving
 * offsets and line breaks. Here-documents deliberately make the first Shell
 * slice fail closed: their terminator grammar is runtime-sensitive enough to
 * make simple lexical brace matching unsafe.
 */
function sanitizeShellSource(sourceText: string): SanitizedShellSource {
  const text = sourceText.split("");
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanQuoted(quote: "'" | '"' | "`"): boolean {
    blank(index);
    index += 1;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === undefined) {
        break;
      }
      blank(index);
      if (current === "\\" && quote !== "'") {
        index += 1;
        if (index >= sourceText.length) {
          return false;
        }
        blank(index);
        index += 1;
        continue;
      }
      index += 1;
      if (current === quote) {
        return true;
      }
    }
    return false;
  }

  function scanParameterExpansion(): boolean {
    let depth = 0;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === undefined) {
        break;
      }
      blank(index);
      if (current === "\\") {
        index += 1;
        if (index >= sourceText.length) {
          return false;
        }
        blank(index);
        index += 1;
        continue;
      }
      if (current === "{") {
        depth += 1;
      } else if (current === "}") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          return true;
        }
      }
      index += 1;
    }
    return false;
  }

  while (index < sourceText.length) {
    const current = sourceText[index];
    const next = sourceText[index + 1];
    if (current === undefined) {
      break;
    }
    if (current === "<" && next === "<") {
      return { valid: false, text: "" };
    }
    if (current === "#" && isShellCommentStart(sourceText, index)) {
      while (index < sourceText.length) {
        const commentCharacter = sourceText[index];
        if (commentCharacter === "\r" || commentCharacter === "\n") {
          break;
        }
        blank(index);
        index += 1;
      }
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      if (!scanQuoted(current)) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (current === "$" && next === "{") {
      if (!scanParameterExpansion()) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (current === "\\") {
      blank(index);
      index += 1;
      if (index >= sourceText.length) {
        return { valid: false, text: "" };
      }
      blank(index);
      index += 1;
      continue;
    }
    index += 1;
  }

  return { valid: true, text: text.join("") };
}

function directShellFunctionHeader(line: ShellLine): { readonly name: string; readonly brace: number } | null {
  const posix = POSIX_FUNCTION_HEADER.exec(line.text);
  const bash = BASH_FUNCTION_HEADER.exec(line.text);
  const name = posix?.[1] ?? bash?.[1];
  if (name === undefined) {
    return null;
  }
  const brace = line.text.lastIndexOf("{");
  return brace < 0 ? null : { name, brace: line.start + brace };
}

function matchingBrace(text: string, openingBrace: number): number | null {
  let depth = 0;
  for (let index = openingBrace; index < text.length; index += 1) {
    const character = text[index];
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

function braceDelta(text: string): number {
  let delta = 0;
  for (const character of text) {
    if (character === "{") {
      delta += 1;
    } else if (character === "}") {
      delta -= 1;
    }
  }
  return delta;
}

/**
 * Finds complete function declarations that begin at column one of the outer
 * script level. Control-flow and brace groups never donate nested functions to
 * this declaration-only slice.
 */
function directShellFunctions(sourceText: string): readonly StaticShellFunction[] {
  const sanitized = sanitizeShellSource(sourceText);
  if (!sanitized.valid) {
    return [];
  }
  const lines = shellLines(sourceText, sanitized.text);
  const functions: StaticShellFunction[] = [];
  let controlDepth = 0;
  let genericBraceDepth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    if (controlDepth === 0 && genericBraceDepth === 0) {
      const header = directShellFunctionHeader(line);
      if (header !== null) {
        const closingBrace = matchingBrace(sanitized.text, header.brace);
        if (closingBrace === null) {
          return [];
        }
        functions.push({ name: header.name, start: line.start, end: closingBrace + 1 });
        while (
          lineIndex + 1 < lines.length &&
          (lines[lineIndex + 1]?.start ?? sourceText.length) <= closingBrace
        ) {
          lineIndex += 1;
        }
        continue;
      }
    }

    const content = line.text.trimStart();
    if (CLOSING_CONTROL.test(content)) {
      controlDepth -= 1;
    }
    if (controlDepth < 0) {
      return [];
    }
    if (OPENING_CONTROL.test(content)) {
      controlDepth += 1;
    }
    genericBraceDepth += braceDelta(line.text);
    if (genericBraceDepth < 0) {
      return [];
    }
  }

  return controlDepth === 0 && genericBraceDepth === 0 ? functions : [];
}

const DIRECT_FUNCTION_EXPORT = new RegExp(
  `^export[ \\t]+-f[ \\t]+(${SHELL_IDENTIFIER})[ \\t]*$`,
  "u"
);

/**
 * Recognizes only a complete top-level Bash `export -f name` statement after
 * the referenced direct function declaration. Any other executable top-level
 * statement makes this relationship slice fail closed.
 */
function directShellFunctionExports(
  sourceText: string,
  functions: readonly StaticShellFunction[]
): readonly StaticShellFunctionExport[] {
  if (functions.some((fn) => fn.name === "export")) {
    return [];
  }
  const sanitized = sanitizeShellSource(sourceText);
  if (!sanitized.valid) {
    return [];
  }
  const exports: StaticShellFunctionExport[] = [];
  for (const line of shellLines(sourceText, sanitized.text)) {
    const uncovered = line.text.split("");
    for (const fn of functions) {
      const overlapStart = Math.max(line.start, fn.start);
      const overlapEnd = Math.min(line.end, fn.end);
      for (let index = overlapStart; index < overlapEnd; index += 1) {
        uncovered[index - line.start] = " ";
      }
    }
    const visible = uncovered.join("");
    const content = visible.trim();
    if (content.length === 0) {
      continue;
    }
    const match = DIRECT_FUNCTION_EXPORT.exec(content);
    const name = match?.[1];
    if (name === undefined) {
      return [];
    }
    const nameOffset = visible.indexOf(name);
    if (nameOffset < 0) {
      return [];
    }
    const candidates = functions.filter((fn) => fn.name === name && fn.end <= line.start);
    if (candidates.length !== 1) {
      return [];
    }
    exports.push({
      name,
      start: line.start + nameOffset,
      end: line.start + nameOffset + name.length
    });
  }
  return exports;
}

/**
 * Extracts a deliberately narrow Shell/Bash declaration surface. It retains
 * only complete, direct top-level POSIX `name() { ... }` or Bash
 * `function name { ... }` declarations. A canonical top-level `export -f`
 * statement may reference one unique prior declaration; calls, sources, and
 * broader runtime shell semantics stay out of scope.
 */
export function extractShellFileFacts(input: ShellExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileRange = rangeFor(lineStarts, 0, input.sourceText.length);
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
    range: fileRange,
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const functions = directShellFunctions(input.sourceText);
  const functionSymbolsByName = new Map<string, SymbolNode[]>();

  for (const functionFact of functions) {
    const qualifiedName = `${input.filePath}#${functionFact.name}`;
    const identity = `${qualifiedName}\u0000function`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, functionFact.start, functionFact.end);
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
    functionSymbolsByName.set(functionFact.name, [
      ...(functionSymbolsByName.get(functionFact.name) ?? []),
      symbol
    ]);
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

  for (const exported of directShellFunctionExports(input.sourceText, functions)) {
    const candidates = functionSymbolsByName.get(exported.name) ?? [];
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (target === undefined) {
      continue;
    }
    const range = rangeFor(lineStarts, exported.start, exported.end);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: target.id,
        kind: "references",
        line: range.start.line,
        column: range.start.column,
        referenceName: exported.name
      }),
      sourceId: fileNode.id,
      targetId: target.id,
      kind: "references",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: exported.name,
      evidence: {
        ruleId: "syntax.shell.direct-top-level-export-function-reference",
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

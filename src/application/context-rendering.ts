import type { ArtifactLanguage, SourcePosition, SourceRange } from "../domain/types.js";

export const INVESTIGATION_SOURCE_RENDER_POLICY = "evidence-slice-v1" as const;

export const INVESTIGATE_SOURCE_RENDER_MODES = [
  "adaptive",
  "prefix",
  "focused",
  "signature"
] as const;

export type InvestigateSourceRenderMode = (typeof INVESTIGATE_SOURCE_RENDER_MODES)[number];

export type InvestigationSourceRenderMode = "full" | "focused" | "signature" | "prefix";

export interface InvestigationSourceRenderReceipt {
  readonly policy: typeof INVESTIGATION_SOURCE_RENDER_POLICY;
  readonly requestedMode: InvestigateSourceRenderMode;
  readonly mode: InvestigationSourceRenderMode;
  readonly complete: boolean;
  readonly contiguous: true;
  readonly lineAligned: boolean;
  readonly emittedCharacters: number;
  readonly sourceCharacterOffsets: {
    readonly start: number;
    readonly end: number;
  };
  readonly omittedCharactersBefore: number;
  readonly omittedCharactersAfter: number;
  readonly focus: {
    readonly available: boolean;
    readonly included: boolean;
    readonly fallbackReason: string | null;
  };
  readonly signature: {
    readonly strategy: "brace-header" | "python-header" | null;
    readonly proven: boolean;
    readonly fallbackReason: string | null;
  };
}

export interface InvestigationRenderedSource {
  readonly text: string;
  readonly renderedRange: SourceRange;
  readonly receipt: InvestigationSourceRenderReceipt;
}

export interface RenderInvestigationDeclarationInput {
  readonly sourceText: string;
  readonly allocatedCharacters: number;
  readonly declarationRange: SourceRange;
  readonly lexicalFocusRange: SourceRange | null;
  readonly language: ArtifactLanguage;
  readonly requestedMode: InvestigateSourceRenderMode;
}

interface SourceCoordinates {
  readonly lineStarts: readonly number[];
  readonly lineContentEnds: readonly number[];
}

interface FocusOffsets {
  readonly start: number;
  readonly end: number;
}

interface SignatureBoundary {
  readonly end: number | null;
  readonly strategy: "brace-header" | "python-header" | null;
  readonly fallbackReason: string | null;
}

interface SliceChoice {
  readonly start: number;
  readonly end: number;
  readonly mode: InvestigationSourceRenderMode;
  readonly lineAligned: boolean;
}

const BRACE_SIGNATURE_LANGUAGES = new Set<ArtifactLanguage>([
  "typescript",
  "javascript",
  "arkts",
  "vue",
  "svelte",
  "astro",
  "go",
  "rust",
  "java",
  "groovy",
  "php",
  "c",
  "objc",
  "cpp",
  "csharp",
  "kotlin",
  "swift",
  "dart",
  "scala",
  "solidity",
  "zig"
]);

function isValidPosition(position: SourcePosition): boolean {
  return Number.isInteger(position.line) && position.line > 0 &&
    Number.isInteger(position.column) && position.column > 0;
}

function comparePositions(left: SourcePosition, right: SourcePosition): number {
  return left.line === right.line ? left.column - right.column : left.line - right.line;
}

function validateDeclarationRange(range: SourceRange): void {
  if (
    !isValidPosition(range.start) ||
    !isValidPosition(range.end) ||
    comparePositions(range.start, range.end) > 0
  ) {
    throw new Error("Invalid declaration range");
  }
}

function sourceCoordinates(sourceText: string): SourceCoordinates {
  const lineStarts: number[] = [0];
  const lineContentEnds: number[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "\r") {
      lineContentEnds.push(index);
      if (sourceText[index + 1] === "\n") {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (character === "\n" || character === "\u2028" || character === "\u2029") {
      lineContentEnds.push(index);
      lineStarts.push(index + 1);
    }
  }
  lineContentEnds.push(sourceText.length);
  return { lineStarts, lineContentEnds };
}

function positionToOffset(
  position: SourcePosition,
  declarationRange: SourceRange,
  coordinates: SourceCoordinates
): number | null {
  if (!isValidPosition(position)) {
    return null;
  }
  const relativeLine = position.line - declarationRange.start.line;
  if (relativeLine < 0 || relativeLine >= coordinates.lineStarts.length) {
    return null;
  }
  const baseColumn = relativeLine === 0 ? declarationRange.start.column : 1;
  const relativeColumn = position.column - baseColumn;
  if (relativeColumn < 0) {
    return null;
  }
  const offset = coordinates.lineStarts[relativeLine]! + relativeColumn;
  if (offset > coordinates.lineContentEnds[relativeLine]!) {
    return null;
  }
  return offset;
}

function lineIndexAtOffset(offset: number, lineStarts: readonly number[]): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle]! <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function offsetToPosition(
  offset: number,
  declarationRange: SourceRange,
  coordinates: SourceCoordinates
): SourcePosition {
  const lineIndex = lineIndexAtOffset(offset, coordinates.lineStarts);
  const baseColumn = lineIndex === 0 ? declarationRange.start.column : 1;
  return {
    line: declarationRange.start.line + lineIndex,
    column: baseColumn + offset - coordinates.lineStarts[lineIndex]!
  };
}

function focusOffsets(
  focusRange: SourceRange | null,
  declarationRange: SourceRange,
  coordinates: SourceCoordinates
): FocusOffsets | null {
  if (focusRange === null || comparePositions(focusRange.start, focusRange.end) > 0) {
    return null;
  }
  const start = positionToOffset(focusRange.start, declarationRange, coordinates);
  const end = positionToOffset(focusRange.end, declarationRange, coordinates);
  if (start === null || end === null || end < start) {
    return null;
  }
  return { start, end };
}

function trimBoundary(sourceText: string, boundary: number): number {
  let end = boundary;
  while (end > 0 && /\s/u.test(sourceText[end - 1]!)) {
    end -= 1;
  }
  return end;
}

function braceSignatureBoundary(sourceText: string): number | null {
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let typeBraceDepth = 0;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index]!;
    const next = sourceText[index + 1];
    if (lineComment) {
      if (character === "\n" || character === "\r" || character === "\u2028" || character === "\u2029") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === "{" && parenthesisDepth === 0 && bracketDepth === 0) {
      if (typeBraceDepth > 0) {
        typeBraceDepth += 1;
      } else {
        const header = sourceText.slice(0, trimBoundary(sourceText, index)).trimEnd();
        const lastCloseParenthesis = header.lastIndexOf(")");
        const tail = lastCloseParenthesis === -1
          ? header
          : header.slice(lastCloseParenthesis + 1).trim();
        const safeFunctionTail =
          lastCloseParenthesis !== -1 &&
          (tail === "" || tail === "=>" || (!/[{}]/u.test(tail) && !/[=:,<>|&?]$/u.test(tail)));
        const safeDeclarationHeader =
          lastCloseParenthesis === -1 &&
          /(?:^|\s)(?:class|interface|enum|struct|trait|impl|namespace|module|type)\s+[\p{L}_$]/u.test(header) &&
          !/[=:,<>|&?]$/u.test(header);
        if (safeFunctionTail || safeDeclarationHeader) {
          return trimBoundary(sourceText, index);
        }
        typeBraceDepth = 1;
      }
    } else if (character === "}" && typeBraceDepth > 0) {
      typeBraceDepth -= 1;
    }
  }
  return null;
}

function pythonSignatureBoundary(sourceText: string): number | null {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let comment = false;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index]!;
    if (comment) {
      if (character === "\n" || character === "\r" || character === "\u2028" || character === "\u2029") {
        comment = false;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "#") {
      comment = true;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === "{") {
      braceDepth += 1;
    } else if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (
      character === ":" &&
      parenthesisDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      return index + 1;
    }
  }
  return null;
}

function signatureBoundary(sourceText: string, language: ArtifactLanguage): SignatureBoundary {
  if (language === "python") {
    const end = pythonSignatureBoundary(sourceText);
    return end === null
      ? { end: null, strategy: "python-header", fallbackReason: "signature-boundary-not-found" }
      : { end, strategy: "python-header", fallbackReason: null };
  }
  if (BRACE_SIGNATURE_LANGUAGES.has(language)) {
    const end = braceSignatureBoundary(sourceText);
    return end === null
      ? { end: null, strategy: "brace-header", fallbackReason: "signature-boundary-not-found" }
      : { end, strategy: "brace-header", fallbackReason: null };
  }
  return {
    end: null,
    strategy: null,
    fallbackReason: "language-signature-boundary-unsupported"
  };
}

function focusedSlice(
  sourceText: string,
  allocation: number,
  focus: FocusOffsets,
  coordinates: SourceCoordinates
): SliceChoice {
  const focusEndForLine = Math.max(focus.start, focus.end - 1);
  const firstLine = lineIndexAtOffset(focus.start, coordinates.lineStarts);
  const lastLine = lineIndexAtOffset(focusEndForLine, coordinates.lineStarts);
  let start = coordinates.lineStarts[firstLine]!;
  let end = coordinates.lineStarts[lastLine + 1] ?? sourceText.length;
  if (end - start <= allocation) {
    let previousLine = firstLine - 1;
    let nextLine = lastLine + 1;
    while (previousLine >= 0 || nextLine < coordinates.lineStarts.length) {
      let changed = false;
      if (previousLine >= 0) {
        const candidate = coordinates.lineStarts[previousLine]!;
        if (end - candidate <= allocation) {
          start = candidate;
          previousLine -= 1;
          changed = true;
        } else {
          previousLine = -1;
        }
      }
      if (nextLine < coordinates.lineStarts.length) {
        const candidate = coordinates.lineStarts[nextLine + 1] ?? sourceText.length;
        if (candidate - start <= allocation) {
          end = candidate;
          nextLine += 1;
          changed = true;
        } else {
          nextLine = coordinates.lineStarts.length;
        }
      }
      if (!changed) {
        break;
      }
    }
    return { start, end, mode: "focused", lineAligned: true };
  }

  const focusLength = focus.end - focus.start;
  if (focusLength <= allocation) {
    const remaining = allocation - focusLength;
    start = Math.max(0, focus.start - Math.floor(remaining / 2));
    end = Math.min(sourceText.length, start + allocation);
    start = Math.max(0, end - allocation);
  } else {
    start = focus.start;
    end = Math.min(sourceText.length, start + allocation);
  }
  return { start, end, mode: "focused", lineAligned: false };
}

function prefixSlice(sourceText: string, allocation: number): SliceChoice {
  return {
    start: 0,
    end: Math.min(sourceText.length, allocation),
    mode: "prefix",
    lineAligned: false
  };
}

export function renderInvestigationDeclaration(
  input: RenderInvestigationDeclarationInput
): InvestigationRenderedSource {
  if (!Number.isSafeInteger(input.allocatedCharacters) || input.allocatedCharacters < 0) {
    throw new Error("Invalid allocated characters");
  }
  validateDeclarationRange(input.declarationRange);
  if (!INVESTIGATE_SOURCE_RENDER_MODES.includes(input.requestedMode)) {
    throw new Error(`Invalid investigation source render mode: ${String(input.requestedMode)}`);
  }

  const coordinates = sourceCoordinates(input.sourceText);
  const focus = focusOffsets(input.lexicalFocusRange, input.declarationRange, coordinates);
  const signature = signatureBoundary(input.sourceText, input.language);
  let choice: SliceChoice;

  if (
    input.requestedMode !== "signature" &&
    input.sourceText.length <= input.allocatedCharacters
  ) {
    choice = {
      start: 0,
      end: input.sourceText.length,
      mode: "full",
      lineAligned: true
    };
  } else if (input.requestedMode === "signature") {
    choice = signature.end !== null && signature.end <= input.allocatedCharacters
      ? { start: 0, end: signature.end, mode: "signature", lineAligned: false }
      : prefixSlice(input.sourceText, input.allocatedCharacters);
  } else if (
    (input.requestedMode === "adaptive" || input.requestedMode === "focused") &&
    focus !== null
  ) {
    choice = focusedSlice(input.sourceText, input.allocatedCharacters, focus, coordinates);
  } else if (
    input.requestedMode === "adaptive" &&
    signature.end !== null &&
    signature.end <= input.allocatedCharacters
  ) {
    choice = { start: 0, end: signature.end, mode: "signature", lineAligned: false };
  } else {
    choice = prefixSlice(input.sourceText, input.allocatedCharacters);
  }

  const text = input.sourceText.slice(choice.start, choice.end);
  const focusIncluded = focus !== null && choice.start <= focus.start && choice.end >= focus.end;
  const signatureFallbackReason = signature.fallbackReason ?? (
    signature.end !== null && signature.end > input.allocatedCharacters
      ? "signature-exceeds-allocation"
      : null
  );
  return {
    text,
    renderedRange: {
      start: offsetToPosition(choice.start, input.declarationRange, coordinates),
      end: offsetToPosition(choice.end, input.declarationRange, coordinates)
    },
    receipt: {
      policy: INVESTIGATION_SOURCE_RENDER_POLICY,
      requestedMode: input.requestedMode,
      mode: choice.mode,
      complete: choice.start === 0 && choice.end === input.sourceText.length,
      contiguous: true,
      lineAligned: choice.lineAligned,
      emittedCharacters: text.length,
      sourceCharacterOffsets: { start: choice.start, end: choice.end },
      omittedCharactersBefore: choice.start,
      omittedCharactersAfter: input.sourceText.length - choice.end,
      focus: {
        available: focus !== null,
        included: focusIncluded,
        fallbackReason: focus === null && input.lexicalFocusRange !== null
          ? "focus-outside-bounded-declaration"
          : null
      },
      signature: {
        strategy: signature.strategy,
        proven: signature.end !== null,
        fallbackReason: signatureFallbackReason
      }
    }
  };
}

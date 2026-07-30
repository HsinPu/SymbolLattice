import {
  createSymbolId,
  type ArtifactFacts,
  type BladeTemplateReferenceFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface BladeExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "blade";
  readonly sourceText: string;
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
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      upper = middle - 1;
      continue;
    }
    if (offset >= next) {
      lower = middle + 1;
      continue;
    }
    return { line: middle + 1, column: offset - start };
  }
  const finalIndex = Math.max(0, lineStarts.length - 1);
  return {
    line: finalIndex + 1,
    column: Math.max(0, offset - (lineStarts[finalIndex] ?? 0))
  };
}

function rangeForSpan(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

function blankRange(characters: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== "\r" && characters[index] !== "\n") {
      characters[index] = " ";
    }
  }
}

function maskHtmlComments(sourceText: string, characters: string[]): boolean {
  let cursor = 0;
  while (cursor < sourceText.length) {
    const start = sourceText.indexOf("<!--", cursor);
    if (start === -1) {
      return true;
    }
    const end = sourceText.indexOf("-->", start + 4);
    if (end === -1) {
      return false;
    }
    blankRange(characters, start, end + 3);
    cursor = end + 3;
  }
  return true;
}

function maskBladeComments(characters: string[]): boolean {
  const visibleSource = characters.join("");
  let cursor = 0;
  while (cursor < visibleSource.length) {
    const start = visibleSource.indexOf("{{--", cursor);
    if (start === -1) {
      return true;
    }
    const end = visibleSource.indexOf("--}}", start + 4);
    if (end === -1) {
      return false;
    }
    blankRange(characters, start, end + 4);
    cursor = end + 4;
  }
  return true;
}

function maskPhpBlocks(characters: string[]): boolean {
  const visibleSource = characters.join("");
  let cursor = 0;
  while (cursor < visibleSource.length) {
    const start = visibleSource.indexOf("<?", cursor);
    if (start === -1) {
      return true;
    }
    const end = visibleSource.indexOf("?>", start + 2);
    if (end === -1) {
      return false;
    }
    blankRange(characters, start, end + 2);
    cursor = end + 2;
  }
  return true;
}

function maskBladeDirectiveBlocks(
  characters: string[],
  openingPattern: RegExp,
  closingPattern: RegExp
): boolean {
  const visibleSource = characters.join("");
  let cursor = 0;
  while (cursor < visibleSource.length) {
    openingPattern.lastIndex = cursor;
    const opening = openingPattern.exec(visibleSource);
    if (opening === null) {
      return true;
    }
    closingPattern.lastIndex = opening.index + opening[0].length;
    const closing = closingPattern.exec(visibleSource);
    if (closing === null) {
      return false;
    }
    blankRange(characters, opening.index, closing.index + closing[0].length);
    cursor = closing.index + closing[0].length;
  }
  return true;
}

/**
 * Keeps offsets stable while excluding comments and literal PHP/verbatim
 * blocks. Unterminated protected blocks make this small evidence pass fail
 * closed instead of treating their contents as executable Blade directives.
 */
function maskedBladeSource(sourceText: string): string | null {
  const characters = sourceText.split("");
  if (!maskHtmlComments(sourceText, characters)) {
    return null;
  }
  if (!maskBladeComments(characters)) {
    return null;
  }
  if (!maskPhpBlocks(characters)) {
    return null;
  }
  if (
    !maskBladeDirectiveBlocks(
      characters,
      /(?<!@)@verbatim\b/gu,
      /(?<!@)@endverbatim\b/gu
    )
  ) {
    return null;
  }
  if (
    !maskBladeDirectiveBlocks(characters, /(?<!@)@php\b(?!\s*\()/gu, /(?<!@)@endphp\b/gu)
  ) {
    return null;
  }
  return characters.join("");
}

function closingParenthesisAt(sourceText: string, cursor: number): number | null {
  let depth = 1;
  let quote = "";
  while (cursor < sourceText.length) {
    const character = sourceText.charAt(cursor);
    if (quote !== "") {
      if (character === "\\") {
        return null;
      }
      if (character === quote) {
        quote = "";
      }
      cursor += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      cursor += 1;
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
    cursor += 1;
  }
  return null;
}

interface LiteralViewArgument {
  readonly name: string;
  readonly tail: string;
}

function directLiteralViewArgument(value: string): LiteralViewArgument | null {
  let cursor = 0;
  while (/\s/u.test(value.charAt(cursor))) {
    cursor += 1;
  }
  const quote = value.charAt(cursor);
  if (quote !== "'" && quote !== '"') {
    return null;
  }
  const nameStart = cursor + 1;
  cursor += 1;
  while (cursor < value.length) {
    const character = value.charAt(cursor);
    if (character === "\\") {
      return null;
    }
    if (character === quote) {
      return {
        name: value.slice(nameStart, cursor),
        tail: value.slice(cursor + 1)
      };
    }
    cursor += 1;
  }
  return null;
}

function isLiteralViewName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)*$/u.test(value);
}

function targetFilePath(name: string): string {
  return "resources/views/" + name.split(".").join("/") + ".blade.php";
}

function hasAdditionalDirectiveArguments(tail: string): boolean {
  const normalized = tail.trim();
  return normalized.startsWith(",") && normalized.slice(1).trim().length > 0;
}

function hasRequiredEachArguments(tail: string): boolean {
  const normalized = tail.trim();
  if (!normalized.startsWith(",")) {
    return false;
  }
  let depth = 0;
  let quote = "";
  for (let index = 1; index < normalized.length; index += 1) {
    const character = normalized.charAt(index);
    if (quote !== "") {
      if (character === "\\") {
        return false;
      }
      if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") {
      depth += 1;
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      if (depth === 0) {
        return false;
      }
      depth -= 1;
      continue;
    }
    if (character === "," && depth === 0) {
      return (
        normalized.slice(1, index).trim().length > 0 &&
        normalized.slice(index + 1).trim().length > 0
      );
    }
  }
  return false;
}

function supportedDirectiveTail(kind: BladeTemplateReferenceFact["kind"], tail: string): boolean {
  if (kind === "extends") {
    return tail.trim() === "";
  }
  if (kind === "include" || kind === "component") {
    return tail.trim() === "" || hasAdditionalDirectiveArguments(tail);
  }
  return hasRequiredEachArguments(tail);
}

/**
 * Extracts a deliberately narrow Laravel Blade relation surface. A complete
 * direct literal view name is projected later only through `resources/views`.
 */
export function extractBladeFileFacts(input: BladeExtractFileFactsInput): ArtifactFacts {
  const capability = frameworkCapability("laravel-blade");
  if (!capability.languages.includes(input.language)) {
    throw new Error("Blade extraction was invoked for an unsupported source language.");
  }

  const lineStarts = lineStartsFor(input.sourceText);
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const templateReferences: BladeTemplateReferenceFact[] = [];
  const facts = (): ArtifactFacts => ({
    symbols: [fileNode],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    bladeFacts: { templateReferences }
  });
  const masked = maskedBladeSource(input.sourceText);
  if (masked === null) {
    return facts();
  }

  const directivePattern = /(?<!@)@(extends|include|component|each)\s*\(/gu;
  let directive: RegExpExecArray | null;
  while ((directive = directivePattern.exec(masked)) !== null) {
    const kind = directive[1] as BladeTemplateReferenceFact["kind"] | undefined;
    if (kind === undefined) {
      continue;
    }
    const openingParenthesis = directive.index + directive[0].lastIndexOf("(");
    const closingParenthesis = closingParenthesisAt(masked, openingParenthesis + 1);
    if (closingParenthesis === null) {
      return {
        ...facts(),
        bladeFacts: { templateReferences: [] }
      };
    }
    const literal = directLiteralViewArgument(
      masked.slice(openingParenthesis + 1, closingParenthesis)
    );
    if (
      literal !== null &&
      isLiteralViewName(literal.name) &&
      supportedDirectiveTail(kind, literal.tail)
    ) {
      const target = targetFilePath(literal.name);
      templateReferences.push({
        sourceId: fileNode.id,
        filePath: input.filePath,
        kind,
        targetFilePath: target,
        referenceName: kind + " " + target,
        range: rangeForSpan(lineStarts, directive.index, closingParenthesis + 1)
      });
    }
    directivePattern.lastIndex = closingParenthesis + 1;
  }

  return facts();
}

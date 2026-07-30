import {
  createSymbolId,
  type ArtifactFacts,
  type SourcePosition,
  type SourceRange,
  type SymbolNode,
  type TwigTemplateReferenceFact
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface TwigExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "twig";
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

function maskTwigComments(characters: string[]): boolean {
  const visibleSource = characters.join("");
  let cursor = 0;
  while (cursor < visibleSource.length) {
    const start = visibleSource.indexOf("{#", cursor);
    if (start === -1) {
      return true;
    }
    const end = visibleSource.indexOf("#}", start + 2);
    if (end === -1) {
      return false;
    }
    blankRange(characters, start, end + 2);
    cursor = end + 2;
  }
  return true;
}

function maskTwigVerbatimBlocks(characters: string[]): boolean {
  const visibleSource = characters.join("");
  const openingPattern = /\{%-?\s*verbatim\s*-?%\}/gu;
  let opening: RegExpExecArray | null;
  while ((opening = openingPattern.exec(visibleSource)) !== null) {
    const closingPattern = /\{%-?\s*endverbatim\s*-?%\}/gu;
    closingPattern.lastIndex = openingPattern.lastIndex;
    const closing = closingPattern.exec(visibleSource);
    if (closing === null) {
      return false;
    }
    blankRange(characters, opening.index, closing.index + closing[0].length);
    openingPattern.lastIndex = closing.index + closing[0].length;
  }
  return true;
}

/**
 * Keeps offsets stable while excluding HTML/Twig comments and literal
 * `verbatim` blocks. Unterminated comments, verbatim blocks, or Twig tags
 * make this small evidence pass fail closed.
 */
function maskedTwigSource(sourceText: string): string | null {
  const characters = sourceText.split("");
  if (!maskHtmlComments(sourceText, characters)) {
    return null;
  }
  if (!maskTwigComments(characters)) {
    return null;
  }
  if (!maskTwigVerbatimBlocks(characters)) {
    return null;
  }
  const masked = characters.join("");
  let cursor = 0;
  while (cursor < masked.length) {
    const start = masked.indexOf("{%", cursor);
    if (start === -1) {
      return masked;
    }
    const end = masked.indexOf("%}", start + 2);
    const nested = masked.indexOf("{%", start + 2);
    if (end === -1 || (nested !== -1 && nested < end)) {
      return null;
    }
    cursor = end + 2;
  }
  return masked;
}

function isLiteralTemplateName(value: string): boolean {
  return (
    value.endsWith(".twig") &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/u.test(value)
  );
}

function targetFilePath(name: string): string {
  return name.startsWith("templates/") ? name : "templates/" + name;
}

function supportedTagTail(
  kind: TwigTemplateReferenceFact["kind"],
  tail: string
): boolean {
  const normalized = tail.trim().replace(/-$/u, "").trim();
  if (kind === "extends") {
    return normalized === "";
  }
  if (kind === "include" || kind === "embed") {
    return normalized === "" || normalized === "only" || normalized === "ignore missing";
  }
  if (kind === "import") {
    return /^as\s+[A-Za-z_][A-Za-z0-9_]*$/u.test(normalized);
  }
  return /^import\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?)*$/u.test(
    normalized
  );
}

/**
 * Extracts a deliberately narrow Twig relation surface. The template name and
 * every supporting tag shape must be complete and literal. A logical name is
 * later resolved only against the indexed project-local `templates/` root.
 */
export function extractTwigFileFacts(input: TwigExtractFileFactsInput): ArtifactFacts {
  const capability = frameworkCapability("twig");
  if (!capability.languages.includes(input.language)) {
    throw new Error("Twig extraction was invoked for an unsupported source language.");
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
  const templateReferences: TwigTemplateReferenceFact[] = [];
  const facts = (): ArtifactFacts => ({
    symbols: [fileNode],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    twigFacts: { templateReferences }
  });
  const masked = maskedTwigSource(input.sourceText);
  if (masked === null) {
    return facts();
  }

  const tagPattern =
    /\{%-?\s*(extends|include|embed|import|from)\s+(["'])([A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*)\2(?=\s|-?%\})/gu;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(masked)) !== null) {
    const kind = tag[1] as TwigTemplateReferenceFact["kind"] | undefined;
    const name = tag[3];
    if (kind === undefined || name === undefined || !isLiteralTemplateName(name)) {
      continue;
    }
    const tagEnd = masked.indexOf("%}", tag.index + tag[0].length);
    const nested = masked.indexOf("{%", tag.index + 2);
    if (tagEnd === -1 || (nested !== -1 && nested < tagEnd)) {
      return {
        ...facts(),
        twigFacts: { templateReferences: [] }
      };
    }
    const tail = masked.slice(tag.index + tag[0].length, tagEnd);
    if (!supportedTagTail(kind, tail)) {
      tagPattern.lastIndex = tagEnd + 2;
      continue;
    }
    const target = targetFilePath(name);
    templateReferences.push({
      sourceId: fileNode.id,
      filePath: input.filePath,
      kind,
      targetFilePath: target,
      referenceName: kind + " " + target,
      range: rangeForSpan(lineStarts, tag.index, tagEnd + 2)
    });
    tagPattern.lastIndex = tagEnd + 2;
  }

  return facts();
}

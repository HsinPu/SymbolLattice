import { posix } from "node:path";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type MarkdownLinkFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export const MAXIMUM_MARKDOWN_SOURCE_LENGTH = 5_000_000;
export const MAXIMUM_MARKDOWN_RESOURCES = 20_000;
export const MAXIMUM_MARKDOWN_HEADING_LENGTH = 2_048;
export const MAXIMUM_MARKDOWN_DESTINATION_LENGTH = 4_096;

export interface MarkdownExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "markdown";
}

interface MarkdownLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly number: number;
}

interface HeadingRecord {
  readonly name: string;
  readonly level: number;
  readonly range: SourceRange;
  readonly line: number;
  symbol?: SymbolNode;
  path?: string;
}

function linesFor(sourceText: string): readonly MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = 0;
  let number = 0;
  while (start < sourceText.length) {
    let end = sourceText.indexOf("\n", start);
    if (end === -1) end = sourceText.length;
    const contentEnd = end > start && sourceText[end - 1] === "\r" ? end - 1 : end;
    lines.push({ text: sourceText.slice(start, contentEnd), start, end: contentEnd, number });
    start = end === sourceText.length ? sourceText.length : end + 1;
    number += 1;
  }
  if (sourceText.length === 0 || /(?:\r?\n)$/u.test(sourceText)) {
    lines.push({ text: "", start: sourceText.length, end: sourceText.length, number });
  }
  return lines;
}

function positionFor(lines: readonly MarkdownLine[], offset: number): SourcePosition {
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];
    if (line === undefined) break;
    if (offset < line.start) high = middle - 1;
    else if (middle + 1 < lines.length && offset >= (lines[middle + 1]?.start ?? Infinity)) low = middle + 1;
    else return { line: line.number, column: Math.max(0, offset - line.start) };
  }
  const last = lines.at(-1);
  return { line: last?.number ?? 0, column: Math.max(0, offset - (last?.start ?? 0)) };
}

function rangeFor(lines: readonly MarkdownLine[], start: number, end: number): SourceRange {
  return { start: positionFor(lines, start), end: positionFor(lines, end) };
}

function fileSymbol(input: MarkdownExtractFileFactsInput, lines: readonly MarkdownLine[]): SymbolNode {
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
    range: rangeFor(lines, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
}

function fileOnlyFacts(file: SymbolNode): ArtifactFacts {
  return {
    symbols: [file],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    markdownFacts: { links: [] }
  };
}

function opaqueMarkdownLines(lines: readonly MarkdownLine[]): readonly boolean[] {
  const opaque = lines.map(() => false);
  let fence: { readonly marker: "`" | "~"; readonly length: number } | null = null;
  let htmlBlock: "comment" | "raw" | "block" | null = null;
  let rawHtmlTag: string | null = null;
  for (const line of lines) {
    const text = line.text;
    if (fence !== null) {
      opaque[line.number] = true;
      const close = /^ {0,3}(`+|~+)[ \t]*$/u.exec(text);
      if (close !== null && close[1]?.[0] === fence.marker && (close[1]?.length ?? 0) >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (htmlBlock !== null) {
      opaque[line.number] = true;
      if (htmlBlock === "comment" && text.includes("-->")) htmlBlock = null;
      else if (
        htmlBlock === "raw" &&
        rawHtmlTag !== null &&
        new RegExp(`</${rawHtmlTag}\\s*>`, "iu").test(text)
      ) {
        htmlBlock = null;
        rawHtmlTag = null;
      } else if (htmlBlock === "block" && text.trim().length === 0) htmlBlock = null;
      continue;
    }
    if (/^(?: {4}|\t)/u.test(text)) {
      opaque[line.number] = true;
      continue;
    }
    const openingFence = /^ {0,3}(`{3,}|~{3,})/u.exec(text);
    if (openingFence !== null) {
      const markerText = openingFence[1] ?? "";
      fence = { marker: markerText[0] as "`" | "~", length: markerText.length };
      opaque[line.number] = true;
      continue;
    }
    if (/^ {0,3}<!--/u.test(text)) {
      opaque[line.number] = true;
      if (!text.includes("-->")) htmlBlock = "comment";
      continue;
    }
    const raw = /^ {0,3}<(script|pre|style)(?:\s|>|$)/iu.exec(text);
    if (raw !== null) {
      opaque[line.number] = true;
      rawHtmlTag = raw[1]?.toLowerCase() ?? null;
      if (rawHtmlTag !== null && !new RegExp(`</${rawHtmlTag}\\s*>`, "iu").test(text)) {
        htmlBlock = "raw";
      }
      continue;
    }
    if (/^ {0,3}<(?:[A-Za-z][A-Za-z0-9-]*(?:\s|>|\/)|\/[A-Za-z]|!DOCTYPE|\?)/u.test(text)) {
      opaque[line.number] = true;
      if (text.trim().length > 0) htmlBlock = "block";
    }
  }
  return opaque;
}

function headingAt(
  lines: readonly MarkdownLine[],
  opaque: readonly boolean[],
  index: number
): { readonly record: HeadingRecord; readonly consumesNext: boolean } | null {
  const line = lines[index];
  if (line === undefined || opaque[index] === true) return null;
  const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line.text);
  if (atx !== null) {
    const name = (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim();
    if (name.length === 0 || name.length > MAXIMUM_MARKDOWN_HEADING_LENGTH) return null;
    return {
      record: {
        name,
        level: atx[1]?.length ?? 1,
        range: rangeFor(lines, line.start, line.end),
        line: line.number
      },
      consumesNext: false
    };
  }
  const underline = lines[index + 1];
  if (
    line.text.trim().length === 0 ||
    /^(?: {4}|\t| {0,3}(?:>|[-+*]\s|\d+[.)]\s))/u.test(line.text) ||
    underline === undefined ||
    opaque[index + 1] === true
  ) {
    return null;
  }
  const setext = /^ {0,3}(=+|-+)[ \t]*$/u.exec(underline.text);
  const name = line.text.trim();
  if (setext === null || name.length > MAXIMUM_MARKDOWN_HEADING_LENGTH) return null;
  return {
    record: {
      name,
      level: setext[1]?.startsWith("=") === true ? 1 : 2,
      range: rangeFor(lines, line.start, underline.end),
      line: line.number
    },
    consumesNext: true
  };
}

function exceedsHeadingLengthLimit(
  lines: readonly MarkdownLine[],
  opaque: readonly boolean[],
  index: number
): boolean {
  const line = lines[index];
  if (line === undefined || opaque[index] === true) return false;
  const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line.text);
  if (atx !== null) {
    return (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim().length > MAXIMUM_MARKDOWN_HEADING_LENGTH;
  }
  const underline = lines[index + 1];
  return (
    underline !== undefined &&
    opaque[index + 1] !== true &&
    /^ {0,3}(=+|-+)[ \t]*$/u.test(underline.text) &&
    line.text.trim().length > MAXIMUM_MARKDOWN_HEADING_LENGTH
  );
}

function maskInlineCode(text: string): string {
  const characters = text.split("");
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== "`") continue;
    let length = 1;
    while (characters[index + length] === "`") length += 1;
    const marker = "`".repeat(length);
    const remainder = characters.slice(index + length).join("");
    const closeOffset = remainder.indexOf(marker);
    if (closeOffset === -1) {
      index += length - 1;
      continue;
    }
    const close = index + length + closeOffset;
    for (let mask = index; mask < close + length; mask += 1) characters[mask] = " ";
    index = close + length - 1;
  }
  return characters.join("");
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function localTargetPath(filePath: string, destination: string): string | null {
  if (
    destination.length === 0 ||
    destination.length > MAXIMUM_MARKDOWN_DESTINATION_LENGTH ||
    destination.startsWith("#") ||
    destination.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(destination) ||
    /[\\%<>{}$]/u.test(destination)
  ) {
    return null;
  }
  const target = destination.split(/[?#]/u, 1)[0] ?? "";
  if (target.length === 0 || posix.extname(target).length === 0) return null;
  const normalized = posix.normalize(posix.join(posix.dirname(filePath.replaceAll("\\", "/")), target));
  if (normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized)) return null;
  return normalized;
}

/** Extracts bounded Markdown headings and direct project-local inline links. */
export function extractMarkdownFileFacts(input: MarkdownExtractFileFactsInput): ArtifactFacts {
  const lines = linesFor(input.sourceText);
  const file = fileSymbol(input, lines);
  if (input.sourceText.length > MAXIMUM_MARKDOWN_SOURCE_LENGTH) return fileOnlyFacts(file);
  const opaque = opaqueMarkdownLines(lines);
  const headings: HeadingRecord[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (exceedsHeadingLengthLimit(lines, opaque, index)) return fileOnlyFacts(file);
    const candidate = headingAt(lines, opaque, index);
    if (candidate === null) continue;
    headings.push(candidate.record);
    if (candidate.consumesNext) index += 1;
    if (headings.length > MAXIMUM_MARKDOWN_RESOURCES) return fileOnlyFacts(file);
  }

  const symbols: SymbolNode[] = [file];
  const edges: GraphEdge[] = [];
  const stack: HeadingRecord[] = [];
  const ordinals = new Map<string, number>();
  for (const heading of headings) {
    while ((stack.at(-1)?.level ?? 0) >= heading.level) stack.pop();
    const parent = stack.at(-1)?.symbol ?? file;
    const parentPath = stack.at(-1)?.path;
    const ordinalKey = `${parent.id}\u0000${heading.level}\u0000${heading.name}`;
    const declarationOrdinal = ordinals.get(ordinalKey) ?? 0;
    ordinals.set(ordinalKey, declarationOrdinal + 1);
    const segment = `h${heading.level}:${encodeURIComponent(heading.name)}[${declarationOrdinal + 1}]`;
    const path = parentPath === undefined ? segment : `${parentPath}/${segment}`;
    const qualifiedName = `${input.filePath}#markdown-heading:${path}`;
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "resource", declarationOrdinal }),
      name: heading.name,
      qualifiedName,
      kind: "resource",
      filePath: input.filePath,
      range: heading.range,
      isExported: parent.kind === "file",
      declarationOrdinal
    };
    heading.symbol = symbol;
    heading.path = path;
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: heading.range.start.line,
        column: heading.range.start.column,
        referenceName: heading.name
      }),
      sourceId: parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: heading.range,
      resolution: "exact",
      confidence: 1,
      referenceName: heading.name,
      evidence: {
        ruleId: "syntax.markdown.heading-hierarchy",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    stack.push(heading);
  }

  const links: MarkdownLinkFact[] = [];
  const activeHeadings: HeadingRecord[] = [];
  let headingIndex = 0;
  for (const line of lines) {
    while (headings[headingIndex]?.line === line.number) {
      const heading = headings[headingIndex];
      if (heading === undefined) break;
      while ((activeHeadings.at(-1)?.level ?? 0) >= heading.level) activeHeadings.pop();
      activeHeadings.push(heading);
      headingIndex += 1;
    }
    if (opaque[line.number] === true) continue;
    const masked = maskInlineCode(line.text);
    const pattern = /(?<!!)\[([^\[\]\r\n]+)\]\(([^()\s\\%]+)\)/gu;
    for (const match of masked.matchAll(pattern)) {
      const startColumn = match.index;
      if (startColumn === undefined || isEscaped(masked, startColumn)) continue;
      const destination = match[2] ?? "";
      if (destination.length > MAXIMUM_MARKDOWN_DESTINATION_LENGTH) return fileOnlyFacts(file);
      const targetFilePath = localTargetPath(input.filePath, destination);
      if (targetFilePath === null) continue;
      const source = activeHeadings.at(-1)?.symbol ?? file;
      links.push({
        sourceId: source.id,
        filePath: input.filePath,
        targetFilePath,
        referenceName: destination,
        range: rangeFor(lines, line.start + startColumn, line.start + startColumn + match[0].length)
      });
      if (headings.length + links.length > MAXIMUM_MARKDOWN_RESOURCES) return fileOnlyFacts(file);
    }
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    markdownFacts: { links }
  };
}

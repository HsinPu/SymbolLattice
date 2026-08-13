import { createEdgeId, createSymbolId } from "../domain/ids.js";
import type {
  ArtifactFacts,
  ExportBinding,
  GraphEdge,
  LocalBinding,
  PendingReference,
  ReferenceScope,
  RazorFacts,
  SourceRange,
  SymbolNode
} from "../domain/index.js";

export interface RazorExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "razor";
  readonly sourceText: string;
}

interface RazorPageDirective {
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

interface RazorModelDirective {
  readonly modelName: string;
  readonly start: number;
  readonly end: number;
}

interface RazorPostHandlerDirective {
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface RazorHtmlAttribute {
  readonly name: string;
  readonly value: string | null;
  readonly valueStart: number | null;
}

const FILE_SCOPE_ID = "razor:file";

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      high = middle - 1;
      continue;
    }
    if (offset >= next) {
      low = middle + 1;
      continue;
    }
    return { line: middle + 1, column: offset - start };
  }
  const lastIndex = Math.max(0, lineStarts.length - 1);
  return { line: lastIndex + 1, column: Math.max(0, offset - (lineStarts[lastIndex] ?? 0)) };
}

function rangeForSpan(
  lineStarts: readonly number[],
  start: number,
  end: number
): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

/**
 * Literal `@page` directives are a small Razor/Blazor routing surface. The
 * scanner deliberately ignores Razor comment lines and rejects escaped,
 * computed, query, and fragment forms instead of trying to emulate Razor.
 */
function razorStaticPageDirectives(sourceText: string): readonly RazorPageDirective[] {
  const directives: RazorPageDirective[] = [];
  let inComment = false;
  let offset = 0;

  for (const line of sourceText.split(/(?<=\n)/u)) {
    const trimmed = line.trimStart();
    if (inComment) {
      if (trimmed.includes("*@")) {
        inComment = false;
      }
      offset += line.length;
      continue;
    }
    if (trimmed.startsWith("@*")) {
      if (!trimmed.includes("*@")) {
        inComment = true;
      }
      offset += line.length;
      continue;
    }

    const match = /^[\t ]*@page[\t ]+"([^"\\\r\n]*)"[\t ]*(?:\r?\n)?$/u.exec(line);
    const path = match?.[1];
    if (
      match !== null &&
      path !== undefined &&
      path.startsWith("/") &&
      !path.includes("//") &&
      !path.includes("?") &&
      !path.includes("#")
    ) {
      directives.push({
        path,
        start: offset + (match.index ?? 0),
        end: offset + (match.index ?? 0) + match[0].length
      });
    }
    offset += line.length;
  }

  return directives;
}

function conventionalCshtmlRoute(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized.endsWith(".cshtml")) {
    return null;
  }
  const parts = normalized.split("/");
  const pagesIndexes = parts
    .map((part, index) => (part === "Pages" ? index : -1))
    .filter((index) => index !== -1);
  const pagesIndex = pagesIndexes[0];
  if (
    pagesIndexes.length !== 1 ||
    pagesIndex === undefined ||
    pagesIndex === parts.length - 1 ||
    parts.slice(0, pagesIndex).includes("Areas")
  ) {
    return null;
  }
  const pageParts = parts.slice(pagesIndex + 1);
  const fileName = pageParts.at(-1);
  if (fileName === undefined || !/^[A-Za-z0-9_-]+\.cshtml$/u.test(fileName)) {
    return null;
  }
  const segments = [...pageParts.slice(0, -1), fileName.slice(0, -".cshtml".length)];
  if (segments.some((segment) => !/^[A-Za-z0-9_-]+$/u.test(segment))) {
    return null;
  }
  if (segments.at(-1) === "Index") {
    segments.pop();
  }
  return segments.length === 0 ? "/" : "/" + segments.join("/");
}

interface CshtmlLeadingDirectives {
  readonly page: RazorPageDirective | null;
  readonly model: RazorModelDirective | null;
}

function skipCshtmlPrologueTrivia(sourceText: string, start: number): number | null {
  let cursor = start;
  while (cursor < sourceText.length) {
    if (/[\t\n\f\r ]/u.test(sourceText[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    if (sourceText.startsWith("@*", cursor)) {
      const close = sourceText.indexOf("*@", cursor + 2);
      if (close === -1) return null;
      cursor = close + 2;
      continue;
    }
    if (sourceText.startsWith("<!--", cursor)) {
      const close = sourceText.indexOf("-->", cursor + 4);
      if (close === -1) return null;
      cursor = close + 3;
      continue;
    }
    return cursor;
  }
  return cursor;
}

/** Parses only the safe leading Razor Pages directive prologue, never body text. */
function leadingCshtmlDirectives(sourceText: string): CshtmlLeadingDirectives {
  let cursor = sourceText.startsWith("\uFEFF") ? 1 : 0;
  const pageStart = skipCshtmlPrologueTrivia(sourceText, cursor);
  if (pageStart === null) return { page: null, model: null };
  cursor = pageStart;
  const pageMatch = /^@page[\t ]*(?:\r?\n|$)/u.exec(sourceText.slice(cursor));
  if (pageMatch === null) return { page: null, model: null };
  const page = { path: "", start: cursor, end: cursor + pageMatch[0].length };
  cursor += pageMatch[0].length;

  const modelStart = skipCshtmlPrologueTrivia(sourceText, cursor);
  if (modelStart === null) return { page: null, model: null };
  cursor = modelStart;
  const modelMatch = /^@model[\t ]+([A-Za-z_][A-Za-z0-9_]*)[\t ]*(?:\r?\n|$)/u.exec(sourceText.slice(cursor));
  let model: RazorModelDirective | null = null;
  if (modelMatch !== null && modelMatch[1] !== undefined) {
    const modelName = modelMatch[1];
    const start = cursor + modelMatch[0].indexOf(modelName);
    model = { modelName, start, end: start + modelName.length };
    cursor += modelMatch[0].length;
  }

  const next = skipCshtmlPrologueTrivia(sourceText, cursor);
  if (next === null) return { page: null, model: null };
  if (/^@[A-Za-z_]/u.test(sourceText.slice(next))) return { page: null, model: null };
  return { page, model };
}

function razorTagEnd(sourceText: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let cursor = start + 1; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return cursor + 1;
  }
  return null;
}

function razorHtmlAttributes(
  sourceText: string,
  nameEnd: number,
  tagEnd: number
): readonly RazorHtmlAttribute[] | null {
  const attributes: RazorHtmlAttribute[] = [];
  const names = new Set<string>();
  let cursor = nameEnd;
  const contentEnd = tagEnd - 1;
  while (cursor < contentEnd) {
    while (cursor < contentEnd && /[\t\n\f\r ]/u.test(sourceText[cursor] ?? "")) cursor += 1;
    if (cursor >= contentEnd || sourceText[cursor] === "/") break;
    const match = /^[A-Za-z_:][A-Za-z0-9_.:-]*/u.exec(sourceText.slice(cursor, contentEnd));
    if (match === null) return null;
    const name = match[0].toLowerCase();
    if (names.has(name)) return null;
    names.add(name);
    cursor += match[0].length;
    while (cursor < contentEnd && /[\t\n\f\r ]/u.test(sourceText[cursor] ?? "")) cursor += 1;
    if (sourceText[cursor] !== "=") {
      attributes.push({ name, value: null, valueStart: null });
      continue;
    }
    cursor += 1;
    while (cursor < contentEnd && /[\t\n\f\r ]/u.test(sourceText[cursor] ?? "")) cursor += 1;
    const quote = sourceText[cursor];
    if (quote !== '"' && quote !== "'") return null;
    const valueStart = cursor + 1;
    const valueEnd = sourceText.indexOf(quote, valueStart);
    if (valueEnd === -1 || valueEnd >= contentEnd) return null;
    attributes.push({ name, value: sourceText.slice(valueStart, valueEnd), valueStart });
    cursor = valueEnd + 1;
  }
  if (sourceText.slice(cursor, contentEnd).trim() !== "" && sourceText.slice(cursor, contentEnd).trim() !== "/") {
    return null;
  }
  return attributes;
}

function matchingRazorCodeDelimiter(
  sourceText: string,
  open: number,
  openingCharacter: "{" | "(",
  closingCharacter: "}" | ")"
): number | null {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let verbatim = false;
  let lineComment = false;
  let blockComment = false;
  for (let cursor = open; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor] ?? "";
    const next = sourceText[cursor + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (verbatim && quote === '"' && character === '"' && next === '"') {
        cursor += 1;
        continue;
      }
      if (character === quote && (verbatim || sourceText[cursor - 1] !== "\\")) {
        quote = null;
        verbatim = false;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      verbatim = character === '"' && sourceText[cursor - 1] === "@";
      continue;
    }
    if (character === openingCharacter) depth += 1;
    if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
      if (depth < 0) return null;
    }
  }
  return null;
}

function razorCodeRanges(sourceText: string): readonly { start: number; end: number }[] | null {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /@\{|@(?:foreach|for|if|while|switch|using|lock|try|functions|code)\b/gu;
  for (const match of sourceText.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const open = match[0] === "@{" ? start + 1 : sourceText.indexOf("{", start + match[0].length);
    if (open === -1) return null;
    const end = matchingRazorCodeDelimiter(sourceText, open, "{", "}");
    if (end === null) return null;
    ranges.push({ start, end });
    pattern.lastIndex = end;
  }
  const explicitExpressionPattern = /@\(/gu;
  for (const match of sourceText.matchAll(explicitExpressionPattern)) {
    const start = match.index;
    if (start === undefined) continue;
    if (ranges.some((range) => range.start <= start && start < range.end)) continue;
    if (
      sourceText.lastIndexOf("@*", start) > sourceText.lastIndexOf("*@", start) ||
      sourceText.lastIndexOf("<!--", start) > sourceText.lastIndexOf("-->", start)
    ) {
      continue;
    }
    const open = start + 1;
    const end = matchingRazorCodeDelimiter(sourceText, open, "(", ")");
    if (end === null) return null;
    ranges.push({ start, end });
    explicitExpressionPattern.lastIndex = end;
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  return ranges;
}

function literalRazorPostHandlers(sourceText: string): readonly RazorPostHandlerDirective[] {
  const handlers: RazorPostHandlerDirective[] = [];
  const rawContainers = new Set(["script", "style", "textarea", "template"]);
  const codeRanges = razorCodeRanges(sourceText);
  if (codeRanges === null) return [];
  let codeRangeIndex = 0;
  let openFormIsPost: boolean | null = null;
  let cursor = 0;
  while (cursor < sourceText.length) {
    while ((codeRanges[codeRangeIndex]?.end ?? Number.POSITIVE_INFINITY) <= cursor) {
      codeRangeIndex += 1;
    }
    const codeRange = codeRanges[codeRangeIndex];
    const razorComment = sourceText.indexOf("@*", cursor);
    const htmlComment = sourceText.indexOf("<!--", cursor);
    const tagStart = sourceText.indexOf("<", cursor);
    const codeStart = codeRange === undefined ? -1 : codeRange.start;
    const next = [razorComment, htmlComment, tagStart, codeStart]
      .filter((offset) => offset !== -1)
      .sort((left, right) => left - right)[0];
    if (next === undefined) break;
    if (next === codeStart && codeRange !== undefined) {
      cursor = codeRange.end;
      codeRangeIndex += 1;
      continue;
    }
    if (next === razorComment) {
      const close = sourceText.indexOf("*@", next + 2);
      if (close === -1) return [];
      cursor = close + 2;
      continue;
    }
    if (next === htmlComment) {
      const close = sourceText.indexOf("-->", next + 4);
      if (close === -1) return [];
      cursor = close + 3;
      continue;
    }
    const tagEnd = razorTagEnd(sourceText, next);
    if (tagEnd === null) return [];
    const header = /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9:-]*)/u.exec(sourceText.slice(next, tagEnd));
    if (header === null || header[2] === undefined) {
      cursor = tagEnd;
      continue;
    }
    const closing = header[1] !== undefined;
    const tagName = header[2].toLowerCase();
    const nameEnd = next + header[0].length;
    const attributes = closing ? [] : razorHtmlAttributes(sourceText, nameEnd, tagEnd);
    if (attributes === null) return [];
    if (closing) {
      if (!/^<\s*\/\s*[A-Za-z][A-Za-z0-9:-]*\s*>$/u.test(sourceText.slice(next, tagEnd))) {
        return [];
      }
      if (tagName === "form") {
        if (openFormIsPost === null) return [];
        openFormIsPost = null;
      }
      cursor = tagEnd;
      continue;
    }
    if (rawContainers.has(tagName)) {
      const closePattern = new RegExp(`<\\/\\s*${tagName}\\s*>`, "igu");
      closePattern.lastIndex = tagEnd;
      const close = closePattern.exec(sourceText);
      if (close === null) return [];
      cursor = close.index + close[0].length;
      continue;
    }
    const attribute = (name: string): RazorHtmlAttribute | undefined =>
      attributes.find((candidate) => candidate.name === name);
    const handler = attribute("asp-page-handler");
    const method = attribute("method")?.value?.toLowerCase();
    const formMethodAttribute = attribute("formmethod");
    const formMethod = formMethodAttribute?.value?.toLowerCase();
    const type = attribute("type")?.value?.toLowerCase();
    const selfClosing = /\/\s*>$/u.test(sourceText.slice(next, tagEnd));
    if (tagName === "form") {
      if (openFormIsPost !== null) return [];
      openFormIsPost =
        method === "post" &&
        !["action", "asp-page", "asp-action", "asp-controller", "asp-area"].some(
          (name) => attribute(name) !== undefined
        );
    }
    if (handler !== undefined) {
      const hasButtonTargetOverride = [
        "form",
        "formaction",
        "asp-page",
        "asp-action",
        "asp-controller",
        "asp-area"
      ].some((name) => attribute(name) !== undefined);
      if (
        handler.value === null ||
        handler.valueStart === null ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(handler.value) ||
        !(
          (tagName === "form" && openFormIsPost === true) ||
          (tagName === "button" &&
            type === "submit" &&
            openFormIsPost === true &&
            !hasButtonTargetOverride &&
            (formMethodAttribute === undefined || formMethod === "post"))
        )
      ) {
        return [];
      }
      handlers.push({
        handlerName: handler.value,
        start: handler.valueStart,
        end: handler.valueStart + handler.value.length
      });
    }
    if (tagName === "form" && selfClosing) openFormIsPost = null;
    cursor = tagEnd;
  }
  return openFormIsPost === null ? handlers : [];
}

/**
 * Extracts a deliberately narrow Razor component contract. A `.razor` file
 * always contributes its conventional local component; only standalone,
 * unescaped, literal `@page` directives become Blazor route facts.
 */
export function extractRazorFileFacts(input: RazorExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileRange = rangeForSpan(lineStarts, 0, input.sourceText.length);
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
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const exportBindings: ExportBinding[] = [];
  const routeOrdinals = new Map<string, number>();

  const component: SymbolNode = {
    id: createSymbolId({
      filePath: input.filePath,
      qualifiedName: input.filePath + "#default",
      kind: "variable",
      declarationOrdinal: 0
    }),
    name: "default",
    qualifiedName: input.filePath + "#default",
    kind: "variable",
    filePath: input.filePath,
    range: fileRange,
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(component);
  edges.push({
    id: createEdgeId({
      sourceId: fileNode.id,
      targetId: component.id,
      kind: "contains",
      line: fileRange.start.line,
      column: fileRange.start.column,
      referenceName: component.name
    }),
    sourceId: fileNode.id,
    targetId: component.id,
    kind: "contains",
    filePath: input.filePath,
    range: fileRange,
    resolution: "exact",
    confidence: 1,
    referenceName: component.name,
    evidence: {
      ruleId: "framework.blazor.razor.convention-component",
      stage: "syntax",
      candidateSymbolIds: [component.id]
    }
  });
  exportBindings.push({
    localName: "default",
    exportedName: "default",
    range: fileRange
  });
  localBindings.push({
    name: "default",
    symbolId: component.id,
    scopeId: FILE_SCOPE_ID
  });

  const isCshtml = input.filePath.toLowerCase().endsWith(".cshtml");
  const cshtmlDirectives = isCshtml ? leadingCshtmlDirectives(input.sourceText) : null;
  const cshtmlRoute = isCshtml ? conventionalCshtmlRoute(input.filePath) : null;
  const cshtmlPageDirective =
    cshtmlDirectives === null || cshtmlDirectives.page === null || cshtmlRoute === null ? null : cshtmlDirectives.page;
  const cshtmlModel =
    cshtmlPageDirective === null ? null : cshtmlDirectives?.model ?? null;
  const pageDirectives =
    isCshtml
      ? cshtmlPageDirective === null || cshtmlRoute === null ? [] : [{ ...cshtmlPageDirective, path: cshtmlRoute }]
      : razorStaticPageDirectives(input.sourceText);

  for (const directive of pageDirectives) {
    const name = "NAVIGATE " + directive.path;
    const identity = input.filePath + "#route:" + name;
    const declarationOrdinal = routeOrdinals.get(identity) ?? 0;
    routeOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeForSpan(lineStarts, directive.start, directive.end);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: identity,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName: identity,
      kind: "route",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: route.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: route.name
      }),
      sourceId: fileNode.id,
      targetId: route.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: route.name,
      evidence: {
        ruleId: "framework.blazor.page-directive.route-node",
        stage: "syntax",
        candidateSymbolIds: [route.id]
      }
    });
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: "default"
      }),
      sourceId: route.id,
      filePath: input.filePath,
      referenceName: "default",
      relationKind: "routes",
      range,
      routeFramework: "blazor",
      routeRegistration: "blazor-page-directive"
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: [FILE_SCOPE_ID]
    });
  }

  const razorFacts: RazorFacts | undefined =
    isCshtml && cshtmlPageDirective !== null && cshtmlModel !== null
      ? {
          fileSymbolId: fileNode.id,
          defaultSymbolId: component.id,
          model: {
            sourceId: component.id,
            modelName: cshtmlModel.modelName,
            range: rangeForSpan(lineStarts, cshtmlModel.start, cshtmlModel.end)
          },
          postHandlers: literalRazorPostHandlers(input.sourceText).map((handler) => ({
            sourceId: component.id,
            handlerName: handler.handlerName,
            range: rangeForSpan(lineStarts, handler.start, handler.end)
          }))
        }
      : undefined;

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes,
    importBindings: [],
    exportBindings,
    reExportBindings: [],
    ...(razorFacts === undefined ? {} : { razorFacts })
  };
}

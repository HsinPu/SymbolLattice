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
          }
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

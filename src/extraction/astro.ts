import ts from "typescript";

import { createEdgeId, createSymbolId } from "../domain/ids.js";
import type {
  ArtifactFacts,
  ExportBinding,
  GraphEdge,
  LocalBinding,
  PendingReference,
  ReferenceScope,
  SourceRange,
  SymbolKind,
  SymbolNode
} from "../domain/index.js";

export interface AstroExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "astro";
  readonly sourceText: string;
}

interface AstroFrontmatterBlock {
  readonly contentStart: number;
  readonly contentEnd: number;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
}

const FILE_SCOPE_ID = "astro:file";

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

function lineBreakEnd(sourceText: string, start: number): number {
  const newline = sourceText.indexOf("\n", start);
  return newline === -1 ? sourceText.length : newline + 1;
}

function lineContentEnd(sourceText: string, start: number, end: number): number {
  return end > start && sourceText[end - 1] === "\n"
    ? sourceText[end - 2] === "\r"
      ? end - 2
      : end - 1
    : end;
}

/**
 * Astro component scripts are an optional opening frontmatter fence. Any source
 * beginning with an incomplete or malformed fence fails closed instead of being
 * mistaken for a script-less component.
 */
function astroFrontmatter(sourceText: string): AstroFrontmatterBlock | "absent" | "invalid" {
  if (!sourceText.startsWith("---")) {
    return "absent";
  }

  const openingLineEnd = lineBreakEnd(sourceText, 0);
  const openingContentEnd = lineContentEnd(sourceText, 0, openingLineEnd);
  if (sourceText.slice(0, openingContentEnd) !== "---" || openingLineEnd === sourceText.length) {
    return "invalid";
  }

  let lineStart = openingLineEnd;
  while (lineStart < sourceText.length) {
    const currentLineEnd = lineBreakEnd(sourceText, lineStart);
    const currentContentEnd = lineContentEnd(sourceText, lineStart, currentLineEnd);
    if (sourceText.slice(lineStart, currentContentEnd) === "---") {
      return {
        contentStart: openingLineEnd,
        contentEnd: lineStart
      };
    }
    lineStart = currentLineEnd;
  }

  return "invalid";
}

function parseFrontmatter(
  block: AstroFrontmatterBlock,
  sourceText: string,
  filePath: string
): ts.SourceFile | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText.slice(block.contentStart, block.contentEnd),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const diagnostics = (
    sourceFile as unknown as { readonly parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  return diagnostics.length === 0 ? sourceFile : null;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    (node as ModifierCarrier).modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false
  );
}

/**
 * Deliberately narrow Astro page routing. It retains only static .astro page
 * files under src/pages and maps an index file to its containing path.
 */
function astroStaticPagePath(filePath: string): string | null {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const prefix = "src/pages/";
  const suffix = ".astro";
  if (!normalizedPath.startsWith(prefix) || !normalizedPath.endsWith(suffix)) {
    return null;
  }

  const withoutExtension = normalizedPath.slice(prefix.length, -suffix.length);
  if (withoutExtension.length === 0) {
    return null;
  }
  const segments = withoutExtension.split("/");
  if (
    segments.some(
      (segment) =>
        !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(segment) || segment.startsWith("_")
    )
  ) {
    return null;
  }

  const routeSegments = segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
  return routeSegments.length === 0 ? "/" : "/" + routeSegments.join("/");
}

/**
 * Extracts source-visible declarations from a compact, auditable Astro SFC
 * subset. The optional frontmatter is TypeScript-capable; template and client
 * script semantics deliberately remain outside this first slice.
 */
export function extractAstroFileFacts(input: AstroExtractFileFactsInput): ArtifactFacts {
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
  const declarationOrdinals = new Map<string, number>();

  function facts(): ArtifactFacts {
    return {
      symbols,
      edges,
      pendingReferences,
      localBindings,
      referenceScopes,
      importBindings: [],
      exportBindings,
      reExportBindings: []
    };
  }

  function addSymbol(
    name: string,
    kind: Exclude<SymbolKind, "file" | "route" | "entrypoint">,
    range: SourceRange,
    isExported: boolean,
    containmentRuleId = "syntax.containment"
  ): SymbolNode {
    const qualifiedName = input.filePath + "#" + name;
    const identity = qualifiedName + "\u0000" + kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind,
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range,
      isExported,
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
        ruleId: containmentRuleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  const frontmatter = astroFrontmatter(input.sourceText);
  if (frontmatter === "invalid") {
    return facts();
  }
  const sourceFile =
    frontmatter === "absent" ? null : parseFrontmatter(frontmatter, input.sourceText, input.filePath);
  if (frontmatter !== "absent" && sourceFile === null) {
    return facts();
  }

  const component = addSymbol(
    "default",
    "variable",
    fileRange,
    true,
    "framework.astro.sfc.convention-default-component"
  );
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

  if (frontmatter !== "absent" && sourceFile !== null) {
    const rangeForNode = (node: ts.Node): SourceRange =>
      rangeForSpan(
        lineStarts,
        frontmatter.contentStart + node.getStart(sourceFile),
        frontmatter.contentStart + node.getEnd()
      );

    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        addSymbol(statement.name.text, "function", rangeForNode(statement), hasExportModifier(statement));
        continue;
      }
      if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
        addSymbol(statement.name.text, "class", rangeForNode(statement), hasExportModifier(statement));
        continue;
      }
      if (ts.isInterfaceDeclaration(statement)) {
        addSymbol(statement.name.text, "interface", rangeForNode(statement), hasExportModifier(statement));
        continue;
      }
      if (ts.isTypeAliasDeclaration(statement)) {
        addSymbol(statement.name.text, "type", rangeForNode(statement), hasExportModifier(statement));
        continue;
      }
      if (!ts.isVariableStatement(statement)) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        addSymbol(
          declaration.name.text,
          "variable",
          rangeForNode(declaration),
          hasExportModifier(statement)
        );
      }
    }
  }

  const routePath = astroStaticPagePath(input.filePath);
  if (routePath !== null) {
    const routeName = "NAVIGATE " + routePath;
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: input.filePath + "#route:" + routeName,
        kind: "route",
        declarationOrdinal: 0
      }),
      name: routeName,
      qualifiedName: input.filePath + "#route:" + routeName,
      kind: "route",
      filePath: input.filePath,
      range: fileRange,
      isExported: false,
      declarationOrdinal: 0
    };
    symbols.push(route);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: route.id,
        kind: "contains",
        line: fileRange.start.line,
        column: fileRange.start.column,
        referenceName: routeName
      }),
      sourceId: fileNode.id,
      targetId: route.id,
      kind: "contains",
      filePath: input.filePath,
      range: fileRange,
      resolution: "exact",
      confidence: 1,
      referenceName: routeName,
      evidence: {
        ruleId: "framework.astro.filesystem-page.route-node",
        stage: "syntax",
        candidateSymbolIds: [route.id]
      }
    });
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: fileRange.start.line,
        column: fileRange.start.column,
        referenceName: "default"
      }),
      sourceId: route.id,
      filePath: input.filePath,
      referenceName: "default",
      relationKind: "routes",
      range: fileRange,
      routeFramework: "astro",
      routeRegistration: "astro-filesystem-page"
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: [FILE_SCOPE_ID]
    });
  }

  return facts();
}

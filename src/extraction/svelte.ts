import ts from "typescript";

import { createEdgeId, createSymbolId } from "../domain/ids.js";
import type {
  ArtifactFacts,
  ExportBinding,
  GraphEdge,
  ImportBinding,
  LocalBinding,
  PendingReference,
  ReferenceScope,
  SourceRange,
  SymbolKind,
  SymbolNode
} from "../domain/index.js";

export interface SvelteExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "svelte";
  readonly sourceText: string;
}

type SvelteScriptLanguage = "javascript" | "typescript";
type SvelteScriptKind = "instance" | "module";

interface SvelteScriptBlock {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly kind: SvelteScriptKind;
  readonly language: SvelteScriptLanguage;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
}

const FILE_SCOPE_ID = "svelte:file";

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

function tagBoundary(character: string | undefined): boolean {
  return character === undefined || /[\t\n\f\r />]/u.test(character);
}

function scriptOpeningTagEnd(sourceText: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index;
    }
  }
  return null;
}

function closingScriptTag(
  sourceText: string,
  start: number
): { readonly start: number; readonly end: number } | null {
  const lowercaseSource = sourceText.toLowerCase();
  let index = lowercaseSource.indexOf("</script", start);
  while (index !== -1) {
    const afterName = index + "</script".length;
    if (!tagBoundary(lowercaseSource[afterName])) {
      index = lowercaseSource.indexOf("</script", afterName);
      continue;
    }
    const closingEnd = scriptOpeningTagEnd(sourceText, afterName);
    if (closingEnd === null) {
      return null;
    }
    return { start: index, end: closingEnd + 1 };
  }
  return null;
}

function attributeLanguage(attributes: string): SvelteScriptLanguage | null {
  const match = /(?:^|\s)lang\s*=\s*(["'])([^"']+)\1/iu.exec(attributes);
  if (match === null || match[2] === undefined) {
    return "javascript";
  }
  const language = match[2].trim().toLowerCase();
  if (language === "ts" || language === "typescript") {
    return "typescript";
  }
  if (language === "js" || language === "javascript") {
    return "javascript";
  }
  return null;
}

function isModuleScript(attributes: string): boolean {
  return (
    /(?:^|\s)context\s*=\s*(["'])module\1/iu.test(attributes) ||
    /(?:^|\s)module(?:\s|=|$)/u.test(attributes)
  );
}

function svelteScriptBlocks(sourceText: string): readonly SvelteScriptBlock[] | null {
  const blocks: SvelteScriptBlock[] = [];
  const counts = new Map<SvelteScriptKind, number>();
  let index = 0;

  while (index < sourceText.length) {
    if (sourceText.startsWith("<!--", index)) {
      const commentEnd = sourceText.indexOf("-->", index + 4);
      if (commentEnd === -1) {
        return null;
      }
      index = commentEnd + 3;
      continue;
    }
    if (
      sourceText.startsWith("<script", index) &&
      tagBoundary(sourceText[index + "<script".length])
    ) {
      const openingEnd = scriptOpeningTagEnd(sourceText, index + "<script".length);
      if (openingEnd === null) {
        return null;
      }
      const closing = closingScriptTag(sourceText, openingEnd + 1);
      if (closing === null) {
        return null;
      }
      const attributes = sourceText.slice(index + "<script".length, openingEnd);
      if (/(?:^|\s)src(?:\s|=|$)/u.test(attributes)) {
        return null;
      }
      const language = attributeLanguage(attributes);
      if (language === null) {
        return null;
      }
      const kind: SvelteScriptKind = isModuleScript(attributes) ? "module" : "instance";
      const count = counts.get(kind) ?? 0;
      if (count !== 0) {
        return null;
      }
      counts.set(kind, count + 1);
      blocks.push({
        contentStart: openingEnd + 1,
        contentEnd: closing.start,
        kind,
        language
      });
      index = closing.end;
      continue;
    }
    index += 1;
  }

  return blocks.sort((left, right) => left.contentStart - right.contentStart);
}

function parseScript(
  block: SvelteScriptBlock,
  sourceText: string,
  filePath: string
): ts.SourceFile | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText.slice(block.contentStart, block.contentEnd),
    ts.ScriptTarget.Latest,
    true,
    block.language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS
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

function svelteKitStaticPagePath(filePath: string): string | null {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const prefix = "src/routes/";
  const suffix = "+page.svelte";
  if (!normalizedPath.startsWith(prefix) || !normalizedPath.endsWith(suffix)) {
    return null;
  }
  const directories = normalizedPath.slice(prefix.length, -suffix.length);
  if (directories.length !== 0 && !directories.endsWith("/")) {
    return null;
  }
  const segments = directories.length === 0 ? [] : directories.slice(0, -1).split("/");
  if (
    segments.some(
      (segment) =>
        !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(segment) ||
        segment.startsWith("+")
    )
  ) {
    return null;
  }
  return segments.length === 0 ? "/" : "/" + segments.join("/");
}

/**
 * Extracts source-visible declarations from a compact, auditable Svelte SFC
 * subset. A valid Svelte component conventionally supplies a default component
 * export; module-script declarations, templates, styles, runes, and template
 * expressions deliberately remain outside this first slice.
 */
export function extractSvelteFileFacts(input: SvelteExtractFileFactsInput): ArtifactFacts {
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
  const importBindings: ImportBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const declarationOrdinals = new Map<string, number>();

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

  const blocks = svelteScriptBlocks(input.sourceText);
  if (blocks === null) {
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
  const parsedBlocks = blocks.map((block) => ({ block, sourceFile: parseScript(block, input.sourceText, input.filePath) }));
  if (parsedBlocks.some((entry) => entry.sourceFile === null)) {
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

  const component = addSymbol(
    "default",
    "variable",
    fileRange,
    true,
    "framework.svelte.sfc.convention-default-component"
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

  for (const entry of parsedBlocks) {
    if (entry.sourceFile === null) {
      continue;
    }
    const sourceFile = entry.sourceFile;
    const rangeForNode = (node: ts.Node): SourceRange =>
      rangeForSpan(
        lineStarts,
        entry.block.contentStart + node.getStart(sourceFile),
        entry.block.contentStart + node.getEnd()
      );

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const moduleSpecifier = statement.moduleSpecifier.text;
      const referenceRange = rangeForNode(statement.moduleSpecifier);
      pendingReferences.push({
        id: createEdgeId({
          sourceId: fileNode.id,
          targetId: null,
          kind: "imports",
          line: referenceRange.start.line,
          column: referenceRange.start.column,
          referenceName: moduleSpecifier
        }),
        sourceId: fileNode.id,
        filePath: input.filePath,
        referenceName: moduleSpecifier,
        relationKind: "imports",
        range: referenceRange
      });

      const importClause = statement.importClause;
      if (importClause?.name !== undefined) {
        importBindings.push({
          moduleSpecifier,
          localName: importClause.name.text,
          importedName: "default",
          range: rangeForNode(importClause.name),
          ...(importClause.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }
      if (importClause?.namedBindings !== undefined && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          importBindings.push({
            moduleSpecifier,
            localName: element.name.text,
            importedName: element.propertyName?.text ?? element.name.text,
            range: rangeForNode(element),
            ...(importClause.isTypeOnly || element.isTypeOnly ? { isTypeOnly: true } : {})
          });
        }
      } else if (
        importClause?.namedBindings !== undefined &&
        ts.isNamespaceImport(importClause.namedBindings)
      ) {
        importBindings.push({
          moduleSpecifier,
          localName: importClause.namedBindings.name.text,
          importedName: "*",
          range: rangeForNode(importClause.namedBindings),
          ...(importClause.isTypeOnly ? { isTypeOnly: true } : {})
        });
      }
    }

    if (entry.block.kind !== "instance") {
      continue;
    }

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

  const routePath = svelteKitStaticPagePath(input.filePath);
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
        ruleId: "framework.sveltekit.filesystem-page.route-node",
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
      routeFramework: "sveltekit",
      routeRegistration: "sveltekit-filesystem-page"
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: [FILE_SCOPE_ID]
    });
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes,
    importBindings,
    exportBindings,
    reExportBindings: []
  };
}

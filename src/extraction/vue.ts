import ts from "typescript";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ExportBinding,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface VueExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "vue";
}

type VueScriptLanguage = "javascript" | "typescript";

interface VueScriptBlock {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly language: VueScriptLanguage;
  readonly setup: boolean;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
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
  let upper = lineStarts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    if (start <= offset) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  const start = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - start + 1 };
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
  return character === undefined || character === ">" || /\s/u.test(character);
}

function scriptOpeningTagEnd(sourceText: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === undefined) {
      return null;
    }
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

function closingScriptTag(sourceText: string, from: number): {
  readonly start: number;
  readonly end: number;
} | null {
  const closingExpression = /<\/script\s*>/gu;
  closingExpression.lastIndex = from;
  const match = closingExpression.exec(sourceText);
  if (match === null || match.index === undefined) {
    return null;
  }
  return { start: match.index, end: match.index + match[0].length };
}

function attributeLanguage(attributes: string): VueScriptLanguage | null {
  const matches = [
    ...attributes.matchAll(
      /(?:^|\s)lang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/gu
    )
  ];
  if (matches.length > 1) {
    return null;
  }
  if (matches.length === 0) {
    return "javascript";
  }
  const match = matches[0];
  if (match === undefined) {
    return null;
  }
  const language = (match[1] ?? match[2] ?? match[3] ?? "").toLowerCase();
  if (language === "ts" || language === "typescript") {
    return "typescript";
  }
  if (language === "js" || language === "javascript") {
    return "javascript";
  }
  return null;
}

function inlineScriptBlock(sourceText: string): VueScriptBlock | null {
  const blocks: Array<{
    readonly contentStart: number;
    readonly contentEnd: number;
    readonly attributes: string;
  }> = [];
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
      blocks.push({
        contentStart: openingEnd + 1,
        contentEnd: closing.start,
        attributes: sourceText.slice(index + "<script".length, openingEnd)
      });
      index = closing.end;
      continue;
    }
    index += 1;
  }

  if (blocks.length !== 1) {
    return null;
  }
  const block = blocks[0];
  if (block === undefined || /(?:^|\s)src(?:\s|=|$)/u.test(block.attributes)) {
    return null;
  }
  const language = attributeLanguage(block.attributes);
  if (language === null) {
    return null;
  }
  return {
    contentStart: block.contentStart,
    contentEnd: block.contentEnd,
    language,
    setup: /(?:^|\s)setup(?:\s|=|$)/u.test(block.attributes)
  };
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    (node as ModifierCarrier).modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false
  );
}

function directDefineComponentImport(sourceFile: ts.SourceFile): boolean {
  let exactCount = 0;
  let unsupported = false;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "vue"
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName !== "defineComponent") {
        continue;
      }
      if (element.propertyName === undefined && element.name.text === "defineComponent") {
        exactCount += 1;
      } else {
        unsupported = true;
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name?.text === "defineComponent") {
        unsupported = true;
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "defineComponent") {
        unsupported = true;
      }
    }
  }

  return exactCount === 1 && !unsupported;
}

function isDirectDefineComponentCall(expression: ts.Expression | undefined): boolean {
  return (
    expression !== undefined &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "defineComponent"
  );
}

function isConstVariableStatement(statement: ts.VariableStatement): boolean {
  return (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
}

function parseScript(
  block: VueScriptBlock,
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

/**
 * Extracts source-visible declarations from one inline Vue SFC script.
 * Script-setup compiler synthesis, templates, styles, and arbitrary SFC
 * transforms intentionally remain outside this static first slice.
 */
export function extractVueFileFacts(input: VueExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const exportBindings: ExportBinding[] = [];
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  const block = inlineScriptBlock(input.sourceText);
  if (block === null) {
    return {
      symbols,
      edges,
      pendingReferences: [],
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings,
      reExportBindings: []
    };
  }

  const parsedSourceFile = parseScript(block, input.sourceText, input.filePath);
  if (parsedSourceFile === null) {
    return {
      symbols,
      edges,
      pendingReferences: [],
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings,
      reExportBindings: []
    };
  }
  const activeBlock: VueScriptBlock = block;
  const sourceFile: ts.SourceFile = parsedSourceFile;

  function rangeForNode(node: ts.Node): SourceRange {
    return rangeForSpan(
      lineStarts,
      activeBlock.contentStart + node.getStart(sourceFile),
      activeBlock.contentStart + node.getEnd()
    );
  }

  function addSymbol(
    name: string,
    kind: Exclude<SymbolKind, "file" | "route" | "entrypoint">,
    node: ts.Node,
    isExported: boolean
  ): SymbolNode {
    const qualifiedName = input.filePath + "#" + name;
    const identity = qualifiedName + "\u0000" + kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeForNode(node);
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
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  const symbolsByName = new Map<string, SymbolNode[]>();
  const addNamedSymbol = (
    name: string,
    kind: Exclude<SymbolKind, "file" | "route" | "entrypoint">,
    node: ts.Node,
    isExported: boolean
  ): SymbolNode => {
    const symbol = addSymbol(name, kind, node, isExported);
    const existing = symbolsByName.get(name) ?? [];
    symbolsByName.set(name, [...existing, symbol]);
    return symbol;
  };

  const hasDirectDefineComponentImport = directDefineComponentImport(sourceFile);
  const directComponentNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      addNamedSymbol(statement.name.text, "function", statement, hasExportModifier(statement));
      continue;
    }
    if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      addNamedSymbol(statement.name.text, "class", statement, hasExportModifier(statement));
      continue;
    }
    if (ts.isInterfaceDeclaration(statement)) {
      addNamedSymbol(statement.name.text, "interface", statement, hasExportModifier(statement));
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement)) {
      addNamedSymbol(statement.name.text, "type", statement, hasExportModifier(statement));
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) {
        continue;
      }
      addNamedSymbol(
        declaration.name.text,
        "variable",
        declaration,
        hasExportModifier(statement)
      );
      if (
        hasDirectDefineComponentImport &&
        isConstVariableStatement(statement) &&
        isDirectDefineComponentCall(declaration.initializer)
      ) {
        directComponentNames.add(declaration.name.text);
      }
    }
  }

  const defaultExports = sourceFile.statements.filter(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals
  );
  const defaultExport = defaultExports.length === 1 ? defaultExports[0] : undefined;
  if (defaultExport !== undefined && !activeBlock.setup) {
    const expression = defaultExport.expression;
    if (ts.isIdentifier(expression) && directComponentNames.has(expression.text)) {
      const candidates = symbolsByName.get(expression.text) ?? [];
      if (candidates.length === 1) {
        exportBindings.push({
          localName: expression.text,
          exportedName: "default",
          range: rangeForNode(expression)
        });
      }
    } else if (
      ts.isObjectLiteralExpression(expression) ||
      (hasDirectDefineComponentImport && isDirectDefineComponentCall(expression))
    ) {
      addNamedSymbol("default", "variable", expression, true);
      exportBindings.push({
        localName: "default",
        exportedName: "default",
        range: rangeForNode(expression)
      });
    }
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings,
    reExportBindings: []
  };
}

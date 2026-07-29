import ts from "typescript";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ArtifactLanguage,
  type EdgeKind,
  type ExportBinding,
  type GraphEdge,
  type ImportBinding,
  type LocalBinding,
  type PendingReference,
  type ReferenceScope,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export type {
  ArtifactFacts,
  ExportBinding,
  ImportBinding,
  LocalBinding,
  ReferenceScope
} from "../domain/index.js";

/** @deprecated Use ArtifactLanguage from the domain package. */
export type ExtractionLanguage = ArtifactLanguage;

export interface ExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: ExtractionLanguage;
}

/** @deprecated Use ArtifactFacts from the domain package. */
export type ExtractedFileFacts = ArtifactFacts;

interface DeclarationInfo {
  readonly name: string;
  readonly kind: Exclude<SymbolKind, "file">;
  readonly isExported: boolean;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
}

function scriptKindFor(input: ExtractFileFactsInput): ts.ScriptKind {
  if (input.language === "javascript") {
    return input.filePath.toLowerCase().endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  }

  return input.filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceRange(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 }
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function declarationName(node: ts.NamedDeclaration): string | null {
  if (node.name === undefined) {
    return null;
  }

  if (ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return null;
}

function declarationInfo(
  node: ts.Node,
  explicitExportNames: ReadonlySet<string>
): DeclarationInfo | null {
  if (ts.isClassDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : { name, kind: "class", isExported: hasExportModifier(node) || explicitExportNames.has(name) };
  }

  if (ts.isFunctionDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : {
          name,
          kind: "function",
          isExported: hasExportModifier(node) || explicitExportNames.has(name)
        };
  }

  if (ts.isMethodDeclaration(node)) {
    const name = declarationName(node);
    return name === null ? null : { name, kind: "method", isExported: false };
  }

  if (ts.isInterfaceDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "interface",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "type",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const statement = node.parent.parent;
    return {
      name: node.name.text,
      kind: "variable",
      isExported:
        (ts.isVariableStatement(statement) && hasExportModifier(statement)) ||
        explicitExportNames.has(node.name.text)
    };
  }

  return null;
}

function defaultExportExpressionInfo(node: ts.ExportAssignment): DeclarationInfo | null {
  if (node.isExportEquals) {
    return null;
  }

  if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) {
    return { name: "default", kind: "function", isExported: true };
  }

  if (ts.isClassExpression(node.expression)) {
    return { name: "default", kind: "class", isExported: true };
  }

  return null;
}

function collectExplicitExportNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      statement.moduleSpecifier !== undefined
    ) {
      continue;
    }

    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        // `export { localName as publicName }` exports the local declaration,
        // not a declaration named `publicName`.
        names.add(element.propertyName?.text ?? element.name.text);
      }
    }
  }

  return names;
}

function isLexicalScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isFunctionLike(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    ts.isModuleBlock(node)
  );
}

function scopeIdFor(sourceFile: ts.SourceFile, node: ts.Node): string {
  return `${node.kind}:${node.getStart(sourceFile)}:${node.getEnd()}`;
}

function enclosingScopeNodes(node: ts.Node): readonly ts.Node[] {
  const scopeNodes: ts.Node[] = [];
  let current = node.parent;

  while (current !== undefined) {
    if (isLexicalScope(current)) {
      scopeNodes.push(current);
    }
    current = current.parent;
  }

  return scopeNodes;
}

function enclosingScopeIds(sourceFile: ts.SourceFile, node: ts.Node): readonly string[] {
  return enclosingScopeNodes(node).map((scopeNode) => scopeIdFor(sourceFile, scopeNode));
}

function isVarDeclaration(node: ts.Node): node is ts.VariableDeclaration {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
  );
}

function declarationScopeId(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  info: DeclarationInfo
): string | undefined {
  const scopeNodes = enclosingScopeNodes(node);
  if (info.kind === "variable" && isVarDeclaration(node)) {
    const variableScope = scopeNodes.find(
      (scopeNode) => ts.isFunctionLike(scopeNode) || ts.isSourceFile(scopeNode)
    );
    return variableScope === undefined ? undefined : scopeIdFor(sourceFile, variableScope);
  }

  const lexicalScope = scopeNodes[0];
  return lexicalScope === undefined ? undefined : scopeIdFor(sourceFile, lexicalScope);
}

function hasValueBinding(info: DeclarationInfo): boolean {
  return info.kind === "class" || info.kind === "function" || info.kind === "variable";
}

function fileNodeFor(sourceFile: ts.SourceFile, input: ExtractFileFactsInput): SymbolNode {
  const fileName = input.filePath.split("/").at(-1) ?? input.filePath;
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
    range: sourceRange(sourceFile, sourceFile),
    isExported: true,
    declarationOrdinal: 0
  };
}

/**
 * Extracts only file-local, syntax-proven facts. Cross-file resolution is deliberately
 * left to the application layer so an unresolved reference cannot become a false edge.
 */
export function extractFileFacts(input: ExtractFileFactsInput): ExtractedFileFacts {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(input)
  );
  const explicitExportNames = collectExplicitExportNames(sourceFile);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const importBindings: ImportBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const declarationOrdinals = new Map<string, number>();
  const stack: SymbolNode[] = [];

  const fileNode = fileNodeFor(sourceFile, input);
  symbols.push(fileNode);
  stack.push(fileNode);

  function currentOwner(): SymbolNode {
    const owner = stack.at(-1);
    if (owner === undefined) {
      throw new Error("Extraction symbol stack unexpectedly became empty.");
    }
    return owner;
  }

  function addResolvedEdge(
    sourceId: string,
    targetId: string,
    kind: EdgeKind,
    node: ts.Node,
    referenceName: string
  ): void {
    const range = sourceRange(sourceFile, node);
    edges.push({
      id: createEdgeId({
        sourceId,
        targetId,
        kind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      targetId,
      kind,
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [targetId]
      }
    });
  }

  function addPendingReference(
    sourceId: string,
    referenceName: string,
    relationKind: PendingReference["relationKind"],
    node: ts.Node
  ): void {
    const range = sourceRange(sourceFile, node);
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId,
        targetId: null,
        kind: relationKind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      filePath: input.filePath,
      referenceName,
      relationKind,
      range
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: enclosingScopeIds(sourceFile, node)
    });
  }

  function addDeclaration(node: ts.Node, info: DeclarationInfo): SymbolNode {
    const parent = currentOwner();
    const qualifiedName =
      parent.kind === "file"
        ? `${input.filePath}#${info.name}`
        : `${parent.qualifiedName}.${info.name}`;
    const identity = `${qualifiedName}\u0000${info.kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: info.kind,
        declarationOrdinal
      }),
      name: info.name,
      qualifiedName,
      kind: info.kind,
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: info.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(parent.id, symbol.id, "contains", node, info.name);
    return symbol;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "imports", node.moduleSpecifier);

      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        importBindings.push({
          moduleSpecifier: node.moduleSpecifier.text,
          localName: importClause.name.text,
          importedName: "default",
          range: sourceRange(sourceFile, importClause.name)
        });
      }

      if (importClause?.namedBindings !== undefined && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          importBindings.push({
            moduleSpecifier: node.moduleSpecifier.text,
            localName: element.name.text,
            importedName: element.propertyName?.text ?? element.name.text,
            range: sourceRange(sourceFile, element)
          });
        }
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "exports", node.moduleSpecifier);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier === undefined &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        exportBindings.push({
          localName: element.propertyName?.text ?? element.name.text,
          exportedName: element.name.text,
          range: sourceRange(sourceFile, element)
        });
      }
    }

    let info = declarationInfo(node, explicitExportNames);
    const exportAssignment = ts.isExportAssignment(node) ? node : null;
    const expressionInfo =
      exportAssignment === null ? null : defaultExportExpressionInfo(exportAssignment);
    let declaredSymbol = info === null ? null : addDeclaration(node, info);
    if (declaredSymbol === null && expressionInfo !== null && exportAssignment !== null) {
      info = expressionInfo;
      declaredSymbol = addDeclaration(exportAssignment.expression, info);
    }
    if (
      declaredSymbol !== null &&
      info !== null &&
      (hasDefaultModifier(node) || expressionInfo !== null)
    ) {
      exportBindings.push({
        localName: info.name,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
      exportBindings.push({
        localName: node.expression.text,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (info !== null && declaredSymbol !== null && hasValueBinding(info)) {
      const enclosingScopeId = declarationScopeId(sourceFile, node, info);
      if (enclosingScopeId !== undefined) {
        localBindings.push({
          name: info.name,
          symbolId: declaredSymbol.id,
          scopeId: enclosingScopeId
        });
      }
    }

    if (ts.isFunctionLike(node)) {
      const functionScopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) {
          localBindings.push({ name: parameter.name.text, symbolId: null, scopeId: functionScopeId });
        }
      }
    }

    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration !== undefined &&
      ts.isIdentifier(node.variableDeclaration.name)
    ) {
      localBindings.push({
        name: node.variableDeclaration.name.text,
        symbolId: null,
        scopeId: scopeIdFor(sourceFile, node)
      });
    }
    if (declaredSymbol !== null) {
      stack.push(declaredSymbol);
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      addPendingReference(currentOwner().id, node.expression.text, "calls", node.expression);
    }

    ts.forEachChild(node, visit);

    if (declaredSymbol !== null) {
      stack.pop();
    }
  }

  ts.forEachChild(sourceFile, visit);

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes,
    importBindings,
    exportBindings
  };
}
